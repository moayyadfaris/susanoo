const { RequestRule } = require('backend-core')
const BaseHandler = require(__folders.handlers + '/BaseHandler')
const UserDAO = require(__folders.dao + '/UserDAO')
const UserModel = require(__folders.models + '/UserModel')
// const { updateUserPolicy } = require(__folders.policy)

class RemoveUserHandler extends BaseHandler {
  static get accessTag () {
    return 'users:remove'
  }

  static get validationRules () {
    return {
      params: {
        id: new RequestRule(UserModel.schema.id, { required: true })
      }
    }
  }

  static async run (req) {
    // const { currentUser } = req
    const id = req.params.id

    // const model = await UserDAO.baseGetById(id)
    // await updateUserPolicy(model, currentUser)
    await UserDAO.baseRemove(id)

    return this.result({ message: `${id} was removed` })
  }
}

module.exports = RemoveUserHandler
