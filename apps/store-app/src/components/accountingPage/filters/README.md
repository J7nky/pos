# Accounting Filter System

A comprehensive, reusable filter component system for all accounting tabs in the POS application.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Migration Guide](#migration-guide)
- [Customization](#customization)
- [Best Practices](#best-practices)

## 🎯 Overview

The Accounting Filter System provides a unified, type-safe, and highly configurable filtering solution for all accounting tabs. Instead of implementing filters separately for each tab, you can use this system to get:

- **Consistent UX** across all tabs
- **Less code** - no need to reimplement filters
- **Type safety** with full TypeScript support
- **Persistence** - filters automatically save to localStorage
- **Performance** - optimized with React hooks

## ✨ Features

### Core Features
- ✅ **Search** - Full-text search with customizable placeholder
- ✅ **Date Filters** - Date range with presets (today, week, month, quarter, year)
- ✅ **Dropdown Filters** - Product, Supplier, Customer, Category, Status, Type
- ✅ **Payment Filters** - Payment status, Payment method, Direction
- ✅ **Sorting** - Multi-field sorting with direction toggle
- ✅ **Pagination** - Built-in pagination support
- ✅ **Custom Filters** - Add your own filter types
- ✅ **Export** - Optional export button
- ✅ **Persistence** - Auto-save to localStorage
- ✅ **Collapsible** - Optional collapsible filter panel
- ✅ **RTL Support** - Full right-to-left language support
- ✅ **i18n** - Internationalization ready

### Tab-Specific Presets
- **RECEIVED_BILLS** - Product, Supplier, Status, Type filters with sorting
- **SOLD_BILLS** - Date range, Payment status, Status filters
- **PAYMENTS_MANAGEMENT** - Date range, Entity type, Direction filters
- **INVENTORY_LOGS** - Date presets, Product, Supplier filters
- **NON_PRICED_ITEMS** - Search and sorting only
- **PENDING_BILLS** - Product, Supplier, Status filters

## 🚀 Quick Start

### 1. Install (Already included in your project)

The filter system is located at:
```
src/components/accountingPage/filters/
├── AccountingFilter.tsx          # Main component
├── AccountingFilterTypes.ts      # Type definitions & presets
├── useAccountingFilter.ts        # React hook
├── index.ts                      # Exports
├── INTEGRATION_GUIDE.md          # Detailed integration guide
├── README.md                     # This file
└── examples/                     # Example implementations
    ├── ReceivedBillsExample.tsx
    └── SoldBillsExample.tsx
```

### 2. Basic Usage

```tsx
import { AccountingFilter, useAccountingFilter } from './filters';

function MyAccountingTab({ data, products, suppliers }) {
  // Use a preset configuration
  const {
    config,
    filterValues,
    handleFilterChange,
    processData,
    setPage,
  } = useAccountingFilter('RECEIVED_BILLS');

  // Process your data
  const { items, totalPages, currentPage } = processData(
    data,
    (item, filters) => {
      // Your filter logic
      if (filters.searchTerm && !item.name.includes(filters.searchTerm)) {
        return false;
      }
      if (filters.supplierId && item.supplierId !== filters.supplierId) {
        return false;
      }
      return true;
    }
  );

  return (
    <div>
      <AccountingFilter
        config={config}
        values={filterValues}
        onChange={handleFilterChange}
        products={products}
        suppliers={suppliers}
        statusOptions={config.statusOptions}
      />
      
      {items.map(item => <div key={item.id}>{item.name}</div>)}
      
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </div>
  );
}
```

## 🏗️ Architecture

### Components

#### `AccountingFilter`
The main UI component that renders all filter controls.

**Props:**
- `config` - Filter configuration object
- `values` - Current filter values
- `onChange` - Callback when filters change
- `products`, `suppliers`, `customers`, `categories` - Data for dropdowns
- `statusOptions`, `typeOptions`, etc. - Options for select inputs
- `onExport`, `onClear` - Optional action callbacks

#### `useAccountingFilter`
React hook that manages filter state and provides helper functions.

**Returns:**
- `config` - The filter configuration
- `filterValues` - Current filter values
- `handleFilterChange` - Function to update filters
- `processData` - Function to filter, sort, and paginate data
- `setPage` - Function to change page
- `resetFilters` - Function to reset all filters
- `applyFilters`, `applySort`, `applyPagination` - Individual processing functions

### Types

#### `FilterValues`
```typescript
interface FilterValues {
  searchTerm?: string;
  dateRange?: { start: string; end: string };
  datePreset?: 'all' | 'today' | 'week' | 'month' | 'quarter' | 'year';
  productId?: string;
  supplierId?: string;
  customerId?: string;
  status?: string;
  type?: string;
  sortField?: SortField;
  sortDirection?: 'asc' | 'desc';
  page?: number;
  // ... more fields
}
```

#### `BaseFilterConfig`
```typescript
interface BaseFilterConfig {
  enableSearch?: boolean;
  enableDateRange?: boolean;
  enableProductFilter?: boolean;
  enableSupplierFilter?: boolean;
  enableSorting?: boolean;
  sortFields?: SortField[];
  enablePagination?: boolean;
  itemsPerPage?: number;
  persistFilters?: boolean;
  storageKey?: string;
  // ... more options
}
```

## 📚 API Reference

### `useAccountingFilter(presetName?, customConfig?)`

#### Parameters
- `presetName` - Optional preset name from `FILTER_PRESETS`
- `customConfig` - Optional configuration overrides

#### Returns
```typescript
{
  config: BaseFilterConfig;
  filterValues: FilterValues;
  handleFilterChange: (event: FilterChangeEvent) => void;
  resetFilters: () => void;
  processData: <T>(
    items: T[],
    filterFn: (item: T, filters: FilterValues) => boolean,
    sortFn?: (a: T, b: T, field: string, dir: string) => number
  ) => {
    items: T[];
    totalItems: number;
    totalPages: number;
    currentPage: number;
    allFilteredItems: T[];
    allSortedItems: T[];
  };
  setPage: (page: number) => void;
  applyFilters: <T>(items: T[], filterFn) => T[];
  applySort: <T>(items: T[], sortFn?) => T[];
  applyPagination: <T>(items: T[]) => { items: T[]; totalPages: number };
}
```

### Available Presets

```typescript
FILTER_PRESETS = {
  RECEIVED_BILLS,
  SOLD_BILLS,
  PAYMENTS_MANAGEMENT,
  INVENTORY_LOGS,
  NON_PRICED_ITEMS,
  PENDING_BILLS,
}
```

## 💡 Examples

See the `/examples` folder for complete working examples:

- **ReceivedBillsExample.tsx** - Shows product/supplier filtering with status
- **SoldBillsExample.tsx** - Shows date range filtering with payment status

## 🔄 Migration Guide

### Before (Old Implementation)
```tsx
// Multiple state variables
const [searchTerm, setSearchTerm] = useLocalStorage('tab_search', '');
const [supplierFilter, setSupplierFilter] = useLocalStorage('tab_supplier', '');
const [productFilter, setProductFilter] = useLocalStorage('tab_product', '');
const [sortField, setSortField] = useLocalStorage('tab_sort', 'date');
const [page, setPage] = useLocalStorage('tab_page', 1);

// Manual filtering
const filtered = data.filter(item => {
  if (searchTerm && !item.name.includes(searchTerm)) return false;
  if (supplierFilter && item.supplierId !== supplierFilter) return false;
  return true;
});

// Manual sorting
const sorted = [...filtered].sort((a, b) => {
  // sorting logic
});

// Manual pagination
const paginated = sorted.slice((page - 1) * 10, page * 10);

// Complex filter UI
<div>
  <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
  <select value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)}>
    {/* options */}
  </select>
  {/* more filters */}
</div>
```

### After (New Implementation)
```tsx
// Single hook
const { config, filterValues, handleFilterChange, processData, setPage } = 
  useAccountingFilter('RECEIVED_BILLS');

// Automatic filtering, sorting, and pagination
const { items, totalPages, currentPage } = processData(
  data,
  (item, filters) => {
    if (filters.searchTerm && !item.name.includes(filters.searchTerm)) return false;
    if (filters.supplierId && item.supplierId !== filters.supplierId) return false;
    return true;
  }
);

// Simple filter UI
<AccountingFilter
  config={config}
  values={filterValues}
  onChange={handleFilterChange}
  suppliers={suppliers}
/>
```

### Migration Steps

1. **Remove old state variables**
   ```tsx
   // DELETE these lines
   const [searchTerm, setSearchTerm] = useLocalStorage(...);
   const [supplierFilter, setSupplierFilter] = useLocalStorage(...);
   // ... etc
   ```

2. **Add the new hook**
   ```tsx
   const { config, filterValues, handleFilterChange, processData, setPage } = 
     useAccountingFilter('YOUR_TAB_PRESET');
   ```

3. **Replace filter logic**
   ```tsx
   const { items, totalPages, currentPage } = processData(
     yourData,
     (item, filters) => {
       // Your filter logic here
       return true;
     }
   );
   ```

4. **Replace filter UI**
   ```tsx
   <AccountingFilter
     config={config}
     values={filterValues}
     onChange={handleFilterChange}
     products={products}
     suppliers={suppliers}
     // ... other props
   />
   ```

5. **Update pagination**
   ```tsx
   <Pagination
     currentPage={currentPage}
     totalPages={totalPages}
     onPageChange={setPage}
   />
   ```

## 🎨 Customization

### Custom Configuration

```tsx
const { config, filterValues, handleFilterChange } = useAccountingFilter(
  'RECEIVED_BILLS', // Start with preset
  {
    // Override specific options
    itemsPerPage: 25,
    enableCustomerFilter: true,
    customFilters: [
      {
        id: 'priority',
        label: 'Priority',
        type: 'select',
        options: [
          { value: 'high', label: 'High Priority' },
          { value: 'low', label: 'Low Priority' },
        ],
      },
    ],
  }
);
```

### Custom Sort Function

```tsx
const { items } = processData(
  data,
  filterFn,
  (a, b, sortField, sortDirection) => {
    if (sortField === 'customField') {
      // Your custom sorting logic
      return a.customField - b.customField;
    }
    return 0; // Default behavior
  }
);
```

### Custom Filter Logic

```tsx
const { items } = processData(
  data,
  (item, filters) => {
    // Complex filter logic
    if (filters.searchTerm) {
      const search = filters.searchTerm.toLowerCase();
      if (
        !item.name.toLowerCase().includes(search) &&
        !item.description.toLowerCase().includes(search) &&
        !item.tags.some(tag => tag.toLowerCase().includes(search))
      ) {
        return false;
      }
    }
    
    // Date range with custom logic
    if (filters.dateRange?.start) {
      const itemDate = new Date(item.createdAt);
      const startDate = new Date(filters.dateRange.start);
      if (itemDate < startDate) return false;
    }
    
    return true;
  }
);
```

## 📖 Best Practices

### 1. Use Presets When Possible
```tsx
// ✅ Good - Use preset
useAccountingFilter('RECEIVED_BILLS');

// ❌ Avoid - Reinventing the wheel
useAccountingFilter(undefined, { /* manual config */ });
```

### 2. Memoize Filter Functions
```tsx
// ✅ Good - Memoized
const filterFn = useCallback((item, filters) => {
  // filter logic
}, [dependencies]);

const { items } = processData(data, filterFn);
```

### 3. Keep Filter Logic Simple
```tsx
// ✅ Good - Simple and clear
(item, filters) => {
  if (filters.searchTerm && !item.name.includes(filters.searchTerm)) return false;
  if (filters.status && item.status !== filters.status) return false;
  return true;
}

// ❌ Avoid - Too complex
(item, filters) => {
  // 50 lines of complex logic
}
```

### 4. Use Type Safety
```tsx
import type { FilterValues, SortField } from './filters';

const filterFn = (item: MyItemType, filters: FilterValues): boolean => {
  // TypeScript will help you
};
```

### 5. Handle Edge Cases
```tsx
(item, filters) => {
  // Handle null/undefined
  const itemName = item.name?.toLowerCase() || '';
  const searchTerm = filters.searchTerm?.toLowerCase() || '';
  
  if (searchTerm && !itemName.includes(searchTerm)) {
    return false;
  }
  
  return true;
}
```

## 🐛 Troubleshooting

### Filters Not Persisting
**Problem:** Filters reset on page reload

**Solution:** Ensure `persistFilters: true` and unique `storageKey`
```tsx
useAccountingFilter('RECEIVED_BILLS', {
  persistFilters: true,
  storageKey: 'my_unique_key'
});
```

### Sorting Not Working
**Problem:** Sort buttons don't change order

**Solution:** Check your sort function returns a number
```tsx
(a, b, sortField, sortDirection) => {
  const aValue = a[sortField];
  const bValue = b[sortField];
  
  // ✅ Return number
  return aValue > bValue ? 1 : -1;
  
  // ❌ Don't return boolean
  // return aValue > bValue;
}
```

### Pagination Issues
**Problem:** Wrong items showing or pagination broken

**Solution:** Ensure you're using the returned `items`, not original data
```tsx
// ✅ Correct
const { items } = processData(data, filterFn);
return items.map(item => <div>{item.name}</div>);

// ❌ Wrong
const { items } = processData(data, filterFn);
return data.map(item => <div>{item.name}</div>); // Using original data!
```

### Date Filters Not Working
**Problem:** Date range filter not filtering correctly

**Solution:** Ensure proper date comparison with timezone handling
```tsx
(item, filters) => {
  if (filters.dateRange?.start) {
    const itemDate = new Date(item.date);
    const startDate = new Date(filters.dateRange.start);
    startDate.setHours(0, 0, 0, 0); // Start of day
    
    if (itemDate < startDate) return false;
  }
  return true;
}
```

## 📝 License

This is part of the POS application codebase.

## 🤝 Contributing

When adding new filter types or presets:
1. Add types to `AccountingFilterTypes.ts`
2. Update `AccountingFilter.tsx` component
3. Add preset to `FILTER_PRESETS`
4. Create example in `/examples`
5. Update this README

## 📞 Support

For questions or issues:
1. Check the examples in `/examples`
2. Read the `INTEGRATION_GUIDE.md`
3. Review existing tab implementations
4. Contact the development team
