# Developer Rules and Guidelines

This document outlines the core architectural and implementation rules that must be followed when developing new features and tasks for this Point of Sale (POS) system.

## 1. Branch Access and Data Filtering

**Rule:** Only admin users can access multiple branches in a store. Regular users can only see events for the specific branch they are currently signed into, not all branches in the store.

**Implementation Requirements:**
- The `branch_event_log` Row Level Security (RLS) policies must filter events by the user's current `branch_id`
- All queries and data access patterns must respect this branch-level isolation
- Authentication and authorization logic must enforce these access controls

## 2. Offline-First Architecture Pattern

**Rule:** The project follows a strict offline-first architecture pattern with this exact data flow:
```
Supabase → syncService.ts → IndexedDB → offlineDataContext.ts → UI components
```

**Implementation Requirements:**
- All CRUD operations must happen on the local IndexedDB database first, then sync to Supabase
- This ensures single source of truth, improved performance, and optimized logic
- Any new service or data model must follow this exact flow pattern
- No direct Supabase queries from UI components - always route through the offline-first layers

## 3. Customer/Supplier Ledger Implementation

**Rule:** Server RPC-based customer/supplier ledger has been removed. The system relies entirely on local computation for account statements.

**Implementation Requirements:**
- Account statements must be computed locally, not on the server
- No new server-side RPC functions for ledger operations
- All ledger calculations must be performed client-side

## 4. Code Simplicity and Schema Patterns

**Rule:** Prefer simpler implementations without unnecessary fields. Always refer to existing data schema patterns when designing new features.

**Implementation Requirements:**
- Study `@database.ts` and `@db.ts` for existing data schema patterns
- Avoid adding unnecessary fields or complex structures
- Maintain consistency with established schema conventions
- Keep implementations simple and focused on core functionality

## 5. Event-Driven Architecture (No Periodic Polling)

**Rule:** The system uses a fully event-driven architecture with zero periodic polling. All data synchronization happens through real-time events.

**Implementation Requirements:**
- No `setInterval()` or periodic sync timers for data synchronization
- All changes must emit events to `branch_event_log` via `eventEmissionService`
- Use `eventStreamService` for real-time synchronization across devices
- Manual sync is only used for force sync, initial resync, or uploading unsynced changes
- Bulk operations must use bulk event emitters to prevent event storms

## 6. Atomic Transactions with TransactionService

**Rule:** All financial transactions must be atomic and go through the unified `TransactionService` for consistency and audit trails.

**Implementation Requirements:**
- Use `transactionService.createTransaction()` for all transaction operations
- Never create transactions directly in database - always use the service
- Include proper `TransactionContext` with user info and correlation IDs
- Use predefined `TRANSACTION_CATEGORIES` for type safety
- Automatic balance updates, cash drawer updates, and audit logging are built-in
- All validation happens before database operations with automatic rollback on failure

## 7. RBAC (Role-Based Access Control) Patterns

**Rule:** All user permissions must follow the established RBAC pattern with role defaults and user-specific overrides.

**Implementation Requirements:**
- Use `rolePermissionService` for all permission checks
- Check module access with `checkModuleAccess()` before showing UI elements
- Check operation limits with `checkOperationLimit()` before executing operations
- Route protection must use `ProtectedRoute` component for module-level access
- Navigation menus must dynamically filter based on `user_module_access` permissions
- Permission changes sync across devices through event-driven architecture

## 8. Data Access Layer Architecture

**Rule:** Strict data access layer pattern must be followed - UI components can only access data through `useOfflineData()` hook.

**Forbidden Patterns:**
- ❌ UI components importing `db.ts` directly
- ❌ UI components importing `supabase` directly
- ❌ Services accessing `supabase` (except `syncService` and authentication)

**Allowed Patterns:**
- ✅ UI components using `useOfflineData()` hook from `OfflineDataContext`
- ✅ Services accessing `db.ts` when called by `OfflineDataContext`
- ✅ Only `syncService` and authentication context access Supabase directly

