const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  category: { type: String, required: true },
  date: { type: Date, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },  // Reference to User model
  recurring: { type: Boolean, default: false },  // Indicates if the expense is recurring
  nextRecurringDate: { type: Date, default: null },  // The next date when the recurring expense will occur
});

module.exports = mongoose.model('Expense', expenseSchema);
