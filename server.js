const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { execFileSync } = require('child_process');

const app = express();
const PORT = Number(process.env.PORT || 80);
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DB_FILE = process.env.DB_FILE || path.join(ROOT, 'database.db');
const CONFIG_FILE = path.join(ROOT, 'config.json');

const defaultConfig = {
  adminPassword: process.env.ADMIN_PASSWORD || 'CHANGE_THIS_ADMIN_PASSWORD',
  jwtSecret: process.env.JWT_SECRET || 'CHANGE_THIS_TO_A_LONG_RANDOM_SECRET',
  mlbbIdApi: {
    url: process.env.MLBB_ID_API_URL || '',
    apiKey: process.env.MLBB_ID_API_KEY || '',
    apiKeyHeader: process.env.MLBB_ID_API_KEY_HEADER || 'X-API-KEY',
    apiId: process.env.MLBB_ID_API_ID || ''
  }
};

function loadConfig() {
  let disk = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try { disk = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
    catch (err) { console.error('config.json is invalid:', err.message); process.exit(1); }
  }
  return {
    ...defaultConfig,
    ...disk,
    adminPassword: process.env.ADMIN_PASSWORD || disk.adminPassword || defaultConfig.adminPassword,
    jwtSecret: process.env.JWT_SECRET || disk.jwtSecret || defaultConfig.jwtSecret,
    mlbbIdApi: {
      ...defaultConfig.mlbbIdApi,
      ...(disk.mlbbIdApi || {}),
      url: process.env.MLBB_ID_API_URL || disk.mlbbIdApi?.url || defaultConfig.mlbbIdApi.url,
      apiKey: process.env.MLBB_ID_API_KEY || disk.mlbbIdApi?.apiKey || defaultConfig.mlbbIdApi.apiKey,
      apiKeyHeader: process.env.MLBB_ID_API_KEY_HEADER || disk.mlbbIdApi?.apiKeyHeader || defaultConfig.mlbbIdApi.apiKeyHeader,
      apiId: process.env.MLBB_ID_API_ID || disk.mlbbIdApi?.apiId || defaultConfig.mlbbIdApi.apiId
    }
  };
}

const config = loadConfig();
if (!config.adminPassword || config.adminPassword === 'CHANGE_THIS_ADMIN_PASSWORD') {
  console.warn('WARNING: Change the admin password before production use.');
}
if (!config.jwtSecret || config.jwtSecret === 'CHANGE_THIS_TO_A_LONG_RANDOM_SECRET') {
  console.warn('WARNING: Change the JWT secret before production use.');
}

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC));

const db = new sqlite3.Database(DB_FILE);
const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (err) { err ? reject(err) : resolve(this); }));
const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
const all = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || [])));

function orderNo() { return 'ML' + Date.now().toString().slice(-9) + crypto.randomInt(100, 999); }
function receiptNo() { return 'RC' + Date.now().toString().slice(-10) + crypto.randomInt(10, 99); }

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  try {
    req.admin = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Admin login လိုအပ်ပါသည်။' });
  }
}

function validIds(userId, zoneId) {
  return /^\d{5,15}$/.test(userId) && /^\d{1,8}$/.test(zoneId);
}

async function checkIdWithProvider(userId, zoneId) {
  const api = config.mlbbIdApi || {};
  if (!api.url) throw Object.assign(new Error('MLBB ID Check API မချိတ်ရသေးပါ။ config.json သို့မဟုတ် environment variables ထဲမှာ API setting ထည့်ပါ။'), { code: 'NO_PROVIDER' });

  const headers = { 'Content-Type': 'application/json' };
  if (api.apiKey) headers[api.apiKeyHeader || 'X-API-KEY'] = api.apiKey;
  if (api.apiId) headers['X-Lyva-Api-Id'] = api.apiId;

  const response = await fetch(api.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      game: 'mobile-legends', userId, zoneId, uid: userId, zone: zoneId,
      customer_target: userId, customer_target_zone: zoneId
    })
  });
  const data = await response.json().catch(() => ({}));
  const ign = data?.data?.nickname || data?.nickname || data?.username || data?.ign || data?.data?.username;
  const valid = data?.data?.valid ?? data?.valid ?? data?.success ?? data?.result;
  if (response.ok && ign && valid !== false) return ign;
  throw new Error(data?.message || data?.error || 'ID မတွေ့ပါ။');
}

