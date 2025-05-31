const chai = require('chai');
const chaiHttp = require('chai-http');
const mongoose = require('mongoose');
const app = require('../app');
const Income = require('../models/income.model');
const Goal = require('../models/goal.model');
const User = require('../models/user.model');

const expect = chai.expect;
chai.use(chaiHttp);

describe('Income Routes', function () {
  let testUser;
  let agent;

  before(async function () {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect('mongodb+srv://meetlakhani98787:WufgV1jhPHnW44bd@cluster0.pkbtp7p.mongodb.net/', {
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
    await Income.deleteMany({});
    await Goal.deleteMany({});

    testUser = new User({
      username: 'incomeuser@example.com',
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

  it('GET /add-income should render add-income page with message if any', function (done) {
    agent
      .get('/add-income')
      .end((err, res) => {
        expect(res).to.have.status(200);
        expect(res.text).to.include('Add Income');
        done();
      });
  });

  it('POST /add-income should add income and redirect to /view-income', function (done) {
    agent
      .post('/add-income')
      .type('form')
      .send({
        amount: 1000,
        category: 'Salary',
        date: '2025-05-15',
      })
      .end((err, res) => {
        expect(res).to.have.status(200);
        expect(res).to.redirectTo(/\/view-income$/);
        done();
      });
  });

  it('GET /view-income should display user incomes', async function () {
    const income = new Income({
      amount: 200,
      category: 'Freelance',
      date: new Date(),
      user: testUser._id,
    });
    await income.save();

    const res = await agent.get('/view-income');
    expect(res).to.have.status(200);
    expect(res.text).to.include('View Income');
    expect(res.text).to.include('Freelance');
  });
});
