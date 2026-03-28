/**
 * Shared Supabase-aligned core shapes for entities used by both store-app and admin-app.
 *
 * **Normative contract (spec `005-admin-store-backend-contract`):** These exported interfaces are the
 * single source of truth for overlapping remote columns. Supplementary docs live under
 * `specs/005-admin-store-backend-contract/contracts/` and must not contradict this file.
 *
 * ## v1 in-scope tables (overlapping fields only)
 * `stores`, `branches`, `users` (staff), `store_subscriptions`
 *
 * ## Extension matrix (FR-004)
 *
 * | Concern | Store-app | Admin-app |
 * |---------|-----------|-----------|
 * | Sync columns (`_synced`, `_lastSyncedAt`, `_deleted`) | On IndexedDB / synced rows; **never** in `*Core` | N/A (no Dexie) |
 * | Soft-delete metadata (`is_deleted`, `deleted_at`, `deleted_by`) | May appear on remote row types; sync maps to `_deleted` locally | On `Store`, `Branch`, etc. |
 * | Store row: commission, low stock, address, logo, `status` | In `Database['public']['stores']['Row']` extensions | On `Store` interface |
 * | Staff: phone, salary, schedule | In `users` Row / `Employee` extensions | On `StoreUser` extensions |
 * | Subscriptions: billing amount, cycle, limits | Not used in store-app typings (admin-only ops) | `Subscription` extends partial `StoreSubscriptionCore` + billing fields; column names may differ (e.g. `start_date` vs `starts_at`) — map at service layer |
 *
 * **Extension rule:** Each app may add fields outside these interfaces; do not duplicate core field definitions locally.
 */

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

/** Core overlap for subscription rows; admin-app uses additional columns (see `Subscription`). */
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
