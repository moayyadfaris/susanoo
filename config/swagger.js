const config = require('./app')
module.exports = {
  info: {
    // API informations (required)
    title: config.name, // Title (required)
    version: config.version, // Version (required)
    description: config.desc // Description (optional)
  },
  // host: 'localhost:' + config.app.port, // Host (optional)
  basePath: '/api/v1/', // Base path (optional)
  securityDefinitions: {
    JWT: {
      type: 'apiKey',
      description: 'JWT authorization of an API',
      name: 'Authorization',
      in: 'header'
    }
  },
  options: {
    explorer: true,
    swaggerOptions: {
      urls: [
        {
          url: '/docs/swagger.json',
          name: 'AppAPIs {v1}'
        },
        {
          url: '/docs/swagger-web.json',
          name: 'WebAPIs {v1}'
        }
      ]
    }
  }
}
