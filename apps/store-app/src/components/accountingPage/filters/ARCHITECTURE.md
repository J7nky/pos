# Accounting Filter System - Architecture

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Your Tab Component                        │
│  (ReceivedBills, SoldBills, PaymentsManagement, etc.)          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ uses
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    useAccountingFilter Hook                      │
│                                                                  │
│  ┌────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ Filter State   │  │ Filter Logic    │  │ Persistence     │ │
│  │ Management     │  │ (filter/sort)   │  │ (localStorage)  │ │
│  └────────────────┘  └─────────────────┘  └─────────────────┘ │
│                                                                  │
│  Returns: { config, filterValues, processData, setPage, ... }  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ provides data to
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   AccountingFilter Component                     │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  Search  │  │   Date   │  │ Dropdowns│  │  Sorting │       │
│  │   Box    │  │  Range   │  │ (Product,│  │  Buttons │       │
│  │          │  │  Presets │  │ Supplier)│  │          │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│                                                                  │
│  Emits: onChange({ filters, changedField })                    │
└─────────────────────────────────────────────────────────────────┘
```

## 📦 Component Hierarchy

```
AccountingFilter (UI Component)
├── Search Input
├── Date Range Inputs
│   ├── Start Date
│   └── End Date
├── Date Preset Buttons
│   ├── All
│   ├── Today
│   ├── Week
│   ├── Month
│   ├── Quarter
│   └── Year
├── Dropdown Filters
│   ├── Product Filter
│   ├── Supplier Filter
│   ├── Customer Filter
│   ├── Category Filter
│   ├── Status Filter
│   ├── Type Filter
│   ├── Payment Status Filter
│   └── Payment Method Filter
├── Sorting Controls
│   └── Sort Buttons (per field)
├── Action Buttons
│   ├── Export Button (optional)
│   ├── Clear Filters Button
│   └── Collapse Toggle (optional)
└── Custom Filters (extensible)
```

## 🔄 Data Flow

```
┌──────────────┐
│  User Input  │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────┐
│  AccountingFilter Component  │
│  - Captures user input       │
│  - Updates local state       │
└──────┬───────────────────────┘
       │
       │ onChange({ filters, changedField })
       ▼
┌──────────────────────────────┐
│  useAccountingFilter Hook    │
│  - Updates filterValues      │
│  - Saves to localStorage     │
└──────┬───────────────────────┘
       │
       │ filterValues
       ▼
┌──────────────────────────────┐
│  processData Function        │
│  1. Apply filters            │
│  2. Apply sorting            │
│  3. Apply pagination         │
└──────┬───────────────────────┘
       │
       │ { items, totalPages, currentPage }
       ▼
┌──────────────────────────────┐
│  Tab Component               │
│  - Renders filtered items    │
│  - Shows pagination          │
└──────────────────────────────┘
```

## 🎯 Filter Processing Pipeline

```
Raw Data
   │
   ▼
┌─────────────────────┐
│  1. Filter Phase    │
│  - Search           │
│  - Date range       │
│  - Dropdowns        │
│  - Custom filters   │
└──────┬──────────────┘
       │ Filtered Data
       ▼
┌─────────────────────┐
│  2. Sort Phase      │
│  - By selected field│
│  - Asc/Desc         │
└──────┬──────────────┘
       │ Sorted Data
       ▼
┌─────────────────────┐
│  3. Pagination      │
│  - Slice by page    │
│  - Calculate pages  │
└──────┬──────────────┘
       │ Final Items
       ▼
Display to User
```

## 🗂️ File Structure

```
src/components/accountingPage/filters/
│
├── Core Files
│   ├── AccountingFilter.tsx           # Main UI component (550 lines)
│   ├── AccountingFilterTypes.ts       # Types & presets (340 lines)
│   ├── useAccountingFilter.ts         # React hook (150 lines)
│   └── index.ts                       # Exports
│
├── Documentation
│   ├── README.md                      # Full API reference (400+ lines)
│   ├── INTEGRATION_GUIDE.md           # Step-by-step guide (350+ lines)
│   ├── IMPLEMENTATION_SUMMARY.md      # Overview (300+ lines)
│   ├── QUICK_REFERENCE.md             # Quick reference (200+ lines)
│   └── ARCHITECTURE.md                # This file
│
└── Examples
    ├── ReceivedBillsExample.tsx       # Complete example (250 lines)
    └── SoldBillsExample.tsx           # Complete example (300 lines)
