const { RequestRule, Rule, ErrorWrapper, errorCodes } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const { notificationClient } = require('handlers/RootProvider')
const UserDAO = require('database/dao/UserDAO')
const CountryDAO = require('database/dao/CountryDAO')
const UserModel = require('models/UserModel')
const { makePasswordHashHelper, makeConfirmOTPHelper, makeUpdateTokenHelper } = require('helpers').authHelpers
const logger = require('util/logger')
const { notificationType } = require('config')
const crypto = require('crypto')

/**
 * Enhanced CreateUserHandler - Comprehensive user registration system
 * 
 * Features:
 * - Advanced validation with uniqueness checks
 * - Transaction-safe user creation
 * - Profile image support
 * - Enhanced security validations
 * - Comprehensive error handling
 * - Rich response formatting
 * - Notification system integration
 * 
 * @extends BaseHandler
 * @version 2.0.0
 */
class CreateUserHandler extends BaseHandler {
  static get accessTag() {
    return 'users:create'
  }

  /**
   * Enhanced validation rules with comprehensive user validation
   */
  static get validationRules() {
    return {
      body: {
        // Required user information
        name: new RequestRule(UserModel.schema.name, { required: true }),
        email: new RequestRule(UserModel.schema.email, { required: true }),
        countryId: new RequestRule(UserModel.schema.countryId, { required: true }),
        password: new RequestRule(UserModel.schema.passwordHash, { required: true }),
        mobileNumber: new RequestRule(UserModel.schema.mobileNumber, { required: true }),
        
        // Optional user information
        bio: new RequestRule(UserModel.schema.bio, { required: false }),
        preferredLanguage: new RequestRule(UserModel.schema.preferredLanguage, { required: false }),
        
        // Profile image (optional)
        profileImageId: new RequestRule(UserModel.schema.profileImageId, { required: false }),
        
        // Terms and conditions (optional for backward compatibility)
        acceptTerms: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean',
          description: 'boolean; accept terms and conditions'
        }), { required: false }),
        
