const { RequestRule, ErrorWrapper, errorCodes, Rule } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const UserDAO = require('database/dao/UserDAO')
const AttachmentDAO = require('database/dao/AttachmentDAO')
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
    const startTime = Date.now()
    const logContext = {
      userId: ctx.currentUser?.id,
      requestId: ctx.requestId,
      ip: ctx.ip,
      fileName: ctx.file?.originalname,
      fileSize: ctx.file?.size,
      mimeType: ctx.file?.mimetype,
      s3Key: ctx.file?.key
    }

    try {
      logger.info('Profile image upload processing initiated', logContext)

      // Validate that file was uploaded by middleware
      if (!ctx.file || !ctx.file.key || !ctx.file.url) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: 'File upload failed - no file data received',
          layer: 'UploadProfileImageHandler.run'
        })
      }

      // Handle existing profile image if needed
      const previousImage = await this.handleExistingProfileImage(ctx, logContext)

      // Create attachment record with S3 data
      const attachmentData = await this.createAttachmentRecord(ctx, logContext)

      // Update user profile with new image
      await this.updateUserProfile(ctx, attachmentData, logContext)

      // Clean up previous image if replacement was successful
      if (previousImage && ctx.body?.replaceExisting !== false) {
        await this.cleanupPreviousImage(previousImage, logContext)
      }

      // Audit successful upload
      await this.auditImageUpload(ctx, attachmentData, previousImage, logContext)

      // Performance monitoring
      const duration = Date.now() - startTime
      logger.info('Profile image upload processing completed', {
        ...logContext,
        duration,
        attachmentId: attachmentData.id,
        s3Url: ctx.file.url
      })

      return this.result({
        message: 'Profile image uploaded successfully',
        data: {
          id: attachmentData.id,
          url: ctx.file.url,
          key: ctx.file.key,
          size: ctx.file.size,
          mimetype: ctx.file.mimetype,
          originalName: ctx.file.originalname,
          etag: ctx.file.etag,
          bucket: ctx.file.bucket
        },
        meta: {
          uploadedAt: new Date().toISOString(),
          fileSize: ctx.file.size,
          mimeType: ctx.file.mimetype,
          previousImageReplaced: !!previousImage,
          s3Location: ctx.file.location,
          version: '2.0.0'
        }
      })

    } catch (error) {
      const duration = Date.now() - startTime
      
      // Comprehensive error logging
      logger.error('Profile image upload processing failed', {
        ...logContext,
        error: error.message,
        errorCode: error.code,
        stack: error.stack,
        duration
      })

      // Audit failed upload
      await this.auditUploadFailure(ctx, error, logContext).catch(auditError => {
        logger.error('Failed to audit upload failure', {
          ...logContext,
          auditError: auditError.message
        })
      })

      // Re-throw with enhanced context
      if (error instanceof ErrorWrapper) {
        throw error
      }

      // Wrap unexpected errors
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

  /**
   * Handle existing profile image replacement
   */
  static async handleExistingProfileImage(ctx, logContext) {
    const { currentUser } = ctx

    try {
      const userData = await UserDAO.baseGetById(currentUser.id, {
        throwOnNotFound: true
      })

      if (userData.profileImageId) {
        const existingImage = await AttachmentDAO.baseGetById(userData.profileImageId, {
          throwOnNotFound: false
        })

        if (existingImage) {
          logger.info('Found existing profile image', {
            ...logContext,
            existingImageId: existingImage.id,
            existingPath: existingImage.path
          })
          return existingImage
        }
      }

      return null

    } catch (error) {
      logger.warn('Failed to get existing profile image info', {
        ...logContext,
        error: error.message
      })
      return null
    }
  }

  /**
   * Create attachment record with S3 upload data
   */
  static async createAttachmentRecord(ctx, logContext) {
    const { currentUser, file } = ctx

    try {
      const attachmentData = {
        userId: currentUser.id,
        path: file.key,
        mimeType: file.mimetype,
        size: file.size,
        originalName: file.originalname,
        category: 'profile_image'
      }

      const createdAttachment = await AttachmentDAO.baseCreate(attachmentData)

      logger.info('Attachment record created', {
        ...logContext,
        attachmentId: createdAttachment.id,
        s3Key: file.key,
        s3Url: file.url
      })

      return createdAttachment

    } catch (error) {
      throw new ErrorWrapper({
        ...errorCodes.SERVER,
        message: 'Failed to create attachment record',
        layer: 'UploadProfileImageHandler.createAttachmentRecord',
        meta: {
          originalError: error.message,
          userId: currentUser.id,
          s3Key: file.key
        }
      })
    }
  }

  /**
   * Update user profile with new image attachment
   */
  static async updateUserProfile(ctx, attachmentData, logContext) {
    const { currentUser } = ctx

    try {
      await UserDAO.baseUpdate(currentUser.id, {
        profileImageId: attachmentData.id,
        updatedAt: new Date()
      })

      logger.info('User profile updated with new image', {
        ...logContext,
        attachmentId: attachmentData.id
      })

    } catch (error) {
      // Rollback: Delete the attachment record if user update fails
      try {
        await AttachmentDAO.baseDelete(attachmentData.id)
        logger.info('Rolled back attachment creation due to user update failure', {
          ...logContext,
          attachmentId: attachmentData.id
        })
      } catch (rollbackError) {
        logger.error('Failed to rollback attachment creation', {
          ...logContext,
          rollbackError: rollbackError.message
        })
      }

      throw new ErrorWrapper({
        ...errorCodes.SERVER,
        message: 'Failed to update user profile with new image',
        layer: 'UploadProfileImageHandler.updateUserProfile',
        meta: {
          originalError: error.message,
          userId: currentUser.id,
          attachmentId: attachmentData.id
        }
      })
    }
  }

  /**
   * Clean up previous profile image
   */
  static async cleanupPreviousImage(previousImage, logContext) {
    try {
      if (!previousImage || !previousImage.id) {
        return
      }

      await AttachmentDAO.baseDelete(previousImage.id)

      logger.info('Previous profile image cleaned up', {
        ...logContext,
        previousImageId: previousImage.id,
        previousPath: previousImage.path
      })

    } catch (error) {
      logger.warn('Failed to cleanup previous profile image', {
        ...logContext,
        error: error.message,
        previousImageId: previousImage.id
      })
    }
  }

  /**
   * Audit successful image upload
   */
  static async auditImageUpload(ctx, attachmentData, previousImage, logContext) {
    try {
      const auditData = {
        action: 'profile_image_upload_success',
        userId: ctx.currentUser.id,
        attachmentId: attachmentData.id,
        fileName: ctx.file.originalname,
        fileSize: ctx.file.size,
        mimeType: ctx.file.mimetype,
        s3Key: ctx.file.key,
        s3Url: ctx.file.url,
        previousImageId: previousImage?.id,
        replacedPrevious: !!previousImage,
        ip: ctx.ip,
        userAgent: ctx.headers?.['user-agent'],
        timestamp: new Date(),
        requestId: ctx.requestId
      }

      logger.info('Profile image upload audit - success', auditData)

    } catch (error) {
      logger.error('Failed to audit image upload', {
        ...logContext,
        error: error.message
      })
    }
  }

  /**
   * Audit failed upload attempt
   */
  static async auditUploadFailure(ctx, error, logContext) {
    try {
      const auditData = {
        action: 'profile_image_upload_failure',
        userId: ctx.currentUser?.id,
        fileName: ctx.file?.originalname,
        fileSize: ctx.file?.size,
        mimeType: ctx.file?.mimetype,
        s3Key: ctx.file?.key,
        error: error.message,
        errorCode: error.code,
        ip: ctx.ip,
        userAgent: ctx.headers?.['user-agent'],
        timestamp: new Date(),
        requestId: ctx.requestId
      }

      logger.warn('Profile image upload audit - failure', auditData)

    } catch (auditError) {
      logger.error('Failed to audit upload failure', {
        ...logContext,
        auditError: auditError.message
      })
    }
  }
}

module.exports = UploadProfileImageHandler
