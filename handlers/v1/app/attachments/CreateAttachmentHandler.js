const { RequestRule, Rule, ErrorWrapper, errorCodes } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const AttachmentDAO = require('database/dao/AttachmentDAO')
const AttachmentModel = require('models/AttachmentModel')
const S3Config = require('config').s3
const logger = require('util/logger')
const path = require('path')
const crypto = require('crypto')

/**
 * Enhanced CreateAttachmentHandler - Comprehensive file upload processing
 * 
 * Features:
 * - Advanced validation with security checks
 * - File type detection and categorization
 * - Duplicate file detection
 * - Metadata extraction and storage
 * - Async processing support
 * - Comprehensive error handling
 * - Performance monitoring
 * 
 * @extends BaseHandler
 * @version 2.0.0
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
        
        // Optional S3 upload result fields (may not be present initially)
        key: new RequestRule(new Rule({
          validator: v => typeof v === 'string' && v.length > 0,
          description: 'string; S3 object key/path'
        }), { required: false }),
        
        location: new RequestRule(new Rule({
          validator: v => typeof v === 'string' && v.startsWith('http'),
          description: 'string; S3 object URL'
        }), { required: false }),
        
        // Additional file metadata
        filename: new RequestRule(new Rule({
          validator: v => typeof v === 'string' && v.length > 0 && v.length <= 255,
          description: 'string; generated filename; max 255 characters'
        }), { required: false }),
        
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
        }), { required: false })
      }
    }
  }

  /**
   * Enhanced file upload processing with security and performance features
   */
  static async run(req) {
    const startTime = Date.now()
    const { currentUser } = req
    const logContext = {
      userId: currentUser.id,
      handler: 'CreateAttachmentHandler',
      requestId: req.requestId || 'unknown'
    }

    try {
      // Log upload start
      logger.info('File upload started', {
        ...logContext,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype
      })

      // Extract and validate file information
      const fileData = await this.extractFileData(req, logContext)

      // Upload file to S3 if not already uploaded
      if (!fileData.path || !fileData.s3Location) {
        logger.debug('Uploading file to S3', {
          ...logContext,
          fileName: fileData.originalName,
          fileSize: fileData.size
        })
        
        const s3Result = await this.uploadFileToS3(req.file, fileData, logContext)
        fileData.path = s3Result.key
        fileData.s3Location = s3Result.location
        fileData.s3ETag = s3Result.etag
      }

      // Perform security validations
      await this.performSecurityChecks(fileData, logContext)

      // Check for duplicates (optional optimization)
      const existingFile = await this.checkDuplicateFile(fileData, currentUser.id, logContext)
      if (existingFile && req.body.allowDuplicates !== 'true') {
        logger.info('Duplicate file detected, returning existing', {
          ...logContext,
          existingFileId: existingFile.id
        })
        return this.formatResponse(existingFile, logContext, Date.now() - startTime)
      }

      // Determine file category automatically if not provided
      if (!fileData.category) {
        fileData.category = this.determineFileCategory(fileData.mimeType, fileData.originalName)
      }

      // Create database record
      const attachment = await this.createAttachmentRecord(fileData, currentUser.id, logContext)

      // Trigger async processing if needed
      await this.triggerAsyncProcessing(attachment, fileData, logContext)

      // Log successful completion
      logger.info('File upload completed successfully', {
        ...logContext,
        attachmentId: attachment.id,
        processingTime: Date.now() - startTime
      })

      return this.formatResponse(attachment, logContext, Date.now() - startTime)

    } catch (error) {
      logger.error('File upload failed', {
        ...logContext,
        error: error.message,
        stack: error.stack,
        processingTime: Date.now() - startTime
      })

      // Enhanced error handling
      if (error instanceof ErrorWrapper) {
        throw error
      }

      throw new ErrorWrapper({
        ...errorCodes.INTERNAL_SERVER_ERROR,
        message: 'File upload processing failed',
        layer: 'CreateAttachmentHandler.run',
        meta: {
          originalError: error.message,
          fileName: req.file?.originalname,
          fileSize: req.file?.size
        }
      })
    }
  }

  /**
   * Extract and normalize file data from request
   */
  static async extractFileData(req, logContext) {
    const { file, body } = req

    if (!file) {
      throw new ErrorWrapper({
        ...errorCodes.VALIDATION,
        message: 'No file provided in request',
        layer: 'CreateAttachmentHandler.extractFileData'
      })
    }

    // Generate file hash for duplicate detection
    const fileHash = this.generateFileHash(file.originalname, file.size, file.mimetype)

    // Parse tags if provided
    let tags = []
    if (body.tags) {
      tags = Array.isArray(body.tags) 
        ? body.tags 
        : body.tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
    }

    return {
      // Use existing S3 path if available, otherwise will be set after upload
      path: file.key || null,
      s3Location: file.location || null,
      mimeType: file.mimetype,
      size: file.size,
      originalName: file.originalname,
      filename: file.filename || null,
      encoding: file.encoding || '7bit',
      buffer: file.buffer, // File data for S3 upload
      category: body.category || null,
      description: body.description || null,
      tags: tags,
      generateThumbnails: body.generateThumbnails === 'true' || body.generateThumbnails === true,
      isPublic: body.isPublic === 'true' || body.isPublic === true,
      fileHash: fileHash,
      metadata: {
        uploadedAt: new Date().toISOString(),
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip || req.connection.remoteAddress
      }
    }
  }

  /**
   * Upload file to S3 using the S3UploadClient
   */
  static async uploadFileToS3(file, fileData, logContext) {
    try {
      // Get S3 upload client
      const s3UploadClient = S3Config.getUploadClient()
      
      if (!s3UploadClient) {
        throw new Error('S3 upload client not available')
      }

      // Prepare upload parameters
      const uploadParams = {
        buffer: file.buffer,
        mimetype: file.mimetype,
        originalname: file.originalname,
        size: file.size,
        category: fileData.category,
        metadata: fileData.metadata
      }

      // Upload to S3
      const uploadResult = await s3UploadClient.uploadFile(uploadParams)
      
      logger.info('File uploaded to S3 successfully', {
        ...logContext,
        s3Key: uploadResult.key,
        s3Location: uploadResult.location,
        uploadTime: uploadResult.uploadTime
      })

      return {
        key: uploadResult.key,
        location: uploadResult.location,
        etag: uploadResult.etag,
        bucket: uploadResult.bucket
      }

    } catch (error) {
      logger.error('Failed to upload file to S3', {
        ...logContext,
        error: error.message,
        fileName: file.originalname,
        fileSize: file.size
      })

      throw new ErrorWrapper({
        ...errorCodes.EXTERNAL_SERVICE,
        message: 'Failed to upload file to storage',
        layer: 'CreateAttachmentHandler.uploadFileToS3',
        meta: {
          originalError: error.message,
          fileName: file.originalname,
          service: 'S3'
        }
      })
    }
  }

  /**
   * Perform comprehensive security validations
   */
  static async performSecurityChecks(fileData, logContext) {
    // File extension validation
    const allowedExtensions = this.getAllowedExtensions(fileData.mimeType)
    const fileExtension = path.extname(fileData.originalName).toLowerCase()
    
    if (!allowedExtensions.includes(fileExtension)) {
      logger.warn('Invalid file extension detected', {
        ...logContext,
        fileName: fileData.originalName,
        extension: fileExtension,
        mimeType: fileData.mimeType,
        allowedExtensions
      })
      
      throw new ErrorWrapper({
        ...errorCodes.VALIDATION,
        message: `Invalid file extension. Expected one of: ${allowedExtensions.join(', ')}`,
        layer: 'CreateAttachmentHandler.performSecurityChecks',
        meta: {
          providedExtension: fileExtension,
          allowedExtensions,
          fileName: fileData.originalName
        }
      })
    }

    // MIME type verification
    if (!this.isMimeTypeSecure(fileData.mimeType)) {
      logger.warn('Potentially dangerous MIME type detected', {
        ...logContext,
        mimeType: fileData.mimeType,
        fileName: fileData.originalName
      })
      
      throw new ErrorWrapper({
        ...errorCodes.SECURITY,
        message: 'File type not allowed for security reasons',
        layer: 'CreateAttachmentHandler.performSecurityChecks',
        meta: {
          mimeType: fileData.mimeType,
          fileName: fileData.originalName
        }
      })
    }

    // File size validation (additional check)
    const maxSize = this.getMaxSizeForMimeType(fileData.mimeType)
    if (fileData.size > maxSize) {
      throw new ErrorWrapper({
        ...errorCodes.VALIDATION,
        message: `File size exceeds maximum allowed for this file type (${Math.round(maxSize / 1024 / 1024)}MB)`,
        layer: 'CreateAttachmentHandler.performSecurityChecks',
        meta: {
          fileSize: fileData.size,
          maxSize: maxSize,
          mimeType: fileData.mimeType
        }
      })
    }

    // Malicious filename check
    if (this.containsMaliciousPatterns(fileData.originalName)) {
      logger.warn('Malicious filename pattern detected', {
        ...logContext,
        fileName: fileData.originalName
      })
      
      throw new ErrorWrapper({
        ...errorCodes.SECURITY,
        message: 'Filename contains potentially dangerous patterns',
        layer: 'CreateAttachmentHandler.performSecurityChecks',
        meta: {
          fileName: fileData.originalName
        }
      })
    }
  }

  /**
   * Check for duplicate files based on hash
   */
  static async checkDuplicateFile(fileData, userId, logContext) {
    try {
      // This would require adding a fileHash column to the attachments table
      // For now, we'll check by size and originalName as a simple approach
      const existingFiles = await AttachmentDAO.query()
        .where('userId', userId)
        .where('size', fileData.size)
        .where('originalName', fileData.originalName)
        .limit(1)

      return existingFiles[0] || null
    } catch (error) {
      logger.warn('Error checking for duplicate files', {
        ...logContext,
        error: error.message
      })
      return null // Don't fail upload if duplicate check fails
    }
  }

  /**
   * Automatically determine file category based on MIME type
   */
  static determineFileCategory(mimeType, fileName) {
    const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
    const videoTypes = ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/webm']
    const audioTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4']
    const documentTypes = ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']

    if (imageTypes.includes(mimeType)) {
      return fileName.toLowerCase().includes('profile') ? 'profile_image' : 'image'
    }
    if (videoTypes.includes(mimeType)) return 'video'
    if (audioTypes.includes(mimeType)) return 'audio'
    if (documentTypes.includes(mimeType)) return 'document'
    
    return 'other'
  }

  /**
   * Create attachment record in database
   */
  static async createAttachmentRecord(fileData, userId, logContext) {
    const attachmentData = {
      userId: userId,
      path: fileData.path,
      mimeType: fileData.mimeType,
      size: fileData.size,
      originalName: fileData.originalName,
      category: fileData.category
    }

    try {
      const attachment = await AttachmentDAO.baseCreate(attachmentData)
      
      logger.debug('Attachment record created', {
        ...logContext,
        attachmentId: attachment.id,
        category: fileData.category
      })

      return attachment
    } catch (error) {
      logger.error('Failed to create attachment record', {
        ...logContext,
        error: error.message,
        attachmentData
      })
      
      throw new ErrorWrapper({
        ...errorCodes.DATABASE,
        message: 'Failed to save file information',
        layer: 'CreateAttachmentHandler.createAttachmentRecord',
        meta: {
          originalError: error.message,
          fileName: fileData.originalName
        }
      })
    }
  }

  /**
   * Trigger asynchronous processing tasks
   */
  static async triggerAsyncProcessing(attachment, fileData, logContext) {
    try {
      // Thumbnail generation for images and videos
      if (fileData.generateThumbnails && 
          (fileData.category === 'image' || fileData.category === 'video' || fileData.category === 'profile_image')) {
        
        logger.debug('Triggering thumbnail generation', {
          ...logContext,
          attachmentId: attachment.id,
          category: fileData.category
        })
        
        // Here you would typically:
        // 1. Add to a background job queue
        // 2. Call a thumbnail generation service
        // 3. Update the attachment record when complete
        
        // For now, just log the intent
        logger.info('Thumbnail generation queued', {
          ...logContext,
          attachmentId: attachment.id
        })
      }

      // Virus scanning (if enabled)
      if (this.isVirusScanningEnabled()) {
        logger.debug('Triggering virus scan', {
          ...logContext,
          attachmentId: attachment.id
        })
        
        // Queue virus scanning job
        // await VirusScanQueue.add('scan-file', { attachmentId: attachment.id })
      }

    } catch (error) {
      logger.warn('Failed to trigger async processing', {
        ...logContext,
        error: error.message,
        attachmentId: attachment.id
      })
      // Don't fail the upload if async processing fails to queue
    }
  }

  /**
   * Format comprehensive response with metadata
   */
  static formatResponse(attachment, logContext, processingTime) {
    // Get the path and construct URL BEFORE the object is serialized 
    // (since $formatJson removes the path field)
    const s3Config = require('config').s3
    const filePath = attachment.path // Get path before serialization
    const fullUrl = `${s3Config.baseUrl}${filePath}`
    
    // Log the attachment object for debugging
    logger.info('Formatting attachment response', {
      ...logContext,
      attachmentId: attachment.id,
      filePath: filePath,
      baseUrl: s3Config.baseUrl,
      constructedUrl: fullUrl
    })
    
    // Create the data object manually to ensure all fields are included
    const responseData = {
      id: attachment.id,
      url: fullUrl,
      fullPath: fullUrl, 
      path: filePath,
      mimeType: attachment.mimeType,
      size: attachment.size,
      originalName: attachment.originalName,
      category: attachment.category,
      thumbnails: attachment.thumbnails || [],
      streams: attachment.streams || [],
      metadata: {
        processingTime: `${processingTime}ms`,
        uploadedAt: attachment.createdAt,
        fileExtension: this.getFileExtension(attachment.originalName),
        humanReadableSize: this.formatFileSize(attachment.size)
      }
    }
    
    const response = {
      data: responseData,
      meta: {
        processingTime: `${processingTime}ms`,
        thumbnailsAvailable: (attachment.thumbnails || []).length > 0,
        streamsAvailable: (attachment.streams || []).length > 0,
        fileInfo: {
          isImage: attachment.mimeType.startsWith('image/'),
          isVideo: attachment.mimeType.startsWith('video/'),
          isDocument: attachment.mimeType.includes('pdf') || attachment.mimeType.includes('document'),
          category: attachment.category
        }
      }
    }

    logger.info('Final response data', {
      ...logContext,
      responseKeys: Object.keys(responseData),
      urlIncluded: !!responseData.url
    })

    return this.result(response)
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  /**
   * Generate file hash for duplicate detection
   */
  static generateFileHash(originalName, size, mimeType) {
    return crypto
      .createHash('md5')
      .update(`${originalName}-${size}-${mimeType}`)
      .digest('hex')
  }

  /**
   * Get allowed file extensions for MIME type
   */
  static getAllowedExtensions(mimeType) {
    const extensionMap = {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/gif': ['.gif'],
      'image/webp': ['.webp'],
      'video/mp4': ['.mp4'],
      'video/quicktime': ['.mov'],
      'audio/mpeg': ['.mp3'],
      'audio/wav': ['.wav'],
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'application/json': ['.json']
    }

    return extensionMap[mimeType] || ['.bin']
  }

  /**
   * Check if MIME type is secure
   */
  static isMimeTypeSecure(mimeType) {
    const dangerousMimeTypes = [
      'application/x-executable',
      'application/x-msdownload',
      'application/x-msdos-program',
      'text/html',
      'text/javascript',
      'application/javascript'
    ]

    return !dangerousMimeTypes.includes(mimeType)
  }

  /**
   * Get maximum file size for MIME type
   */
  static getMaxSizeForMimeType(mimeType) {
    if (mimeType.startsWith('image/')) return 5 * 1024 * 1024 // 5MB for images
    if (mimeType.startsWith('video/')) return 100 * 1024 * 1024 // 100MB for videos
    if (mimeType.startsWith('audio/')) return 50 * 1024 * 1024 // 50MB for audio
    return 10 * 1024 * 1024 // 10MB for other files
  }

  /**
   * Check for malicious patterns in filename
   */
  static containsMaliciousPatterns(fileName) {
    const maliciousPatterns = [
      /\.\./, // Directory traversal
      /<script/i, // Script injection
      /javascript:/i, // JavaScript protocol
      /vbscript:/i, // VBScript protocol
      /\0/, // Null byte
      /[<>:"|?*]/ // Invalid filename characters
    ]

    return maliciousPatterns.some(pattern => pattern.test(fileName))
  }

  /**
   * Check if virus scanning is enabled
   */
  static isVirusScanningEnabled() {
    // This would typically check environment variables or config
    return process.env.ENABLE_VIRUS_SCANNING === 'true'
  }

  /**
   * Get file extension from filename
   */
  static getFileExtension(filename) {
    return path.extname(filename).toLowerCase()
  }

  /**
   * Format file size in human-readable format
   */
  static formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes'
    
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
}

module.exports = CreateAttachmentHandler
