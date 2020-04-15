const roles = require(__folders.config).roles
const RoleAdminAccess = require('./RoleAdminAccess')
const RoleEditorAccess = require('./RoleEditorAccess')
const RoleUserAccess = require('./RoleUserAccess')
const RoleAnonymousAccess = require('./RoleAnonymousAccess')

module.exports = {
  [roles.superadmin]: [
    // [roles.superadmin] have all permissions
    // so we don't need to list it
    // just check [roles.superadmin] in access services
  ],
  [roles.admin]: RoleAdminAccess.can,
  [roles.editor]: RoleEditorAccess.can,
  [roles.user]: RoleUserAccess.can,
  [roles.anonymous]: RoleAnonymousAccess.can
}
