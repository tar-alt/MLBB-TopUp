const express = require('express');
const router = express.Router();
const Package = require('../models/Package');
const Order = require('../models/Order');
const { sendOrderNotification } = require('../services/telegramService');

// Get active packages
router.get('/packages', async (req, res) => {
  try {
    const packages = await Package.find({ isActive: true }).sort({ priceMMK: 1 });
    res.json({ success: true, data: packages });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Submit Order
router.post('/order', async (req, res) => {
  try {
    const { playerId, zoneId, packageId, paymentMethod, slipImageUrl } = req.body;
    const pkg = await Package.findById(packageId);
    if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });

    const orderId = 'ORD-' + Math.floor(100000 + Math.random() * 900000);
    const newOrder = new Order({
      orderId,
      playerId,
      zoneId,
      packageId,
      paymentMethod,
      slipImageUrl,
      totalAmount: pkg.priceMMK
    });

    await newOrder.save();
    sendOrderNotification(newOrder, pkg);

    res.status(201).json({ success: true, message: 'Order submitted', orderId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Order History
router.get('/orders/history', async (req, res) => {
  try {
    const { playerId } = req.query;
    const orders = await Order.find({ playerId }).populate('packageId').sort({ createdAt: -1 });
    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

