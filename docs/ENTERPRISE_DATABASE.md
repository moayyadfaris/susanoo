# Enhanced Database Layer Documentation

## Overview

The Susanoo Enhanced Database Layer provides a comprehensive, production-ready enhancement to the existing database architecture with enterprise-grade features including audit trails, field-level encryption, multi-level caching, soft deletes, and GDPR compliance.

## Architecture

### Core Components

1. **AuditableDAO** - Enhanced base Data Access Object with audit trails and monitoring
2. **ValidatedModel** - Advanced validation and modeling with context awareness
3. **CryptoService** - Field-level encryption service for PII protection
4. **CacheManager** - Multi-level caching with performance monitoring
5. **ConnectionPool** - Advanced database connection management

### Key Features

- ✅ **Audit Trails** - Complete change tracking with user attribution
- ✅ **Soft Deletes** - Recoverable record deletion with audit support
- ✅ **Field-Level Encryption** - AES-256-GCM encryption for PII data
- ✅ **Multi-Level Caching** - Memory (L1) + Redis (L2) caching
- ✅ **GDPR Compliance** - Data anonymization and retention policies
- ✅ **Performance Optimization** - Query monitoring and connection pooling
- ✅ **Advanced Validation** - Context-aware validation with sanitization
- ✅ **Optimistic Locking** - Version-based conflict prevention

## Usage Examples

### 1. Enhanced DAO Implementation

```javascript
const AuditableDAO = require('../core/lib/AuditableDAO')

class UserDAO extends AuditableDAO {
  static get tableName() {
    return 'users'
  }

  static get piiFields() {
    return ['email', 'name', 'mobileNumber']
  }

  // Automatic audit trails and soft deletes
  static async createUser(userData, userId) {
    return await this.createWithAudit(userData, userId)
  }

  // Optimistic locking updates
  static async updateUser(id, data, userId, version) {
    return await this.updateWithAudit(id, data, userId, version)
  }

  // Soft delete with recovery
  static async deleteUser(id, userId) {
    return await this.softDelete(id, userId)
  }

  // GDPR compliance
  static async anonymizeUser(id, userId) {
    return await this.anonymizeUserData(id, userId)
  }

  // Use read replica for performance
  static async getActiveUsers() {
    const readConnection = this.getReadConnection()
    return await readConnection.table('users')
      .where('deleted_at', null)
      .where('is_active', true)
  }

  // Use write connection for updates
  static async updateUserStatus(id, status, userId) {
    const writeConnection = this.getWriteConnection()
    return await writeConnection.table('users')
      .where('id', id)
      .update({
        status,
        updated_by: userId,
        updated_at: new Date()
      })
  }
}
```

### 2. Field-Level Encryption

```javascript
const CryptoService = require('../core/lib/CryptoService')

// Initialize encryption service
const encryption = new CryptoService({
  masterKey: process.env.ENCRYPTION_MASTER_KEY
})

// Encrypt PII fields
const userData = {
  name: 'John Doe',
  email: 'john@example.com',
  age: 30
}

const encryptedData = encryption.encryptPIIFields(userData, ['name', 'email'])
// Result: { name: 'key_123:iv:tag:encrypted', email: 'key_123:iv:tag:encrypted', age: 30 }

// Decrypt for display
const decryptedData = encryption.decryptPIIFields(encryptedData, ['name', 'email'])
// Result: { name: 'John Doe', email: 'john@example.com', age: 30 }

// GDPR anonymization
const anonymized = encryption.anonymizePIIFields(userData, ['name', 'email'])
// Result: { name: 'J*** ***', email: '***@example.com', age: 30 }
```

### 3. Multi-Level Caching

```javascript
const CacheManager = require('../core/lib/CacheManager')

// Initialize cache service
const cache = new CacheManager({
  memory: { enabled: true, stdTTL: 300 },
  redis: { enabled: true, stdTTL: 3600 }
})

// Cache-aside pattern
const user = await cache.getOrSet(`user:${id}`, async () => {
  return await UserDAO.query().findById(id)
}, 3600)

// Cache warming strategy
cache.registerWarmingStrategy('popular_users', async (cacheService) => {
  const users = await UserDAO.getPopularUsers(100)
  for (const user of users) {
    await cacheService.set(`user:${user.id}`, user, 3600)
  }
})

// Get cache metrics
const metrics = cache.getMetrics()
console.log(`Hit ratio: ${metrics.hitRatio}`)
```

### 4. Advanced Validation