## 9. Service Architecture Patterns

**Rule:** All services must follow established patterns and be called through the offline-first data layer.

**Service Guidelines:**
- Services should only access `db.ts` when called by `OfflineDataContext`
- Business logic should be centralized in services, not scattered in components
- Services must handle their own error cases and provide meaningful error messages
- Use dependency injection patterns where services depend on other services
- All database operations in services should be atomic when involving multiple tables

## 10. Schema and Migration Patterns

**Rule:** Database schema changes must follow established migration patterns with proper versioning and backwards compatibility.

**Schema Requirements:**
- All tables must have `store_id`, `created_at`, `updated_at` fields
- Sync-enabled tables need `_synced`, `_lastSyncedAt`, `_deleted` fields
- Use compound indexes for common query patterns
- Foreign key constraints must be properly defined
- RLS policies must be implemented for multi-tenant security
- Schema changes require both Supabase migrations and IndexedDB version bumps

## 11. Error Handling and Validation

**Rule:** Comprehensive error handling and input validation must be implemented at all layers.

**Error Handling Patterns:**
- Validate inputs before database operations
- Provide specific error messages for different failure scenarios
- Use try/catch blocks with proper error propagation
- Log errors with context information for debugging
- Handle network failures gracefully in offline-first architecture
- Rollback transactions automatically on any failure

## 12. Testing Patterns

**Rule:** All code must be testable with proper unit tests and integration tests following established patterns.

**Testing Guidelines:**
- Unit tests for services with mocked dependencies
- Integration tests for critical transaction flows
- Test atomicity guarantees in transaction services
- Mock Supabase and IndexedDB for isolated testing
- Test error conditions and edge cases
- Performance tests for sync operations and large data sets

## 13. Multilingual Support

**Rule:** All user-facing text must support internationalization with the established multilingual system.

**Multilingual Requirements:**
- Use `createMultilingualFromString()` and `getTranslatedString()` utilities
- Store multilingual data in the `MultilingualString` format
- Support dynamic language switching
- Use translation keys consistently across components
- Test all text in supported languages (English, Arabic, French)

## 14. Currency and Exchange Rate Handling

**Rule:** All monetary operations must properly handle multiple currencies and exchange rates.

**Currency Guidelines:**
- Use `currencyService` for all currency operations
- Validate currency amounts before processing
- Handle exchange rate calculations consistently
- Store amounts with proper precision (avoid floating point issues)
- Display currency symbols and formatting according to user locale

## General Development Principles

- Always prioritize the offline-first architecture when adding new features
- Respect branch-level data isolation in all user-facing functionality
- Use local computation over server-side processing where possible
- Follow existing patterns from core files (`@database.ts`, `@db.ts`, `syncService.ts`, `offlineDataContext.ts`)
- Ensure RLS policies properly enforce data access controls
- Use atomic transactions for any multi-table operations
- Implement proper RBAC checks for all user actions
- Follow event-driven patterns for real-time synchronization
- Maintain backwards compatibility in schema changes
- Write comprehensive tests for critical functionality

## Code Review Checklist

When implementing new features, verify:
- [ ] Data flows through the offline-first pattern (Supabase → syncService → IndexedDB → offlineDataContext → UI)
- [ ] Branch access controls are properly enforced
- [ ] Local computation is used instead of server RPCs where applicable
- [ ] Schema follows patterns from `@database.ts` and `@db.ts`
- [ ] Implementation is simple and avoids unnecessary complexity
- [ ] Event-driven synchronization is implemented (no periodic polling)
- [ ] Financial transactions use `TransactionService` with proper atomicity
- [ ] RBAC permissions are checked for all user actions
- [ ] UI components only access data through `useOfflineData()` hook
- [ ] Services follow established patterns and error handling
- [ ] Schema changes include proper migrations and version bumps
- [ ] Input validation and error handling are comprehensive
- [ ] Multilingual support is implemented for user-facing text
- [ ] Currency handling follows established patterns
- [ ] Tests cover critical functionality and edge cases