app.get('/api/health', async (req, res) => {
  try {
    await get('SELECT 1 AS ok');
    res.json({ success: true, status: 'ok' });
  } catch {
    res.status(500).json({ success: false, status: 'error' });
  }
});

app.get('/api/initial-data', async (req, res) => {
  try {
    const packages = await all('SELECT id,name,price,icon FROM packages WHERE active=1 ORDER BY id');
    const rows = await all('SELECT key,value FROM settings');
    const settings = Object.fromEntries(rows.map(x => [x.key, x.value]));
    res.json({ success: true, packages, settings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Data load error' });
  }
});

app.post('/api/check-id', async (req, res) => {
  const userId = String(req.body.userId || '').trim();
  const zoneId = String(req.body.zoneId || '').trim();
  if (!validIds(userId, zoneId)) return res.status(400).json({ success: false, error: 'User ID / Zone ID ပုံစံမှားနေပါသည်။' });
  try {
    const ign = await checkIdWithProvider(userId, zoneId);
    res.json({ success: true, userId, zoneId, ign });
  } catch (err) {
    const status = err.code === 'NO_PROVIDER' ? 503 : 400;
    res.status(status).json({ success: false, error: err.message });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const userId = String(req.body.userId || '').trim();
    const zoneId = String(req.body.zoneId || '').trim();
    const ign = String(req.body.ign || '').trim();
    const packageId = Number(req.body.packageId);
    const paymentMethod = String(req.body.paymentMethod || '').trim();
    if (!validIds(userId, zoneId) || !ign || !Number.isInteger(packageId) || !['KPay', 'WavePay'].includes(paymentMethod)) {
      return res.status(400).json({ success: false, error: 'အချက်အလက် မပြည့်စုံပါ။' });
    }
    const pkg = await get('SELECT * FROM packages WHERE id=? AND active=1', [packageId]);
    if (!pkg) return res.status(400).json({ success: false, error: 'Package မတွေ့ပါ။' });
    const settings = Object.fromEntries((await all('SELECT key,value FROM settings')).map(x => [x.key, x.value]));
    const paymentNumber = paymentMethod === 'KPay' ? settings.kpay : settings.wave;
    const no = orderNo();
    await run(`INSERT INTO orders(order_no,user_id,zone_id,ign,package_id,package_name,price,payment_method,payment_number,status)
      VALUES(?,?,?,?,?,?,?,?,?,'PENDING_PAYMENT')`,
      [no, userId, zoneId, ign, pkg.id, pkg.name, pkg.price, paymentMethod, paymentNumber]);
    res.json({ success: true, orderNo: no, price: pkg.price, packageName: pkg.name, paymentMethod, paymentNumber });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Order create error' });
  }
});

app.post('/api/orders/:orderNo/payment', async (req, res) => {
  try {
    const no = String(req.params.orderNo || '').trim();
    const userId = String(req.body.userId || '').trim();
    const ref = String(req.body.paymentRef || '').trim();
    if (!ref) return res.status(400).json({ success: false, error: 'ငွေလွှဲပြေစာ/Reference နံပါတ် ထည့်ပါ။' });
    const o = await get('SELECT * FROM orders WHERE order_no=? AND user_id=?', [no, userId]);
    if (!o) return res.status(404).json({ success: false, error: 'Order မတွေ့ပါ။' });
    if (o.status === 'COMPLETED') return res.json({ success: true, status: o.status });
    await run(`UPDATE orders SET payment_ref=?,status='PAYMENT_SUBMITTED',updated_at=CURRENT_TIMESTAMP WHERE order_no=?`, [ref, no]);
    res.json({ success: true, status: 'PAYMENT_SUBMITTED' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Payment update error' });
  }
});

app.get('/api/order/:orderNo', async (req, res) => {
  try {
    const no = String(req.params.orderNo || '').trim();
    const userId = String(req.query.userId || '').trim();
    const order = await get(`SELECT id,order_no,user_id,zone_id,ign,package_name,price,payment_method,payment_number,payment_ref,status,admin_note,receipt_no,created_at,updated_at,completed_at
      FROM orders WHERE order_no=? AND user_id=?`, [no, userId]);
    if (!order) return res.status(404).json({ success: false, error: 'Order မတွေ့ပါ။' });
    res.json({ success: true, order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Order lookup error' });
  }
});

app.post('/api/admin/login', (req, res) => {
  const password = String(req.body.password || '');
  if (password !== config.adminPassword) return res.status(401).json({ success: false, error: 'Password မှားနေပါသည်။' });
  const token = jwt.sign({ role: 'admin' }, config.jwtSecret, { expiresIn: '8h' });
  res.json({ success: true, token });
});

app.get('/api/admin/orders', auth, async (req, res) => {
  try {
    const orders = await all('SELECT * FROM orders ORDER BY id DESC');
    res.json({ success: true, orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Orders load error' });
  }
});

app.post('/api/admin/order-status', auth, async (req, res) => {
  try {
    const orderId = Number(req.body.orderId);
    const status = String(req.body.status || '');
    const note = String(req.body.note || '');
    const allowed = ['PENDING_PAYMENT', 'PAYMENT_SUBMITTED', 'PROCESSING', 'COMPLETED', 'REJECTED'];
    if (!Number.isInteger(orderId) || !allowed.includes(status)) return res.status(400).json({ success: false, error: 'Status မမှန်ပါ။' });
    const order = await get('SELECT * FROM orders WHERE id=?', [orderId]);
    if (!order) return res.status(404).json({ success: false, error: 'Order မတွေ့ပါ။' });

    const completedAt = status === 'COMPLETED' ? new Date().toISOString() : null;
    const rc = status === 'COMPLETED' ? (order.receipt_no || receiptNo()) : order.receipt_no;
    await run(`UPDATE orders SET status=?,admin_note=?,receipt_no=?,completed_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [status, note, rc, completedAt, orderId]);
    res.json({ success: true, receiptNo: rc });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Status update error' });
  }
});

app.post('/api/admin/package', auth, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const price = Number(req.body.price);
    if (!name || !Number.isInteger(price) || price < 1) return res.status(400).json({ success: false, error: 'Package data မမှန်ပါ။' });
    const result = await run('INSERT INTO packages(name,price,icon) VALUES(?,?,?)', [name, price, 'fa-gem']);
    res.json({ success: true, id: result.lastID });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Package create error' });
  }
});

app.delete('/api/admin/package/:id', auth, async (req, res) => {
  try {
    await run('UPDATE packages SET active=0 WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Package delete error' });
  }
});

app.post('/api/admin/settings', auth, async (req, res) => {
  try {
    const fields = ['storeName', 'kpay', 'wave', 'notice', 'support'];
    for (const key of fields) {
      if (req.body[key] !== undefined) await run('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', [key, String(req.body[key])]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Settings save error' });
  }
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ success: false, error: 'Not found' });
  res.sendFile(path.join(PUBLIC, 'index.html'));
});

async function start() {
  try {
    // Keep migration in the GitHub project and run it automatically on startup too.
    execFileSync(process.execPath, [path.join(ROOT, 'db', 'migrate.js')], { stdio: 'inherit', env: process.env });
    app.listen(PORT, '0.0.0.0', () => console.log(`MLBB Top-Up server running on ${PORT}`));
  } catch (err) {
    console.error('Startup migration failed. Server not started.');
    process.exit(1);
  }
}

start();
