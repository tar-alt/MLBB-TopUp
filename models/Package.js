const mongoose = require('mongoose');

const packageSchema = new mongoose.Schema({
  title: { type: String, required: true },
  diamonds: { type: Number, required: true },
  priceMMK: { type: Number, required: true },
  category: { type: String, default: 'Diamonds' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Package', packageSchema);

