const joi = require('joi')
const { BaseModel, Rule } = require('backend-core')
const UserModel = require('./UserModel')
const { storyType, storyStatus } = require('config')

const storyTypeList = Object.values(storyType)
const storyStatusList = ['SUBMITTED', 'DRAFT', 'IN_PROGRESS', 'ARCHIVED', 'PUBLISHED', 'APPROVED', 'ASSIGNED', 'PENDING', 'FOR_REVIEW_SE', 'EXPIRED', 'DELETED']

/**
 * Enhanced StoryModel - Comprehensive validation and business logic
 * 
 * Features:
 * - Enhanced validation rules with detailed error messages
 * - Computed properties and business logic
 * - Data integrity checks and constraints
 * - Relationship validation
 * - Performance optimizations
 * - Security considerations
 * 
 * @swagger
 * definitions:
 *   Story:
 *     type: object
 *     required:
 *       - title
 *       - details
 *       - userId
 *       - type
 *       - status
 *     properties:
 *       id:
 *         type: integer
 *         description: Unique story identifier
 *         example: 123
 *       title:
 *         type: string
 *         description: Story title
 *         minLength: 3
 *         maxLength: 500
 *         example: "Breaking News: Major Development"
 *       details:
 *         type: string
 *         description: Story content/details
 *         minLength: 10
 *         maxLength: 10000
 *         example: "Detailed description of the story..."
 *       type:
 *         type: string
 *         enum: ["TIP_OFF", "STORY", "REPORT"]
 *         description: Story type classification
 *         example: "STORY"
 *       status:
 *         type: string
 *         enum: ["SUBMITTED", "DRAFT", "IN_PROGRESS", "ARCHIVED", "PUBLISHED", "APPROVED", "ASSIGNED", "PENDING", "FOR_REVIEW_SE", "EXPIRED", "DELETED"]
 *         description: Current story status
 *         example: "DRAFT"
 *       userId:
 *         type: string
 *         format: uuid
 *         description: Story author/owner ID
 *       fromTime:
 *         type: string
 *         format: date-time
 *         description: Story event start time
 *       toTime:
 *         type: string
 *         format: date-time
 *         description: Story event end time
 *       priority:
 *         type: string
 *         enum: ["LOW", "NORMAL", "HIGH", "URGENT"]
 *         description: Story priority level
 *         example: "NORMAL"
 *       isInEditMode:
 *         type: boolean
 *         description: Whether story is currently being edited
 *         example: false
 *       tags:
 *         type: array
 *         items:
 *           type: string
 *         description: Associated tags
 *         example: ["politics", "breaking-news"]
 *       attachments:
 *         type: array
 *         items:
 *           type: string
 *         description: Attachment IDs
 *       createdAt:
 *         type: string
 *         format: date-time
 *         description: Creation timestamp
 *       updatedAt:
 *         type: string
 *         format: date-time
 *         description: Last update timestamp
 */

