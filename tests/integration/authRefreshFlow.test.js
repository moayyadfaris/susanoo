const { expect } = require('chai')
const axios = require('axios')
const { spawn } = require('child_process')
const path = require('path')

const TEST_PORT = process.env.TEST_APP_PORT || '4100'
const TEST_HOST = 'localhost'
const BASE_URL = `http://${TEST_HOST}:${TEST_PORT}`
const FINGERPRINT = '123-123-1212312312323'

function waitForServerReady(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Server did not start within expected time'))
    }, 60000)

    let stdoutBuffer = ''
    let stderrBuffer = ''

    const onData = buffer => {
      const message = buffer.toString()
      stdoutBuffer += message
      if (message.includes('Server started successfully')) {
        clearTimeout(timeout)
        child.stdout.off('data', onData)
        child.stderr.off('data', onErrorData)
        resolve()
      }
    }

    const onErrorData = buffer => {
      stderrBuffer += buffer.toString()
    }

    child.once('error', error => {
      clearTimeout(timeout)
      child.stdout.off('data', onData)
      child.stderr.off('data', onErrorData)
      reject(error)
    })

    child.once('exit', code => {
      clearTimeout(timeout)
      child.stdout.off('data', onData)
      child.stderr.off('data', onErrorData)
      if (code !== 0) {
        reject(new Error(`Server exited prematurely with code ${code}\nstdout:\n${stdoutBuffer}\nstderr:\n${stderrBuffer}`))
      }
    })

    child.stdout.on('data', onData)
    child.stderr.on('data', onErrorData)
  })
}

describe('Auth refresh flow integration', function () {
  this.timeout(120000)

  let serverProcess

  before(async function () {
    const mainPath = path.join(__dirname, '..', '..', 'main.js')
    serverProcess = spawn('node', [mainPath], {
      env: {
        ...process.env,
        NODE_ENV: process.env.NODE_ENV || 'development',
        APP_PORT: TEST_PORT,
        APP_HOST: TEST_HOST,
        NODE_PATH: path.join(__dirname, '..', '..')
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    await waitForServerReady(serverProcess)
  })

  after(async function () {
    if (!serverProcess) return
    if (serverProcess.exitCode !== null) {
      return
    }
    await new Promise(resolve => {
      serverProcess.once('close', resolve)
      serverProcess.kill('SIGTERM')
    })
  })

  it('invalidates old access token after refresh', async function () {
    const loginResponse = await axios.post(`${BASE_URL}/api/v1/auth/login`, {
      email: 'admin@susano.dev',
      password: 'NewSecurePass123!8',
      fingerprint: FINGERPRINT
    })

    const initialAccessToken = loginResponse.data?.data?.accessToken
    const initialRefreshToken = loginResponse.data?.data?.refreshToken

    expect(initialAccessToken, 'login should return access token').to.be.a('string').that.is.not.empty
    expect(initialRefreshToken, 'login should return refresh token').to.be.a('string').that.is.not.empty
    const refreshResponse = await axios.post(
      `${BASE_URL}/api/v1/auth/refresh-tokens`,
      {
        refreshToken: initialRefreshToken,
        fingerprint: FINGERPRINT
      },
      {
        headers: {
          Authorization: `Bearer ${initialAccessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )

    expect(refreshResponse.data?.success).to.equal(true)
    const rotatedAccessToken = refreshResponse.data?.data?.accessToken
    const rotatedRefreshToken = refreshResponse.data?.data?.refreshToken


    expect(rotatedAccessToken).to.be.a('string').that.is.not.empty
    expect(rotatedRefreshToken).to.be.a('string').that.is.not.equal(initialRefreshToken)

    try {
      await axios.get(`${BASE_URL}/api/v1/countries`, {
        headers: {
          Authorization: `Bearer ${initialAccessToken}`
        }
      })
      throw new Error('Expected old access token to be rejected')
    } catch (error) {
      expect(error.response, 'countries request should fail with old token').to.exist
      expect(error.response.status).to.be.within(400, 499)
      expect(error.response.data?.success).to.equal(false)
    }

    const newTokenResponse = await axios.get(`${BASE_URL}/api/v1/countries`, {
      headers: {
        Authorization: `Bearer ${rotatedAccessToken}`
      }
    })

    expect(newTokenResponse.status).to.equal(200)
    expect(newTokenResponse.data).to.have.property('data').that.is.an('array').that.is.not.empty
  })
})
