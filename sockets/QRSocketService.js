require('../globals')()
const redis = require('redis')
const config = require(__folders.config)
const io = require('socket.io')(config.app.socketPort, { path: '/qr-service/socket.io', origins: '*:*' })
const { makeLoginByQRTokenHelper } = require(__folders.auth + '/')
const redisSocket = require('socket.io-redis')
io.adapter(redisSocket({ host: config.redis.host, port: config.redis.port }))
const subscriber = redis.createClient({ host: config.redis.host, port: config.redis.port })
console.log('...Start QR Service...')
subscriber.subscribe('LOGIN_BY_QR_CHANNEL')
require('socketio-auth')(io, {
  authenticate: function (socket, token, callback) {
    console.log('.....Try to Authenticate......')
    console.log(socket.handshake.headers)
    if (token !== config.app.qrCodeServiceToken) {
      console.log('Authentication Failed')
      return callback(new Error('Authentication Failed'))
    }
    console.log('.....Authenticated......')
    new Promise((resolve, reject) => {
      resolve(makeLoginByQRTokenHelper(socket.id))
    }).then((result) => {
      console.log('.....Return Login Token......')
      io.to(`${socket.id}`).emit('login_token_generated', result)
    })
    return callback(null, true)
  }
})
subscriber.on('message', function (channel, data) {
  const loginData = JSON.parse(data)
  if (loginData['eventType'] === 'ACCESS_TOKEN_GENERATED') {
    io.to(`${loginData.tokenData.socketId}`).emit('access_token_generated', data)
  } else if (loginData['eventType'] === 'LOGIN_TOKEN_EXPIRED') {
    io.to(`${loginData.tokenData.socketId}`).emit('login_token_expired', data)
  } else {
    console.log('Unhandled Channel' + channel)
  }
})
