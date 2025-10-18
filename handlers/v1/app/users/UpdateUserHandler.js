const { RequestRule } = require('backend-core')
const BaseHandler = require('handlers/BaseHandler')
const UserModel = require('models/UserModel')
const { getUserService } = require('../../../../services')
const { ErrorWrapper, errorCodes } = require('backend-core')
class UpdateUserHandler extends BaseHandler {
  static get accessTag () {
    return 'users:update'
  }

  static get validationRules () {
    return {
      body: {
        name: new RequestRule(UserModel.schema.name),
        countryId: new RequestRule(UserModel.schema.countryId),
        bio: new RequestRule(UserModel.schema.bio)
      }
    }
  }

  static async run (ctx) {
    const userService = getUserService()
    if (!userService) {
      throw new ErrorWrapper({
        ...errorCodes.INTERNAL_SERVER_ERROR,
        message: 'User service not available',
        layer: 'UpdateUserHandler.run'
      })
    }

    const result = await userService.updateUser({
      userId: ctx.currentUser.id,
      payload: ctx.body
    })

    return this.result(result)
  }
}

module.exports = UpdateUserHandler