```javascript
const ValidatedModel = require('../core/lib/ValidatedModel')

class UserModel extends ValidatedModel {
  static get schema() {
    return {
      email: new this.Rule({
        validator: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        normalizer: (v) => v.toLowerCase().trim(),
        sanitizer: (v) => v.replace(/[<>]/g, ''),
        pii: true,
        gdprCategory: 'contact_info',
        description: 'Valid email address'
      }),
      
      password: new this.Rule({
        validator: (v) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/.test(v),
        encrypted: true,
        description: 'Strong password with mixed case, numbers, and special chars'
      }),
      
      confirmPassword: new this.Rule({
        crossFieldValidator: (value, allData) => {
          return value === allData.password || 'Passwords do not match'
        },
        description: 'Must match password field'
      })
    }
  }
}

// Validate with context
const result = await UserModel.validateWithContext(userData, {
  operation: 'create',
  userId: 'admin-123'
})

if (!result.isValid) {
  console.log('Validation errors:', result.errors)
}
```

## Database Schema Enhancements

### Audit Tables

```sql
-- Example audit table structure
CREATE TABLE users_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  record_id UUID NOT NULL,
  operation VARCHAR(10) NOT NULL, -- CREATE, UPDATE, DELETE
  old_values JSONB,
  new_values JSONB,
  user_id UUID,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX users_audit_record_time_idx ON users_audit (record_id, created_at DESC);
CREATE INDEX users_audit_user_idx ON users_audit (user_id);
CREATE INDEX users_audit_operation_idx ON users_audit (operation);
```

### Enhanced Main Tables

```sql
-- Enhanced users table with enterprise fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_by UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_by UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Performance indexes
CREATE INDEX CONCURRENTLY users_email_active_idx ON users (email) 
  WHERE deleted_at IS NULL AND is_active = true;
CREATE INDEX CONCURRENTLY users_mobile_active_idx ON users (mobile_number) 
  WHERE deleted_at IS NULL AND is_active = true;
```

## Migration Guide

### Step 1: Database Schema Migration

```bash
# Run enterprise migration scripts
npm run migrate:latest

# Migrations included:
# - 20251010193200_create_audit_tables.js
# - 20251010193300_add_enterprise_fields.js  
# - 20251010193400_add_performance_indexes.js
```

### Step 2: Update Existing DAOs

```javascript
// Before (existing DAO)
const { BaseDAO } = require('backend-core')

class UserDAO extends BaseDAO {
  static get tableName() { return 'users' }
  
  static async create(data) {
    return this.query().insert(data)
  }
}

// After (enhanced DAO)
const AuditableDAO = require('../core/lib/AuditableDAO')

class UserDAO extends AuditableDAO {
  static get tableName() { return 'users' }
  static get piiFields() { return ['email', 'name', 'mobileNumber'] }
  
  static async create(data, userId) {
    return this.createWithAudit(data, userId)
  }
}
```

### Step 3: Initialize Enterprise Services

```javascript
// In your application startup (main.js)
const { ConnectionPool, AuditableDAO } = require('backend-core')

// Initialize connection pool with primary and replica configuration
const connectionPool = new ConnectionPool({
  primary: {
    host: config.knex.connection.host,
    port: config.knex.connection.port,
    database: config.knex.connection.database,
    user: config.knex.connection.user,
    password: config.knex.connection.password,
    charset: config.knex.connection.charset
  },
  replicas: [
    // Optional read replicas for scaling
    // {
    //   host: 'replica1.db.com',
    //   port: 5432,
    //   database: 'myapp',
    //   user: 'reader',
    //   password: 'password'
    // }
  ],
  pool: {
    min: 2,
    max: 20
  },
  healthCheck: {
    enabled: true,
    interval: 30000
  }
})

// Initialize the connection pool
await connectionPool.initialize()

// Set the connection pool for all enhanced DAOs
AuditableDAO.setConnectionPool(connectionPool)

// Set up Objection.js with primary connection
const knexInstance = connectionPool.getWriteConnection()
Model.knex(knexInstance)
```
```

## Performance Monitoring

### Cache Metrics

```javascript
// Get comprehensive cache metrics
const metrics = cacheService.getMetrics()

console.log(`
Cache Performance:
- Hit Ratio: ${metrics.hitRatio}
- Total Requests: ${metrics.totalRequests}
- Memory Hits: ${metrics.hits.memory}
- Redis Hits: ${metrics.hits.redis}
- Avg Response Time (Memory): ${metrics.avgResponseTime.memory}ms
- Avg Response Time (Redis): ${metrics.avgResponseTime.redis}ms
`)
```

### Database Metrics

```javascript
// Get connection pool health
const connectionStats = await connectionPool.getMetrics()

console.log(`
Connection Pool Status:
- Health Status: ${connectionStats.overall.healthStatus}
- Total Connections: ${connectionStats.overall.totalConnections}
- Active Connections: ${connectionStats.overall.activeConnections}
- Query Count: ${connectionStats.overall.queryCount}
- Error Count: ${connectionStats.overall.connectionErrors}
`)
```

### Query Performance

```javascript
// Monitor slow queries (automatic in EnterpriseBaseDAO)
// Logs appear when queries exceed 1 second threshold

