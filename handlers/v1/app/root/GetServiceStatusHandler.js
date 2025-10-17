const os = require('os')
const BaseHandler = require('handlers/BaseHandler')
const RootProvider = require('handlers/RootProvider')

class GetServiceStatusHandler extends BaseHandler {
  static get accessTag() {
    return 'root:status'
  }

  static async run() {
    const dependencies = {
      redis: await this.checkRedisHealth(),
      queue: this.checkQueueHealth(),
      email: this.checkGenericClient(RootProvider.emailClient, 'EmailClient'),
      sms: this.checkGenericClient(RootProvider.smsClient, 'SMSClient'),
      slack: this.checkGenericClient(RootProvider.slackClient, 'SlackClient'),
      ipLookup: this.checkGenericClient(RootProvider.ipLookupClient, 'IpLookupClient')
    }

    const dependencyStatuses = Object.values(dependencies).map(dep => dep.status)
    const isHealthy = dependencyStatuses.every(status => status === 'healthy' || status === 'available' || status === 'not_configured')

    const memoryUsage = process.memoryUsage()
    const loadAverage = os.loadavg()
    const cpuUsage = process.cpuUsage()
    const uptimeSeconds = Math.floor(process.uptime())

    const metrics = {
      uptimeSeconds,
      loadAverage,
      cpuUsage,
      memory: {
        rssMB: Number((memoryUsage.rss / (1024 * 1024)).toFixed(2)),
        heapUsedMB: Number((memoryUsage.heapUsed / (1024 * 1024)).toFixed(2)),
        heapTotalMB: Number((memoryUsage.heapTotal / (1024 * 1024)).toFixed(2)),
        externalMB: Number((memoryUsage.external / (1024 * 1024)).toFixed(2))
      }
    }

    return this.success({
      status: isHealthy ? 'healthy' : 'degraded',
      checkedAt: new Date().toISOString(),
      dependencies,
      metrics
    }, 'Service status retrieved successfully')
  }

  static async checkRedisHealth() {
    if (!RootProvider.redisClient) {
      return {
        status: 'not_configured',
        details: 'Redis client is not configured'
      }
    }

    try {
      const health = await RootProvider.redisClient.healthCheck()
      const durationMs = health?.responseTime ? parseFloat(String(health.responseTime).replace('ms', '')) : null
      return {
        status: health?.status === 'healthy' ? 'healthy' : 'degraded',
        latencyMs: durationMs,
        lastCheckedAt: new Date().toISOString()
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        lastCheckedAt: new Date().toISOString()
      }
    }
  }

  static checkQueueHealth() {
    if (!RootProvider.notificationClient) {
      return {
        status: 'not_configured',
        details: 'Notification queue client not configured'
      }
    }

    return {
      status: 'available',
      queue: 'notifications'
    }
  }

  static checkGenericClient(client, name) {
    if (!client) {
      return {
        status: 'not_configured',
        details: `${name} is not configured`
      }
    }

    return {
      status: 'healthy',
      client: name
    }
  }
}

module.exports = GetServiceStatusHandler
