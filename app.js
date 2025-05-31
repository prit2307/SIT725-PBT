const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const expressLayouts = require('express-ejs-layouts');

// Import Routes
const authRoutes = require('./SIT725-PBT/models/routes/auth.routes');
const goalRoutes = require('./SIT725-PBT/models/routes/goal.routes');
const reportRoutes = require('./SIT725-PBT/models/routes/report.routes');
const dashboardRoutes = require('./SIT725-PBT/models/routes/dashboard.routes');

// Initialize app
const app = express();



// Connect to MongoDB
mongoose.connect('mongodb+srv://jigishpatel30:BrArWEstq6FaE9j6@cluster0.6jxvjzr.mongodb.net/', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.log(err));

// Set up EJS
app.set('view engine', 'ejs');
app.set('layout', 'layout');  // Set layout to 'layout.ejs' (global layout file)
app.use(expressLayouts);

// Middleware
app.use(express.static('public')); // Serve static files
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded data

// Session Setup
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: 'mongodb+srv://jigishpatel30:BrArWEstq6FaE9j6@cluster0.6jxvjzr.mongodb.net/' })
}));

// Middleware to set the user globally for all views
app.use(async (req, res, next) => {
    if (req.session.userId) {
        const User = require('./models/user.model');
        try {
            const user = await User.findById(req.session.userId);
            res.locals.user = user;  // Set user object in locals for all views
        } catch (err) {
            console.log(err);
        }
    } else {
        res.locals.user = null; // If no user, set to null
    }
    next(); // Continue to the next middleware or route
});

// Routes
app.use(authRoutes);
app.use(goalRoutes);
app.use(reportRoutes);
app.use(dashboardRoutes);
// Home route
app.get('/home', async (req, res) => {
    if (req.session.userId) {
        const User = require('./models/user.model');
        try {
            const user = await User.findById(req.session.userId);
            res.render('home', { title: 'Home - Personal Budget Tracker', user });
        } catch (err) {
            console.log(err);
            res.redirect('/login');
        }
    } else {
        res.redirect('/login');
    }
});

// Default route to redirect to login if not logged in
app.get('/', (req, res) => {
    if (req.session.userId) {
        res.redirect('/home');
    } else {
        res.redirect('/login');
    }
});

// Start server
app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
