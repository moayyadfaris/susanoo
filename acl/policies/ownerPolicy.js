const { errorCodes, ErrorWrapper, assert } = require('backend-core')

const roles = require(__folders.config).roles

/**
 * @description model userId === current user id
 * @access owner, superadmin
 * @case update or delete model
 */
module.exports = (model, currentUser) => {
  assert.object(model, { required: true })
  assert.object(currentUser, { required: true })

  return new Promise((resolve, reject) => {
    // pass superadmin
    if (currentUser.role === roles.superadmin) return resolve()
    // pass owner
    if (currentUser.id === model.userId) return resolve()
    // else reject
    return reject(new ErrorWrapper({ ...errorCodes.ACCESS }))
  })
}

