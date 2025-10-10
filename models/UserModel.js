const isBoolean = require('validator/lib/isBoolean')
const isEmail = require('validator/lib/isEmail')
const isJWT = require('validator/lib/isJWT')
const isUUID = require('validator/lib/isUUID')
const { BaseModel, Rule } = require('backend-core')
const joi = require('joi')
const { roles, otp } = require('config')
const rolesList = Object.values(roles)
/**
 * @swagger
 *
 * definitions:
 *   User:
 *     allOf:
 *       - required:
 *         - id
 *       - properties:
 *          status:
 *            type: string
 *          data:
 *            type: object
 *            properties:
 *              name:
 *               type: string
 *              mobileNumber:
 *               type: string
 *              id:
 *               type: string
 *              countryId:
 *               type: id
 */
const schema = {
  ...BaseModel.genericSchema,

  id: new Rule({
    validator: v => isUUID(v),
    description: 'UUID;'
  }),
  name: new Rule({
    validator: v => (typeof v === 'string'),
    description: 'string;'
  }),
  bio: new Rule({
    validator: v => (typeof v === 'string' && (v.split(' ').length <= 300)),
    description: 'string; not more than 300 words'
  }),
  role: new Rule({
    validator: v => (typeof v === 'string') && rolesList.includes(v),
    description: `enum; one of: ${rolesList}`
  }),
  email: new Rule({
    validator: v => isEmail(v) && v.length <= 50,
    description: 'string; email; max 50 chars;'
  }),
  mobileNumber: new Rule({
    validator: v => (typeof v === 'string') && v.length >= 10 && !v.includes('+'),
    description: 'string; mobile number; min 10 chars; without (+) sign;'
  }),
  emailOrMobileNumber: new Rule({
    validator: v => (typeof v === 'string') && v.length >= 3 && v.length <= 50,
    description: 'string; email or mobile number; max 50 chars;'
  }),
  newEmail: new Rule({
    validator: v => isEmail(v) && v.length <= 50,
    description: 'string; email; max 50 chars;'
  }),
  emailConfirmToken: new Rule({
    validator: v => isJWT(v),
    description: 'string; jwt;'
  }),
  confirmRegisterCode: new Rule({
    validator: v => typeof v === 'string' && v.length >= otp.digits,
    description: 'string; otp;'
  }),
  resetPasswordCode: new Rule({
    validator: v => typeof v === 'string' && v.length >= otp.digits,
    description: 'string; otp;'
  }),
  resetPasswordToken: new Rule({
    validator: v => isJWT(v),
    description: 'string; jwt;'
  }),
  updateToken: new Rule({
    validator: v => isJWT(v),
    description: 'string; jwt;'
  }),
  passwordHash: new Rule({
    validator: v => typeof v === 'string' && v.length >= 8 && /\d/.test(v),
    description: '\n' +
      'password minimum 8 characters and include at least one letter and one number;'
  }),
  code: new Rule({
    validator: v => typeof v === 'string' && v.length >= otp.digits,
    description: `string; min ${otp.digits} chars;`
  }),
  verifyCode: new Rule({
    validator: v => typeof v === 'string' && v.length >= otp.digits,
    description: `string; min ${otp.digits} chars;`
  }),
  countryId: new Rule({
    validator: v => (typeof v === 'number'),
    description: 'number; min 1; max 300 chars;'
  }),
  mobileCountryId: new Rule({
    validator: v => (typeof v === 'number'),
    description: 'number; min 1; max 300 chars;'
  }),
  isVerified: new Rule({
    validator: v => isBoolean(v),
    description: 'boolean;'
  }),
  preferredLanguage: new Rule({
    validator: v => (typeof v === 'string') && ['ar', 'en'].includes(v) && v.length === 2,
    description: 'string; ar/en 2 chars;'
  }),
  isActive: new Rule({
    validator: v => (typeof v === 'boolean'),
    description: 'boolean;'
  }),
  lastLogoutAt: new Rule({
    validator: v => v === null || v === undefined || (typeof v === 'string' && !isNaN(Date.parse(v))) || v instanceof Date,
    description: 'timestamp; ISO string or Date object; tracks last logout time'
  }),
  profileImageId: new Rule({
    validator: v => {
      try {
        joi.assert(v, joi.number().integer().positive())
      } catch (e) { return e.message }
      return true
    },
    description: 'number integer positive'
  }),
  referralCode: new Rule({
    validator: v => typeof v === 'string' && v.length >= 4 && v.length <= 20 && /^[A-Z0-9]+$/.test(v),
    description: 'string; alphanumeric uppercase; 4-20 chars; unique referral code'
  }),
  acceptedTermsAt: new Rule({
    validator: v => v === null || v === undefined || (typeof v === 'string' && !isNaN(Date.parse(v))) || v instanceof Date,
    description: 'timestamp; ISO string or Date object; when user accepted terms'
  }),
  acceptedPrivacyAt: new Rule({
    validator: v => v === null || v === undefined || (typeof v === 'string' && !isNaN(Date.parse(v))) || v instanceof Date,
    description: 'timestamp; ISO string or Date object; when user accepted privacy policy'
  }),
  marketingConsent: new Rule({
    validator: v => typeof v === 'boolean',
    description: 'boolean; user consent for marketing communications'
  }),
  verifyCodeSentAt: new Rule({
    validator: v => v === null || v === undefined || (typeof v === 'string' && !isNaN(Date.parse(v))) || v instanceof Date,
    description: 'timestamp; ISO string or Date object; when verification code was sent'
  }),
  metadata: new Rule({
    validator: v => {
      if (v === null || v === undefined) return true
      if (typeof v === 'object' && !Array.isArray(v)) {
        // Validate common metadata fields
        if (v.registrationIp && typeof v.registrationIp !== 'string') return false
        if (v.userAgent && typeof v.userAgent !== 'string') return false
        if (v.deviceInfo && typeof v.deviceInfo !== 'object') return false
        if (v.registrationMethod && typeof v.registrationMethod !== 'string') return false
        return true
      }
      return false
    },
    description: 'object; JSON metadata containing registration details (IP, device, etc.)'
  })
}

class UserModel extends BaseModel {
  static get schema () {
    return schema
  }
}

module.exports = UserModel
