const express = require('express');
const mongoose = require('mongoose');
const Expense = require('../models/expense.model');
const Goal = require('../models/goal.model');
const multer = require('multer');
const fs = require('fs');
const csv = require('fast-csv');
const { Parser } = require('json2csv');
const { isAuth } = require('../middleware/auth');

const router = express.Router();

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

function getPeriodRange(period) {
  const now = new Date();
  let start, end;
  switch (period) {
    case 'daily':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(start);
      end.setDate(end.getDate() + 1);
      break;
    case 'weekly':
      const day = now.getDay();
      start = new Date(now);
      start.setDate(now.getDate() - day + 1);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + 7);
      break;
    case 'monthly':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      break;
    case 'yearly':
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear() + 1, 0, 1);
      break;
  }
  return { start, end };
}

// Recurring expense scheduler (run externally or via setInterval in main app)
async function scheduleRecurringExpenses() {
  const now = new Date();
  const expenses = await Expense.find({ recurring: true, nextRecurringDate: { $lte: now } });
  for (const expense of expenses) {
    const { amount, category, user, nextRecurringDate } = expense;
    const newExpense = new Expense({
      amount,
      category,
      date: new Date(),
      user,
      recurring: true,
      nextRecurringDate: new Date(nextRecurringDate.setMonth(nextRecurringDate.getMonth() + 1))
    });
    await newExpense.save();
  }
}

// CRUD routes for expenses, add-expense, view-expense, etc.

router.get('/add-expense', isAuth, (req, res) => {
  res.render('add-expense', { title: 'Add Expense - Personal Budget Tracker' });
});

router.post('/add-expense', isAuth, async (req, res) => {
  const { amount, category, date, recurring } = req.body;
  const userId = req.session.userId;
  const isRecurring = recurring === 'on';

  try {
    const goals = await Goal.find({ user: userId, type: 'expense' });

    for (const goal of goals) {
      const { start, end } = getPeriodRange(goal.period);
      const totalExpenses = await Expense.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(userId), date: { $gte: start, $lt: end } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      const spent = totalExpenses.length ? totalExpenses[0].total : 0;
      const amountLeft = goal.amount - spent;
      goal.amountLeft = amountLeft;

      if (amount > amountLeft) {
        return res.render('expense-limit-warning', {
          title: 'Expense Limit Warning',
          amount,
          amountLeft,
          category,
          date,
          goalId: goal._id
        });
      }
      await goal.save();
    }

    const expense = new Expense({ amount, category, date, user: userId, recurring: isRecurring });

    if (isRecurring) {
      const nextRecurringDate = new Date(date);
      nextRecurringDate.setMonth(nextRecurringDate.getMonth() + 1);
      expense.nextRecurringDate = nextRecurringDate;
    }

    await expense.save();
    res.redirect('/view-expense');
  } catch (err) {
    console.log(err);
    res.redirect('/add-expense');
  }
});

// Additional CRUD routes for expense (edit, update, delete, view)

router.get('/view-expense', isAuth, async (req, res) => {
  try {
    const expense = await Expense.find({ user: req.session.userId });
    res.render('view-expense', { title: 'View Expense - Personal Budget Tracker', expense });
  } catch (err) {
    console.log(err);
    res.redirect('/home');
  }
});

router.get('/edit-expense/:id', isAuth, async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.redirect('/view-expense');
    res.render('edit-expense', { title: 'Edit Expense', expense });
  } catch (err) {
    console.log(err);
    res.redirect('/view-expense');
  }
});

router.post('/update-expense/:id', isAuth, async (req, res) => {
  const { category, amount, date } = req.body;
  try {
    await Expense.findByIdAndUpdate(req.params.id, { category, amount, date });
    res.redirect('/view-expense');
  } catch (err) {
    console.log(err);
    res.redirect('/view-expense');
  }
});

