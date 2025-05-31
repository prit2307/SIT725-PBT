const express = require('express');
const mongoose = require('mongoose');
const Income = require('../models/income.model');
const Goal = require('../models/goal.model');
const { isAuth } = require('../middleware/auth');

const router = express.Router();

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

router.get('/add-income', isAuth, (req, res) => {
  const message = req.session.congratulations || null;
  delete req.session.congratulations; // clear after reading

  res.render('add-income', { title: 'Add Income - Personal Budget Tracker', message });
});

router.post('/add-income', isAuth, async (req, res) => {
  const { amount, category, date } = req.body;
  const userId = req.session.userId;

  try {
    const goals = await Goal.find({ user: userId, type: 'income' });
    for (const goal of goals) {
      const { start, end } = getPeriodRange(goal.period);
      const totalIncome = await Income.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(userId), date: { $gte: start, $lt: end } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      const earned = totalIncome.length ? totalIncome[0].total : 0;
      const amountLeft = goal.amount - earned;
      goal.amountLeft = amountLeft;
      await goal.save();

      if (earned + Number(amount) >= goal.amount) {
        req.session.congratulations = `Congrats! You reached your ${goal.period} income goal of $${goal.amount}.`;
      }
    }

    const income = new Income({ amount, category, date, user: userId });
    await income.save();
    res.redirect('/view-income');
  } catch (err) {
    console.log(err);
    res.redirect('/add-income');
  }
});

router.get('/view-income', isAuth, async (req, res) => {
  try {
    const income = await Income.find({ user: req.session.userId });
    const message = req.session.congratulations;
    delete req.session.congratulations;
    res.render('view-income', { title: 'View Income - Personal Budget Tracker', income, message });
  } catch (err) {
    console.log(err);
    res.redirect('/home');
  }
});

router.get('/edit-income/:id', isAuth, async (req, res) => {
  try {
    const income = await Income.findById(req.params.id);
    if (!income) return res.redirect('/view-income');
    res.render('edit-income', { title: 'Edit Income', income });
  } catch (err) {
    console.log(err);
    res.redirect('/view-income');
  }
});

router.post('/update-income/:id', isAuth, async (req, res) => {
  const { category, amount, date } = req.body;
  try {
    await Income.findByIdAndUpdate(req.params.id, { category, amount, date });
    res.redirect('/view-income');
  } catch (err) {
    console.log(err);
    res.redirect('/view-income');
  }
});

router.get('/delete-income/:id', isAuth, async (req, res) => {
  try {
    await Income.findByIdAndDelete(req.params.id);
    res.redirect('/view-income');
  } catch (err) {
    console.log(err);
    res.redirect('/view-income');
  }
});

module.exports = router;
