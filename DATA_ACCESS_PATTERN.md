# Data Access Pattern - Architecture Guidelines

## 🎯 **MANDATORY Data Access Pattern**

### **✅ CORRECT Pattern:**
```
UI Components → OfflineDataContext → db.ts (data) + syncService (sync) → Supabase
```

### **❌ FORBIDDEN Patterns:**
- ❌ **UI Components → db.ts** (Direct database access)
- ❌ **UI Components → Supabase** (Direct cloud access)
- ❌ **Services → Supabase** (Except syncService)

---

## 📋 **Architecture Rules**

### **1. UI Components MUST use OfflineDataContext**
```typescript
// ✅ CORRECT
const { products, addProduct, updateProduct } = useOfflineData();

// ❌ FORBIDDEN
import { db } from '../lib/db';
await db.products.add(data);
```

### **2. Services can access db.ts ONLY if called by OfflineDataContext**
```typescript
// ✅ CORRECT - Service called by OfflineDataContext
export const inventoryService = {
  async getLowStockItems(storeId: string) {
    return await db.inventory_items.where('store_id').equals(storeId).toArray();
  }
};

// ❌ FORBIDDEN - Service called directly by UI
```

### **3. Only syncService can access Supabase**
```typescript
// ✅ CORRECT - Only in syncService.ts
import { supabase } from '../lib/supabase';
await supabase.from('products').insert(data);

// ❌ FORBIDDEN - Anywhere else
```

---

## 🔧 **Exception Cases**

### **Allowed Direct Access:**
1. **Authentication**: `SupabaseAuthContext` can access Supabase directly
2. **Database Management**: Schema migrations, cleanup utilities
3. **Debugging**: Development tools and testing utilities
4. **Sync Metadata**: syncService internal operations

---

## 🎯 **Benefits of This Pattern**

1. **🔄 Automatic Sync**: All data changes trigger sync
2. **🛡️ Data Validation**: Business rules enforced centrally
3. **⚡ Performance**: Caching and state management
4. **🔧 Consistency**: Single source of truth
5. **🐛 Error Handling**: Centralized error management

---

## 📊 **Code Review Checklist**

When reviewing code, ensure:

- [ ] UI components only import from `OfflineDataContext`
- [ ] No direct `import { db }` in UI components
- [ ] No direct `import { supabase }` in UI components
- [ ] Services only access `db.ts` if called by `OfflineDataContext`
- [ ] Only `syncService.ts` accesses Supabase
- [ ] All data operations go through `OfflineDataContext` methods

---

## 🚨 **Violation Examples**

### **❌ UI Component Violations:**
```typescript
// DON'T DO THIS
import { db } from '../lib/db';
import { supabase } from '../lib/supabase';

const MyComponent = () => {
  const [products, setProducts] = useState([]);
  
  useEffect(() => {
    // ❌ Direct db access
    db.products.toArray().then(setProducts);
    
    // ❌ Direct Supabase access
    supabase.from('products').select('*').then(result => {
      setProducts(result.data);
    });
  }, []);
};
```

### **✅ Correct Implementation:**
```typescript
// DO THIS INSTEAD
import { useOfflineData } from '../contexts/OfflineDataContext';

const MyComponent = () => {
  const { products, refreshData } = useOfflineData();
  
  useEffect(() => {
    refreshData(); // ✅ Goes through OfflineDataContext
  }, []);
};
```

---

## 🎯 **Summary**

**MANDATORY**: All data access must flow through `OfflineDataContext`. Direct access to `db.ts` or `supabase` from UI components is considered a violation and must be corrected.

This pattern ensures:
- Offline-first architecture
- Single Source of Truth
- Automatic synchronization
- Data consistency
- Performance optimization