        // Privacy policy acceptance (optional for backward compatibility)
        acceptPrivacy: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean',
          description: 'boolean; accept privacy policy'
        }), { required: false }),
        
        // Marketing emails consent (optional)
        acceptMarketing: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean',
          description: 'boolean; consent to marketing emails'
        }), { required: false }),
        
        // Referral code (optional)
        referralCode: new RequestRule(new Rule({
          validator: v => typeof v === 'string' && v.length >= 4 && v.length <= 20,
          description: 'string; referral code; 4-20 characters'
        }), { required: false }),
        
        // Device information for security
        deviceInfo: new RequestRule(new Rule({
          validator: v => {
            if (typeof v !== 'object' || v === null) return false
            return typeof v.userAgent === 'string' || typeof v.platform === 'string'
          },
          description: 'object; device information with userAgent or platform'
        }), { required: false })
      }
    }
  }

  /**
   * Enhanced user creation with comprehensive validation and processing
   */
  static async run(ctx) {
    const startTime = Date.now()
    const { body, headers, ip } = ctx
    const logContext = {
      handler: 'CreateUserHandler',
      requestId: ctx.requestId || crypto.randomUUID(),
      email: body.email,
      ip: ip || ctx.connection?.remoteAddress
    }

    try {
      logger.info('User registration started', {
        ...logContext,
        email: body.email,
        countryId: body.countryId
      })

      // Step 1: Pre-validation checks
      await this.performPreValidation(body, logContext)

      // Step 2: Validate uniqueness
      await this.validateUniqueness(body, logContext)

      // Step 3: Validate country and references
      const country = await this.validateReferences(body, logContext)

      // Step 4: Process password
      const passwordHash = await this.processPassword(body.password, logContext)

      // Step 5: Handle referral code if provided
      const referralData = await this.processReferralCode(body.referralCode, logContext)

      // Step 6: Prepare user data
      const userData = await this.prepareUserData(body, passwordHash, headers, logContext)

      // Step 7: Create user in transaction
      const user = await this.createUserTransaction(userData, logContext)

      // Step 8: Initialize verification process
      const verificationData = await this.initializeVerification(user, logContext)

      // Step 9: Send notifications (async)
      this.sendWelcomeNotifications(user, verificationData, logContext)

      // Step 10: Format and return response
      const response = await this.formatUserResponse(user, country, verificationData, referralData, logContext, Date.now() - startTime)

      logger.info('User registration completed successfully', {
        ...logContext,
        userId: user.id,
        processingTime: Date.now() - startTime
      })

      return response

    } catch (error) {
      logger.error('User registration failed', {
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
        message: 'User registration failed',
        layer: 'CreateUserHandler.run',
        meta: {
          originalError: error.message,
          email: body.email
        }
      })
    }
  }

  /**
   * Perform pre-validation checks
   */
  static async performPreValidation(body, logContext) {
    // Validate email format more strictly
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(body.email)) {
      throw new ErrorWrapper({
        ...errorCodes.VALIDATION,
        message: 'Invalid email format',
        layer: 'CreateUserHandler.performPreValidation'
      })
    }

    // Enhanced password validation
    if (!this.validatePasswordStrength(body.password)) {
      throw new ErrorWrapper({
        ...errorCodes.VALIDATION,
        message: 'Password must be at least 8 characters long and contain at least one letter, one number, and one special character',
        layer: 'CreateUserHandler.performPreValidation'
      })
    }

    // Validate mobile number format
    if (!this.validateMobileNumber(body.mobileNumber)) {
      throw new ErrorWrapper({
        ...errorCodes.VALIDATION,
        message: 'Invalid mobile number format',
        layer: 'CreateUserHandler.performPreValidation'
      })
    }

    // Validate name format
    if (!this.validateName(body.name)) {
      throw new ErrorWrapper({
        ...errorCodes.VALIDATION,
        message: 'Name must be 2-50 characters and contain only letters and spaces',
        layer: 'CreateUserHandler.performPreValidation'
      })
    }
  }

  /**
   * Validate uniqueness of email and mobile number with enhanced race condition protection
   */
  static async validateUniqueness(body, logContext) {
    const knex = UserDAO.knex()
    
    try {
      // Use a read transaction for consistency
      const result = await knex.transaction(async (trx) => {
        // Check email uniqueness
        const existingEmailUser = await UserDAO.query(trx)
          .where('email', body.email.toLowerCase().trim())
          .first()

        if (existingEmailUser) {
          return {
            type: 'email',
            user: existingEmailUser
          }
        }

        // Check mobile number uniqueness
        const existingMobileUser = await UserDAO.query(trx)
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
          logger.warn('Registration attempt with existing email', {
            ...logContext,
            existingUserId: result.user.id
          })
          
          throw new ErrorWrapper({
            ...errorCodes.VALIDATION,
            message: 'An account with this email address already exists',
            layer: 'CreateUserHandler.validateUniqueness',
            meta: {
              field: 'email',
              value: body.email
            }
          })
        }
        
        if (result.type === 'mobile') {
          logger.warn('Registration attempt with existing mobile number', {
            ...logContext,
            existingUserId: result.user.id,
            mobileNumber: body.mobileNumber
          })
          
          throw new ErrorWrapper({
            ...errorCodes.VALIDATION,
            message: 'An account with this mobile number already exists',
            layer: 'CreateUserHandler.validateUniqueness',
            meta: {
              field: 'mobileNumber',
              value: body.mobileNumber
            }
          })
        }
      }
    } catch (error) {
      // If it's already an ErrorWrapper, re-throw it
      if (error instanceof ErrorWrapper) {
        throw error
      }
      
      // Log unexpected database errors
      logger.error('Uniqueness validation failed', {
        ...logContext,
        error: error.message
      })
      
      throw new ErrorWrapper({
        ...errorCodes.DATABASE,
        message: 'Unable to validate account uniqueness',
        layer: 'CreateUserHandler.validateUniqueness',
        meta: {
          originalError: error.message
        }
      })
    }
  }

  /**
   * Validate country and other references
   */
  static async validateReferences(body, logContext) {
    // Validate country exists and is active
    const country = await CountryDAO.query()
      .where('id', body.countryId)
      .where('isActive', true)
      .first()

    if (!country) {
      throw new ErrorWrapper({
        ...errorCodes.VALIDATION,
        message: 'Invalid or inactive country selected',
        layer: 'CreateUserHandler.validateReferences',
        meta: {
          countryId: body.countryId
        }
      })
    }

    // Validate profile image if provided
    if (body.profileImageId) {
      const AttachmentDAO = require('database/dao/AttachmentDAO')
      const profileImage = await AttachmentDAO.query()
        .where('id', body.profileImageId)
        .first()

      if (!profileImage) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: 'Invalid profile image reference',
          layer: 'CreateUserHandler.validateReferences',
          meta: {
            profileImageId: body.profileImageId
          }
        })
      }
    }

    return country
  }

  /**
   * Process and hash password
   */
  static async processPassword(password, logContext) {
    try {
      return await makePasswordHashHelper(password)
    } catch (error) {
      logger.error('Password hashing failed', {
        ...logContext,
        error: error.message
      })
      
      throw new ErrorWrapper({
        ...errorCodes.INTERNAL_SERVER_ERROR,
        message: 'Password processing failed',
        layer: 'CreateUserHandler.processPassword'
      })
    }
  }

  /**
   * Process referral code if provided
   */
  static async processReferralCode(referralCode, logContext) {
    if (!referralCode) return null

    try {
      // Find referring user by referral code
      const referringUser = await UserDAO.query()
        .where('referralCode', referralCode)
        .where('isActive', true)
        .first()

      if (!referringUser) {
        logger.warn('Invalid referral code provided', {
          ...logContext,
          referralCode
        })
        
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: 'Invalid referral code',
          layer: 'CreateUserHandler.processReferralCode'
        })
      }

      return {
        referringUserId: referringUser.id,
        referralCode: referralCode
      }
    } catch (error) {
      if (error instanceof ErrorWrapper) throw error
      
      logger.error('Referral code processing failed', {
        ...logContext,
        error: error.message,
        referralCode
      })
      
      return null // Don't fail registration for referral issues
    }
  }

  /**
   * Prepare user data for creation
   */
  static async prepareUserData(body, passwordHash, headers, logContext) {
    // Generate unique referral code for new user
    const userReferralCode = await this.generateUniqueReferralCode()

    const userData = {
      name: body.name.trim(),
      email: body.email.toLowerCase().trim(),
      countryId: body.countryId,
      mobileNumber: body.mobileNumber,
      passwordHash: passwordHash,
      preferredLanguage: body.preferredLanguage || headers['Language'] || 'en',
      bio: body.bio?.trim() || null,
      profileImageId: body.profileImageId || null,
      referralCode: userReferralCode,
      acceptedTermsAt: new Date(),
      acceptedPrivacyAt: new Date(),
      marketingConsent: body.acceptMarketing || false,
      isActive: true,
      isVerified: false,
      role: 'ROLE_USER', // Default role
      createdAt: new Date(),
      metadata: {
        registrationIp: logContext.ip,
        deviceInfo: body.deviceInfo,
        userAgent: headers['user-agent'],
        registrationMethod: 'web' // or 'mobile', 'api'
      }
    }

    return userData
  }

  /**
   * Create user in database transaction
   */
  static async createUserTransaction(userData, logContext) {
    const knex = UserDAO.knex()
    const trx = await knex.transaction()

    try {
      // Create user
      const user = await UserDAO.query(trx).insert(userData)

      // If there's a referring user, create referral record
      if (userData.referredBy) {
        await this.createReferralRecord(user.id, userData.referredBy, trx, logContext)
      }

      await trx.commit()
      
      logger.debug('User created successfully in transaction', {
        ...logContext,
        userId: user.id
      })

      return user
    } catch (error) {
      await trx.rollback()
      
      logger.error('User creation transaction failed', {
        ...logContext,
        error: error.message,
        stack: error.stack
      })
      
      // Handle specific database constraint violations
      if (this.isDuplicateKeyError(error)) {
        const duplicateField = this.extractDuplicateField(error.message)
        
        if (duplicateField === 'email') {
          throw new ErrorWrapper({
            ...errorCodes.VALIDATION,
            message: 'An account with this email address already exists',
            layer: 'CreateUserHandler.createUserTransaction',
            meta: {
              field: 'email',
              constraint: 'unique_email'
            }
          })
        } else if (duplicateField === 'mobileNumber') {
          throw new ErrorWrapper({
            ...errorCodes.VALIDATION,
            message: 'An account with this mobile number already exists',
            layer: 'CreateUserHandler.createUserTransaction',
            meta: {
              field: 'mobileNumber',
              constraint: 'unique_mobile'
            }
          })
        } else if (duplicateField === 'referralCode') {
          // This should rarely happen due to our generation logic, but handle it
          logger.warn('Duplicate referral code generated', {
            ...logContext,
            referralCode: userData.referralCode
          })
          
          throw new ErrorWrapper({
            ...errorCodes.INTERNAL_SERVER_ERROR,
            message: 'Registration failed due to system conflict. Please try again.',
            layer: 'CreateUserHandler.createUserTransaction',
            meta: {
              field: 'referralCode',
              constraint: 'unique_referral_code'
            }
          })
        }
      }
      
      // Handle foreign key constraint violations
      if (this.isForeignKeyError(error)) {
        throw new ErrorWrapper({
          ...errorCodes.VALIDATION,
          message: 'Invalid country selection',
          layer: 'CreateUserHandler.createUserTransaction',
          meta: {
            constraint: 'foreign_key_country'
          }
        })
      }
      
      // Generic database error
      throw new ErrorWrapper({
        ...errorCodes.DATABASE,
        message: 'Failed to create user account',
        layer: 'CreateUserHandler.createUserTransaction',
        meta: {
          originalError: error.message
        }
      })
    }
  }

  /**
   * Initialize verification process
   */
  static async initializeVerification(user, logContext) {
    try {
      // Generate verification code
      const verifyCode = await makeConfirmOTPHelper(user.email)
      const updateToken = await makeUpdateTokenHelper(user)

      // Update user with verification codes
      await UserDAO.baseUpdate(user.id, { 
        verifyCode, 
        updateToken,
        verifyCodeSentAt: new Date()
      })

      logger.debug('Verification codes generated', {
        ...logContext,
        userId: user.id
      })

      return {
        verifyCode,
        updateToken,
        verificationRequired: true
      }
    } catch (error) {
      logger.error('Verification initialization failed', {
        ...logContext,
        error: error.message,
        userId: user.id
      })
      
      // Don't fail registration, but log the issue
      return {
        verificationRequired: false,
        error: 'Verification system temporarily unavailable'
      }
    }
  }

  /**
   * Send welcome notifications (async)
   */
  static sendWelcomeNotifications(user, verificationData, logContext) {
    // Don't await - run in background
    setImmediate(async () => {
      try {
        if (verificationData.verifyCode) {
          // Send SMS verification
          await notificationClient.enqueue({
            type: notificationType.createUser,
            to: user.mobileNumber,
            code: verificationData.verifyCode,
            name: user.name,
            email: user.email,
            lang: user.preferredLanguage
          })

          // Send welcome email
          await notificationClient.enqueue({
            type: notificationType.welcomeEmail,
            to: user.email,
            name: user.name,
            verificationCode: verificationData.verifyCode,
            lang: user.preferredLanguage
          })
        }

        logger.info('Welcome notifications sent', {
          ...logContext,
          userId: user.id
        })
      } catch (error) {
        logger.error('Failed to send welcome notifications', {
          ...logContext,
          error: error.message,
          userId: user.id
        })
      }
    })
  }
  /**
   * Format comprehensive user response
   */
  static async formatUserResponse(user, country, verificationData, referralData, logContext, processingTime) {
    // Construct mobile number object
    const mobileNumber = {
      msisdn: user.mobileNumber,
      countryCode: country.phonecode,
      iso: country.iso,
      countryId: user.countryId,
      formatted: `+${country.phonecode}${user.mobileNumber}`
    }

    // Prepare response data
    const responseData = {
      id: user.id,
      name: user.name,
      email: user.email,
      mobileNumber: mobileNumber,
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

    const response = {
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

    return this.result(response)
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  /**
   * Validate password strength
   */
  static validatePasswordStrength(password) {
    if (typeof password !== 'string' || password.length < 8) return false
    
    const hasLetter = /[a-zA-Z]/.test(password)
    const hasNumber = /\d/.test(password)
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password)
    
    return hasLetter && hasNumber && hasSpecial
  }

  /**
   * Validate mobile number format
   */
  static validateMobileNumber(mobileNumber) {
    if (typeof mobileNumber !== 'string') return false
    
    // Remove any non-digits
    const cleaned = mobileNumber.replace(/\D/g, '')
    
    // Should be 10-15 digits
    return cleaned.length >= 10 && cleaned.length <= 15
  }

  /**
   * Validate name format
   */
  static validateName(name) {
    if (typeof name !== 'string') return false
    
    const trimmed = name.trim()
    if (trimmed.length < 2 || trimmed.length > 50) return false
    
    // Only letters, spaces, hyphens, and apostrophes
    const nameRegex = /^[a-zA-Z\s\-']+$/
    return nameRegex.test(trimmed)
  }

  /**
   * Generate unique referral code with enhanced collision detection
   */
  static async generateUniqueReferralCode() {
    let isUnique = false
    let referralCode = ''
    let attempts = 0
    const maxAttempts = 20 // Increased from 10

    while (!isUnique && attempts < maxAttempts) {
      referralCode = this.generateReferralCode()
      
      try {
        const existing = await UserDAO.query()
          .where('referralCode', referralCode)
          .first()
        
        if (!existing) {
          isUnique = true
        } else {
          logger.debug('Referral code collision detected', {
            referralCode,
            attempt: attempts + 1
          })
        }
      } catch (error) {
        logger.warn('Error checking referral code uniqueness', {
          referralCode,
          attempt: attempts + 1,
          error: error.message
        })
        
        // Continue trying on database errors
      }
      
      attempts++
    }

    if (!isUnique) {
      logger.error('Failed to generate unique referral code after maximum attempts', {
        maxAttempts
      })
      
      throw new ErrorWrapper({
        ...errorCodes.INTERNAL_SERVER_ERROR,
        message: 'Unable to generate unique referral code. Please try again.',
        layer: 'CreateUserHandler.generateUniqueReferralCode'
      })
    }

    return referralCode
  }

  /**
   * Generate referral code
   */
  static generateReferralCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let result = ''
    
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    
    return result
  }

  /**
   * Create referral record
   */
  static async createReferralRecord(userId, referringUserId, trx, logContext) {
    try {
      // This would create a record in a referrals table
      // For now, just log the referral
      logger.info('Referral recorded', {
        ...logContext,
        userId,
        referringUserId
      })
      
      // TODO: Implement referral rewards system
      // await ReferralDAO.query(trx).insert({
      //   userId,
      //   referringUserId,
      //   status: 'pending',
      //   createdAt: new Date()
      // })
    } catch (error) {
      logger.warn('Failed to create referral record', {
        ...logContext,
        error: error.message,
        userId,
        referringUserId
      })
    }
  }

  /**
   * Get profile image URL
   */
  static async getProfileImageUrl(profileImageId) {
    try {
      const AttachmentDAO = require('database/dao/AttachmentDAO')
      const attachment = await AttachmentDAO.query()
        .where('id', profileImageId)
        .first()
      
      if (attachment) {
        const s3Config = require('config').s3
        return `${s3Config.baseUrl}${attachment.path}`
      }
      
      return null
    } catch (error) {
      logger.warn('Failed to get profile image URL', {
        profileImageId,
        error: error.message
      })
      return null
    }
  }

  /**
   * Check if error is a duplicate key constraint violation
   */
  static isDuplicateKeyError(error) {
    if (!error || !error.message) return false
    
    const message = error.message.toLowerCase()
    
    // MySQL/MariaDB duplicate entry
    if (message.includes('duplicate entry')) return true
    
    // PostgreSQL unique violation
    if (error.code === '23505' || message.includes('unique constraint')) return true
    
    // SQLite unique constraint
    if (message.includes('unique constraint failed')) return true
    
    return false
  }

  /**
   * Extract the field name from duplicate key error message
   */
  static extractDuplicateField(errorMessage) {
    if (!errorMessage) return 'unknown'
    
    const message = errorMessage.toLowerCase()
    
    // Extract field name from various database error formats
    if (message.includes('email')) return 'email'
    if (message.includes('mobilenumber')) return 'mobileNumber'
    if (message.includes('referralcode')) return 'referralCode'
    
    // Try to extract from MySQL duplicate entry format
    const duplicateMatch = message.match(/duplicate entry .+ for column '([^']+)'/i)
    if (duplicateMatch) {
      const column = duplicateMatch[1].toLowerCase()
      if (column.includes('email')) return 'email'
      if (column.includes('mobile')) return 'mobileNumber'
      if (column.includes('referral')) return 'referralCode'
    }
    
    // Try to extract from PostgreSQL format
    const pgMatch = message.match(/key \(([^)]+)\)=/i)
    if (pgMatch) {
      const column = pgMatch[1].toLowerCase()
      if (column.includes('email')) return 'email'
      if (column.includes('mobile')) return 'mobileNumber'
      if (column.includes('referral')) return 'referralCode'
    }
    
    return 'unknown'
  }

  /**
   * Check if error is a foreign key constraint violation
   */
  static isForeignKeyError(error) {
    if (!error || !error.message) return false
    
    const message = error.message.toLowerCase()
    
    // MySQL foreign key constraint
    if (message.includes('foreign key constraint')) return true
    
    // PostgreSQL foreign key violation
    if (error.code === '23503' || message.includes('violates foreign key constraint')) return true
    
    // SQLite foreign key constraint
    if (message.includes('foreign key constraint failed')) return true
    
    return false
  }
}

module.exports = CreateUserHandler
