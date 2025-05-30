const express = require('express');
const Income = require('../models/income.model');
const Expense = require('../models/expense.model');
const Goal = require('../models/goal.model');
const router = express.Router();
const mongoose = require('mongoose');

function isAuth(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}
function getDateRangeForPeriod(period) {
  const now = new Date();
  let startDate, endDate, format;

  switch (period) {
    case 'month':
      // Last 6 months from current month start
      startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      format = "%Y-%m";
      break;
    case 'quarter':
      // Last 4 quarters from current quarter start
      const currentQuarter = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), (currentQuarter - 3) * 3, 1);
      endDate = new Date(now.getFullYear(), (currentQuarter + 1) * 3, 0, 23, 59, 59, 999);
      format = "%Y-Q%q";  // Note: MongoDB $dateToString does not support %q, so we'll handle quarter grouping manually below
      break;
    case 'year':
      // Last 5 years from Jan 1 current year
      startDate = new Date(now.getFullYear() - 4, 0, 1);
      endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      format = "%Y";
      break;
    case 'all':
    default:
      startDate = new Date(2000, 0, 1);
      endDate = now;
      format = "%Y-%m";
      break;
  }

  return { startDate, endDate, format };
}

function getDateFormatAndGroup(period) {
  switch (period) {
    case 'month':
      return { format: "%Y-%m", groupBy: { $dateToString: { format: "%Y-%m", date: "$date" } } };
    case 'quarter':
      return {
        format: null,
        groupBy: {
          year: { $year: "$date" },
          quarter: { $ceil: { $divide: [{ $month: "$date" }, 3] } }
        }
      };
    case 'year':
      return { format: "%Y", groupBy: { $dateToString: { format: "%Y", date: "$date" } } };
    case 'all':
    default:
      return { format: null, groupBy: null };
  }
}

function formatLabel(id, period) {
  if (!id) return "All Time";
  if (period === 'month') return id; // YYYY-MM
  if (period === 'year') return id;  // YYYY
  if (period === 'quarter') {
    return `Q${id.quarter} ${id.year}`;
  }
  return "";
}

// Helper to normalize arrays and fill missing data with 0
function normalizeData(incomeData, expenseData, period) {
  const allIdsSet = new Set([
    ...incomeData.map(d => JSON.stringify(d._id)),
    ...expenseData.map(d => JSON.stringify(d._id))
  ]);

  const allIds = Array.from(allIdsSet).map(str => JSON.parse(str));

  // Sort labels chronologically or alphabetically
  allIds.sort((a, b) => {
    // For string ids like "2023-04", "2023-05"
    if (typeof a === 'string' && typeof b === 'string') {
      return a.localeCompare(b);
    }
    // For quarter objects
    if (typeof a === 'object' && typeof b === 'object') {
      if (a.year !== b.year) return a.year - b.year;
      return a.quarter - b.quarter;
    }
    return 0;
  });

  const labels = allIds.map(id => formatLabel(id, period));

  function getAmountById(data, id) {
    const found = data.find(d => JSON.stringify(d._id) === JSON.stringify(id));
    return found ? found.totalAmount : 0;
  }

  const incomeAmounts = allIds.map(id => getAmountById(incomeData, id));
  const expenseAmounts = allIds.map(id => getAmountById(expenseData, id));

  return { labels, incomeAmounts, expenseAmounts };
}

// Dashboard main route (renders the dashboard page)
router.get('/dashboard', isAuth, async (req, res) => {
  res.render('dashboard', { title: 'Dashboard' });
});

