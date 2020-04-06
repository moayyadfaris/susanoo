const { errorCodes, ErrorWrapper, assert } = require('backend-core')
const roles = require(__folders.config).roles

/**
 * @description check if user have proper role to access dashboard
 * @public_access any user
 * @case get model by id
 * @returns {Promise} model
 */
module.exports = (User) => {
  assert.object(User, { required: true })

  return new Promise((resolve, reject) => {
    // pass to (ROLE_SENIOR_EDITOR,ROLE_EDITOR,ROLE_FINANCIAL_MANAGER)
    if ((User.role === roles.superadmin || User.role === roles.seniorEditor || User.role === roles.editor || User.role === roles.financialManager) && User.isActive === true) return resolve(User)
    // else reject
    return reject(new ErrorWrapper({ ...errorCodes.ACCESS }))
  })
}

