const { BaseConfig } = require('../core/lib/BaseConfig')
const { ErrorWrapper } = require('../core/lib/ErrorWrapper')
const errorCodes = require('../core/lib/errorCodes')
const { v4: uuidV4 } = require('uuid')
const path = require('path')
const { S3Client } = require('@aws-sdk/client-s3')
const logger = require('../util/logger')
const S3UploadClient = require('../clients/S3UploadClient')
const CustomMulterS3 = require('../clients/CustomMulterS3')

/**
 * Enhanced S3Config - Comprehensive AWS S3 configuration with compatibility fixes
 * 
 * Features:
 * - AWS SDK v2/v3 compatibility handling
 * - Enhanced security and validation
 * - Comprehensive file type support
 * - Advanced upload configurations
 * - Error handling and logging
 * - Performance optimizations
 * 
 * @extends BaseConfig
 * @version 2.0.0
 */
class S3Config extends BaseConfig {
  constructor() {
    super()
    
    // AWS Configuration
    this.accessKeyId = this.set('S3_ACCESS', this.joi.string().required())
    this.secretAccessKey = this.set('S3_SECRET', this.joi.string().required())
    this.region = this.set('S3_REGION', this.joi.string(), 'eu-west-1')
    this.bucket = this.set('S3_BUCKET', this.joi.string().required())
    this.baseUrl = this.set('S3_BASE_URL', this.joi.string().required()).replace(/\/$/, '') + '/'
    
    // File type configurations
    this.mimeTypes = this.set('ALLOWED_MIME_TYPES', this.joi.string().required()).split(',').map(type => type.trim())
    this.thumbnailSizes = this.set('ALLOWED_THUMBNAIL_SIZES', this.joi.string().required()).split(',').map(size => size.trim())
    this.videoMimeTypes = this.set('VIDEO_MIME_TYPES', this.joi.string().required()).split(',').map(type => type.trim())
    this.videoStreamTypes = this.set('VIDEO_STREAM_TYPES', this.joi.string().required()).split(',').map(type => type.trim())
    
    // File size limits
    this.maxFileSize = this.set('MAX_FILE_SIZE', this.joi.number(), 10 * 1024 * 1024) // 10MB default
    this.maxImageSize = this.set('MAX_IMAGE_SIZE', this.joi.number(), 5 * 1024 * 1024) // 5MB default
    this.maxVideoSize = this.set('MAX_VIDEO_SIZE', this.joi.number(), 100 * 1024 * 1024) // 100MB default
    
    // Initialize S3 client with proper configuration
    this.s3Client = this.initializeS3Client()
    
    // Initialize custom upload client
    this.uploadClient = new S3UploadClient({
      s3Client: this.s3Client,
      bucket: this.bucket,
      baseUrl: this.baseUrl,
      mimeTypes: this.mimeTypes,
      maxFileSize: this.maxFileSize,
      maxImageSize: this.maxImageSize,
      maxVideoSize: this.maxVideoSize
    })
    
    // Initialize custom multer middleware
    this.customMulter = new CustomMulterS3({
      s3Client: this.s3Client,
      bucket: this.bucket,
      baseUrl: this.baseUrl,
      mimeTypes: this.mimeTypes,
      maxFileSize: this.maxFileSize,
      maxImageSize: this.maxImageSize,
      maxVideoSize: this.maxVideoSize
    })
    
    // Keep reference to this for callbacks
    const self = this
    

    

  }

  /**
   * Initialize S3 client with proper configuration and compatibility
   */
  initializeS3Client() {
    try {
      // Create S3 client with enhanced configuration (AWS SDK v3)
      const s3Client = new S3Client({
        region: this.region,
        credentials: {
          accessKeyId: this.accessKeyId,
          secretAccessKey: this.secretAccessKey
        },
        requestHandler: {
          requestTimeout: 30000, // 30 seconds timeout
          connectionTimeout: 5000 // 5 seconds connection timeout
        },
        maxAttempts: 3
      })

      // Test that the client has required methods (AWS SDK v3)
      if (typeof s3Client.send !== 'function') {
        throw new Error('S3 client missing required send method')
      }

      logger.info('S3 client initialized successfully', { 
        region: this.region, 
        bucket: this.bucket,
        awsVersion: 'v3'
      })

      return s3Client

    } catch (error) {
      logger.error('Failed to initialize S3 client', { error: error.message })
      throw new ErrorWrapper({
        ...errorCodes.SERVER,
        message: 'S3 configuration failed',
        layer: 'S3Config.initializeS3Client',
        meta: { originalError: error.message }
      })
    }
  }

  /**
   * Generate unique file key with proper organization
   */
  generateFileKey(file, req) {
    const date = new Date()
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    
    // Determine file category
    const category = this.determineFileCategory(file, req)
    
    // Generate unique filename
    const uuid = uuidV4()
    const extension = path.extname(file.originalname).toLowerCase()
    
    // Organize files by category and date
    return `${category}/${year}/${month}/${day}/${uuid}${extension}`
  }

  /**
   * Determine file category based on upload context and type
   */
  determineFileCategory(file, req) {
    // Check if it's a profile image upload
    if (req.route?.path?.includes('profile-image') || req.path?.includes('profile-image')) {
      return 'profile-images'
    }
    
    // Check file type
    if (file.mimetype.startsWith('image/')) {
      return 'images'
    } else if (file.mimetype.startsWith('video/')) {
      return 'videos'
    } else if (file.mimetype.startsWith('audio/')) {
      return 'audio'
    } else {
      return 'documents'
    }
  }

