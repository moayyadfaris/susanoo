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
    // pass seniorEditor
    if (currentUser.role === roles.seniorEditor) return resolve()
    // pass owner
    if (currentUser.id === model.editor.userId) return resolve()
    // else reject
    return reject(new ErrorWrapper({ ...errorCodes.ACCESS }))
  })
}

