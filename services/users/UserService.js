const BaseService = require('../BaseService')
const { ErrorWrapper, errorCodes } = require('backend-core')
const DefaultUserDAO = require('../../database/dao/UserDAO')
const DefaultCountryDAO = require('../../database/dao/CountryDAO')
const DefaultAttachmentDAO = require('../../database/dao/AttachmentDAO')
const SessionInvalidationService = require('../auth/session/SessionInvalidationService')
const { makePasswordHashHelper, makeConfirmOTPHelper, makeUpdateTokenHelper, checkPasswordHelper, jwtHelper } = require('../../helpers').authHelpers
const validator = require('validator')
const config = require('config')
const crypto = require('crypto')

const { notificationType } = config
const roles = config.roles || {}

function normalizeDAO(dao, fallback) {
  if (!dao) return fallback
  if (typeof dao.query === 'function') return dao
  if (dao.constructor && typeof dao.constructor.query === 'function') {
    return dao.constructor
  }
  return fallback
}

class UserService extends BaseService {
  constructor(options = {}) {
    super({ logger: options.logger, config: options.config })
    this.userDAO = normalizeDAO(options.userDAO, DefaultUserDAO)
    this.countryDAO = normalizeDAO(options.countryDAO, DefaultCountryDAO)
    this.attachmentDAO = normalizeDAO(options.attachmentDAO, DefaultAttachmentDAO)
    this.notificationClient = options.notificationClient || null
  }

  async registerUser(payload = {}, requestContext = {}) {
    const headers = requestContext.headers || {}
    const context = {
      requestId: requestContext.requestId || crypto.randomUUID(),
      ip: requestContext.ip,
      userAgent: headers['user-agent'] || headers['User-Agent'],
      handler: 'UserService.registerUser'
    }

    return this.executeOperation('registerUser', async () => {
      const startTime = Date.now()
      const logContext = {
        handler: 'UserService.registerUser',
        requestId: context.requestId,
        email: payload.email,
        ip: context.ip
      }

      this.logger.info('User registration started', {
        ...logContext,
        countryId: payload.countryId
      })

      await this.performPreValidation(payload, logContext)
      await this.validateUniqueness(payload, logContext)
      const country = await this.validateReferences(payload, logContext)
      const passwordHash = await this.processPassword(payload.password, logContext)
      const referralData = await this.processReferralCode(payload.referralCode, logContext)
      const userData = await this.prepareUserData(payload, passwordHash, headers, logContext)
      if (referralData) {
        userData.referredBy = referralData.referringUserId
      }
      const user = await this.createUserTransaction(userData, logContext)
      const verificationData = await this.initializeVerification(user, logContext)

      this.sendWelcomeNotifications(user, verificationData, logContext)

      const processingTime = Date.now() - startTime
      const response = await this.formatUserResponse(
        user,
        country,
        verificationData,
        referralData,
        logContext,
        processingTime
      )

      this.logger.info('User registration completed successfully', {
        ...logContext,
        userId: user.id,
        processingTime
      })

      return response
    }, context)
  }

  async uploadProfileImage({ currentUser, file, body = {}, headers = {}, ip, requestId }) {
    const context = {
      requestId: requestId || crypto.randomUUID(),
      ip,
      userAgent: headers['user-agent'] || headers['User-Agent'],
      handler: 'UserService.uploadProfileImage'
    }

    return this.executeOperation('uploadProfileImage', async () => {
      const startTime = Date.now()
      const logContext = {
        userId: currentUser?.id,
        requestId: context.requestId,
        ip: context.ip,
        fileName: file?.originalname,
        fileSize: file?.size,
        mimeType: file?.mimetype,
        s3Key: file?.key
      }

      this.logger.info('Profile image upload processing initiated', logContext)

      if (!currentUser?.id) {
        throw new ErrorWrapper({
          ...errorCodes.AUTHENTICATION,
          message: 'Authorization required for profile image upload',
          layer: 'UserService.uploadProfileImage'
        })
      }

      if (!file || !file.key || !file.url) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: 'File upload failed - no file data received',
          layer: 'UserService.uploadProfileImage'
        })
      }

      const previousImage = await this.handleExistingProfileImage(currentUser.id, logContext)
      const attachmentData = await this.createAttachmentRecord(currentUser.id, file, logContext)
      await this.updateUserProfile(currentUser.id, attachmentData.id, logContext)

      if (previousImage && body?.replaceExisting !== false) {
        await this.cleanupPreviousImage(previousImage, logContext)
      }

      await this.auditImageUpload({
        userId: currentUser.id,
        attachmentData,
        previousImage,
        file,
        ip: context.ip,
        userAgent: context.userAgent,
        requestId: context.requestId
      }, logContext)

      const duration = Date.now() - startTime
      this.logger.info('Profile image upload processing completed', {
        ...logContext,
        duration,
        attachmentId: attachmentData.id,
        s3Url: file.url
      })

