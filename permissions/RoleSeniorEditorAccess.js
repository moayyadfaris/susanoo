const BaseRoleAccess = require('./BaseRoleAccess')

class RoleSeniorEditorAccess extends BaseRoleAccess {
  static get can () {
    return Object.assign(
      { ...this.basePermissions },
      {
        'web#stories:create': true,
        'web#stories:create-draft': true,
        'web#countries:list': true,
        'web#users:get-current-user': true,
        'web#auth:logout': true,
        'web#auth:refresh-tokens': true,
        'web#users:list': true,
        'web#interests:list': true,
        'web#stories:list': true,
        'web#stories:get-by-id': true,
        'web#stories:reports': true,
        'web#stories:assign': true,
        'web#stories:change-status': true,
        'web#attachments:create': true,
        'web#stories:create-special-fess': true,
        'web#users:get-by-id': true,
        'web#users:list-stories': true,
        'web#users:promote': true,
        'web#stories:update': true,
        'web#story:messages:create': true,
        'web#story:messages:list': true,
        'stories:list-reporters': true,
        'web#stories:delete': true,
        'web#notifications:list': true,
        'web#stories:resubmit': true,
        'web#users:change-password': true,
        'web#users:update': true,
        'web#users:upload-profile-image': true,
        'web#notifications:update': true,
        'web#stories:update-draft': true,
        'web#stories:get-status': true,
        'web#stories:get-stats': true

      }
    )
  }
}

module.exports = RoleSeniorEditorAccess
