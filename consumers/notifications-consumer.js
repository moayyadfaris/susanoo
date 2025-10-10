require('../globals')()
const config = require('../config')
const { slackClient, emailClient, smsClient } = require('handlers/RootProvider')
const ResetPasswordSlack = require('notifications/ResetPasswordSlack')
const ResetPasswordEmail = require('notifications/ResetPasswordEmail')
const ResetPasswordSMS = require('notifications/ResetPasswordSMS')
const ConfirmSlack = require('notifications/ConfirmSlack')
const ConfirmSMS = require('notifications/ConfirmSMS')
const WelcomeEmail = require('notifications/WelcomeEmail')
const ChangeEmailSlack = require('notifications/ChangeEmailSlack')
const ChangeEmailEmail = require('notifications/ChangeEmailEmail')
const ChangeMobileSlack = require('notifications/ChangeMobileSlack')
const ResetPasswordEmailAdmin = require('notifications/ResetPasswordEmailAdmin')
const Queue = require('bull')
const { notificationType } = require('config')
var queue = new Queue('notifications', config.queue.redisUrl)

queue.process(1, function (job, done) {
  // job.data contains the custom data passed when the job was created
  // job.id contains id of this job.
  switch (job.data.type) {
    case notificationType.resetPasswordSMS:
      slackClient.send(new ResetPasswordSlack({ to: job.data.to, code: job.data.code, name: job.data.name }))
      smsClient.send(new ResetPasswordSMS({ to: job.data.to, code: job.data.code, name: job.data.name }))
      break
    case notificationType.resetPasswordEmail:
      slackClient.send(new ResetPasswordSlack({ to: job.data.to, code: job.data.code, name: job.data.name }))
      emailClient.send(new ResetPasswordEmail({ to: job.data.to, code: job.data.code, name: job.data.name, lang: job.data.lang }))
      break
    case notificationType.resetPasswordEmailAdmin:
      // slackClient.send(new ResetPasswordSlack({ to: job.data.to, token: job.data.code, name: job.data.name }))
      emailClient.send(new ResetPasswordEmailAdmin({ to: job.data.to, token: job.data.token, name: job.data.name }))
      break
    case notificationType.createUser:
      slackClient.send(new ConfirmSlack({ to: job.data.to, code: job.data.code }))
      smsClient.send(new ConfirmSMS({ to: job.data.to, code: job.data.code }))
      emailClient.send(new WelcomeEmail({
        to: job.data.email,
        name: job.data.name,
        code: job.data.code,
        lang: job.data.lang
      }))
      // logger.info('Registration OTP, delivered', { to: user.email, ...result, ctx: this.name })
      break
    case notificationType.changeEmail:
      slackClient.send(new ChangeEmailSlack({ to: job.data.to, code: job.data.code }))
      emailClient.send(new ChangeEmailEmail({ to: job.data.to, code: job.data.code }))
      break
    case notificationType.changeMobileNumber:
      slackClient.send(new ChangeMobileSlack({ to: job.data.to, code: job.data.code }))
      break
    default:
      // code block
  }
  console.log(' [x] Received %s', job.id)
  done()
})