// API for Income vs Expense Trend
router.get('/api/trend-data', isAuth, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.session.userId);
    const period = req.query.period || 'month';
    const { startDate, endDate, format } = getDateRangeForPeriod(period);

    // For quarter, MongoDB does not support %q in $dateToString, so handle differently
    if (period === 'quarter') {
      // Group by year and quarter manually
      const incomeData = await Income.aggregate([
        { $match: { user: mongoose.Types.ObjectId(userId), date: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: {
              year: { $year: "$date" },
              quarter: { $ceil: { $divide: [{ $month: "$date" }, 3] } }
            },
            totalAmount: { $sum: "$amount" }
          }
        },
        { $sort: { "_id.year": 1, "_id.quarter": 1 } }
      ]);

      const expenseData = await Expense.aggregate([
        { $match: { user: mongoose.Types.ObjectId(userId), date: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: {
              year: { $year: "$date" },
              quarter: { $ceil: { $divide: [{ $month: "$date" }, 3] } }
            },
            totalAmount: { $sum: "$amount" }
          }
        },
        { $sort: { "_id.year": 1, "_id.quarter": 1 } }
      ]);

      // Combine labels and data (normalized)
      const allLabelsSet = new Set([
        ...incomeData.map(d => JSON.stringify(d._id)),
        ...expenseData.map(d => JSON.stringify(d._id))
      ]);
      const allLabels = Array.from(allLabelsSet).map(s => JSON.parse(s));
      allLabels.sort((a, b) => a.year !== b.year ? a.year - b.year : a.quarter - b.quarter);

      const labels = allLabels.map(l => `Q${l.quarter} ${l.year}`);

      function getAmount(data, id) {
        const found = data.find(d => JSON.stringify(d._id) === JSON.stringify(id));
        return found ? found.totalAmount : 0;
      }
      const incomeAmounts = allLabels.map(id => getAmount(incomeData, id));
      const expenseAmounts = allLabels.map(id => getAmount(expenseData, id));

      return res.json({ labels, incomeData: incomeAmounts, expenseData: expenseAmounts });
    }

    // For other periods (month, year, all), use $dateToString with format
    const incomeData = await Income.aggregate([
      { $match: { user: mongoose.Types.ObjectId(userId), date: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: { $dateToString: { format: format, date: "$date" } },
          totalAmount: { $sum: "$amount" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const expenseData = await Expense.aggregate([
      { $match: { user: mongoose.Types.ObjectId(userId), date: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: { $dateToString: { format: format, date: "$date" } },
          totalAmount: { $sum: "$amount" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Combine labels and data
    const allLabelsSet = new Set([
      ...incomeData.map(d => d._id),
      ...expenseData.map(d => d._id)
    ]);
    const allLabels = Array.from(allLabelsSet).sort();

    const processedIncomeData = allLabels.map(label => {
      const found = incomeData.find(d => d._id === label);
      return found ? found.totalAmount : 0;
    });

    const processedExpenseData = allLabels.map(label => {
      const found = expenseData.find(d => d._id === label);
      return found ? found.totalAmount : 0;
    });

    res.json({
      labels: allLabels,
      incomeData: processedIncomeData,
      expenseData: processedExpenseData
    });
  } catch (error) {
    console.error('Error fetching trend data:', error);
    res.status(500).json({ error: 'Failed to fetch trend data' });
  }
});

// API for Balance Trend
router.get('/api/balance-data', isAuth, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(userId);
    const period = req.query.period || 'month';
    const { startDate, endDate, format } = getDateRangeForPeriod(period);

    if (period === 'quarter') {
      const incomeData = await Income.aggregate([
        { $match: { user: mongoose.Types.ObjectId(userId), date: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: {
              year: { $year: "$date" },
              quarter: { $ceil: { $divide: [{ $month: "$date" }, 3] } }
            },
            totalAmount: { $sum: "$amount" }
          }
        },
        { $sort: { "_id.year": 1, "_id.quarter": 1 } }
      ]);

      const expenseData = await Expense.aggregate([
        { $match: { user: mongoose.Types.ObjectId(userId), date: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: {
              year: { $year: "$date" },
              quarter: { $ceil: { $divide: [{ $month: "$date" }, 3] } }
            },
            totalAmount: { $sum: "$amount" }
          }
        },
        { $sort: { "_id.year": 1, "_id.quarter": 1 } }
      ]);

      const allLabelsSet = new Set([
        ...incomeData.map(d => JSON.stringify(d._id)),
        ...expenseData.map(d => JSON.stringify(d._id))
      ]);
      const allLabels = Array.from(allLabelsSet).map(s => JSON.parse(s));
      allLabels.sort((a, b) => a.year !== b.year ? a.year - b.year : a.quarter - b.quarter);

      const labels = allLabels.map(l => `Q${l.quarter} ${l.year}`);

      function getAmount(data, id) {
        const found = data.find(d => JSON.stringify(d._id) === JSON.stringify(id));
        return found ? found.totalAmount : 0;
      }
      const incomeAmounts = allLabels.map(id => getAmount(incomeData, id));
      const expenseAmounts = allLabels.map(id => getAmount(expenseData, id));

      const balanceData = incomeAmounts.map((inc, idx) => inc - expenseAmounts[idx]);

      return res.json({ labels, balanceData });
    }

    // For other periods
    const incomeData = await Income.aggregate([
      { $match: { user: mongoose.Types.ObjectId(userId), date: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: { $dateToString: { format: format, date: "$date" } },
          totalAmount: { $sum: "$amount" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const expenseData = await Expense.aggregate([
      { $match: { user: mongoose.Types.ObjectId(userId), date: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: { $dateToString: { format: format, date: "$date" } },
          totalAmount: { $sum: "$amount" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const allLabelsSet = new Set([
      ...incomeData.map(d => d._id),
      ...expenseData.map(d => d._id)
    ]);
    const allLabels = Array.from(allLabelsSet).sort();

    const processedIncomeData = allLabels.map(label => {
      const found = incomeData.find(d => d._id === label);
      return found ? found.totalAmount : 0;
    });

    const processedExpenseData = allLabels.map(label => {
      const found = expenseData.find(d => d._id === label);
      return found ? found.totalAmount : 0;
    });

    const balanceData = processedIncomeData.map((inc, idx) => inc - processedExpenseData[idx]);

    res.json({ labels: allLabels, balanceData });
  } catch (error) {
    console.error('Error fetching balance data:', error);
    res.status(500).json({ error: 'Failed to fetch balance data' });
  }
});

// API for Income by Category
router.get('/api/income-categories', isAuth, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.session.userId);
    const period = req.query.period || 'all';

    let matchStage = { user: userId };

    if (period !== 'all') {
      const dateFilter = getDateFilter(period);
      if (dateFilter) matchStage.date = dateFilter;
    }

    const categoryAgg = [
      { $match: matchStage },
      { $group: { _id: "$category", totalAmount: { $sum: "$amount" } } },
      { $sort: { totalAmount: -1 } }
    ];

    const categoryData = await Income.aggregate(categoryAgg);

    res.json({
      labels: categoryData.map(d => d._id),
      amounts: categoryData.map(d => d.totalAmount)
    });
  } catch (error) {
    console.error('Error fetching income categories:', error);
    res.status(500).json({ error: 'Failed to fetch income categories' });
  }
});

// API for Expense by Category
router.get('/api/expense-categories', isAuth, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.session.userId);
    const period = req.query.period || 'all';

    let matchStage = { user: userId };

    if (period !== 'all') {
      const dateFilter = getDateFilter(period);
      if (dateFilter) matchStage.date = dateFilter;
    }

    const categoryAgg = [
      { $match: matchStage },
      { $group: { _id: "$category", totalAmount: { $sum: "$amount" } } },
      { $sort: { totalAmount: -1 } }
    ];

    const categoryData = await Expense.aggregate(categoryAgg);

    res.json({
      labels: categoryData.map(d => d._id),
      amounts: categoryData.map(d => d.totalAmount)
    });
  } catch (error) {
    console.error('Error fetching expense categories:', error);
    res.status(500).json({ error: 'Failed to fetch expense categories' });
  }
});

// API for Goals Progress
router.get('/api/goals-progress', isAuth, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.session.userId);
    const goals = await Goal.find({ user: userId }).sort({ targetDate: 1 });

    const labels = goals.map(goal => goal.name || 'Unnamed Goal');
    const currentValues = goals.map(goal => goal.currentAmount || 0);
    const targetValues = goals.map(goal => goal.targetAmount || 0);

    res.json({
      labels,
      currentValues,
      targetValues
    });
  } catch (error) {
    console.error('Error fetching goals:', error);
    res.status(500).json({ error: 'Failed to fetch goals' });
  }
});

// Helper function to get date filter based on period
function getDateFilter(period) {
  const now = new Date();
  let startDate;

  switch (period) {
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'quarter':
      const quarter = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), quarter * 3, 1);
      break;
    case 'year':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      return null;
  }

  return { $gte: startDate, $lte: now };
}
// Helper function to get date filter based on period for category queries
function getDateFilter(period) {
  const now = new Date();
  let startDate;

  switch (period) {
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'quarter':
      const quarter = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), quarter * 3, 1);
      break;
    case 'year':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      return null;
  }

  return { $gte: startDate, $lte: now };
}
module.exports = router;
