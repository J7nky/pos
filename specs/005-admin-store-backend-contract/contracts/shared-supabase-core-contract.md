# Contract: Shared Supabase core types (`@pos-platform/shared`)

**Status**: Supplementary human-readable contract  
**Normative source**: `packages/shared/src/types/supabase-core.ts` (TypeScript exports). **This document must not contradict those exports.** If text and code disagree, update code and docs in the **same release window**.

**Related spec**: [spec.md](../spec.md)  
**Feature branch**: `005-admin-store-backend-contract`

## 1. Purpose

Define the **single cross-app agreement** on overlapping columns for:

- `stores` → `StoreCore`
- `branches` → `BranchCore`
- `users` (staff) → `UserCore`
- `store_subscriptions` → `StoreSubscriptionCore`

Admin-app and store-app **must not** re-declare these fields with conflicting names or meanings. They **may** extend rows with app-specific fields.

## 2. Consumer mapping

| App | Location | Pattern |
|-----|----------|---------|
| Admin | `apps/admin-app/src/types/index.ts` | `Store extends StoreCore`, `Branch extends BranchCore`, `StoreUser extends UserCore`, subscription types extend or compose `StoreSubscriptionCore`. |
| Store | `apps/store-app/src/types/database.ts` | `stores.Row` includes `StoreCore & { … }`; `users.Row` composes `UserCore` (with documented optional `is_active` where needed); branches/subscriptions similarly. |

## 3. Extension rules

1. **Core fields**: Defined only in `supabase-core.ts` for the four entities above.
2. **Store-only**: Sync metadata, Dexie-only columns, POS-only columns — **not** in `*Core`.
3. **Admin-only**: Soft-delete metadata, extra billing columns — **not** in `*Core` unless promoted to cross-app overlap in a deliberate contract change.

### Examples (non-normative)

| Entity | Admin-app example | Store-app example |
|--------|-------------------|-------------------|
| Store | `Store extends StoreCore` + `status`, `address`, soft-delete | `Database['public']['stores']['Row']` = `StoreCore & { preferred_commission_rate, low_stock_alert, … }` |
| Branch | `Branch extends BranchCore` + `logo`, soft-delete | `branches.Row` = `BranchCore & { logo, soft-delete? }`; Dexie `Branch` adds `_synced` / `_deleted` after sync |
| User | `StoreUser extends UserCore` + `phone` | `users.Row` uses `UserCore` with optional `is_active` where legacy rows require it |
| Subscription | `Subscription` uses `Pick<StoreSubscriptionCore, …>` + billing fields; may rename dates in UI | Table not modeled in store `Database` typings (admin-led); core remains in `StoreSubscriptionCore` |

## 4. Change control

1. Edit `supabase-core.ts` first (normative).
2. Run workspace **TypeScript** build/typecheck for `shared`, `admin-app`, `store-app`.
3. Fix any extension types in admin or store `types/` that conflict.
4. Update this markdown **field summary** if column lists change.
5. Record in release notes: “Shared core contract updated (`@pos-platform/shared`).”

## 5. Non-goals

- Full **`Database` schema** duplication in shared (store-app keeps app-local `types/database.ts` for non-overlapping tables).
- **RLS or auth** policy (see spec assumptions).
- **Automatic codegen** from Supabase as a requirement (optional future improvement).
