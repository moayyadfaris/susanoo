const router = require('express').Router()

const { BaseController } = require('controllers/BaseController')
const handlers = require('handlers/v1/app/auth')

/**
 * AuthController - Enterprise authentication endpoint management
 * 
 * Handles all authentication-related HTTP endpoints with:
 * - Comprehensive security controls and rate limiting
 * - Structured logging and monitoring
 * - Input validation and sanitization
 * - Session lifecycle management
 * - Complete API documentation
 * 
 * @extends BaseController
 * @version 2.0.0
 */
class AuthController extends BaseController {
  constructor(options = {}) {
    super(options)
    
    // Controller-specific configuration
    this.authConfig = {
      rateLimiting: {
        login: { windowMs: 15 * 60 * 1000, max: 5 }, // 5 attempts per 15 min
        logout: { windowMs: 5 * 60 * 1000, max: 10 }, // 10 attempts per 5 min
        refresh: { windowMs: 5 * 60 * 1000, max: 20 } // 20 attempts per 5 min
      },
      security: {
        enableBruteForceProtection: true,
        enableSessionTracking: true,
        logSecurityEvents: true
      }
    }
    
    // Initialize metrics collection
    this.metrics = {
      requests: new Map(),
      errors: new Map(),
      securityEvents: new Map()
    }
  }
  get router () {
    // Add security middleware for all auth routes
    router.use(this.securityMiddleware())
    
    // === SESSION MANAGEMENT ===
    /**
    * @swagger
    * /auth/login:
    *   post:
    *     tags:
    *       - Authentication
    *     name: Login
    *     summary: Email-only user authentication - Enhanced security
    *     description: |
    *       Authenticates user with email/password and creates a new session.
    *       Requires device fingerprinting for enhanced security.
    *     produces:
    *       - application/json
    *     consumes:
    *       - application/json
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             type: object
    *             required:
    *               - email
    *               - password
    *               - fingerprint
    *             properties:
    *               email:
    *                 type: string
    *                 format: email
    *                 description: User email address
    *                 example: "user@example.com"
    *               password:
    *                 type: string
    *                 format: password
    *                 description: User password (min 8 characters)
    *                 minLength: 8
    *               fingerprint:
    *                 type: string
    *                 description: Device fingerprint for security
    *                 example: "fp_1234567890abcdef"
    *               rememberMe:
    *                 type: boolean
    *                 description: Remember login session for extended period
    *                 default: false
    *               deviceInfo:
    *                 type: object
    *                 description: Device information for security tracking
    *                 properties:
    *                   name:
    *                     type: string
    *                   type:
    *                     type: string
    *                   os:
    *                     type: string
    *     responses:
    *       '200':
    *         description: User authenticated successfully
    *         headers:
    *           X-Request-ID:
    *             description: Unique request identifier
    *             schema:
    *               type: string
    *         content:
    *           application/json:
    *             schema:
    *               type: object
    *               properties:
    *                 success:
    *                   type: boolean
    *                   example: true
    *                 data:
    *                   type: object
    *                   properties:
    *                     userId:
    *                       type: string
    *                       example: "user-uuid-here"
    *                     accessToken:
    *                       type: string
    *                       description: JWT access token
    *                       example: "eyJhbGciOiJIUzUxMi..."
    *                     refreshToken:
    *                       type: string
    *                       description: Refresh token for token renewal
    *                       example: "8883be22-b98e-4d31-91aa-b99e574b502d"
    *       '400':
    *         description: Bad request - Invalid input data
    *         content:
    *           application/json:
    *             schema:
    *               $ref: '#/components/schemas/ErrorResponse'
    *       '401':
    *         description: Unauthorized - Invalid credentials
    *       '403':
    *         description: Forbidden - Account locked or disabled
    *       '429':
    *         description: Too many requests - Rate limit exceeded
    */
    router.post('/auth/login', this.handlerRunner(handlers.LoginHandler))
    
    /**
     * @swagger
     * /auth/login/qr-code:
     *   post:
     *     tags:
     *       - Authentication
     *     summary: QR Code-based authentication
     *     description: |
     *       Authenticates user via QR code scanning mechanism.
     *       Used for mobile app integration and passwordless login.
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - qrToken
     *               - fingerprint
     *             properties:
     *               qrToken:
     *                 type: string
     *                 description: QR code token from scan
     *               fingerprint:
     *                 type: string
     *                 description: Device fingerprint for security
     *     responses:
     *       '200':
     *         description: QR authentication successful
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                 data:
     *                   type: object
     *                   properties:
     *                     userId:
     *                       type: string
     *                     accessToken:
     *                       type: string
     *                     refreshToken:
     *                       type: string
     *       '400':
     *         description: Invalid QR token
     *       '401':
     *         description: QR token expired or unauthorized
     */
    router.post('/auth/login/qr-code', this.handlerRunner(handlers.LoginByQRCodeHandler))
    
    /**
     * @swagger
     * /auth/refresh-tokens:
     *   post:
     *     tags:
     *       - Authentication
     *     summary: Refresh authentication tokens
     *     description: |
     *       Exchanges a valid refresh token for new access and refresh tokens.
     *       Implements secure token rotation for enhanced security.
     *     security:
     *       - BearerAuth: []
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - refreshToken
     *               - fingerprint
     *             properties:
     *               refreshToken:
     *                 type: string
     *                 description: Valid refresh token
     *               fingerprint:
     *                 type: string
     *                 description: Device fingerprint for verification
     *     responses:
     *       '200':
     *         description: Tokens refreshed successfully
     *         headers:
     *           X-Session-Rotated:
     *             description: Indicates session was rotated
     *             schema:
     *               type: string
     *               example: "1"
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                 data:
     *                   type: object
     *                   properties:
     *                     userId:
     *                       type: string
     *                     accessToken:
     *                       type: string
     *                     refreshToken:
     *                       type: string
     *       '400':
     *         description: Invalid refresh token format
     *       '401':
     *         description: Refresh token expired or invalid
     *       '403':
     *         description: User account deactivated
     */
    router.post('/auth/refresh-tokens', this.handlerRunner(handlers.RefreshTokensHandler))

    // === SESSION TERMINATION ===
    /**
     * @swagger
     * /auth/logout:
     *   post:
     *     tags:
     *       - Authentication
     *     summary: Logout from current session
     *     description: |
     *       Invalidates the current user session. Supports logout from current device
     *       or all devices based on the logoutAll parameter.
     *     security:
     *       - BearerAuth: []
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - refreshToken
     *             properties:
     *               refreshToken:
     *                 type: string
     *                 description: Current session refresh token
     *               logoutAll:
     *                 type: boolean
     *                 description: Logout from all devices
     *                 default: false
     *               reason:
     *                 type: string
     *                 enum: [user_initiated, security_concern, admin_forced, token_refresh]
     *                 description: Reason for logout (for audit trails)
     *                 default: user_initiated
     *     responses:
     *       '200':
     *         description: Logout successful
     *         headers:
     *           X-Logout-Session-ID:
     *             description: ID of the session that was logged out
     *             schema:
     *               type: string
     *           X-Sessions-Invalidated:
     *             description: Number of sessions invalidated
     *             schema:
     *               type: string
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                 message:
     *                   type: string
     *                 data:
     *                   type: object
     *                   properties:
     *                     sessionsInvalidated:
     *                       type: integer
     *                     timestamp:
     *                       type: string
     *                       format: date-time
     *                     metadata:
     *                       type: object
     *                       properties:
     *                         logoutType:
     *                           type: string
     *                           enum: [current_device, all_devices]
     *                         reason:
     *                           type: string
     *       '400':
     *         description: Invalid request parameters
     *       '401':
     *         description: Invalid or expired access token
     *       '403':
     *         description: Session ownership mismatch
     */
    router.post('/auth/logout', this.handlerRunner(handlers.LogoutHandler))
    
    /**
     * @swagger
     * /auth/logout-all:
     *   post:
     *     tags:
     *       - Authentication
     *     summary: Logout from all sessions with optional current session exclusion
     *     description: |
     *       Invalidates all user sessions. Supports two modes:
     *       - Default: Logout from ALL sessions (legacy behavior)
     *       - excludeCurrent: Logout from all OTHER sessions, keep current session active
     *     security:
     *       - BearerAuth: []
     *     requestBody:
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               excludeCurrent:
     *                 type: boolean
     *                 description: When true, preserve current session and invalidate all others
     *                 default: false
     *               sessionId:
     *                 type: integer
     *                 description: Current session ID (required when excludeCurrent=true)
     *               refreshToken:
     *                 type: string
     *                 description: Current refresh token (alternative to sessionId when excludeCurrent=true)
     *               reason:
     *                 type: string
     *                 enum: [user_initiated, security_concern, admin_forced, token_refresh]
     *                 description: Reason for logout (for audit trails)
     *                 default: user_initiated
     *     responses:
     *       '200':
     *         description: Sessions invalidated successfully
     *         headers:
     *           X-Sessions-Invalidated:
     *             description: Number of sessions that were invalidated
     *             schema:
     *               type: string
     *           X-Logout-Mode:
     *             description: Logout mode used (all or others_only)
     *             schema:
     *               type: string
     *               enum: [all, others_only]
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                 message:
     *                   type: string
     *                 data:
     *                   type: object
     *                   properties:
     *                     sessionsInvalidated:
     *                       type: integer
     *                     timestamp:
     *                       type: string
     *                       format: date-time
     *                     metadata:
     *                       type: object
     *                       properties:
     *                         mode:
     *                           type: string
     *                           enum: [all, others_only]
     *                         reason:
     *                           type: string
     *       '400':
     *         description: Invalid request parameters
     *       '401':
     *         description: Invalid or expired access token
     *       '422':
     *         description: Validation error - excludeCurrent requires sessionId or refreshToken
     */
    router.post('/auth/logout-all', this.handlerRunner(handlers.LogoutAllSessionsHandler))
    
    // === SESSION INSPECTION ===
    /**
     * @swagger
     * /auth/sessions:
     *   get:
     *     tags:
     *       - Authentication
     *     summary: List user sessions with advanced filtering and analytics - Enterprise Edition
     *     description: |
     *       Enterprise-grade session management endpoint that retrieves comprehensive session data
     *       with advanced filtering, security risk assessment, device analytics, and geolocation.
     *       
     *       **Key Features:**
     *       - Advanced pagination and filtering
     *       - Security risk assessment for each session
     *       - Device fingerprinting and geolocation enrichment
     *       - Data anonymization capabilities
     *       - Session health monitoring and expiry prediction
     *       - Performance metrics and structured logging
     *       
     *       **Security Features:**
     *       - Current session identification
     *       - Risk scoring and security recommendations
     *       - IP address masking and data anonymization
     *       - Session activity monitoring
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - name: page
     *         in: query
     *         description: Page number for pagination (0-based)
     *         schema:
     *           type: integer
     *           minimum: 0
     *           maximum: 1000
     *           default: 0
     *           example: 0
     *       - name: limit
     *         in: query
     *         description: Number of sessions per page
     *         schema:
     *           type: integer
     *           enum: [5, 10, 20, 25, 50, 100]
     *           default: 10
     *           example: 20
     *       - name: includeExpired
     *         in: query
     *         description: Include expired sessions in results
     *         schema:
     *           type: boolean
     *           default: false
     *           example: true
     *       - name: sortBy
     *         in: query
     *         description: Sort field for session ordering
     *         schema:
     *           type: string
     *           enum: [createdAt, expiredAt, ip, location]
     *           default: createdAt
     *           example: expiredAt
     *       - name: sortOrder
     *         in: query
     *         description: Sort order (ascending or descending)
     *         schema:
     *           type: string
     *           enum: [asc, desc]
     *           default: desc
     *           example: desc
     *       - name: filterByDevice
     *         in: query
     *         description: Filter sessions by device type
     *         schema:
     *           type: string
     *           enum: [mobile, desktop, tablet, bot]
     *           example: desktop
     *       - name: filterByStatus
     *         in: query
     *         description: Filter sessions by status
     *         schema:
     *           type: string
     *           enum: [active, expired, expiring]
     *           example: active
     *       - name: includeRiskAssessment
     *         in: query
     *         description: Include security risk assessment for each session
     *         schema:
     *           type: boolean
     *           default: false
     *           example: true
     *       - name: anonymizeData
     *         in: query
     *         description: Anonymize sensitive data (IPs, partial tokens)
     *         schema:
     *           type: boolean
     *           default: false
     *           example: true
     *     responses:
     *       '200':
     *         description: Sessions retrieved successfully with comprehensive metadata
     *         headers:
     *           X-Total-Sessions:
     *             description: Total number of sessions for this user
     *             schema:
     *               type: string
     *               example: "15"
     *           X-Active-Sessions:
     *             description: Number of currently active sessions
     *             schema:
     *               type: string
     *               example: "3"
     *           X-Current-Session-Included:
     *             description: Whether current session is included in results
     *             schema:
     *               type: string
     *               enum: ["0", "1"]
     *               example: "1"
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     *                 message:
     *                   type: string
     *                   example: "User sessions retrieved successfully"
     *                 data:
     *                   type: array
     *                   items:
     *                     type: object
     *                     properties:
     *                       id:
     *                         type: integer
     *                         description: Session unique identifier
     *                         example: 114
     *                       ip:
     *                         type: string
     *                         description: IP address (anonymized if anonymizeData=true)
     *                         example: "192.168.xxx.xxx"
     *                       location:
     *                         type: object
     *                         description: Geolocation information
     *                         properties:
     *                           country:
     *                             type: string
     *                             example: "United States"
     *                           region:
     *                             type: string
     *                             example: "California"
     *                           city:
     *                             type: string
     *                             example: "San Francisco"
     *                           timezone:
     *                             type: string
     *                             example: "America/Los_Angeles"
     *                       device:
     *                         type: object
     *                         description: Device information and user agent analysis
     *                         properties:
     *                           type:
     *                             type: string
     *                             enum: [mobile, desktop, tablet, bot]
     *                             example: "desktop"
     *                           browser:
     *                             type: string
     *                             example: "Chrome"
     *                           browserVersion:
     *                             type: string
     *                             example: "118.0.0.0"
     *                           os:
     *                             type: string
     *                             example: "macOS"
     *                           osVersion:
     *                             type: string
     *                             example: "14.1"
     *                           platform:
     *                             type: string
     *                             example: "Apple MacBook Pro"
     *                       timing:
     *                         type: object
     *                         description: Session timing and lifecycle information
     *                         properties:
     *                           createdAt:
     *                             type: string
     *                             format: date-time
     *                             example: "2025-10-11T18:19:46.719Z"
     *                           expiredAt:
     *                             type: string
     *                             format: date-time
     *                             example: "2025-10-11T19:19:46.716Z"
     *                           timeToExpiry:
     *                             type: string
     *                             description: Human-readable time until expiration
     *                             example: "2 hours"
     *                           sessionAge:
     *                             type: string
     *                             description: How long session has been active
     *                             example: "30 minutes"
     *                       status:
     *                         type: object
     *                         description: Session status and health indicators
     *                         properties:
     *                           isActive:
     *                             type: boolean
     *                             description: Whether session is currently active
     *                             example: true
     *                           isCurrent:
     *                             type: boolean
     *                             description: Whether this is the current session making the request
     *                             example: true
     *                           isExpiring:
     *                             type: boolean
     *                             description: Whether session expires within 24 hours
     *                             example: false
     *                           health:
     *                             type: string
     *                             enum: [healthy, new, expiring, expired]
     *                             example: "healthy"
     *                       security:
     *                         type: object
     *                         nullable: true
     *                         description: Security risk assessment (only when includeRiskAssessment=true)
     *                         properties:
     *                           score:
     *                             type: integer
     *                             description: Risk score (0-100)
     *                             minimum: 0
     *                             maximum: 100
     *                             example: 15
     *                           level:
     *                             type: string
     *                             enum: [low, medium, high]
     *                             example: "low"
     *                           factors:
     *                             type: array
     *                             description: List of risk factors detected
     *                             items:
     *                               type: string
     *                               enum: [automated_client, outdated_browser, unknown_location, long_lived_session]
     *                             example: ["outdated_browser"]
     *                           recommendations:
     *                             type: array
     *                             description: Security recommendations
     *                             items:
     *                               type: string
     *                             example: ["Encourage user to update their browser"]
     *                       metadata:
     *                         type: object
     *                         description: Additional session metadata
     *                         properties:
     *                           fingerprint:
     *                             type: string
     *                             description: Device fingerprint (anonymized if anonymizeData=true)
     *                             example: "123-123-xxxxxxxx"
     *                           userAgent:
     *                             type: string
     *                             description: User agent string (truncated if anonymizeData=true)
     *                             example: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)..."
     *                           refreshTokenPrefix:
     *                             type: string
     *                             description: Refresh token prefix (only when anonymizeData=true)
     *                             example: "c7d06740..."
     *                 meta:
     *                   type: object
     *                   description: Response metadata and analytics
     *                   properties:
     *                     sessionSummary:
     *                       type: object
     *                       description: Summary statistics for all sessions
     *                       properties:
     *                         total:
     *                           type: integer
     *                           example: 15
     *                         active:
     *                           type: integer
     *                           example: 3
     *                         expired:
     *                           type: integer
     *                           example: 12
     *                         deviceDistribution:
     *                           type: object
     *                           description: Breakdown by device type
     *                           example: {"desktop": 10, "mobile": 5}
     *                         geographicDistribution:
     *                           type: object
     *                           description: Breakdown by country
     *                           example: {"United States": 12, "Canada": 3}
     *                         parameters:
     *                           type: object
     *                           description: Query parameters used
     *                           properties:
     *                             includeExpired:
     *                               type: boolean
     *                             sortBy:
     *                               type: string
     *                             filterByDevice:
     *                               type: string
     *                               nullable: true
     *                     securityInsights:
     *                       type: object
     *                       nullable: true
     *                       description: Security analysis (only when includeRiskAssessment=true)
     *                       properties:
     *                         totalRiskScore:
     *                           type: integer
     *                           description: Cumulative risk score across all sessions
     *                         highRiskSessions:
     *                           type: integer
     *                           description: Number of high-risk sessions
     *                         suspiciousActivities:
     *                           type: array
     *                           description: List of sessions with suspicious activity
     *                           items:
     *                             type: object
     *                             properties:
     *                               sessionId:
     *                                 type: integer
     *                               location:
     *                                 type: object
     *                               device:
     *                                 type: object
     *                               riskFactors:
     *                                 type: array
     *                                 items:
     *                                   type: string
     *                         recommendations:
     *                           type: array
     *                           description: Overall security recommendations
     *                           items:
     *                             type: string
     *                     queryParameters:
     *                       type: object
     *                       description: Processed query parameters
     *                     generatedAt:
     *                       type: string
     *                       format: date-time
     *                       description: Response generation timestamp
     *                     requestId:
     *                       type: string
     *                       description: Unique request identifier
     *                     timestamp:
     *                       type: string
     *                       format: date-time
     *                       description: Response timestamp
     *                     executionTime:
     *                       type: string
     *                       description: Request processing time
     *                       example: "311ms"
     *       '400':
     *         description: Bad request - Invalid query parameters
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     *             examples:
     *               invalidLimit:
     *                 summary: Invalid limit parameter
     *                 value:
     *                   success: false
     *                   error: "VALIDATION_ERROR"
     *                   message: "Invalid limit value. Allowed values: [5, 10, 20, 25, 50, 100]"
     *               invalidPage:
     *                 summary: Invalid page parameter
     *                 value:
     *                   success: false
     *                   error: "VALIDATION_ERROR"
     *                   message: "Page number must be between 0 and 1000"
     *       '401':
     *         description: Invalid or expired access token
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     *       '403':
     *         description: Access denied - User account deactivated or insufficient permissions
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     *       '429':
     *         description: Too many requests - Rate limit exceeded
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     *       '500':
     *         description: Internal server error - Session retrieval failed
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     */
    router.get('/auth/sessions', this.handlerRunner(handlers.ListUserSessionsHandler))
    
    // === DEVELOPMENT/TESTING ENDPOINTS ===
    if (process.env.NODE_ENV !== 'production') {
      /**
       * @swagger
       * /auth/_health:
       *   get:
       *     tags:
       *       - System
       *     summary: Authentication controller health check
       *     description: Returns health status of the authentication controller (development only)
       *     responses:
       *       '200':
       *         description: Controller is healthy
       *         content:
       *           application/json:
       *             schema:
       *               type: object
       *               properties:
       *                 success:
       *                   type: boolean
       *                 data:
       *                   type: object
       *                   properties:
       *                     controller:
       *                       type: string
       *                     endpoints:
       *                       type: integer
       *                     uptime:
       *                       type: number
       *                     timestamp:
       *                       type: string
       */
      router.get('/auth/_health', async (req, res) => {
        const healthData = await this.healthCheck({ requestId: req.requestId })
        res.status(200).json(healthData)
      })
      
      /**
       * @swagger
       * /auth/_metrics:
       *   get:
       *     tags:
       *       - System
       *     summary: Authentication controller metrics
       *     description: Returns performance metrics for the authentication controller (development only)
       *     responses:
       *       '200':
       *         description: Metrics retrieved successfully
       *         content:
       *           application/json:
       *             schema:
       *               type: object
       *               properties:
       *                 success:
       *                   type: boolean
       *                 data:
       *                   type: object
       *                   properties:
       *                     requests:
       *                       type: object
       *                     errors:
       *                       type: object
       *                     securityEvents:
       *                       type: object
       */
      router.get('/auth/_metrics', async (req, res) => {
        const metricsData = await this.getMetrics({ requestId: req.requestId })
        res.status(200).json(metricsData)
      })
    }
    
    return router
  }

