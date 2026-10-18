/**
 * Audit Log page — branch activity timeline.
 *
 * Filtering is one instrument: the always-on date window reads out in the bar
 * (preset name over the resolved start → end), every other active constraint
 * shows as a chip that drops on its own, and the expandable panel holds the
 * full controls — a segmented preset track, an action selector built from the
 * same AUDIT_ACTION_BADGE palette the rows wear, and the who/what selects.
 * Row visibility is role-scoped at the data layer (getAuditLogs): admin → whole
 * store, manager → own branch, cashier → own actions; the user filter is hidden
 * for cashiers since their view is already pinned to themselves.
 *
 * The loaded window is presented as a table above a summary stat strip and a
 * client-side search, with per-entity iconography and the field-level diff shown
 * inline per row. Styling follows the app's shared language (white cards, gray
 * borders, blue accent, system fonts).
 */

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity, ArrowLeft, ArrowRight, Banknote, Boxes, Building2, Calendar, ChevronDown,
  ChevronUp, Eye, FileText, Filter, Hash, KeyRound, Layers, LogIn, Package,
  Pencil, ReceiptText, RotateCcw, Scale, ScrollText, Search, Settings2, Tags,
  Trash2, UserCog, Users, Wallet, X,
} from 'lucide-react';
import { useI18n } from '../i18n';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import type { AuditLogWithUser } from '../contexts/offlineData';
import type { AuditAction } from '../types';
import { getLocalDateString, getTodayLocalDate } from '../utils/dateUtils';
import { AuditChanges } from '../components/audit/AuditChanges';
import { AUDIT_ACTION_BADGE } from '../components/audit/EntityAuditHistory';

const PAGE_SIZE = 100;

const ACTIONS: AuditAction[] = [
  'create', 'update', 'delete', 'void', 'reactivate', 'archive', 'unarchive', 'open', 'close',
  'login', 'logout',
];

const ENTITY_TYPES = [
  'entity', 'product', 'user', 'branch', 'bill', 'payment', 'cash_drawer_session',
  'inventory_item', 'inventory_batch', 'product_category', 'unit_of_measure',
  'store_settings', 'user_permission', 'auth',
];

/** Per-entity-type glyphs so each row is scannable at a glance. */
const ENTITY_ICON: Record<string, LucideIcon> = {
  entity: Users, product: Package, user: UserCog, branch: Building2,
  bill: ReceiptText, payment: Banknote, cash_drawer_session: Wallet,
  inventory_item: Boxes, inventory_batch: Layers, product_category: Tags,
  unit_of_measure: Scale, store_settings: Settings2, user_permission: KeyRound,
  auth: LogIn,
};

/**
 * Dot colors for the unselected action chips — the solid counterpart of each
 * pastel row badge in AUDIT_ACTION_BADGE. Unselected chips stay neutral so the
 * filter never becomes a wall of color; the dot is the only hint of the badge
 * the chip will produce in the table.
 */
const ACTION_DOT: Record<string, string> = {
  create: 'bg-green-500', update: 'bg-blue-500', delete: 'bg-red-500', void: 'bg-red-500',
  reactivate: 'bg-green-500', archive: 'bg-gray-400', unarchive: 'bg-gray-400',
  open: 'bg-emerald-500', close: 'bg-amber-500', login: 'bg-indigo-500', logout: 'bg-slate-400',
};

const DATE_PRESETS = ['today', 'week', 'mtd', 'month', 'year'] as const;
type DatePreset = (typeof DATE_PRESETS)[number];

/** Resolve a preset to a concrete window. Shared by the buttons and the active-preset readout. */
function presetRange(preset: DatePreset): { startDate: string; endDate: string } {
  const today = new Date();
  const start = new Date(today);
  switch (preset) {
    case 'today': break;
    case 'week': start.setDate(today.getDate() - 6); break;
    case 'mtd': start.setDate(1); break;
    case 'month': start.setDate(today.getDate() - 29); break;
    case 'year': start.setMonth(0, 1); break;
  }
  return {
    startDate: getLocalDateString(start.toISOString()),
    endDate: getLocalDateString(today.toISOString()),
  };
}

