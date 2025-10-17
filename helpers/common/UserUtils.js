/**
 * User Utilities
 *
 * Pure utility functions for user data formatting, validation, and analysis.
 * No database access - all DB operations should go through UserDAO.
 */

const UserModel = require('../../models/UserModel')
const logger = require('../../util/logger')

/**
 * User utility manager for data formatting and validation
 * No database operations - purely functional utilities
 */
class UserUtils {
  /**
   * Validate and sanitize user input data
   * @param {Object} userData - Raw user data
   * @returns {Object} Validated and sanitized user data
   */
  static validateAndSanitize(userData) {
    const sanitized = { ...userData }

    try {
      // Sanitize string fields
      if (sanitized.name) {
        sanitized.name = sanitized.name.trim().replace(/\s+/g, ' ')
      }
      if (sanitized.bio) {
        sanitized.bio = sanitized.bio.trim()
        // Remove potential XSS content
        sanitized.bio = sanitized.bio.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      }
      if (sanitized.email) {
        sanitized.email = sanitized.email.toLowerCase().trim()
      }
      if (sanitized.mobileNumber) {
        sanitized.mobileNumber = sanitized.mobileNumber.replace(/[^0-9]/g, '')
      }

      // Validate using the model's validation schema
      const validationResult = UserModel.validate(sanitized)
      if (validationResult.error) {
        logger.warn('User data validation failed', {
          error: validationResult.error.message,
          data: sanitized
        })
      }

      return {
        data: sanitized,
        isValid: !validationResult.error,
        errors: validationResult.error?.details || []
      }
    } catch (error) {
      logger.error('User data validation error', { error: error.message, userData })
      return {
        data: sanitized,
        isValid: false,
        errors: [{ message: 'Validation processing failed' }]
      }
    }
  }

  /**
   * Format user display name with privacy controls
   * @param {Object} userData - User data
   * @param {Object} options - Formatting options
   * @returns {string} Formatted display name
   */
  static formatDisplayName(userData, options = {}) {
    const { privacy = 'public', maxLength = 50 } = options

    if (!userData.name) return 'Anonymous User'

    let displayName = userData.name.trim()

    // Apply privacy controls
    if (privacy === 'private') {
      const nameParts = displayName.split(' ')
      if (nameParts.length > 1) {
        // Show first name and last initial
        displayName = `${nameParts[0]} ${nameParts[nameParts.length - 1].charAt(0)}.`
      }
    } else if (privacy === 'anonymous') {
      displayName = `User ${userData.id?.toString().slice(-4) || 'XXXX'}`
    }

    // Truncate if too long
    if (displayName.length > maxLength) {
      displayName = displayName.substring(0, maxLength - 3) + '...'
    }

    return displayName
  }

  /**
   * Generate user avatar initials
   * @param {Object} userData - User data
   * @returns {string} User initials
   */
  static generateInitials(userData) {
    if (!userData.name) return 'U'

    const nameParts = userData.name.trim().split(' ')
    if (nameParts.length === 1) {
      return nameParts[0].charAt(0).toUpperCase()
    }

    return (nameParts[0].charAt(0) + nameParts[nameParts.length - 1].charAt(0)).toUpperCase()
  }

  /**
   * Mask sensitive user information for logging
   * @param {Object} userData - User data
   * @returns {Object} Masked user data
   */
  static maskSensitiveData(userData) {
    const masked = { ...userData }

    if (masked.email) {
      const [localPart, domain] = masked.email.split('@')
      masked.email = `${localPart.substring(0, 2)}****@${domain}`
    }

    if (masked.mobileNumber) {
      masked.mobileNumber = `****${masked.mobileNumber.slice(-4)}`
    }

    // Remove sensitive fields completely
    delete masked.passwordHash
    delete masked.resetPasswordToken
    delete masked.emailConfirmToken
    delete masked.resetPasswordCode
    delete masked.verifyCode

    return masked
  }