  /**
   * Security middleware for authentication endpoints
   */
  securityMiddleware() {
    return (req, res, next) => {
      // Add security headers
      res.setHeader('X-Controller', 'AuthController')
      res.setHeader('X-API-Version', 'v1')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('X-Frame-Options', 'DENY')
      
      // Log security-relevant requests
      if (this.authConfig.security.logSecurityEvents) {
        this.logSecurityEvent(req)
      }
      
      // Track request metrics
      this.trackRequest(req)
      
      next()
    }
  }

  /**
   * Log security events for monitoring
   */
  logSecurityEvent(req) {
    const event = {
      type: 'auth_request',
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString(),
      requestId: req.requestId
    }

    this.logger.info('Security event logged', {
      service: 'susanooapi',
      securityEvent: event
    })

    // Store in metrics
    const eventKey = `${req.method}:${req.path}`
    const current = this.metrics.securityEvents.get(eventKey) || 0
    this.metrics.securityEvents.set(eventKey, current + 1)
  }

  /**
   * Track request metrics
   */
  trackRequest(req) {
    const requestKey = `${req.method}:${req.path}`
    const current = this.metrics.requests.get(requestKey) || 0
    this.metrics.requests.set(requestKey, current + 1)
  }

  /**
   * Health check endpoint handler
   */
  async healthCheck(ctx) {
    this.logger.debug('Health check requested', {
      service: 'susanooapi',
      requestId: ctx.requestId,
      controller: 'AuthController'
    })

    return {
      success: true,
      data: {
        controller: 'AuthController',
        endpoints: this.getRegisteredEndpoints().length,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        config: {
          securityEnabled: this.authConfig.security.logSecurityEvents,
          rateLimitingEnabled: Object.keys(this.authConfig.rateLimiting).length > 0
        }
      }
    }
  }

