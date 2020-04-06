require('../globals')()
const config = require('../config')
const Queue = require('bull')
const StoryDAO = require(__folders.dao + '/StoryDAO')
var expirationQueue = new Queue('story_expiration', config.queue.redisUrl)

expirationQueue.process(async (job, done) => {
  const expiredStories = await StoryDAO.getExpiredStoriesByTimespan()
  expiredStories.forEach(story => {
    StoryDAO.baseUpdate(story.id, { 'status': 'EXPIRED' }).then()
  })
  done()
})

expirationQueue.add({ type: 'archiving' }, { repeat: { cron: config.story.storyArchivingCrontab } })
