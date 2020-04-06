const router = require('express').Router()
const actions = require(__folders.actions + '/v1/app/countries')
const { BaseController } = require(__folders.controllers + '/BaseController')

class CountriesController extends BaseController {
  get router () {
    /**
     * @swagger
     * /countries:
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

    return router
  }

  async init () {
    this.logger.debug(`{APP} ${this.constructor.name} initialized...`)
  }
}

module.exports = { CountriesController }

