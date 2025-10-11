# LoginHandler Guide

This document explains the Email-only LoginHandler flow, security controls, rate limiting, metrics, and an optional MFA (multi-factor authentication) branch.

## Overview
- Endpoint: Depends on your route wiring (e.g., `POST /api/v1/app/auth/login`)
- Auth method: Email + password (no mobile login)
- Side effects: Creates a session and returns Access + Refresh tokens

## Request
- Body:
  - email: string (required)
  - password: string (required)
  - fingerprint: string (required) – device fingerprint
  - rememberMe: boolean (optional)
  - deviceInfo: object (optional)

## Response
- On success:
  - userId, email, accessToken, refreshToken, sessionId, expiresAt (ISO string)
  - meta: processingTime, loginMethod, timestamp
- On unverified account:
  - { success: false, requiresVerification: true, data: { userId, email, message, nextAction: 'verify_email' } }
- On failure:
  - Generic error: Invalid email or password (never reveals which)
  - Rate limit: Too many requests
  - Account deactivated: Account has been deactivated

## Flow
1. Normalize inputs: trim/lowercase email; normalize user-agent
2. Rate limiting (optional, Redis): per email + IP
3. Lookup user by email; if missing → generic invalid credentials
4. Verify password
5. Check account state: active and verified
6. Create session and generate access token
7. Return tokens and session info

## Security controls
- Input normalization and defensive checks for null user/passwordHash
- Generic error messages for invalid credentials
- Account state checks (active and verified)
- Optional remember-me behavior for refresh/session TTL
- No updateToken leakage in unverified flow (token is stored server-side only)

## Rate limiting
- Uses Redis if configured (config.redis + config.rateLimting.defaultConfig)
- Key: `login_attempts:<email>:<ip>`
- TTL: `windowMs` from config; increments on each attempt
- If count > max → TOO_MANY_REQUESTS
- On successful login → attempts key is removed to reduce friction

## Metrics and audit
- Process-local counters (in-memory):
  - successTotal, failureTotal, pendingVerificationTotal
  - lastProcessingTimeMs, lastSuccessAt, lastFailureAt, lastFailureCode
- Logs:
  - Info on attempt and success
  - Warn on invalid credentials/rate limit
  - Error on unexpected password-check errors
- Programmatic metrics snapshot:
  - `LoginHandler.getMetrics()` returns a shallow copy of counters (for diagnostics or provider wiring)

## Remember-me TTLs
- `TOKEN_REFRESH_EXP` defines default refresh token TTL
- Optional `TOKEN_REFRESH_SHORT_EXP` defines a shorter TTL used when `rememberMe = false`
- If `TOKEN_REFRESH_SHORT_EXP` is missing, handler falls back to `TOKEN_REFRESH_EXP`

## Optional MFA branch
After successful password verification but before session creation:

```
if (mfaEnabledForUser(user)) {
  // 1) Generate challenge (TOTP, OTP via email/SMS, WebAuthn, etc.)
  const mfaToken = await mfaChallengeService.issue({ userId: user.id, context: { ip, ua, fingerprint } })
  // 2) Return a pending state without creating session/refresh token yet
  return this.result({
    success: false,
    requiresSecondFactor: true,
    data: { userId: user.id, mfaToken, nextAction: 'complete_mfa' }
  })
}
```

The client then calls a separate `POST /auth/mfa/verify` endpoint with the `mfaToken` and the one-time code; upon success, the server creates the session and issues tokens.

### MFA considerations
- Ensure challenges expire quickly and are single-use
- Rate-limit the verification endpoint separately
- Bind challenge to userId and contextual risk data (IP, UA, fingerprint)
- Prefer TOTP or WebAuthn for stronger security; SMS/Email OTP are lower assurance

## Troubleshooting
- Frequent TOO_MANY_REQUESTS:
  - Check `RATE_LIMIT_WINDOWS_MS` and `RATE_LIMIT_MAX_TRIES`
  - Verify Redis connectivity and TTL settings
- Sessions not honoring remember-me TTL:
  - Ensure `TOKEN_REFRESH_SHORT_EXP` is set if you want a shorter TTL when `rememberMe = false`
- Logs and metrics:
  - Use application logs to track attempts and errors
  - Call `LoginHandler.getMetrics()` during diagnostics

## Example curl
```
curl -X POST \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"secret123","fingerprint":"abc1234567890","rememberMe":false}' \
  http://localhost:4000/api/v1/app/auth/login
```



## Optional next steps
Wire LoginHandler.getMetrics() into your existing /metrics providers, e.g., add a provider named loginHandler in main.js.
Implement the MFA workflow (challenge issue + verify endpoints) if required.
Add unit/integration tests for:
Rate limiting behavior
Remember-me TTL selection
Unverified path (no updateToken exposed)
Metrics increments for success/failure