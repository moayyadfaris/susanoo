const os = require('os')
const BaseHandler = require('handlers/BaseHandler')
const config = require('config')
const pkg = require('../../../../package.json')
const { RequestRule, Rule } = require('backend-core')

function formatDuration(seconds) {
  const units = [
    { label: 'day', value: 86400 },
    { label: 'hour', value: 3600 },
    { label: 'minute', value: 60 },
    { label: 'second', value: 1 }
  ]

  const parts = []
  let remaining = seconds

  for (const unit of units) {
    if (remaining >= unit.value) {
      const amount = Math.floor(remaining / unit.value)
      parts.push(`${amount} ${unit.label}${amount !== 1 ? 's' : ''}`)
      remaining %= unit.value
    }
  }

  return parts.length > 0 ? parts.join(', ') : '0 seconds'
}

class GetServiceOverviewHandler extends BaseHandler {
  static get accessTag() {
    return 'root:overview'
  }

  static get validationRules() {
    return {
      query: {
        includeMetrics: new RequestRule(new Rule({
          validator: (value) => value === undefined || value === 'true' || value === 'false',
          description: 'boolean; include runtime metrics when set to true'
        }))
      }
    }
  }

  static async run(ctx) {
    const appConfig = config.app || {}
    const uptimeSeconds = Math.floor(process.uptime())

    const serviceInfo = {
      name: appConfig.name || pkg.name || 'Susanoo API',
      description: appConfig.desc || pkg.description || 'Susanoo API Gateway',
      version: pkg.version,
      environment: appConfig.nodeEnv || process.env.NODE_ENV || 'development',
      commit: process.env.GIT_COMMIT || null,
      buildNumber: process.env.BITBUCKET_BUILD_NUMBER || null,
      uptime: {
        seconds: uptimeSeconds,
        humanReadable: formatDuration(uptimeSeconds),
        startedAt: new Date(Date.now() - uptimeSeconds * 1000).toISOString()
      }
    }

    const runtimeInfo = {
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      hostname: os.hostname(),
      memoryUsage: {
        rssMB: Number((process.memoryUsage().rss / (1024 * 1024)).toFixed(2)),
        heapUsedMB: Number((process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(2)),
        heapTotalMB: Number((process.memoryUsage().heapTotal / (1024 * 1024)).toFixed(2))
      }
    }

    const requestMeta = {
      requestId: ctx.requestId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      receivedAt: new Date().toISOString()
    }

    const data = {
      service: serviceInfo,
      runtime: runtimeInfo,
      request: requestMeta
    }

    if (ctx.query.includeMetrics === 'true') {
      data.metrics = {
        loadAverage: os.loadavg(),
        cpuUsage: process.cpuUsage()
      }
    }

    return this.success(
      data,
      'Service overview retrieved successfully'
    )
  }
}

module.exports = GetServiceOverviewHandler