export default function AuditLog() {
  const { t, language } = useI18n();
  const isRTL = language === 'ar';
  const locale = isRTL ? 'ar' : 'en-US';
  const { userProfile } = useSupabaseAuth();
  const { getAuditLogs, employees } = useOfflineData();

  const role = userProfile?.role;
  const isCashier = role === 'cashier';
  const isManager = role === 'manager';

  const [dateRange, setDateRange] = useState(() => {
    const start = new Date();
    start.setDate(1);
    return { startDate: getLocalDateString(start.toISOString()), endDate: getTodayLocalDate() };
  });
  const [entityType, setEntityType] = useState<string>('all');
  const [action, setAction] = useState<string>('all');
  const [changedBy, setChangedBy] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const [logs, setLogs] = useState<AuditLogWithUser[]>([]);
  const [loading, setLoading] = useState(true);

  // User dropdown: admins see all store employees; managers see only their branch.
  const userOptions = useMemo(() => {
    const list = isManager
      ? employees.filter((e) => (e as { branch_id?: string | null }).branch_id === userProfile?.branch_id)
      : employees;
    return list
      .map((e) => ({ id: e.id, name: (e as { name?: string }).name ?? e.id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employees, isManager, userProfile?.branch_id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAuditLogs({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      entityType,
      action: action as AuditAction | 'all',
      changedBy,
      limit,
    })
      .then((rows) => {
        if (!cancelled) setLogs(rows);
      })
      .catch((err) => {
        console.error('Failed to load audit logs:', err);
        if (!cancelled) setLogs([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [getAuditLogs, dateRange.startDate, dateRange.endDate, entityType, action, changedBy, limit]);

  const applyDatePreset = (preset: DatePreset) => {
    setLimit(PAGE_SIZE);
    setDateRange(presetRange(preset));
  };

  /** Which preset (if any) the current window matches — drives the segmented control. */
  const activePreset = useMemo(
    () =>
      DATE_PRESETS.find((p) => {
        const r = presetRange(p);
        return r.startDate === dateRange.startDate && r.endDate === dateRange.endDate;
      }) ?? null,
    [dateRange.startDate, dateRange.endDate],
  );

  const resetFilters = () => {
    const start = new Date();
    start.setDate(1);
    setDateRange({ startDate: getLocalDateString(start.toISOString()), endDate: getTodayLocalDate() });
    setEntityType('all');
    setAction('all');
    setChangedBy('all');
    setSearch('');
    setLimit(PAGE_SIZE);
  };

  /** Every filter change re-opens the window at page one. */
  const setFilter = (apply: () => void) => {
    setLimit(PAGE_SIZE);
    apply();
  };

  // The date window is always on, so it is read out in the bar rather than hidden
  // in the panel: preset name (or "custom") over the resolved start → end dates.
  const formatWindowDate = (date: string, withYear: boolean) => {
    const parsed = new Date(`${date}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return '—'; // a native date input can be cleared
    return parsed.toLocaleDateString(locale, {
      month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}),
    });
  };

  const WindowArrow = isRTL ? ArrowLeft : ArrowRight;

  // Active constraints, each removable on its own — no all-or-nothing reset.
  const chips: { key: string; label: string; value: string; clear: () => void }[] = [];
  if (changedBy !== 'all') {
    chips.push({
      key: 'user',
      label: t('auditLog.user'),
      value: userOptions.find((u) => u.id === changedBy)?.name ?? changedBy,
      clear: () => setFilter(() => setChangedBy('all')),
    });
  }
  if (action !== 'all') {
    chips.push({
      key: 'action',
      label: t('auditLog.action'),
      value: t(`auditLog.actions.${action}`),
      clear: () => setFilter(() => setAction('all')),
    });
  }
  if (entityType !== 'all') {
    chips.push({
      key: 'entity',
      label: t('auditLog.entityType'),
      value: t(`auditLog.entityTypes.${entityType}`),
      clear: () => setFilter(() => setEntityType('all')),
    });
  }
  if (search.trim()) {
    chips.push({
      key: 'search',
      label: t('auditLog.view.searchLabel'),
      value: search.trim(),
      clear: () => setSearch(''),
    });
  }

  const SelectedEntityIcon = ENTITY_ICON[entityType] ?? Layers;

  // Client-side search over the loaded window (actor, record type, action, changes).
  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((log) => {
      const haystack = [
        log.changed_by_name,
        t(`auditLog.entityTypes.${log.entity_type}`),
        t(`auditLog.actions.${log.action}`),
        log.change_reason ?? '',
        log.reference ?? '',
        log.entity_id,
        JSON.stringify(log.changes ?? []),
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [logs, search, t]);

  // Summary stats for the loaded (and searched) window.
  const stats = useMemo(() => {
    const people = new Set<string>();
    let updates = 0;
    let removals = 0;
    for (const log of filteredLogs) {
      people.add(log.changed_by);
      if (log.action === 'update') updates++;
      if (log.action === 'delete' || log.action === 'void') removals++;
    }
    return { events: filteredLogs.length, people: people.size, updates, removals };
  }, [filteredLogs]);

  const formatDateTime = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });

  const scopeNotice = isCashier
    ? t('auditLog.scope.cashier')
    : isManager
      ? t('auditLog.scope.manager')
      : t('auditLog.scope.admin');

  const statCards: { label: string; value: number; icon: LucideIcon; tint: string }[] = [
    { label: t('auditLog.view.events'), value: stats.events, icon: Activity, tint: 'bg-blue-50 text-blue-600' },
    { label: t('auditLog.view.people'), value: stats.people, icon: Users, tint: 'bg-purple-50 text-purple-600' },
    { label: t('auditLog.view.updates'), value: stats.updates, icon: Pencil, tint: 'bg-amber-50 text-amber-600' },
    { label: t('auditLog.view.removals'), value: stats.removals, icon: Trash2, tint: 'bg-red-50 text-red-600' },
  ];

  return (
    <div className="p-6 stagger" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div className="flex items-center">
          <ScrollText className="w-6 h-6 mr-2 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('auditLog.title')}</h1>
            <p className="text-sm text-gray-500">{t('auditLog.subtitle')}</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 border border-blue-100 px-3 py-1.5 text-xs font-medium text-blue-700">
          <Eye className="w-3.5 h-3.5" />
          {scopeNotice}
        </span>
      </div>

      {/* ── Stat strip ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-5">
        {statCards.map(({ label, value, icon: Icon, tint }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3.5 flex items-center gap-3">
            <div className={`rounded-lg p-2 ${tint}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-2xl font-bold leading-none text-gray-900 tabular-nums">{value}</div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500 mt-1 truncate">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filter bar ──────────────────────────────────────────────────
          One instrument, three stacked registers: the always-on date window and
          search; the removable chips for whatever else is narrowing the view;
          and the expandable panel holding the full controls. */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-5">
        <div className="flex items-center gap-3 flex-wrap p-3">
          {/* Date window — reads out the one filter that is never off, and opens the panel. */}
          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            aria-expanded={showFilters}
            aria-controls="audit-filter-panel"
            className="inline-flex items-center gap-2.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-start transition-colors hover:border-blue-300 hover:bg-blue-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Calendar className="w-4 h-4 shrink-0 text-blue-600" />
            <span className="flex flex-col leading-tight">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                {activePreset ? t(`auditLog.preset.${activePreset}`) : t('auditLog.preset.custom')}
              </span>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 tabular-nums">
                {formatWindowDate(dateRange.startDate, false)}
                <WindowArrow className="w-3 h-3 text-gray-300" />
                {formatWindowDate(dateRange.endDate, true)}
              </span>
            </span>
          </button>

          <div className="relative flex-1 min-w-[14rem]">
            <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('auditLog.view.search')}
              aria-label={t('auditLog.view.searchLabel')}
              className="w-full rounded-lg border border-gray-200 bg-white ps-9 pe-3 py-2.5 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            aria-expanded={showFilters}
            aria-controls="audit-filter-panel"
            className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
              showFilters
                ? 'border-blue-300 bg-blue-50 text-blue-700'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            {t('auditLog.filters')}
            {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Applied constraints — each one drops on its own. */}
        {chips.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap border-t border-gray-100 bg-gray-50/70 px-3 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              {t('auditLog.view.filteredBy')}
            </span>
            {chips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white py-1 ps-2.5 pe-1 text-xs text-gray-700 shadow-sm"
              >
                <span className="text-gray-400">{chip.label}</span>
                <span className="font-medium max-w-[12rem] truncate">{chip.value}</span>
                <button
                  type="button"
                  onClick={chip.clear}
                  aria-label={t('auditLog.view.removeFilter', { label: chip.label })}
                  className="rounded-full p-0.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-200/60 hover:text-gray-700"
            >
              <RotateCcw className="w-3 h-3" />
              {t('auditLog.clearFilters')}
            </button>
          </div>
        )}

        {/* Panel — collapses by height so the open/close reads as one motion. */}
        <div
          id="audit-filter-panel"
          className={`grid transition-all duration-200 ease-out ${
            showFilters ? 'grid-rows-[1fr]' : 'grid-rows-[0fr] invisible'
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="divide-y divide-gray-100 border-t border-gray-100">
              {/* When */}
              <section className="p-4">
                <FieldLabel>{t('auditLog.columns.time')}</FieldLabel>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="max-w-full overflow-x-auto">
                    <div className="inline-flex rounded-lg bg-gray-100 p-1">
                      {DATE_PRESETS.map((key) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => applyDatePreset(key)}
                          aria-pressed={activePreset === key}
                          className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                            activePreset === key
                              ? 'bg-white text-blue-700 shadow-sm'
                              : 'text-gray-600 hover:text-gray-900'
                          }`}
                        >
                          {t(`auditLog.preset.${key}`)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500">
                    <input
                      type="date"
                      value={dateRange.startDate}
                      aria-label={t('auditLog.startDate')}
                      onChange={(e) => setFilter(() => setDateRange((p) => ({ ...p, startDate: e.target.value })))}
                      className="bg-transparent px-3 py-2 text-sm tabular-nums focus:outline-none"
                    />
                    <WindowArrow className="w-3.5 h-3.5 shrink-0 text-gray-300" />
                    <input
                      type="date"
                      value={dateRange.endDate}
                      aria-label={t('auditLog.endDate')}
                      onChange={(e) => setFilter(() => setDateRange((p) => ({ ...p, endDate: e.target.value })))}
                      className="bg-transparent px-3 py-2 text-sm tabular-nums focus:outline-none"
                    />
                  </div>
                </div>
              </section>

              {/* Action — the same badges the rows wear, so the filter previews its own result. */}
              <section className="p-4">
                <FieldLabel>{t('auditLog.action')}</FieldLabel>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFilter(() => setAction('all'))}
                    aria-pressed={action === 'all'}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      action === 'all'
                        ? 'border-gray-300 bg-gray-100 text-gray-900'
                        : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {t('auditLog.all')}
                  </button>
                  {ACTIONS.map((a) => {
                    const selected = action === a;
                    return (
                      <button
                        key={a}
                        type="button"
                        onClick={() => setFilter(() => setAction(selected ? 'all' : a))}
                        aria-pressed={selected}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                          selected
                            ? `${AUDIT_ACTION_BADGE[a] ?? 'bg-gray-100 text-gray-700'} border-transparent shadow-sm ring-1 ring-inset ring-black/5`
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            selected ? 'bg-current opacity-50' : ACTION_DOT[a] ?? 'bg-gray-300'
                          }`}
                        />
                        {t(`auditLog.actions.${a}`)}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Who and what */}
              <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4">
                {!isCashier && (
                  <div>
                    <FieldLabel>{t('auditLog.user')}</FieldLabel>
                    <AdornedSelect
                      icon={Users}
                      value={changedBy}
                      onChange={(v) => setFilter(() => setChangedBy(v))}
                      label={t('auditLog.user')}
                    >
                      <option value="all">{t('auditLog.allUsers')}</option>
                      {userOptions.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </AdornedSelect>
                  </div>
                )}
                <div>
                  <FieldLabel>{t('auditLog.entityType')}</FieldLabel>
                  <AdornedSelect
                    icon={SelectedEntityIcon}
                    value={entityType}
                    onChange={(v) => setFilter(() => setEntityType(v))}
                    label={t('auditLog.entityType')}
                  >
                    <option value="all">{t('auditLog.all')}</option>
                    {ENTITY_TYPES.map((et) => (
                      <option key={et} value={et}>{t(`auditLog.entityTypes.${et}`)}</option>
                    ))}
                  </AdornedSelect>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>

      {/* ── Results table ───────────────────────────────────────────── */}
      {loading ? (
        <TableSkeleton />
      ) : filteredLogs.length === 0 ? (
        <EmptyState
          icon={search.trim() ? Search : ScrollText}
          title={search.trim() ? t('auditLog.view.noMatch') : t('auditLog.noLogs')}
          hint={t('auditLog.view.emptyHint')}
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-start font-semibold px-4 py-3 whitespace-nowrap">{t('auditLog.columns.time')}</th>
                  <th className="text-start font-semibold px-4 py-3 whitespace-nowrap">{t('auditLog.columns.user')}</th>
                  <th className="text-start font-semibold px-4 py-3 whitespace-nowrap">{t('auditLog.columns.action')}</th>
                  <th className="text-start font-semibold px-4 py-3 whitespace-nowrap">{t('auditLog.columns.entity')}</th>
                  <th className="text-start font-semibold px-4 py-3 whitespace-nowrap">{t('auditLog.columns.reference')}</th>
                  <th className="text-start font-semibold px-4 py-3">{t('auditLog.columns.details')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredLogs.map((log) => {
                  const EntityIcon = ENTITY_ICON[log.entity_type] ?? FileText;
                  return (
                    <tr key={log.id} className="align-top hover:bg-gray-50/60">
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500 text-xs tabular-nums">{formatDateTime(log.created_at)}</td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-800">{log.changed_by_name}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 text-xs rounded font-medium ${AUDIT_ACTION_BADGE[log.action] ?? 'bg-gray-100 text-gray-700'}`}>
                          {t(`auditLog.actions.${log.action}`)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                        <span className="inline-flex items-center gap-1.5">
                          <EntityIcon className="w-3.5 h-3.5 text-gray-400" />
                          {t(`auditLog.entityTypes.${log.entity_type}`)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {log.reference ? (
                          <button
                            type="button"
                            onClick={() => setSearch(log.reference!)}
                            title={t('auditLog.view.referenceHint')}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 font-mono text-xs text-gray-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                          >
                            <Hash className="w-3 h-3 text-gray-400" />
                            {log.reference}
                          </button>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        <AuditChanges changes={log.changes} reason={log.change_reason} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer: count + load more */}
          <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
            <span className="tabular-nums">{t('auditLog.showingCount', { count: filteredLogs.length })}</span>
            {!search.trim() && logs.length >= limit && (
              <button
                onClick={() => setLimit((l) => l + PAGE_SIZE)}
                className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 font-medium border border-blue-200"
              >
                {t('auditLog.loadMore')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Section eyebrow inside the filter panel. The controls below carry the glyphs. */
function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
      {children}
    </div>
  );
}

/** Native select carrying the same glyph vocabulary as the table rows. */
function AdornedSelect({
  icon: Icon, value, onChange, label, children,
}: {
  icon: LucideIcon;
  value: string;
  onChange: (value: string) => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <Icon className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-gray-400 pointer-events-none" />
      <select
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg border border-gray-200 bg-white ps-9 pe-9 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
      >
        {children}
      </select>
      <ChevronDown className="absolute top-1/2 -translate-y-1/2 end-3 w-4 h-4 text-gray-400 pointer-events-none" />
    </div>
  );
}

/** Shimmer placeholder rows while the first page loads. */
function TableSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden animate-pulse">
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-100">
        <div className="h-3.5 w-40 rounded bg-gray-200" />
      </div>
      <div className="divide-y divide-gray-100">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <div className="h-3 w-28 rounded bg-gray-200" />
            <div className="h-3.5 w-28 rounded bg-gray-200" />
            <div className="h-4 w-16 rounded bg-gray-200" />
            <div className="h-3.5 w-24 rounded bg-gray-200" />
            <div className="h-4 w-20 rounded bg-gray-200" />
            <div className="h-3 w-1/4 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Crafted empty / no-match state. */
function EmptyState({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-16 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gray-100 text-gray-400">
        <Icon className="w-7 h-7" />
      </div>
      <p className="text-lg font-semibold text-gray-700">{title}</p>
      <p className="mt-1 text-sm text-gray-400">{hint}</p>
    </div>
  );
}
