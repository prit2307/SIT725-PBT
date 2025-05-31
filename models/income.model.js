const mongoose = require('mongoose');

const incomeSchema = new mongoose.Schema({
    amount: { type: Number, required: true },
    category: { type: String, required: true },
    date: { type: Date, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },  // Reference to User model
});

module.exports = mongoose.model('Income', incomeSchema);
