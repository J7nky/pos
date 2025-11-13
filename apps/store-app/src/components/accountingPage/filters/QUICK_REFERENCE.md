# Accounting Filter - Quick Reference Card

## 🚀 Quick Start (Copy & Paste)

### Basic Setup
```tsx
import { AccountingFilter, useAccountingFilter } from './filters';

const { config, filterValues, handleFilterChange, processData, setPage } = 
  useAccountingFilter('RECEIVED_BILLS');

const { items, totalPages, currentPage } = processData(
  yourData,
  (item, filters) => {
    if (filters.searchTerm && !item.name.includes(filters.searchTerm)) return false;
    if (filters.supplierId && item.supplierId !== filters.supplierId) return false;
    return true;
  }
);

return (
  <>
    <AccountingFilter
      config={config}
      values={filterValues}
      onChange={handleFilterChange}
      products={products}
      suppliers={suppliers}
    />
    {items.map(item => <div key={item.id}>{item.name}</div>)}
    <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setPage} />
  </>
);
```

## 📋 Available Presets

| Preset | Use For | Key Features |
|--------|---------|--------------|
| `RECEIVED_BILLS` | Received Bills tab | Search, Product, Supplier, Status, Type, 7-field sort |
| `SOLD_BILLS` | Sold Bills tab | Search, Date Range, Payment Status, Collapsible |
| `PAYMENTS_MANAGEMENT` | Payments tab | Search, Date Range, Entity Type, Direction |
| `INVENTORY_LOGS` | Inventory Logs tab | Search, Date Presets, Product, Supplier |
| `NON_PRICED_ITEMS` | Non-Priced Items tab | Search, 4-field sort |
| `PENDING_BILLS` | Pending Bills tab | Search, Product, Supplier, Status |

## 🎯 Common Patterns

### Pattern 1: Search Only
```tsx
const { config, filterValues, handleFilterChange, processData } = 
  useAccountingFilter('NON_PRICED_ITEMS');

const { items } = processData(data, (item, filters) => {
  if (filters.searchTerm) {
    const search = filters.searchTerm.toLowerCase();
    return item.name.toLowerCase().includes(search);
  }
  return true;
});
```

### Pattern 2: Date Range
```tsx
const { config, filterValues, handleFilterChange, processData } = 
  useAccountingFilter('SOLD_BILLS');

const { items } = processData(data, (item, filters) => {
  if (filters.dateRange?.start) {
    const itemDate = new Date(item.date);
    const startDate = new Date(filters.dateRange.start);
    if (itemDate < startDate) return false;
  }
  if (filters.dateRange?.end) {
    const endDate = new Date(filters.dateRange.end);
    if (itemDate > endDate) return false;
  }
  return true;
});
```

### Pattern 3: Multiple Dropdowns
```tsx
const { config, filterValues, handleFilterChange, processData } = 
  useAccountingFilter('RECEIVED_BILLS');

const { items } = processData(data, (item, filters) => {
  if (filters.productId && item.productId !== filters.productId) return false;
  if (filters.supplierId && item.supplierId !== filters.supplierId) return false;
  if (filters.status && filters.status !== 'all' && item.status !== filters.status) return false;
  return true;
});
```

### Pattern 4: Custom Sort
```tsx
const { items } = processData(
  data,
  filterFn,
  (a, b, sortField, sortDirection) => {
    let aValue, bValue;
    switch (sortField) {
      case 'date':
        aValue = new Date(a.date).getTime();
        bValue = new Date(b.date).getTime();
        break;
      case 'amount':
        aValue = a.amount;
        bValue = b.amount;
        break;
      default:
        return 0;
    }
    return sortDirection === 'asc' ? (aValue > bValue ? 1 : -1) : (aValue < bValue ? 1 : -1);
  }
);
```

## 🔧 Customization Snippets

### Override Preset
```tsx
useAccountingFilter('RECEIVED_BILLS', {
  itemsPerPage: 25,
  enableCustomerFilter: true,
});
```

### Add Custom Filter
```tsx
useAccountingFilter('RECEIVED_BILLS', {
  customFilters: [
    {
      id: 'priority',
      label: 'Priority',
      type: 'select',
      options: [
        { value: 'high', label: 'High' },
        { value: 'low', label: 'Low' },
      ],
    },
  ],
});
```

### Custom Config (No Preset)
```tsx
useAccountingFilter(undefined, {
  enableSearch: true,
  enableProductFilter: true,
  enableSorting: true,
  sortFields: ['date', 'amount'],
  persistFilters: true,
  storageKey: 'my_filter',
});
```

## 📦 Props Reference

### AccountingFilter Component

```tsx
<AccountingFilter
  config={config}                    // Required: Filter configuration
  values={filterValues}              // Required: Current filter values
  onChange={handleFilterChange}      // Required: Change handler
  
  // Data sources (optional, based on config)
  products={products}                // For product filter
  suppliers={suppliers}              // For supplier filter
  customers={customers}              // For customer filter
  categories={categories}            // For category filter
  
  // Options (optional, based on config)
  statusOptions={config.statusOptions}
  typeOptions={config.typeOptions}
  paymentStatusOptions={config.paymentStatusOptions}
  
  // Actions (optional)
  onExport={() => exportData()}      // Export button handler
  onClear={() => customClear()}      // Custom clear handler
  
  // Styling (optional)
  className="mb-6"                   // Additional CSS classes
/>
```

