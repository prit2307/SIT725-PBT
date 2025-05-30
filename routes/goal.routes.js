const express = require('express');
const Goal = require('../models/goal.model');
const Income = require('../models/income.model');
const Expense = require('../models/expense.model');
const mongoose = require('mongoose');
const router = express.Router();

function isAuth(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}

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

// Render goal page with goals and their current left amount & status
router.get('/goals', isAuth, async (req, res) => {
  const userId = req.session.userId;
  const goals = await Goal.find({ user: userId });

  // Calculate amountLeft for each goal dynamically
  for (const goal of goals) {
    const { start, end } = getPeriodRange(goal.period);
    let totalAmount = 0;

    if (goal.type === 'income') {
      const incomeAgg = await Income.aggregate([
        {
          $match: {
            user: new mongoose.Types.ObjectId(userId),
            date: { $gte: start, $lt: end }
          }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      totalAmount = incomeAgg.length ? incomeAgg[0].total : 0;
    } else if (goal.type === 'expense') {
      const expenseAgg = await Expense.aggregate([
        {
          $match: {
            user: new mongoose.Types.ObjectId(userId),
            date: { $gte: start, $lt: end }
          }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      totalAmount = expenseAgg.length ? expenseAgg[0].total : 0;
    }

    goal.amountLeft = Math.max(0, goal.amount - totalAmount);
    goal.isActive = goal.amountLeft === 0;
  }

  res.render('goals', { title: 'Set Your Goals', goals, error: null });
});

// Render edit goal page
router.get('/goals/edit/:id', isAuth, async (req, res) => {
  try {
    const goal = await Goal.findOne({ _id: req.params.id, user: req.session.userId });
    if (!goal) return res.redirect('/goals');
    res.render('edit-goal', { title: 'Edit Goal', goal, error: null });
  } catch (error) {
    console.log(error);
    res.redirect('/goals');
  }
});

// Update goal
router.post('/goals/edit/:id', isAuth, async (req, res) => {
  const { amount, period, type } = req.body;
  const id = req.params.id;
  const userId = req.session.userId;

  try {
    // Check if another goal with same type+period exists (except current goal)
    const existingGoal = await Goal.findOne({
      _id: { $ne: id },
      user: userId,
      type,
      period
    });

    if (existingGoal) {
      // Already a goal for this type + period
      const goal = await Goal.findById(id);
      return res.render('edit-goal', {
        title: 'Edit Goal',
        goal,
        error: `You already have a ${type} goal set for ${period}.`
      });
    }

    await Goal.findByIdAndUpdate(id, { amount, period, type });
    res.redirect('/goals');
  } catch (err) {
    console.log(err);
    res.redirect('/goals');
  }
});

// Add or update goal (upsert) with max 4 goals and unique type+period validation
router.post('/goals', isAuth, async (req, res) => {
  const { type, amount, period } = req.body;
  const userId = req.session.userId;

  try {
    // Count how many goals of this type user has
    const count = await Goal.countDocuments({ user: userId, type });

    if (count >= 4) {
      const goals = await Goal.find({ user: userId });
      return res.render('goals', {
        title: 'Set Your Goals',
        goals,
        error: `You have already set maximum 4 ${type} goals. Please edit or delete existing ones.`
      });
    }

    // Check if a goal with this type+period already exists
    const existingGoal = await Goal.findOne({ user: userId, type, period });
    if (existingGoal) {
      const goals = await Goal.find({ user: userId });
      return res.render('goals', {
        title: 'Set Your Goals',
        goals,
        error: `You already have a ${type} goal set for ${period}. Please edit it if you want to change the amount.`
      });
    }

    // Create new goal
    const newGoal = new Goal({ user: userId, type, amount, period });
    await newGoal.save();
    res.redirect('/goals');
  } catch (err) {
    console.log(err);
    res.redirect('/goals');
  }
});

// Delete goal
router.post('/goals/delete/:id', isAuth, async (req, res) => {
  await Goal.findByIdAndDelete(req.params.id);
  res.redirect('/goals');
});

module.exports = router;
