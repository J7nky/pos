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

## 5. Event-Driven Architecture (No Periodic Polling for Sync)

**Rule:** Sync is event-driven: real-time events drive data flow. There is no periodic polling to *trigger* sync or to *fetch* sync state for the purpose of driving sync. UI must not poll for unsynced state; it must react to context (e.g. `unsyncedCount` from `getSyncStatus()`) which is updated by callbacks after CRUD and after sync.

**Implementation Requirements:**
- No `setInterval()` or periodic timers in UI or app code for sync or for “refresh unsynced” — use event-driven updates (context state updated by `crudHelperService` / sync callbacks)
- All changes must emit events to `branch_event_log` via `eventEmissionService`
- Use `eventStreamService` for real-time synchronization (Realtime subscription + optional catch-up)
- Manual sync is only used for force sync, initial resync, or uploading unsynced changes
- Bulk operations must use bulk event emitters to prevent event storms

**Documented exception (policy vs implementation):**
- **eventStreamService** may run a single, long-interval “catch-up” (e.g. ~5min) as a safety net for missed Realtime events (e.g. tab in background, connection blip). This is not “periodic polling for sync” and is the only allowed periodic interval in the sync/event path. All other sync-related updates are driven by events and callbacks.

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

**Rule:** UI must not import supabase, db, or repositories. UI may only import from hooks, services, and contexts.

**UI must NOT import:**
- ❌ **supabase** — no `lib/supabase` or any Supabase client in pages/components/layouts
- ❌ **db** — no `lib/db`, `getDB()`, or any direct IndexedDB access in UI
- ❌ **repositories** — no repository layer that wraps db/supabase in UI

**UI may ONLY import from:**
- ✅ **hooks** (e.g. `useOfflineData`, `useCurrency`, `useSupabaseAuth`)
- ✅ **services** (business logic that does not expose db/supabase to callers)
- ✅ **contexts** (e.g. `OfflineDataContext`, `SupabaseAuthContext`)

Services and contexts may use `db` and `supabase` internally. Only designated layers (e.g. `syncService`, auth context) access Supabase directly.

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
- [ ] Event-driven sync: no UI/sync polling; use context/callbacks for unsynced state; eventStreamService catch-up is the only allowed periodic interval (§5)
- [ ] Financial transactions use `TransactionService` with proper atomicity
- [ ] RBAC permissions are checked for all user actions
- [ ] UI does not import supabase, db, or repositories; only hooks, services, contexts
- [ ] Services follow established patterns and error handling
- [ ] Schema changes include proper migrations and version bumps
- [ ] Input validation and error handling are comprehensive
- [ ] Multilingual support is implemented for user-facing text
- [ ] Currency handling follows established patterns
- [ ] Tests cover critical functionality and edge cases

## Sync parity baseline (refactor merge gate)

**Rule:** Changes that refactor `syncService` or materially alter sync/event reconciliation must keep parity with the committed golden snapshots.

**Merge gate (run from `apps/store-app`):**

```bash
pnpm run parity:gate
```

This runs `test:parity` (contract mocks + golden comparison), `parity:check-registry`, `parity:check-dexie-mode`, and `parity:coverage-matrix`.

**Definitions:** See [apps/store-app/tests/sync-parity/VALID_TEST_RULES.md](apps/store-app/tests/sync-parity/VALID_TEST_RULES.md).

**Golden files:** `apps/store-app/tests/sync-baseline/*.golden.json` — PRs that add or change these require intentional review (see [.github/CODEOWNERS](.github/CODEOWNERS)).

**Legacy tests:** `src/services/__tests__/legacy/**` are excluded from the default Vitest run; they are not parity proof.

**Default unit run:** `pnpm run test:run` (from `apps/store-app`) excludes `legacy/`, `integration/`, and `tests/sync-parity/`; use `pnpm run parity:gate` for sync parity + checks.

**Optional:** Non-blocking Supabase integration checks may live under `src/services/__tests__/integration/` and are not part of `parity:gate`.
