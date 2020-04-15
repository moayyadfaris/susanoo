const GetCurrentUserHandler = require('./GetCurrentUserHandler')
const ListUsersHandler = require('./ListUsersHandler')
const GetUserByIdHandler = require('./GetUserByIdHandler')
const ChangePasswordHandler = require('./ChangePasswordHandler')
const UpdateUserHandler = require('./UpdateUserHandler')
const UploadProfileImageHandler = require('./UploadProfileImageHandler')
const CreateUserHandler = require('./CreateUserHandler')
const RemoveUserHandler = require('./ActivationUserHandler')
const SendResetPasswordTokenHandler = require('./SendResetPasswordTokenHandler')
const ResetPasswordHandler = require('./ResetPasswordHandler')
const ConfirmResetPasswordTokenHandler = require('./ConfirmResetPasswordTokenHandler')
const ListDashboardUsersHandler = require('./ListDashboardUsersHandler')

module.exports = {
  GetCurrentUserHandler,
  ListUsersHandler,
  GetUserByIdHandler,
  ChangePasswordHandler,
  UploadProfileImageHandler,
  UpdateUserHandler,
  CreateUserHandler,
  RemoveUserHandler,
  SendResetPasswordTokenHandler,
  ResetPasswordHandler,
  ConfirmResetPasswordTokenHandler,
  ListDashboardUsersHandler
}
