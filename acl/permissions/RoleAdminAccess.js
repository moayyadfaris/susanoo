const BaseRoleAccess = require('./BaseRoleAccess')

class RoleAdminAccess extends BaseRoleAccess {
  static get can () {
    return Object.assign(
      { ...this.basePermissions },
      {
        'users:get-current-user': false,
        'runtime-settings:get': true,
        'runtime-settings:list': true,
        'runtime-settings:write': true,
        'root:status': true,
        'root:callback': true,
        'categories:list': true,
        'categories:create': true,
        'categories:update': true,
        'categories:delete': true,
        'stories:assign-categories': true
      }
    )
  }
}

module.exports = RoleAdminAccess
