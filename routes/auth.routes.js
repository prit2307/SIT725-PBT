const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/user.model');
const nodemailer = require('nodemailer');
const Income = require('../models/income.model');
const Expense = require('../models/expense.model');
const crypto = require('crypto'); // For generating OTP
const mongoose = require('mongoose');
const Goal = require('../models/goal.model'); // import your goal model
const router = express.Router();

// Register Route
router.get('/register', (req, res) => {
    res.render('register', { title: 'Register - Personal Budget Tracker' });
});

router.post('/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const newUser = new User({ username, password });
        await newUser.save();
        res.redirect('/login');
    } catch (error) {
        console.log(error);
        res.redirect('/register');
    }
});

// Login Route
router.get('/login', (req, res) => {
    res.render('login', { title: 'Login - Personal Budget Tracker' });
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username });
        
        if (!user) {
            console.log('User not found');
            return res.redirect('/login');
        }

        // Direct comparison with error handling
        const isMatch = await bcrypt.compare(password, user.password);
        console.log(`Comparing ${password} with ${user.password}:`, isMatch);
        
        if (isMatch) {
            req.session.userId = user._id;
            return res.redirect('/home');
        }
        
        console.log('Invalid credentials');
        res.redirect('/login');
    } catch (error) {
        console.log('Login error:', error);
        res.redirect('/login');
    }
});


// Forgot Password Route (Using OTP)
router.get('/forgot-password', (req, res) => {
    res.render('forgot-password', { title: 'Forgot Password - Personal Budget Tracker' });
});

// Forgot Password Route (Using OTP)
router.post('/forgot-password', async (req, res) => {
    const { username } = req.body;
    try {
        const user = await User.findOne({ username });
        if (user) {
            // Generate OTP
            const otp = crypto.randomInt(100000, 999999).toString(); // Random 6-digit OTP

            // Send OTP via email
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: 'meetlakhani98787@gmail.com',
                    pass: 'qyzn modm mnsk atzc' // App password
                }
            });

            const mailOptions = {
                from: 'meetlakhani98787@gmail.com',
                to: user.username,
                subject: 'Password Reset OTP',
                text: `Your OTP for resetting your password is: ${otp}`
            };

            // Store OTP and userId in the session
            req.session.otp = otp;
            req.session.userId = user._id;

            console.log('OTP generated and stored in session:', otp);

            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.log('Error occurred while sending OTP:', error);
                    res.redirect('/forgot-password');
                } else {
                    console.log('OTP sent: ' + info.response);
                    res.redirect('/verify-otp');
                }
            });
        } else {
            res.redirect('/forgot-password');
        }
    } catch (error) {
        console.log('Error in forgot-password route:', error);
        res.redirect('/forgot-password');
    }
});



// OTP Verification Route
router.get('/verify-otp', (req, res) => {
    res.render('verify-otp', { title: 'Verify OTP - Personal Budget Tracker' });
});

// OTP Verification Route (Password Reset)
router.post('/verify-otp', async (req, res) => {
    const { otp, newPassword } = req.body;

    try {
        if (otp === req.session.otp) {
            // Find user directly without Mongoose document to bypass middleware
            const user = await User.findById(req.session.userId).lean();
            
            if (!user) {
                console.log('User not found');
                return res.redirect('/verify-otp');
            }

            // Hash the new password manually
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            
            // Update using direct MongoDB update to bypass middleware
            await User.updateOne(
                { _id: req.session.userId },
                { $set: { password: hashedPassword } }
            );

            console.log('Password updated successfully');
            
            // Clear session data
            delete req.session.otp;
            delete req.session.userId;
            
            res.redirect('/login');
        } else {
            console.log('OTP does not match');
            res.redirect('/verify-otp');
        }
    } catch (error) {
        console.log('Error during password reset:', error);
        res.redirect('/verify-otp');
    }
});




// Logout Route
router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});


// Add Income Route
// Add Income Route
router.get('/add-income', (req, res) => {
    if (req.session.userId) {
        res.render('add-income', { title: 'Add Income - Personal Budget Tracker' });
    } else {
        res.redirect('/login');
    }
});

// Helper: get start and end of current week for date
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
      const day = now.getDay(); // Sunday=0, Monday=1...
      start = new Date(now);
      start.setDate(now.getDate() - day + 1); // Monday start of week
      start.setHours(0,0,0,0);
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

// Add Income Route with Goal Check
router.post('/add-income', async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');

  const { amount, category, date } = req.body;
  const userId = req.session.userId;

  try {
    // Get income goals
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
        // Income goal reached or exceeded
        req.session.congratulations = `Congrats! You reached your ${goal.period} income goal of $${goal.amount}.`;
      }
    }

    // Add income
    const income = new Income({ amount, category, date, user: userId });
    await income.save();

    res.redirect('/view-income');
  } catch (err) {
    console.log(err);
    res.redirect('/add-income');
  }
});


