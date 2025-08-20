# Enhanced Accounting Logging System

## Overview

This document describes the comprehensive logging and audit trail system implemented for the accounting module. The system provides detailed tracking of all user actions, system changes, and financial transactions with real-time monitoring and comprehensive audit capabilities.

## Key Features

### 1. Comprehensive Audit Logging
- **Complete Activity Tracking**: Every user action and system change is logged with detailed context
- **Multi-layered Logging**: Separate services for different aspects of logging (audit, transaction, comprehensive)
- **Real-time Monitoring**: Immediate logging with real-time event emission for live updates
- **Correlation Tracking**: Related transactions and activities are linked via correlation IDs

### 2. Enhanced Transaction Processing
- **Detailed Financial Tracking**: Every payment, sale, and financial transaction is logged with full context
- **Balance Change History**: Complete history of all balance changes for customers and suppliers
- **Multi-currency Support**: Proper handling and logging of USD and LBP transactions
- **Transaction Correlation**: Related transactions are grouped and tracked together

### 3. User Action Tracking
- **User Context**: Every action includes user information (ID, email, name)
- **Session Tracking**: Actions are tracked by session for complete user journey analysis
- **Source Tracking**: Distinguishes between web, mobile, API, and system actions
- **Detailed Metadata**: Rich metadata including IP address, user agent, and module information

### 4. Balance and Account Management
- **Customer Balance Tracking**: Complete history of customer debt changes
- **Supplier Balance Tracking**: Full supplier payment and credit history
- **Accounts Receivable/Payable**: Detailed tracking of all AR/AP changes
- **Cash Drawer Monitoring**: Complete cash flow tracking with audit trails

### 5. Real-time Activity Feed
- **Live Updates**: Real-time activity feed with automatic updates
- **Advanced Filtering**: Filter by date, user, action type, severity, and entity
- **Search Functionality**: Full-text search across all activity descriptions
- **Export Capabilities**: Export filtered activities to CSV or JSON

### 6. Comprehensive Audit Dashboard
- **Overview Analytics**: Key metrics and trends at a glance
- **Activity Analytics**: Detailed breakdowns by user, action, and entity type
- **Security Monitoring**: Critical events and security alerts
- **Data Integrity Checks**: Automated validation and integrity monitoring

## System Architecture

### Services Layer

#### 1. AuditLogService (`src/services/auditLogService.ts`)
- Core audit logging functionality
- Manages audit log entries with detailed metadata
- Provides querying and filtering capabilities
- Handles balance change tracking
- Supports correlation of related activities

#### 2. EnhancedTransactionService (`src/services/enhancedTransactionService.ts`)
- Enhanced transaction processing with comprehensive logging
- Integrates with audit logging for complete transaction tracking
- Handles customer and supplier payments with full audit trails
- Manages sale processing with inventory updates and logging
- Provides transaction history and correlation tracking

#### 3. ComprehensiveLoggingService (`src/services/comprehensiveLoggingService.ts`)
- Orchestrates all logging services
- Provides unified interface for different types of logging
- Generates comprehensive activity summaries and analytics
- Manages real-time event broadcasting
- Handles log cleanup and maintenance

#### 4. ChartOfAccountsService (`src/services/chartOfAccountsService.ts`)
- Manages chart of accounts with audit trails
- Tracks all account balance changes
- Provides accounting structure for financial reporting
- Integrates with transaction logging for complete financial tracking

### Components Layer

#### 1. ActivityFeed (`src/components/ActivityFeed.tsx`)
- Real-time activity feed component
- Advanced filtering and search capabilities
- Expandable entries with detailed information
- Export functionality for filtered data
- Auto-refresh and real-time updates

#### 2. AuditDashboard (`src/components/AuditDashboard.tsx`)
- Comprehensive audit dashboard with multiple views
- Overview with key metrics and trends
- Analytics with user and action breakdowns
- Data integrity monitoring
- Critical events tracking

### Hooks Layer

#### 1. useEnhancedAccounting (`src/hooks/useEnhancedAccounting.ts`)
- Enhanced accounting hook with comprehensive logging
- Integrates all accounting services with audit trails
- Provides comprehensive state management
- Real-time activity subscriptions
- Advanced querying and analytics

## Data Structures

### AuditLogEntry
```typescript
interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  action: AuditAction;
  entityType: EntityType;
  entityId: string;
  entityName?: string;
  description: string;
  previousData?: any;
  newData?: any;
  changedFields?: string[];
  metadata: {
    ipAddress?: string;
    sessionId?: string;
    correlationId?: string;
    source: 'web' | 'mobile' | 'api' | 'system';
    module: string;
  };
  balanceChange?: {
    entityType: 'customer' | 'supplier' | 'cash_drawer';
    balanceBefore: number;
    balanceAfter: number;
    currency: string;
  };
  relatedTransactions?: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  tags: string[];
}
```

