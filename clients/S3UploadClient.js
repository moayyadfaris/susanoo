const { ErrorWrapper, errorCodes } = require('backend-core')
const aws = require('aws-sdk')
const { v4: uuidV4 } = require('uuid')
const path = require('path')
const logger = require('../util/logger')

/**
 * S3UploadClient - Modern S3 upload handler without multer-s3 dependency
 * 
 * Features:
 * - Direct S3 uploads using AWS SDK v2
 * - File validation and security
 * - Progress tracking
 * - Metadata management
 * - Error handling and recovery
 * - Multi-part upload support for large files
 * 
 * @version 1.0.0
 */
class S3UploadClient {
  constructor(config) {
    this.config = config
    this.s3Client = config.s3Client
    this.bucket = config.bucket
    this.baseUrl = config.baseUrl
  }

  /**
   * Upload a single file to S3
   * 
   * @param {Object} fileData - File information
   * @param {Buffer} fileData.buffer - File buffer
   * @param {string} fileData.originalname - Original filename
   * @param {string} fileData.mimetype - File MIME type
   * @param {number} fileData.size - File size in bytes
   * @param {Object} options - Upload options
   * @param {string} [options.category] - File category for organization
   * @param {Object} [options.metadata] - Additional metadata
   * @param {string} [options.acl] - S3 ACL setting
   * @param {Function} [options.onProgress] - Progress callback
   * @returns {Promise<Object>} Upload result
   */
  async uploadFile(fileData, options = {}) {
    const startTime = Date.now()
    
    try {
      // Validate file data
      this.validateFileData(fileData)
      
      // Generate S3 key
      const key = this.generateFileKey(fileData, options.category)
      
      // Prepare upload parameters
      const uploadParams = {
        Bucket: this.bucket,
        Key: key,
        Body: fileData.buffer,
        ContentType: fileData.mimetype,
        ACL: options.acl || 'public-read',
        Metadata: {
          'original-name': fileData.originalname,
          'upload-timestamp': new Date().toISOString(),
          'file-size': fileData.size.toString(),
          ...options.metadata
        }
      }

      // Add server-side encryption
      uploadParams.ServerSideEncryption = 'AES256'

      logger.info('Starting S3 upload', {
        key,
        size: fileData.size,
        mimetype: fileData.mimetype,
        bucket: this.bucket
      })

      // Perform upload based on file size
      let result
      if (fileData.size > 5 * 1024 * 1024) { // 5MB threshold for multipart
        result = await this.multipartUpload(uploadParams, options.onProgress)
      } else {
        result = await this.simpleUpload(uploadParams)
      }

      const duration = Date.now() - startTime
      
      logger.info('S3 upload completed', {
        key: result.Key,
        location: result.Location,
        etag: result.ETag,
        duration
      })

      return {
        key: result.Key,
        location: result.Location,
        etag: result.ETag,
        bucket: this.bucket,
        url: this.getPublicUrl(result.Key),
        size: fileData.size,
        mimetype: fileData.mimetype,
        originalName: fileData.originalname,
        uploadedAt: new Date().toISOString(),
        duration
      }

    } catch (error) {
      const duration = Date.now() - startTime
      
      logger.error('S3 upload failed', {
        error: error.message,
        filename: fileData.originalname,
        duration
      })

      throw new ErrorWrapper({
        ...errorCodes.SERVER,
        message: 'File upload failed',
        layer: 'S3UploadClient.uploadFile',
        meta: {
          originalError: error.message,
          filename: fileData.originalname,
          filesize: fileData.size
        }
      })
    }
  }

  /**
   * Simple upload for smaller files
   */
  async simpleUpload(uploadParams) {
    return new Promise((resolve, reject) => {
      this.s3Client.upload(uploadParams, (error, data) => {
        if (error) {
          reject(error)
        } else {
          resolve(data)
        }
      })
    })
  }

  /**
   * Multipart upload for larger files with progress tracking
   */
  async multipartUpload(uploadParams, onProgress) {
    return new Promise((resolve, reject) => {
      const upload = this.s3Client.upload(uploadParams)
      
      if (onProgress && typeof onProgress === 'function') {
        upload.on('httpUploadProgress', (progress) => {
          const percentage = Math.round((progress.loaded / progress.total) * 100)
          onProgress({
            loaded: progress.loaded,
            total: progress.total,
            percentage
          })
        })
      }

      upload.send((error, data) => {
        if (error) {
          reject(error)
        } else {
          resolve(data)
        }
      })
    })
  }

