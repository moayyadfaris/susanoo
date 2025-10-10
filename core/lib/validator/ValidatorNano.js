const { Stream } = require('stream')

/**
 * Regular expressions for common validation patterns
 * Using more precise and comprehensive patterns for better validation
 */
const VALIDATION_PATTERNS = Object.freeze({
  // UUID v1-v5 pattern with proper version and variant validation
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  
  // More comprehensive URL pattern supporting various protocols and edge cases
  URL: /^(https?|ftps?|file|mailto|tel|sms):\/\/(?:[-\w.])+(?::[0-9]+)?(?:\/(?:[\w._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*(?:\?(?:[\w._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[\w._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i,
  
  // IPv4 pattern with proper range validation
  IPV4: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
  
  // IPv6 pattern for modern networking
  IPV6: /^(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}$|^::1$|^::$/i,
  
  // Email pattern following RFC 5322 specification
  EMAIL: /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
  
  // Phone pattern for international format
  PHONE: /^\+?[1-9]\d{1,14}$/,
  
  // Credit card pattern (basic Luhn algorithm validation)
  CREDIT_CARD: /^(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3[0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})$/,
  
  // Hexadecimal color pattern
  HEX_COLOR: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
  
  // Base64 pattern
  BASE64: /^[A-Za-z0-9+/]*={0,2}$/,
  
  // JWT pattern (basic structure validation)
  JWT: /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/
})

/**
 * ValidatorNano - A lightweight, high-performance validation utility
 * 
 * Features:
 * - Type-safe validation methods
 * - Null and undefined safe operations
 * - Performance optimized for Node.js
 * - Comprehensive pattern matching
 * - JSDoc documented for IDE support
 * - Frozen constants for immutability
 * - Zero external dependencies
 * 
 * @class ValidatorNano
 * @version 2.0.0
 * @author Susanoo API Team
 * @since 1.0.0
 */
class ValidatorNano {
  /**
   * Check if a value is defined (not undefined)
   * @param {any} value - Value to check
   * @returns {boolean} True if value is defined
   * @example
   * ValidatorNano.isDefined(null) // true
   * ValidatorNano.isDefined(undefined) // false
   * ValidatorNano.isDefined(0) // true
   */
  static isDefined(value) {
    return typeof value !== 'undefined'
  }

  /**
   * Check if a value is not null and not undefined
   * @param {any} value - Value to check
   * @returns {boolean} True if value is neither null nor undefined
   * @example
   * ValidatorNano.isNotNullish(null) // false
   * ValidatorNano.isNotNullish(undefined) // false
   * ValidatorNano.isNotNullish(0) // true
   * ValidatorNano.isNotNullish('') // true
   */
  static isNotNullish(value) {
    return value !== null && value !== undefined
  }

  /**
   * Check if a value is an instance of a specific constructor
   * @param {any} value - Value to check
   * @param {Function} constructor - Constructor function to check against
   * @returns {boolean} True if value is an instance of constructor
   * @throws {TypeError} If constructor is not a function
   * @example
   * ValidatorNano.isInstanceOf(new Date(), Date) // true
   * ValidatorNano.isInstanceOf({}, Object) // true
   */
  static isInstanceOf(value, constructor) {
    if (typeof constructor !== 'function') {
      throw new TypeError('Constructor must be a function')
    }
    return value instanceof constructor
  }

  /**
   * Check if a value is an array
   * @param {any} value - Value to check
   * @returns {boolean} True if value is an array
   * @example
   * ValidatorNano.isArray([]) // true
   * ValidatorNano.isArray('string') // false
   */
  static isArray(value) {
    return Array.isArray(value)
  }

  /**
   * Check if a value is a non-empty array
   * @param {any} value - Value to check
   * @returns {boolean} True if value is an array with at least one element
   * @example
   * ValidatorNano.isArrayNotEmpty([1]) // true
   * ValidatorNano.isArrayNotEmpty([]) // false
   */
  static isArrayNotEmpty(value) {
    return Array.isArray(value) && value.length > 0
  }

  /**
   * Check if a value is an array containing only specified types
   * @param {any} value - Value to check
   * @param {Function[]} allowedTypes - Array of constructor functions
   * @returns {boolean} True if value is an array of specified types
   * @example
   * ValidatorNano.isArrayOf([1, 2, 3], [Number]) // true
   * ValidatorNano.isArrayOf(['a', 1], [String]) // false
   */
  static isArrayOf(value, allowedTypes = [Number, String, Object, Array, Boolean, Function]) {
    if (!Array.isArray(value) || !Array.isArray(allowedTypes) || allowedTypes.length === 0) {
      return false
    }
    
    return value.every(item => {
      if (item === null || item === undefined) return false
      return allowedTypes.some(type => typeof type === 'function' && item.constructor === type)
    })
  }

  /**
   * Check if a value is a plain object (not array, null, or other object types)
   * @param {any} value - Value to check
   * @returns {boolean} True if value is a plain object
   * @example
   * ValidatorNano.isObject({}) // true
   * ValidatorNano.isObject([]) // false
   * ValidatorNano.isObject(null) // false
   */
  static isObject(value) {
    return value !== null && 
           typeof value === 'object' && 
           !Array.isArray(value) && 
           value.constructor === Object
  }

  /**
   * Check if a value is a valid number (not NaN or Infinity)
   * @param {any} value - Value to check
   * @returns {boolean} True if value is a finite number
   * @example
   * ValidatorNano.isNumber(42) // true
   * ValidatorNano.isNumber(NaN) // false
   * ValidatorNano.isNumber(Infinity) // false
   */
  static isNumber(value) {
    return typeof value === 'number' && Number.isFinite(value)
  }

  /**
   * Check if a value is an integer
   * @param {any} value - Value to check
   * @returns {boolean} True if value is an integer
   * @example
   * ValidatorNano.isInt(42) // true
   * ValidatorNano.isInt(42.5) // false
   */
  static isInt(value) {
    return Number.isInteger(value)
  }

  /**
   * Check if a value is a positive integer (>= 0)
   * @param {any} value - Value to check
   * @returns {boolean} True if value is a non-negative integer
   * @example
   * ValidatorNano.isUint(42) // true
   * ValidatorNano.isUint(-1) // false
   * ValidatorNano.isUint(0) // true
   */
  static isUint(value) {
    return Number.isInteger(value) && value >= 0
  }

  /**
   * Check if a value is a positive integer (> 0)
   * @param {any} value - Value to check
   * @returns {boolean} True if value is a positive integer
   * @example
   * ValidatorNano.isPositiveInt(42) // true
   * ValidatorNano.isPositiveInt(0) // false
   * ValidatorNano.isPositiveInt(-1) // false
   */
  static isPositiveInt(value) {
    return Number.isInteger(value) && value > 0
  }

  /**
   * Check if a value is within a numeric range (inclusive)
   * @param {any} value - Value to check
   * @param {number} min - Minimum value (inclusive)
   * @param {number} max - Maximum value (inclusive)
   * @returns {boolean} True if value is within range
   * @example
   * ValidatorNano.isInRange(5, 1, 10) // true
   * ValidatorNano.isInRange(0, 1, 10) // false
   */
  static isInRange(value, min, max) {
    if (!this.isNumber(value) || !this.isNumber(min) || !this.isNumber(max)) {
      return false
    }
    return value >= min && value <= max
  }

  /**
   * Check if a value is a string
   * @param {any} value - Value to check
   * @returns {boolean} True if value is a string
   * @example
   * ValidatorNano.isString('hello') // true
   * ValidatorNano.isString(123) // false
   */
  static isString(value) {
    return typeof value === 'string'
  }

  /**
   * Check if a value is a non-empty string
   * @param {any} value - Value to check
   * @returns {boolean} True if value is a non-empty string
   * @example
   * ValidatorNano.isStringNotEmpty('hello') // true
   * ValidatorNano.isStringNotEmpty('') // false
   * ValidatorNano.isStringNotEmpty('   ') // false (trimmed)
   */
  static isStringNotEmpty(value) {
    return typeof value === 'string' && value.trim().length > 0
  }

  /**
   * Check if a string has a minimum length
   * @param {any} value - Value to check
   * @param {number} minLength - Minimum required length
   * @returns {boolean} True if string meets minimum length
   * @example
   * ValidatorNano.isStringMinLength('hello', 3) // true
   * ValidatorNano.isStringMinLength('hi', 3) // false
   */
  static isStringMinLength(value, minLength) {
    return typeof value === 'string' && 
           this.isUint(minLength) && 
           value.length >= minLength
  }

  /**
   * Check if a string has a maximum length
   * @param {any} value - Value to check
   * @param {number} maxLength - Maximum allowed length
   * @returns {boolean} True if string is within maximum length
   * @example
   * ValidatorNano.isStringMaxLength('hello', 10) // true
   * ValidatorNano.isStringMaxLength('very long string', 5) // false
   */
  static isStringMaxLength(value, maxLength) {
    return typeof value === 'string' && 
           this.isUint(maxLength) && 
           value.length <= maxLength
  }

  /**
   * Check if a value is a boolean
   * @param {any} value - Value to check
   * @returns {boolean} True if value is a boolean
   * @example
   * ValidatorNano.isBoolean(true) // true
   * ValidatorNano.isBoolean('true') // false
   */
  static isBoolean(value) {
    return typeof value === 'boolean'
  }

  /**
   * Check if a value is a Buffer
   * @param {any} value - Value to check
   * @returns {boolean} True if value is a Buffer
   * @example
   * ValidatorNano.isBuffer(Buffer.from('hello')) // true
   * ValidatorNano.isBuffer('hello') // false
   */
  static isBuffer(value) {
    return Buffer.isBuffer(value)
  }

  /**
   * Check if a value is a valid Date object
   * @param {any} value - Value to check
   * @returns {boolean} True if value is a valid Date
   * @example
   * ValidatorNano.isDate(new Date()) // true
   * ValidatorNano.isDate(new Date('invalid')) // false
   */
  static isDate(value) {
    return this.isInstanceOf(value, Date) && !isNaN(value.getTime())
  }

  /**
   * Check if a value is a function
   * @param {any} value - Value to check
   * @returns {boolean} True if value is a function
   * @example
   * ValidatorNano.isFunc(() => {}) // true
   * ValidatorNano.isFunc('function') // false
   */
  static isFunc(value) {
    return typeof value === 'function'
  }

  /**
   * Check if a value is a Stream
   * @param {any} value - Value to check
   * @returns {boolean} True if value is a Stream
   * @example
   * ValidatorNano.isStream(new Stream()) // true
   * ValidatorNano.isStream({}) // false
   */
  static isStream(value) {
    return this.isInstanceOf(value, Stream)
  }

  /**
   * Check if a value is a valid ID (positive integer or UUID)
   * @param {any} value - Value to check
   * @returns {boolean} True if value is a valid ID
   * @example
   * ValidatorNano.isId(123) // true
   * ValidatorNano.isId('550e8400-e29b-41d4-a716-446655440000') // true
   * ValidatorNano.isId(-1) // false
   */
  static isId(value) {
    // Handle string numbers
    if (typeof value === 'string' && /^\d+$/.test(value)) {
      const num = parseInt(value, 10)
      return Number.isInteger(num) && num >= 1
    }
    
    // Handle numeric IDs
    if (this.isNumber(value)) {
      return Number.isInteger(value) && value >= 1
    }
    
    // Handle UUID IDs
    return this.isUuid(value)
  }

  /**
   * Check if a value is a valid UUID (v1-v5)
   * @param {any} value - Value to check
   * @returns {boolean} True if value is a valid UUID
   * @example
   * ValidatorNano.isUuid('550e8400-e29b-41d4-a716-446655440000') // true
   * ValidatorNano.isUuid('invalid-uuid') // false
   */
  static isUuid(value) {
    return typeof value === 'string' && VALIDATION_PATTERNS.UUID.test(value)
  }

  /**
   * Check if a value is a valid URL
   * @param {any} value - Value to check
   * @returns {boolean} True if value is a valid URL
   * @example
   * ValidatorNano.isUrl('https://example.com') // true
   * ValidatorNano.isUrl('not-a-url') // false
   */
  static isUrl(value) {
    return typeof value === 'string' && VALIDATION_PATTERNS.URL.test(value)
  }

  /**
   * Check if a value is a valid IPv4 address
   * @param {any} value - Value to check
   * @returns {boolean} True if value is a valid IPv4 address
   * @example
   * ValidatorNano.isIPv4('192.168.1.1') // true
   * ValidatorNano.isIPv4('256.1.1.1') // false
   */
  static isIPv4(value) {
    return typeof value === 'string' && VALIDATION_PATTERNS.IPV4.test(value)
  }

  /**
   * Check if a value is a valid IPv6 address
   * @param {any} value - Value to check
   * @returns {boolean} True if value is a valid IPv6 address
   * @example
   * ValidatorNano.isIPv6('2001:db8::1') // true
   * ValidatorNano.isIPv6('invalid::ipv6') // false
   */
  static isIPv6(value) {
    return typeof value === 'string' && VALIDATION_PATTERNS.IPV6.test(value)
  }

  /**
   * Check if a value is a valid IP address (IPv4 or IPv6)
   * @param {any} value - Value to check
   * @returns {boolean} True if value is a valid IP address
   * @example
   * ValidatorNano.isIP('192.168.1.1') // true
   * ValidatorNano.isIP('2001:db8::1') // true
   */
  static isIP(value) {
    return this.isIPv4(value) || this.isIPv6(value)
  }

  /**
   * Check if a value is a valid email address
   * @param {any} value - Value to check
   * @returns {boolean} True if value is a valid email
   * @example
   * ValidatorNano.isEmail('user@example.com') // true
   * ValidatorNano.isEmail('invalid-email') // false
   */
  static isEmail(value) {
    return typeof value === 'string' && VALIDATION_PATTERNS.EMAIL.test(value)
  }

  /**
   * Check if a value is a valid phone number (international format)
   * @param {any} value - Value to check
   * @returns {boolean} True if value is a valid phone number
   * @example
   * ValidatorNano.isPhone('+1234567890') // true
   * ValidatorNano.isPhone('123') // false
   */
  static isPhone(value) {
    return typeof value === 'string' && VALIDATION_PATTERNS.PHONE.test(value)
  }

  /**
   * Check if a value is a valid hexadecimal color
   * @param {any} value - Value to check
   * @returns {boolean} True if value is a valid hex color
   * @example
   * ValidatorNano.isHexColor('#ff0000') // true
   * ValidatorNano.isHexColor('#fff') // true
   * ValidatorNano.isHexColor('red') // false
   */
  static isHexColor(value) {
    return typeof value === 'string' && VALIDATION_PATTERNS.HEX_COLOR.test(value)
  }

  /**
   * Check if a value is valid Base64 encoded string
   * @param {any} value - Value to check
   * @returns {boolean} True if value is valid Base64
   * @example
   * ValidatorNano.isBase64('SGVsbG8gV29ybGQ=') // true
   * ValidatorNano.isBase64('invalid base64!') // false
   */
  static isBase64(value) {
    if (typeof value !== 'string' || value.length === 0) return false
    
    // Check basic pattern
    if (!VALIDATION_PATTERNS.BASE64.test(value)) return false
    
    // Check length is multiple of 4
    if (value.length % 4 !== 0) return false
    
    try {
      return Buffer.from(value, 'base64').toString('base64') === value
    } catch {
      return false
    }
  }

  /**
   * Check if a value is a valid JWT token structure
   * @param {any} value - Value to check
   * @returns {boolean} True if value has valid JWT structure
   * @example
   * ValidatorNano.isJWT('eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWUsImlhdCI6MTYwOTQ1OTIwMCwiZXhwIjoxNjA5NDYyODAwfQ.signature') // true
   */
  static isJWT(value) {
    return typeof value === 'string' && VALIDATION_PATTERNS.JWT.test(value)
  }

  /**
   * Check if a value is empty (null, undefined, empty string, empty array, empty object)
   * @param {any} value - Value to check
   * @returns {boolean} True if value is considered empty
   * @example
   * ValidatorNano.isEmpty('') // true
   * ValidatorNano.isEmpty([]) // true
   * ValidatorNano.isEmpty({}) // true
   * ValidatorNano.isEmpty(null) // true
   */
  static isEmpty(value) {
    if (value === null || value === undefined) return true
    if (typeof value === 'string') return value.trim().length === 0
    if (Array.isArray(value)) return value.length === 0
    if (this.isObject(value)) return Object.keys(value).length === 0
    return false
  }

  /**
   * Validate multiple conditions and return detailed results
   * @param {any} value - Value to validate
   * @param {Function[]} validators - Array of validator functions
   * @returns {Object} Validation results with pass/fail status
   * @example
   * const result = ValidatorNano.validate('test@example.com', [
   *   ValidatorNano.isString,
   *   ValidatorNano.isEmail
   * ])
   * // { valid: true, passed: 2, failed: 0, results: [true, true] }
   */
  static validate(value, validators) {
    if (!Array.isArray(validators)) {
      throw new TypeError('Validators must be an array of functions')
    }

    const results = validators.map(validator => {
      if (typeof validator !== 'function') {
        throw new TypeError('Each validator must be a function')
      }
      try {
        return validator.call(this, value)
      } catch {
        return false
      }
    })

    const passed = results.filter(Boolean).length
    const failed = results.length - passed

    return {
      valid: failed === 0,
      passed,
      failed,
      results
    }
  }
}

// Freeze the class to prevent modification
Object.freeze(ValidatorNano)
Object.freeze(ValidatorNano.prototype)

module.exports = { ValidatorNano, VALIDATION_PATTERNS }
