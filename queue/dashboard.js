require('dotenv').config()

const express = require('express')
const { createBullBoard } = require('@bull-board/api')
const { BullAdapter } = require('@bull-board/api/bullAdapter')
const { ExpressAdapter } = require('@bull-board/express')

const rootProvider = require('../handlers/RootProvider')
const logger = require('../util/logger')

async function startDashboard() {
  try {
    if (typeof rootProvider.init === 'function') {
      await rootProvider.init()
    }

    const queues = []
    const notificationQueue = rootProvider?.notificationClient?.getQueue?.()
    if (notificationQueue) {
      queues.push(new BullAdapter(notificationQueue))
    }

    if (!queues.length) {
      logger.warn('Bull Board startup skipped: no queues registered')
      return
    }

    const app = express()
    const serverAdapter = new ExpressAdapter()
    serverAdapter.setBasePath('/queues')

    createBullBoard({
      queues,
      serverAdapter
    })

    app.use('/queues', serverAdapter.getRouter())

    const port = Number(process.env.QUEUE_DASHBOARD_PORT || 3030)
    app.listen(port, () => {
      logger.info('Bull Board dashboard running', {
        port,
        path: '/queues',
        queues: queues.length
      })
    })
  } catch (error) {
    logger.error('Failed to start Bull Board dashboard', {
      error: error?.message,
      stack: error?.stack
    })
    process.exit(1)
  }
}

startDashboard()
