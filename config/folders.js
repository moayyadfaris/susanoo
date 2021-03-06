module.exports = {
  rootDir: process.env.PWD,
  publicDir: process.env.PWD + '/public',
  photoDir: process.env.PWD + '/public/photos',
  userfilesDir: process.env.PWD + '/public/userfiles',
  config: process.env.PWD + '/config',
  dao: process.env.PWD + '/database/dao',
  models: process.env.PWD + '/models',
  handlers: process.env.PWD + '/handlers',
  handlersV1: process.env.PWD + '/handlers/v1',
  helpers: process.env.PWD + '/helpers',
  policies: process.env.PWD + '/acl/policies',
  notifications: process.env.PWD + '/notifications',
  controllers: process.env.PWD + '/controllers',
  util: process.env.PWD + '/util'
}
