import { useState, useCallback, useMemo } from 'react';
import { useLocalStorage } from '../../../hooks/useLocalStorage';
import {
  BaseFilterConfig,
  FilterValues,
  FilterChangeEvent,
  FILTER_PRESETS,
} from './AccountingFilterTypes';

/**
 * Hook to manage filter state and logic for accounting tabs
 * Provides a clean API for filtering, sorting, and pagination
 */
export const useAccountingFilter = (
  presetName?: keyof typeof FILTER_PRESETS,
  customConfig?: Partial<BaseFilterConfig>
) => {
  // Get preset configuration or use custom
  const config: BaseFilterConfig = useMemo(() => {
    const preset = presetName ? FILTER_PRESETS[presetName] : {};
    return { ...preset, ...customConfig } as BaseFilterConfig;
  }, [presetName, customConfig]);

  // Initialize filter values
  const getInitialValues = (): FilterValues => ({
    searchTerm: '',
    dateRange: { start: '', end: '' },
    datePreset: config.defaultDatePreset || 'all',
    productId: '',
    supplierId: '',
    customerId: '',
    categoryId: '',
    status: '',
    type: '',
    paymentStatus: '',
    paymentMethod: '',
    direction: '',
    entityType: '',
    entityId: '',
    sortField: config.defaultSortField,
    sortDirection: config.defaultSortDirection,
    page: 1,
  });

  // Use localStorage if persistence is enabled
  const [filterValues, setFilterValues] = config.persistFilters
    ? useLocalStorage<FilterValues>(config.storageKey || 'accounting_filter', getInitialValues())
    : useState<FilterValues>(getInitialValues());

  // Handle filter changes
  const handleFilterChange = useCallback(
    (event: FilterChangeEvent) => {
      setFilterValues(event.filters);
    },
    [setFilterValues]
  );

  // Reset filters to initial state
  const resetFilters = useCallback(() => {
    setFilterValues(getInitialValues());
  }, [setFilterValues]);

  // Filter function for arrays
  const applyFilters = useCallback(
    <T extends Record<string, any>>(
      items: T[],
      filterFn: (item: T, filters: FilterValues) => boolean
    ): T[] => {
      return items.filter((item) => filterFn(item, filterValues));
    },
    [filterValues]
  );

  // Sort function for arrays
  const applySort = useCallback(
    <T extends Record<string, any>>(
      items: T[],
      sortFn?: (a: T, b: T, sortField: string, sortDirection: string) => number
    ): T[] => {
      if (!filterValues.sortField || !filterValues.sortDirection) {
        return items;
      }

      return [...items].sort((a, b) => {
        if (sortFn) {
          return sortFn(a, b, filterValues.sortField!, filterValues.sortDirection!);
        }

        // Default sorting logic
        const aValue = a[filterValues.sortField!];
        const bValue = b[filterValues.sortField!];

        if (aValue === bValue) return 0;

        const comparison = aValue > bValue ? 1 : -1;
        return filterValues.sortDirection === 'asc' ? comparison : -comparison;
      });
    },
    [filterValues]
  );

  // Pagination function
  const applyPagination = useCallback(
    <T>(items: T[]): { items: T[]; totalPages: number; currentPage: number } => {
      const itemsPerPage = config.itemsPerPage || 10;
      const currentPage = filterValues.page || 1;
      const totalPages = Math.ceil(items.length / itemsPerPage);

      const startIndex = (currentPage - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      const paginatedItems = items.slice(startIndex, endIndex);

      return {
        items: paginatedItems,
        totalPages,
        currentPage,
      };
    },
    [config.itemsPerPage, filterValues.page]
  );

  // Change page
  const setPage = useCallback(
    (page: number) => {
      setFilterValues({ ...filterValues, page });
    },
    [filterValues, setFilterValues]
  );

  // Complete filter, sort, and paginate pipeline
  const processData = useCallback(
    <T extends Record<string, any>>(
      items: T[],
      filterFn: (item: T, filters: FilterValues) => boolean,
      sortFn?: (a: T, b: T, sortField: string, sortDirection: string) => number
    ) => {
      const filtered = applyFilters(items, filterFn);
      const sorted = applySort(filtered, sortFn);
      const paginated = config.enablePagination ? applyPagination(sorted) : { items: sorted, totalPages: 1, currentPage: 1 };

      return {
        items: paginated.items,
        totalItems: filtered.length,
        totalPages: paginated.totalPages,
        currentPage: paginated.currentPage,
        allFilteredItems: filtered,
        allSortedItems: sorted,
      };
    },
    [applyFilters, applySort, applyPagination, config.enablePagination]
  );

  return {
    config,
    filterValues,
    handleFilterChange,
    resetFilters,
    applyFilters,
    applySort,
    applyPagination,
    setPage,
    processData,
  };
};

export default useAccountingFilter;
