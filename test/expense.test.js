const chai = require('chai');
const chaiHttp = require('chai-http');
const mongoose = require('mongoose');
const app = require('../app');
const Expense = require('../models/expense.model');
const Goal = require('../models/goal.model');
const User = require('../models/user.model');

const expect = chai.expect;
chai.use(chaiHttp);

describe('Expense Routes', function () {
  let testUser;
  let agent;

  before(async function () {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect('mongodb+srv://jigishpatel30:BrArWEstq6FaE9j6@cluster0.6jxvjzr.mongodb.net/', {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
    }
  });

  after(async function () {
    await mongoose.connection.close();
  });

  beforeEach(async function () {
    await User.deleteMany({});
    await Expense.deleteMany({});
    await Goal.deleteMany({});

    testUser = new User({
      username: 'expenseuser@example.com',
      password: 'TestPass123',
    });
    await testUser.save();

    agent = chai.request.agent(app);

    await agent
      .post('/login')
      .type('form')
      .send({ username: testUser.username, password: 'TestPass123' });
  });

  afterEach(function () {
    agent.close();
  });

  it('GET /add-expense should render add-expense page', function (done) {
    agent
      .get('/add-expense')
      .end((err, res) => {
        expect(res).to.have.status(200);
        expect(res.text).to.include('Add Expense');
        done();
      });
  });

  it('POST /add-expense should add expense and redirect to /view-expense', function (done) {
    agent
      .post('/add-expense')
      .type('form')
      .send({
        amount: 50,
        category: 'Food',
        date: '2025-05-15',
        recurring: 'on'
      })
      .end((err, res) => {
        expect(res).to.have.status(200);
        expect(res).to.redirectTo(/\/view-expense$/);
        done();
      });
  });

  it('GET /view-expense should display expenses for user', async function () {
    const expense = new Expense({
      amount: 75,
      category: 'Transport',
      date: new Date(),
      user: testUser._id,
      recurring: false
    });
    await expense.save();

    const res = await agent.get('/view-expense');
    expect(res).to.have.status(200);
    expect(res.text).to.include('View Expense');
    expect(res.text).to.include('Transport');
  });
});
