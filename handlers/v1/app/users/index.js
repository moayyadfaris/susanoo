const ListUsersHandler = require('./ListUsersHandler')
const GetUserByIdHandler = require('./GetUserByIdHandler')
const CreateUserHandler = require('./CreateUserHandler')
const UpdateUserHandler = require('./UpdateUserHandler')
const RemoveUserHandler = require('./RemoveUserHandler')

const GetCurrentUserHandler = require('./GetCurrentUserHandler')
const GetProfileHandler = require('./GetProfileHandler')

const ChangePasswordHandler = require('./ChangePasswordHandler')
const SendResetPasswordEmailHandler = require('./SendResetPasswordEmailHandler')
const ResetPasswordHandler = require('./ResetPasswordHandler')

const ConfirmRegistrationHandler = require('./ConfirmRegistrationHandler')
const ConfirmEmailHandler = require('./ConfirmEmailHandler')
const ConfirmRegistrationOTPHandler = require('./ConfirmRegistrationOTPHandler')
const ChangeEmailHandler = require('./ChangeEmailHandler')
const CancelEmailChangingHandler = require('./CancelEmailChangingHandler')
const SendResetPasswordOTPHandler = require('./SendResetPasswordOTPHandler')
const CheckResetPasswordOTPHandler = require('./CheckResetPasswordOTPHandler')
const SendVerifyOTPHandler = require('./SendVerifyOTPHandler')
const ConfirmOTPHandler = require('./ConfirmOTPHandler')
const ChangeMobileNumberHandler = require('./ChangeMobileNumberHandler')

const CheckAvailabilityHandler = require('./CheckAvailabilityHandler')
const DeleteProfileImageHandler = require('./DeleteProfileImageHandler')
const UploadProfileImageHandler = require('./UploadProfileImageHandler')
const ResendOTPHandler = require('./ResendOTPHandler')

module.exports = {
  ListUsersHandler,
  GetUserByIdHandler,
  CreateUserHandler,
  UpdateUserHandler,
  RemoveUserHandler,

  GetCurrentUserHandler,
  GetProfileHandler,

  ChangePasswordHandler,
  SendResetPasswordEmailHandler,
  SendResetPasswordOTPHandler,
  CheckResetPasswordOTPHandler,
  ResetPasswordHandler,
  SendVerifyOTPHandler,

  ConfirmRegistrationHandler,
  ConfirmEmailHandler,
  ChangeEmailHandler,
  CancelEmailChangingHandler,
  ConfirmRegistrationOTPHandler,
  CheckAvailabilityHandler,
  ConfirmOTPHandler,
  ChangeMobileNumberHandler,
  ResendOTPHandler,
  UploadProfileImageHandler,
  DeleteProfileImageHandler
}

