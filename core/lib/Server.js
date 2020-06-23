const express = require('express')
const path = require('path')
// const favicon = require('serve-favicon')
const morganLogger = require('morgan')
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')
const compression = require('compression')
const helmet = require('helmet')

const { Assert: assert } = require('./assert')
const { BaseMiddleware } = require('./BaseMiddleware')
const { AbstractLogger } = require('./AbstractLogger')

const swaggerUi = require('swagger-ui-express')
const swaggerDocument = require('../../public/docs/swagger.json')
const swStats = require('swagger-stats')
const swaggerConfig = require('../../config/swagger')

class Server {
  constructor ({ port, host, controllers, middlewares, errorMiddleware, cookieSecret, logger }) {
    assert.integer(port, { required: true, positive: true })
    assert.string(host, { required: true, notEmpty: true })
    assert.object(controllers, { required: true, notEmpty: true, message: 'controllers param expects not empty array' })
    assert.array(middlewares, { required: true, notEmpty: true, message: 'middlewares param expects not empty array' })
    assert.instanceOf(errorMiddleware.prototype, BaseMiddleware)
    assert.string(cookieSecret)
    assert.instanceOf(logger, AbstractLogger)

    logger.info('Server start initialization...')
    console.log(errorMiddleware)
    return start({ port, host, controllers, middlewares, ErrorMiddleware: errorMiddleware, cookieSecret, logger })
  }
}

function start ({ port, host, controllers, middlewares, ErrorMiddleware, cookieSecret, logger }) {
  return new Promise(async (resolve, reject) => {
    const app = express()

    // uncomment after placing your favicon in /public
    // app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
    if (process.env.NODE_ENV !== 'production') app.use(morganLogger('dev'))

    // If true, the client’s IP address is understood as the left-most entry in the X-Forwarded-* header.
    app.enable('trust proxy')

    app.use(bodyParser.json())
    app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }))
    app.use(cookieParser(cookieSecret))
    // use static/public folder
    app.use(express.static(path.join(__dirname, '../../public')))
    // compress all responses
    app.use(compression())
    // secure apps by setting various HTTP headers
    app.use(helmet())

    // Health check
    app.get('/health-check', (req, res) => {
      res.status(200).send('OK')
    })

    /**
     * middlewares initialization
     */
    try {
      for (const middleware of middlewares.map(Middleware => new Middleware({ logger }))) {
        await middleware.init()
        app.use(middleware.handler())
      }
    } catch (e) {
      return reject(e)
    }

    /**
     * controllers initialization
     */
    for (const route of controllers.routesV1) {
      try {
        for (const item of route.routes.map(Controller => new Controller({ logger }))) {
          assert.func(item.init, { required: true })
          assert.func(item.router, { required: true })
          await item.init()
          app.use(route.version, item.router)
        }
      } catch (e) {
        return reject(e)
      }
    }

    /**
     * error handler
     */
    try {
      const middleware = new ErrorMiddleware({ logger })
      await middleware.init()
      app.use(middleware.handler())
    } catch (e) {
      return reject(e)
    }

    // Mounting swagger ui
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(null, swaggerConfig.options))

    // Mouting swagger-stats
    app.use(swStats.getMiddleware({ swaggerSpec: swaggerDocument }))

    // Load users managment temp page.
    app.get('/users', function (req, res) {
      res.sendFile(path.join(__dirname, '../../public/users/users_managment.html'))
    })

    /**
     * Not found route handler
     */
    app.use((req, res) => {
      res.status(404).json({
        message: `Route: '${req.url}' not found`,
        code: 'ROUTE_NOT_FOUND_ERROR'
      })
    })

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('unhandledRejection', reason)
    })

    process.on('rejectionHandled', promise => {
      logger.warn('rejectionHandled', promise)
    })

    process.on('multipleResolves', (type, promise, reason) => {
      logger.error('multipleResolves', { type, promise, reason })
    })

    process.on('uncaughtException', error => {
      logger.fatal('uncaughtException', error.stack)
      process.exit(1)
    })

    // app.listen(port, host, () => {
    //   resolve({ port, host, app })
    // })
    return app.listen(port, host, () => resolve({ port, host }))
  })
}

module.exports = { Server }
