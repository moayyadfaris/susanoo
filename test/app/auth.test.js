const chai = require('chai')
const { expect } = require('chai')
const chaiHttp = require('chai-http')
chai.use(chaiHttp)

const { appUrl, testEmail, testPassword, fingerprint } = require('../common')

describe('[APP:] AUTH CONTROLLER', function () {
  let refreshToken = ''
  let accessToken = ''

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

    it('it should return 404 when user not exists', done => {
      chai.request(appUrl)
        .post('/api/v1/auth/login')
        .set('content-type', 'application/json')
        .send({ password: testPassword, email_or_mobile_number: "fake@susano.dev", fingerprint })
        .end((err, res) => {
          expect(err).to.be.null
          expect(res.status).to.equal(404)
          expect(res.body.success).to.be.false
          expect(res.body.data).to.be.null

          done()
        })
    })
  })

  describe('[APP:][POST] /api/v1/auth/refresh-tokens', () => {
    it('it should return refreshed access/refresh tokens', done => {
      chai.request(appUrl)
        .post('/api/v1/auth/refresh-tokens')
        .set('content-type', 'application/json')
        .send({ refreshToken, fingerprint })
        .end((err, res) => {
          expect(err).to.be.null
          expect(res.status).to.equal(200)
          expect(res.body.success).to.be.true
          expect(res.body.data).to.be.a('object')
          expect(res.body.data.accessToken).to.be.a('string').that.is.not.empty
          expect(res.body.data.refreshToken).to.be.a('string').that.is.not.empty

          accessToken = res.body.data.accessToken
          refreshToken = res.body.data.refreshToken
          done()
        })
    })
  })

  describe('[APP:][POST] /api/v1/auth/logout', () => {
    it('it should return success message', done => {
      chai.request(appUrl)
        .post('/api/v1/auth/logout')
        .set('content-type', 'application/json')
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