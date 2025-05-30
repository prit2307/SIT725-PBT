// config/nodemailer.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'jenishhun7@gmail.com', // Your email
        pass: 'rllr vesp fcmc vubu'   // Your email password
    }
});

module.exports = transporter;