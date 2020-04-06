const BaseAction = require(__folders.actions + '/BaseAction')
const { RequestRule } = require('backend-core')
const UserInterestDAO = require(__folders.dao + '/UserInterestDAO')
const UserInterestModel = require(__folders.models + '/UserInterestModel')

class AddUserInterestAction extends BaseAction {
  static get accessTag () {
    return 'user:interests:add'
  }

  static get validationRules () {
    return {
      body: {
        interests: new RequestRule(UserInterestModel.schema.interests, { required: true })
      }
    }
  }

  static async run (ctx) {
    const { currentUser } = ctx

    await UserInterestDAO.patchInsert(currentUser.id, ctx.body.interests)

    return this.result({ message: 'Interests added successfully' })
  }
}

module.exports = AddUserInterestAction
