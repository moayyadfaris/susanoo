const BaseRoleAccess = require('./BaseRoleAccess')

class RoleEditorAccess extends BaseRoleAccess {
  static get can () {
    return Object.assign(
      { ...this.basePermissions },
      {
        'web#stories:list': true,
        'web#stories:change-status': true,
        'web#users:get-current-user': true,
        'web#auth:logout': true,
        'web#auth:refresh-tokens': true,
        'web#stories:get-by-id': true,
        'web#users:change-password': true,
        'web#users:update': true,
        'web#users:upload-profile-image': true
      }
    )
  }
}

module.exports = RoleEditorAccess
