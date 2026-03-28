# Quickstart: Implementing 001-shared-types-home-drawer

## 1) Prepare

1. Checkout branch `001-shared-types-home-drawer`.
2. Review:
   - `spec.md`
   - `plan.md`
   - `research.md`
   - `contracts/`

## 2) Implement Shared Core Contract (1.4)

1. Add core entity types for `StoreCore`, `BranchCore`, `UserCore`, `StoreSubscriptionCore` in `packages/shared/src/types`.
2. Export new types from `packages/shared/src/types/index.ts` and `packages/shared/src/index.ts`.
3. Update admin-app and store-app type usage to consume shared core types and keep app-specific extension types local.
4. Ensure no duplicate independent core definitions remain for the four v1 entities.

## 3) Remove Home Polling (1.5)

1. Edit `apps/store-app/src/pages/Home.tsx`.
2. Remove the periodic `setInterval` fallback used for cash drawer refresh.
3. Keep update behavior tied to existing reactive/event-driven triggers already in the component.
4. Ensure no explicit freshness indicator is added in this feature.

## 4) Validate

1. Run lint:
   - `pnpm --filter store-app lint`
   - `pnpm --filter admin-app lint`
2. Run tests relevant to touched code:
   - `pnpm --filter store-app test:run`
3. Manually verify Home cash drawer updates after open/close/transaction/sync events.
4. Confirm type imports for v1 shared entities come from `@pos-platform/shared`.

## 5) Definition of Done Checklist

- [ ] Home has no periodic refresh interval for cash drawer status.
- [ ] Home behavior still reflects cash drawer updates through existing reactive/event paths.
- [ ] Shared core contract exists and is exported from `@pos-platform/shared`.
- [ ] Both apps consume shared core types for v1 overlap entities.
- [ ] No duplicate core-field definitions remain for in-scope entities.
