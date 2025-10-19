const BaseRoleAccess = require('./BaseRoleAccess')

class RoleSuperAdminAccess extends BaseRoleAccess {
  static get can () {
    return Object.assign(
      { ...this.basePermissions },
      {
        'web#users:get-current-user': true,
        'web#users:get-by-id': true,
        'web#users:list': true,
        'web#users:remove': true
      }
    )
  }
}

module.exports = RoleSuperAdminAccess
