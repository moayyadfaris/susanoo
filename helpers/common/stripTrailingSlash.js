const { assert } = require('backend-core')

/**
 * @return {Promise} string
 */
module.exports = url => {
  assert.string(url, { notEmpty: true })

  return url.endsWith('/')
    ? url.slice(0, -1)
    : url
}
