const bcrypt = require('bcryptjs')
const { assert } = require('backend-core')

/**
 * @return {Promise} string
 */
module.exports = password => {
  assert.string(password, { notEmpty: true })

  return new Promise((resolve, reject) => {
    bcrypt.genSalt(10, (error, salt) => {
      if (error) return reject(error)

      bcrypt.hash(password, salt, (error, hash) => {
        if (error) return reject(error)
        return resolve(hash)
      })
    })
  })
}