  /**
   * Metrics endpoint handler
   */
  async getMetrics(ctx) {
    this.logger.debug('Metrics requested', {
      service: 'susanooapi',
      requestId: ctx.requestId,
      controller: 'AuthController'
    })

    return {
      success: true,
      data: {
        requests: Object.fromEntries(this.metrics.requests),
        errors: Object.fromEntries(this.metrics.errors),
        securityEvents: Object.fromEntries(this.metrics.securityEvents),
        handlers: {
          LoginHandler: handlers.LoginHandler.getMetrics ? handlers.LoginHandler.getMetrics() : {},
          RefreshTokensHandler: handlers.RefreshTokensHandler.getMetrics ? handlers.RefreshTokensHandler.getMetrics() : {},
          LogoutAllSessionsHandler: handlers.LogoutAllSessionsHandler.getMetrics ? handlers.LogoutAllSessionsHandler.getMetrics() : {}
        }
      }
    }
  }

  /**
   * Get list of registered endpoints
   */
  getRegisteredEndpoints() {
    const endpoints = [
      'POST /auth/login',
      'POST /auth/login/qr-code', 
      'POST /auth/refresh-tokens',
      'POST /auth/logout',
      'POST /auth/logout-all',
      'GET /auth/sessions'
    ]

    if (process.env.NODE_ENV !== 'production') {
      endpoints.push('GET /auth/_health', 'GET /auth/_metrics')
    }

    return endpoints
  }

  async init () {
    this.logger.info('AuthController initializing', {
      service: 'susanooapi',
      controller: this.constructor.name,
      endpoints: this.getRegisteredEndpoints(),
      securityConfig: this.authConfig.security,
      rateLimitConfig: Object.keys(this.authConfig.rateLimiting),
      environment: process.env.NODE_ENV
    })

    this.logger.debug('AuthController initialized successfully', {
      service: 'susanooapi',
      controller: this.constructor.name,
      metricsEnabled: true,
      securityEnabled: this.authConfig.security.logSecurityEvents
    })
  }
}

module.exports = { AuthController }
