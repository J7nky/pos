/**
 * Shared helpers for resolving product `category_id` and inventory `unit_id`
 * to their translated display labels. Falls back to the legacy text fields
 * (`product.category`, `inventoryItem.unit`) for rows that pre-date v64 so
 * the UI never renders a blank cell during the transition.
 */

import { useMemo } from 'react';
import { useI18n } from '../i18n';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { getTranslatedString } from '../utils/multilingual';
import { translateCategory } from '../components/inventory/RecentReceivesTable';
import type { ProductCategory, UnitOfMeasure } from '../types/taxonomy';

export interface CategoryLookup {
  categories: ProductCategory[];
  byId: Record<string, ProductCategory>;
  byCode: Record<string, ProductCategory>;
  /** Resolve a product (or any row carrying `category_id` + legacy `category`) to a display label. */
  label: (row: { category_id?: string | null; category?: string | null } | null | undefined) => string;
}

export function useCategoryLookup(): CategoryLookup {
  const { t, language } = useI18n();
  const { categories } = useOfflineData();

  return useMemo(() => {
    const byId: Record<string, ProductCategory> = {};
    const byCode: Record<string, ProductCategory> = {};
    for (const c of categories) {
      byId[c.id] = c;
      byCode[c.code] = c;
    }
    const label = (row: { category_id?: string | null; category?: string | null } | null | undefined): string => {
      if (!row) return '';
      if (row.category_id && byId[row.category_id]) {
        return getTranslatedString(byId[row.category_id].name, language);
      }
      // Resolve legacy string via the seeded categories first (slug match),
      // so it picks up the user's customized labels. Fall back to the i18n
      // table for backwards-compat with any unseen string.
      if (row.category) {
        const slug = String(row.category).toLowerCase().replace(/[^a-z0-9]+/g, '_');
        if (byCode[slug]) return getTranslatedString(byCode[slug].name, language);
        return translateCategory(row.category, t) || row.category;
      }
      return '';
    };
    return { categories, byId, byCode, label };
  }, [categories, language, t]);
}

export interface UnitLookup {
  units: UnitOfMeasure[];
  byId: Record<string, UnitOfMeasure>;
  byCode: Record<string, UnitOfMeasure>;
  /** Resolve an inventory item (or any row with `unit_id` + legacy `unit`) to a display label. */
  label: (row: { unit_id?: string | null; unit?: string | null } | null | undefined) => string;
  /** Resolve to the symbol if available, otherwise the translated name. */
  shortLabel: (row: { unit_id?: string | null; unit?: string | null } | null | undefined) => string;
}

export function useUnitLookup(): UnitLookup {
  const { language } = useI18n();
  const { units } = useOfflineData();

  return useMemo(() => {
    const byId: Record<string, UnitOfMeasure> = {};
    const byCode: Record<string, UnitOfMeasure> = {};
    for (const u of units) {
      byId[u.id] = u;
      byCode[u.code] = u;
    }
    const resolve = (row: { unit_id?: string | null; unit?: string | null } | null | undefined): UnitOfMeasure | undefined => {
      if (!row) return undefined;
      if (row.unit_id && byId[row.unit_id]) return byId[row.unit_id];
      if (row.unit && byCode[row.unit]) return byCode[row.unit];
      return undefined;
    };
    return {
      units,
      byId,
      byCode,
      label: (row) => {
        const u = resolve(row);
        if (u) return getTranslatedString(u.name, language);
        return row?.unit ?? '';
      },
      shortLabel: (row) => {
        const u = resolve(row);
        if (u) return u.symbol || getTranslatedString(u.name, language);
        return row?.unit ?? '';
      },
    };
  }, [units, language]);
}
