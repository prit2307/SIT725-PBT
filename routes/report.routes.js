const express = require('express');
const { Parser } = require('json2csv');
const Income = require('../models/income.model');
const Expense = require('../models/expense.model');
const router = express.Router();
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
function isAuth(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}

// GET reports page
router.get('/reports', isAuth, (req, res) => {
  res.render('reports', { title: 'Generate Reports' });
});

// POST generate CSV report

router.post('/reports', isAuth, async (req, res) => {
  const { startDate, endDate, type, format } = req.body;  // <-- added format
  const userId = req.session.userId;

  let data = [];

  try {
    if (type === 'income' || type === 'both') {
      const incomes = await Income.find({
        user: userId,
        date: { $gte: new Date(startDate), $lte: new Date(endDate) }
      });
      data = data.concat(incomes.map(i => ({
        type: 'Income',
        category: i.category,
        amount: i.amount,
        date: i.date.toISOString().split('T')[0],
      })));
    }

    if (type === 'expense' || type === 'both') {
      const expenses = await Expense.find({
        user: userId,
        date: { $gte: new Date(startDate), $lte: new Date(endDate) }
      });
      data = data.concat(expenses.map(e => ({
        type: 'Expense',
        category: e.category,
        amount: e.amount,
        date: e.date.toISOString().split('T')[0],
      })));
    }

    if (data.length === 0) {
      return res.send('No data available for the selected date range.');
    }

    if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 30, size: 'A4' });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=report_${startDate}_to_${endDate}.pdf`);

      doc.pipe(res);

      // Title
      doc.fontSize(18).text('Income & Expense Report', { align: 'center' });
      doc.moveDown(1);

      // Table headers
      const tableTop = 100;
      const itemX = 50;
      const colWidths = {
        type: 80,
        category: 100,
        amount: 80,
        date: 100,
      };

      doc.fontSize(12);
      doc.text('Type', itemX, tableTop);
      doc.text('Category', itemX + colWidths.type, tableTop);
      doc.text('Amount', itemX + colWidths.type + colWidths.category, tableTop);
      doc.text('Date', itemX + colWidths.type + colWidths.category + colWidths.amount, tableTop);

      // Draw header line
      doc.moveTo(itemX, tableTop + 15)
         .lineTo(550, tableTop + 15)
         .stroke();

      // Rows
      let y = tableTop + 25;
      data.forEach(item => {
        doc.text(item.type, itemX, y);
        doc.text(item.category, itemX + colWidths.type, y);
        doc.text(`$${item.amount.toFixed(2)}`, itemX + colWidths.type + colWidths.category, y);
        doc.text(item.date, itemX + colWidths.type + colWidths.category + colWidths.amount, y);


        y += 20;

        // Add page break if near bottom
        if (y > 700) {
          doc.addPage();
          y = 50; // reset y to top on new page
        }
      });

      doc.end();

    } else {
      // Default to CSV
      const json2csvParser = new Parser({ fields: ['type', 'category', 'amount', 'date'] });
      const csv = json2csvParser.parse(data);

      res.header('Content-Type', 'text/csv');
      res.attachment(`report_${startDate}_to_${endDate}.csv`);
      return res.send(csv);
    }

  } catch (err) {
    console.error(err);
    return res.status(500).send('Error generating report');
  }
});

module.exports = router;


// API for Monthly Summary Report (JSON)
router.get('/api/monthly-summary', isAuth, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.session.userId);
    const month = req.query.month; // e.g. "January 2023"
    
    if (!month) {
      return res.status(400).json({ error: 'Month parameter is required' });
    }

    // Parse month string into date range
    const [monthName, year] = month.split(' ');
    const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth();
    const startDate = new Date(year, monthIndex, 1);
    const endDate = new Date(year, monthIndex + 1, 0, 23, 59, 59);

    // Get weekly breakdown
    const weeklyData = await getWeeklyBreakdown(userId, startDate, endDate);

    // Get total income and expense
    const [totalIncome, totalExpense] = await Promise.all([
      getTotalAmount(Income, userId, startDate, endDate),
      getTotalAmount(Expense, userId, startDate, endDate)
    ]);

    res.json({
      success: true,
      weeklyData,
      totals: {
        income: totalIncome,
        expense: totalExpense,
        balance: totalIncome - totalExpense
      }
    });
  } catch (error) {
    console.error('Error fetching monthly summary:', error);
    res.status(500).json({ error: 'Failed to fetch monthly summary' });
  }
});

// Helper: get weekly breakdown in date range
async function getWeeklyBreakdown(userId, startDate, endDate) {
  const weeks = [];
  let currentWeekStart = new Date(startDate);
  
  while (currentWeekStart <= endDate) {
    let currentWeekEnd = new Date(currentWeekStart);
    currentWeekEnd.setDate(currentWeekStart.getDate() + 6);
    if (currentWeekEnd > endDate) currentWeekEnd = new Date(endDate);
    
    const [income, expense] = await Promise.all([
      getTotalAmount(Income, userId, currentWeekStart, currentWeekEnd),
      getTotalAmount(Expense, userId, currentWeekStart, currentWeekEnd)
    ]);
    
    weeks.push({
      label: `Week ${weeks.length + 1}`,
      income,
      expense
    });
    
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
  }
  
  return weeks;
}

// Helper: get total amount for model in date range
async function getTotalAmount(Model, userId, startDate, endDate) {
  const result = await Model.aggregate([
    {
      $match: {
        user: userId,
        date: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$amount" }
      }
    }
  ]);
  
  return result.length > 0 ? result[0].total : 0;
}

module.exports = router;
