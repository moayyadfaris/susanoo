const { expect } = require('chai')
const sinon = require('sinon')
const { ErrorWrapper } = require('backend-core')

const SessionLifecycleService = require('../../services/auth/SessionLifecycleService')

describe('SessionLifecycleService', () => {
  let sandbox
  let sessionDAO
  let userDAO
  let sessionCacheService
  let logger
  let service

  beforeEach(() => {
    sandbox = sinon.createSandbox()

    sessionDAO = {
      getSessionById: sandbox.stub(),
      deleteSession: sandbox.stub(),
      deleteUserSessions: sandbox.stub(),
      baseGetWhere: sandbox.stub(),
      baseUpdate: sandbox.stub(),
      updateSession: sandbox.stub(),
      countRecentLogouts: sandbox.stub().resolves(0)
    }

    userDAO = {
      baseUpdate: sandbox.stub(),
      getUserById: sandbox.stub()
    }

    sessionCacheService = {
      removeSpecificSession: sandbox.stub().resolves({ success: true }),
      clearUserSessions: sandbox.stub().resolves({ success: true }),
      addSession: sandbox.stub().resolves({ success: true }),
      updateSession: sandbox.stub().resolves({ success: true })
    }

    logger = {
      info: sandbox.stub(),
      warn: sandbox.stub(),
      error: sandbox.stub()
    }

    service = new SessionLifecycleService({
      sessionDAO,
      userDAO,
      sessionCacheService,
      authHelpers: {
        makeAccessTokenHelper: sandbox.stub(),
        parseTokenHelper: sandbox.stub()
      },
      config: {
        sessionTimeout: 60_000,
        rememberMeExpiry: 120_000,
        refreshTokenRotation: true,
        maxLogoutAttempts: 10,
        logoutWindowMinutes: 5
      },
      logger
    })

    service.authHelpers.makeAccessTokenHelper.resolves('access-token')
    sandbox.stub(service, 'createSession').resolves({
      sessionId: 'new-session',
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresAt: new Date()
    })
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('logoutSession invalidates only the current session', async () => {
    const session = { id: 'sess-1', userId: 'user-1', deviceInfo: {} }
    sessionDAO.getSessionById.resolves(session)
    sessionDAO.deleteSession.resolves(1)
    sessionDAO.deleteUserSessions.resolves(0)

    const result = await service.logoutSession('sess-1', { reason: 'user_initiated' })

    expect(result.success).to.equal(true)
    expect(result.sessionsInvalidated).to.equal(1)
    expect(result.cacheCleared).to.equal(true)
    expect(result.logoutAllDevices).to.equal(false)
    expect(sessionCacheService.removeSpecificSession.calledOnce).to.equal(true)
    expect(sessionCacheService.clearUserSessions.called).to.equal(false)
  })

  it('logoutSession returns already invalidated when session missing', async () => {
    sessionDAO.getSessionById.resolves(null)

    const result = await service.logoutSession('missing-id', {})

    expect(result.success).to.equal(false)
    expect(result.alreadyInvalidated).to.equal(true)
    expect(result.sessionsInvalidated).to.equal(0)
    expect(sessionDAO.deleteSession.called).to.equal(false)
  })

  it('logoutByRefreshToken performs full logout including all devices', async () => {
    const session = {
      id: 'sess-2',
      userId: 'user-2',
      refreshToken: 'validToken123',
      deviceInfo: {},
      expiresAt: Date.now() + 60_000
    }

    sessionDAO.baseGetWhere.resolves(session)
    sessionDAO.getSessionById.resolves(session)
    sessionDAO.deleteSession.resolves(1)
    sessionDAO.deleteUserSessions.resolves(2)

    userDAO.baseUpdate.resolves()

    const result = await service.logoutByRefreshToken('validToken123', {
      userId: 'user-2',
      logoutAllDevices: true,
      reason: 'user_initiated',
      ip: '127.0.0.1',
      requestId: 'req-123',
      userAgent: 'unit-test'
    })

    expect(result.success).to.equal(true)
    expect(result.logoutType).to.equal('all_devices')
    expect(result.sessionsInvalidated).to.equal(3)
    expect(result.cacheCleared).to.equal(true)
    expect(sessionCacheService.removeSpecificSession.calledOnce).to.equal(true)
    expect(sessionCacheService.clearUserSessions.calledOnce).to.equal(true)
    expect(userDAO.baseUpdate.calledOnceWithExactly('user-2', sinon.match.object)).to.equal(true)
  })

  describe('refreshTokens', () => {
    it('rotates tokens when fingerprint matches', async () => {
      service.authHelpers.makeAccessTokenHelper.resolves('new-access-token')

      const session = {
        id: 'sess-3',
        userId: 'user-3',
        refreshToken: 'old-token',
        fingerprint: 'fp-123',
        expiresAt: Date.now() + 60_000
      }

      sessionDAO.baseGetWhere.resolves(session)
      sessionDAO.deleteSession.resolves(1)
      service.createSession.resolves({
        sessionId: 'new-session',
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresAt: new Date(Date.now() + 120_000)
      })
      userDAO.getUserById.resolves({ id: 'user-3', email: 'user3@example.com', role: 'ROLE_USER', isActive: true })

      const result = await service.refreshTokens('old-token', { fingerprint: 'fp-123', userAgent: 'unit-test' })

      expect(sessionDAO.baseGetWhere.calledWithMatch({ refreshToken: 'old-token' })).to.equal(true)
      expect(sessionDAO.deleteSession.calledOnce).to.equal(true)
      expect(service.createSession.calledOnce).to.equal(true)
      expect(sessionCacheService.removeSpecificSession.calledOnce).to.equal(true)
      expect(result.session.id).to.equal('new-session')
      expect(result.tokens.accessToken).to.equal('new-access-token')
      expect(result.tokens.refreshToken).to.equal('new-refresh-token')
    })

    it('throws when fingerprint does not match', async () => {
      const session = {
        id: 'sess-4',
        userId: 'user-4',
        refreshToken: 'token-123',
        fingerprint: 'expected-fp',
        expiresAt: Date.now() + 60_000
      }

      sessionDAO.baseGetWhere.resolves(session)

      let thrown
      try {
        await service.refreshTokens('token-123', { fingerprint: 'different-fp' })
      } catch (error) {
        thrown = error
      }

      expect(thrown).to.be.instanceOf(ErrorWrapper)
      expect(thrown.message).to.equal('Session verification failed')
      expect(sessionDAO.deleteSession.called).to.equal(false)
      expect(service.createSession.called).to.equal(false)
    })
  })
})
