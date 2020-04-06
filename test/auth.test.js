const chai = require('chai')
const { expect } = require('chai')
const chaiHttp = require('chai-http')
chai.use(chaiHttp)

const { host, port } = require('../config').app
console.log(host)
describe('AUTH CONTROLLER', function () {
  this.slow(0)
  const appUrl = `${host}:${port}`
  const fingerprint = 'random-random-random'
  let refreshToken = ''
  let accessToken = ''

  describe('[POST] api/v1/auth/login', () => {
    it('it should return access/refresh tokens', done => {
      chai.request(appUrl)
        .post('/api/v1/auth/login')
        .send({ password: 'Admin@123', email_or_mobile_number: 'moayyad@startappz.com', fingerprint })
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

  describe('[POST] /api/v1/auth/refresh-tokens', () => {
    it('it should return refreshed access/refresh tokens', done => {
      chai.request(appUrl)
        .post('/api/v1/auth/refresh-tokens')
        .send({ refreshToken, fingerprint })
        .end((err, res) => {
          expect(err).to.be.null
          expect(res.status).to.equal(200)
          expect(res.body.success).to.be.true
          expect(res.body.data).to.be.a('object')
          expect(res.body.data.accessToken).to.be.a('string').that.is.not.empty
          expect(res.body.data.refreshToken).to.be.a('string').that.is.not.empty

          refreshToken = res.body.data.refreshToken
          done()
        })
    })
  })

  describe('[POST] /api/v1/auth/logout', () => {
    it('it should return success message', done => {
      chai.request(appUrl)
        .post('/api/v1/auth/logout')
        .set('authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .end((err, res) => {
          expect(err).to.be.null
          expect(res.status).to.equal(200)
          expect(res.body.success).to.be.true
          expect(res.body.message).to.be.a('string').that.is.not.empty
          done()
        })
    })
  })
})