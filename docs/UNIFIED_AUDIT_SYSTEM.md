# Unified Audit System Documentation

## Overview

The Unified Audit System is an enterprise-grade auditing solution that replaces multiple separate audit tables with a single, powerful, and configurable audit system. This system provides comprehensive tracking of all data changes across your application with granular control over what gets audited and how.

## 🎯 Key Features

### ✅ **Unified Architecture**
- **Single `audit_logs` table** handles all entities (users, stories, attachments, sessions, etc.)
- **Replaces 5+ separate audit tables** with one maintainable solution
- **Better performance** with unified indexing and optimized queries
- **Easier maintenance** and simplified database management

### ✅ **Granular Configuration**
- **Per-table audit control** - Enable/disable audit for specific tables
- **Operation-level control** - Choose which operations to track (CREATE/UPDATE/DELETE/RESTORE)
- **Configurable retention policies** - Automatic cleanup based on table-specific retention periods
- **Field exclusion** - Exclude sensitive or unnecessary fields from audit
- **Data masking** - Automatically mask sensitive data in audit logs

### ✅ **Enterprise Features**
- **Complete context tracking** - User, session, IP address, user agent
- **Comprehensive change tracking** - Old values, new values, and exact field changes
- **Async logging option** - High-performance logging for high-throughput scenarios
- **GDPR compliance** - Built-in data retention and privacy controls
- **Security features** - Sensitive field handling and data masking

## 📊 Database Schema

### `audit_logs` Table
The unified audit table that stores all audit events:

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(50) NOT NULL,           -- Name of the audited table
    record_id VARCHAR(50) NOT NULL,            -- ID of the affected record
    operation VARCHAR(10) NOT NULL,            -- CREATE, UPDATE, DELETE, RESTORE
    old_values JSON,                           -- Previous values (for UPDATE/DELETE)
    new_values JSON,                           -- New values (for CREATE/UPDATE)
    changed_fields JSON,                       -- Array of changed field names
    user_id UUID,                              -- User who made the change
    session_id VARCHAR(255),                   -- Session ID
    ip_address VARCHAR(45),                    -- IP address
    user_agent TEXT,                           -- Browser user agent
    event_type VARCHAR(50),                    -- Event type (api_call, system_action, etc.)
    metadata JSON,                             -- Additional context data
    source VARCHAR(50) DEFAULT 'application',  -- Source of the change
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### `audit_config` Table
Configuration table for managing audit settings per table:

```sql
CREATE TABLE audit_config (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(50) UNIQUE NOT NULL,    -- Table to configure
    is_enabled BOOLEAN DEFAULT TRUE,           -- Whether audit is enabled
    track_creates BOOLEAN DEFAULT TRUE,        -- Track CREATE operations
    track_updates BOOLEAN DEFAULT TRUE,        -- Track UPDATE operations
    track_deletes BOOLEAN DEFAULT TRUE,        -- Track DELETE operations
    track_restores BOOLEAN DEFAULT TRUE,       -- Track RESTORE operations
    retention_days INTEGER,                    -- Days to keep audit logs (NULL = forever)
    compress_old_data BOOLEAN DEFAULT FALSE,   -- Compress old audit data
    excluded_fields JSON,                      -- Fields to exclude from audit
    sensitive_fields JSON,                     -- Fields to mask in audit logs
    async_logging BOOLEAN DEFAULT TRUE,        -- Use async logging
    batch_size INTEGER DEFAULT 100,           -- Batch size for async logging
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 🛠️ Management Functions

### Database Functions

#### `is_audit_enabled(table_name TEXT) → BOOLEAN`
Check if audit is enabled for a specific table.

```sql
SELECT is_audit_enabled('users');  -- Returns true/false
```

#### `enable_audit_for_table(table_name TEXT, enabled BOOLEAN) → BOOLEAN`
Enable or disable audit for a specific table.

```sql
SELECT enable_audit_for_table('users', false);  -- Disable audit for users
SELECT enable_audit_for_table('stories', true); -- Enable audit for stories
```

#### `get_audit_stats() → TABLE`
Get audit statistics for all tables.

```sql
SELECT * FROM get_audit_stats();
-- Returns: table_name, total_logs, creates, updates, deletes, oldest_log, newest_log
```

#### `cleanup_audit_logs() → INTEGER`
Clean up old audit logs based on retention policies.

```sql
SELECT cleanup_audit_logs();  -- Returns number of deleted records
```

### Application API (AuditableDAO)

#### Enable/Disable Audit
```javascript
// Enable audit for a table
await AuditableDAO.setAuditEnabled('users', true);

// Disable audit for a table
await AuditableDAO.setAuditEnabled('users', false);

// Check if audit is enabled
const enabled = await AuditableDAO.isAuditEnabled('users');
```

#### Bulk Operations
```javascript
// Enable audit for multiple tables
const results = await AuditableDAO.bulkSetAuditEnabled(['tags', 'interests'], true);

// Results: { tags: true, interests: true }
```

#### Configuration Management
```javascript
// Get audit configuration for a table
const config = await AuditableDAO.getAuditConfig('users');

