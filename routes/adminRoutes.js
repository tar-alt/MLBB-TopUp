const express = require('express');
const router = express.Router();
const { verifyAdmin } = require('../middleware/auth');
const Package = require('../models/Package');
const Order = require('../models/Order');
const Setting = require('../models/Setting');

router.use(verifyAdmin);

// Add / Edit Package
router.post('/packages', async (req, res) => {
  const pkg = new Package(req.body);
  await pkg.save();
  res.json({ success: true, data: pkg });
});

router.put('/packages/:id', async (req, res) => {
  const updated = await Package.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json({ success: true, data: updated });
});

// Manage Telegram Settings
router.post('/settings/telegram', async (req, res) => {
  const { botToken, chatId, isEnabled } = req.body;
  const updatedSetting = await Setting.findOneAndUpdate(
    { key: 'TELEGRAM_CONFIG' },
    { value: { botToken, chatId, isEnabled } },
    { upsert: true, new: true }
  );
  res.json({ success: true, data: updatedSetting });
});

// Order Status Approve/Reject
router.patch('/orders/:id/status', async (req, res) => {
  const { status, adminNote } = req.body;
  const order = await Order.findByIdAndUpdate(req.params.id, { status, adminNote }, { new: true });
  res.json({ success: true, data: order });
});

module.exports = router;