// View Income Route
router.get('/view-income', async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');

  try {
    const income = await Income.find({ user: req.session.userId });
    const message = req.session.congratulations;
    delete req.session.congratulations; // clear after reading

    res.render('view-income', { title: 'View Income - Personal Budget Tracker', income, message });
  } catch (err) {
    console.log(err);
    res.redirect('/home');
  }
});


// Add Expense Route
router.get('/add-expense', (req, res) => {
    if (req.session.userId) {
        res.render('add-expense', { title: 'Add Expense - Personal Budget Tracker' });
    } else {
        res.redirect('/login');
    }
});

router.post('/add-expense', async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');

  const { amount, category, date } = req.body;
  const userId = req.session.userId;

  try {
    // Get all expense goals for this user
    const goals = await Goal.find({ user: userId, type: 'expense' });

    for (const goal of goals) {
      const { start, end } = getPeriodRange(goal.period);

      // Calculate total expenses in this period
      const totalExpenses = await Expense.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(userId), date: { $gte: start, $lt: end } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);

      const spent = totalExpenses.length ? totalExpenses[0].total : 0;
      const amountLeft = goal.amount - spent;

      goal.amountLeft = amountLeft;

      if (amount > amountLeft) {
        // Over the limit, show alert message page for confirmation
        return res.render('expense-limit-warning', {
          title: 'Expense Limit Warning',
          amount,
          amountLeft,
          category,
          date,
          goalId: goal._id
        });
      } else {
        await goal.save(); // update amountLeft
      }
    }

    // If no goals or within limits, just add the expense
    const expense = new Expense({ amount, category, date, user: userId });
    await expense.save();

    res.redirect('/view-expense');
  } catch (err) {
    console.log(err);
    res.redirect('/add-expense');
  }
});

router.post('/confirm-expense', async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');

  const { amount, category, date } = req.body;
  const userId = req.session.userId;

  try {
    // Add the expense anyway
    const expense = new Expense({ amount, category, date, user: userId });
    await expense.save();

    // Optionally update all expense goals amountLeft again

    res.redirect('/view-expense');
  } catch (err) {
    console.log(err);
    res.redirect('/add-expense');
  }
});

// View Expense Route
router.get('/view-expense', async (req, res) => {
    if (req.session.userId) {
        try {
            const expense = await Expense.find({ user: req.session.userId });  // Fetch expense records for the logged-in user
            res.render('view-expense', { title: 'View Expense - Personal Budget Tracker', expense });
        } catch (err) {
            console.log(err);
            res.redirect('/home');
        }
    } else {
        res.redirect('/login');
    }
});

router.get('/edit-income/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const income = await Income.findById(id);
        if (!income) return res.redirect('/view-income');
        res.render('edit-income', { title: 'Edit Income', income });
    } catch (err) {
        console.log(err);
        res.redirect('/view-income');
    }
});

// Route to update income
router.post('/update-income/:id', async (req, res) => {
    const { id } = req.params;
    const { category, amount, date } = req.body;
    try {
        await Income.findByIdAndUpdate(id, { category, amount, date });
        res.redirect('/view-income');
    } catch (err) {
        console.log(err);
        res.redirect('/view-income');
    }
});

// Route to delete income
router.get('/delete-income/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await Income.findByIdAndDelete(id);
        res.redirect('/view-income');
    } catch (err) {
        console.log(err);
        res.redirect('/view-income');
    }
});

// Route to view/edit a specific expense
router.get('/edit-expense/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const expense = await Expense.findById(id);
        if (!expense) return res.redirect('/view-expense');
        res.render('edit-expense', { title: 'Edit Expense', expense });
    } catch (err) {
        console.log(err);
        res.redirect('/view-expense');
    }
});

// Route to update expense
router.post('/update-expense/:id', async (req, res) => {
    const { id } = req.params;
    const { category, amount, date } = req.body;
    try {
        await Expense.findByIdAndUpdate(id, { category, amount, date });
        res.redirect('/view-expense');
    } catch (err) {
        console.log(err);
        res.redirect('/view-expense');
    }
});

// Route to delete expense
router.get('/delete-expense/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await Expense.findByIdAndDelete(id);
        res.redirect('/view-expense');
    } catch (err) {
        console.log(err);
        res.redirect('/view-expense');
    }
});

// Search Route to search income and expenses by category
router.get('/search', async (req, res) => {
    const { query } = req.query;

    try {
        // Find income and expenses based on the category
        const income = await Income.find({ category: new RegExp(query, 'i'), userId: req.session.userId });
        const expense = await Expense.find({ category: new RegExp(query, 'i'), userId: req.session.userId });

        res.render('search-results', {
            title: `Search Results for "${query}"`,
            income,
            expense,
            query
        });
    } catch (err) {
        console.log(err);
        res.redirect('/home');
    }
});

module.exports = router;
