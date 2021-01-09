class RoleAnonymousAccess {
  static get can () {
    return {
      'users:get-by-id': true,
      'users:create': true,
      'users:confirm-registration': true,
      'users:confirm-email': true,
      'users:confirm-otp': true,
      'users:send-reset-password-email': true,
      'users:send-reset-password-otp': true,
      'users:check-reset-password-otp': true,
      'users:reset-password': true,
      'users:list': true,
      'users:remove': true,
      'users:send-verify-otp': true,
      'users:check-phone-email': true,
      'users:update-mobile-number': true,

      'auth:login': true,
      'auth:refresh-tokens': true,

      'posts:list': true,
      'posts:get-by-id': true,

      'countries:list': true,
      'web#auth:login': true,
      'web#auth:logout': true,
      'web#auth:refresh-tokens': true,
      'config:get': true,
      'web#users:create': true,
      'web#cache:clear': true,
      'web#users:send-reset-password-token': true,
      'web#users:reset-password': true,
      'web#users:confirm-reset-password': true
    }
  }
}

module.exports = RoleAnonymousAccess
