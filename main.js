require('dotenv').config()
require('./globals')()

const { Model } = require('objection')
const Knex = require('knex')
const stdout = require('stdout-stream')
const chalk = require('chalk')

const { Server, assert } = require('backend-core')
const controllers = require('./controllers')
const config = require('./config')
const middlewares = require('./middlewares')
const errorMiddleware = require('./middlewares/errorMiddleware')
const logger = require('./util/logger')

config.mainInit().then(() => {
  return new Server({
    port: Number(config.app.port),
    host: config.app.host,
    controllers,
    middlewares,
    errorMiddleware,
    cookieSecret: config.app.cookieSecret,
    logger
  })
})
  .then(serverParams => {
    logger.info('Server initialized...', serverParams)
    logger.debug('--- APP CONFIG ---')
    logger.debug(`HOST: ${config.app.host}`)
    logger.debug(`PORT: ${config.app.port}`)
    logger.debug(`NAME: ${config.app.name}`)
    logger.debug('--- TOKENS CONFIGS ---')
    logger.debug('REFRESH:', config.token.refresh)
    logger.debug('ACCESS:', config.token.access.toString())
    logger.debug('RESET PASSWORD:', config.token.resetPassword.toString())
    logger.debug('EMAIL CONFIRM:', config.token.emailConfirm.toString())
    logger.debug(`ISSUER: ${config.token.jwtIss}`)
  }).catch(error => {
    stdout.write(chalk.blue(error.stack))
    logger.error('Server fails to initialize...', error)
  })
  .then(() => Model.knex(Knex(config.knex)))
  .then(() => testDbConnection(Knex(config.knex)))
  .then(() => require('./consumers/'))
  .then(() => {
    logger.debug('Database initialized...')
    logger.debug('--- SQL DATABASE CONFIG ---')
    logger.debug(`CLIENT: ${config.knex.client}`)
    logger.debug(`USER: ${config.knex.connection.user}`)
    logger.debug(`HOST: ${config.knex.connection.host}`)
    logger.debug(`PORT: ${config.knex.connection.port}`)
    logger.debug(`DATABASE: ${config.knex.connection.database}`)
  }).catch(error => {
    stdout.write(chalk.blue(error.stack))
    logger.error('Database fails to initialize...', error)
    process.exit(1)
  })

async function testDbConnection (knexInstance) {
  assert.func(knexInstance, { required: true })
  assert.func(knexInstance.raw, { required: true })

  try {
    await knexInstance.raw('select 1+1 as result')
  } catch (e) {
    throw e
  } finally {
    knexInstance.destroy()
  }
}
