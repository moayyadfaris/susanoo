const router = require('express').Router()

const actions = require(__folders.actionsV1 + '/web/countries')
const { BaseController } = require(__folders.controllers + '/BaseController')

class CountriesController extends BaseController {
  get router () {
    /**
     * @swagger
     * /web/countries:
     *   get:
     *     tags:
     *      - Countries
     *     name: current
     *     summary: Get countries
     *     produces:
     *       - application/json
     *     consumes:
     *       - application/json
     *     responses:
     *       '200':
     *         description: Countries list
     *         schema:
     *           type: array
     *           items:
     *             $ref: '#/definitions/Country'
     *       '400':
     *         description: Bad request
     */
    router.get('/countries', this.actionRunner(actions.ListCountriesAction))
    router.put('/countries/:id', this.actionRunner(actions.UpdateCountriesAction))

    return router
  }

  async init () {
    this.logger.debug(`{WEB} ${this.constructor.name} initialized...`)
  }
}

module.exports = { CountriesController }

