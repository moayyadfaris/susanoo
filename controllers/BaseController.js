const { handlerTagPolicy } = require('acl/policies')
const { errorCodes, ErrorWrapper, assert, RequestRule, AbstractLogger } = require('backend-core')
const { stripTrailingSlash } = require('helpers').commonHelpers
const crypto = require('crypto')

class BaseController {
  constructor ({ logger } = {}) {
    if (!this.init) throw new Error(`${this.constructor.name} should implement 'init' method.`)
    if (!this.router) throw new Error(`${this.constructor.name} should implement 'router' getter.`)

    assert.instanceOf(logger, AbstractLogger)
    this.logger = logger
    
    // Controller configuration
    this.config = {
      enableRequestLogging: process.env.NODE_ENV !== 'test',
      enablePerformanceMonitoring: true,
      maxRequestSize: '10mb',
      rateLimiting: {
        enabled: process.env.NODE_ENV === 'production',
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100 // requests per window
      },
      security: {
        enableCSRFProtection: true,
        sanitizeInput: true,
        validateContentType: true
      }
    }
  }

  /**
   * Enhanced handler runner with comprehensive request processing
   */
  handlerRunner (handler) {
    assert.func(handler, { required: true })

    this.validateHandler(handler)

    return async (req, res, next) => {
      const startTime = Date.now()
      const requestId = this.generateRequestId()
      
      try {
        // Attach request ID for tracking
        req.requestId = requestId
        res.setHeader('X-Request-ID', requestId)
        
        // Create enhanced context
        const ctx = await this.createRequestContext(req, requestId)
        
        // Log request start
        if (this.config.enableRequestLogging) {
          this.logRequestStart(ctx, handler)
        }
        
        // Security validations
        await this.performSecurityValidations(ctx, handler)
        
        // Schema documentation endpoint
        if (this.shouldReturnSchema(ctx, handler)) {
          return this.sendSchemaResponse(res, handler)
        }

        // Access control check
        await this.checkAccessControl(handler, ctx)

        // Request validation
        await this.validateRequest(handler, ctx)

        // Execute handler with middleware support
        const response = await this.executeHandler(handler, ctx)

        // Process and send response
        await this.sendResponse(res, response, ctx, startTime)
        
        // Log successful completion
        if (this.config.enableRequestLogging) {
          this.logRequestCompletion(ctx, response, Date.now() - startTime)
        }
        
      } catch (error) {
        // Enhanced error handling
        this.handleRequestError(error, req, next, requestId, Date.now() - startTime)
      }
    }
  }
  
  /**
   * Validates handler structure and requirements
   */
  validateHandler(handler) {
    if (!handler.hasOwnProperty('accessTag')) {
      throw new Error(`'accessTag' getter not declared in invoked '${handler.name}' handler`)
    }

    if (!handler.hasOwnProperty('run')) {
      throw new Error(`'run' method not declared in invoked '${handler.name}' handler`)
    }
    
    // Validate handler configuration
    if (handler.config) {
      assert.object(handler.config, { required: true })
    }
  }
  
  /**
   * Generates unique request ID for tracking
   */
  generateRequestId() {
    return crypto.randomBytes(16).toString('hex')
  }
  
  /**
   * Creates enhanced request context with additional metadata
   */
  async createRequestContext(req, requestId) {
    const ctx = {
      requestId,
      timestamp: new Date().toISOString(),
      currentUser: req.currentUser,
      body: req.body,
      query: req.query,
      params: req.params,
      ip: this.getClientIP(req),
      method: req.method,
      url: req.url,
      originalUrl: stripTrailingSlash(req.originalUrl),
      cookies: { ...req.cookies, ...req.signedCookies },
      headers: this.extractHeaders(req),
      file: req.file,
      files: req.files,
      userAgent: req.get('User-Agent'),
      referer: req.get('Referer'),
      protocol: req.protocol,
      secure: req.secure,
      contentLength: req.get('Content-Length')
    }
    
    // Add security context
    ctx.security = {
      isSecure: req.secure,
      hasValidCSRF: this.validateCSRFToken(req),
      rateLimitInfo: await this.getRateLimitInfo(ctx.ip)
    }
    
    return ctx
  }
  
