const EmailClient = require('./EmailSMTPClient')
const SMSClient = require('./SMSClient')
const RedisClient = require('./RedisClient')
const S3Client = require('./S3Client')
const SlackClient = require('./SlackClient')
const QueueClient = require('./QueueClient')
const IpLookupClient = require('./IpLookupClient')

module.exports = {
  EmailClient,
  RedisClient,
  S3Client,
  SMSClient,
  SlackClient,
  QueueClient,
  IpLookupClient
}
