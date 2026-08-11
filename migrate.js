const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'database.db');
const db = new sqlite3.Database(DB_FILE);

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) {
    if (err) reject(err);
    else resolve(this);
  });
});

const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});

const all = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
});

function orderNo() {
  return 'ML' + Date.now().toString().slice(-9) + crypto.randomInt(100, 999);
}

async function ensureColumn(table, name, definition) {
  const columns = await all(`PRAGMA table_info(${table})`);
  if (!columns.some(c => c.name === name)) {
    await run(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    console.log(`Added ${table}.${name}`);
  }
}

async function migrate() {
  await run('PRAGMA journal_mode=WAL');
  await run('PRAGMA foreign_keys=ON');

  await run(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    icon TEXT DEFAULT 'fa-gem',
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no TEXT,
    user_id TEXT NOT NULL,
    zone_id TEXT NOT NULL,
    ign TEXT NOT NULL,
    package_id INTEGER,
    package_name TEXT NOT NULL,
    price INTEGER NOT NULL,
    payment_method TEXT NOT NULL,
    payment_number TEXT,
    payment_ref TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
    admin_note TEXT DEFAULT '',
    receipt_no TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
  )`);

  // Safe, idempotent migration for the older MLBB-TopUp database.
  const packageColumns = {
    icon: "TEXT DEFAULT 'fa-gem'",
    active: 'INTEGER DEFAULT 1',
    created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
  };
  for (const [name, definition] of Object.entries(packageColumns)) {
    await ensureColumn('packages', name, definition);
  }

  const orderColumns = {
    order_no: 'TEXT',
    package_id: 'INTEGER',
    payment_number: 'TEXT',
    payment_ref: 'TEXT',
    admin_note: "TEXT DEFAULT ''",
    receipt_no: 'TEXT',
    updated_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
    completed_at: 'DATETIME'
  };
  for (const [name, definition] of Object.entries(orderColumns)) {
    await ensureColumn('orders', name, definition);
  }

  const oldOrders = await all("SELECT id FROM orders WHERE order_no IS NULL OR order_no = ''");
  for (const row of oldOrders) {
    await run('UPDATE orders SET order_no=? WHERE id=?', [orderNo(), row.id]);
  }

  // Backfill sensible defaults for old rows where the new status column may be absent.
  await run("UPDATE orders SET status='PENDING_PAYMENT' WHERE status IS NULL OR status=''");
  await run("UPDATE packages SET active=1 WHERE active IS NULL");

  const packageCount = await get('SELECT COUNT(*) AS count FROM packages');
  if (packageCount.count === 0) {
    const defaults = [
      ['Weekly Diamond Pass', 5800, 'fa-crown'],
      ['11 Diamonds + 1 Bonus', 650, 'fa-gem'],
      ['22 Diamonds + 2 Bonus', 1300, 'fa-gem'],
      ['56 Diamonds + 6 Bonus', 3300, 'fa-gem'],
      ['86 Diamonds + 9 Bonus', 4900, 'fa-gem'],
      ['172 Diamonds + 19 Bonus', 9800, 'fa-gem'],
      ['257 Diamonds + 30 Bonus', 14700, 'fa-gem'],
      ['706 Diamonds + 127 Bonus', 39500, 'fa-gem']
    ];
    for (const item of defaults) {
      await run('INSERT INTO packages(name,price,icon) VALUES(?,?,?)', item);
    }
  }

  const settings = {
    storeName: 'MLBB TOP-UP',
    notice: 'Mobile Legends Diamond Top-Up ဝန်ဆောင်မှု',
    kpay: '09123456789',
    wave: '09987654321',
    support: 'Telegram / Messenger Support'
  };
  for (const [key, value] of Object.entries(settings)) {
    await run('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)', [key, value]);
  }

  const migrations = [
    '001_base_schema',
    '002_legacy_column_backfill',
    '003_default_data'
  ];
  for (const name of migrations) {
    await run('INSERT OR IGNORE INTO schema_migrations(name) VALUES(?)', [name]);
  }

  console.log(`Database migration complete: ${DB_FILE}`);
}

migrate()
  .catch(err => {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  })
  .finally(() => db.close());
