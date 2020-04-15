const BaseRoleAccess = require('./BaseRoleAccess')

class RoleUserAccess extends BaseRoleAccess {
  static get can () {
    return Object.assign(
      { ...this.basePermissions },
      {
        'users:get-current-user': true,
        'users:change-password': true,
        'users:change-email': true,
        'users:confirm-email': true,
        'users:send-email-confirm-token': true,
        'users:send-reset-password-email': true,
        'users:reset-password': true,
        'auth:logout': true,
        'auth:logout-all-sessions': true,
        'interests:list': true,
        'user:interests:add': true,
        'user:interests:list': true,
        'stories:create': true,
        'stories:list': true,
        'stories:create-draft': true,
        'stories:get-by-id': true,
        'stories:upload-attachments': true,
        'stories:update': true,
        'stories:update-draft': true,
        'user:stories:list': true,
        'stories:delete-attachments-links': true,
        'stories:delete': true,
        'attachments:create': true,
        'stories:attachments:remove': true,
        'user:stories:list-updates': true,
        'stories:change-status': true,
        'users:current-confirm-otp': true,
        'users:change-mobile-number': true,
        'users:resend-otp': true,
        'users:upload-profile-image': true,
        'users:profile': true,
        'users:create-withdrawal': true,
        'users:update': true,
        'users:delete-profile-image': true,
        'auth:login-qr-code': true
      }
    )
  }
}

module.exports = RoleUserAccess
