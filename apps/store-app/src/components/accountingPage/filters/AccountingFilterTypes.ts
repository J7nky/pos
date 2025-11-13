/**
 * Comprehensive filter types for all accounting tabs
 * This file defines all possible filter configurations used across the accounting system
 */

export type DateRangePreset = 'all' | 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

export type SortDirection = 'asc' | 'desc';

export type SortField = 
  | 'date' 
  | 'product' 
  | 'supplier' 
  | 'customer'
  | 'amount' 
  | 'progress' 
  | 'revenue' 
  | 'status'
  | 'type'
  | 'category';

export interface DateRange {
  start: string;
  end: string;
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface BaseFilterConfig {
  // Search
  enableSearch?: boolean;
  searchPlaceholder?: string;
  
  // Date filters
  enableDateRange?: boolean;
  enableDatePresets?: boolean;
  datePresets?: DateRangePreset[];
  defaultDatePreset?: DateRangePreset;
  
  // Dropdowns
  enableProductFilter?: boolean;
  enableSupplierFilter?: boolean;
  enableCustomerFilter?: boolean;
  enableCategoryFilter?: boolean;
  enableStatusFilter?: boolean;
  enableTypeFilter?: boolean;
  enablePaymentStatusFilter?: boolean;
  enablePaymentMethodFilter?: boolean;
  enableDirectionFilter?: boolean;
  enableEntityTypeFilter?: boolean;
  
  // Custom filters
  customFilters?: CustomFilterConfig[];
  
  // Sorting
  enableSorting?: boolean;
  sortFields?: SortField[];
  defaultSortField?: SortField;
  defaultSortDirection?: SortDirection;
  
  // Pagination
  enablePagination?: boolean;
  itemsPerPage?: number;
  
  // UI
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  showClearButton?: boolean;
  showExportButton?: boolean;
  
  // Storage
  persistFilters?: boolean;
  storageKey?: string;
}

export interface CustomFilterConfig {
  id: string;
  label: string;
  type: 'select' | 'multiselect' | 'text' | 'number' | 'date' | 'checkbox';
  options?: FilterOption[];
  placeholder?: string;
  defaultValue?: any;
}

export interface FilterValues {
  // Search
  searchTerm?: string;
  
  // Date
  dateRange?: DateRange;
  datePreset?: DateRangePreset;
  
  // Dropdowns
  productId?: string;
  supplierId?: string;
  customerId?: string;
  categoryId?: string;
  status?: string;
  type?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  direction?: string;
  entityType?: string;
  entityId?: string;
  
  // Sorting
  sortField?: SortField;
  sortDirection?: SortDirection;
  
  // Pagination
  page?: number;
  
  // Custom filters
  [key: string]: any;
}

export interface FilterChangeEvent {
  filters: FilterValues;
  changedField?: string;
}

export interface AccountingFilterProps {
  config: BaseFilterConfig;
  values: FilterValues;
  onChange: (event: FilterChangeEvent) => void;
  
  // Data sources for dropdowns
  products?: Array<{ id: string; name: string }>;
  suppliers?: Array<{ id: string; name: string }>;
  customers?: Array<{ id: string; name: string }>;
  categories?: Array<{ id: string; name: string }>;
  
  // Custom options
  statusOptions?: FilterOption[];
  typeOptions?: FilterOption[];
  paymentStatusOptions?: FilterOption[];
  paymentMethodOptions?: FilterOption[];
  
  // Actions
  onExport?: () => void;
  onClear?: () => void;
  
