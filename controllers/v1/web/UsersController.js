const router = require('express').Router()
const actions = require(__folders.actions + '/v1/web/users')
const { BaseController } = require(__folders.controllers + '/BaseController')
const multer = require('multer')
const config = require(__folders.config)

class UsersController extends BaseController {
  get router () {
    /**
     * @swagger
     * /web/users/current:
     *   get:
     *     tags:
     *      - Users
     *     name: current
     *     summary: get logging user details
     *     produces:
     *       - application/json
     *     consumes:
     *       - application/json
     *     security:
     *        - JWT: []
     *     responses:
     *       '200':
     *         description: User found and logged in successfully
     *         schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                 data:
     *                   type: object
     *                   properties:
     *                     name:
     *                      type: string
     *                     role:
     *                      type: string
     *                     email:
     *                      type: string
     *                     mobileNumber:
     *                      type: string
     *                     newEmail:
     *                      type: string
     *                     location:
     *                      type: string
     *                     isVerified:
     *                      type: string
     *                     isConfirmedRegistration:
     *                      type: string
     *                     createdAt:
     *                      type: string
     *                     updatedAt:
     *                      type: string
     *       '400':
     *         description: Bad request
     */
    router.get('/users/dashboard', this.actionRunner(actions.ListDashboardUsersAction))
    router.get('/users/current', this.actionRunner(actions.GetCurrentUserAction))
    /**
     * @swagger
     * /users:
     *   get:
     *     security:
     *      - JWT: []
     *     tags:
     *      - Users
     *     summary: list of users
     *     produces:
     *       - application/json
     *     consumes:
     *       - application/json
     *     parameters:
     *       - in: query
     *         name: term
     *         schema:
     *          type: string
     *       - in: query
     *         name: interests
     *         schema:
     *          type: string
     *       - in: query
     *         name: page
     *         schema:
     *          type: number
     *       - in: query
     *         name: orderByDirection
     *         schema:
     *          type: string
     *          enum: [desc, asc]
     *     responses:
     *       '200':
     *         description: storyStatus has been created
     *         content:
     *         schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                 data:
     *                   type: object
     *                   properties:
     *                     title:
     *                      type: string
     *                     details:
     *                      type: string
     *                     id:
     *                      type: string
     *                     countryId:
     *                      type: string
     *                     tags:
     *                      type: array
     *                      items:
     *                        $ref: '#/definitions/Tag'
     *       '400':
     *         description: Bad request
     *       '409':
     *         description: duplicate data
     */
    router.get('/users', this.actionRunner(actions.ListUsersAction))
    /**
     * @swagger
     * /users/{id}:
     *   get:
     *     security:
     *      - JWT: []
     *     tags:
     *      - Users
     *     summary: list of users
     *     produces:
     *       - application/json
     *     consumes:
     *       - application/json
     *     responses:
     *       '200':
     *         description: User Details
     *         content:
     *         schema:
     *       '400':
     *         description: Bad request
     *       '409':
     *         description: duplicate data
     */
    router.get('/users/:id', this.actionRunner(actions.GetUserByIdAction))
    /**
     * @swagger
     * /web/users/current/password:
     *   put:
     *     security:
     *      - JWT: []
     *     tags:
     *      - Users
     *     summary: Change User Password.
     *     produces:
     *       - application/json
     *     consumes:
     *       - application/json
     *     parameters:
     *       - name: body
     *         in: body
     *         schema:
     *           type: object
     *           properties:
     *             oldPassword:
     *               type: string
     *             newPassword:
     *               type: string
     *     responses:
     *       '200':
     *         description: Password changed.
     *         content:
     *         schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                 message:
     *                   type: string
     *       '400':
     *         description: Bad request
     *       '404':
     *          description: user not found
     *
     */
    router.put('/users/current/password', this.actionRunner(actions.ChangePasswordAction))
    /**
     * @swagger
     * /web/users/current/profile-image:
     *   post:
     *     security:
     *      - JWT: []
     *     tags:
     *      - Users
     *     summary: Upload user profile
     *     produces:
     *       - multipart/form-data
     *     consumes:
     *       - multipart/form-data
     *     parameters:
     *       - in: formData
     *         name: file
     *         type: file
     *         description: The file to upload.
     *     responses:
     *       '200':
     *         description: attachment add successfully
     *       '400':
     *         description: Bad request
     *       '409':
     *         description: duplicate data
     */
    router.post('/users/current/profile-image', multer(config.s3.multerConfig).single('file'), this.actionRunner(actions.UploadProfileImageAction))
    /**
     * @swagger
     * /web/users/current:
     *   patch:
     *     security:
     *      - JWT: []
     *     tags:
     *      - Users
     *     summary: Update User info.
     *     produces:
     *       - application/json
     *     consumes:
     *       - application/json
     *     parameters:
     *       - name: body
     *         in: body
     *         schema:
     *           type: object
     *           properties:
     *             name:
     *               type: string
     *             bio:
     *               type: string
     *             countryId:
     *               type: string
     *             facebookHandle:
     *               type: string
     *             twitterHandle:
     *               type: string
     *     responses:
     *       '200':
     *         description: user updated successfully.
     *       '400':
     *         description: Bad request
     *       '404':
     *          description: user not found
     *
     */
    router.patch('/users/current', this.actionRunner(actions.UpdateUserAction))
    router.post('/users', this.actionRunner(actions.CreateUserAction))
    router.post('/users/send-reset-password-token', this.actionRunner(actions.SendResetPasswordTokenAction))
    router.post('/users/reset-password', this.actionRunner(actions.ResetPasswordAction))
    router.post('/users/confirm-reset-password', this.actionRunner(actions.ConfirmResetPasswordTokenAction))

    return router
  }

  async init () {
    this.logger.debug(`{WEB} ${this.constructor.name} initialized...`)
  }
}

module.exports = { UsersController }

