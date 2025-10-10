const { assert } = require('backend-core')

module.exports = currentUser => {
  assert.object(currentUser, { required: true })

  return new Promise((resolve, reject) => {
    currentUser.id ? resolve(true) : resolve(false)
  })
}
