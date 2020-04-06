const { BaseDAO, assert } = require('backend-core')
const TagModel = require('../models/TagModel')

class TagDAO extends BaseDAO {
  static get tableName () {
    return 'tags'
  }

  static get relationMappings () {
    return {
      stories: {
        relation: BaseDAO.ManyToManyRelation,
        modelClass: `${__dirname}/StoryDAO`,
        join: {
          from: 'tags.id',
          through: {
            // story_tags is the join table.
            from: 'story_tags.tagId',
            to: 'story_tags.storyId'
          },
          to: 'stories.id'
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
    delete json.createdAt
    delete json.updatedAt
    delete json.createdBy
    delete json.storyId

    return json
  }

  /**
   * ------------------------------
   * @METHODS
   * ------------------------------
   */

  static async prepareStoryTagsInsertion (tags, createdBy) {
    assert.validate(tags, TagModel.schema.tagNames, { required: true })
    assert.validate(createdBy, TagModel.schema.createdBy, { required: true })

    const data = await this
      .query()
      .whereIn('name', tags)

    var preparedTags = []
    tags.forEach(element => {
      var result = data.filter(function (elem) {
        return elem.name === element
      })
      var item = {}
      if (result.length > 0) {
        item = {
          '#dbRef': result[0].id
        }
      } else {
        item = {
          name: element,
          createdBy: createdBy
        }
      }
      const exists = preparedTags.filter(intrest => {
        return JSON.stringify(intrest) === JSON.stringify(item)
      })
      if (exists.length === 0) {
        preparedTags.push(item)
      }
    })
    return preparedTags
  };
}

module.exports = TagDAO
