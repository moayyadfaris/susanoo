const { BaseDAO, assert } = require('backend-core')
const { roles } = require('config')

class StoryDAO extends BaseDAO {
  static get tableName () {
    return 'stories'
  }

  static get relationMappings () {
    return {
      tags: {
        relation: BaseDAO.ManyToManyRelation,
        modelClass: `${__dirname}/TagDAO`,
        join: {
          from: 'stories.id',
          through: {
            // persons_movies is the join table.
            from: 'story_tags.storyId',
            to: 'story_tags.tagId'
          },
          to: 'tags.id'
        }
      },
      reporter: {
        relation: BaseDAO.HasOneRelation,
        modelClass: `${__dirname}/UserDAO`,
        filter: query => query.select('users.id', 'users.name', 'profileImageId').where('users.role', roles.user).first(),
        join: {
          from: 'stories.userId',
          to: 'users.id'
        }
      },
      attachments: {
        relation: BaseDAO.ManyToManyRelation,
        modelClass: `${__dirname}/AttachmentDAO`,
        join: {
          from: 'stories.id',
          through: {
            // persons_movies is the join table.
            from: 'story_attachments.storyId',
            to: 'story_attachments.attachmentId'
          },
          to: 'attachments.id'
        }
      },
      owner: {
        relation: BaseDAO.BelongsToOneRelation,
        filter: query => query.select('id', 'name', 'role', 'profileImageId', 'email'),
        modelClass: `${__dirname}/UserDAO`,
        join: {
          from: 'stories.userId',
          to: 'users.id'
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
    delete json.reporterId
    delete json.parentId
    if (json.createdAt) {
      json.createdAt = new Date(json.createdAt).toISOString().split('.')[0]
      json.updatedAt = new Date(json.updatedAt).toISOString().split('.')[0]
    }
    if (json.fromTime) {
      json.fromTime = new Date(json.fromTime).toISOString().split('.')[0]
    }
    if (json.toTime) {
      json.toTime = new Date(json.toTime).toISOString().split('.')[0]
    }
    if (this.editor) {
      json.editor = this.editor.user
    }

    // json.status = StoryDAO.getStatusLabel(json.status)
    return json
  }

  /**
   * ------------------------------
   * @METHODS
   * ------------------------------
   */

  static async create (storyData) {
    assert.object(storyData, { required: true })
    const story = await this.query()
      .insertGraph({
        ...storyData
      }, { unrelate: true, allowRefs: true })
      .eager('[tags,attachments]')
    return story
  };

  static async getList ({ page, limit, filter, orderBy, filterIn, term } = {}) {
    assert.integer(page, { required: true })
    assert.integer(limit, { required: true })
    assert.object(filter, { required: true })
    const query = this.query()
    query.where({ ...filter })

    if (filterIn) {
      query.whereIn(filterIn.key, filterIn.value)
    }

    if (term) {
      query.whereRaw('LOWER(stories.title) LIKE ?', '%' + term.toLowerCase() + '%')
    }
    query.orderBy(orderBy.field, orderBy.direction)
    query.page(page, limit).eager('[editor,tags,parentStory,editor.user,hasUnreadMessage]')

    let data = await query
    if (!data.results.length) return this.emptyPageResponse()
    return data
  }

  static async getByID (id) {
    assert.integer(id, { required: true })
    let data = await this.query().findById(id)
    return data
  }

  static async getStoryDetails (id, relations) {
    assert.integer(id, { required: true })
    let data = await this.query().withGraphFetched(relations).findById(id)
    if (!data) throw this.errorEmptyResponse()
    return data
  }

  static async getStoriesRequestsList ({ page, limit, filter, orderBy, term } = {}, user, relations) {
    assert.integer(page, { required: true })
    assert.integer(limit, { required: true })
    assert.object(filter, { required: true })

    const query = this.query()
    if (term) {
      query.whereRaw('LOWER(stories.title) LIKE ?', '%' + term.toLowerCase() + '%')
    }
    // query.where('fromTime', '<=', new Date())
    query.where({ ...filter })

    query.orderBy(orderBy.field, orderBy.direction)
    query.page(page, limit).eager(relations)

    let data = await query
    console.log('****data')
    console.log(data)
    if (!data.results.length) return this.emptyPageResponse()
    return data
  }

  static async getListWeb ({ page, limit, filter, orderBy, filterIn, term, editorId } = {}) {
    assert.integer(page, { required: true })
    assert.integer(limit, { required: true })
    assert.object(filter, { required: true })
    assert.object(filterIn, { required: false })
    assert.string(term, { required: false })

    const query = this.query().distinct()
    if (term) {
      if (isNaN(term)) {
        query.joinRelated('[tags, owner]')
        // query.leftJoinRelated('editor.[user]')
        query.where((builder) =>
          builder.whereRaw('LOWER(stories.title) LIKE ?', '%' + term.toLowerCase() + '%')
            .orWhereRaw('LOWER(tags.name) LIKE ?', '%' + term.toLowerCase() + '%')
            .orWhereRaw('LOWER(owner.name) LIKE ?', '%' + term.toLowerCase() + '%')
            // .orWhere('editor:user.name', term)
        )
      } else {
        query.where('stories.id', term)
      }
    }

    if (editorId) {
      query.joinRelation('editor')
      query.where('editor.userId', editorId)
    }
    if (filter['isInEditMode']) {
      const statusFilter = filterIn['status']
      query.where((builder) =>
        builder.whereIn('status', statusFilter).orWhere('isInEditMode', true)
      )
      if (statusFilter.includes('IN_PROGRESS')) {
        query.joinRelation('editor')
      }
      if (statusFilter.includes('SUBMITTED')) {
        query.leftJoinRelated('editor')
        query.where('editor.id', null)
      }
      delete filter['isInEditMode']
      delete filterIn['status']
    }
    if (filterIn) {
      Object.keys(filterIn).forEach(function (item) {
        query.whereIn(item, filterIn[item])
      })
    }
    query.where({ ...filter })
    query.whereNot('status', 'DELETED')
    query.orderBy(orderBy.field, orderBy.direction)
    query.page(page, limit).eager('[tags,editor,owner,owner.[profileImage]]')
      .groupBy('stories.id')
    let data = await query
    if (!data.results.length) return this.emptyPageResponse()
    return data
  }

  static async update (storyData) {
    assert.object(storyData, { required: true })
    const story = await this.query()
      .upsertGraph({
        ...storyData
      }, { unrelate: true, allowRefs: true })
      .eager('[editor, tags,parentStory,attachmentFiles,attachmentLinks]')
    return story
  };

  static async getExpiredStoriesByTimespan () {
    return await this.query().where('toTime', '<', new Date()).where('parentId', null).where('status', 'SUBMITTED')
  }

  static async getExpiredStories () {
    return await this.query().where('parentId', null).where('status', 'EXPIRED')
  }

  static async getReportsByArchivedStory (parentId) {
    return await this.query().where('parentId', parentId).where('status', 'SUBMITTED')
  }

  static async archiveReportsByDeleteParent (parentId) {
    return await this.query().update({ status: 'ARCHIVED' }).where('parentId', parentId).whereNot(function () {
      this.where('status', 'APPROVED').orWhere('status', 'PUBLISHED')
    })
  }
}

module.exports = StoryDAO
