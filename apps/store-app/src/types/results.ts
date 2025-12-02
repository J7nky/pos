/**
 * GENERIC RESULT TYPES
 * 
 * Standardized result types used across all services.
 * Eliminates ~100 lines of duplicate interface definitions.
 * 
 * Benefits:
 * - Consistent return types across services
 * - Better type inference
 * - Less boilerplate
 * - Easier to maintain
 * 
 * Usage:
 * ```typescript
 * import { OperationResult, BalanceChangeResult } from '../types/results';
 * 
 * async function updateBalance(): Promise<OperationResult<BalanceChangeResult>> {
 *   // ...
 * }
 * ```
 */

// ============================================================================
// BASE RESULT TYPES
// ============================================================================

/**
 * Generic operation result
 * Use for any operation that can succeed or fail
 */
export interface OperationResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  errorDetails?: any;
}

/**
 * Operation result with ID
 * Use for create/update operations that return an ID
 */
export interface OperationResultWithId extends OperationResult<string> {
  id?: string;
}

/**
 * Batch operation result
 * Use for operations that process multiple items
 */
export interface BatchOperationResult<T = void> {
  success: boolean;
  successCount: number;
  failureCount: number;
  totalCount: number;
  results: Array<OperationResult<T>>;
  errors: string[];
}

// ============================================================================
// FINANCIAL RESULT TYPES
// ============================================================================

/**
 * Balance change result
 * Use for operations that modify balances
 */
export interface BalanceChangeResult {
  previousBalance: number;
  newBalance: number;
  change: number;
  currency: 'USD' | 'LBP';
  affectedRecords?: string[];
}

/**
 * Multi-currency balance change result
 */
export interface MultiCurrencyBalanceChangeResult {
  USD: BalanceChangeResult;
  LBP: BalanceChangeResult;
  affectedRecords?: string[];
}

/**
 * Transaction operation result
 * Use for transaction creation/modification operations
 */
export interface TransactionOperationResult extends OperationResult<string> {
  transactionId?: string;
  balanceChange?: BalanceChangeResult;
  auditLogId?: string;
  correlationId?: string;
  affectedRecords?: string[];
}

/**
 * Cash drawer operation result
 * Use for cash drawer operations
 */
export interface CashDrawerOperationResult extends OperationResult<void> {
  sessionId?: string;
  transactionId?: string;
  previousBalance?: number;
  newBalance?: number;
  variance?: number;
  expectedAmount?: number;
  actualAmount?: number;
}

/**
 * Payment operation result
 * Use for payment processing operations
 */
export interface PaymentOperationResult extends TransactionOperationResult {
  paymentMethod?: 'cash' | 'card' | 'credit';
  amountPaid?: number;
  changeGiven?: number;
  receiptNumber?: string;
}

// ============================================================================
// ENTITY RESULT TYPES
// ============================================================================

/**
 * Entity operation result
 * Use for customer/supplier/entity CRUD operations
 */
export interface EntityOperationResult extends OperationResultWithId {
  entityId?: string;
  entityType?: 'customer' | 'supplier' | 'employee';
  entityCode?: string;
}

/**
 * Entity with balance result
 * Use for entity queries that include balance information
 */
export interface EntityWithBalanceResult {
  entityId: string;
  entityName: string;
  entityType: 'customer' | 'supplier' | 'employee';
  usdBalance: number;
  lbpBalance: number;
  lastTransactionDate?: string;
}

// ============================================================================
// VALIDATION RESULT TYPES
// ============================================================================

/**
 * Validation result
 * Use for validation operations
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  fieldErrors?: Record<string, string>;
}

/**
 * Verification result
 * Use for verification operations (e.g., balance verification)
 */
export interface VerificationResult {
  isVerified: boolean;
  discrepancies: Array<{
    field: string;
    expected: any;
    actual: any;
    difference?: number;
  }>;
  warnings: string[];
}

// ============================================================================
// SESSION RESULT TYPES
// ============================================================================

/**
 * Session operation result
 * Use for session management operations
 */
export interface SessionOperationResult extends OperationResult<string> {
  sessionId?: string;
  sessionToken?: string;
  expiresAt?: string;
}

/**
 * Cash drawer session result
 * Use for cash drawer session operations
 */
export interface CashDrawerSessionResult extends SessionOperationResult {
  openingAmount?: number;
  currentAmount?: number;
  expectedAmount?: number;
  actualAmount?: number;
  variance?: number;
  openedAt?: string;
  closedAt?: string;
  openedBy?: string;
  closedBy?: string;
}

// ============================================================================
// QUERY RESULT TYPES
// ============================================================================

/**
 * Paginated query result
 * Use for queries that support pagination
 */
export interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  pageSize: number;
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * Search result
 * Use for search operations
 */
export interface SearchResult<T> {
  results: T[];
  totalCount: number;
  query: string;
  executionTime?: number;
  suggestions?: string[];
}

// ============================================================================
// IMPORT/EXPORT RESULT TYPES
// ============================================================================

/**
 * Import operation result
 * Use for data import operations
 */
export interface ImportOperationResult {
  success: boolean;
  totalRecords: number;
  importedCount: number;
  skippedCount: number;
  errorCount: number;
  errors: Array<{
    row: number;
    field?: string;
    error: string;
  }>;
  warnings: string[];
  duration?: number;
}

/**
 * Export operation result
 * Use for data export operations
 */
export interface ExportOperationResult extends OperationResult<Blob | string> {
  fileName?: string;
  fileSize?: number;
  recordCount?: number;
  format?: 'csv' | 'json' | 'excel' | 'pdf';
}

// ============================================================================
// SYNC RESULT TYPES
// ============================================================================

/**
 * Sync operation result
 * Use for data synchronization operations
 */
export interface SyncOperationResult {
  success: boolean;
  syncedCount: number;
  failedCount: number;
  skippedCount: number;
  conflicts: Array<{
    entityType: string;
    entityId: string;
    conflictType: 'version' | 'deleted' | 'modified';
  }>;
  lastSyncAt: string;
  errors: string[];
}

// ============================================================================
// HELPER TYPES
// ============================================================================

/**
 * Async operation result
 * Use for long-running operations that return immediately
 */
export interface AsyncOperationResult extends OperationResult<void> {
  operationId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number; // 0-100
  estimatedCompletion?: string;
}

/**
 * Health check result
 * Use for system health checks
 */
export interface HealthCheckResult {
  healthy: boolean;
  services: Record<string, {
    status: 'up' | 'down' | 'degraded';
    responseTime?: number;
    message?: string;
  }>;
  timestamp: string;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard for successful operation
 */
export function isOperationSuccess<T>(
  result: OperationResult<T>
): result is OperationResult<T> & { success: true; data: T } {
  return result.success === true && result.data !== undefined;
}

/**
 * Type guard for failed operation
 */
export function isOperationError<T>(
  result: OperationResult<T>
): result is OperationResult<T> & { success: false; error: string } {
  return result.success === false;
}

/**
 * Type guard for valid validation result
 */
export function isValidationSuccess(
  result: ValidationResult
): result is ValidationResult & { isValid: true } {
  return result.isValid === true;
}

