# Data model: Shared Supabase core (admin ↔ store overlap)

This document describes **logical** entities and **relationships** for the four in-scope overlapping tables. **Normative field types** are defined in code in `packages/shared/src/types/supabase-core.ts` (`StoreCore`, `BranchCore`, `UserCore`, `StoreSubscriptionCore`). If this file disagrees with that module, **the TypeScript module wins** until reconciled.

**Extension matrix:** See the module comment at the top of `supabase-core.ts` (sync columns, admin-only, store-only, subscription mapping).

## 1. Entity relationship overview

```text
Store (store_id PK)
  ├── Branch (id PK, store_id FK → Store)
  ├── User / staff (id PK, store_id FK → Store, branch_id FK → Branch nullable)
  └── StoreSubscription (id PK, store_id FK → Store)
```

## 2. Store (table: `stores`)

| Role | Description |
|------|-------------|
| **Shared core** | `StoreCore`: identity + naming + `preferred_currency`, `preferred_language`, `exchange_rate`, `created_at`, `updated_at`. |
| **Store-app extensions** | e.g. `preferred_commission_rate`, `low_stock_alert`, `address`, `phone`, `email`, `logo`, `status`, sync columns when present. |
| **Admin-app extensions** | Same business fields as above where applicable; additional soft-delete / lifecycle metadata as needed. |

**Rule**: Any column in **both** apps’ “business” view of a store row must appear in `StoreCore` **or** be explicitly classified as an extension in supplementary contract doc (not redefined with conflicting types).

## 3. Branch (table: `branches`)

| Role | Description |
|------|-------------|
| **Shared core** | `BranchCore`: `id`, `store_id`, `name`, `address`, `phone`, `is_active`, `created_at`, `updated_at`. |
| **Extensions** | e.g. per-app `logo`, soft-delete fields, sync metadata. |

## 4. Staff user (table: `users`)

| Role | Description |
|------|-------------|
| **Shared core** | `UserCore`: `id`, `store_id`, `branch_id`, `email`, `name`, `role`, `is_active`, `created_at`, `updated_at`. |
| **Store-app extensions** | `phone`, HR fields, `_synced`, `_deleted`, etc. |
| **Compatibility note** | Store `Row` type may treat `is_active` as optional where legacy data exists; semantics still align with admin when present. |

## 5. Store subscription (table: `store_subscriptions`)

| Role | Description |
|------|-------------|
| **Shared core** | `StoreSubscriptionCore`: `id`, `store_id`, `plan`, `status`, `starts_at`, `ends_at`, `created_at`, `updated_at`. |
| **Admin extensions** | Billing amounts, plan tiers not in core, etc. |

## 6. Validation rules (contract-level)

- **Required vs optional** on cores matches **admin** expectations unless both apps explicitly document a shared exception (e.g. optional `is_active` on store legacy rows).
- **Enumerations** (`preferred_currency`, `preferred_language`, `role`) are closed sets in `UserCore` / `StoreCore`; widening requires a versioned change to `supabase-core.ts` and both apps.
- **Sync-only columns** (`_synced`, `_lastSyncedAt`, `_deleted`) are **never** part of `*Core` interfaces.

## 7. State transitions

Not in scope for this feature beyond **documenting** that admin may edit subscription/org fields the store app only reads; no shared state machine is required in the contract.
