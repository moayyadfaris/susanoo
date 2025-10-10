const router = require('express').Router()

const handlers = require('handlers/v1/app/users')
const { BaseController } = require('controllers/BaseController')
const config = require('config')
const rateLimit = require('express-rate-limit')
const multer = require('multer')

class UsersController extends BaseController {
  get router () {
    router.get('/users', this.handlerRunner(handlers.ListUsersHandler))
    /**
     * @swagger
     * /users/current:
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
    router.get('/users/current', this.handlerRunner(handlers.GetCurrentUserHandler))
    /**
     * @swagger
     * /users/availability:
     *   post:
     *     tags:
     *      - Users
     *     summary: Check availability of email and/or phone number - Enhanced flexible format
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
     *             email:
     *               type: string
     *               description: Email address to check availability
     *               example: "user@example.com"
     *             phone:
     *               type: string
     *               description: Phone number to check availability
     *               example: "+1234567890"
     *             email_or_mobile_number:
     *               type: string
     *               description: LEGACY - Email or phone in single field
     *               example: "user@example.com"
     *             countryCode:
     *               type: string
     *               description: ISO country code for phone validation
     *               example: "US"
     *             suggestions:
     *               type: boolean
     *               description: Generate suggestions for unavailable fields
     *               example: true
     *             includeDetails:
     *               type: boolean
     *               description: Include detailed availability information
     *               example: true
     *             batch:
     *               type: array
     *               description: Batch check multiple values
     *               items:
     *                 type: object
     *                 properties:
     *                   type:
     *                     type: string
     *                     enum: [email, phone]
     *                   value:
     *                     type: string
     *     responses:
     *       '200':
     *         description: Availability check completed successfully
     *         schema:
     *           type: object
     *           properties:
     *             success:
     *               type: boolean
     *               example: true
     *             summary:
     *               type: object
     *               properties:
     *                 totalChecks:
     *                   type: integer
     *                 availableCount:
     *                   type: integer
     *                 unavailableCount:
     *                   type: integer
     *                 allAvailable:
     *                   type: boolean
     *             results:
     *               type: array
     *               items:
     *                 type: object
     *                 properties:
     *                   type:
     *                     type: string
     *                   value:
     *                     type: string
     *                   available:
     *                     type: boolean
     *                   field:
     *                     type: string
     *                   suggestions:
     *                     type: array
     *                     items:
     *                       type: string
     *             meta:
     *               type: object
     *               properties:
     *                 processingTime:
     *                   type: string
     *                 requestId:
     *                   type: string
     *                 timestamp:
     *                   type: string
     *       '400':
     *         description: Bad request
     *       '409':
     *         description: This email/mobile already taken, try use another.
     */
    router.post('/users/availability', this.handlerRunner(handlers.CheckAvailabilityHandler))

    router.get('/users/:id', this.handlerRunner(handlers.GetUserByIdHandler))
    /**
     * @swagger
     * /users:
     *   post:
     *     tags:
     *      - Users
     *     summary: create new user
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
     *             password:
     *               type: string
     *               format: password
     *             email:
     *               type: string
     *               format: email
     *             mobileNumber:
     *               type: string
     *               format: phone
     *             countryId:
     *               type: integer
     *               format: number
     *             mobileCountryId:
     *               type: integer
     *               format: number
     *         required:
     *           - email_or_mobile_number
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
     *                     name:
     *                      type: string
     *                     mobileNumber:
     *                      type: string
     *                     id:
     *                      type: string
     *                     countryId:
     *                      type: number
     *       '400':
     *         description: Bad request
     *       '409':
     *         description: duplicate data
     */
    router.post('/users', this.handlerRunner(handlers.CreateUserHandler))
    // router.patch('/users', this.handlerRunner(handlers.UpdateUserHandler))
    router.delete('/users/:id', this.handlerRunner(handlers.RemoveUserHandler))

    router.post('/users/send-reset-password-email', this.handlerRunner(handlers.SendResetPasswordEmailHandler))
    /**
     * @swagger
     * /users/send-reset-password-otp:
     *   post:
     *     tags:
     *      - Users
     *     summary: Send reset password OTP.
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
     *             email_or_mobile_number:
     *               type: string
     *     responses:
     *       '200':
     *         description: Reset password otp delivered.
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
    router.post('/users/send-reset-password-otp', rateLimit(config.rateLimting.defaultConfig), this.handlerRunner(handlers.SendResetPasswordOTPHandler))
    /**
     * @swagger
     * /users/check-reset-password-otp:
     *   post:
     *     tags:
     *      - Users
     *     summary: Check reset password OTP.
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
     *             email_or_mobile_number:
     *               type: string
     *             code:
     *               type: string
     *     responses:
     *       '200':
     *         description: Check reset OTP process was successfully applied.
     *         content:
     *         schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                 message:
     *                   type: string
     *                 data:
     *                   type: object
     *                   properties:
     *                     setPasswordToken:
     *                      type: string
     *                      #example: "eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJ0b2tlblR5cGUiOiJUT0tFTl9UWVBFX0FDQ0VTUyIsInVzZXJSb2xlIjoiUk9MRV9TVVBFUkFETUlOIiwiZW1haWwiOiJtb2F5eWFkQHN0YXJ0YXBwei5jb20iLCJpc3MiOiJraGFiYmVyLWFwaSIsImlhdCI6MTU3MTU4NDk3MiwiZXhwIjoxNTcxNTg1NTcyLCJzdWIiOiI2ODhjODQxYy1mZGIwLTRhMWMtYWZlZC05YWI2MTAyOTc2ZTgifQ.DAIPaA-u10mB1TK7N3idDC4bxu2xiBSRb9sGaPaQzMdTg4yjhakTE5RY_NveCA9kdxDb93o0Eof3LH4yt-SVIA"
     *       '400':
     *         description: Bad request
     *       '404':
     *          description: user not found
     *
     */
    router.post('/users/check-reset-password-otp', this.handlerRunner(handlers.CheckResetPasswordOTPHandler))
    router.post('/users/reset-password-otp', this.handlerRunner(handlers.CheckResetPasswordOTPHandler))
    /**
     * @swagger
     * /users/reset-password:
     *   post:
     *     tags:
     *      - Users
     *     summary: Reset password.
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
     *             resetPasswordToken:
     *               type: string
     *             password:
     *               type: string
     *     responses:
     *       '200':
     *         description: Reset password process was successfully applie
     *         content:
     *         schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                 message:
     *                   type: string
     *       '400':
     *         description: Bad request (VALIDATION_ERROR)
     *       '401':
     *         description: Invalid signature (TOKEN_VERIFY_ERROR)
     *       '404':
     *          description: user not found
     *
     */
    router.post('/users/reset-password', this.handlerRunner(handlers.ResetPasswordHandler))
    router.post('/users/change-email', this.handlerRunner(handlers.ChangeEmailHandler))
    router.post('/users/confirm-email', this.handlerRunner(handlers.ConfirmEmailHandler))
    router.post('/users/cancel-email-changing', this.handlerRunner(handlers.CancelEmailChangingHandler))
    /**
     * @swagger
     * /users/confirm-otp:
     *   post:
     *     tags:
     *      - Users
     *     summary: Confirm OTP code after registration
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
     *             code:
     *               type: string
     *             email:
     *               type: string
     *               format: email
     *             fingerprint:
     *               type: string
     *     responses:
     *       '200':
     *         description: OTP code confirmed successfully.
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
     *                     confirmed:
     *                      type:string
     *       '400':
     *         description: Bad request
     *       '404':
     *          description: user not found
     *
     */
    router.post('/users/confirm-otp', this.handlerRunner(handlers.ConfirmRegistrationOTPHandler))
    /**
     * @swagger
     * /users/send-verify-otp:
     *   post:
     *     tags:
     *      - Users
     *     summary: Send reset verify OTP.
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
     *             mobileNumber:
     *               type: string
     *             updateToken:
     *               type: string
     *     responses:
     *       '200':
     *         description: verification otp delivered.
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
    router.post('/users/send-verify-otp', rateLimit(config.rateLimting.defaultConfig), this.handlerRunner(handlers.SendVerifyOTPHandler))
    /**
     * @swagger
     * /users/current/password:
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
    router.put('/users/current/password', this.handlerRunner(handlers.ChangePasswordHandler))
    /**
     * @swagger
     * /users/current/profile:
     *   get:
     *     tags:
     *      - Users
     *     summary: get User Profile details
     *     produces:
     *       - application/json
     *     consumes:
     *       - application/json
     *     security:
     *        - JWT: []
     *     responses:
     *       '200':
     *         description: User found and data listed.
     *         schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                 data:
     *                   type: object
     *                   properties:
     *                     id:
     *                      type: string
     *                     name:
     *                      type: string
     *                     bio:
     *                      type: string
     *                     profileImage:
     *                      type: string
     *       '400':
     *         description: Bad request
     */
    router.get('/users/current/profile', this.handlerRunner(handlers.GetProfileHandler))
    /**
     * @swagger
     * /users/current:
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
    router.patch('/users/current', this.handlerRunner(handlers.UpdateUserHandler))
    /**
     * @swagger
     * /users/current/profile-image:
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
    router.post('/users/current/profile-image', 
      multer({
        storage: multer.memoryStorage(), // Store in memory for processing
        limits: {
          fileSize: 5 * 1024 * 1024 // 5MB limit for profile images
        },
        fileFilter: function (req, file, cb) {
          // Profile images must be images
          if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Profile image must be an image file'), false)
          }
          
          // Check against allowed image types
          const allowedImageTypes = [
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 
            'image/webp', 'image/bmp'
          ]
          
          if (!allowedImageTypes.includes(file.mimetype)) {
            return cb(new Error(`Image type ${file.mimetype} is not allowed for profile images`), false)
          }
          
          cb(null, true)
        }
      }).single('file'),
      config.s3.getCustomMulter().single('file'),
      this.handlerRunner(handlers.UploadProfileImageHandler))
    /**
     * @swagger
     * /users/current/profile-image:
     *   delete:
     *     security:
     *      - JWT: []
     *     tags:
     *      - Users
     *     summary: Remove User Profile image
     *     produces:
     *       - application/json
     *     consumes:
     *       - application/json
     *     responses:
     *       '200':
     *         description: profile image removed
     *       '400':
     *         description: Bad request
     *       '404':
     *          description: user not found
     *
     */
    router.delete('/users/current/profile-image', this.handlerRunner(handlers.DeleteProfileImageHandler))
    /**
     * @swagger
     * /users/current/change-mobile-number:
     *   post:
     *     security:
     *      - JWT: []
     *     tags:
     *      - Users
     *     summary: Change Mobile Number.
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
     *             newMobileNumber:
     *               type: string
     *             newMobileCountryId:
     *               type: string
     *     responses:
     *       '200':
     *         description: verification otp sent.
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
    router.post('/users/current/change-mobile-number', this.handlerRunner(handlers.ChangeMobileNumberHandler))
    /**
     * @swagger
     * /users/current/confirm-otp:
     *   post:
     *     security:
     *      - JWT: []
     *     tags:
     *      - Users
     *     summary: Confirm OTP for change email/mobile number.
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
     *             code:
     *               type: string
     *             type:
     *               type: string
     *     responses:
     *       '200':
     *         description: OTP confirmed!.
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
    router.post('/users/current/confirm-otp', this.handlerRunner(handlers.ConfirmOTPHandler))
    /**
     * @swagger
     * /users/current/resend-otp:
     *   post:
     *     security:
     *      - JWT: []
     *     tags:
     *      - Users
     *     summary: Change Email.
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
     *             type:
     *               type: string
     *     responses:
     *       '200':
     *         description: OTP code sent.
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
    router.post('/users/current/resend-otp', rateLimit(config.rateLimting.defaultConfig), this.handlerRunner(handlers.ResendOTPHandler))
    /**
     * @swagger
     * /users/current/change-email:
     *   post:
     *     security:
     *      - JWT: []
     *     tags:
     *      - Users
     *     summary: Change Email.
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
     *             newEmail:
     *               type: string
     *     responses:
     *       '200':
     *         description: verification otp sent.
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
    router.post('/users/current/change-email', rateLimit(config.rateLimting.defaultConfig), this.handlerRunner(handlers.ChangeEmailHandler))
    /**
     * @swagger
     * /users/change-password:
     *   post:
     *     security:
     *      - JWT: []
     *     tags:
     *      - Users
     *     summary: Change Password.
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
     *         description: Password Changed.
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
    router.post('/users/change-password', rateLimit(config.rateLimting.defaultConfig), this.handlerRunner(handlers.ChangePasswordHandler))

    // router.post('/users/current/notifications', this.handlerRunner(handlers.SendPushNotificationHandler))
    return router
  }

  async init () {
    this.logger.debug(`{APP} ${this.constructor.name} initialized...`)
  }
}

module.exports = { UsersController }

