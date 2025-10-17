/**
 * Session Management Configuration
 * 
 * Enterprise-grade configuration for session handling including
 * limits, security settings, and performance optimization.
 */

const ms = require('ms')

module.exports = {
  // Session limits and constraints
  limits: {
    // Maximum active sessions per user
    maxSessionsPerUser: process.env.MAX_SESSIONS_PER_USER || 5,
    
    // Maximum sessions per IP (security)
    maxSessionsPerIP: process.env.MAX_SESSIONS_PER_IP || 10,
    
    // Rate limiting for session creation
    rateLimiting: {
      enabled: process.env.SESSION_RATE_LIMITING === 'true' || true,
      windowMs: ms('15m'), // 15 minutes
      maxAttempts: process.env.SESSION_RATE_LIMIT || 10
    }
  },

  // Redis configuration for session caching
  redis: {
    // Key prefixes for different session types
    keyPrefix: process.env.SESSION_REDIS_PREFIX || 'sessions',
    userSessionsKey: (userId) => `${module.exports.redis.keyPrefix}_user_${userId}`,
    ipSessionsKey: (ip) => `${module.exports.redis.keyPrefix}_ip_${ip.replace(/\./g, '_')}`,
    
    // TTL settings
    defaultTTL: ms(process.env.SESSION_REDIS_TTL || '7d'), // 7 days
    shortTTL: ms(process.env.SESSION_SHORT_TTL || '1h'), // For temp sessions
    
    // Batch operation settings
    batchSize: process.env.SESSION_BATCH_SIZE || 100
  },

  // Security settings
  security: {
    // Anomaly detection
    anomalyDetection: {
      enabled: process.env.SESSION_ANOMALY_DETECTION === 'true' || true,
      
      // Suspicious patterns
      maxConcurrentIPs: process.env.MAX_CONCURRENT_IPS || 3,
      maxDevicesPerDay: process.env.MAX_DEVICES_PER_DAY || 10,
      
      // Geographic restrictions
      geoTracking: process.env.SESSION_GEO_TRACKING === 'true' || false,
      allowedCountries: process.env.ALLOWED_COUNTRIES ? 
        process.env.ALLOWED_COUNTRIES.split(',') : null
    },
    
    // Enhanced metadata collection
    collectMetadata: {
      deviceInfo: true,
      geoLocation: process.env.COLLECT_GEO === 'true' || false,
      networkInfo: true
    },
    
    // Security events logging
    auditLogging: {
      enabled: process.env.SESSION_AUDIT_LOGGING === 'true' || true,
      logLevel: process.env.SESSION_LOG_LEVEL || 'info',
      includeMetadata: true
    }
  },

  // Performance monitoring
  performance: {
    // Metrics collection
    metricsEnabled: process.env.SESSION_METRICS === 'true' || true,
    
    // Performance thresholds
    slowOperationThreshold: parseInt(process.env.SLOW_SESSION_THRESHOLD) || 1000, // ms
    
    // Monitoring intervals
    metricsInterval: ms(process.env.METRICS_INTERVAL || '5m'),
    
    // Cache optimization
    cacheOptimization: {
      enabled: true,
      preloadFrequentUsers: process.env.PRELOAD_SESSIONS === 'true' || false,
      compressionEnabled: process.env.SESSION_COMPRESSION === 'true' || false
    }
  },

  // Cleanup and maintenance
  cleanup: {
    // Automatic cleanup of expired sessions
    autoCleanup: {
      enabled: process.env.AUTO_CLEANUP === 'true' || true,
      interval: ms(process.env.CLEANUP_INTERVAL || '1h'),
      batchSize: parseInt(process.env.CLEANUP_BATCH_SIZE) || 1000
    },
    
    // Orphaned session handling
    orphanedSessions: {
      detectEnabled: true,
      maxAge: ms(process.env.ORPHANED_SESSION_MAX_AGE || '30d'),
      cleanupEnabled: true
    }
  },

  // Environment-specific overrides
  environments: {
    development: {
      limits: {
        maxSessionsPerUser: 10, // More lenient for development
        rateLimiting: { enabled: false }
      },
      security: {
        anomalyDetection: { enabled: false },
        auditLogging: { logLevel: 'debug' }
      }
    },
    
    test: {
      limits: {
        maxSessionsPerUser: 3,
        rateLimiting: { enabled: false }
      },
      redis: {
        defaultTTL: ms('1h') // Shorter TTL for tests
      },
      security: {
        anomalyDetection: { enabled: false },
        auditLogging: { enabled: false }
      },
      cleanup: {
        autoCleanup: { enabled: false }
      }
    },
    
    production: {
      security: {
        anomalyDetection: { enabled: true },
        auditLogging: { 
          enabled: true,
          logLevel: 'warn'
        }
      },
      performance: {
        metricsEnabled: true,
        cacheOptimization: {
          enabled: true,
          preloadFrequentUsers: true,
          compressionEnabled: true
        }
      }
    }
  },

  // Error handling configuration
  errorHandling: {
    // Retry configuration for Redis operations
    retryConfig: {
      maxRetries: parseInt(process.env.SESSION_MAX_RETRIES) || 3,
      retryDelay: parseInt(process.env.SESSION_RETRY_DELAY) || 1000,
      exponentialBackoff: true
    },
    
    // Fallback behavior when Redis is unavailable
    fallbackBehavior: {
      allowSessionCreation: process.env.ALLOW_FALLBACK_SESSIONS === 'true' || true,
      databaseOnly: true,
      skipCache: true
    }
  }
}

// Apply environment-specific overrides
const env = process.env.NODE_ENV || 'development'
if (module.exports.environments[env]) {
  const envConfig = module.exports.environments[env]
  
  // Deep merge environment configuration
  function deepMerge(target, source) {
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        target[key] = target[key] || {}
        deepMerge(target[key], source[key])
      } else {
        target[key] = source[key]
      }
    }
  }
  
  deepMerge(module.exports, envConfig)
}