  /**
   * Calculate password strength score
   * @param {string} password - Plain text password
   * @returns {Object} Password strength analysis
   */
  static analyzePasswordStrength(password) {
    if (!password) {
      return { score: 0, level: 'none', feedback: ['Password is required'] }
    }

    let score = 0
    const feedback = []

    // Length check
    if (password.length >= 8) score += 25
    else feedback.push('Use at least 8 characters')

    if (password.length >= 12) score += 10

    // Character diversity
    if (/[a-z]/.test(password)) score += 15
    else feedback.push('Add lowercase letters')

    if (/[A-Z]/.test(password)) score += 15
    else feedback.push('Add uppercase letters')

    if (/\d/.test(password)) score += 15
    else feedback.push('Add numbers')

    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score += 20
    else feedback.push('Add special characters')

    // Common patterns check
    const commonPatterns = ['password', '123456', 'qwerty', 'admin']
    if (commonPatterns.some(pattern => password.toLowerCase().includes(pattern))) {
      score -= 30
      feedback.push('Avoid common words and patterns')
    }

    // Sequential characters check
    if (/(.)\1{2,}/.test(password)) {
      score -= 15
      feedback.push('Avoid repeating characters')
    }

    score = Math.max(0, Math.min(100, score))

    let level = 'weak'
    if (score >= 80) level = 'strong'
    else if (score >= 60) level = 'good'
    else if (score >= 40) level = 'fair'

    return { score, level, feedback }
  }

  /**
   * Format user contact information
   * @param {Object} userData - User data
   * @param {Object} countryData - Country data
   * @returns {Object} Formatted contact info
   */
  static formatContactInfo(userData, countryData = null) {
    const contact = {}

    if (userData.email) {
      contact.email = {
        value: userData.email,
        verified: userData.isVerified || false,
        type: 'email'
      }
    }

    if (userData.mobileNumber) {
      contact.mobile = {
        value: userData.mobileNumber,
        verified: userData.isVerified || false,
        type: 'mobile',
        ...(countryData && {
          countryCode: countryData.phonecode,
          countryISO: countryData.iso,
          formatted: `+${countryData.phonecode}${userData.mobileNumber}`
        })
      }
    }

    return contact
  }