```

## 🔌 Integration Points

### 1. Tab Component
```tsx
// Your existing tab component
function ReceivedBillsTab(props) {
  // Add this hook
  const { config, filterValues, handleFilterChange, processData } = 
    useAccountingFilter('RECEIVED_BILLS');
  
  // Your existing data processing
  const bills = useMemo(() => {
    // ... your logic
  }, [dependencies]);
  
  // Apply filters
  const { items } = processData(bills, filterFn);
  
  // Render with filter component
  return (
    <>
      <AccountingFilter {...filterProps} />
      {items.map(item => <Item key={item.id} {...item} />)}
    </>
  );
}
```

### 2. Data Layer
```tsx
// Your data comes from context/props
const { products, suppliers, customers } = useOfflineData();

// Pass to filter component
<AccountingFilter
  products={products}
  suppliers={suppliers}
  customers={customers}
/>
```

### 3. Storage Layer
```tsx
// Automatic localStorage integration
useAccountingFilter('RECEIVED_BILLS', {
  persistFilters: true,           // Enable persistence
  storageKey: 'receivedBills'     // Unique key
});

// Stored as:
// localStorage['receivedBills'] = {
//   searchTerm: '...',
//   supplierId: '...',
//   sortField: 'date',
//   page: 1
// }
```

## 🎨 State Management

### Filter State Structure
```typescript
{
  // User inputs
  searchTerm: string,
  dateRange: { start: string, end: string },
  productId: string,
  supplierId: string,
  status: string,
  
  // System state
  sortField: 'date' | 'product' | 'supplier' | ...,
  sortDirection: 'asc' | 'desc',
  page: number,
  
  // Computed (in hook)
  datePreset: 'today' | 'week' | 'month' | ...,
}
```

### State Updates
```typescript
// User changes filter
onChange({ 
  filters: { ...filterValues, supplierId: 'new-id' },
  changedField: 'supplierId'
})

// Hook updates state
setFilterValues(newFilters)

// If persistence enabled
localStorage.setItem(storageKey, JSON.stringify(newFilters))

// Component re-renders with new filters
processData(data, filterFn) // Returns new filtered items
```

## 🔧 Extensibility Points

### 1. Custom Filter Types
```typescript
// Add to config
customFilters: [
  {
    id: 'priority',
    label: 'Priority',
    type: 'select',
    options: [...]
  }
]

// Access in filter function
(item, filters) => {
  if (filters.priority && item.priority !== filters.priority) {
    return false;
  }
  return true;
}
```

### 2. Custom Sort Logic
```typescript
// Provide custom sort function
processData(
  data,
  filterFn,
  (a, b, sortField, sortDirection) => {
    // Your custom sorting logic
    if (sortField === 'customField') {
      return customCompare(a, b);
    }
    return 0; // Default behavior
  }
)
```

### 3. New Presets
```typescript
// Add to FILTER_PRESETS in AccountingFilterTypes.ts
export const FILTER_PRESETS = {
  // ... existing presets
  MY_NEW_TAB: {
    enableSearch: true,
    enableProductFilter: true,
    sortFields: ['date', 'amount'],
    // ... more config
  } as BaseFilterConfig,
};
```

## 🚀 Performance Optimizations

### 1. Memoization
```typescript
// In useAccountingFilter hook
const processData = useCallback((items, filterFn, sortFn) => {
  // Processing logic
}, [filterValues, config]);

// In component
const filterFn = useCallback((item, filters) => {
  // Filter logic
}, [dependencies]);
```

### 2. Lazy Evaluation
```typescript
// Only process when needed
const { items } = processData(data, filterFn);
// Not: const items = processData(...).items

// Pagination slices data
const paginated = sorted.slice(startIndex, endIndex);
// Not: const paginated = sorted (all items)
```

### 3. LocalStorage Batching
```typescript
// Updates batched by React
setFilterValues(newValues); // Triggers single localStorage write
// Not: multiple localStorage.setItem calls
```

## 🔒 Type Safety

### Type Flow
```
User Input (string)
    ↓
