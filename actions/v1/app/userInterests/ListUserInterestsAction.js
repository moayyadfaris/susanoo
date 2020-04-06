const BaseAction = require(__folders.actions + '/BaseAction')
const UserInterestDAO = require(__folders.dao + '/UserInterestDAO')
const InterestDAO = require(__folders.dao + '/InterestDAO')

class ListUserInterestsAction extends BaseAction {
  static get accessTag () {
    return 'user:interests:list'
  }

  static get validationRules () {
    return {
      query: {
        ...this.baseQueryParams
      }
    }
  }

  static async run (ctx) {
    const { currentUser, query } = ctx
    query.limit = 100
    let interestList = []
    const userInterests = await UserInterestDAO.getUserInterests(currentUser.id)
    const interest = await InterestDAO.baseGetList({ ...query })
    interest.results.forEach(element => {
      const found = userInterests.some(el => el.id === element.id)
      if (found) {
        element.selected = true
      } else {
        element.selected = false
      }
      interestList.push(element)
    })
    return this.result({
      data: interestList,
      headers: { 'X-Total-Count': interestList.length }
    })
  }
}

module.exports = ListUserInterestsAction
