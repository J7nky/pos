# Quickstart: Shared admin ↔ store backend contract

## Prerequisites

- pnpm workspace at repo root  
- Branch: `005-admin-store-backend-contract` (or main after merge)  
- Read [spec.md](./spec.md) and [contracts/shared-supabase-core-contract.md](./contracts/shared-supabase-core-contract.md)

## Change a shared core field (add/rename/enum)

1. **Edit normative types** in `packages/shared/src/types/supabase-core.ts` only.
2. **Typecheck** from repo root (adjust if your CI uses different scripts):

   ```bash
   pnpm exec tsc --noEmit -p packages/shared/tsconfig.json
   pnpm exec tsc --noEmit -p apps/admin-app/tsconfig.json
   pnpm exec tsc --noEmit -p apps/store-app/tsconfig.json
   ```

   Or use each package’s `package.json` scripts if defined.

3. **Fix compile errors** in:
   - `apps/admin-app/src/types/index.ts` (extensions)
   - `apps/store-app/src/types/database.ts` (Row/Insert/Update)
4. **Update supplementary doc** [contracts/shared-supabase-core-contract.md](./contracts/shared-supabase-core-contract.md) if the human-readable field list changes.
5. **Release note**: mention `@pos-platform/shared` contract change (satisfies SC-003).

## Verify alignment without codegen

- Grep for duplicate interface bodies: search for `interface Store` / `StoreCore` usage; cores should **import from** `@pos-platform/shared`.
- Optional: add a tiny `packages/shared` test that a fixture object satisfies `StoreCore` (guards accidental field removal).

## Release triage (shared core change)

Use this checklist when a PR touches `packages/shared/src/types/supabase-core.ts` or overlapping columns in admin/store types.

1. **Packages / order of edits**
   - Edit `packages/shared/src/types/supabase-core.ts` first (normative).
   - Then fix `apps/admin-app/src/types/index.ts` extensions.
   - Then fix `apps/store-app/src/types/database.ts` (`stores`, `branches`, `users`, …) and any `types/index.ts` references.
2. **Typecheck** (same commands as above).
3. **Docs** — update [contracts/shared-supabase-core-contract.md](./contracts/shared-supabase-core-contract.md) if the human-readable summary changed.
4. **Release note** (paste into PR description):

   ```
   - Shared contract: updated @pos-platform/shared Supabase core types (stores/branches/users/subscriptions overlap). See specs/005-admin-store-backend-contract/spec.md.
   ```

5. **Apps to verify manually**: admin screens that edit stores/branches/users; store-app branch sync and settings if columns changed.

## What not to do

- Do not add overlapping field definitions to admin or store types **without** going through `*Core`.
- Do not import `lib/supabase` in store-app UI to “fix” types—**CG-02** unchanged.
- Do not emit sync events or change Dexie for this contract work unless a **real** schema migration is part of the same project (CG-09).
