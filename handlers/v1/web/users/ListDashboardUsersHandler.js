const BaseHandler = require('handlers/BaseHandler')
const UserDAO = require('database/dao/UserDAO')
/**
 * @description return users list
 */
class ListDashboardUsersHandler extends BaseHandler {
  static get accessTag () {
    return 'web#users-dashboard:list'
  }

  static get validationRules () {
    return {
      query: {
        ...this.baseQueryParams
      }
    }
  }

  static async run (req) {
    const { query } = req
    query.filterIn = {}
    query.filterIn['role'] = ['ROLE_SENIOR_EDITOR', 'ROLE_EDITOR', 'ROLE_FINANCIAL_MANAGER']

    const data = await UserDAO.getUsers({ ...query }, null, ['id', 'role', 'name', 'role', 'isActive', 'email'])
    const groupBy = (array, key) => {
      return array.reduce((result, currentValue) => {
        (result[currentValue[key]] = result[currentValue[key]] || []).push(
          currentValue
        )
        return result
      }, {})
    }
    const userGroupedByRole = groupBy(data.results, 'role')
    return this.result({
      data: userGroupedByRole,
      headers: {
        'X-Total-Count': data.total
      }
    })
  }
}

module.exports = ListDashboardUsersHandler
