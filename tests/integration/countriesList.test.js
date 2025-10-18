const { expect } = require('chai')
const axios = require('axios')
const { spawn } = require('child_process')
const path = require('path')

const TEST_PORT = process.env.TEST_APP_PORT || '4102'
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

describe('Countries API', function () {
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

  it('returns default country list with pagination meta', async function () {
    const response = await axios.get(`${BASE_URL}/api/v1/countries`)

    expect(response.status).to.equal(200)
    expect(response.data?.success).to.equal(true)
    expect(response.data?.data).to.be.an('array').that.is.not.empty
    expect(response.data?.meta?.pagination).to.include.keys(['page', 'limit', 'total', 'pages'])
  })

  it('supports search parameter', async function () {
    const response = await axios.get(`${BASE_URL}/api/v1/countries`, {
      params: { search: 'united', limit: 50 }
    })

    expect(response.status).to.equal(200)
    const names = response.data?.data?.map(country => `${country.name} ${country.nicename || ''}`.toLowerCase())
    expect(names).to.satisfy(list => list.every(name => name.includes('united')))
  })

  it('supports JSON filter parameter', async function () {
    const filter = encodeURIComponent(JSON.stringify({ region: 'asia' }))
    const response = await axios.get(`${BASE_URL}/api/v1/countries?filter=${filter}`)

    expect(response.status).to.equal(200)
    const countries = response.data?.data || []
    expect(countries.length).to.be.greaterThan(0)
    expect(countries.every(country => typeof country.iso === 'string')).to.equal(true)
  })

  it('supports bracket filter for ISO code', async function () {
    const response = await axios.get(`${BASE_URL}/api/v1/countries`, {
      params: { 'filter[iso]': 'US' }
    })

    expect(response.status).to.equal(200)
    expect(response.data?.data).to.have.lengthOf(1)
    expect(response.data?.data[0]?.iso).to.equal('US')
  })

  it('supports field selection with minimal format', async function () {
    const response = await axios.get(`${BASE_URL}/api/v1/countries`, {
      params: {
        fields: 'id,name,iso,phonecode',
        format: 'minimal'
      }
    })

    expect(response.status).to.equal(200)
    const country = response.data?.data?.[0]
    expect(country).to.be.an('object')
    expect(Object.keys(country)).to.have.members(['id', 'name', 'iso', 'phonecode'])
  })

  it('supports grouping by region', async function () {
    const response = await axios.get(`${BASE_URL}/api/v1/countries`, {
      params: {
        groupBy: 'region',
        format: 'minimal'
      }
    })

    expect(response.status).to.equal(200)
    const grouped = response.data?.data
    expect(grouped).to.be.an('object')
    const regions = Object.keys(grouped)
    expect(regions).to.include('Asia')
    expect(grouped['Asia']).to.be.an('array').that.is.not.empty
  })
})