// Manual query monitoring
const startTime = Date.now()
const result = await UserDAO.query().where('status', 'active')
const duration = Date.now() - startTime

if (duration > 1000) {
  logger.warn('Slow query detected', { duration, query: 'users.status=active' })
}
```

## Security Features

### Field-Level Encryption

- **Algorithm**: AES-256-GCM for maximum security
- **Key Management**: PBKDF2 key derivation with rotation support
- **Search Support**: HMAC-based searchable hashes
- **Transparent**: Automatic encryption/decryption in DAO layer

### Audit Compliance

- **Complete Trail**: Every CREATE, UPDATE, DELETE operation logged
- **User Attribution**: Tracks who made changes
- **IP/Device Tracking**: Records IP address and user agent
- **Immutable Logs**: Audit records cannot be modified

### GDPR Compliance

- **Data Anonymization**: Configurable PII anonymization
- **Right to be Forgotten**: Soft deletes with data retention
- **Data Portability**: JSON export of user data
- **Consent Tracking**: Built-in consent management fields

## Best Practices

### 1. Security

```javascript
// Always use audit context for operations
await UserDAO.createWithAudit(userData, currentUserId, {
  ip: req.ip,
  userAgent: req.get('User-Agent')
})

// Use optimistic locking for concurrent updates
await UserDAO.updateWithAudit(id, data, userId, expectedVersion)

// Encrypt PII before storage
const encryptedData = encryption.encryptPIIFields(data, piiFields)
```

### 2. Performance

```javascript
// Use cache-aside pattern
const user = await cache.getOrSet(`user:${id}`, async () => {
  return await UserDAO.query().findById(id)
})

// Implement cache warming for frequently accessed data
cache.registerWarmingStrategy('popular_users', warmingFunction)

// Use read replicas for read-heavy operations
const readConnection = connectionPool.getReadConnection()
const users = await readConnection.table('users').select('*')
```

### 3. Validation

```javascript
// Use comprehensive validation with context
const validation = await UserModel.validateWithContext(data, {
  operation: 'update',
  userId: currentUserId,
  currentData: existingUser
})

// Handle cross-field validation
const passwordRule = new EnterpriseBaseModel.Rule({
  crossFieldValidator: (value, allData) => {
    if (allData.requireStrongPassword && !isStrongPassword(value)) {
      return 'Strong password required for this user type'
    }
    return true
  }
})
```

## Troubleshooting

### Common Issues

1. **Encryption Key Missing**
   ```
   Error: Master encryption key is required
   Solution: Set ENCRYPTION_MASTER_KEY environment variable
   ```

2. **Cache Connection Failed**
   ```
   Error: Redis connection failed
   Solution: Check Redis server status and connection config
   ```

3. **Migration Failed**
   ```
   Error: Audit table creation failed
   Solution: Ensure PostgreSQL uuid-ossp extension is installed
   ```

### Debug Mode

```javascript
// Enable debug logging
const cache = new CacheManager({
  monitoring: { 
    enabled: true, 
    logLevel: 'debug' 
  }
})

// Check health status
const health = await AuditableDAO.healthCheck()
console.log('Database health:', health)
```

## API Reference

### AuditableDAO Methods

- `createWithAudit(data, userId, trx)` - Create with audit trail
- `updateWithAudit(id, data, userId, version, trx)` - Update with optimistic locking
- `softDelete(id, userId, trx)` - Soft delete record
- `restore(id, userId, trx)` - Restore soft deleted record
- `getAuditHistory(id, limit)` - Get change history
- `anonymizeUserData(userId, trx)` - GDPR anonymization

### CryptoService Methods

- `encrypt(value, keyId)` - Encrypt single value
- `decrypt(encryptedValue)` - Decrypt single value
- `encryptPIIFields(data, fields)` - Encrypt object fields
- `decryptPIIFields(data, fields)` - Decrypt object fields
- `anonymizePIIFields(data, fields)` - GDPR anonymization
- `rotateKeys()` - Rotate encryption keys

### CacheManager Methods

- `get(key, options)` - Get from cache
- `set(key, value, ttl, options)` - Set cache value
- `delete(key, options)` - Delete from cache
- `getOrSet(key, fetchFn, ttl, options)` - Cache-aside pattern
- `invalidatePattern(pattern, namespace)` - Pattern-based invalidation
- `getMetrics()` - Get performance metrics

## Conclusion

The Enhanced Database Layer provides a comprehensive foundation for production applications requiring security, performance, and compliance. All features are designed to be backward-compatible and can be gradually adopted in existing applications.