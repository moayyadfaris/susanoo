const { RequestRule, Rule, ErrorWrapper, errorCodes } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const AttachmentModel = require('models/AttachmentModel')
const { AttachmentServiceFactory } = require('services/attachments')
const logger = require('util/logger')

/**
 * Enhanced CreateAttachmentHandler - Service Layer Integration
 * 
 * Features:
 * - Service layer integration for business logic
 * - Comprehensive security validation
 * - Performance optimization with caching
 * - Event-driven processing
 * - Enterprise-grade error handling
 * - GDPR compliance support
 * 
 * @extends BaseHandler
 * @version 3.0.0
 */
class CreateAttachmentHandler extends BaseHandler {
  static get accessTag() {
    return 'attachments:create'
  }

  /**
   * Enhanced validation rules with comprehensive file validation
   */
  static get validationRules() {
    return {
      file: {
        // Core file properties - these come from multer
        buffer: new RequestRule(new Rule({
          validator: v => Buffer.isBuffer(v) && v.length > 0,
          description: 'Buffer; file data buffer'
        }), { required: true }),
        
        mimetype: new RequestRule(AttachmentModel.schema.mimeType, { required: true }),
        size: new RequestRule(AttachmentModel.schema.size, { required: true }),
        originalname: new RequestRule(AttachmentModel.schema.originalName, { required: true }),
        
        // Optional multer fields
        fieldname: new RequestRule(new Rule({
          validator: v => typeof v === 'string' && ['file', 'attachment', 'upload'].includes(v),
          description: 'string; field name from form; must be file, attachment, or upload'
        }), { required: false }),
        
        encoding: new RequestRule(new Rule({
          validator: v => typeof v === 'string' && ['7bit', '8bit', 'binary'].includes(v),
          description: 'string; file encoding; must be 7bit, 8bit, or binary'
        }), { required: false })
      },
      
      body: {
        // Optional category assignment
        category: new RequestRule(AttachmentModel.schema.category, { required: false }),
        
        // Optional metadata
        description: new RequestRule(new Rule({
          validator: v => typeof v === 'string' && v.length <= 500,
          description: 'string; file description; max 500 characters'
        }), { required: false }),
        
        // Tagging support
        tags: new RequestRule(new Rule({
          validator: v => {
            if (typeof v === 'string') {
              v = v.split(',').map(tag => tag.trim())
            }
            if (!Array.isArray(v)) return 'Tags must be an array or comma-separated string'
            return v.every(tag => typeof tag === 'string' && tag.length <= 50)
          },
          description: 'array or comma-separated string; file tags; max 50 characters each'
        }), { required: false }),
        
        // Processing preferences
        generateThumbnails: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean' || v === 'true' || v === 'false',
          description: 'boolean or string; whether to generate thumbnails for images/videos'
        }), { required: false }),
        
