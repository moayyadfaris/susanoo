const { BaseDAO, assert } = require('backend-core')
const UserModel = require('../../models/UserModel')

class UserDAO extends BaseDAO {
  static get tableName () {
    return 'users'
  }

  static get jsonAttributes () {
    return ['refreshTokensMap']
  }

  static get relationMappings () {
    return {
      stories: {
        relation: BaseDAO.HasManyRelation,
        modelClass: `${__dirname}/StoryDAO`,
        join: {
          from: 'users.id',
          to: 'stories.userId'
        }
      },
      interests: {
        relation: BaseDAO.ManyToManyRelation,
        modelClass: `${__dirname}/InterestDAO`,
        join: {
          from: 'users.id',
          through: {
            // persons_movies is the join table.
            from: 'user_interests.userId',
            to: 'user_interests.interestId'
          },
          to: 'interests.id'
        }
      },
      country: {
        relation: BaseDAO.BelongsToOneRelation,
        filter: query => query.select('id', 'name'),
        modelClass: `${__dirname}/CountryDAO`,
        join: {
          from: 'users.countryId',
          to: 'countries.id'
        }
      },
      profileImage: {
        relation: BaseDAO.BelongsToOneRelation,
        modelClass: `${__dirname}/AttachmentDAO`,
        join: {
          from: 'users.profileImageId',
          to: 'attachments.id'
        }
      }
    }
  }

  /**
   * ------------------------------
   * @HOOKS
   * ------------------------------
   */
  $formatJson (json) {
    json = super.$formatJson(json)

    // delete sensitive data from all queries
    delete json.passwordHash
    delete json.emailConfirmToken
    delete json.resetPasswordToken
    delete json.newEmail
    delete json.resetPasswordCode
    delete json.resetPasswordOTP
    delete json.verifyCode
    delete json.updatedAt
    // delete json.role
    delete json.isVerified
    delete json.isConfirmedRegistration
    delete json.createdAt
    delete json.profileImageId
    delete json.newMobileNumber
    // delete json.updateToken
    // delete json.email

    return json
  }

  /**
   * ------------------------------
   * @METHODS
   * ------------------------------
   */

  static create (data) {
    assert.object(data, { required: true })
    assert.string(data.passwordHash, { notEmpty: true })

    return this.query().insert(data)
  };

  static async getByEmail (email, throwError = true) {
    assert.validate(email, UserModel.schema.email, { required: true })

    const data = await this.query().where({ email }).first()
    if (throwError) {
      if (!data) throw this.errorEmptyResponse()
    }
    return data
  }

  static async getByMobileNumber (mobileNumber, throwError) {
    assert.validate(mobileNumber, UserModel.schema.mobileNumber, { required: true })

    const data = await this.query().where({ mobileNumber }).first()
    if (throwError) {
      if (!data) throw this.errorEmptyResponse()
    }
    return data
  }

  static async getByEmailOrMobileNumber (emailOrMobileNumber, throwError = true) {
    if (emailOrMobileNumber.includes('@')) {
      return await this.getByEmail(emailOrMobileNumber, throwError)
    } else {
      return await this.getByMobileNumber(emailOrMobileNumber, throwError)
    }
  }

  static async getUserById (id, eagerList = null) {
    assert.validate(id, UserModel.schema.id, { required: true })

    const query = this.query().where({ id }).first()

    if (eagerList) {
      query.withGraphFetched(eagerList)
    }
    const data = await query.first()
    if (!data) throw this.errorEmptyResponse()
    // delete sensitive data from current user
    delete data.passwordHash
    delete data.updateToken
    delete data.resetPasswordToken
    delete data.resetPasswordCode
    delete data.resetPasswordOTP
    delete data.verifyCode
    delete data.newEmail
    delete data.createdAt
    delete data.updatedAt
    delete data.isConfirmedRegistration
    // delete data.mobileCountryId
    return data
  }

  /**
   * @description check email availability in DB.
   * @param email
   * @returns {Promise<boolean>}
   */
  static async isEmailExist (email) {
    assert.validate(email, UserModel.schema.email, { required: true })

    const data = await this.query().where({ email }).first()
    return Boolean(data)
  }

  /**
   * @description check phone number availability in DB.
   * @param email
   * @returns {Promise<boolean>}
   */
  static async isMobileNumberExist (mobileNumber) {
    assert.validate(mobileNumber, UserModel.schema.mobileNumber, { required: true })

    const data = await this.query().where({ mobileNumber }).first()
    return Boolean(data)
  }

  static async checkEmailAvailability (email) {
    assert.validate(email, UserModel.schema.email, { required: true })

    const data = await this.query().where({ email }).first()
    return { available: !data }
  }

  static async getUsers ({ page, limit, filter, orderBy, term, interests, filterIn } = {}, relations, select = []) {
    assert.integer(page, { required: true })
    assert.integer(limit, { required: true })
    assert.object(filter, { required: true })
    assert.integer(filter.userId)
    const query = this.query().where({ ...filter })
    if (term) {
      query.whereRaw('LOWER(users.name) LIKE ?', '%' + term.toLowerCase() + '%')
    }
    if (interests) {
      query.joinRelation('interests')
      query.whereIn('interests.id', interests)
    }
    if (filterIn) {
      Object.keys(filterIn).forEach(function (item) {
        query.whereIn(item, filterIn[item])
      })
    }

    query.withGraphFetched(relations)
    query.orderBy(orderBy.field, orderBy.direction).omit(['updateToken']).page(page, limit).select(select)
    let data = await query
    if (!data.results.length) return this.emptyPageResponse()
    return data
  }
}

module.exports = UserDAO
