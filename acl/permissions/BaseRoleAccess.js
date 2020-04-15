class BaseRoleAccess {
  static get basePermissions () {
    return {
      'users:list': false,
      'users:update': false,
      'users:get-by-id': false,
      'users:remove': false,
      'users:get-current-user': false,

      'users:change-password': false,
      'users:change-email': false,
      'users:confirm-email': false,
      'users:send-email-confirm-token': false,
      'users:send-reset-password-email': false,
      'users:reset-password': false,
      'users:current-confirm-otp': false,
      'users:change-mobile-number': false,
      'users:resend-otp': false,
      'users:upload-profile-image': false,
      'users:profile': false,
      'users:delete-profile-image': false,

      'stories:all': false,

      'auth:logout': false,
      'auth:logout-all-sessions': false,

      'interests:list': false,
      'user:interests:add': false,
      'user:interests:list': false,

      'stories:create': false,
      'stories:list': false,
      'stories:create-draft': false,
      'stories:get-by-id': false,
      'stories:delete': false,
      'stories:update': false,
      'stories:update-draft': false,
      'stories:upload-attachments': false,
      'stories:delete-attachments-links': false,
      'stories:attachments:remove': false,
      'stories:change-status': false,

      'web:stories:create': false,
      'web:stories:create-draft': false,
      'web:countries:list': false,
      'web:users:get-current-user': false,
      'web#auth:login': false,
      'web#auth:logout': false,
      'web#auth:refresh-tokens': false,
      'web#countries:list': false,

      'web#users:list': false,
      'web#interests:list': false,

      'user:stories:list': false,
      'user:stories:list-updates': false,
      'web#stories:list': false,
      'web#stories:assign': false,
      'attachments:create': false,
      'web#stories:get-by-id': false,
      'web#stories:reports': false,
      'web#stories:change-status': false,
      'web#attachments:create': false,
      'web#stories:create-special-fess': false,
      'web#users:get-by-id': false,
      'web#users:list-stories': false,
      'web#users:promote': false,
      'web#stories:update': false,
      'web#stories:delete': false,
      'stories:list-reporters': false,
      'web#stories:resubmit': false,
      'web#users:change-password': false,
      'web#users:update': false,
      'web#users:upload-profile-image': false,
      'web#stories:update-draft': false,
      'web#stories:get-status': false,
      'web#stories:get-stats': false,
      'web#users:remove': false,
      'auth:login-qr-code': false
    }
  }
}

module.exports = BaseRoleAccess

