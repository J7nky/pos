# Data Model: Unified data contract and home cash drawer updates

## 1) Shared Core Contract Model (v1 scope)

The shared model defines only overlap fields both apps rely on. Each app can extend these with local fields.

### Entity: `StoreCore`

- **Identity**: `id` (string, unique)
- **Core fields**:
  - `name`
  - `preferred_currency` (`USD` | `LBP`)
  - `preferred_language` (`en` | `ar` | `fr`)
  - `exchange_rate`
  - `created_at`
  - `updated_at`
- **Extensions**:
  - Admin app may include lifecycle/status and soft-delete metadata.
  - Store app may include local sync metadata.

### Entity: `BranchCore`

- **Identity**: `id` (string, unique)
- **Foreign key**: `store_id` -> `StoreCore.id`
- **Core fields**:
  - `name`
  - `address` (nullable)
  - `phone` (nullable)
  - `is_active`
  - `created_at`
  - `updated_at`
- **Extensions**:
  - App-specific logo/media fields are allowed outside the core if not universally used.

### Entity: `UserCore`

- **Identity**: `id` (string, unique)
- **Foreign key**: `store_id` -> `StoreCore.id`
- **Core fields**:
  - `email`
  - `name`
  - `role` (`admin` | `manager` | `cashier`)
  - `branch_id` (nullable)
  - `is_active`
  - `created_at`
  - `updated_at`
- **Extensions**:
  - App-local fields such as salary metadata, working schedule, or admin-only controls.

### Entity: `StoreSubscriptionCore`

- **Identity**: `id` (string, unique)
- **Foreign key**: `store_id` -> `StoreCore.id`
- **Core fields** (minimum contract):
  - `plan` (or equivalent plan identifier)
  - `status`
  - `starts_at`
  - `ends_at` (nullable for rolling plans)
  - `created_at`
  - `updated_at`
- **Extensions**:
  - Billing provider details and internal accounting flags remain app/service specific.

## 2) Home Cash Drawer View Model

### Entity: `CashDrawerViewState`

- **Purpose**: Render Home cash drawer card values.
- **Fields**:
  - `usdBalance` (number)
  - `lbpBalance` (number)
  - `currentBalance` (derived for backward compatibility display)
  - `transactionCount` (number)
  - `openedAt` (ISO timestamp)
- **State transitions**:
  - `null -> open`: when an active drawer session appears in context.
  - `open -> updated`: when relevant session/transaction/sync event changes source values.
  - `open -> null`: when session closes.

## 3) Validation Rules

- Shared core entities MUST keep field names/types stable across both apps.
- App-specific extension fields MUST NOT redefine core fields with conflicting types.
- Home view MUST NOT depend on recurring timer transitions for update visibility.

## 4) Cardinality & Relationships

- `StoreCore` 1..* `BranchCore`
- `StoreCore` 1..* `UserCore`
- `StoreCore` 0..* `StoreSubscriptionCore`
- `CashDrawerViewState` belongs to one active branch context at a time.
