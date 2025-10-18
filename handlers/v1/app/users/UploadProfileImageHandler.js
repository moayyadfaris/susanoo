const { RequestRule, ErrorWrapper, errorCodes, Rule } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const { getUserService } = require('../../../../services')
const logger = require('util/logger')

/**
 * UploadProfileImageHandler - Enhanced profile image upload with custom S3 integration
 * 
 * Handles secure profile image upload with:
 * - Custom S3 upload middleware integration
 * - Comprehensive audit trail and monitoring
 * - Error handling and rollback mechanisms
 * - Previous image cleanup and management
 * 
 * @extends BaseHandler
 * @version 2.0.0
 */
class UploadProfileImageHandler extends BaseHandler {
  /**
   * Access control tag for profile image upload
   */
  static get accessTag() {
    return 'users:upload-profile-image'
  }

  /**
   * Enhanced validation rules - file is handled by middleware
   */
  static get validationRules() {
    return {
      body: {
        // Optional: replace existing profile image
        replaceExisting: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean',
          description: 'boolean; whether to replace existing profile image'
        }), { required: false })
      }
    }
  }

  /**
   * Enhanced profile image upload handler - file is already uploaded by middleware
   */
  static async run(ctx) {
    try {
      if (!ctx.file || !ctx.file.key || !ctx.file.url) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: 'File upload failed - no file data received',
          layer: 'UploadProfileImageHandler.run'
        })
      }

      const userService = getUserService()
      if (!userService) {
        throw new ErrorWrapper({
          ...errorCodes.INTERNAL_SERVER_ERROR,
          message: 'User service not available',
          layer: 'UploadProfileImageHandler.run'
        })
      }

      const result = await userService.uploadProfileImage({
        currentUser: ctx.currentUser,
        file: ctx.file,
        body: ctx.body,
        headers: ctx.headers,
        ip: ctx.ip,
        requestId: ctx.requestId
      })

      return this.result(result)
    } catch (error) {
      if (error instanceof ErrorWrapper) {
        throw error
      }

      logger.error('Profile image upload processing failed', {
        userId: ctx.currentUser?.id,
        requestId: ctx.requestId,
        error: error.message,
        stack: error.stack
      })

      throw new ErrorWrapper({
        ...errorCodes.SERVER,
        message: 'Profile image upload processing failed',
        layer: 'UploadProfileImageHandler.run',
        meta: {
          originalError: error.message,
          userId: ctx.currentUser?.id,
          requestId: ctx.requestId,
          fileName: ctx.file?.originalname
        }
      })
    }
  }
}

module.exports = UploadProfileImageHandler
