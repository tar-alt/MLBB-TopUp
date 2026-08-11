const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderId: { type: String, unique: true, required: true },
  playerId: { type: String, required: true },
  zoneId: { type: String, required: true },
  packageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Package', required: true },
  paymentMethod: { type: String, required: true },
  slipImageUrl: { type: String, required: true },
  totalAmount: { type: Number, required: true },
  status: { type: String, enum: ['Pending', 'Completed', 'Rejected'], default: 'Pending' },
  adminNote: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);

