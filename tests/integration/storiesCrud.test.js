const { expect } = require('chai')
const axios = require('axios')
const { spawn } = require('child_process')
const path = require('path')

const TEST_PORT = process.env.TEST_APP_PORT || '4103'
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

describe('Stories API', function () {
  this.timeout(60000)

  let serverProcess
  let authHeaders = {}
  let createdStoryId = null
  let currentVersion = null
  let createdTitle = null

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
      fingerprint: 'integration-test-fp'
    })

    expect(loginResponse.status).to.equal(200)
    expect(loginResponse.data?.data?.accessToken).to.be.a('string')

    authHeaders = {
      Authorization: `Bearer ${loginResponse.data.data.accessToken}`,
      'Content-Type': 'application/json'
    }
  })

  after(async function () {
    if (!serverProcess) return
    if (serverProcess.exitCode !== null) return

    await new Promise(resolve => {
      serverProcess.once('close', resolve)
      serverProcess.kill('SIGTERM')
    })
  })

  it('creates a new story with minimal payload', async function () {
    createdTitle = `Integration Story ${Date.now()}`
    const response = await axios.post(`${BASE_URL}/api/v1/stories`, {
      title: createdTitle,
      details: 'This is an integration test story used to validate the API flow.',
      type: 'STORY',
      tags: ['integration-test']
    }, { headers: authHeaders })

    expect(response.status).to.equal(200)
    expect(response.data?.success).to.equal(true)
    expect(response.data?.data?.id).to.be.a('number')
    expect(response.data?.data?.title).to.equal(createdTitle)

    createdStoryId = response.data.data.id
    currentVersion = response.data.data.version

    expect(currentVersion).to.be.a('number')
    expect(currentVersion).to.be.greaterThan(0)
  })

  it('lists stories and includes the created story', async function () {
    const response = await axios.get(`${BASE_URL}/api/v1/stories`, {
      headers: authHeaders,
      params: {
        page: 1,
        limit: 20
      }
    })

    expect(response.status).to.equal(200)
    expect(response.data?.success).to.equal(true)
    expect(response.data?.data).to.be.an('array')

    const found = response.data.data.find(story => story.id === createdStoryId)
    expect(found).to.exist
    expect(found.title).to.equal(createdTitle)
  })

  it('retrieves the created story with related data', async function () {
    const response = await axios.get(`${BASE_URL}/api/v1/stories/${createdStoryId}`, {
      headers: authHeaders,
      params: {
        include: 'tags,owner'
      }
    })

    expect(response.status).to.equal(200)
    expect(response.data?.success).to.equal(true)
    expect(response.data?.data?.id).to.equal(createdStoryId)
    expect(response.data?.data?.tags).to.be.an('array')
    expect(response.data?.data?.owner).to.be.an('object')
  })

  it('updates the story using optimistic locking', async function () {
    const updatedTitle = `${createdTitle} - Updated`
    const response = await axios.patch(`${BASE_URL}/api/v1/stories/${createdStoryId}`, {
      title: updatedTitle,
      status: 'SUBMITTED',
      expectedVersion: currentVersion
    }, { headers: authHeaders })

    expect(response.status).to.equal(200)
    expect(response.data?.success).to.equal(true)
    expect(response.data?.data?.title).to.equal(updatedTitle)
    expect(response.data?.data?.status).to.equal('SUBMITTED')
    expect(response.data?.data?.version).to.equal(currentVersion + 1)

    createdTitle = updatedTitle
    currentVersion = response.data.data.version
  })

  it('soft deletes the story and prevents further access', async function () {
    const response = await axios.delete(`${BASE_URL}/api/v1/stories/${createdStoryId}`, {
      headers: authHeaders
    })

    expect(response.status).to.equal(200)
    expect(response.data?.success).to.equal(true)
    expect(response.data?.message).to.match(/Story .* was removed/)

    try {
      await axios.get(`${BASE_URL}/api/v1/stories/${createdStoryId}`, {
        headers: authHeaders,
        params: {
          include: 'tags'
        }
      })
      throw new Error('Expected request to fail for deleted story')
    } catch (error) {
      expect(error.response).to.exist
      expect(error.response.status).to.equal(404)
    }
  })
})
