const { EmailClient, SMSClient, SlackClient, RedisClient, QueueClient, IpLookupClient } = require('../clients')
const config = require(__folders.config)
const logger = require('../util/logger')

class RootProvider {
  constructor () {
    this.redisClient = new RedisClient({
      host: config.redis.host,
      port: config.redis.port,
      logger
    })

    this.notificationClient = new QueueClient({
      name: 'notifications',
      url: config.queue.redisUrl,
      logger
    })

    // this.s3Client = new S3Client({
    //   access: config.s3.access,
    //   secret: config.s3.secret,
    //   bucket: config.s3.bucket,
    // })

    this.slackClient = new SlackClient({
      url: config.slack.url,
      icon: config.slack.icon,
      logger
    })

    this.smsClient = new SMSClient({
      accountSid: config.sms.twilioAccountSid,
      authToken: config.sms.twilioAuthToken,
      from: config.sms.from,
      logger
    })

    // Loading Mailgun
    // this.emailClient = new EmailClient({
    //   apiKey: config.email.mailgunApiKey,
    //   domain: config.email.mailgunDomain,
    //   host: config.email.mailgunHost,
    //   from: config.email.from
    // })

    // Loading SMTP Client
    this.emailClient = new EmailClient({
      username: config.email.username,
      password: config.email.password,
      host: config.email.host,
      port: config.email.port,
      from: config.email.from,
      logger
    })

    this.ipLookupClient = new IpLookupClient({
      baseUrl: config.ipLookup.baseUrl,
      accessToken: config.ipLookup.accessToken
    })
  }
  async init () {
    logger.debug(`${this.constructor.name} initialized...`)
  }
}

module.exports = new RootProvider()
