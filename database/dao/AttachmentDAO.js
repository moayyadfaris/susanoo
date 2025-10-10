const { BaseDAO } = require('backend-core')
const s3Config = require('config').s3
class AttachmentDAO extends BaseDAO {
  static get tableName () {
    return 'attachments'
  }

  static get virtualAttributes () {
    return ['fullPath', 'thumbnails', 'streams']
  }

  fullPath () {
    return s3Config.baseUrl + this.path
  }

  streams () {
    let path = this.path.split('.')
    let streams = s3Config.videoStreamTypes
    const ListStreams = []
    if (s3Config.videoMimeTypes.includes(this.mimeType)) {
      streams.forEach(element => {
        ListStreams.push({
          path: s3Config.baseUrl + 'thumbnails/' + path[0] + '/' + element + '.m3u8',
          'resolution': element
        })
      })
    }
    return ListStreams
  }

  thumbnails () {
    let imageSizes = s3Config.thumbnailSizes
    let streams = s3Config.videoStreamTypes
    const ListImageSizes = []
    const ListVideoSizes = []
    let path = this.path.split('.')
    if (s3Config.videoMimeTypes.includes(this.mimeType)) {
      streams.forEach(element => {
        ListVideoSizes.push({
          path: s3Config.baseUrl + 'thumbnails/' + path[0] + '/' + element + '-00001.png',
          'dimension': element
        })
      })
      return ListVideoSizes
    } else {
      imageSizes.forEach(element => {
        ListImageSizes.push({
          path: s3Config.baseUrl + 'thumbnails/' + path[0] + '-' + element + '.' + path[1],
          'dimension': element
        })
      })
      return ListImageSizes
    }
  }

  static get relationMappings () {
    return {
      stories: {
        relation: BaseDAO.ManyToManyRelation,
        modelClass: `${__dirname}/StoryDAO`,
        join: {
          from: 'attachment.id',
          through: {
            // user_interests is the join table.
            from: 'story_attachments.attachmentId',
            to: 'story_attachments.storyId'
          },
          to: 'story.id'
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
    delete json.userId
    delete json.path
    delete json.createdAt
    delete json.updatedAt

    return json
  }
}

module.exports = AttachmentDAO
