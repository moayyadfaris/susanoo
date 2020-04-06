const app = require('./app')
const knex = require('./knex')
const folders = require('./folders')
const token = require('./token')
const roles = require('./roles')
const email = require('./email')
const s3 = require('./s3')
const sms = require('./sms')
const otp = require('./otp')
const slack = require('./slack')
const redis = require('./redis')
const queue = require('./queue')
const rateLimting = require('./rateLimiting')
const swagger = require('./swagger')
const storyType = require('./storyType')
const storyStatus = require('./storyStatus')
const userConfig = require('./user')
const story = require('./story')
const notificationType = require('./notificationType')
const cache = require('./cache')

const asyncConfigs = [
  app,
  knex,
  token,
  email,
  s3
]

function mainInit () {
  return new Promise(async (resolve, reject) => {
    for (const config of asyncConfigs) {
      try {
        await config.init()
      } catch (e) {
        return reject(e)
      }
    }
    resolve()
  })
}

module.exports = {
  app,
  knex,
  folders,
  token,
  roles,
  email,
  s3,
  sms,
  otp,
  slack,
  redis,
  queue,
  rateLimting,
  storyType,
  swagger,
  storyStatus,
  userConfig,
  story,
  notificationType,
  mainInit,
  cache
}