// Update audit configuration
await AuditableDAO.updateAuditConfig('interests', {
    retention_days: 180,
    track_updates: false,
    excluded_fields: ['sensitive_field']
});
```

#### Audit History and Statistics
```javascript
// Get audit history for a specific record
const history = await AuditableDAO.getAuditHistory('user-123', 50);

// Get recent audit activity across all tables
const activity = await AuditableDAO.getRecentAuditActivity(100);

// Get audit statistics
const stats = await AuditableDAO.getAuditStats();

// Clean up old audit logs
const cleanedCount = await AuditableDAO.cleanupOldAuditLogs();
```

## 📋 Current Configuration

The system comes pre-configured with sensible defaults for all main tables:

| Table | Enabled | Retention | CREATE | UPDATE | DELETE | Notes |
|-------|---------|-----------|--------|--------|--------|-------|
| **users** | ✅ | 7 years (2555 days) | ✅ | ✅ | ✅ | Full tracking for compliance |
| **stories** | ✅ | 3 years (1095 days) | ✅ | ✅ | ✅ | Full content tracking |
| **attachments** | ✅ | 3 years (1095 days) | ✅ | ✅ | ✅ | File metadata tracking |
| **sessions** | ✅ | 90 days | ✅ | ❌ | ✅ | No UPDATE tracking (sessions are short-lived) |
| **interests** | ✅ | 180 days | ✅ | ❌ | ✅ | Configurable, less critical |
| **tags** | ✅ | 1 year (365 days) | ✅ | ✅ | ✅ | Full tracking |

### Sensitive Field Handling

Sensitive fields are automatically masked in audit logs:

- **Users**: `passwordHash`, `resetPasswordToken` (excluded), `email`, `mobileNumber` (masked)
- **Stories**: `details` (masked for privacy)
- **Attachments**: `fileData` (excluded), `originalFileName` (masked)
- **Sessions**: `token`, `refreshToken` (excluded), `ipAddress`, `userAgent` (masked)

## 🚀 Usage Examples

### Basic Audit Control
```javascript
// Temporarily disable audit for bulk operations
await AuditableDAO.setAuditEnabled('users', false);

// Perform bulk operations
// ... your bulk operations here ...

// Re-enable audit
await AuditableDAO.setAuditEnabled('users', true);
```

### Investigate Changes
```javascript
// Get audit history for a specific user
const userAudit = await AuditableDAO.getAuditHistory('user-123');

userAudit.forEach(entry => {
    console.log(`${entry.operation} at ${entry.created_at}`);
    console.log('Changed fields:', entry.changed_fields);
    console.log('Old values:', entry.old_values);
    console.log('New values:', entry.new_values);
});
```

### Custom Configuration
```javascript
// Configure custom audit settings for a new table
await AuditableDAO.updateAuditConfig('custom_table', {
    is_enabled: true,
    track_creates: true,
    track_updates: true,
    track_deletes: true,
    retention_days: 365,
    excluded_fields: ['password', 'secret_key'],
    sensitive_fields: ['email', 'phone'],
    async_logging: true,
    batch_size: 50
});
```

### Monitoring and Maintenance
```javascript
// Get audit statistics
const stats = await AuditableDAO.getAuditStats();
stats.forEach(stat => {
    console.log(`${stat.table_name}: ${stat.total_logs} logs`);
    console.log(`  Creates: ${stat.creates}, Updates: ${stat.updates}, Deletes: ${stat.deletes}`);
});

// Clean up old audit logs (run this in a scheduled job)
const cleaned = await AuditableDAO.cleanupOldAuditLogs();
console.log(`Cleaned up ${cleaned} old audit logs`);
```

## 🔧 Advanced Configuration

### Retention Policies
Configure different retention periods based on compliance requirements:

```javascript
// Financial data - 7 years
await AuditableDAO.updateAuditConfig('transactions', { retention_days: 2555 });

// User activity - 2 years  
await AuditableDAO.updateAuditConfig('user_sessions', { retention_days: 730 });