const schema = {
  id: new Rule({
    validator: v => {
      try {
        joi.assert(v, joi.number().integer().positive())
      } catch (e) { 
        return `ID must be a positive integer: ${e.message}` 
      }
      return true
    },
    description: 'Positive integer representing the unique story identifier'
  }),

  version: new Rule({
    validator: v => {
      try {
        if (v !== undefined && v !== null) {
          joi.assert(v, joi.number().integer().min(1))
        }
      } catch (e) {
        return `Version must be a positive integer: ${e.message}`
      }
      return true
    },
    description: 'Optimistic locking version number: positive integer'
  }),

  title: new Rule({
    validator: v => {
      try {
        joi.assert(v, joi.string().trim().min(3).max(500).pattern(/^[\w\s\-.,!?()]+$/))
      } catch (e) { 
        return `Title validation failed: ${e.message}` 
      }
      return true
    },
    description: 'Story title: string, 3-500 characters, alphanumeric with basic punctuation'
  }),

  details: new Rule({
    validator: v => {
      try {
        joi.assert(v, joi.string().trim().min(10).max(10000))
      } catch (e) { 
        return `Details validation failed: ${e.message}` 
      }
      return true
    },
    description: 'Story details: string, 10-10000 characters'
  }),

  type: new Rule({
    validator: v => {
      if (typeof v !== 'string') {
        return 'Type must be a string'
      }
      if (!storyTypeList.includes(v)) {
        return `Type must be one of: ${storyTypeList.join(', ')}`
      }
      return true
    },
    description: `Story type: enum values - ${storyTypeList.join(', ')}`
  }),

  status: new Rule({
    validator: v => {
      if (typeof v !== 'string') {
        return 'Status must be a string'
      }
      if (!storyStatusList.includes(v)) {
        return `Status must be one of: ${storyStatusList.join(', ')}`
      }
      return true
    },
    description: `Story status: enum values - ${storyStatusList.join(', ')}`
  }),

  userId: new Rule({
    validator: v => {
      try {
        joi.assert(v, joi.string().uuid({ version: ['uuidv4'] }))
      } catch (e) { 
        return `User ID must be a valid UUID: ${e.message}` 
      }
      return true
    },
    description: 'User ID: valid UUID v4 format'
  }),

  

  parentId: new Rule({
    validator: v => {
      try {
        joi.assert(v, joi.number().integer().positive().allow(null))
      } catch (e) { 
        return `Parent ID validation failed: ${e.message}` 
      }
      return true
    },
    description: 'Parent story ID: positive integer or null for hierarchical stories'
  }),

  priority: new Rule({
    validator: v => {
      const validPriorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT']
      if (v && !validPriorities.includes(v)) {
        return `Priority must be one of: ${validPriorities.join(', ')}`
      }
      return true
    },
    description: 'Story priority: LOW, NORMAL, HIGH, or URGENT'
  }),

  fromTime: new Rule({
    validator: v => {
      try {
        if (v) {
          joi.assert(v, joi.date().iso())
        }
      } catch (e) { 
        return `From time must be a valid ISO date: ${e.message}` 
      }
      return true
    },
    description: 'Event start time: ISO 8601 date string'
  }),

  toTime: new Rule({
    validator: v => {
      try {
        if (v) {
          joi.assert(v, joi.date().iso())
        }
      } catch (e) { 
        return `To time must be a valid ISO date: ${e.message}` 
      }
      return true
    },
    description: 'Event end time: ISO 8601 date string'
  }),

  isInEditMode: new Rule({
    validator: v => {
      if (v !== undefined && typeof v !== 'boolean') {
        return 'isInEditMode must be a boolean'
      }
      return true
    },
    description: 'Edit mode flag: boolean indicating if story is currently being edited'
  }),

  tags: new Rule({
    validator: v => {
      if (v === undefined || v === null) return true
      try {
        joi.assert(v, joi.array().items(
          joi.alternatives().try(
            joi.string().trim().min(2).max(50).pattern(/^[a-zA-Z0-9\-_]+$/),
            joi.number().integer().min(0)
          )
        ).max(10))
      } catch (e) { 
        return `Tags validation failed: ${e.message}` 
      }
      return true
    },
    description: 'Tags: array of identifiers or strings, max 10 items, normalized to lowercase alphanumeric with hyphen/underscore'
  }),

  attachments: new Rule({
    validator: v => {
      try {
        joi.assert(v, joi.array().items(joi.string().uuid()).max(20).unique())
      } catch (e) { 
        return `Attachments validation failed: ${e.message}` 
      }
      return true
    },
    description: 'Attachments: array of attachment UUIDs, max 20 items'
  }),

  location: new Rule({
    validator: v => {
      try {
        if (v) {
          joi.assert(v, joi.object({
            latitude: joi.number().min(-90).max(90),
            longitude: joi.number().min(-180).max(180),
            address: joi.string().max(255).allow(''),
            city: joi.string().max(100).allow(''),
            region: joi.string().max(100).allow('')
          }))
        }
      } catch (e) { 
        return `Location validation failed: ${e.message}` 
      }
      return true
    },
    description: 'Location: object with latitude, longitude, and address information'
  }),

  metadata: new Rule({
    validator: v => {
      try {
        if (v) {
          joi.assert(v, joi.object().max(20)) // Max 20 properties in metadata
        }
      } catch (e) { 
        return `Metadata validation failed: ${e.message}` 
      }
      return true
    },
    description: 'Additional metadata: flexible object with max 20 properties'
  })
}

/**
 * Enhanced StoryModel class with business logic and computed properties
 */
class StoryModel extends BaseModel {
  static get schema () {
    return schema
  }