  // UI customization
  className?: string;
}

// Preset configurations for different tabs
export const FILTER_PRESETS = {
  RECEIVED_BILLS: {
    enableSearch: true,
    searchPlaceholder: 'receivedBills.searchPlaceholder',
    enableDatePresets: false,
    enableProductFilter: true,
    enableSupplierFilter: true,
    enableStatusFilter: true,
    enableTypeFilter: true,
    statusOptions: [
      { value: 'all', label: 'receivedBills.allStatuses' },
      { value: 'pending', label: 'receivedBills.statusPending' },
      { value: 'in-progress', label: 'receivedBills.statusInprogress' },
      { value: 'halfway', label: 'receivedBills.statusHalfway' },
      { value: 'nearly-complete', label: 'receivedBills.statusNearlycomplete' },
      { value: 'completed', label: 'receivedBills.statusCompleted' },
      { value: 'closed', label: 'receivedBills.statusClosed' },
    ],
    typeOptions: [
      { value: 'all', label: 'receivedBills.allTypes' },
      { value: 'commission', label: 'receivedBills.typeCommission' },
      { value: 'purchase', label: 'receivedBills.typePurchase' },
      { value: 'mixed', label: 'receivedBills.typeMixed' },
    ],
    enableSorting: true,
    sortFields: ['date', 'supplier', 'product', 'amount', 'progress', 'revenue', 'status'] as SortField[],
    defaultSortField: 'date' as SortField,
    defaultSortDirection: 'desc' as SortDirection,
    enablePagination: true,
    itemsPerPage: 10,
    collapsible: false,
    showClearButton: true,
    showExportButton: true,
    persistFilters: true,
    storageKey: 'accounting_receivedBills',
  } as BaseFilterConfig,
  
  SOLD_BILLS: {
    enableSearch: true,
    searchPlaceholder: 'soldBills.searchPlaceholder',
    enableDateRange: true,
    enableDatePresets: true,
    datePresets: ['all', 'today', 'week', 'month'] as DateRangePreset[],
    defaultDatePreset: 'today' as DateRangePreset,
    enablePaymentStatusFilter: true,
    enableStatusFilter: true,
    paymentStatusOptions: [
      { value: '', label: 'soldBills.allPaymentStatuses' },
      { value: 'paid', label: 'soldBills.paid' },
      { value: 'partial', label: 'soldBills.partial' },
      { value: 'pending', label: 'soldBills.pending' },
    ],
    statusOptions: [
      { value: '', label: 'soldBills.allStatuses' },
      { value: 'active', label: 'soldBills.active' },
      { value: 'cancelled', label: 'soldBills.cancelled' },
      { value: 'refunded', label: 'soldBills.refunded' },
    ],
    enableSorting: true,
    enablePagination: true,
    itemsPerPage: 20,
    collapsible: true,
    defaultCollapsed: false,
    showClearButton: true,
    persistFilters: true,
    storageKey: 'soldBills',
  } as BaseFilterConfig,
  
  PAYMENTS_MANAGEMENT: {
    enableSearch: true,
    searchPlaceholder: 'payments.searchPlaceholder',
    enableDateRange: true,
    enableDatePresets: true,
    datePresets: ['all', 'today', 'week', 'month'] as DateRangePreset[],
    defaultDatePreset: 'today' as DateRangePreset,
    enableEntityTypeFilter: true,
    enableDirectionFilter: true,
    enableSorting: true,
    sortFields: ['date', 'amount', 'category'] as SortField[],
    defaultSortField: 'date' as SortField,
    defaultSortDirection: 'desc' as SortDirection,
    enablePagination: true,
    itemsPerPage: 20,
    collapsible: true,
    showClearButton: true,
    persistFilters: true,
    storageKey: 'paymentsManagement',
  } as BaseFilterConfig,
  
  INVENTORY_LOGS: {
    enableSearch: true,
    searchPlaceholder: 'accounting.searchInventoryLogs',
    enableDatePresets: true,
    datePresets: ['all', 'today', 'week', 'month'] as DateRangePreset[],
    defaultDatePreset: 'all' as DateRangePreset,
    enableProductFilter: true,
    enableSupplierFilter: true,
    enableSorting: true,
    sortFields: ['date', 'product', 'supplier', 'amount'] as SortField[],
    defaultSortField: 'date' as SortField,
    defaultSortDirection: 'desc' as SortDirection,
    enablePagination: true,
    itemsPerPage: 20,
    collapsible: false,
    showClearButton: true,
    showExportButton: true,
    persistFilters: true,
    storageKey: 'accounting_inventoryLogs',
  } as BaseFilterConfig,
  
  NON_PRICED_ITEMS: {
    enableSearch: true,
    searchPlaceholder: 'accounting.searchNonPricedItems',
    enableSorting: true,
    sortFields: ['customer', 'product', 'date', 'amount'] as SortField[],
    defaultSortField: 'date' as SortField,
    defaultSortDirection: 'desc' as SortDirection,
    enablePagination: true,
    itemsPerPage: 10,
    collapsible: false,
    showClearButton: true,
    showExportButton: true,
    persistFilters: true,
    storageKey: 'accounting_nonPriced',
  } as BaseFilterConfig,
  
  PENDING_BILLS: {
    enableSearch: true,
    searchPlaceholder: 'accounting.searchPendingBills',
    enableProductFilter: true,
    enableSupplierFilter: true,
    enableStatusFilter: true,
    statusOptions: [
      { value: 'all', label: 'accounting.allStatuses' },
      { value: 'pending', label: 'accounting.statusPending' },
      { value: 'in-progress', label: 'accounting.statusInProgress' },
      { value: 'halfway', label: 'accounting.statusHalfway' },
      { value: 'nearly-complete', label: 'accounting.statusNearlyComplete' },
      { value: 'completed', label: 'accounting.statusCompleted' },
    ],
    enableSorting: true,
    sortFields: ['date', 'supplier', 'product', 'amount', 'progress', 'revenue', 'status'] as SortField[],
    defaultSortField: 'date' as SortField,
    defaultSortDirection: 'desc' as SortDirection,
    enablePagination: true,
    itemsPerPage: 10,
    collapsible: false,
    showClearButton: true,
    persistFilters: true,
    storageKey: 'accounting_pendingBills',
  } as BaseFilterConfig,
};
