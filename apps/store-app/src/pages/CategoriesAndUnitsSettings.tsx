/**
 * Settings page for configurable product categories and units of measure
 * (v64). Replaces the previously hardcoded TypeScript literal unions. Store
 * owners can add/edit/disable their own taxonomy; rows seeded from the
 * tenant_type template are marked `is_system` and can be deactivated but not
 * deleted while products/inventory still reference them.
 */

import React, { useState } from 'react';
import { useI18n } from '../i18n';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { getTranslatedString } from '../utils/multilingual';
import type { MultilingualString } from '../utils/multilingual';
import type { UnitSystemRole, ProductCategory, UnitOfMeasure } from '../types/taxonomy';
import { Plus, Pencil, Trash2, X } from 'lucide-react';

type Tab = 'categories' | 'units';

const SYSTEM_ROLES: UnitSystemRole[] = ['mass', 'count', 'volume', 'length', 'pack'];

const CategoriesAndUnitsSettings: React.FC = () => {
  const { t, language } = useI18n();
  const {
    categories,
    units,
    createCategory,
    updateCategory,
    deleteCategory,
    createUnit,
    updateUnit,
    deleteUnit,
  } = useOfflineData();

  const [tab, setTab] = useState<Tab>('categories');
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null);
  const [editingUnit, setEditingUnit] = useState<UnitOfMeasure | null>(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showUnitForm, setShowUnitForm] = useState(false);

  const sortedCategories = categories.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const sortedUnits = units.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  return (
    <div className="p-6 max-w-5xl mx-auto stagger">
      <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-slate-100">
        {t('settings.categoriesAndUnits') || 'Categories & Units'}
      </h1>
      <p className="text-sm text-gray-600 dark:text-slate-300 mb-6">
        {t('settings.categoriesAndUnitsDescription')
          || 'Configure the product categories and units of measure your store uses. These are seeded from your tenant type and can be customized.'}
      </p>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-slate-800 mb-6">
        <button
          onClick={() => setTab('categories')}
          className={`px-4 py-2 -mb-px border-b-2 transition-colors ${
            tab === 'categories'
              ? 'border-blue-600 text-blue-700 dark:text-blue-300'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {t('inventory.category') || 'Categories'} ({categories.length})
        </button>
        <button
          onClick={() => setTab('units')}
          className={`px-4 py-2 -mb-px border-b-2 transition-colors ${
            tab === 'units'
              ? 'border-blue-600 text-blue-700 dark:text-blue-300'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {t('common.labels.units') || 'Units'} ({units.length})
        </button>
      </div>

      {tab === 'categories' && (
        <div>
          <div className="flex justify-end mb-3">
            <button
              onClick={() => { setEditingCategory(null); setShowCategoryForm(true); }}
              className="inline-flex items-center px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Plus className="w-4 h-4 mr-1" />
              {t('common.labels.add') || 'Add'}
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-800">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider">{t('common.labels.name') || 'Name'}</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider">Code</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider">{t('common.labels.status') || 'Status'}</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider">{t('common.labels.actions') || 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                {sortedCategories.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-slate-800">
                    <td className="px-4 py-2">{getTranslatedString(c.name, language)}</td>
                    <td className="px-4 py-2 text-sm text-gray-500">{c.code}{c.is_system && <span className="ml-2 text-xs text-amber-600">(system)</span>}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-1 text-xs rounded-full ${c.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                        {c.is_active ? (t('common.active') || 'Active') : (t('common.labels.inactive') || 'Inactive')}
                      </span>
                    </td>
                    <td className="px-4 py-2 flex gap-2">
                      <button
                        onClick={() => { setEditingCategory(c); setShowCategoryForm(true); }}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {!c.is_system && (
                        <button
                          onClick={async () => {
                            try {
                              await deleteCategory(c.id);
                            } catch (err) {
                              alert(err instanceof Error ? err.message : 'Failed to delete category');
                            }
                          }}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {sortedCategories.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">{t('inventory.noProducts') || 'No categories yet.'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'units' && (
        <div>
          <div className="flex justify-end mb-3">
            <button
              onClick={() => { setEditingUnit(null); setShowUnitForm(true); }}
              className="inline-flex items-center px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Plus className="w-4 h-4 mr-1" />
              {t('common.labels.add') || 'Add'}
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-800">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider">{t('common.labels.name') || 'Name'}</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider">Code</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider">Role</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider">{t('common.labels.status') || 'Status'}</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider">{t('common.labels.actions') || 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                {sortedUnits.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-slate-800">
                    <td className="px-4 py-2">{getTranslatedString(u.name, language)}{u.symbol ? <span className="ml-2 text-xs text-gray-500">({u.symbol})</span> : null}</td>
                    <td className="px-4 py-2 text-sm text-gray-500">{u.code}{u.is_system && <span className="ml-2 text-xs text-amber-600">(system)</span>}</td>
                    <td className="px-4 py-2 text-sm text-gray-500">{u.system_role || '—'}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-1 text-xs rounded-full ${u.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                        {u.is_active ? (t('common.active') || 'Active') : (t('common.labels.inactive') || 'Inactive')}
                      </span>
                    </td>
                    <td className="px-4 py-2 flex gap-2">
                      <button
                        onClick={() => { setEditingUnit(u); setShowUnitForm(true); }}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {!u.is_system && (
                        <button
                          onClick={async () => {
                            try {
                              await deleteUnit(u.id);
                            } catch (err) {
                              alert(err instanceof Error ? err.message : 'Failed to delete unit');
                            }
                          }}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {sortedUnits.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">{t('inventory.noProducts') || 'No units yet.'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCategoryForm && (
        <CategoryFormModal
          existing={editingCategory}
          onClose={() => { setShowCategoryForm(false); setEditingCategory(null); }}
          onSave={async (input) => {
            if (editingCategory) {
              await updateCategory(editingCategory.id, input);
            } else {
              await createCategory(input);
            }
            setShowCategoryForm(false);
            setEditingCategory(null);
          }}
        />
      )}

      {showUnitForm && (
        <UnitFormModal
          existing={editingUnit}
          onClose={() => { setShowUnitForm(false); setEditingUnit(null); }}
          onSave={async (input) => {
            if (editingUnit) {
              await updateUnit(editingUnit.id, input);
            } else {
              await createUnit(input);
            }
            setShowUnitForm(false);
            setEditingUnit(null);
          }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface CategoryFormInput {
  name: MultilingualString;
  code?: string;
  sort_order: number;
  is_active: boolean;
}

const CategoryFormModal: React.FC<{
  existing: ProductCategory | null;
  onClose: () => void;
  onSave: (input: CategoryFormInput) => Promise<void>;
}> = ({ existing, onClose, onSave }) => {
  const seed: Record<'en' | 'ar' | 'fr', string> = existing?.name
    ? (typeof existing.name === 'string'
        ? { en: existing.name, ar: existing.name, fr: existing.name }
        : { en: '', ar: '', fr: '', ...(existing.name as Record<'en' | 'ar' | 'fr', string>) })
    : { en: '', ar: '', fr: '' };
  const [name, setName] = useState<Record<'en' | 'ar' | 'fr', string>>(seed);
  const [sortOrder, setSortOrder] = useState<number>(existing?.sort_order ?? 100);
  const [isActive, setIsActive] = useState<boolean>(existing?.is_active ?? true);
  const [code, setCode] = useState<string>(existing?.code ?? '');
  const [saving, setSaving] = useState(false);

  return (
    <div className="animate-modal-fade fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="animate-modal-pop bg-white dark:bg-slate-900 rounded-lg max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">{existing ? 'Edit category' : 'Add category'}</h2>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <MultilingualInput label="English" value={name.en} onChange={(v) => setName({ ...name, en: v })} />
          <MultilingualInput label="Arabic" value={name.ar} onChange={(v) => setName({ ...name, ar: v })} dir="rtl" />
          <MultilingualInput label="French" value={name.fr} onChange={(v) => setName({ ...name, fr: v })} />
          {!existing && (
            <div>
              <label className="block text-sm mb-1">Code (optional — auto-generated from English name)</label>
              <input value={code} onChange={(e) => setCode(e.target.value)} className="w-full border rounded px-3 py-2 dark:bg-slate-800" />
            </div>
          )}
          <div>
            <label className="block text-sm mb-1">Sort order</label>
            <input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} className="w-full border rounded px-3 py-2 dark:bg-slate-800" />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            <span>Active</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 border rounded">Cancel</button>
          <button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave({ name, code: code || undefined, sort_order: sortOrder, is_active: isActive });
              } catch (err) {
                alert(err instanceof Error ? err.message : 'Failed to save');
              } finally {
                setSaving(false);
              }
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

interface UnitFormInput {
  name: MultilingualString;
  code?: string;
  symbol?: string | null;
  system_role?: UnitSystemRole | null;
  sort_order: number;
  is_active: boolean;
}

const UnitFormModal: React.FC<{
  existing: UnitOfMeasure | null;
  onClose: () => void;
  onSave: (input: UnitFormInput) => Promise<void>;
}> = ({ existing, onClose, onSave }) => {
  const seed: Record<'en' | 'ar' | 'fr', string> = existing?.name
    ? (typeof existing.name === 'string'
        ? { en: existing.name, ar: existing.name, fr: existing.name }
        : { en: '', ar: '', fr: '', ...(existing.name as Record<'en' | 'ar' | 'fr', string>) })
    : { en: '', ar: '', fr: '' };
  const [name, setName] = useState<Record<'en' | 'ar' | 'fr', string>>(seed);
  const [code, setCode] = useState<string>(existing?.code ?? '');
  const [symbol, setSymbol] = useState<string>(existing?.symbol ?? '');
  const [systemRole, setSystemRole] = useState<UnitSystemRole | ''>(existing?.system_role ?? '');
  const [sortOrder, setSortOrder] = useState<number>(existing?.sort_order ?? 100);
  const [isActive, setIsActive] = useState<boolean>(existing?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  return (
    <div className="animate-modal-fade fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="animate-modal-pop bg-white dark:bg-slate-900 rounded-lg max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">{existing ? 'Edit unit' : 'Add unit'}</h2>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <MultilingualInput label="English" value={name.en} onChange={(v) => setName({ ...name, en: v })} />
          <MultilingualInput label="Arabic" value={name.ar} onChange={(v) => setName({ ...name, ar: v })} dir="rtl" />
          <MultilingualInput label="French" value={name.fr} onChange={(v) => setName({ ...name, fr: v })} />
          {!existing && (
            <div>
              <label className="block text-sm mb-1">Code (optional)</label>
              <input value={code} onChange={(e) => setCode(e.target.value)} className="w-full border rounded px-3 py-2 dark:bg-slate-800" />
            </div>
          )}
          <div>
            <label className="block text-sm mb-1">Symbol (e.g. kg, pc)</label>
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)} className="w-full border rounded px-3 py-2 dark:bg-slate-800" />
          </div>
          <div>
            <label className="block text-sm mb-1">System role</label>
            <select value={systemRole} onChange={(e) => setSystemRole(e.target.value as UnitSystemRole | '')} className="w-full border rounded px-3 py-2 dark:bg-slate-800">
              <option value="">—</option>
              {SYSTEM_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">Sort order</label>
            <input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} className="w-full border rounded px-3 py-2 dark:bg-slate-800" />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            <span>Active</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 border rounded">Cancel</button>
          <button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave({
                  name,
                  code: code || undefined,
                  symbol: symbol || null,
                  system_role: systemRole || null,
                  sort_order: sortOrder,
                  is_active: isActive,
                });
              } catch (err) {
                alert(err instanceof Error ? err.message : 'Failed to save');
              } finally {
                setSaving(false);
              }
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

const MultilingualInput: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  dir?: 'ltr' | 'rtl';
}> = ({ label, value, onChange, dir }) => (
  <div>
    <label className="block text-sm mb-1">{label}</label>
    <input
      dir={dir}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border rounded px-3 py-2 dark:bg-slate-800"
    />
  </div>
);

export default CategoriesAndUnitsSettings;
