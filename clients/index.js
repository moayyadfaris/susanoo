const EmailClient = require('./EmailSMTPClient')
const SMSClient = require('./SMSClient')
const RedisClient = require('./RedisClient')
const S3Client = require('./S3Client')
const SlackClient = require('./SlackClient')
const QueueClient = require('./QueueClient')

module.exports = {
  EmailClient,
  RedisClient,
  S3Client,
  SMSClient,
  SlackClient,
  QueueClient
}
