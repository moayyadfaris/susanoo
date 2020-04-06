const routesV1 = require('./app')
const routesWebV1 = require('./web')

module.exports = [
  {
    routes: routesV1,
    version: '/api/v1'
  }, {
    routes: routesWebV1,
    version: '/api/v1/web'
  }
]
