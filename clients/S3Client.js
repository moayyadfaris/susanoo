const { S3Client: AWSS3Client, PutObjectCommand, DeleteObjectsCommand, GetObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const { assert, AbstractLogger } = require('backend-core')
const $ = Symbol('private scope')

class S3Client {
  constructor (options) {
    assert.object(options, { required: true })
    assert.string(options.access, { notEmpty: true })
    assert.string(options.secret, { notEmpty: true })
    assert.string(options.bucket, { notEmpty: true })
    assert.instanceOf(options.logger, AbstractLogger)

    this[$] = {
      client: new AWSS3Client({
        credentials: {
          accessKeyId: options.access,
          secretAccessKey: options.secret
        },
        region: options.region || 'us-east-1'
      }),
      bucket: options.bucket,
      logger: options.logger
    }

    this[$].logger.debug(`${this.constructor.name} constructed...`)
  }

  async uploadImage (buffer, fileName) {
    if (!Buffer.isBuffer(buffer)) {
      throw new Error(`${this.constructor.name}: buffer param is not a Buffer type`)
    }
    assert.string(fileName, { notEmpty: true })

    try {
      const command = new PutObjectCommand({
        Bucket: this[$].bucket,
        Key: fileName,
        Body: buffer,
        ContentType: 'image/jpeg'
      })

      const result = await this[$].client.send(command)
      const location = `https://${this[$].bucket}.s3.amazonaws.com/${fileName}`
      
      this[$].logger.debug(`${this.constructor.name}: Successfully uploaded ${fileName}`)
      return location
    } catch (error) {
      this[$].logger.error(`${this.constructor.name}: unable to upload objects`, error)
      throw error
    }
  }

  async batchRemove (keysArr) {
    assert.array(keysArr, { of: [String], notEmpty: true })

    try {
      const command = new DeleteObjectsCommand({
        Bucket: this[$].bucket,
        Delete: {
          Objects: keysArr.map(fileKey => ({ Key: fileKey })),
          Quiet: false
        }
      })

      const result = await this[$].client.send(command)
      this[$].logger.debug(`${this.constructor.name}: Successfully deleted ${keysArr.length} objects`)
      return result
    } catch (error) {
      this[$].logger.error(`${this.constructor.name}: unable to remove objects`, error)
      throw error
    }
  }
}

module.exports = S3Client