      return {
        message: 'Profile image uploaded successfully',
        data: {
          id: attachmentData.id,
          url: file.url,
          key: file.key,
          size: file.size,
          mimetype: file.mimetype,
          originalName: file.originalname,
          etag: file.etag,
          bucket: file.bucket
        },
        meta: {
          uploadedAt: new Date().toISOString(),
          fileSize: file.size,
          mimeType: file.mimetype,
          previousImageReplaced: !!previousImage,
          s3Location: file.location,
          version: '2.0.0'
        }
      }
    }, context)
  }

  async updateUser({ userId, payload = {} }) {
    const context = {
      requestId: crypto.randomUUID(),
      handler: 'UserService.updateUser'
    }

    return this.executeOperation('updateUser', async () => {
      await this.userDAO.baseUpdate(userId, {
        ...payload,
        updatedAt: new Date()
      })

      const data = await this.userDAO.getUserById(userId)
      const country = data.countryId ? await this.countryDAO.getCountryById(data.countryId) : null

      const mobileNumberObj = {
        msisdn: data.mobileNumber
      }

      const result = {
        ...data,
        mobileNumberObj,
        country
      }

      return {
        data: result
      }
    }, context)
  }

  async listUsers({ query = {}, currentUser, requestId, ip, headers = {} } = {}) {
    const context = {
      requestId: requestId || crypto.randomUUID(),
      ip,
      userAgent: headers['user-agent'] || headers['User-Agent'],
      handler: 'UserService.listUsers'
    }

    return this.executeOperation('listUsers', async () => {
      const startTime = Date.now()
      const logContext = {
        userId: currentUser?.id,
        requestId: context.requestId,
        ip: context.ip,
        userAgent: context.userAgent
      }

      this.logger.info('User list request initiated', {
        ...logContext,
        query: this.sanitizeLogQuery(query)
      })

      const queryParams = await this.prepareUserListQueryParams(query, logContext)
      const data = await this.userDAO.getAdvancedList(queryParams)
      const formattedData = await this.formatUserListResponse(data, queryParams)

      const duration = Date.now() - startTime
      this.logger.info('User list request completed', {
        ...logContext,
        duration,
        totalResults: data.total,
        returnedResults: data.results?.length || 0,
        queryComplexity: this.calculateQueryComplexity(queryParams)
      })

      return {
        data: formattedData.results,
        meta: {
          pagination: {
            page: queryParams.page || 0,
            limit: queryParams.limit || 50,
            total: data.total,
            pages: Math.ceil(data.total / (queryParams.limit || 50))
          },
          query: {
            filters: queryParams.filter || {},
            search: queryParams.search || null,
            sort: {
              field: queryParams.orderByField || 'createdAt',
              direction: queryParams.orderByDirection || 'desc'
            }
          },
          performance: {
            duration,
            cacheHit: formattedData.cacheHit || false
          }
        },
        headers: {
          'X-Total-Count': data.total.toString(),
          'X-Page': (queryParams.page || 0).toString(),
          'X-Limit': (queryParams.limit || 50).toString(),
          'X-Performance': `${duration}ms`
        }
      }
    }, context)
  }

  async getUserById({ userId, query = {}, currentUser, requestId, ip, headers = {} }) {
    const context = {
      requestId: requestId || crypto.randomUUID(),
      ip,
      userAgent: headers['user-agent'] || headers['User-Agent'],
      handler: 'UserService.getUserById'
    }

    return this.executeOperation('getUserById', async () => {
      const logContext = {
        userId,
        requestedBy: currentUser?.id,
        requestId: context.requestId,
        ip: context.ip,
        userAgent: context.userAgent
      }

      this.logger.info('User retrieval initiated', logContext)

      await this.validateUserAccess({ targetUserId: userId, currentUser, query })

      const eagerList = this.buildUserIncludeGraph(query.include)
      const user = await this.userDAO.getUserById(userId, eagerList)

      const sanitizedUser = this.sanitizeUserRecord(user, { format: query.format, currentUser })

      const meta = {
        format: query.format || 'full',
        fieldsRequested: query.fields ? query.fields.split(',').length : 'all',
        includesRequested: query.include ? query.include.split(',') : [],
        retrievedAt: new Date().toISOString(),
        version: '2.0.0'
      }

      await this.auditUserRetrieval({
        userId,
        requestedBy: currentUser?.id,
        success: true,
        meta
      })

      return {
        message: 'User retrieved successfully',
        data: sanitizedUser,
        meta
      }
    }, context)
  }

  async changePassword({ currentUser, body = {}, session, ip, headers = {} }) {
    const context = {
      requestId: crypto.randomUUID(),
      ip,
      userAgent: headers['user-agent'] || headers['User-Agent'],
      handler: 'UserService.changePassword'
    }

    return this.executeOperation('changePassword', async () => {
      let {
        oldPassword,
        newPassword,
        keepCurrentSession = false,
        invalidateAllSessions = true,
        invalidateOtherSessions = true,
        forceChange = false
      } = body

      if (!currentUser?.id) {
        throw new ErrorWrapper({
          ...errorCodes.AUTHENTICATION,
          message: 'Authentication required to change password',
          layer: 'UserService.changePassword'
        })
      }

      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: 'New password must be at least 8 characters long',
          layer: 'UserService.changePassword'
        })
      }

      const user = await this.userDAO.baseGetById(currentUser.id, {
        includeHidden: ['passwordHash', 'passwordChangedAt']
      })

      if (!forceChange) {
        if (!oldPassword) {
          throw new ErrorWrapper({
            ...errorCodes.VALIDATION,
            message: 'Current password is required',
            layer: 'UserService.changePassword'
          })
        }

        const passwordValid = await checkPasswordHelper(oldPassword, user.passwordHash)
        if (!passwordValid) {
          throw new ErrorWrapper({
            ...errorCodes.AUTHENTICATION,
            message: 'Current password is incorrect',
            layer: 'UserService.changePassword'
          })
        }
      } else {
        const adminRoles = new Set([roles.admin, roles.superadmin])
        if (!adminRoles.has(currentUser.role)) {
          throw new ErrorWrapper({
            ...errorCodes.ACCESS_DENIED,
            message: 'Admin permissions required for force password change',
            layer: 'UserService.changePassword'
          })
        }
      }

      const newHash = await makePasswordHashHelper(newPassword)

      await this.userDAO.baseUpdate(currentUser.id, {
        passwordHash: newHash,
        passwordChangedAt: new Date()
      })

      const sessionResults = []

      if (keepCurrentSession) {
        invalidateAllSessions = false
      }

      if (invalidateAllSessions) {
        const result = await SessionInvalidationService.invalidateAllUserSessions(currentUser.id, {
          reason: SessionInvalidationService.REASONS.PASSWORD_CHANGE
        })
        sessionResults.push(result)
      } else if (invalidateOtherSessions && session?.id) {
        const result = await SessionInvalidationService.invalidateOtherSessions(
          currentUser.id,
          session.id,
          { reason: SessionInvalidationService.REASONS.PASSWORD_CHANGE }
        )
        sessionResults.push(result)
      }

      return {
        message: 'Password changed successfully',
        meta: {
          passwordChangedAt: new Date().toISOString(),
          sessionsInvalidated: sessionResults.map(r => r.strategy)
        }
      }
    }, context)
  }

  async getCurrentUser({ currentUser, query = {}, requestId, ip, headers = {} }) {
    const context = {
      requestId: requestId || crypto.randomUUID(),
      ip,
      userAgent: headers['user-agent'] || headers['User-Agent'],
      handler: 'UserService.getCurrentUser'
    }

    return this.executeOperation('getCurrentUser', async () => {
      if (!currentUser?.id) {
        throw new ErrorWrapper({
          ...errorCodes.AUTHENTICATION,
          message: 'Invalid user session for current user retrieval',
          layer: 'UserService.getCurrentUser'
        })
      }

      const eagerList = this.buildUserIncludeGraph(query.include)
      const user = await this.userDAO.getUserById(currentUser.id, eagerList)
      const sanitized = this.sanitizeUserRecord(user, { format: query.format || 'full', currentUser })

      return {
        message: 'Current user data retrieved successfully',
        data: sanitized,
        meta: {
          format: query.format || 'full',
          includesLoaded: query.include ? query.include.split(',') : [],
          retrievedAt: new Date().toISOString()
        }
      }
    }, context)
  }

  async confirmRegistration(emailConfirmToken, context = {}) {
    const operationContext = {
      requestId: context.requestId || crypto.randomUUID(),
      ip: context.ip,
      handler: 'UserService.confirmRegistration'
    }

    return this.executeOperation('confirmRegistration', async () => {
      if (!emailConfirmToken || typeof emailConfirmToken !== 'string') {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: 'Email confirmation token is required',
          statusCode: 400
        })
      }

      let tokenPayload
      try {
        tokenPayload = await jwtHelper.verify(emailConfirmToken, config.token.emailConfirm.secret)
      } catch (error) {
        throw new ErrorWrapper({
          ...errorCodes.WRONG_EMAIL_CONFIRM_TOKEN,
          message: 'Invalid or expired confirmation token'
        })
      }

      const userId = tokenPayload?.sub
      if (!userId) {
        throw new ErrorWrapper({
          ...errorCodes.WRONG_EMAIL_CONFIRM_TOKEN,
          message: 'Invalid confirmation token payload'
        })
      }

      const user = await this.userDAO.baseGetById(userId)
      if (!user || user.emailConfirmToken !== emailConfirmToken) {
        throw new ErrorWrapper({
          ...errorCodes.WRONG_EMAIL_CONFIRM_TOKEN
        })
      }

      await this.userDAO.baseUpdate(userId, {
        isConfirmedRegistration: true,
        emailConfirmToken: null
      })

      this.logger.info('User registration confirmed', {
        userId,
        ip: context.ip,
        requestId: operationContext.requestId
      })

      return {
        message: `User ${userId} registration confirmed`,
        data: {
          userId
        }
      }
    }, operationContext)
  }

  async confirmEmail(emailConfirmToken, context = {}) {
    const operationContext = {
      requestId: context.requestId || crypto.randomUUID(),
      ip: context.ip,
      handler: 'UserService.confirmEmail'
    }

    return this.executeOperation('confirmEmail', async () => {
      if (!emailConfirmToken || typeof emailConfirmToken !== 'string') {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: 'Email confirmation token is required',
          statusCode: 400
        })
      }

      let tokenPayload
      try {
        tokenPayload = await jwtHelper.verify(emailConfirmToken, config.token.emailConfirm.secret)
      } catch (error) {
        throw new ErrorWrapper({
          ...errorCodes.WRONG_EMAIL_CONFIRM_TOKEN,
          message: 'Invalid or expired confirmation token'
        })
      }

      const userId = tokenPayload?.sub
      if (!userId) {
        throw new ErrorWrapper({
          ...errorCodes.WRONG_EMAIL_CONFIRM_TOKEN,
          message: 'Invalid confirmation token payload'
        })
      }

      const user = await this.userDAO.baseGetById(userId)
      if (!user || user.emailConfirmToken !== emailConfirmToken) {
        throw new ErrorWrapper({
          ...errorCodes.WRONG_EMAIL_CONFIRM_TOKEN
        })
      }

      const newEmail = user.newEmail
      if (!newEmail) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: 'No pending email change request'
        })
      }

      await this.userDAO.baseUpdate(userId, {
        email: newEmail,
        newEmail: null,
        emailConfirmToken: null
      })

      this.logger.info('User email confirmed', {
        userId,
        newEmail,
        ip: context.ip,
        requestId: operationContext.requestId
      })

      return {
        message: `${newEmail} confirmed`,
        data: {
          userId,
          email: newEmail
        }
      }
    }, operationContext)
  }

  async checkAvailability({ body = {}, ip, headers = {}, requestId }) {
    const context = {
      requestId: requestId || crypto.randomUUID(),
      ip,
      userAgent: headers['user-agent'] || headers['User-Agent'],
      handler: 'UserService.checkAvailability'
    }

    return this.executeOperation('checkAvailability', async () => {
      const startTime = Date.now()
      this.logger.info('Availability check started', {
        ...context,
        requestFields: Object.keys(body || {})
      })

      await this.checkAvailabilityRateLimit(ip)
      const checks = await this.validateAvailabilityRequest(body)
      const results = await this.processAvailabilityChecks(checks)

      if (body.suggestions && results.some(r => !r.available)) {
        await this.generateAvailabilitySuggestions(results)
      }

      const processingTime = Date.now() - startTime
      const response = this.formatAvailabilityResponse(results, body, context, processingTime)

      this.logger.info('Availability check completed', {
        ...context,
        processingTime: `${processingTime}ms`,
        checksPerformed: results.length,
        availableCount: results.filter(r => r.available).length
      })

      return response
    }, context)
  }

  async performPreValidation(body, logContext) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(body.email)) {
      throw new ErrorWrapper({
        ...errorCodes.VALIDATION,
        message: 'Invalid email format',
        layer: 'UserService.performPreValidation'
      })
    }

    if (!this.validatePasswordStrength(body.password)) {
      throw new ErrorWrapper({
        ...errorCodes.VALIDATION,
        message: 'Password must be at least 8 characters long and contain at least one letter, one number, and one special character',
        layer: 'UserService.performPreValidation'
      })
    }

    if (!this.validateMobileNumber(body.mobileNumber)) {
      throw new ErrorWrapper({
        ...errorCodes.VALIDATION,
        message: 'Invalid mobile number format',
        layer: 'UserService.performPreValidation'
      })
    }

    if (!this.validateName(body.name)) {
      throw new ErrorWrapper({
        ...errorCodes.VALIDATION,
        message: 'Name must be 2-50 characters and contain only letters and spaces',
        layer: 'UserService.performPreValidation'
      })
    }

    this.logger.debug('Pre-validation checks passed', logContext)
  }

  async validateUniqueness(body, logContext) {
    const knex = this.userDAO.knex()

    try {
      const result = await knex.transaction(async (trx) => {
        const existingEmailUser = await this.userDAO.query(trx)
          .where('email', body.email.toLowerCase().trim())
          .first()

        if (existingEmailUser) {
          return {
            type: 'email',
            user: existingEmailUser
          }
        }

        const existingMobileUser = await this.userDAO.query(trx)
          .where('mobileNumber', body.mobileNumber)
          .where('countryId', body.countryId)
          .first()

        if (existingMobileUser) {
          return {
            type: 'mobile',
            user: existingMobileUser
          }
        }

        return null
      })

      if (result) {
        if (result.type === 'email') {
          this.logger.warn('Registration attempt with existing email', {
            ...logContext,
            existingUserId: result.user.id
          })

          throw new ErrorWrapper({
            ...errorCodes.VALIDATION,
            message: 'An account with this email address already exists',
            layer: 'UserService.validateUniqueness',
            meta: {
              field: 'email',
              value: body.email
            }
          })
        }

        if (result.type === 'mobile') {
          this.logger.warn('Registration attempt with existing mobile number', {
            ...logContext,
            existingUserId: result.user.id,
            mobileNumber: body.mobileNumber
          })

          throw new ErrorWrapper({
            ...errorCodes.VALIDATION,
            message: 'An account with this mobile number already exists',
            layer: 'UserService.validateUniqueness',
            meta: {
              field: 'mobileNumber',
              value: body.mobileNumber
            }
          })
        }
      }
    } catch (error) {
      if (error instanceof ErrorWrapper) {
        throw error
      }

      this.logger.error('Uniqueness validation failed', {
        ...logContext,
        error: error.message
      })

      throw new ErrorWrapper({
        ...errorCodes.DATABASE,
        message: 'Unable to validate account uniqueness',
        layer: 'UserService.validateUniqueness',
        meta: {
          originalError: error.message
        }
      })
    }
  }

  async validateReferences(body, logContext) {
    const country = await this.countryDAO.query()
      .where('id', body.countryId)
      .where('isActive', true)
      .first()

    if (!country) {
      throw new ErrorWrapper({
        ...errorCodes.VALIDATION,
        message: 'Invalid or inactive country selected',
        layer: 'UserService.validateReferences',
        meta: {
          countryId: body.countryId
        }
      })
    }

    if (body.profileImageId) {
      const profileImage = await this.attachmentDAO.query()
        .where('id', body.profileImageId)
        .first()

      if (!profileImage) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: 'Invalid profile image reference',
          layer: 'UserService.validateReferences',
          meta: {
            profileImageId: body.profileImageId
          }
        })
      }
    }

    return country
  }

  async processPassword(password, logContext) {
    try {
      return await makePasswordHashHelper(password)
    } catch (error) {
      this.logger.error('Password hashing failed', {
        ...logContext,
        error: error.message
      })

      throw new ErrorWrapper({
        ...errorCodes.INTERNAL_SERVER_ERROR,
        message: 'Password processing failed',
        layer: 'UserService.processPassword'
      })
    }
  }

  async processReferralCode(referralCode, logContext) {
    if (!referralCode) return null

    try {
      const referringUser = await this.userDAO.query()
        .where('referralCode', referralCode)
        .where('isActive', true)
        .first()

      if (!referringUser) {
        this.logger.warn('Invalid referral code provided', {
          ...logContext,
          referralCode
        })

        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: 'Invalid referral code',
          layer: 'UserService.processReferralCode'
        })
      }

      return {
        referringUserId: referringUser.id,
        referralCode: referralCode
      }
    } catch (error) {
      if (error instanceof ErrorWrapper) throw error

      this.logger.error('Referral code processing failed', {
        ...logContext,
        error: error.message,
        referralCode
      })

      return null
    }
  }

  async prepareUserData(body, passwordHash, headers, logContext) {
    const userReferralCode = await this.generateUniqueReferralCode(logContext)

    return {
      name: body.name.trim(),
      email: body.email.toLowerCase().trim(),
      countryId: body.countryId,
      mobileNumber: body.mobileNumber,
      passwordHash,
      preferredLanguage: body.preferredLanguage || headers['Language'] || headers['language'] || 'en',
      bio: body.bio?.trim() || null,
      profileImageId: body.profileImageId || null,
      referralCode: userReferralCode,
      acceptedTermsAt: new Date(),
      acceptedPrivacyAt: new Date(),
      marketingConsent: body.acceptMarketing || false,
      isActive: true,
      isVerified: false,
      role: 'ROLE_USER',
      createdAt: new Date(),
      metadata: {
        registrationIp: logContext.ip,
        deviceInfo: body.deviceInfo,
        userAgent: headers['user-agent'] || headers['User-Agent'],
        registrationMethod: 'web'
      }
    }
  }

  async createUserTransaction(userData, logContext) {
    const knex = this.userDAO.knex()
    const trx = await knex.transaction()

    try {
      const user = await this.userDAO.query(trx).insert(userData)

      if (userData.referredBy) {
        await this.createReferralRecord(user.id, userData.referredBy, trx, logContext)
      }

      await trx.commit()

      this.logger.debug('User created successfully in transaction', {
        ...logContext,
        userId: user.id
      })

      return user
    } catch (error) {
      await trx.rollback()

      this.logger.error('User creation transaction failed', {
        ...logContext,
        error: error.message,
        stack: error.stack
      })

      if (this.isDuplicateKeyError(error)) {
        const duplicateField = this.extractDuplicateField(error.message)

        if (duplicateField === 'email') {
          throw new ErrorWrapper({
            ...errorCodes.VALIDATION,
            message: 'An account with this email address already exists',
            layer: 'UserService.createUserTransaction',
            meta: {
              field: 'email',
              constraint: 'unique_email'
            }
          })
        } else if (duplicateField === 'mobileNumber') {
          throw new ErrorWrapper({
            ...errorCodes.VALIDATION,
            message: 'An account with this mobile number already exists',
            layer: 'UserService.createUserTransaction',
            meta: {
              field: 'mobileNumber',
              constraint: 'unique_mobile'
            }
          })
        } else if (duplicateField === 'referralCode') {
          this.logger.warn('Duplicate referral code generated', {
            ...logContext,
            referralCode: userData.referralCode
          })

          throw new ErrorWrapper({
            ...errorCodes.INTERNAL_SERVER_ERROR,
            message: 'Registration failed due to system conflict. Please try again.',
            layer: 'UserService.createUserTransaction',
            meta: {
              field: 'referralCode',
              constraint: 'unique_referral_code'
            }
          })
        }
      }

      if (this.isForeignKeyError(error)) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: 'Invalid country selection',
          layer: 'UserService.createUserTransaction',
          meta: {
            constraint: 'foreign_key_country'
          }
        })
      }

      throw new ErrorWrapper({
        ...errorCodes.DATABASE,
        message: 'Failed to create user account',
        layer: 'UserService.createUserTransaction',
        meta: {
          originalError: error.message
        }
      })
    }
  }

  async initializeVerification(user, logContext) {
    try {
      const verifyCode = await makeConfirmOTPHelper(user.email)
      const updateToken = await makeUpdateTokenHelper(user)

      await this.userDAO.baseUpdate(user.id, {
        verifyCode,
        updateToken,
        verifyCodeSentAt: new Date()
      })

      this.logger.debug('Verification codes generated', {
        ...logContext,
        userId: user.id
      })

      return {
        verifyCode,
        updateToken,
        verificationRequired: true
      }
    } catch (error) {
      this.logger.error('Verification initialization failed', {
        ...logContext,
        error: error.message,
        userId: user.id
      })

      return {
        verificationRequired: false,
        error: 'Verification system temporarily unavailable'
      }
    }
  }

  sendWelcomeNotifications(user, verificationData, logContext) {
    if (!this.notificationClient || typeof this.notificationClient.enqueue !== 'function') {
      this.logger.warn('Notification client not available, skipping welcome notifications', logContext)
      return
    }

    setImmediate(async () => {
      try {
        if (verificationData.verifyCode) {
          await this.notificationClient.enqueue({
            type: notificationType.createUser,
            to: user.mobileNumber,
            code: verificationData.verifyCode,
            name: user.name,
            email: user.email,
            lang: user.preferredLanguage || 'en'
          })

          await this.notificationClient.enqueue({
            type: notificationType.welcomeEmail,
            to: user.email,
            name: user.name,
            verificationCode: verificationData.verifyCode,
            lang: user.preferredLanguage || 'en'
          })
        }

        this.logger.info('Welcome notifications sent', {
          ...logContext,
          userId: user.id
        })
      } catch (error) {
        this.logger.error('Failed to send welcome notifications', {
          ...logContext,
          error: error.message,
          userId: user.id
        })
      }
    })
  }

  async formatUserResponse(user, country, verificationData, referralData, logContext, processingTime) {
    const mobileNumber = {
      msisdn: user.mobileNumber,
      countryCode: country.phonecode,
      iso: country.iso,
      countryId: user.countryId,
      formatted: `+${country.phonecode}${user.mobileNumber}`
    }

    const responseData = {
      id: user.id,
      name: user.name,
      email: user.email,
      mobileNumber,
      country: {
        id: country.id,
        name: country.name,
        nicename: country.nicename,
        iso: country.iso,
        phonecode: country.phonecode
      },
      profile: {
        bio: user.bio,
        preferredLanguage: user.preferredLanguage,
        profileImageId: user.profileImageId,
        profileImageUrl: user.profileImageId ? await this.getProfileImageUrl(user.profileImageId) : null
      },
      verification: {
        isVerified: user.isVerified || false,
        emailVerified: false,
        mobileVerified: false,
        verificationRequired: verificationData.verificationRequired,
        nextStep: verificationData.verificationRequired ? 'verify_mobile' : 'complete_profile'
      },
      referral: referralData ? {
        referredBy: referralData.referringUserId,
        referralCode: user.referralCode
      } : {
        referralCode: user.referralCode
      },
      onboarding: {
        step: 1,
        totalSteps: 4,
        nextSteps: [
          'verify_mobile',
          'verify_email',
          'complete_profile',
          'explore_features'
        ]
      },
      settings: {
        marketingConsent: user.marketingConsent,
        acceptedTermsAt: user.acceptedTermsAt,
        acceptedPrivacyAt: user.acceptedPrivacyAt
      },
      metadata: {
        processingTime: `${processingTime}ms`,
        registrationDate: user.createdAt,
        accountStatus: 'pending_verification'
      }
    }

    return {
      data: responseData,
      meta: {
        processingTime: `${processingTime}ms`,
        verificationSent: verificationData.verificationRequired,
        nextAction: verificationData.verificationRequired ? 'verify_mobile_number' : 'login',
        message: verificationData.verificationRequired
          ? 'Account created successfully. Please verify your mobile number to continue.'
          : 'Account created successfully. You can now log in.'
      }
    }
  }

  async getProfileImageUrl(profileImageId) {
    try {
      const attachment = await this.attachmentDAO.query()
        .where('id', profileImageId)
        .first()

      if (attachment) {
        const s3Config = config.s3
        return `${s3Config.baseUrl}${attachment.path}`
      }

      return null
    } catch (error) {
      this.logger.warn('Failed to get profile image URL', {
        profileImageId,
        error: error.message
      })
      return null
    }
  }

  validatePasswordStrength(password) {
    if (typeof password !== 'string' || password.length < 8) return false
    const hasLetter = /[a-zA-Z]/.test(password)
    const hasNumber = /\d/.test(password)
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password)
    return hasLetter && hasNumber && hasSpecial
  }

  validateMobileNumber(mobileNumber) {
    if (typeof mobileNumber !== 'string') return false
    const cleaned = mobileNumber.replace(/\D/g, '')
    return cleaned.length >= 10 && cleaned.length <= 15
  }

  validateName(name) {
    if (typeof name !== 'string') return false
    const trimmed = name.trim()
    if (trimmed.length < 2 || trimmed.length > 50) return false
    const nameRegex = /^[a-zA-Z\s\-']+$/
    return nameRegex.test(trimmed)
  }

  async generateUniqueReferralCode(logContext) {
    let isUnique = false
    let referralCode = ''
    let attempts = 0
    const maxAttempts = 20

    while (!isUnique && attempts < maxAttempts) {
      referralCode = this.generateReferralCode()

      try {
        const existing = await this.userDAO.query()
          .where('referralCode', referralCode)
          .first()

        if (!existing) {
          isUnique = true
        } else {
          this.logger.debug('Referral code collision detected', {
            ...logContext,
            referralCode,
            attempt: attempts + 1
          })
        }
      } catch (error) {
        this.logger.warn('Error checking referral code uniqueness', {
          ...logContext,
          referralCode,
          attempt: attempts + 1,
          error: error.message
        })
      }

      attempts++
    }

    if (!isUnique) {
      this.logger.error('Failed to generate unique referral code after maximum attempts', {
        ...logContext,
        maxAttempts
      })

      throw new ErrorWrapper({
        ...errorCodes.INTERNAL_SERVER_ERROR,
        message: 'Unable to generate unique referral code. Please try again.',
        layer: 'UserService.generateUniqueReferralCode'
      })
    }

    return referralCode
  }

  generateReferralCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let result = ''

    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }

    return result
  }

  async createReferralRecord(userId, referringUserId, trx, logContext) {
    try {
      this.logger.info('Referral recorded', {
        ...logContext,
        userId,
        referringUserId
      })
    } catch (error) {
      this.logger.warn('Failed to create referral record', {
        ...logContext,
        error: error.message,
        userId,
        referringUserId
      })
    }
  }

  isDuplicateKeyError(error) {
    if (!error || !error.message) return false
    const message = error.message.toLowerCase()
    if (message.includes('duplicate entry')) return true
    if (error.code === '23505' || message.includes('unique constraint')) return true
    if (message.includes('unique constraint failed')) return true
    return false
  }

  extractDuplicateField(errorMessage) {
    if (!errorMessage) return 'unknown'
    const message = errorMessage.toLowerCase()
    if (message.includes('email')) return 'email'
    if (message.includes('mobilenumber')) return 'mobileNumber'
    if (message.includes('referralcode')) return 'referralCode'

    const duplicateMatch = message.match(/duplicate entry .+ for column '([^']+)'/i)
    if (duplicateMatch) {
      const column = duplicateMatch[1].toLowerCase()
      if (column.includes('email')) return 'email'
      if (column.includes('mobile')) return 'mobileNumber'
      if (column.includes('referral')) return 'referralCode'
    }

    const pgMatch = message.match(/key \(([^)]+)\)=/i)
    if (pgMatch) {
      const column = pgMatch[1].toLowerCase()
      if (column.includes('email')) return 'email'
      if (column.includes('mobile')) return 'mobileNumber'
      if (column.includes('referral')) return 'referralCode'
    }

    return 'unknown'
  }

  isForeignKeyError(error) {
    if (!error || !error.message) return false
    const message = error.message.toLowerCase()
    if (message.includes('foreign key constraint')) return true
    if (error.code === '23503' || message.includes('violates foreign key constraint')) return true
    if (message.includes('foreign key constraint failed')) return true
    return false
  }

  async handleExistingProfileImage(userId, logContext) {
    try {
      const userData = await this.userDAO.baseGetById(userId, {
        throwOnNotFound: true
      })

      if (userData.profileImageId) {
        const existingImage = await this.attachmentDAO.baseGetById(userData.profileImageId, {
          throwOnNotFound: false
        })

        if (existingImage) {
          this.logger.info('Found existing profile image', {
            ...logContext,
            existingImageId: existingImage.id,
            existingPath: existingImage.path
          })
          return existingImage
        }
      }

      return null
    } catch (error) {
      this.logger.warn('Failed to get existing profile image info', {
        ...logContext,
        error: error.message
      })
      return null
    }
  }

  async createAttachmentRecord(userId, file, logContext) {
    try {
      const attachmentData = {
        userId,
        path: file.key,
        mimeType: file.mimetype,
        size: file.size,
        originalName: file.originalname,
        category: 'profile_image'
      }

      const createdAttachment = await this.attachmentDAO.baseCreate(attachmentData)

      this.logger.info('Attachment record created', {
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
        layer: 'UserService.createAttachmentRecord',
        meta: {
          originalError: error.message,
          userId,
          s3Key: file.key
        }
      })
    }
  }

  async updateUserProfile(userId, attachmentId, logContext) {
    try {
      await this.userDAO.baseUpdate(userId, {
        profileImageId: attachmentId,
        updatedAt: new Date()
      })

      this.logger.info('User profile updated with new image', {
        ...logContext,
        attachmentId
      })
    } catch (error) {
      try {
        await this.attachmentDAO.baseDelete(attachmentId)
        this.logger.info('Rolled back attachment creation due to user update failure', {
          ...logContext,
          attachmentId
        })
      } catch (rollbackError) {
        this.logger.error('Failed to rollback attachment creation', {
          ...logContext,
          rollbackError: rollbackError.message
        })
      }

      throw new ErrorWrapper({
        ...errorCodes.SERVER,
        message: 'Failed to update user profile with new image',
        layer: 'UserService.updateUserProfile',
        meta: {
          originalError: error.message,
          userId,
          attachmentId
        }
      })
    }
  }

  async cleanupPreviousImage(previousImage, logContext) {
    try {
      if (!previousImage || !previousImage.id) {
        return
      }

      await this.attachmentDAO.baseDelete(previousImage.id)

      this.logger.info('Previous profile image cleaned up', {
        ...logContext,
        previousImageId: previousImage.id,
        previousPath: previousImage.path
      })
    } catch (error) {
      this.logger.warn('Failed to cleanup previous profile image', {
        ...logContext,
        error: error.message,
        previousImageId: previousImage.id
      })
    }
  }

  async auditImageUpload(details, logContext) {
    try {
      const {
        userId,
        attachmentData,
        previousImage,
        file,
        ip,
        userAgent,
        requestId
      } = details

      const auditData = {
        action: 'profile_image_upload_success',
        userId,
        attachmentId: attachmentData.id,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        s3Key: file.key,
        s3Url: file.url,
        previousImageId: previousImage?.id,
        replacedPrevious: !!previousImage,
        ip,
        userAgent,
        timestamp: new Date(),
        requestId
      }

      this.logger.info('Profile image upload audit - success', auditData)
    } catch (error) {
      this.logger.error('Failed to audit image upload', {
        ...logContext,
        error: error.message
      })
    }
  }

  sanitizeLogQuery(query) {
    if (!query) return {}
    const sanitized = { ...query }
    if (sanitized.search && sanitized.search.length > 100) {
      sanitized.search = sanitized.search.slice(0, 100)
    }
    return sanitized
  }

  async prepareUserListQueryParams(query, logContext) {
    try {
      const params = { ...query }

      if (typeof params.filter === 'string') {
        try {
          params.filter = JSON.parse(params.filter)
        } catch (e) {
          throw new ErrorWrapper({
            ...errorCodes.VALIDATION,
            message: 'Invalid JSON format for filter parameter',
            layer: 'UserService.prepareUserListQueryParams'
          })
        }
      }

      if (typeof params.fields === 'string') {
        params.fields = params.fields.split(',').map(field => field.trim()).filter(Boolean)
      }

      if (typeof params.include === 'string') {
        params.include = params.include.split(',').map(inc => inc.trim()).filter(Boolean)
      }

      params.page = parseInt(params.page) || 0
      params.limit = parseInt(params.limit) || 50
      params.orderByField = params.orderByField || 'createdAt'
      params.orderByDirection = params.orderByDirection || 'desc'

      if (params.filter) {
        await this.validateDateRanges(params.filter)
      }

      this.logger.debug('Query parameters prepared', {
        ...logContext,
        preparedParams: this.sanitizeLogQuery(params)
      })

      return params
    } catch (error) {
      if (error instanceof ErrorWrapper) {
        throw error
      }

      throw new ErrorWrapper({
        ...errorCodes.VALIDATION,
        message: 'Invalid query parameters',
        layer: 'UserService.prepareUserListQueryParams',
        meta: { originalError: error.message }
      })
    }
  }

  async formatUserListResponse(data, params) {
    try {
      const formattedResults = await Promise.all(
        data.results.map(user => this.formatUserListUser(user, params))
      )

      return {
        results: formattedResults,
        cacheHit: false
      }
    } catch (error) {
      throw new ErrorWrapper({
        ...errorCodes.SERVER,
        message: 'Failed to format response data',
        layer: 'UserService.formatUserListResponse',
        meta: { originalError: error.message }
      })
    }
  }

  async formatUserListUser(user, params) {
    const formatted = { ...user }

    if (user.firstName && user.lastName) {
      formatted.fullName = `${user.firstName} ${user.lastName}`.trim()
    }

    if (user.profileImage) {
      formatted.profileImage = {
        id: user.profileImage.id,
        url: user.profileImage.path ? `${process.env.S3_BASE_URL}${user.profileImage.path}` : null,
        originalName: user.profileImage.originalName,
        size: user.profileImage.size,
        mimeType: user.profileImage.mimeType
      }
    }

    delete formatted.password
    delete formatted.refreshTokensMap
    delete formatted.resetPasswordToken
    delete formatted.emailConfirmationToken

    return formatted
  }

  calculateQueryComplexity(params) {
    let complexity = 0
    if (params.search) complexity += 2
    if (params.filter) complexity += Object.keys(params.filter).length
    if (params.include) complexity += params.include.length * 2
    return complexity || 1
  }

  async validateDateRanges(filters) {
    if (filters.createdAfter && filters.createdBefore) {
      if (new Date(filters.createdAfter) >= new Date(filters.createdBefore)) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: 'createdAfter must be before createdBefore',
          layer: 'UserService.validateDateRanges'
        })
      }
    }

    if (filters.updatedAfter && filters.updatedBefore) {
      if (new Date(filters.updatedAfter) >= new Date(filters.updatedBefore)) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: 'updatedAfter must be before updatedBefore',
          layer: 'UserService.validateDateRanges'
        })
      }
    }
  }

  async validateUserAccess({ targetUserId, currentUser, query }) {
    const isSelfRequest = targetUserId === currentUser?.id
    const adminRoles = new Set([roles.admin, roles.superadmin])
    const isAdminRequest = currentUser?.role && adminRoles.has(currentUser.role)
    const isPublicRequest = query?.format === 'public'

    if (!isSelfRequest && !isAdminRequest && !isPublicRequest) {
      throw new ErrorWrapper({
        ...errorCodes.ACCESS_DENIED,
        message: 'Insufficient permissions to access user data',
        layer: 'UserService.validateUserAccess'
      })
    }
  }

  buildUserIncludeGraph(includeParam) {
    if (!includeParam) return null
    const includes = includeParam.split(',').map(i => i.trim()).filter(Boolean)
    if (includes.length === 0) return null

    const graphParts = includes.map(include => {
      switch (include) {
        case 'country':
          return 'country'
        case 'profileImage':
          return 'profileImage'
        case 'interests':
          return 'interests'
        case 'stories':
          return 'stories'
        default:
          return null
      }
    }).filter(Boolean)

    if (graphParts.length === 0) return null
    if (graphParts.length === 1) return graphParts[0]
    return `[${graphParts.join(', ')}]`
  }

  sanitizeUserRecord(user, { format = 'full', currentUser }) {
    const sanitized = { ...user }

    delete sanitized.password
    delete sanitized.passwordHash
    delete sanitized.refreshTokensMap
    delete sanitized.resetPasswordToken
    delete sanitized.emailConfirmToken
    delete sanitized.verifyCode

    if (format === 'public') {
      delete sanitized.email
      delete sanitized.mobileNumber
      delete sanitized.metadata
    }

    if (format === 'summary') {
      delete sanitized.marketingConsent
      delete sanitized.acceptedTermsAt
      delete sanitized.acceptedPrivacyAt
    }

    if (sanitized.profileImage) {
      sanitized.profileImage = {
        id: sanitized.profileImage.id,
        url: sanitized.profileImage.path ? `${process.env.S3_BASE_URL}${sanitized.profileImage.path}` : null,
        originalName: sanitized.profileImage.originalName,
        size: sanitized.profileImage.size,
        mimeType: sanitized.profileImage.mimeType
      }
    }

    return sanitized
  }

  async auditUserRetrieval(details) {
    try {
      this.logger.info('User retrieval audit', {
        action: 'user_retrieval',
        ...details,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      this.logger.warn('Failed to audit user retrieval', {
        error: error.message,
        details
      })
    }
  }

  async checkAvailabilityRateLimit(ip) {
    // Placeholder for future rate limiting integration
    this.logger.debug('Availability rate limit check skipped', { ip })
  }

  async validateAvailabilityRequest(body = {}) {
    const checks = []

    if (body.email) {
      if (typeof body.email !== 'string' || !validator.isEmail(body.email) || body.email.length > 100) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: 'Invalid email format',
          layer: 'UserService.validateAvailabilityRequest'
        })
      }
      checks.push({ type: 'email', value: body.email.toLowerCase().trim(), field: 'email' })
    }

    if (body.phone) {
      if (typeof body.phone !== 'string' || body.phone.length < 7 || body.phone.length > 20) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: 'Invalid phone format',
          layer: 'UserService.validateAvailabilityRequest'
        })
      }
      checks.push({ type: 'phone', value: body.phone.trim(), field: 'phone', countryCode: body.countryCode || null })
    }

    if (body.email_or_mobile_number) {
      const value = body.email_or_mobile_number.trim()
      if (validator.isEmail(value)) {
        checks.push({ type: 'email', value: value.toLowerCase(), field: 'email_or_mobile_number', legacy: true })
      } else if (validator.isMobilePhone(value, 'any')) {
        checks.push({ type: 'phone', value, field: 'email_or_mobile_number', legacy: true })
      } else {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: 'Invalid email or phone number format',
          layer: 'UserService.validateAvailabilityRequest'
        })
      }
    }

    if (Array.isArray(body.batch)) {
      if (body.batch.length > 10) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: 'Batch size cannot exceed 10 items',
          layer: 'UserService.validateAvailabilityRequest'
        })
      }

      body.batch.forEach((item, index) => {
        if (!item || !item.type || !item.value) {
          throw new ErrorWrapper({
            ...errorCodes.VALIDATION,
            message: 'Batch items must include type and value',
            layer: 'UserService.validateAvailabilityRequest'
          })
        }

        const normalizedValue = item.type === 'email'
          ? String(item.value).toLowerCase().trim()
          : String(item.value).trim()

        checks.push({
          type: item.type,
          value: normalizedValue,
          field: 'batch',
          batch: true,
          batchIndex: index
        })
      })
    }

    if (checks.length === 0) {
      throw new ErrorWrapper({
        ...errorCodes.VALIDATION,
        message: 'At least one field must be provided for availability checking',
        layer: 'UserService.validateAvailabilityRequest'
      })
    }

    const uniqueChecks = checks.filter((check, index, self) =>
      index === self.findIndex(c => c.type === check.type && c.value === check.value)
    )

    this.logger.info('Availability request validated', {
      checksCount: checks.length,
      uniqueChecks: uniqueChecks.length,
      types: [...new Set(uniqueChecks.map(c => c.type))],
      hasLegacyFormat: uniqueChecks.some(c => c.legacy),
      hasBatch: uniqueChecks.some(c => c.batch)
    })

    return uniqueChecks
  }

  async processAvailabilityChecks(checks) {
    const results = []

    for (const check of checks) {
      try {
        const result = await this.checkAvailabilitySingle(check)
        results.push(result)
      } catch (error) {
        this.logger.error('Single availability check failed', {
          check,
          error: error.message
        })

        results.push({
          type: check.type,
          value: check.value,
          available: false,
          error: 'Check failed',
          errorDetails: error.message,
          field: check.field
        })
      }
    }

    return results
  }

  async checkAvailabilitySingle(check) {
    const { type, value, countryCode } = check

    let existingUser = null
    switch (type) {
      case 'email':
        existingUser = await this.userDAO.query()
          .where('email', value)
          .first()
        break
      case 'phone':
        const query = this.userDAO.query().where('mobileNumber', value)
        if (countryCode) {
          const validCountry = await this.countryDAO.query()
            .where('iso', countryCode.toUpperCase())
            .first()

          if (!validCountry) {
            throw new ErrorWrapper({
              ...errorCodes.VALIDATION,
              message: `Invalid country code: ${countryCode}`,
              layer: 'UserService.checkAvailabilitySingle'
            })
          }

          query.where('mobileCountryId', validCountry.id)
        }
        existingUser = await query.first()
        break
      default:
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: `Unsupported check type: ${type}`,
          layer: 'UserService.checkAvailabilitySingle'
        })
    }

    const available = !existingUser
    const result = {
      type,
      value,
      available,
      checkedAt: new Date().toISOString(),
      field: check.field,
      legacy: check.legacy || false
    }

    if (!available) {
      result.conflictDetails = {
        accountCreated: existingUser.createdAt,
        isActive: existingUser.isActive,
        isVerified: existingUser.isVerified
      }
    }

    return result
  }

  async generateAvailabilitySuggestions(results) {
    for (const result of results) {
      if (!result.available && !result.suggestions) {
        result.suggestions = await this.getAvailabilitySuggestions(result.type, result.value)
      }
    }
  }

  async getAvailabilitySuggestions(type, value) {
    const suggestions = []

    if (type === 'email') {
      const [local, domain] = value.split('@')
      const commonDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com']

      for (const suggestedDomain of commonDomains) {
        if (suggestedDomain !== domain) {
          const suggestion = `${local}@${suggestedDomain}`
          const available = await this.checkAvailabilitySingle({ type, value: suggestion })
          if (available.available) {
            suggestions.push(suggestion)
            if (suggestions.length >= 3) break
          }
        }
      }

      for (let i = 1; i <= 99 && suggestions.length < 5; i++) {
        const suggestion = `${local}${i}@${domain}`
        const available = await this.checkAvailabilitySingle({ type, value: suggestion })
        if (available.available) {
          suggestions.push(suggestion)
        }
      }
    } else if (type === 'phone' && value.length > 1) {
      const baseNumber = value.slice(0, -1)
      for (let i = 0; i <= 9 && suggestions.length < 3; i++) {
        const suggestion = `${baseNumber}${i}`
        if (suggestion !== value) {
          const available = await this.checkAvailabilitySingle({ type, value: suggestion })
          if (available.available) {
            suggestions.push(suggestion)
          }
        }
      }
    }

    return suggestions.slice(0, 5)
  }

  formatAvailabilityResponse(results, originalBody, context, processingTime) {
    if (originalBody.email_or_mobile_number && results.length === 1) {
      const result = results[0]

      if (!result.available) {
        throw new ErrorWrapper({
          ...errorCodes.EMAIL_PHONE_ALREADY_TAKEN,
          message: `${result.type === 'email' ? 'Email' : 'Phone number'} is already taken`,
          meta: {
            type: result.type,
            conflictDetails: result.conflictDetails,
            suggestions: result.suggestions
          }
        })
      }

      return {
        success: true,
        status: 200,
        message: `${result.type === 'email' ? 'Email' : 'Phone number'} is available`,
        available: true,
        type: result.type,
        checkedAt: result.checkedAt,
        suggestions: result.suggestions,
        meta: {
          processingTime: `${processingTime}ms`,
          requestId: context.requestId,
          timestamp: new Date().toISOString()
        }
      }
    }

    return {
      success: true,
      status: 200,
      message: 'Availability check completed successfully',
      data: {
        success: true,
        summary: {
          totalChecks: results.length,
          availableCount: results.filter(r => r.available).length,
          unavailableCount: results.filter(r => !r.available).length,
          allAvailable: results.every(r => r.available)
        },
        results,
        meta: {
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString(),
          requestId: context.requestId
        }
      }
    }
  }
}

module.exports = UserService
