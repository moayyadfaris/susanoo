const router = require('express').Router()

const { BaseController } = require('controllers/BaseController')
const RootProvider = require('handlers/RootProvider')
const handlers = require('handlers/v1/app/root')

class RootController extends BaseController {
  constructor(options = {}) {
    super(options)

    if (!RootController.routesRegistered) {
      this.registerRoutes()
      RootController.routesRegistered = true
    }
  }

  registerRoutes() {
    /**
     * @swagger
     * /:
     *   get:
     *     tags:
     *       - Service
     *     summary: Retrieve service overview and metadata
     *     description: |
     *       Returns high-level information about the running service including version, environment, uptime, and runtime metadata.
     *     operationId: getServiceOverview
     *     parameters:
     *       - in: query
     *         name: includeMetrics
     *         schema:
     *           type: boolean
     *         description: When true, include CPU and load metrics in the response
     *     responses:
     *       '200':
     *         description: Service overview information
     */
    router.get('/', this.handlerRunner(handlers.GetServiceOverviewHandler))

    /**
     * @swagger
     * /status:
     *   get:
     *     tags:
     *       - Service
     *     summary: Retrieve service health status and dependency checks
     *     description: |
     *       Performs health checks against core dependencies (Redis, queue, messaging clients) and returns runtime metrics.
     *     operationId: getServiceStatus
     *     responses:
     *       '200':
     *         description: Service status payload
     */
    router.get('/status', this.handlerRunner(handlers.GetServiceStatusHandler))

    /**
     * @swagger
     * /health:
     *   get:
     *     tags:
     *       - Service
     *     summary: Alias for service status endpoint
     *     description: |
     *       This endpoint mirrors `/status` and is provided for health-check integrations.
     *     operationId: getServiceHealth
     *     responses:
     *       '200':
     *         description: Service status payload
     */
    router.get('/health', this.handlerRunner(handlers.GetServiceStatusHandler))

    /**
     * @swagger
     * /callback:
     *   post:
     *     tags:
     *       - Service
     *     summary: Ingest inbound webhook callback
     *     description: |
     *       Accepts inbound callback payloads from external systems. Payload is validated and acknowledged.
     *     operationId: ingestCallback
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [source, eventType, payload]
     *             properties:
     *               source:
     *                 type: string
     *               eventType:
     *                 type: string
     *               payload:
     *                 type: object
     *               metadata:
     *                 type: object
     *     responses:
     *       '202':
     *         description: Callback accepted for processing
     *       '400':
     *         description: Validation error
     */
    router.post('/callback', this.handlerRunner(handlers.PostCallbackHandler))

    /**
     * @swagger
     * /callbacks:
     *   post:
     *     tags:
     *       - Service
     *     summary: Alias for ingesting inbound webhook callback
     *     description: |
     *       Alternate endpoint name that mirrors `/callback` to support multiple integrators.
     *     operationId: ingestCallbackAlias
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [source, eventType, payload]
     *             properties:
     *               source:
     *                 type: string
     *               eventType:
     *                 type: string
     *               payload:
     *                 type: object
     *     responses:
     *       '202':
     *         description: Callback accepted for processing
     */
    router.post('/callbacks', this.handlerRunner(handlers.PostCallbackHandler))
  }

  get router() {
    return router
  }

  async init() {
    this.logger.debug(`{APP} ${this.constructor.name} initialized...`)
    await RootProvider.init()
  }
}

RootController.routesRegistered = false

module.exports = { RootController }