router.get('/delete-expense/:id', isAuth, async (req, res) => {
  try {
    await Expense.findByIdAndDelete(req.params.id);
    res.redirect('/view-expense');
  } catch (err) {
    console.log(err);
    res.redirect('/view-expense');
  }
});

// Confirm expense route (used when user confirms expense over limit)
router.post('/confirm-expense', isAuth, async (req, res) => {
  const { amount, category, date } = req.body;
  const userId = req.session.userId;

  try {
    const expense = new Expense({ amount, category, date, user: userId });
    await expense.save();
    res.redirect('/view-expense');
  } catch (err) {
    console.log(err);
    res.redirect('/add-expense');
  }
});

// Search route for income and expenses by category
router.get('/search', isAuth, async (req, res) => {
  const { query } = req.query;
  try {
    const income = await Expense.find({ category: new RegExp(query, 'i'), user: req.session.userId });
    const expense = await Expense.find({ category: new RegExp(query, 'i'), user: req.session.userId });

    res.render('search-results', { title: `Search Results for "${query}"`, income, expense, query });
  } catch (err) {
    console.log(err);
    res.redirect('/home');
  }
});

// CSV upload APIs for expenses and incomes
router.post('/api/upload-expenses', isAuth, upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const filePath = `uploads/${req.file.filename}`;
    const data = [];

    fs.createReadStream(filePath)
      .pipe(csv.parse({ headers: true, skipEmptyLines: true }))
      .on('data', row => data.push(row))
      .on('end', async () => {
        const expenseData = data.map(row => ({
          category: row.category,
          amount: parseFloat(row.amount),
          date: new Date(row.date),
          user: req.session.userId
        }));

        if (expenseData.length > 0) await Expense.insertMany(expenseData);

        fs.unlinkSync(filePath);
        res.redirect('/view-expense');
      })
      .on('error', err => {
        console.error('Error processing CSV file:', err);
        fs.unlinkSync(filePath);
        res.status(500).json({ error: 'Error processing CSV file' });
      });
  } catch (error) {
    console.error('Error uploading expenses CSV:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/upload-income', isAuth, upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const filePath = `uploads/${req.file.filename}`;
    const data = [];

    fs.createReadStream(filePath)
      .pipe(csv.parse({ headers: true, skipEmptyLines: true }))
      .on('data', row => data.push(row))
      .on('end', async () => {
        const incomeData = data.map(row => ({
          category: row.category,
          amount: parseFloat(row.amount),
          date: new Date(row.date),
          user: req.session.userId
        }));

        if (incomeData.length > 0) await Expense.insertMany(incomeData);

        fs.unlinkSync(filePath);
        res.redirect('/view-income');
      })
      .on('error', err => {
        console.error('Error processing CSV file:', err);
        fs.unlinkSync(filePath);
        res.status(500).json({ error: 'Error processing CSV file' });
      });
  } catch (error) {
    console.error('Error uploading income CSV:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// CSV format download APIs
router.get('/api/download-income-format', isAuth, (req, res) => {
  const fields = ['category', 'amount', 'date'];
  const exampleData = [
    { category: 'Salary', amount: 5000, date: '2025-05-01' },
    { category: 'Freelance', amount: 2000, date: '2025-05-10' }
  ];

  const json2csvParser = new Parser({ fields });
  const csv = json2csvParser.parse(exampleData);

  res.header('Content-Type', 'text/csv');
  res.attachment('income_template.csv');
  res.send(csv);
});

router.get('/api/download-expense-format', isAuth, (req, res) => {
  const fields = ['category', 'amount', 'date'];
  const exampleData = [
    { category: 'Food', amount: 100, date: '2025-05-01' },
    { category: 'Transportation', amount: 50, date: '2025-05-02' }
  ];

  const json2csvParser = new Parser({ fields });
  const csv = json2csvParser.parse(exampleData);

  res.header('Content-Type', 'text/csv');
  res.attachment('expense_template.csv');
  res.send(csv);
});

module.exports = router;
