/**
 * Taxonomy services (v64): store-scoped CRUD for `product_categories` and
 * `units_of_measure`. Mirrors the chart-of-accounts shape — reads come from
 * Dexie, writes go through Dexie with `_synced: false` so the standard sync
 * pipeline uploads them to Supabase.
 *
 * UI does NOT import this module directly. It goes through `OfflineDataContext`
 * (`categories`, `units`, `createCategory`, `updateCategory`, `deleteCategory`,
 * and unit equivalents) per `ARCHITECTURE_RULES.md`.
 */

import { getDB } from '../lib/db';
import { v4 as uuidv4 } from 'uuid';
import type {
  ProductCategory,
  UnitOfMeasure,
  UnitSystemRole,
} from '../types/taxonomy';
import type { MultilingualString } from '../utils/multilingual';
import { getTranslatedString } from '../utils/multilingual';

/** Slugify the English name into a stable `code`. */
function slugify(name: MultilingualString | string): string {
  const text = typeof name === 'string'
    ? name
    : getTranslatedString(name, 'en') || getTranslatedString(name, 'ar') || '';
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || `cat_${uuidv4().slice(0, 8)}`;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export interface CreateCategoryInput {
  name: MultilingualString;
  code?: string;
  sort_order?: number;
  is_active?: boolean;
}

export const categoryService = {
  async list(storeId: string): Promise<ProductCategory[]> {
    const rows = await getDB().product_categories
      .where('store_id')
      .equals(storeId)
      .filter((r) => !r._deleted)
      .toArray();
    rows.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return rows;
  },

  async getByCode(storeId: string, code: string): Promise<ProductCategory | undefined> {
    return getDB().product_categories
      .where('[store_id+code]')
      .equals([storeId, code])
      .first();
  },

  async create(storeId: string, input: CreateCategoryInput): Promise<string> {
    const code = (input.code ?? slugify(input.name)).toLowerCase();
    const existing = await this.getByCode(storeId, code);
    if (existing) {
      throw new Error(`A category with code "${code}" already exists.`);
    }
    const now = new Date().toISOString();
    const row: ProductCategory = {
      id: uuidv4(),
      store_id: storeId,
      code,
      name: input.name,
      sort_order: input.sort_order ?? 100,
      is_active: input.is_active ?? true,
      is_system: false,
      created_at: now,
      updated_at: now,
      _synced: false,
      _deleted: false,
    };
    await getDB().product_categories.add(row);
    return row.id;
  },

  async update(id: string, updates: Partial<Pick<ProductCategory, 'name' | 'sort_order' | 'is_active' | 'code'>>): Promise<void> {
    await getDB().product_categories.update(id, {
      ...updates,
      updated_at: new Date().toISOString(),
      _synced: false,
    });
  },

  /**
   * Soft-delete a category. Refuses if any non-deleted product still
   * references it through `category_id` — matches the chart-of-accounts /
   * inventory delete-confirm pattern.
   */
  async softDelete(id: string): Promise<void> {
    const refs = await getDB().products
      .filter((p) => p.category_id === id && !p._deleted)
      .count();
    if (refs > 0) {
      throw new Error(`Cannot delete: ${refs} product(s) still use this category.`);
    }
    await getDB().product_categories.update(id, {
      _deleted: true,
      _synced: false,
      updated_at: new Date().toISOString(),
    });
  },
};

// ---------------------------------------------------------------------------
// Units of measure
// ---------------------------------------------------------------------------

export interface CreateUnitInput {
  name: MultilingualString;
  code?: string;
  symbol?: string | null;
  system_role?: UnitSystemRole | null;
  conversion_to_base?: number | null;
  base_unit_code?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

export const unitService = {
  async list(storeId: string): Promise<UnitOfMeasure[]> {
    const rows = await getDB().units_of_measure
      .where('store_id')
      .equals(storeId)
      .filter((r) => !r._deleted)
      .toArray();
    rows.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return rows;
  },

  async getByCode(storeId: string, code: string): Promise<UnitOfMeasure | undefined> {
    return getDB().units_of_measure
      .where('[store_id+code]')
      .equals([storeId, code])
      .first();
  },

  async create(storeId: string, input: CreateUnitInput): Promise<string> {
    const code = (input.code ?? slugify(input.name)).toLowerCase();
    const existing = await this.getByCode(storeId, code);
    if (existing) {
      throw new Error(`A unit with code "${code}" already exists.`);
    }
    const now = new Date().toISOString();
    const row: UnitOfMeasure = {
      id: uuidv4(),
      store_id: storeId,
      code,
      name: input.name,
      symbol: input.symbol ?? null,
      system_role: input.system_role ?? null,
      conversion_to_base: input.conversion_to_base ?? null,
      base_unit_code: input.base_unit_code ?? null,
      sort_order: input.sort_order ?? 100,
      is_active: input.is_active ?? true,
      is_system: false,
      created_at: now,
      updated_at: now,
      _synced: false,
      _deleted: false,
    };
    await getDB().units_of_measure.add(row);
    return row.id;
  },

  async update(id: string, updates: Partial<Omit<UnitOfMeasure, 'id' | 'store_id' | 'created_at' | 'is_system'>>): Promise<void> {
    await getDB().units_of_measure.update(id, {
      ...updates,
      updated_at: new Date().toISOString(),
      _synced: false,
    });
  },

  async softDelete(id: string): Promise<void> {
    const unit = await getDB().units_of_measure.get(id);
    if (!unit) return;
    const byId = await getDB().inventory_items
      .filter((it) => it.unit_id === id && !it._deleted)
      .count();
    const byCode = await getDB().inventory_items
      .where('unit')
      .equals(unit.code)
      .filter((it) => !it._deleted && !it.unit_id)
      .count();
    const refs = byId + byCode;
    if (refs > 0) {
      throw new Error(`Cannot delete: ${refs} inventory item(s) still use this unit.`);
    }
    await getDB().units_of_measure.update(id, {
      _deleted: true,
      _synced: false,
      updated_at: new Date().toISOString(),
    });
  },
};

/** Convenience: build a lookup from id → row for fast UI rendering. */
export function indexById<T extends { id: string }>(rows: T[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const r of rows) out[r.id] = r;
  return out;
}
