const { RequestRule, Rule, ErrorWrapper, errorCodes } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const { getUserService } = require('../../../../services')

class ChangePasswordHandler extends BaseHandler {
  static get accessTag() {
    return 'users:change-password'
  }

  static get validationRules() {
    return {
      body: {
        oldPassword: new RequestRule(new Rule({
          validator: v => typeof v === 'string' && v.length >= 1 && v.length <= 256,
          description: 'Current password for verification; string; 1-256 chars;'
        }), { required: false }),

        newPassword: new RequestRule(new Rule({
          validator: v => typeof v === 'string' && v.length >= 8,
          description: 'New password; min 8 chars;'
        }), { required: true }),

        mfaCode: new RequestRule(new Rule({
          validator: v => typeof v === 'string' && /^\d{6}$/.test(v),
          description: 'Multi-factor authentication code; 6 digits;'
        })),

        keepCurrentSession: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean',
          description: 'Keep current session active after password change; boolean;'
        })),

        invalidateAllSessions: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean',
          description: 'Invalidate all user sessions; boolean; default true;'
        })),

        invalidateOtherSessions: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean',
          description: 'Invalidate all sessions except current; boolean; default true;'
        })),

        reason: new RequestRule(new Rule({
          validator: v => typeof v === 'string',
          description: 'Reason for password change; string;'
        })),

        compliance: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean',
          description: 'Mark as compliance-driven change; boolean;'
        })),

        forceChange: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean',
          description: 'Force password change without old password verification; boolean; admin only;'
        })),

        skipBreachCheck: new RequestRule(new Rule({
          validator: v => typeof v === 'boolean',
          description: 'Skip breach database checking; boolean; emergency use only;'
        }))
      }
    }
  }

  static async run(ctx) {
    try {
      const userService = getUserService()
      if (!userService) {
        throw new ErrorWrapper({
          ...errorCodes.INTERNAL_SERVER_ERROR,
          message: 'User service not available',
          layer: 'ChangePasswordHandler.run'
        })
      }

      const result = await userService.changePassword({
        currentUser: ctx.currentUser,
        body: ctx.body,
        session: ctx.session,
        ip: ctx.ip,
        headers: ctx.headers
      })

      return this.result(result)
    } catch (error) {
      if (error instanceof ErrorWrapper) {
        throw error
      }

      throw new ErrorWrapper({
        ...errorCodes.SERVER,
        message: 'Password change failed',
        layer: 'ChangePasswordHandler.run',
        meta: {
          originalError: error.message,
          userId: ctx.currentUser?.id,
          requestId: ctx.requestId
        }
      })
    }
  }
}

module.exports = ChangePasswordHandler