  /**
   * Extracts and validates headers
   */
  extractHeaders(req) {
    return {
      'Content-Type': req.get('Content-Type'),
      'Referer': req.get('referer'),
      'User-Agent': req.get('User-Agent'),
      'Language': req.get('Language'),
      'Device-Type': req.get('Device-Type'),
      'Authorization': req.get('Authorization') ? '[REDACTED]' : undefined,
      'X-Forwarded-For': req.get('X-Forwarded-For'),
      'X-Real-IP': req.get('X-Real-IP')
    }
  }
  
  /**
   * Gets client IP address with proxy support
   */
  getClientIP(req) {
    return req.ip || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
           'unknown'
  }
  
  /**
   * Performs security validations on the request
   */
  async performSecurityValidations(ctx, handler) {
    if (!this.config.security.enableCSRFProtection) return
    
    // CSRF protection for state-changing operations
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(ctx.method)) {
      if (!ctx.security.hasValidCSRF && !this.isCSRFExempt(handler)) {
        this.logger.warn('CSRF token validation failed', { requestId: ctx.requestId, ip: ctx.ip })
      }
    }
    
    // Content-Type validation
    if (this.config.security.validateContentType && ctx.body && Object.keys(ctx.body).length > 0) {
      const contentType = ctx.headers['Content-Type']
      if (!contentType || !this.isValidContentType(contentType)) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: 'Invalid or missing Content-Type header',
          layer: this.constructor.name
        })
      }
    }
  }
  
  /**
   * Validates CSRF token
   */
  validateCSRFToken(req) {
    // Implementation depends on your CSRF strategy
    // This is a placeholder for CSRF validation
    return true // For now, always return true
  }
  
  /**
   * Checks if handler is exempt from CSRF protection
   */
  isCSRFExempt(handler) {
    return handler.config?.security?.csrfExempt === true
  }
  
  /**
   * Validates Content-Type header
   */
  isValidContentType(contentType) {
    const validTypes = [
      'application/json',
      'application/x-www-form-urlencoded',
      'multipart/form-data',
      'text/plain'
    ]
    return validTypes.some(type => contentType.includes(type))
  }
  
  /**
   * Gets rate limiting information
   */
  async getRateLimitInfo(ip) {
    // Placeholder for rate limiting logic
    return {
      remaining: 100,
      reset: Date.now() + 900000, // 15 minutes
      limit: 100
    }
  }
  
  /**
   * Logs request start
   */
  logRequestStart(ctx, handler) {
    this.logger.info('Request started', {
      requestId: ctx.requestId,
      method: ctx.method,
      url: ctx.url,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      handler: handler.name,
      userId: ctx.currentUser?.id
    })
  }
  
  /**
   * Determines if schema should be returned
   */
  shouldReturnSchema(ctx, handler) {
    return ctx.query.schema && 
           ['POST', 'PATCH', 'GET'].includes(ctx.method) && 
           process.env.NODE_ENV === 'development' &&
           handler.validationRules
  }
  
  /**
   * Sends schema response
   */
  sendSchemaResponse(res, handler) {
    const schema = getSchemaDescription(handler.validationRules)
    return res.status(200).json({
      success: true,
      message: 'Handler schema documentation',
      data: schema,
      meta: {
        handler: handler.name,
        timestamp: new Date().toISOString()
      }
    })
  }
  
  /**
   * Checks access control
   */
  async checkAccessControl(handler, ctx) {
    try {
      await handlerTagPolicy(handler.accessTag, ctx.currentUser)
    } catch (error) {
      this.logger.warn('Access control failed', {
        requestId: ctx.requestId,
        handler: handler.name,
        accessTag: handler.accessTag,
        userId: ctx.currentUser?.id,
        error: error.message
      })
      throw error
    }
  }
  
  /**
   * Validates request data
   */
  async validateRequest(handler, ctx) {
    if (!handler.validationRules) return
    
    // Check for empty body when required
    if (handler.validationRules.notEmptyBody && !Object.keys(ctx.body).length) {
      throw new ErrorWrapper({
        ...errorCodes.EMPTY_BODY,
        layer: this.constructor.name,
        context: { requestId: ctx.requestId }
      })
    }

    // Validate different parts of the request
    const validationPromises = []
    
    if (handler.validationRules.query) {
      validationPromises.push(this.validateSchemaAsync(ctx.query, handler.validationRules.query, 'query', ctx))
    }
    if (handler.validationRules.params) {
      validationPromises.push(this.validateSchemaAsync(ctx.params, handler.validationRules.params, 'params', ctx))
    }
    if (handler.validationRules.body) {
      validationPromises.push(this.validateSchemaAsync(ctx.body, handler.validationRules.body, 'body', ctx))
    }
    if (handler.validationRules.file) {
      validationPromises.push(this.validateSchemaAsync(ctx.file, handler.validationRules.file, 'file', ctx))
    }
    if (handler.validationRules.headers) {
      console.log('Validating headers:', ctx.headers)
      console.log('Header Validation Rules:', handler.validationRules.headers)
      validationPromises.push(this.validateSchemaAsync(ctx.headers, handler.validationRules.headers, 'headers', ctx))
    }
    if (handler.validationRules.cookies) {
      validationPromises.push(this.validateSchemaAsync(ctx.cookies, handler.validationRules.cookies, 'cookies', ctx))
    }
    
    await Promise.all(validationPromises)
  }
  
  /**
   * Executes handler with middleware support
   */
  async executeHandler(handler, ctx) {
    const startTime = Date.now()
    
    try {
      // Execute pre-handler hooks
      if (handler.beforeRun) {
        await handler.beforeRun(ctx)
      }
      
      // Execute main handler
      const response = await handler.run(ctx)
      
      // Execute post-handler hooks
      if (handler.afterRun) {
        await handler.afterRun(ctx, response)
      }
      
      // Validate response structure
      this.validateResponse(response)
      
      return response
      
    } catch (error) {
      const executionTime = Date.now() - startTime
      this.logger.error('Handler execution failed', {
        requestId: ctx.requestId,
        handler: handler.name,
        executionTime,
        error: error.message
      })
      throw error
    }
  }
  
  /**
   * Validates response structure
   */
  validateResponse(response) {
    if (!response || typeof response !== 'object') {
      throw new ErrorWrapper({
        ...errorCodes.DEV_IMPLEMENTATION,
        message: 'Handler must return an object response',
        layer: this.constructor.name
      })
    }
    
    if (typeof response.status !== 'number') {
      throw new ErrorWrapper({
        ...errorCodes.DEV_IMPLEMENTATION,
        message: 'Response must include a valid status code',
        layer: this.constructor.name
      })
    }
  }

  
  /**
   * Sends response with enhanced formatting and security headers
   */
  async sendResponse(res, response, ctx, startTime) {
    const executionTime = Date.now() - startTime
    
    // Set security headers
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('X-XSS-Protection', '1; mode=block')
    
    // Set custom headers from response
    if (response.headers) {
      res.set(response.headers)
    }

    // Set cookies from response
    if (response.cookies && response.cookies.length) {
      for (const cookie of response.cookies) {
        res.cookie(cookie.name, cookie.value, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          ...cookie.options
        })
      }
    }
    
    // Enhanced response format
    const responseData = {
      success: response.success !== false,
      message: response.message || 'Request processed successfully',
      data: response.data ?? (response.allowNullData ? null : undefined),
      meta: {
        requestId: ctx.requestId,
        timestamp: new Date().toISOString(),
        executionTime: `${executionTime}ms`
      }
    }
    
    // Add pagination info if present
    if (response.pagination) {
      responseData.pagination = response.pagination
    }
    
    // Remove undefined values
    Object.keys(responseData).forEach(key => {
      if (responseData[key] === undefined) {
        delete responseData[key]
      }
    })
    
    return res.status(response.status).json(responseData)
  }
  
  /**
   * Handles request errors with enhanced logging and context
   */
  handleRequestError(error, req, next, requestId, executionTime) {
    // Enhance error with request context
    error.requestId = requestId
    error.executionTime = executionTime
    error.req = {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      requestId
    }
    
    // Log error with context
    this.logger.error('Request processing failed', {
      requestId,
      method: req.method,
      url: req.url,
      ip: req.ip,
      executionTime: `${executionTime}ms`,
      error: error.message,
      stack: error.stack
    })
    
    next(error)
  }
  
  /**
   * Logs request completion
   */
  logRequestCompletion(ctx, response, executionTime) {
    this.logger.info('Request completed', {
      requestId: ctx.requestId,
      method: ctx.method,
      url: ctx.url,
      status: response.status,
      executionTime: `${executionTime}ms`,
      userId: ctx.currentUser?.id
    })
  }
  
  /**
   * Async version of schema validation
   */
  async validateSchemaAsync(src, requestSchema, schemaTitle, ctx) {
    return this.validateSchema(src, requestSchema, schemaTitle, ctx)
  }

  /**
   * Enhanced schema validation with better error handling
   */
  validateSchema(src, requestSchema, schemaTitle, ctx = {}) {
    assert.object(src, { 
      required: true, 
      message: `Invalid request validation payload. Only object allowed. Actual type: ${Object.prototype.toString.call(src)}` 
    })
    assert.object(requestSchema, { required: true })
    assert.string(schemaTitle, { required: true })

    const schemaKeys = Object.keys(requestSchema)
    const srcKeys = Object.keys(src)

    // Enhanced default valid keys
    const defaultValidKeys = [
      'offset', 'page', 'limit', 'filter', 'orderBy', 'sort', 'search',
      'Content-Type', 'Referer', 'User-Agent', 'Language', 'Device-Type',
      'Accept', 'Accept-Language', 'Accept-Encoding', 'Cache-Control'
    ]
    
    const defaultFileValidKeys = [
      'fieldname', 'originalname', 'encoding', 'mimetype', 'size', 'buffer',
      'bucket', 'acl', 'contentType', 'contentDisposition', 'storageClass',
      'serverSideEncryption', 'metadata', 'location', 'etag', 'versionId'
    ]
    
    const invalidExtraKeys = srcKeys.filter(srcKey => 
      !schemaKeys.includes(srcKey) && 
      !defaultValidKeys.includes(srcKey) && 
      !defaultFileValidKeys.includes(srcKey)
    )

    if (invalidExtraKeys.length) {
      throw new ErrorWrapper({
        ...errorCodes.VALIDATION,
        message: `Extra keys found in '${schemaTitle}' payload: [${invalidExtraKeys.join(', ')}]`,
        layer: this.constructor.name,
        context: { 
          requestId: ctx.requestId,
          invalidKeys: invalidExtraKeys,
          allowedKeys: schemaKeys
        }
      })
    }

    if (!schemaKeys.length) return

    // Process validation rules
    const validationErrors = []
    
    schemaKeys.forEach(propName => {
      try {
        this.validateProperty(src, requestSchema[propName], propName, schemaTitle, ctx)
      } catch (error) {
        validationErrors.push(error)
      }
    })
    
    // Throw aggregated validation errors
    if (validationErrors.length > 0) {
      throw validationErrors[0] // For now, throw the first error
    }
  }
  
  /**
   * Validates individual property
   */
  validateProperty(src, requestRule, propName, schemaTitle, ctx) {
    const validationSrc = src[propName]
    const { schemaRule, options } = requestRule
    const { validator, description } = schemaRule
    const hasAllowedDefaultData = options.allowed.includes(validationSrc)

    // Check required fields
    if (options.required && !Object.prototype.hasOwnProperty.call(src, propName) && !hasAllowedDefaultData) {
      throw new ErrorWrapper({
        ...errorCodes.VALIDATION,
        message: `'${schemaTitle}.${propName}' field is required.`,
        layer: this.constructor.name,
        context: { 
          requestId: ctx.requestId,
          field: `${schemaTitle}.${propName}`,
          requirement: 'required'
        }
      })
    }

    // Validate existing properties
    if (Object.prototype.hasOwnProperty.call(src, propName)) {
      const tmpValidationResult = validator(validationSrc)
      
      if (!['boolean', 'string'].includes(typeof tmpValidationResult)) {
        throw new ErrorWrapper({
          ...errorCodes.DEV_IMPLEMENTATION,
          message: `Invalid '${schemaTitle}.${propName}' validation result. Validator should return boolean or string.`,
          layer: this.constructor.name,
          context: { requestId: ctx.requestId, field: `${schemaTitle}.${propName}` }
        })
      }

      const validationResult = tmpValidationResult || hasAllowedDefaultData
      
      if (typeof validationResult === 'string') {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: `Invalid '${schemaTitle}.${propName}' field. ${validationResult}`,
          layer: this.constructor.name,
          context: { 
            requestId: ctx.requestId,
            field: `${schemaTitle}.${propName}`,
            value: validationSrc,
            description: validationResult
          }
        })
      }
      
      if (validationResult === false) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: `Invalid '${schemaTitle}.${propName}' field. ${description}`,
          layer: this.constructor.name,
          context: { 
            requestId: ctx.requestId,
            field: `${schemaTitle}.${propName}`,
            value: validationSrc,
            description
          }
        })
      }
    }
  }
}

