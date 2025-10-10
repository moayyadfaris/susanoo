const { v4: uuidV4 } = require('uuid')

class ErrorResponse {
  constructor (options = {}) {
    this.logId = uuidV4()
    this.success = false
    this.status = options.status || undefined
    this.code = options.code || undefined
    this.valid = options.valid || undefined
    this.key = options.key || undefined
    this.message = options.message || undefined
    this.description = options.description || undefined
    this.meta = options.meta || undefined
    this.layer = options.layer || undefined
    this.stack = options.stack || undefined
    this.src = options.src || undefined
    this.origin = options.origin || undefined
    this.data = null
  }
}

module.exports = ErrorResponse
