// test/auth.test.js

const chai = require('chai');
const chaiHttp = require('chai-http');
const mongoose = require('mongoose');
const app = require('../app');  // your Express app export
const User = require('../models/user.model');

const expect = chai.expect;
chai.use(chaiHttp);

describe('Auth API Tests', function () {
  before(async function () {
    if (mongoose.connection.readyState !== 1) {
      await new Promise(resolve => mongoose.connection.once('open', resolve));
    }
  });

 after(async function () {
    await mongoose.connection.close();
  });

  beforeEach(async function () {
    // Clean Users before each test to avoid duplicates
    await User.deleteMany({});
  });

  describe('POST /register', function () {
    it('should register a new user', function (done) {
      chai
        .request(app)
        .post('/register')
        .type('form')
        .send({ username: 'testuser@example.com', password: 'TestPass123' })
        .end((err, res) => {
          expect(err).to.be.null;
          expect(res).to.have.status(200);
          expect(res).to.redirectTo(/\/login$/); // Should redirect to login after register
          done();
        });
    });

    it('should not register with missing fields', function (done) {
      chai
        .request(app)
        .post('/register')
        .type('form')
        .send({ username: '' }) // missing password
        .end((err, res) => {
          expect(res).to.have.status(200);
          expect(res).to.redirectTo(/\/register$/); // Redirect back on error
          done();
        });
    });
  });

  describe('POST /login', function () {
    beforeEach(async function () {
      // Create a user for login tests
      const newUser = new User({ username: 'loginuser@example.com', password: 'MyPass123' });
      await newUser.save();
    });

    it('should login with valid credentials', function (done) {
      chai
        .request(app)
        .post('/login')
        .type('form')
        .send({ username: 'loginuser@example.com', password: 'MyPass123' })
        .end((err, res) => {
          expect(err).to.be.null;
          expect(res).to.have.status(200);
          expect(res).to.redirectTo(/\/home$/); // Redirect on success
          done();
        });
    });

    it('should fail login with wrong password', function (done) {
      chai
        .request(app)
        .post('/login')
        .type('form')
        .send({ username: 'loginuser@example.com', password: 'WrongPass' })
        .end((err, res) => {
          expect(res).to.have.status(200);
          expect(res).to.redirectTo(/\/login$/); // Redirect back on failure
          done();
        });
    });

    it('should fail login with non-existent user', function (done) {
      chai
        .request(app)
        .post('/login')
        .type('form')
        .send({ username: 'nonexistent@example.com', password: 'anyPass' })
        .end((err, res) => {
          expect(res).to.have.status(200);
          expect(res).to.redirectTo(/\/login$/);
          done();
        });
    });
  });

  describe('GET /logout', function () {
    it('should logout and redirect to login', function (done) {
      chai
        .request(app)
        .get('/logout')
        .end((err, res) => {
          expect(res).to.have.status(200);
          expect(res).to.redirectTo(/\/login$/);
          done();
        });
    });
  });
});