## 🎨 Filter Values Structure

```typescript
filterValues = {
  // Search
  searchTerm: string,
  
  // Date
  dateRange: { start: string, end: string },
  datePreset: 'all' | 'today' | 'week' | 'month',
  
  // Dropdowns
  productId: string,
  supplierId: string,
  customerId: string,
  categoryId: string,
  status: string,
  type: string,
  
  // Payment
  paymentStatus: string,
  paymentMethod: string,
  direction: string,
  entityType: string,
  entityId: string,
  
  // Sorting
  sortField: string,
  sortDirection: 'asc' | 'desc',
  
  // Pagination
  page: number,
}
```

## 🔍 Filter Function Examples

### Simple Text Search
```tsx
(item, filters) => {
  if (!filters.searchTerm) return true;
  const search = filters.searchTerm.toLowerCase();
  return item.name.toLowerCase().includes(search);
}
```

### Multiple Field Search
```tsx
(item, filters) => {
  if (!filters.searchTerm) return true;
  const search = filters.searchTerm.toLowerCase();
  return (
    item.name.toLowerCase().includes(search) ||
    item.description.toLowerCase().includes(search) ||
    item.code.toLowerCase().includes(search)
  );
}
```

### Dropdown Filter
```tsx
(item, filters) => {
  if (filters.supplierId && item.supplierId !== filters.supplierId) {
    return false;
  }
  return true;
}
```

### Status Filter (with 'all' option)
```tsx
(item, filters) => {
  if (filters.status && filters.status !== 'all') {
    return item.status === filters.status;
  }
  return true;
}
```

### Date Range Filter
```tsx
(item, filters) => {
  const itemDate = new Date(item.date);
  
  if (filters.dateRange?.start) {
    const start = new Date(filters.dateRange.start);
    start.setHours(0, 0, 0, 0);
    if (itemDate < start) return false;
  }
  
  if (filters.dateRange?.end) {
    const end = new Date(filters.dateRange.end);
    end.setHours(23, 59, 59, 999);
    if (itemDate > end) return false;
  }
  
  return true;
}
```

### Combined Filters
```tsx
(item, filters) => {
  // Search
  if (filters.searchTerm) {
    const search = filters.searchTerm.toLowerCase();
    if (!item.name.toLowerCase().includes(search)) return false;
  }
  
  // Dropdown
  if (filters.supplierId && item.supplierId !== filters.supplierId) {
    return false;
  }
  
  // Status
  if (filters.status && filters.status !== 'all' && item.status !== filters.status) {
    return false;
  }
  
  return true;
}
```

## 🐛 Common Issues & Fixes

### Issue: Filters not persisting
```tsx
// ✅ Fix: Ensure persistFilters is true
useAccountingFilter('RECEIVED_BILLS', {
  persistFilters: true,
  storageKey: 'unique_key'
});
```

### Issue: Sort not working
```tsx
// ✅ Fix: Return a number, not boolean
(a, b, field, dir) => {
  const aVal = a[field];
  const bVal = b[field];
  return dir === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
}
```

### Issue: Wrong items displayed
```tsx
// ❌ Wrong: Using original data
const { items } = processData(data, filterFn);
return data.map(item => <div>{item.name}</div>);

// ✅ Correct: Using filtered items
const { items } = processData(data, filterFn);
return items.map(item => <div>{item.name}</div>);
```

### Issue: Pagination broken
```tsx
// ✅ Fix: Use setPage from hook
const { setPage } = useAccountingFilter('RECEIVED_BILLS');

<Pagination
  currentPage={currentPage}
  totalPages={totalPages}
  onPageChange={setPage}  // Not setPage(value)
/>
```

## 📚 Where to Learn More

- **Full API**: `README.md`
- **Integration Steps**: `INTEGRATION_GUIDE.md`
- **Complete Examples**: `examples/ReceivedBillsExample.tsx`
- **Overview**: `IMPLEMENTATION_SUMMARY.md`

## 💡 Pro Tips

1. **Start with a preset** - Don't build from scratch
2. **Memoize filter functions** - Use `useCallback` if it depends on props
3. **Keep filter logic simple** - Complex logic belongs in data preparation
4. **Use TypeScript** - Import types for better IDE support
5. **Test edge cases** - Empty states, no results, all filters applied

## 🎯 Checklist for Integration

- [ ] Import `AccountingFilter` and `useAccountingFilter`
- [ ] Choose appropriate preset
- [ ] Remove old filter state variables
- [ ] Implement filter function
- [ ] Add `<AccountingFilter>` component
- [ ] Update pagination to use `setPage`
- [ ] Test all filter combinations
- [ ] Test persistence (reload page)
- [ ] Test sorting
- [ ] Test pagination

---

**Quick Reference v1.0** | For detailed docs see README.md
