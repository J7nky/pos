# Contract: Shared Core Data Types (v1)

## Purpose

Define the minimum shared type contract for entities used by both admin-app and store-app so both apps consume one authoritative core definition.

## Scope

In-scope entities (v1):

- `StoreCore`
- `BranchCore`
- `UserCore`
- `StoreSubscriptionCore`

Out of scope:

- App-specific extension fields not required by both apps
- Non-overlap entities used by only one app

## Contract Rules

1. Core entities MUST be exported from `@pos-platform/shared`.
2. Both apps MUST import core entities from shared (not duplicate local core definitions).
3. App-local extension types MAY compose core entities via intersection/extension.
4. Core field names/types MUST remain backward-compatible unless intentionally versioned.

## Proposed Type Shape (Technology-facing reference)

```ts
export interface StoreCore {
  id: string;
  name: string;
  preferred_currency: 'USD' | 'LBP';
  preferred_language: 'en' | 'ar' | 'fr';
  exchange_rate: number;
  created_at: string;
  updated_at: string;
}

export interface BranchCore {
  id: string;
  store_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserCore {
  id: string;
  store_id: string;
  branch_id: string | null;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'cashier';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StoreSubscriptionCore {
  id: string;
  store_id: string;
  plan: string;
  status: string;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}
```

## Compatibility Strategy

- Additive field additions are allowed if optional at first release.
- Breaking core-field changes require coordinated update in both apps in one feature cycle.
- Extension-field changes are isolated to owning app unless promoted to core.