// Temporary data - 30 days
await AuditableDAO.updateAuditConfig('temp_uploads', { retention_days: 30 });
```

### Performance Optimization
For high-volume tables, enable async logging:

```javascript
await AuditableDAO.updateAuditConfig('high_volume_table', {
    async_logging: true,
    batch_size: 200,
    track_updates: false  // Only track creates and deletes
});
```

### GDPR Compliance
Configure for GDPR compliance:

```javascript
await AuditableDAO.updateAuditConfig('user_personal_data', {
    retention_days: 1095,  // 3 years
    sensitive_fields: ['email', 'phone', 'address'],
    excluded_fields: ['password_hash', 'secret_tokens']
});
```

## 🛡️ Security Considerations

### Data Masking
Sensitive fields are automatically masked using these patterns:

- **Email addresses**: `test@example.com` → `t***@e***.com`
- **General strings**: `sensitive_data` → `se***ta`
- **Unknown types**: `***MASKED***`

### Field Exclusion
Critical security fields are completely excluded from audit logs:
- Password hashes
- Security tokens
- API keys
- File binary data

### Access Control
- Audit logs should be accessible only to authorized personnel
- Consider implementing role-based access to audit data
- Regularly review audit access patterns

## 📈 Performance Considerations

### Indexing
The system includes optimized indexes for common query patterns:

```sql
-- Primary indexes
CREATE INDEX audit_logs_table_record_idx ON audit_logs (table_name, record_id);
CREATE INDEX audit_logs_table_operation_idx ON audit_logs (table_name, operation);
CREATE INDEX audit_logs_user_idx ON audit_logs (user_id);
CREATE INDEX audit_logs_created_at_idx ON audit_logs (created_at);
CREATE INDEX audit_logs_table_time_idx ON audit_logs (table_name, created_at);
```

### Async Logging
For high-performance scenarios, enable async logging:

```javascript
// This logs audit entries asynchronously to avoid blocking main operations
await AuditableDAO.updateAuditConfig('high_traffic_table', {
    async_logging: true,
    batch_size: 500
});
```

### Partitioning (Future Enhancement)
Consider partitioning the `audit_logs` table by date for very large datasets:

```sql
-- Example monthly partitioning (PostgreSQL 10+)
CREATE TABLE audit_logs_y2025m10 PARTITION OF audit_logs
FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
```

## 🔄 Migration from Old System

The migration automatically:

1. **Drops old separate audit tables**: `users_audit`, `stories_audit`, etc.
2. **Creates unified tables**: `audit_logs` and `audit_config`
3. **Sets up database functions**: `is_audit_enabled()`, `enable_audit_for_table()`, etc.
4. **Configures default settings**: Sensible defaults for all main tables
5. **Updates DAO classes**: Modified to use the unified system

### Rollback Support
The migration includes a rollback function that recreates basic versions of the original audit tables if needed.

## 📝 Best Practices

### 1. Regular Maintenance
```javascript
// Set up a daily cleanup job
const dailyCleanup = async () => {
    const cleaned = await AuditableDAO.cleanupOldAuditLogs();
    console.log(`Daily cleanup: removed ${cleaned} old audit logs`);
};
```

### 2. Monitoring
```javascript
// Monitor audit system health
const auditHealth = async () => {
    const stats = await AuditableDAO.getAuditStats();
    const totalLogs = stats.reduce((sum, stat) => sum + parseInt(stat.total_logs), 0);
    
    if (totalLogs > 1000000) {
        console.warn('Audit logs growing large, consider cleanup');
    }
};
```

### 3. Selective Auditing
```javascript
// Disable audit for non-critical operations
await AuditableDAO.setAuditEnabled('temporary_cache', false);
await AuditableDAO.setAuditEnabled('session_tokens', false);

// Enable only for critical business data
await AuditableDAO.setAuditEnabled('financial_transactions', true);
await AuditableDAO.setAuditEnabled('user_permissions', true);
```

### 4. Performance Testing
- Test audit performance with your expected data volumes
- Monitor database performance impact
- Adjust async logging and batch sizes as needed
- Consider partitioning for very large audit datasets

## 🚨 Troubleshooting

### Common Issues

#### Audit Not Working
```javascript
// Check if audit is enabled
const enabled = await AuditableDAO.isAuditEnabled('table_name');
if (!enabled) {
    await AuditableDAO.setAuditEnabled('table_name', true);
}
```

#### Performance Issues
```javascript
// Enable async logging for high-volume tables
await AuditableDAO.updateAuditConfig('high_volume_table', {
    async_logging: true,
    batch_size: 200
});
```

#### Storage Issues
```javascript
// Check audit log sizes
const stats = await AuditableDAO.getAuditStats();
stats.forEach(stat => {
    if (stat.total_logs > 100000) {
        console.log(`Table ${stat.table_name} has ${stat.total_logs} audit logs`);
    }
});

// Clean up old logs
await AuditableDAO.cleanupOldAuditLogs();
```

## 🎉 Benefits Summary

### Before vs After

| Aspect | Before (Separate Tables) | After (Unified System) |
|--------|--------------------------|-------------------------|
| **Tables** | 5+ separate audit tables | 1 unified audit_logs table |
| **Maintenance** | Complex, multiple schemas | Simple, single schema |
| **Configuration** | Hard-coded in migrations | Dynamic, runtime configurable |
| **Performance** | Multiple indexes, scattered data | Optimized unified indexes |
| **Querying** | Complex cross-table queries | Simple single-table queries |
| **Control** | All-or-nothing per table | Granular operation control |
| **Retention** | Manual cleanup scripts | Automatic policy-based cleanup |
| **Monitoring** | Multiple table monitoring | Unified statistics and monitoring |

### Key Advantages

1. **🔧 Maintainability**: Single table structure vs multiple tables
2. **⚡ Performance**: Unified indexing and optimized queries  
3. **🎛️ Flexibility**: Runtime configuration without code changes
4. **💾 Storage**: Intelligent retention policies prevent bloat
5. **🔒 Security**: Built-in sensitive data handling
6. **📈 Scalability**: Async logging for high-volume scenarios
7. **🛡️ Compliance**: GDPR-ready with automated data handling

The unified audit system provides enterprise-grade auditing capabilities with the flexibility and performance needed for modern applications. 🚀