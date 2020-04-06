const BaseRoleAccess = require('./BaseRoleAccess')

class RoleAdminAccess extends BaseRoleAccess {
  static get can () {
    return Object.assign({ ...this.basePermissions }, { 'users:get-current-user': false })
  }
}

module.exports = RoleAdminAccess
