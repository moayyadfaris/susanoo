const router = require('express').Router()

const handlers = require('handlers/v1/app/runtimeSettings')
const { BaseController } = require('controllers/BaseController')

class RuntimeSettingsController extends BaseController {
  get router() {
    /**
     * @swagger
     * /runtime-settings/current:
     *   get:
     *     tags:
     *      - Runtime Settings
     *     summary: Retrieve runtime configuration for a client
     *     parameters:
     *       - in: query
     *         name: appVersion
     *         required: true
     *         type: string
     *       - in: query
     *         name: platform
     *         type: string
     *       - in: query
     *         name: namespace
     *         type: string
     *     responses:
     *       '200':
     *         description: Runtime settings payload
     *       '400':
     *         description: Validation error
     */
    router.get('/runtime-settings/current', this.handlerRunner(handlers.GetRuntimeSettingsHandler))

    /**
     * @swagger
     * /runtime-settings:
     *   get:
     *     tags:
     *       - Runtime Settings
     *     summary: List runtime settings with filtering and pagination
     *     description: |
     *       Retrieve stored runtime configuration entries, optionally filtered by namespace, environment, or platform.
     *       Requires administrative access.
     *     operationId: listRuntimeSettings
     *     parameters:
     *       - in: query
     *         name: namespace
     *         schema:
     *           type: string
     *         description: Filter by configuration namespace (e.g., feature_flags)
     *       - in: query
     *         name: status
     *         schema:
     *           type: string
     *           enum: [draft, published, retired]
     *         description: Filter by publication status
     *       - in: query
     *         name: environment
     *         schema:
     *           type: string
     *         description: Filter by environment (e.g., production, staging)
     *       - in: query
     *         name: platform
     *         schema:
     *           type: string
     *           enum: [ios, android, web, desktop, all]
     *         description: Filter by target platform
     *       - in: query
     *         name: page
     *         schema:
     *           type: integer
     *           minimum: 0
     *           default: 0
     *         description: Page number (zero-based)
     *       - in: query
     *         name: limit
     *         schema:
     *           type: integer
     *           minimum: 1
     *           maximum: 100
     *           default: 25
     *         description: Page size
     *     responses:
     *       '200':
     *         description: A paginated list of runtime settings
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                 data:
     *                   type: array
     *                   items:
     *                     type: object
     *                     properties:
     *                       id:
     *                         type: string
     *                       namespace:
     *                         type: string
     *                       key:
     *                         type: string
     *                       status:
     *                         type: string
     *                       environment:
     *                         type: string
     *                       platform:
     *                         type: string
     *                       updatedAt:
     *                         type: string
     *                         format: date-time
     *                 meta:
     *                   type: object
     *                   properties:
     *                     page:
     *                       type: integer
     *                     limit:
     *                       type: integer
     *                     total:
     *                       type: integer
     *                     pages:
     *                       type: integer
     *       '401':
     *         description: Unauthorized
     */
    router.get('/runtime-settings', this.handlerRunner(handlers.ListRuntimeSettingsHandler))

    /**
     * @swagger
     * /runtime-settings:
     *   post:
     *     tags:
     *       - Runtime Settings
     *     summary: Create or update a runtime setting entry
     *     description: |
     *       Upsert a runtime configuration record. Requires administrative privileges.
     *     operationId: createRuntimeSetting
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [namespace, key, value]
     *             properties:
     *               namespace:
     *                 type: string
     *               key:
     *                 type: string
     *               value:
     *                 type: object
     *               status:
     *                 type: string
     *                 enum: [draft, published, retired]
     *               environment:
     *                 type: string
     *               platform:
     *                 type: string
     *                 enum: [ios, android, web, desktop, all]
     *               priority:
     *                 type: integer
     *     responses:
     *       '200':
     *         description: Runtime setting upserted successfully
     *       '400':
     *         description: Validation error
     *       '401':
     *         description: Unauthorized
     */
    router.post('/runtime-settings', this.handlerRunner(handlers.UpsertRuntimeSettingHandler))

    /**
     * @swagger
     * /runtime-settings/{id}:
     *   put:
     *     tags:
     *       - Runtime Settings
     *     summary: Update an existing runtime setting entry
     *     description: |
     *       Update a runtime configuration record by identifier. Requires administrative privileges.
     *     operationId: updateRuntimeSetting
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Runtime setting identifier (UUID)
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               value:
     *                 type: object
     *               status:
     *                 type: string
     *                 enum: [draft, published, retired]
     *               environment:
     *                 type: string
     *               platform:
     *                 type: string
     *                 enum: [ios, android, web, desktop, all]
     *               priority:
     *                 type: integer
     *     responses:
     *       '200':
     *         description: Runtime setting updated successfully
     *       '400':
     *         description: Validation error
     *       '401':
     *         description: Unauthorized
     */
    router.put('/runtime-settings/:id', this.handlerRunner(handlers.UpsertRuntimeSettingHandler))

    return router
  }

  async init() {
    this.logger.debug(`{APP} ${this.constructor.name} initialized...`)
  }
}

module.exports = { RuntimeSettingsController }
