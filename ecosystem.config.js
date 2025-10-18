module.exports = {
  apps: [{
    name: 'Susanoo Backend',
    script: 'npm run dev',

    // Options reference: https://pm2.io/doc/en/runtime/reference/ecosystem-file/
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env_development: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production'
    }
  },
  {
    name: 'Notification',
    script: 'npm run notifications-dev',
    // Options reference: https://pm2.io/doc/en/runtime/reference/ecosystem-file/
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env_development: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production'
    }
  },
  {
    name: 'Queue Dashboard',
    script: 'npm run queue:dashboard',
    // Options reference: https://pm2.io/doc/en/runtime/reference/ecosystem-file/
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env_development: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production'
    }
  }
  // {
  //   name: 'QR Code Service',
  //   script: 'npm run qr-code-service',
  //   // Options reference: https://pm2.io/doc/en/runtime/reference/ecosystem-file/
  //   instances: 1,
  //   autorestart: true,
  //   watch: false,
  //   max_memory_restart: '1G',
  //   env_development: {
  //     NODE_ENV: 'development'
  //   },
  //   env_production: {
  //     NODE_ENV: 'production'
  //   }
  // }
  ]
}
