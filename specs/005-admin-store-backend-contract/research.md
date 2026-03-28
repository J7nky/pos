# Research: Admin-app vs store-app shared backend contract

## Decision 1: Normative contract = `packages/shared/src/types/supabase-core.ts`

- **Decision**: The **only** authoritative definitions for overlapping columns are the exported interfaces `StoreCore`, `BranchCore`, `UserCore`, and `StoreSubscriptionCore`. Supplementary markdown in `specs/005-admin-store-backend-contract/contracts/` summarizes and must not contradict them (per feature spec clarification Option A).
- **Rationale**: Matches clarified spec; enables compile-time checking in both apps; single edit point when a shared column changes.
- **Alternatives considered**:
  - **Markdown-first** (rejected: contradicts clarification A; drift risk).
  - **Supabase CLI `gen types` into shared** as sole source (deferred: spec out of scope for mandating a specific codegen pipeline; team may adopt later if desired).

## Decision 2: Extension pattern stays “Core & +”

- **Decision**: Admin `Store`, `Branch`, `StoreUser`, subscription types continue to **`extends` `*Core`**. Store-app `Database['public']['*']['Row']` continues to use **`StoreCore & { … }`** / **`Omit<UserCore, …> & { … }`** for extensions—**no duplicate field names** on core keys with different types.
- **Rationale**: Already partially implemented; minimizes churn; satisfies FR-003 / FR-004.
- **Alternatives considered**:
  - **Branded row types duplicated in each app** (rejected: violates single normative source).
  - **Full `Database` type in shared** (rejected: out of scope; store-app Dexie-centric types stay local).

## Decision 3: Verification strategy = typecheck + targeted review + release habit

- **Decision**: Primary verification is **`pnpm` workspace typecheck** for `packages/shared`, `apps/admin-app`, and `apps/store-app` after core changes. Optional follow-ups: small **Vitest** test in `packages/shared` that asserts structural compatibility (e.g. dummy object satisfies `StoreCore`), or **eslint** import rules encouraging `StoreCore` from `@pos-platform/shared` only—not re-declared interfaces.
- **Rationale**: Meets SC-001 / SC-003 without prescribing a heavy codegen pipeline; aligns with constitution preference for real compile-time safety.
- **Alternatives considered**:
  - **JSON Schema as second source of truth** (rejected: duplicates normative TS unless automated from same file).
  - **Manual QA only** (rejected: insufficient for “zero drift” goal).

## Decision 4: `UserCore.is_active` vs optional store rows

- **Decision**: Keep **`is_active: boolean`** on `UserCore` as normative. Store-app `users.Row` may use `Omit<UserCore, 'is_active'> & { is_active?: boolean }` where legacy rows lack the column; document as **compatibility shim**, not a second core definition.
- **Rationale**: Admin treats `is_active` as required; store must handle optional DB state; documented in data-model and contract doc.
- **Alternatives considered**:
  - **Make `is_active` optional on `UserCore`** (rejected: weakens admin contract unless both apps agree).

## Decision 5: Documentation file naming and scope

- **Decision**: Human-readable contract lives at `specs/005-admin-store-backend-contract/contracts/shared-supabase-core-contract.md` and references **file paths** to normative exports. Feature **quickstart** describes release steps (update package → align apps → typecheck → update supplementary doc).
- **Rationale**: Satisfies FR-005 without embedding duplicate type bodies in markdown (tables may list field names only for readability).

---

## Implementation audit (core field parity)

**Date**: 2026-03-25. **Normative**: `packages/shared/src/types/supabase-core.ts`.

### StoreCore

| Field | Admin `Store` | Store `database.ts` `stores.Row` | Notes |
|-------|----------------|----------------------------------|-------|
| `id`, `name`, `preferred_currency`, `preferred_language`, `exchange_rate`, `created_at`, `updated_at` | extends `StoreCore` | `StoreCore & { … }` | Aligned |
| (extensions) | `address`, `phone`, `email`, `logo`, `status`, commission, soft-delete, … | `preferred_commission_rate`, `low_stock_alert`, `address`, `phone`, `email`, `logo`, `status` | No overlap conflict |

### BranchCore

| Field | Admin `Branch` | Store `types/index.ts` `Branch` / `database.ts` `branches.Row` | Notes |
|-------|----------------|----------------------------------------------------------------|-------|
| Core columns | extends `BranchCore` | `Branch` extends `BranchCore`; `branches.Row` is `BranchCore & { logo, soft-delete? }` | Aligned |
| Extensions | `logo`, soft-delete | `logo` on Row; Dexie adds `_synced`, `_lastSyncedAt`, `_deleted` | |

### UserCore

| Field | Admin `StoreUser` | Store `database.ts` `users.Row` | Notes |
|-------|-------------------|--------------------------------|-------|
| Core columns | extends `UserCore` | `Omit<UserCore, 'is_active'> & { is_active?: … }` | Optional `is_active` on store legacy rows (Decision 4) |
| Extensions | `phone` | `phone`, HR fields, `_synced`, `_deleted` | |

### StoreSubscriptionCore

| Field | Admin `Subscription` | Store | Notes |
|-------|---------------------|-------|-------|
| Overlap | `Pick<StoreSubscriptionCore, 'id' \| 'store_id' \| 'created_at' \| 'updated_at'>` + `plan`/`status` as narrower enums | No `store_subscriptions` in store `Database` (app does not use table in typings) | Admin maps UI/API field names (`start_date`, etc.) to DB; not a second copy of `StoreSubscriptionCore` fields |
