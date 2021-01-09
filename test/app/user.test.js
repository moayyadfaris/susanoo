const chai = require('chai')
const { expect } = require('chai')
const chaiHttp = require('chai-http')
chai.use(chaiHttp)

const { appUrl, testEmail, testPassword, fingerprint } = require('../common')

describe('[APP:] USERS CONTROLLER', function () {
  let refreshToken = ''
  let accessToken = ''
  let userId = ''

  describe('[POST] /api/v1/auth/login', () => {
    it('it should return access/refresh tokens', done => {
      chai.request(appUrl)
        .post('/api/v1/auth/login')
        .set('content-type', 'application/json')
        .send({ password: testPassword, email_or_mobile_number: testEmail, fingerprint })
        .end((err, res) => {
          expect(err).to.be.null
          expect(res.status).to.equal(200)
          expect(res.body.success).to.be.true
          expect(res.body.data).to.be.a('object')
          expect(res.body.data.accessToken).to.be.a('string').that.is.not.empty
          expect(res.body.data.refreshToken).to.be.a('string').that.is.not.empty

          refreshToken = res.body.data.refreshToken
          accessToken = res.body.data.accessToken
          done()
        })
    })
  })

  describe('[APP:] /api/v1/users/current', () => {
    it('it should return user profile', done => {
      chai.request(appUrl)
        .get('/api/v1/users/current')
        .set('content-type', 'application/json')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ refreshToken, fingerprint })
        .end((err, res) => {
          expect(err).to.be.null
          expect(res.status).to.equal(200)
          expect(res.body.success).to.be.true
          expect(res.body.data).to.be.a('object')

          userId = res.body.data.id

          done()
        })
    })
  })

  describe('[APP:] /api/v1/users/current/profile', () => {
    it('it should return user profile full data', done => {
      chai.request(appUrl)
        .get('/api/v1/users/current/profile')
        .set('content-type', 'application/json')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ refreshToken, fingerprint })
        .end((err, res) => {
          expect(err).to.be.null
          expect(res.status).to.equal(200)
          expect(res.body.success).to.be.true
          expect(res.body.data).to.be.a('object')
          done()
        })
    })
  })

  describe('[APP:] /api/v1/users/' + userId, () => {
    it('it should return user profile', done => {
      chai.request(appUrl)
        .get('/api/v1/users/' + userId)
        .set('content-type', 'application/json')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ refreshToken, fingerprint })
        .end((err, res) => {
          expect(err).to.be.null
          expect(res.status).to.equal(200)
          expect(res.body.success).to.be.true
          expect(res.body.data).to.be.a('object')
          done()
        })
    })
  })


})