const isEmail = require('validator/lib/isEmail')
const isUUID = require('validator/lib/isUUID')
const isJWT = require('validator/lib/isJWT')
const { BaseModel, Rule } = require('backend-core')

/**
 * Enhanced AuthModel - Email-only Authentication Schema
 * 
 * Updated for email-only authentication flow with enhanced validation
 * and security features.
 * 
 * @version 2.0.0 - Email-only authentication
 */

const schema = {
  email: new Rule({
    validator: v => isEmail(v) && v.length <= 100,
    description: 'string; valid email address; max 100 chars'
  }),
  
  password: new Rule({
    validator: v => typeof v === 'string' && v.length >= 8 && v.length <= 128,
    description: 'string; min 8 chars; max 128 chars'
  }),
  
  fingerprint: new Rule({ // https://github.com/Valve/fingerprintjs2
    validator: v => (typeof v === 'string') && v.length >= 10 && v.length <= 100,
    description: 'string; device fingerprint; min 10; max 100 chars'
  }),
  
  refreshToken: new Rule({
    validator: v => isUUID(v),
    description: 'string; UUID refresh token'
  }),
  
  loginByQRToken: new Rule({
    validator: v => isJWT(v),
    description: 'string; JWT token for QR code login'
  }),

  // Enhanced validation rules for email-only authentication
  deviceInfo: new Rule({
    validator: v => typeof v === 'object' && v !== null,
    description: 'object; device information for security tracking'
  }),

  rememberMe: new Rule({
    validator: v => typeof v === 'boolean',
    description: 'boolean; remember login session preference'
  })
}

class AuthModel extends BaseModel {
  static get schema () {
    return schema
  }
}

module.exports = AuthModel