FilterValues (typed object)
    ↓
processData<T> (generic)
    ↓
Filtered Items (T[])
```

### Type Checking
```typescript
// Compile-time checks
const { filterValues } = useAccountingFilter('RECEIVED_BILLS');
filterValues.searchTerm // ✅ string
filterValues.invalidField // ❌ TypeScript error

// Runtime checks
if (filters.supplierId && typeof filters.supplierId === 'string') {
  // Safe to use
}
```

## 📊 Preset Configurations

```
RECEIVED_BILLS
├── Search: ✅
├── Date Range: ❌
├── Date Presets: ❌
├── Product Filter: ✅
├── Supplier Filter: ✅
├── Status Filter: ✅ (6 options)
├── Type Filter: ✅ (3 options)
├── Sorting: ✅ (7 fields)
├── Pagination: ✅ (10/page)
├── Export: ✅
└── Persistence: ✅

SOLD_BILLS
├── Search: ✅
├── Date Range: ✅
├── Date Presets: ✅ (4 presets)
├── Payment Status: ✅ (3 options)
├── Status Filter: ✅ (3 options)
├── Sorting: ✅ (3 fields)
├── Pagination: ✅ (20/page)
├── Collapsible: ✅
└── Persistence: ✅

PAYMENTS_MANAGEMENT
├── Search: ✅
├── Date Range: ✅
├── Date Presets: ✅ (4 presets)
├── Entity Type: ✅
├── Direction: ✅
├── Sorting: ✅ (3 fields)
├── Pagination: ✅ (20/page)
├── Collapsible: ✅
└── Persistence: ✅

INVENTORY_LOGS
├── Search: ✅
├── Date Presets: ✅ (4 presets)
├── Product Filter: ✅
├── Supplier Filter: ✅
├── Sorting: ✅ (4 fields)
├── Pagination: ✅ (20/page)
├── Export: ✅
└── Persistence: ✅

NON_PRICED_ITEMS
├── Search: ✅
├── Sorting: ✅ (4 fields)
├── Pagination: ✅ (10/page)
├── Export: ✅
└── Persistence: ✅

PENDING_BILLS
├── Search: ✅
├── Product Filter: ✅
├── Supplier Filter: ✅
├── Status Filter: ✅ (5 options)
├── Sorting: ✅ (7 fields)
├── Pagination: ✅ (10/page)
└── Persistence: ✅
```

## 🎯 Design Principles

1. **Single Responsibility** - Each component has one job
2. **Composition** - Build complex filters from simple parts
3. **Configuration over Code** - Use presets, not custom implementations
4. **Type Safety** - TypeScript everywhere
5. **Performance** - Memoization and lazy evaluation
6. **Extensibility** - Easy to add new filter types
7. **Consistency** - Same API across all tabs
8. **Persistence** - Remember user preferences
9. **Accessibility** - Keyboard navigation, screen readers
10. **Documentation** - Comprehensive guides and examples

## 🔄 Lifecycle

```
Component Mount
    ↓
Load from localStorage (if enabled)
    ↓
Initialize filter values
    ↓
Render AccountingFilter component
    ↓
User interacts with filters
    ↓
onChange event fired
    ↓
Update filter values
    ↓
Save to localStorage (if enabled)
    ↓
Re-render with new filters
    ↓
processData runs
    ↓
Display updated results
    ↓
Component Unmount
    ↓
Cleanup (if needed)
```

## 📈 Scalability

### Adding New Tabs
1. Create preset in `FILTER_PRESETS`
2. Use `useAccountingFilter('NEW_TAB')`
3. Implement filter function
4. Done! (~50 lines of code)

### Adding New Filter Types
1. Add to `BaseFilterConfig` interface
2. Add UI in `AccountingFilter` component
3. Update presets as needed
4. Document in README

### Adding New Sort Fields
1. Add to `SortField` type
2. Add to preset's `sortFields` array
3. Implement in custom sort function
4. Done!

---

**Architecture v1.0** | See README.md for API details
