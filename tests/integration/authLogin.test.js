const { expect } = require('chai')
const axios = require('axios')
const { spawn } = require('child_process')
const path = require('path')

const TEST_PORT = process.env.TEST_APP_PORT || '4101'
const TEST_HOST = 'localhost'
const BASE_URL = `http://${TEST_HOST}:${TEST_PORT}`

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

describe('Auth login API', function () {
  this.timeout(60000)

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
    if (serverProcess.exitCode !== null) return

    await new Promise(resolve => {
      serverProcess.once('close', resolve)
      serverProcess.kill('SIGTERM')
    })
  })

  it('returns access and refresh tokens for valid credentials', async function () {
    const response = await axios.post(`${BASE_URL}/api/v1/auth/login`, {
      email: 'admin@susano.dev',
      password: 'NewSecurePass123!8',
      fingerprint: '123-123-1212312312323'
    })

    expect(response.status).to.equal(200)
    expect(response.data?.success).to.equal(true)
    expect(response.data?.data?.accessToken).to.be.a('string').that.is.not.empty
    expect(response.data?.data?.refreshToken).to.be.a('string').that.is.not.empty
    expect(response.data?.data?.sessionId).to.be.a('number')
  })

  it('rejects invalid login credentials', async function () {
    try {
      await axios.post(`${BASE_URL}/api/v1/auth/login`, {
        email: 'admin@susano.dev',
        password: 'WrongPass!23',
        fingerprint: '123-123-1212312312323'
      })
      throw new Error('Expected login to fail with invalid credentials')
    } catch (error) {
      expect(error.response).to.exist
      expect(error.response.status).to.equal(403)
      expect(error.response.data?.success).to.equal(false)
      expect(error.response.data?.code).to.be.oneOf(['AUTHENTICATION_ERROR', 'INVALID_PASSWORD_ERROR'])
    }
  })
})
