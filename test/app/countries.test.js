const chai = require('chai')
const { expect } = require('chai')
const chaiHttp = require('chai-http')
chai.use(chaiHttp)

const { appUrl, testEmail, testPassword, fingerprint } = require('../common')

describe('[APP:] COUNTRIES CONTROLLER', function () {
  let refreshToken = ''
  let accessToken = ''

  describe('/api/v1/countries', () => {
    it('it should return countries list', done => {
      chai.request(appUrl)
        .get('/api/v1/countries')
        .set('content-type', 'application/json')
        .end((err, res) => {
          expect(err).to.be.null
          expect(res.status).to.equal(200)
          expect(res.body.success).to.be.true
          expect(res.body.data).to.be.a('array')

          done()
        })
    })
  })
})