  /**
   * Business validation rules that go beyond basic type checking
   * @param {Object} data - Story data to validate
   * @returns {Object} Validation result
   */
  static validateBusinessRules (data) {
    const errors = []

    // Time validation: fromTime should be before toTime
    if (data.fromTime && data.toTime) {
      const fromDate = new Date(data.fromTime)
      const toDate = new Date(data.toTime)
      
      if (fromDate >= toDate) {
        errors.push('fromTime must be before toTime')
      }

      // Future date validation for events
      const now = new Date()
      if (fromDate < now && data.status === 'DRAFT') {
        errors.push('Cannot create draft stories with past fromTime')
      }
    }

    // Status transition validation
    const validTransitions = {
      'DRAFT': ['SUBMITTED', 'DELETED'],
      'SUBMITTED': ['IN_PROGRESS', 'APPROVED', 'ARCHIVED', 'DELETED'],
      'IN_PROGRESS': ['SUBMITTED', 'FOR_REVIEW_SE', 'ARCHIVED'],
      'FOR_REVIEW_SE': ['APPROVED', 'IN_PROGRESS', 'ARCHIVED'],
      'APPROVED': ['PUBLISHED', 'ARCHIVED'],
      'PUBLISHED': ['ARCHIVED'],
      'ARCHIVED': ['DRAFT'], // Allow restoration
      'DELETED': [] // No transitions from deleted
    }

    if (data.currentStatus && data.status && data.currentStatus !== data.status) {
      if (!validTransitions[data.currentStatus]?.includes(data.status)) {
        errors.push(`Invalid status transition from ${data.currentStatus} to ${data.status}`)
      }
    }

    // Content quality validation
    if (data.title && data.details) {
      // Check for duplicate content
      if (data.title.toLowerCase().includes(data.details.toLowerCase().substring(0, 50))) {
        errors.push('Title and details should not be substantially similar')
      }

      // Check for minimum content quality
      const wordCount = data.details.split(/\s+/).length
      if (wordCount < 10 && ['SUBMITTED', 'PUBLISHED'].includes(data.status)) {
        errors.push('Stories must have at least 10 words in details for submission/publication')
      }
    }

    // Tag consistency validation
    if (Array.isArray(data.tags) && data.tags.length > 0) {
      const normalizedTags = data.tags.map(rawTag => {
        if (rawTag === null || rawTag === undefined) return ''
        if (typeof rawTag === 'string' || typeof rawTag === 'number') {
          return String(rawTag).toLowerCase().trim()
        }
        if (typeof rawTag === 'object') {
          if (rawTag.name) return String(rawTag.name).toLowerCase().trim()
          if (rawTag.label) return String(rawTag.label).toLowerCase().trim()
          if (rawTag.slug) return String(rawTag.slug).toLowerCase().trim()
        }
        return ''
      }).filter(Boolean)

      const duplicateTags = normalizedTags.filter((tag, index) => 
        normalizedTags.indexOf(tag) !== index
      )

      if (duplicateTags.length > 0) {
        errors.push('Duplicate tags are not allowed')
      }
    }

    // Priority and status correlation
    if (data.priority === 'URGENT' && !['IN_PROGRESS', 'FOR_REVIEW_SE', 'APPROVED'].includes(data.status)) {
      errors.push('Urgent stories must be in active processing status')
    }

    return {
      isValid: errors.length === 0,
      errors: errors
    }
  }

