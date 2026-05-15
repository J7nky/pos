/**
 * Configurable, store-scoped taxonomies for product categories and units of
 * measure (v64). Both replace the previously hardcoded TypeScript literal
 * unions on `products.category` and `inventory_items.unit`.
 *
 * Rows are seeded per `stores.tenant_type` (admin-templated), syncable through
 * the standard Tier 1 pipeline, and editable in store-app settings.
 */

import type { MultilingualString } from '../utils/multilingual';

/** Coarse classification of a unit's physical meaning. Drives validation
 *  ranges (e.g. `weightValidationService` thresholds for `mass`). */
export type UnitSystemRole = 'mass' | 'count' | 'volume' | 'length' | 'pack';

export interface ProductCategory {
  id: string;
  store_id: string;
  /** Stable slug, unique per store. Used by migration aliasing. */
  code: string;
  name: MultilingualString;
  sort_order: number;
  is_active: boolean;
  /** True for rows seeded from a tenant_type template — deletion is blocked
   *  while products reference the row, but the row itself can be deactivated. */
  is_system: boolean;
  created_at: string;
  updated_at: string;
  _synced?: boolean;
  _deleted?: boolean;
  _lastSyncedAt?: string;
}

export interface UnitOfMeasure {
  id: string;
  store_id: string;
  code: string;
  name: MultilingualString;
  /** Optional short display symbol (e.g. "kg", "pc"). */
  symbol?: string | null;
  system_role?: UnitSystemRole | null;
  /** Future-proof: factor to a base unit (kg=1, g=0.001). Not consumed in v64. */
  conversion_to_base?: number | null;
  base_unit_code?: string | null;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
  _synced?: boolean;
  _deleted?: boolean;
  _lastSyncedAt?: string;
}

/** Shape stored in `tenant_type_templates.default_categories` / `default_units`. */
export interface TenantTypeCategoryDefault {
  code: string;
  name: MultilingualString;
  sort_order?: number;
}

export interface TenantTypeUnitDefault {
  code: string;
  name: MultilingualString;
  system_role?: UnitSystemRole;
  sort_order?: number;
}

export interface TenantTypeTemplate {
  id: string;
  tenant_type: string;
  display_name: MultilingualString;
  default_categories: TenantTypeCategoryDefault[];
  default_units: TenantTypeUnitDefault[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
