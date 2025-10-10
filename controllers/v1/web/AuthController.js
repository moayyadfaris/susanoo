const router = require('express').Router()

const { BaseController } = require('controllers/BaseController')
const handlers = require('handlers/v1/web/auth')

class AuthController extends BaseController {
  get router () {
    /**
     * @swagger
     * /web/auth/login:
     *   post:
     *     tags:
     *      - Authentication
     *     name: Login
     *     summary: Logs in a user
     *     produces:
     *       - application/json
     *     consumes:
     *       - application/json
     *     security:
     *        - JWT: []
     *     parameters:
     *       - name: body
     *         in: body
     *         schema:
     *           type: object
     *           properties:
     *             email:
     *               type: string
     *             password:
     *               type: string
     *               format: password
     *             fingerprint:
     *               type: string
     *         required:
     *           - email
     *           - password
     *           - fingerprint
     *     responses:
     *       '200':
     *         description: User found and logged in successfully.
     *         content:
     *         schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                 data:
     *                   type: object
     *                   properties:
     *                     accessToken:
     *                      type: string
     *                      #example: "eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJ0b2tlblR5cGUiOiJUT0tFTl9UWVBFX0FDQ0VTUyIsInVzZXJSb2xlIjoiUk9MRV9TVVBFUkFETUlOIiwiZW1haWwiOiJtb2F5eWFkQHN0YXJ0YXBwei5jb20iLCJpc3MiOiJraGFiYmVyLWFwaSIsImlhdCI6MTU3MTU4NDk3MiwiZXhwIjoxNTcxNTg1NTcyLCJzdWIiOiI2ODhjODQxYy1mZGIwLTRhMWMtYWZlZC05YWI2MTAyOTc2ZTgifQ.DAIPaA-u10mB1TK7N3idDC4bxu2xiBSRb9sGaPaQzMdTg4yjhakTE5RY_NveCA9kdxDb93o0Eof3LH4yt-SVIA"
     *                     refreshToken:
     *                      type: string
     *                      #example: "8883be22-b98e-4d31-91aa-b99e574b502d"
     *       '400':
     *         description: Bad request
     *       '401':
     *         description: Not verified
     *       '403':
     *         description: Invalid credentials
     */
    router.post('/auth/login', this.handlerRunner(handlers.LoginHandler))
    /**
     * @swagger
     * /web/auth/logout:
     *   post:
     *     tags:
     *      - Authentication
     *     name: Login
     *     summary: Logout a user
     *     parameters:
     *       - name: body
     *         in: body
     *         properties:
     *             refreshToken:
     *               type: string
     *     produces:
     *       - application/json
     *     consumes:
     *       - application/json
     *     security:
     *        - JWT: []
     *     responses:
     *       '200':
     *         description: User is logged out from current session.
     *       '400':
     *         description: Bad request.
     *       '403':
     *         description: Access denied, don't have permissions.
     */
    router.post('/auth/logout', this.handlerRunner(handlers.LogoutHandler))
    /**
     * @swagger
     * /web/auth/refresh-tokens:
     *   post:
     *     tags:
     *      - Authentication
     *     name: Refresh Tokens
     *     summary: Get Refresh Token for login user
     *     parameters:
     *       - name: body
     *         in: body
     *         properties:
     *             refreshToken:
     *               type: string
     *             fingerprint:
     *                type: string
     *     produces:
     *       - application/json
     *     consumes:
     *       - application/json
     *     security:
     *        - JWT: []
     *     responses:
     *       '200':
     *         description: User is logged out from current session.
     *       '400':
     *         description: Bad request.
     *       '403':
     *         description: Access denied, don't have permissions.
     */
    router.post('/auth/refresh-tokens', this.handlerRunner(handlers.RefreshTokensHandler))

    return router
  }

  async init () {
    this.logger.debug(`{WEB} ${this.constructor.name} initialized...`)
  }
}

module.exports = { AuthController }