  /**
   * Get computed properties for a story
   * @param {Object} storyData - Story data
   * @returns {Object} Computed properties
   */
  static getComputedProperties (storyData) {
    const now = new Date()
    const createdAt = new Date(storyData.createdAt)
    const updatedAt = new Date(storyData.updatedAt)
    
    let isExpired = false
    let timeRemaining = null
    let duration = null
    
    if (storyData.toTime) {
      const toTime = new Date(storyData.toTime)
      isExpired = toTime < now
      timeRemaining = isExpired ? 0 : Math.max(0, toTime - now)
    }
    
    if (storyData.fromTime && storyData.toTime) {
      const fromTime = new Date(storyData.fromTime)
      const toTime = new Date(storyData.toTime)
      duration = Math.abs(toTime - fromTime)
    }

    const ageInDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24))
    const daysSinceUpdate = Math.floor((now - updatedAt) / (1000 * 60 * 60 * 24))
    
    // Determine urgency level
    let urgencyLevel = 'normal'
    if (storyData.priority === 'URGENT') {
      urgencyLevel = 'urgent'
    } else if (storyData.priority === 'HIGH' || (timeRemaining && timeRemaining < 24 * 60 * 60 * 1000)) {
      urgencyLevel = 'high'
    } else if (ageInDays > 7 && storyData.status === 'DRAFT') {
      urgencyLevel = 'stale'
    }

    // Calculate progress percentage
    let progressPercentage = 0
    const statusProgress = {
      'DRAFT': 10,
      'SUBMITTED': 25,
      'IN_PROGRESS': 50,
      'FOR_REVIEW_SE': 75,
      'APPROVED': 90,
      'PUBLISHED': 100,
      'ARCHIVED': 100,
      'DELETED': 0
    }
    progressPercentage = statusProgress[storyData.status] || 0

    return {
      isExpired,
      timeRemaining,
      duration,
      ageInDays,
      daysSinceUpdate,
      urgencyLevel,
      progressPercentage,
      canEdit: !isExpired && !['PUBLISHED', 'ARCHIVED', 'DELETED'].includes(storyData.status),
      canDelete: ['DRAFT', 'SUBMITTED'].includes(storyData.status),
      canArchive: ['PUBLISHED', 'APPROVED'].includes(storyData.status),
      canRestore: storyData.status === 'DELETED',
      isStale: daysSinceUpdate > 30 && !['PUBLISHED', 'ARCHIVED', 'DELETED'].includes(storyData.status),
      requiresAttention: urgencyLevel === 'urgent' || (urgencyLevel === 'stale' && storyData.status === 'DRAFT')
    }
  }

  /**
   * Sanitize story data for public API responses
   * @param {Object} storyData - Raw story data
   * @param {Object} user - Current user context
   * @returns {Object} Sanitized story data
   */
  static sanitizeForAPI (storyData, user = null) {
    const sanitized = { ...storyData }
    
    // Remove sensitive fields
    delete sanitized.deletedAt
    delete sanitized.deletedBy
    delete sanitized.internalNotes
    
    // Add computed properties
    const computed = this.getComputedProperties(storyData)
    Object.assign(sanitized, computed)
    
    // Role-based field filtering
    if (user) {
      if (user.role !== 'ROLE_SUPERADMIN' && user.id !== storyData.userId) {
        // Remove sensitive fields for non-owners
        delete sanitized.metadata
        delete sanitized.internalStatus
      }
      
      // Add user-specific permissions
      sanitized.permissions = {
        canEdit: computed.canEdit && (user.role === 'ROLE_SUPERADMIN' || user.id === storyData.userId),
        canDelete: computed.canDelete && (user.role === 'ROLE_SUPERADMIN' || user.id === storyData.userId),
        canArchive: computed.canArchive && user.role === 'ROLE_SUPERADMIN',
        canRestore: computed.canRestore && user.role === 'ROLE_SUPERADMIN'
      }
    }
    
    return sanitized
  }

  /**
   * Get default values for new story creation
   * @param {Object} user - Creating user
   * @returns {Object} Default values
   */
  static getDefaults (user = null) {
    return {
      status: 'DRAFT',
      type: 'STORY',
      priority: 'NORMAL',
      isInEditMode: false,
      tags: [],
      attachments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      userId: user?.id || null
    }
  }

  /**
   * Validate and prepare data for database insertion
   * @param {Object} data - Raw input data
   * @param {Object} user - Current user
   * @returns {Object} Prepared data
   */
  static prepareForDatabase (data, user = null) {
    // Start with defaults
    const prepared = { ...this.getDefaults(user), ...data }
    
    // Ensure required fields
    if (!prepared.userId && user) {
      prepared.userId = user.id
    }

    if (prepared.version !== undefined && prepared.version !== null) {
      const parsedVersion = parseInt(prepared.version, 10)
      prepared.version = Number.isNaN(parsedVersion) || parsedVersion < 1 ? 1 : parsedVersion
    } else {
      prepared.version = 1
    }
    
    // Normalize tags
    if (Array.isArray(prepared.tags)) {
      prepared.tags = prepared.tags
        .map(tag => {
          const tagString = tag === null || tag === undefined ? '' : String(tag)
          return tagString.toLowerCase().trim()
        })
        .filter(tag => tag.length > 0)
        .slice(0, 10) // Limit to 10 tags
    }
    
    // Validate business rules
    const validation = this.validateBusinessRules(prepared)
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`)
    }
    
    return prepared
  }
}

module.exports = StoryModel
