/**
 * Accounting Filter System
 * 
 * A comprehensive, reusable filter component system for all accounting tabs.
 * Supports search, date ranges, dropdowns, sorting, pagination, and custom filters.
 * 
 * @example Basic usage with preset
 * ```tsx
 * import { AccountingFilter, useAccountingFilter, FILTER_PRESETS } from './filters';
 * 
 * function ReceivedBillsTab() {
 *   const {
 *     config,
 *     filterValues,
 *     handleFilterChange,
 *     processData,
 *     setPage
 *   } = useAccountingFilter('RECEIVED_BILLS');
 * 
 *   const { items, totalPages, currentPage } = processData(
 *     bills,
 *     (bill, filters) => {
 *       // Custom filter logic
 *       if (filters.searchTerm && !bill.name.includes(filters.searchTerm)) return false;
 *       if (filters.supplierId && bill.supplierId !== filters.supplierId) return false;
 *       return true;
 *     }
 *   );
 * 
 *   return (
 *     <div>
 *       <AccountingFilter
 *         config={config}
 *         values={filterValues}
 *         onChange={handleFilterChange}
 *         products={products}
 *         suppliers={suppliers}
 *         statusOptions={config.statusOptions}
 *         typeOptions={config.typeOptions}
 *       />
 *       {items.map(item => <div key={item.id}>{item.name}</div>)}
 *       <Pagination
 *         currentPage={currentPage}
 *         totalPages={totalPages}
 *         onPageChange={setPage}
 *       />
 *     </div>
 *   );
 * }
 * ```
 * 
 * @example Custom configuration
 * ```tsx
 * const { config, filterValues, handleFilterChange } = useAccountingFilter(undefined, {
 *   enableSearch: true,
 *   enableProductFilter: true,
 *   enableSupplierFilter: true,
 *   enableDateRange: true,
 *   enableSorting: true,
 *   sortFields: ['date', 'amount'],
 *   persistFilters: true,
 *   storageKey: 'my_custom_filter'
 * });
 * ```
 */

export { AccountingFilter } from './AccountingFilter';
export { useAccountingFilter } from './useAccountingFilter';
export { FILTER_PRESETS } from './AccountingFilterTypes';
export type {
  AccountingFilterProps,
  BaseFilterConfig,
  FilterValues,
  FilterChangeEvent,
  FilterOption,
  CustomFilterConfig,
  DateRange,
  DateRangePreset,
  SortField,
  SortDirection,
} from './AccountingFilterTypes';
