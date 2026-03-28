# Research: Unified data contract and home cash drawer updates

## Decision 1: Shared contract should be "core overlap only" in `packages/shared`

- **Decision**: Add a shared `BackendCore` contract section in `packages/shared/src/types` for the v1 overlap entities (`stores`, `branches`, `users`, `store_subscriptions`) and have both apps consume those core types.
- **Rationale**: `admin-app` already depends on `@pos-platform/shared`; locating the core contract there avoids duplicating shape definitions while preserving each app's local extension types.
- **Alternatives considered**:
  - Keep independent app-local types and enforce alignment via docs only (rejected: drift risk remains high).
  - Move all store-app database types wholesale into shared (rejected: too broad for this feature and tightly coupled to store-app internals).

## Decision 2: Field strategy should be "shared core + app-specific extensions"

- **Decision**: For each in-scope entity, define one core shared type and allow extension interfaces in each app for app-only fields.
- **Rationale**: Clarification in spec requires common core parity without forbidding app-specific concerns; this pattern minimizes migration blast radius.
- **Alternatives considered**:
  - Force full identity of every field in both apps (rejected: unrealistic due to role/status and workflow differences).
  - Loosely typed map/record schemas (rejected: weak compile-time guarantees).

## Decision 3: Home cash drawer updates should be fully reactive/event-driven, no periodic fallback

- **Decision**: Remove the `setInterval` fallback in `apps/store-app/src/pages/Home.tsx` and rely on existing triggers: context state changes, event listeners, and sync-completion hooks already present in the component.
- **Rationale**: This aligns with constitution CG-03 and the feature requirement that Home must not rely on timed checks.
- **Alternatives considered**:
  - Keep interval as "safety net" (rejected: violates the no-polling requirement).
  - Add explicit freshness badge with periodic timer (rejected: spec clarifies no freshness indicator in this feature).

## Decision 4: Validation should be a mix of static and behavior checks

- **Decision**: Validate using lint/static checks for no-interval policy in Home and type adoption checks in both apps, plus manual user-flow checks for Home cash drawer updates after state changes.
- **Rationale**: Feature spans behavior + type contracts; both compile-time and runtime confidence are needed.
- **Alternatives considered**:
  - Unit tests only (rejected: misses architecture rule compliance unless supplemented).
  - Manual QA only (rejected: insufficient protection against future type drift).
