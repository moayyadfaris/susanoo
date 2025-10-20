const { makePasswordHashHelper } = require('../../helpers/').authHelpers

exports.seed = function (knex) {
  // Deletes ALL existing entries
  return knex('users').del()
    .then(async function () {
      // Inserts seed entries
      return knex('users').insert([
        {
          id: '86148480-f4b2-11e9-802a-5aa538984bd8',
          name: 'Moayyad Faris',
          role: 'ROLE_SUPERADMIN',
          email: 'admin@susano.dev',
          mobileNumber: '962795974021',
          countryId: 108,
          passwordHash: await makePasswordHashHelper('Admin@123'),
          isVerified: true
        }
      ])
    })
}
