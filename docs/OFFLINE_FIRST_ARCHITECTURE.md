# Offline-First Architecture Pattern

## Overview

This document describes the strict offline-first architecture pattern that ALL services and data models in this project must follow. This pattern ensures single source of truth, improved performance, and optimized logic.

## Architecture Flow

```
Supabase → syncService.ts → IndexedDB → offlineDataContext.ts → UI Components
```

### Key Principles

1. **All CRUD operations happen on local IndexedDB first**
2. **Data syncs to Supabase via syncService.ts**
3. **UI components only interact with offlineDataContext.ts**
4. **No direct Supabase calls from components or most services**

## Component Architecture

### ✅ Correct Pattern

```typescript
// Component Example
import { useOfflineData } from '../contexts/OfflineDataContext';

export function ProductList() {
  const { products, addProduct, updateProduct } = useOfflineData();
  
  const handleAddProduct = async (productData) => {
    // This will save to IndexedDB and mark for sync
    await addProduct(productData);
  };
  
  return (
    <div>
      {products.map(product => (
        <div key={product.id}>{product.name}</div>
      ))}
    </div>
  );
}
```

### ❌ Incorrect Pattern

```typescript
// DON'T DO THIS
import { supabase } from '../lib/supabase';

export function ProductList() {
  const [products, setProducts] = useState([]);
  
  const handleAddProduct = async (productData) => {
    // This bypasses offline-first architecture
    const { data } = await supabase.from('products').insert(productData);
    setProducts([...products, data]);
  };
  
  // ... rest of component
}
```

## Service Architecture

### ✅ Correct Pattern

```typescript
// Service Example
import { db } from '../lib/db';

export class ProductService {
  async addProduct(storeId: string, productData: any) {
    // Save to IndexedDB with sync metadata
    const product = {
      ...productData,
      id: generateId(),
      store_id: storeId,
      created_at: new Date().toISOString(),
      _synced: false // Mark as needing sync
    };
    
    await db.products.add(product);
    return product;
  }
  
  async getProducts(storeId: string) {
    // Read from IndexedDB
    return await db.products.where('store_id').equals(storeId).toArray();
  }
}
```

### ❌ Incorrect Pattern

```typescript
// DON'T DO THIS
import { supabase } from '../lib/supabase';

export class ProductService {
  async addProduct(productData: any) {
    // This bypasses offline-first architecture
    const { data } = await supabase.from('products').insert(productData);
    return data;
  }
}
```

## Data Flow Layers

### 1. UI Layer (Components)
- **Role**: Present data and handle user interactions
- **Data Source**: `offlineDataContext.ts` only
- **Operations**: Call context methods (addProduct, updateProduct, etc.)

### 2. Context Layer (offlineDataContext.ts)
- **Role**: Manage application state and coordinate data operations
- **Data Source**: IndexedDB via `db.ts`
- **Operations**: CRUD operations that update IndexedDB and trigger syncs

### 3. Storage Layer (IndexedDB via db.ts)
- **Role**: Local data persistence with sync metadata
- **Data Source**: Local IndexedDB database
- **Operations**: Direct database operations with sync flags

### 4. Sync Layer (syncService.ts)
- **Role**: Bidirectional sync between IndexedDB and Supabase
- **Data Source**: IndexedDB ↔ Supabase
- **Operations**: Upload unsynced records, download remote changes

### 5. Remote Layer (Supabase)
- **Role**: Cloud database and real-time subscriptions
- **Data Source**: PostgreSQL database
- **Operations**: Persistent storage, multi-user sync

## Service Categories

### Core Services (Follow Pattern)
- ✅ `transactionService.ts` - Uses IndexedDB → syncService
- ✅ `erpFinancialService.ts` - Uses IndexedDB → syncService

### Infrastructure Services (Special Cases)
- ✅ `syncService.ts` - Handles IndexedDB ↔ Supabase sync
- ✅ `supabaseService.ts` - Authentication & sync helpers only
- ✅ `currencyService.ts` - Utility service (no data persistence)

## Sync Metadata

All IndexedDB records must include sync metadata:

```typescript
interface BaseEntity {
  id: string;
  store_id: string;
  created_at: string;
  updated_at?: string;
  _synced: boolean;        // false = needs sync to Supabase
  _lastSyncedAt?: string; // timestamp of last sync
  _deleted?: boolean;     // true = soft deleted
}
```

## Error Handling

### Online State
- Operations save to IndexedDB immediately
- syncService handles Supabase sync in background
- UI shows immediate feedback

### Offline State
- Operations save to IndexedDB only
- syncService queues operations for later sync
- UI shows offline indicator

## Migration Guide

### For Existing Services

1. **Identify Direct Supabase Calls**
   ```bash
   grep -r "supabase.from" src/services/
   ```

2. **Update to Use IndexedDB**
   ```typescript
   // Before
   const { data } = await supabase.from('products').insert(product);
   
   // After
   await db.products.add({ ...product, _synced: false });
   ```

3. **Update Components to Use Context**
   ```typescript
   // Before
   const [products] = useState([]);
   useEffect(() => {
     loadProductsFromSupabase();
   }, []);
   
   // After
   const { products } = useOfflineData();
   ```

### For New Features

1. **Define IndexedDB Schema** in `src/lib/db.ts`
2. **Add Context Methods** in `src/contexts/OfflineDataContext.tsx`
3. **Add Sync Support** in `src/services/syncService.ts`
4. **Use Context in Components**

## Performance Benefits

### Immediate UI Updates
- No waiting for network requests
- Instant feedback for user actions
- Optimistic UI updates

### Reduced Network Usage
- Batch sync operations
- Only sync changed data
- Intelligent conflict resolution

### Offline Capability
- Full functionality without internet
- Automatic sync when reconnected
- Data integrity preservation

## Validation Checklist

For any new service or component, verify:

- [ ] No direct `supabase.from()` calls in components
- [ ] All data reads from `offlineDataContext`
- [ ] All data writes through context methods
- [ ] IndexedDB records include sync metadata
- [ ] Service follows the established pattern
- [ ] Proper error handling for offline scenarios

## Common Anti-Patterns

### ❌ Direct Supabase in Components
```typescript
// DON'T DO THIS
const { data } = await supabase.from('products').select('*');
```

### ❌ Mixed Data Sources
```typescript
// DON'T DO THIS - mixing IndexedDB and Supabase
const localProducts = await db.products.toArray();
const remoteProducts = await supabase.from('products').select('*');
```

### ❌ Bypassing Context
```typescript
// DON'T DO THIS
import { db } from '../lib/db';
const products = await db.products.toArray(); // Should use context
```

## Best Practices

### 1. Always Use Context
```typescript
const { products, addProduct, updateProduct } = useOfflineData();
```

### 2. Handle Loading States
```typescript
const { products, loading } = useOfflineData();
if (loading.products) return <LoadingSpinner />;
```

### 3. Show Sync Status
```typescript
const { isOnline, syncStatus } = useOfflineData();
```

### 4. Optimistic Updates
```typescript
// Update UI immediately, sync happens in background
await addProduct(productData); // UI updates instantly
```

## Conclusion

Following this offline-first architecture pattern ensures:
- **Consistent Performance** - No network delays for UI updates
- **Better UX** - Works offline, immediate feedback
- **Data Integrity** - Single source of truth with proper sync
- **Maintainability** - Clear separation of concerns
- **Scalability** - Efficient network usage and caching

All team members must follow this pattern when working on any data-related features.
