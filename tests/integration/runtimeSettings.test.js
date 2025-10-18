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

describe('Runtime Settings API', function () {
  this.timeout(60000)

  let serverProcess
  let adminToken

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

    const loginResponse = await axios.post(`${BASE_URL}/api/v1/auth/login`, {
      email: 'admin@susano.dev',
      password: 'NewSecurePass123!8',
      fingerprint: 'runtime-settings-integration'
    })

    expect(loginResponse.status).to.equal(200)
    adminToken = loginResponse.data?.data?.accessToken
    expect(adminToken).to.be.a('string').that.is.not.empty
  })

  after(async function () {
    if (!serverProcess) return
    if (serverProcess.exitCode !== null) return

    await new Promise(resolve => {
      serverProcess.once('close', resolve)
      serverProcess.kill('SIGTERM')
    })
  })

  it('returns published runtime settings for a client request', async function () {
    const response = await axios.get(`${BASE_URL}/api/v1/runtime-settings/current`, {
      params: {
        appVersion: '2.0.0',
        platform: 'ios'
      }
    })

    expect(response.status).to.equal(200)
    expect(response.data?.success).to.equal(true)
    expect(response.data?.data?.settings).to.be.an('object')
    expect(response.data?.data?.environment).to.be.a('string')
    expect(response.data?.data?.platform).to.equal('ios')
  })

  it('supports namespace filtering', async function () {
    const response = await axios.get(`${BASE_URL}/api/v1/runtime-settings/current`, {
      params: {
        appVersion: '2.0.0',
        platform: 'android',
        namespace: 'client_release'
      }
    })

    expect(response.status).to.equal(200)
    expect(response.data?.success).to.equal(true)
    const { settings } = response.data.data
    expect(settings).to.be.an('object')
    expect(Object.keys(settings)).to.satisfy(keys => keys.every(k => k === 'client_release'))
  })

  it('lists runtime settings for an authorized admin', async function () {
    const response = await axios.get(`${BASE_URL}/api/v1/runtime-settings`, {
      params: { limit: 5 },
      headers: {
        Authorization: `Bearer ${adminToken}`
      }
    })

    expect(response.status).to.equal(200)
    expect(response.data?.success).to.equal(true)
    expect(response.data?.data).to.be.an('array')
    expect(response.data?.meta).to.include.keys(['page', 'limit', 'total'])
  })

  it('allows admin to upsert runtime settings records', async function () {
    const uniqueKey = `integration_flag_${Date.now()}`
    const payload = {
      namespace: 'integration_flags',
      key: uniqueKey,
      value: { enabled: true, rollout: 'full' },
      status: 'published',
      priority: 25
    }

    const upsertResponse = await axios.post(`${BASE_URL}/api/v1/runtime-settings`, payload, {
      headers: {
        Authorization: `Bearer ${adminToken}`
      }
    })

    expect(upsertResponse.status).to.equal(200)
    expect(upsertResponse.data?.success).to.equal(true)
    expect(upsertResponse.data?.data).to.include({
      namespace: payload.namespace,
      key: payload.key,
      status: payload.status
    })
    expect(upsertResponse.data?.data?.value).to.deep.equal(payload.value)

    const listResponse = await axios.get(`${BASE_URL}/api/v1/runtime-settings`, {
      params: { namespace: payload.namespace, limit: 10 },
      headers: {
        Authorization: `Bearer ${adminToken}`
      }
    })

    const createdEntry = listResponse.data?.data?.find(item => item.key === uniqueKey)
    expect(createdEntry).to.exist
    expect(createdEntry.value).to.deep.equal(payload.value)
  })

  it('rejects invalid runtime setting payloads', async function () {
    try {
      await axios.post(`${BASE_URL}/api/v1/runtime-settings`, {
        namespace: 'integration_flags',
        key: 'invalid_payload',
        value: {}
      }, {
        headers: {
          Authorization: `Bearer ${adminToken}`
        }
      })
      throw new Error('Expected validation error for empty value')
    } catch (error) {
      expect(error.response).to.exist
      expect(error.response.status).to.equal(400)
      expect(error.response.data?.success).to.equal(false)
    }
  })
})