  /**
   * Enhanced file validation with detailed checks
   */
  validateFile(file, req) {
    // Check MIME type
    if (!this.mimeTypes.includes(file.mimetype)) {
      return {
        isValid: false,
        reason: `File type ${file.mimetype} is not allowed. Allowed types: ${this.mimeTypes.join(', ')}`
      }
    }

    // Check file extension
    const extension = path.extname(file.originalname).toLowerCase()
    const allowedExtensions = this.getAllowedExtensions(file.mimetype)
    if (allowedExtensions.length > 0 && !allowedExtensions.includes(extension)) {
      return {
        isValid: false,
        reason: `File extension ${extension} does not match MIME type ${file.mimetype}`
      }
    }

    // Additional security checks
    if (file.originalname.includes('..') || file.originalname.includes('/')) {
      return {
        isValid: false,
        reason: 'Invalid filename contains path traversal characters'
      }
    }

    return { isValid: true }
  }

  /**
   * Validate profile image specifically
   */
  validateProfileImage(file, req) {
    // Profile images must be images
    if (!file.mimetype.startsWith('image/')) {
      return {
        isValid: false,
        reason: 'Profile image must be an image file'
      }
    }

    // Check against allowed image types
    const allowedImageTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 
      'image/webp', 'image/bmp'
    ]
    
    if (!allowedImageTypes.includes(file.mimetype)) {
      return {
        isValid: false,
        reason: `Image type ${file.mimetype} is not allowed for profile images`
      }
    }

    return { isValid: true }
  }

  /**
   * Get allowed file extensions for a MIME type
   */
  getAllowedExtensions(mimeType) {
    const extensionMap = {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/gif': ['.gif'],
      'image/webp': ['.webp'],
      'image/bmp': ['.bmp'],
      'image/svg+xml': ['.svg'],
      'video/mp4': ['.mp4'],
      'video/mpeg': ['.mpeg', '.mpg'],
      'video/quicktime': ['.mov'],
      'video/webm': ['.webm'],
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'application/json': ['.json']
    }

    return extensionMap[mimeType] || []
  }

  /**
   * Get S3 client instance
   */
  getS3Client() {
    return this.s3Client
  }

  /**
   * Get custom upload client instance
   */
  getUploadClient() {
    return this.uploadClient
  }

  /**
   * Get custom multer middleware
   */
  getCustomMulter() {
    return this.customMulter
  }

  /**
   * Get multer configuration for standard multer
   */
  get multerConfig() {
    return {
      storage: this.customMulter,
      limits: {
        fileSize: this.maxFileSize,
        files: 1
      },
      fileFilter: (req, file, cb) => {
        // Check MIME type
        if (!this.mimeTypes.includes(file.mimetype)) {
          logger.warn('File upload rejected - invalid MIME type', {
            fileName: file.originalname,
            mimeType: file.mimetype,
            allowedTypes: this.mimeTypes
          })
          return cb(new Error(`File type ${file.mimetype} is not allowed`), false)
        }

        // Check file size based on type
        const maxSize = this.getMaxSizeForType(file.mimetype)
        if (file.size && file.size > maxSize) {
          logger.warn('File upload rejected - size too large', {
            fileName: file.originalname,
            fileSize: file.size,
            maxSize: maxSize,
            mimeType: file.mimetype
          })
          return cb(new Error(`File size exceeds maximum allowed for ${file.mimetype}`), false)
        }

        cb(null, true)
      }
    }
  }

  /**
   * Get maximum file size based on MIME type
   */
  getMaxSizeForType(mimeType) {
    if (this.videoMimeTypes && this.videoMimeTypes.includes(mimeType)) {
      return this.maxVideoSize
    }
    if (mimeType.startsWith('image/')) {
      return this.maxImageSize
    }
    return this.maxFileSize
  }







  /**
   * Test S3 connection with AWS SDK v3
   */
  async testConnection() {
    try {
      const { HeadBucketCommand } = require('@aws-sdk/client-s3')
      const command = new HeadBucketCommand({ Bucket: this.bucket })
      await this.s3Client.send(command)
      logger.info('S3 connection test successful', { bucket: this.bucket })
      return true
    } catch (error) {
      logger.error('S3 connection test failed', { 
        bucket: this.bucket, 
        error: error.message 
      })
      return false
    }
  }
  /**
   * Enhanced initialization with connection testing and validation
   */
  async init() {
    try {
      logger.info(`${this.constructor.name}: Starting initialization...`)
      
      // Validate configuration
      this.validateConfiguration()
      
      // Test S3 connection (non-blocking)
      this.testConnection().then(isConnected => {
        if (isConnected) {
          logger.info(`${this.constructor.name}: S3 connection verified`)
        } else {
          logger.warn(`${this.constructor.name}: S3 connection test failed, but continuing initialization`)
        }
      }).catch(error => {
        logger.warn(`${this.constructor.name}: S3 connection test error:`, error.message)
      })
      
      logger.info(`${this.constructor.name}: Initialization completed successfully`, {
        bucket: this.bucket,
        region: this.region,
        allowedMimeTypes: this.mimeTypes.length,
        maxFileSize: this.maxFileSize
      })
      
    } catch (error) {
      logger.error(`${this.constructor.name}: Initialization failed`, { 
        error: error.message 
      })
      throw error
    }
  }

  /**
   * Validate S3 configuration
   */
  validateConfiguration() {
    if (!this.accessKeyId || !this.secretAccessKey) {
      throw new Error('AWS credentials are required')
    }
    
    if (!this.bucket) {
      throw new Error('S3 bucket name is required')
    }
    
    if (!this.mimeTypes || this.mimeTypes.length === 0) {
      throw new Error('At least one allowed MIME type must be configured')
    }
    
    logger.debug('S3 configuration validation passed')
  }
}

module.exports = new S3Config()
