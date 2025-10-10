const { AssertionError } = require('./AssertionError')
const { Rule } = require('../Rule')

const util = require('util')
var { Stream } = require('stream')

const UUID_REGEXP = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const URL_REGEXP = /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i
const validTypes = [Number, String, Object, Array, Boolean, Function]

function isObject (v) {
  return v && (typeof v === 'object') && !Array.isArray(v)
}

class Assert {
  static fail (actual, expected, message) {
    throw new AssertionError(message || `Failed value: ${util.inspect(actual)}; ${expected !== undefined ? `Expect: ${util.inspect(expected.name || expected)}` : ''}`)
  }

  static validate (value, rule, { required = false } = {}) {
    Assert.instanceOf(rule, Rule)
    const validationResult = rule.validator(value)
    if (!['boolean', 'string'].includes(typeof validationResult)) {
      Assert.fail(validationResult, null, 'Validation result error. Validator should return string or boolean. Please check validation function')
    }

    if (required) {
      if (typeof validationResult === 'string') Assert.fail(value, validationResult)
      if (validationResult === false) Assert.fail(value, rule.description)
    }

    if (value !== undefined && !required) {
      if (typeof validationResult === 'string') Assert.fail(value, validationResult)
      if (validationResult === false) Assert.fail(value, rule.description)
    }
  }

  static isOk (value, { message = '', required = false } = {}) {
    if (!value && required) Assert.fail(value, 'Truthful value', message)
    if (value !== undefined && !value) Assert.fail(value, 'Truthful value', message)
  }

  static defined (value, { message = '' } = {}) {
    if (value === undefined) Assert.fail(value, 'No undefined values', message)
  }

  static instanceOf (value, type, { message = '' } = {}) {
    if (!(value instanceof type)) {
      Assert.fail(value, type, message || `Failed instance: ${util.inspect(value)}; Expect instance of ${util.inspect(type.name || type)} class`)
    }
  }

  static typeOf (value, type, message) {
    if (!validTypes.includes(type)) {
      Assert.fail(value, type, message || `Assert.typeOf accept one of [${validTypes.map(t => t.name)}] types. Use another method to validate "${type}"`)
    }

    if ((type === Number) && (typeof value === 'number') && !isNaN(value)) return
    if ((type === String) && typeof value === 'string') return
    if ((type === Object) && isObject(value)) return
    if ((type === Array) && Array.isArray(value)) return
    if ((type === Boolean) && typeof value === 'boolean') return
    if ((type === Function) && typeof value === 'function') return

    Assert.fail(value, type, message)
  }

  static array (value, { required = false, notEmpty = false, message = '' } = {}) {
    if (required || notEmpty) Assert.typeOf(value, Array, message)
    if (value !== undefined) Assert.typeOf(value, Array, message)
    if (value && !value.length && notEmpty) Assert.fail(value, 'Not empty array')
  }

  static arrayOf (value, of = [], { required = false, notEmpty = false, message = '' } = {}) {
    Assert.array(value, { required, notEmpty, message })

    if (!Array.isArray(of)) Assert.fail(of, 'of option expect an Array type')
    if (!of.every(i => validTypes.includes(i))) {
      Assert.fail(value, of, message || `Assert.array 'of' option accept only one of [${validTypes.map(t => t.name)}] types`)
    }
    if (value && value.length && of.length && !value.every(i => i && of.includes(i.constructor))) Assert.fail(value, `Array one of [${of.map(t => t.name)}] types`, message)
  }

  static object (value, { required = false, notEmpty = false, message = '' } = {}) {
    if (required || notEmpty) Assert.typeOf(value, Object, message)
    if (value !== undefined) Assert.typeOf(value, Object, message)
    if (notEmpty && !Object.keys(value).length) Assert.fail(value, 'Not empty object', message)
  }

  static number (value, { required = false, message = '' } = {}) {
    if (required) Assert.typeOf(value, Number, message)
    if (value !== undefined) Assert.typeOf(value, Number, message)
  }

  static integer (value, { required = false, min, max, message = '' } = {}) {
    const isInteger = Number.isInteger(value)

    if (required && !isInteger) Assert.fail(value, 'Integer', message)
    if (value !== undefined && !isInteger) Assert.fail(value, 'Integer', message)

    if (typeof min === 'number') {
      if (value !== undefined && isInteger && value < min) Assert.fail(value, `Minimal value: ${min}`, message)
    }
    if (typeof max === 'number') {
      if (value !== undefined && isInteger && value > max) Assert.fail(value, `Maximum value: ${max}`, message)
    }
  }

  static string (value, { required = false, notEmpty = false, message = '' } = {}) {
    if (required || notEmpty) Assert.typeOf(value, String, message)
    if (value !== undefined) Assert.typeOf(value, String, message)
    if (value !== undefined && !value.trim().length && notEmpty) Assert.fail(value, 'Not empty string', message)
  }

  static boolean (value, { required = false, message = '' } = {}) {
    if (required) Assert.typeOf(value, Boolean, message)
    if (value !== undefined) Assert.typeOf(value, Boolean, message)
  }

  static buffer (value, { required = false, notEmpty = false, message = '' } = {}) {
    if (required && !Buffer.isBuffer(value)) Assert.fail(value, 'Buffer', message)
    if (value !== undefined && !Buffer.isBuffer(value)) Assert.fail(value, 'Buffer', message)
    if (!value.length && notEmpty) Assert.fail(value, 'Not empty buffer', message)
  }

  static date (value, { required = false, message = '' } = {}) {
    if (required) Assert.instanceOf(value, Date, message)
    if (value !== undefined) Assert.instanceOf(value, Date, message)
  }

  static func (value, { required = false, message = '' } = {}) {
    if (required) Assert.typeOf(value, Function, message)
    if (value !== undefined) Assert.instanceOf(value, Function, message)
  }

  static stream (value, { required = false, message = '' } = {}) {
    if (required) Assert.instanceOf(value, Stream, message)
    if (value !== undefined) Assert.instanceOf(value, Stream, message)
  }

  static id (value, { required = false, message = '' } = {}) {
    const int = Number(value)
    const isPositiveInteger = Number.isInteger(int) && int >= 1
    const isUiid = UUID_REGEXP.test(value)
    const isValidId = isPositiveInteger || isUiid
    if (!isValidId && required) Assert.fail(value, 'UUID or Number', message)
    if (value !== undefined && !isValidId) Assert.fail(value, 'UUID or Number', message)
  }

  static uuid (value, { required = false, message = '' } = {}) {
    Assert.string(value, { required, message })
    if (value && !UUID_REGEXP.test(value)) Assert.fail(value, 'UUID', message)
  }

  static url (value, { required = false, message = '' } = {}) {
    Assert.string(value, { required, message })
    if (value && !URL_REGEXP.test(value)) Assert.fail(value, 'URL', message)
  }
}

if (process.env.NODE_NOASSERT) {
  Object.getOwnPropertyNames(Assert).forEach(key => (Assert[key] = function noAssert () {}))
}

module.exports = { Assert }