  /**
   * Generate user activity summary
   * @param {Object} userData - User data
   * @returns {Object} Activity summary
   */
  static generateActivitySummary(userData) {
    const now = new Date()
    const createdAt = new Date(userData.createdAt)
    const lastLogoutAt = userData.lastLogoutAt ? new Date(userData.lastLogoutAt) : null

    const daysSinceRegistration = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24))
    const daysSinceLastActivity = lastLogoutAt 
      ? Math.floor((now - lastLogoutAt) / (1000 * 60 * 60 * 24))
      : null

    let activityLevel = 'inactive'
    if (daysSinceLastActivity === null) {
      activityLevel = 'new'
    } else if (daysSinceLastActivity <= 1) {
      activityLevel = 'very-active'
    } else if (daysSinceLastActivity <= 7) {
      activityLevel = 'active'
    } else if (daysSinceLastActivity <= 30) {
      activityLevel = 'moderate'
    }

    return {
      registrationAge: {
        days: daysSinceRegistration,
        weeks: Math.floor(daysSinceRegistration / 7),
        months: Math.floor(daysSinceRegistration / 30)
      },
      lastActivity: lastLogoutAt ? {
        date: lastLogoutAt.toISOString(),
        daysAgo: daysSinceLastActivity,
        isRecent: daysSinceLastActivity <= 7
      } : null,
      activityLevel,
      isNewUser: daysSinceRegistration <= 7,
      isReturningUser: daysSinceRegistration > 7 && daysSinceLastActivity <= 30
    }
  }

  /**
   * Validate user preferences
   * @param {Object} preferences - User preferences object
   * @returns {Object} Validation result
   */
  static validatePreferences(preferences) {
    const validatedPrefs = {}
    const errors = []

    // Language validation
    if (preferences.preferredLanguage) {
      const validLanguages = ['en', 'ar']
      if (validLanguages.includes(preferences.preferredLanguage)) {
        validatedPrefs.preferredLanguage = preferences.preferredLanguage
      } else {
        errors.push('Invalid preferred language')
      }
    }

    // Marketing consent validation
    if (typeof preferences.marketingConsent === 'boolean') {
      validatedPrefs.marketingConsent = preferences.marketingConsent
    }

    // Notification preferences
    if (preferences.notifications && typeof preferences.notifications === 'object') {
      const validNotificationTypes = ['email', 'sms', 'push']
      const validatedNotifications = {}
      
      Object.keys(preferences.notifications).forEach(type => {
        if (validNotificationTypes.includes(type) && typeof preferences.notifications[type] === 'boolean') {
          validatedNotifications[type] = preferences.notifications[type]
        }
      })
      
      if (Object.keys(validatedNotifications).length > 0) {
        validatedPrefs.notifications = validatedNotifications
      }
    }

    return {
      preferences: validatedPrefs,
      isValid: errors.length === 0,
      errors
    }
  }

  /**
   * Generate user search terms for indexing
   * @param {Object} userData - User data
   * @returns {Array} Search terms
   */
  static generateSearchTerms(userData) {
    const terms = []

    if (userData.name) {
      terms.push(...userData.name.toLowerCase().split(' '))
    }

    if (userData.email) {
      terms.push(userData.email.toLowerCase())
      terms.push(userData.email.split('@')[0].toLowerCase())
    }

    if (userData.bio) {
      // Extract meaningful words from bio
      const bioWords = userData.bio.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2)
      terms.push(...bioWords)
    }

    if (userData.role) {
      terms.push(userData.role.toLowerCase())
    }

    // Remove duplicates and return
    return [...new Set(terms)].filter(term => term.length > 0)
  }

  /**
   * Format user data for export (GDPR compliance)
   * @param {Object} userData - User data
   * @param {Object} options - Export options
   * @returns {Object} Formatted export data
   */
  static formatForExport(userData, options = {}) {
    const { includeMetadata = true } = options

    const exportData = {
      personalInformation: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        mobileNumber: userData.mobileNumber,
        bio: userData.bio,
        preferredLanguage: userData.preferredLanguage
      },
      accountInformation: {
        role: userData.role,
        isActive: userData.isActive,
        isVerified: userData.isVerified,
        createdAt: userData.createdAt,
        lastLogoutAt: userData.lastLogoutAt
      },
      preferences: {
        marketingConsent: userData.marketingConsent,
        acceptedTermsAt: userData.acceptedTermsAt,
        acceptedPrivacyAt: userData.acceptedPrivacyAt
      }
    }

    if (includeMetadata && userData.metadata) {
      exportData.metadata = userData.metadata
    }

    if (userData.country) {
      exportData.location = {
        country: userData.country.name,
        countryCode: userData.country.iso
      }
    }

    return exportData
  }

  /**
   * Calculate user trust score based on various factors
   * @param {Object} userData - User data
   * @returns {Object} Trust score analysis
   */
  static calculateTrustScore(userData) {
    let score = 0
    const factors = []

    // Verification status (30 points)
    if (userData.isVerified) {
      score += 30
      factors.push('Verified account')
    }

    // Profile completeness (25 points)
    const profileScore = UserModel.calculateProfileCompleteness(userData).score
    const profilePoints = Math.round(profileScore * 0.25)
    score += profilePoints
    if (profilePoints > 15) factors.push('Complete profile')

    // Account age (20 points)
    if (userData.createdAt) {
      const accountAge = (Date.now() - new Date(userData.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      if (accountAge > 365) {
        score += 20
        factors.push('Established account')
      } else if (accountAge > 90) {
        score += 15
        factors.push('Mature account')
      } else if (accountAge > 30) {
        score += 10
        factors.push('Active account')
      }
    }

    // Terms and privacy compliance (15 points)
    if (userData.acceptedTermsAt && userData.acceptedPrivacyAt) {
      score += 15
      factors.push('Compliant user')
    }

    // Activity level (10 points)
    const activity = this.generateActivitySummary(userData)
    if (activity.activityLevel === 'very-active') {
      score += 10
      factors.push('Very active')
    } else if (activity.activityLevel === 'active') {
      score += 7
      factors.push('Active user')
    } else if (activity.activityLevel === 'moderate') {
      score += 5
      factors.push('Regular user')
    }

    let level = 'low'
    if (score >= 80) level = 'high'
    else if (score >= 60) level = 'medium'
    else if (score >= 40) level = 'moderate'

    return {
      score: Math.min(100, score),
      level,
      factors,
      recommendation: this.getTrustRecommendation(level)
    }
  }

  /**
   * Get trust score recommendation
   * @private
   */
  static getTrustRecommendation(level) {
    const recommendations = {
      high: 'User has high trust score and can access all features',
      medium: 'User has good trust score with minor limitations',
      moderate: 'User has moderate trust score, encourage profile completion',
      low: 'User has low trust score, verify account and complete profile'
    }
    return recommendations[level] || recommendations.low
  }
}

module.exports = UserUtils