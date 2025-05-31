const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['income', 'expense'], required: true },
  period: { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly'], required: true },
  amount: { type: Number, required: true },
  amountLeft: { type: Number, default: 0 } // calculated left amount
});

module.exports = mongoose.model('Goal', goalSchema);