  /**
   * Upload multiple files
   */
  async uploadMultipleFiles(filesData, options = {}) {
    const uploadPromises = filesData.map((fileData, index) => 
      this.uploadFile(fileData, {
        ...options,
        metadata: {
          ...options.metadata,
          'batch-index': index.toString(),
          'batch-total': filesData.length.toString()
        }
      })
    )

    return Promise.all(uploadPromises)
  }

  /**
   * Delete a file from S3
   */
  async deleteFile(key) {
    try {
      const deleteParams = {
        Bucket: this.bucket,
        Key: key
      }

      await this.s3Client.deleteObject(deleteParams).promise()
      
      logger.info('S3 file deleted', { key, bucket: this.bucket })
      
      return { success: true, key }

    } catch (error) {
      logger.error('S3 file deletion failed', {
        error: error.message,
        key,
        bucket: this.bucket
      })

      throw new ErrorWrapper({
        ...errorCodes.SERVER,
        message: 'File deletion failed',
        layer: 'S3UploadClient.deleteFile',
        meta: {
          originalError: error.message,
          key
        }
      })
    }
  }

  /**
   * Generate unique file key with proper organization
   */
  generateFileKey(fileData, category = null) {
    const date = new Date()
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    
    // Determine category if not provided
    if (!category) {
      category = this.determineCategory(fileData.mimetype)
    }
    
    // Generate unique filename
    const uuid = uuidV4()
    const extension = path.extname(fileData.originalname).toLowerCase()
    
    return `${category}/${year}/${month}/${day}/${uuid}${extension}`
  }

  /**
   * Determine file category based on MIME type
   */
  determineCategory(mimetype) {
    if (mimetype.startsWith('image/')) {
      return 'images'
    } else if (mimetype.startsWith('video/')) {
      return 'videos'
    } else if (mimetype.startsWith('audio/')) {
      return 'audio'
    } else {
      return 'documents'
    }
  }

  /**
   * Validate file data
   */
  validateFileData(fileData) {
    if (!fileData || !fileData.buffer) {
      throw new Error('File buffer is required')
    }

    if (!fileData.originalname) {
      throw new Error('Original filename is required')
    }

    if (!fileData.mimetype) {
      throw new Error('File MIME type is required')
    }

    if (!fileData.size || fileData.size <= 0) {
      throw new Error('Valid file size is required')
    }

    // Check for path traversal
    if (fileData.originalname.includes('..') || fileData.originalname.includes('/')) {
      throw new Error('Invalid filename contains path traversal characters')
    }
  }

  /**
   * Get public URL for a file
   */
  getPublicUrl(key) {
    return `${this.baseUrl}${key}`
  }

  /**
   * Get signed URL for private files
   */
  async getSignedUrl(key, expiresIn = 3600) {
    try {
      const params = {
        Bucket: this.bucket,
        Key: key,
        Expires: expiresIn
      }

      return this.s3Client.getSignedUrl('getObject', params)

    } catch (error) {
      throw new ErrorWrapper({
        ...errorCodes.SERVER,
        message: 'Failed to generate signed URL',
        layer: 'S3UploadClient.getSignedUrl',
        meta: {
          originalError: error.message,
          key
        }
      })
    }
  }

  /**
   * Check if file exists in S3
   */
  async fileExists(key) {
    try {
      await this.s3Client.headObject({
        Bucket: this.bucket,
        Key: key
      }).promise()
      
      return true

    } catch (error) {
      if (error.statusCode === 404) {
        return false
      }
      throw error
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(key) {
    try {
      const result = await this.s3Client.headObject({
        Bucket: this.bucket,
        Key: key
      }).promise()

      return {
        size: result.ContentLength,
        lastModified: result.LastModified,
        etag: result.ETag,
        contentType: result.ContentType,
        metadata: result.Metadata
      }

    } catch (error) {
      throw new ErrorWrapper({
        ...errorCodes.NOT_FOUND,
        message: 'File not found',
        layer: 'S3UploadClient.getFileMetadata',
        meta: {
          key,
          originalError: error.message
        }
      })
    }
  }
}

module.exports = S3UploadClient