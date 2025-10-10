const { ErrorWrapper, errorCodes } = require('backend-core')
const S3UploadClient = require('../clients/S3UploadClient')
const logger = require('../util/logger')

/**
 * CustomMulterS3 - Custom file upload middleware without multer-s3
 * 
 * Provides multer-like functionality but with direct S3 integration
 * using our custom S3UploadClient
 * 
 * @version 1.0.0
 */
class CustomMulterS3 {
  constructor(s3Config) {
    this.s3Config = s3Config
    this.s3Client = new S3UploadClient(s3Config)
  }

  /**
   * Create single file upload middleware
   */
  single(fieldName) {
    return async (req, res, next) => {
      try {
        // Check if file was uploaded
        if (!req.file) {
          return next(new ErrorWrapper({
            ...errorCodes.VALIDATION,
            message: `No file uploaded for field '${fieldName}'`,
            layer: 'CustomMulterS3.single'
          }))
        }

        // Validate file
        const validation = this.validateFile(req.file, req)
        if (!validation.isValid) {
          return next(new ErrorWrapper({
            ...errorCodes.VALIDATION,
            message: validation.reason,
            layer: 'CustomMulterS3.single'
          }))
        }

        // Determine category based on route
        const category = this.determineCategory(req)

        // Upload to S3
        const uploadResult = await this.s3Client.uploadFile(req.file, {
          category,
          metadata: {
            'uploaded-by': req.currentUser?.id || 'anonymous',
            'upload-source': req.route?.path || 'unknown',
            'user-agent': req.headers['user-agent'] || 'unknown',
            'ip-address': req.ip || 'unknown'
          },
          onProgress: (progress) => {
            // Could emit progress events here if needed
            logger.debug('Upload progress', {
              filename: req.file.originalname,
              percentage: progress.percentage
            })
          }
        })

        // Attach result to request object (multer-like behavior)
        req.file = {
          ...req.file,
          key: uploadResult.key,
          location: uploadResult.location,
          url: uploadResult.url,
          etag: uploadResult.etag,
          bucket: uploadResult.bucket
        }

        logger.info('File uploaded successfully', {
          filename: req.file.originalname,
          key: uploadResult.key,
          size: uploadResult.size,
          userId: req.currentUser?.id
        })

        next()

      } catch (error) {
        logger.error('File upload failed', {
          error: error.message,
          filename: req.file?.originalname,
          userId: req.currentUser?.id
        })

        next(error instanceof ErrorWrapper ? error : new ErrorWrapper({
          ...errorCodes.SERVER,
          message: 'File upload failed',
          layer: 'CustomMulterS3.single',
          meta: {
            originalError: error.message,
            filename: req.file?.originalname
          }
        }))
      }
    }
  }

  /**
   * Create multiple files upload middleware
   */
  array(fieldName, maxCount = 10) {
    return async (req, res, next) => {
      try {
        // Check if files were uploaded
        if (!req.files || req.files.length === 0) {
          return next(new ErrorWrapper({
            ...errorCodes.VALIDATION,
            message: `No files uploaded for field '${fieldName}'`,
            layer: 'CustomMulterS3.array'
          }))
        }

        // Check max count
        if (req.files.length > maxCount) {
          return next(new ErrorWrapper({
            ...errorCodes.VALIDATION,
            message: `Too many files. Maximum allowed: ${maxCount}`,
            layer: 'CustomMulterS3.array'
          }))
        }

        // Validate all files
        for (const file of req.files) {
          const validation = this.validateFile(file, req)
          if (!validation.isValid) {
            return next(new ErrorWrapper({
              ...errorCodes.VALIDATION,
              message: `File '${file.originalname}': ${validation.reason}`,
              layer: 'CustomMulterS3.array'
            }))
          }
        }

        // Determine category
        const category = this.determineCategory(req)

        // Upload all files
        const uploadResults = await this.s3Client.uploadMultipleFiles(req.files, {
          category,
          metadata: {
            'uploaded-by': req.currentUser?.id || 'anonymous',
            'upload-source': req.route?.path || 'unknown',
            'user-agent': req.headers['user-agent'] || 'unknown',
            'ip-address': req.ip || 'unknown'
          }
        })

        // Update files with upload results
        req.files = req.files.map((file, index) => ({
          ...file,
          key: uploadResults[index].key,
          location: uploadResults[index].location,
          url: uploadResults[index].url,
          etag: uploadResults[index].etag,
          bucket: uploadResults[index].bucket
        }))

        logger.info('Multiple files uploaded successfully', {
          fileCount: req.files.length,
          files: req.files.map(f => ({ name: f.originalname, key: f.key })),
          userId: req.currentUser?.id
        })

        next()

      } catch (error) {
        logger.error('Multiple files upload failed', {
          error: error.message,
          fileCount: req.files?.length,
          userId: req.currentUser?.id
        })

        next(error instanceof ErrorWrapper ? error : new ErrorWrapper({
          ...errorCodes.SERVER,
          message: 'Files upload failed',
          layer: 'CustomMulterS3.array',
          meta: {
            originalError: error.message,
            fileCount: req.files?.length
          }
        }))
      }
    }
  }

  /**
   * Validate file
   */
  validateFile(file, req) {
    // Check file existence
    if (!file || !file.buffer) {
      return {
        isValid: false,
        reason: 'File buffer is missing'
      }
    }

    // Check MIME type against allowed types
    if (!this.s3Config.mimeTypes.includes(file.mimetype)) {
      return {
        isValid: false,
        reason: `File type ${file.mimetype} is not allowed. Allowed types: ${this.s3Config.mimeTypes.join(', ')}`
      }
    }

    // Check file size
    const maxSize = this.getMaxSizeForMimeType(file.mimetype)
    if (file.size > maxSize) {
      return {
        isValid: false,
        reason: `File size ${file.size} exceeds maximum allowed size ${maxSize}`
      }
    }

    // Check file extension
    const extension = require('path').extname(file.originalname).toLowerCase()
    const allowedExtensions = this.getAllowedExtensions(file.mimetype)
    if (allowedExtensions.length > 0 && !allowedExtensions.includes(extension)) {
      return {
        isValid: false,
        reason: `File extension ${extension} does not match MIME type ${file.mimetype}`
      }
    }

    // Security checks
    if (file.originalname.includes('..') || file.originalname.includes('/')) {
      return {
        isValid: false,
        reason: 'Invalid filename contains path traversal characters'
      }
    }

    return { isValid: true }
  }

  /**
   * Get maximum file size based on MIME type
   */
  getMaxSizeForMimeType(mimetype) {
    if (mimetype.startsWith('image/')) {
      return this.s3Config.maxImageSize
    } else if (mimetype.startsWith('video/')) {
      return this.s3Config.maxVideoSize
    } else {
      return this.s3Config.maxFileSize
    }
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
   * Determine file category based on route and context
   */
  determineCategory(req) {
    // Check route path for specific categories
    if (req.route?.path?.includes('profile-image') || req.path?.includes('profile-image')) {
      return 'profile-images'
    }

    if (req.route?.path?.includes('avatar') || req.path?.includes('avatar')) {
      return 'avatars'
    }

    if (req.route?.path?.includes('attachment') || req.path?.includes('attachment')) {
      return 'attachments'
    }

    // Default to general categories based on MIME type
    return this.s3Client.determineCategory(req.file?.mimetype || req.files?.[0]?.mimetype || 'application/octet-stream')
  }
}

module.exports = CustomMulterS3