/**
 * Enhanced schema description generator with better error handling
 */
function getSchemaDescription(validationRules = {}) {
  assert.object(validationRules, { required: true })

  function getRuleDescription(propName, schema) {
    assert.string(propName, { required: true })
    assert.object(schema, { required: true })

    const requestRule = schema[propName]
    
    if (!requestRule) return null
    
    // Handle both RequestRule instances and plain objects
    if (requestRule instanceof RequestRule) {
      const { schemaRule, options } = requestRule
      return {
        description: schemaRule.description,
        required: options.required || false,
        allowed: options.allowed || [],
        type: schemaRule.type || 'unknown'
      }
    } else {
      // Fallback for plain objects
      return {
        description: requestRule.description || 'No description available',
        required: requestRule.required || false,
        allowed: requestRule.allowed || [],
        type: requestRule.type || 'unknown'
      }
    }
  }

  const result = {
    query: {},
    params: {},
    body: {},
    file: {},
    headers: {},
    cookies: {},
    meta: {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    }
  }
  
  const { query, params, body, file, headers, cookies } = validationRules

  try {
    if (query) {
      Object.keys(query).forEach(schemaPropName => {
        const description = getRuleDescription(schemaPropName, query)
        if (description) result.query[schemaPropName] = description
      })
    }
    
    if (params) {
      Object.keys(params).forEach(schemaPropName => {
        const description = getRuleDescription(schemaPropName, params)
        if (description) result.params[schemaPropName] = description
      })
    }
    
    if (body) {
      Object.keys(body).forEach(schemaPropName => {
        const description = getRuleDescription(schemaPropName, body)
        if (description) result.body[schemaPropName] = description
      })
    }
    
    if (file) {
      Object.keys(file).forEach(schemaPropName => {
        const description = getRuleDescription(schemaPropName, file)
        if (description) result.file[schemaPropName] = description
      })
    }
    
    if (headers) {
      Object.keys(headers).forEach(schemaPropName => {
        const description = getRuleDescription(schemaPropName, headers)
        if (description) result.headers[schemaPropName] = description
      })
    }
    
    if (cookies) {
      Object.keys(cookies).forEach(schemaPropName => {
        const description = getRuleDescription(schemaPropName, cookies)
        if (description) result.cookies[schemaPropName] = description
      })
    }
  } catch (error) {
    result.error = {
      message: 'Error generating schema description',
      details: error.message
    }
  }

  return result
}

module.exports = { BaseController }
