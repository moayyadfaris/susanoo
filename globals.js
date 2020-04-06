/**
 ******************************
 ******************************
 ******************************
 * Globals is anti pattern
 * Use it very careful
 ******************************
 ******************************
 ******************************
 */

const config = require('./config')

module.exports = () => {
  global.__folders = config.folders
}