### ComprehensiveLogEntry
```typescript
interface ComprehensiveLogEntry {
  id: string;
  timestamp: string;
  category: 'financial' | 'inventory' | 'customer' | 'supplier' | 'system' | 'audit';
  subcategory: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  entity: {
    type: string;
    id: string;
    name?: string;
  };
  user: {
    id: string;
    email?: string;
    name?: string;
  };
  changes?: {
    before?: any;
    after?: any;
    fields?: string[];
  };
  financial?: {
    amount?: number;
    currency?: string;
    balanceChange?: {
      before: number;
      after: number;
      entityType: 'customer' | 'supplier' | 'cash_drawer';
    };
  };
  metadata: {
    correlationId?: string;
    sessionId?: string;
    source: string;
    module: string;
    tags: string[];
  };
  relatedEntities?: Array<{
    type: string;
    id: string;
    name?: string;
  }>;
}
```

## Tracked Activities

### Financial Activities
- Customer payments received
- Supplier payments sent
- Expense transactions
- Cash drawer operations
- Account balance adjustments
- Currency conversions

### Sales Activities
- Sale creation and completion
- Item additions and modifications
- Payment processing
- Credit sales and receivables
- Sale cancellations and refunds

### Inventory Activities
- Inventory receiving
- Stock level changes
- Product transfers
- Inventory adjustments
- Commission item tracking

### Customer/Supplier Activities
- Customer creation and updates
- Supplier creation and updates
- Contact information changes
- Status changes (active/inactive)
- Debt/credit limit modifications

### System Activities
- Data synchronization
- Backup operations
- User login/logout
- System maintenance
- Configuration changes

## Usage Examples

### Processing a Customer Payment
```typescript
const result = await enhancedTransactionService.processCustomerPayment(
  customerId,
  amount,
  currency,
  description,
  context,
  {
    paymentMethod: 'cash',
    reference: 'REF-001'
  }
);

// Automatically logs:
// - Customer payment received
// - Balance change history
// - Accounts receivable updates
// - Related transaction correlation
```

### Querying Audit Logs
```typescript
const logs = auditLogService.queryLogs({
  startDate: '2024-01-01',
  endDate: '2024-01-31',
  entityType: 'customer',
  action: 'customer_payment_received',
  severity: 'medium'
});
```

### Getting Balance History
```typescript
const balanceHistory = auditLogService.getBalanceHistory(customerId, 'customer');
```

### Real-time Activity Monitoring
```typescript
const unsubscribe = comprehensiveLoggingService.subscribe((entry) => {
  console.log('New activity:', entry);
  // Handle real-time activity updates
});
```

## Security and Compliance

### Data Privacy
- User information is logged with consent
- Sensitive data is properly masked
- Access controls for audit log viewing
- Retention policies for log cleanup

### Audit Trail Integrity
- Immutable log entries once created
- Cryptographic verification of log integrity
- Tamper detection mechanisms
- Backup and recovery procedures

### Compliance Support
- SOX compliance for financial reporting
- GDPR compliance for data protection
- Industry-specific audit requirements
- Regulatory reporting capabilities

## Performance Considerations

### Storage Management
- Automatic log rotation and cleanup
- Configurable retention periods
- Compressed storage for historical data
- Efficient indexing for fast queries

### Real-time Performance
- Asynchronous logging to prevent blocking
- Batched log writes for performance
- Intelligent caching strategies
- Optimized database queries

### Scalability
- Horizontal scaling support
- Load balancing for high volume
- Archive and restore capabilities
- Performance monitoring and alerting

## Configuration

### Log Levels
- **Critical**: System failures, security breaches
- **High**: Important business events, errors
- **Medium**: Normal business operations
- **Low**: Detailed debugging information

### Retention Policies
- Default: 90 days for detailed logs
- Critical events: 7 years retention
- Financial transactions: 10 years retention
- User activity: 1 year retention

### Alert Thresholds
- Error rate > 10% triggers alerts
- Critical events trigger immediate notifications
- Unusual activity patterns detected automatically
- Performance degradation alerts

## Monitoring and Alerting

### Real-time Alerts
- Critical security events
- System performance issues
- Data integrity violations
- Unusual user activity patterns

### Dashboard Metrics
- Activity volume trends
- Error rates and patterns
- User behavior analytics
- System health indicators

### Reporting
- Daily activity summaries
- Weekly trend reports
- Monthly compliance reports
- Custom query reports

## Future Enhancements

### Planned Features
- Machine learning for anomaly detection
- Advanced analytics and reporting
- Integration with external audit systems
- Mobile audit trail viewing
- API access for third-party tools

### Performance Improvements
- Real-time streaming for large volumes
- Advanced caching mechanisms
- Distributed logging architecture
- AI-powered log analysis

## Conclusion

The enhanced accounting logging system provides comprehensive tracking and audit capabilities that ensure complete visibility into all financial and operational activities. With real-time monitoring, advanced analytics, and robust security features, the system supports both operational needs and compliance requirements while maintaining high performance and scalability. 