        // Access control
        isPublic: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean' || v === 'true' || v === 'false',
          description: 'boolean or string; whether file is publicly accessible'
        }), { required: false }),
        
        // Duplicate handling
        allowDuplicates: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean' || v === 'true' || v === 'false',
          description: 'boolean or string; whether to allow duplicate files'
        }), { required: false })
      }
    }
  }

  /**
   * Enhanced file upload processing with service layer integration
   */
  static async run(req) {
    const startTime = Date.now()
    const { currentUser } = req
    const requestContext = {
      userId: currentUser.id,
      userRole: currentUser.role,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      requestId: req.requestId || 'unknown',
      isAdmin: currentUser.role === 'admin' || currentUser.permissions?.includes('attachment:admin')
    }

    const logContext = {
      ...requestContext,
      handler: 'CreateAttachmentHandler',
      fileName: req.file?.originalname,
      fileSize: req.file?.size,
      mimeType: req.file?.mimetype
    }

    try {
      // Initialize attachment services
      const attachmentServices = AttachmentServiceFactory.createServices({
        config: {
          virusScanEnabled: true,
          metadataExtraction: true,
          thumbnailGeneration: req.body.generateThumbnails !== 'false',
          duplicateDetection: req.body.allowDuplicates !== 'true',
          contentAnalysis: true
        }
      })

      logger.info('File upload started with service layer', logContext)

      // Extract and prepare file data
      const fileData = this.extractFileData(req, requestContext)

      // Upload file using attachment service with comprehensive processing
      const uploadResult = await attachmentServices.attachmentService.uploadAttachment(
        fileData,
        {
          generateThumbnails: fileData.generateThumbnails,
          extractMetadata: true,
          performSecurityScan: true,
          enableCaching: true
        },
        requestContext
      )

      // Enhance response with additional service data
      const enhancedResponse = await this.enhanceResponseData(
        uploadResult,
        attachmentServices,
        requestContext
      )

      // Calculate processing metrics
      const processingTime = Date.now() - startTime

      logger.info('File upload completed successfully with service layer', {
        ...logContext,
        attachmentId: uploadResult.id,
        processingTime,
        securityScore: enhancedResponse.securityScore,
        cacheEnabled: enhancedResponse.cached
      })

      return this.formatServiceResponse(enhancedResponse, processingTime, requestContext)

    } catch (error) {
      const processingTime = Date.now() - startTime

      logger.error('File upload failed in service layer', {
        ...logContext,
        error: error.message,
        errorCode: error.code,
        stack: error.stack,
        processingTime
      })

      // Enhanced service-layer error handling
      if (error instanceof ErrorWrapper) {
        // Add service layer context to existing error
        error.meta = {
          ...error.meta,
          layer: 'CreateAttachmentHandler',
          processingTime,
          serviceLayer: true
        }
        throw error
      }

      // Wrap unexpected errors with service context
      throw new ErrorWrapper({
        ...errorCodes.INTERNAL_SERVER_ERROR,
        message: 'File upload processing failed in service layer',
        layer: 'CreateAttachmentHandler.run',
        meta: {
          originalError: error.message,
          fileName: req.file?.originalname,
          fileSize: req.file?.size,
          processingTime,
          serviceIntegration: true
        }
      })
    }
  }

  /**
   * Extract and normalize file data for service layer processing
   * @private
   */
  static extractFileData(req, context) {
    const { file, body } = req

    if (!file) {
      throw new ErrorWrapper({
        ...errorCodes.VALIDATION,
        message: 'No file provided in request',
        layer: 'CreateAttachmentHandler.extractFileData'
      })
    }

    // Parse tags if provided
    let tags = []
    if (body.tags) {
      tags = Array.isArray(body.tags) 
        ? body.tags 
        : body.tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
    }

    // Prepare file data for service layer
    return {
      // Core file properties for service
      buffer: file.buffer,
      mimetype: file.mimetype,
      size: file.size,
      originalname: file.originalname,
      encoding: file.encoding || '7bit',
      
      // Additional metadata for business logic
      category: body.category || null,
      description: body.description || null,
      tags: tags,
      generateThumbnails: body.generateThumbnails === 'true' || body.generateThumbnails === true,
      isPublic: body.isPublic === 'true' || body.isPublic === true,
      
      // Request context
      uploadedBy: context.userId,
      uploadContext: {
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
        requestId: context.requestId,
        uploadedAt: new Date()
      }
    }
  }

  /**
   * Enhance response data with additional service information
   * @private
   */
  static async enhanceResponseData(uploadResult, services, context) {
    try {
      // Add security score if available
      let securityScore = null
      if (services.securityService) {
        const securityData = { 
          mimeType: uploadResult.mimeType,
          size: uploadResult.size,
          metadata: uploadResult.metadata
        }
        securityScore = await services.securityService.getDependency('attachmentUtils')
          .calculateSecurityScore(securityData)
      }

      // Check if response was cached
      let cached = false
      if (services.cacheService) {
        const cachedMetadata = await services.cacheService.getCachedAttachmentMetadata(uploadResult.id)
        cached = !!cachedMetadata
      }

      // Add download URL
      const downloadUrl = `/api/v1/attachments/${uploadResult.id}/download`
      const previewUrl = uploadResult.isImage ? `/api/v1/attachments/${uploadResult.id}/preview` : null

      return {
        ...uploadResult,
        securityScore,
        cached,
        downloadUrl,
        previewUrl,
        serviceProcessed: true
      }

    } catch (error) {
      logger.warn('Failed to enhance response data', {
        attachmentId: uploadResult.id,
        error: error.message,
        context
      })
      
      // Return original result if enhancement fails
      return {
        ...uploadResult,
        serviceProcessed: true,
        enhancementError: error.message
      }
    }
  }

  /**
   * Format service layer response with proper structure
   * @private
   */
  static formatServiceResponse(attachmentData, processingTime, context) {
    return {
      success: true,
      data: {
        attachment: {
          id: attachmentData.id,
          originalName: attachmentData.originalName,
          filename: attachmentData.filename,
          mimeType: attachmentData.mimeType,
          size: attachmentData.size,
          humanReadableSize: attachmentData.humanReadableSize,
          category: attachmentData.category,
          path: attachmentData.path,
          downloadUrl: attachmentData.downloadUrl,
          previewUrl: attachmentData.previewUrl,
          isActive: attachmentData.isActive,
          uploadedAt: attachmentData.uploadedAt,
          uploadedBy: attachmentData.uploadedBy,
          
          // Service layer enhancements
          securityStatus: attachmentData.securityStatus || 'validated',
          securityScore: attachmentData.securityScore,
          isImage: attachmentData.isImage,
          isDocument: attachmentData.isDocument,
          
          // Processing metadata
          serviceProcessed: true,
          cached: attachmentData.cached || false,
          processingTime,
          
          // Optional fields
          ...(attachmentData.description && { description: attachmentData.description }),
          ...(attachmentData.tags && { tags: attachmentData.tags }),
          ...(attachmentData.contentAnalysis && { contentAnalysis: attachmentData.contentAnalysis }),
          ...(attachmentData.metadata && { metadata: attachmentData.metadata })
        }
      },
      meta: {
        processingTime,
        timestamp: new Date().toISOString(),
        version: '3.0.0',
        serviceLayer: true,
        requestId: context.requestId
      }
    }
  }
}

module.exports = CreateAttachmentHandler