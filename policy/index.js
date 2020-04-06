const actionTagPolicy = require('./actionTagPolicy')
const ownerPolicy = require('./ownerPolicy')
const privateItemPolicy = require('./privateItemPolicy')
const updateUserPolicy = require('./updateUserPolicy')
const memberPolicy = require('./memberPolicy')
const isOwnerPolicy = require('./isOwnerPolicy')
const isMemberPolicy = require('./isMemberPolicy')
const dashboardUserPolicy = require('./dashboardUserPolicy')

module.exports = {
  actionTagPolicy,
  ownerPolicy,
  privateItemPolicy,
  updateUserPolicy,
  memberPolicy,
  isOwnerPolicy,
  isMemberPolicy,
  dashboardUserPolicy
}
