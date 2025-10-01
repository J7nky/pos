# Architecture Rules - Quick Reference

## 🚨 **MANDATORY RULES**

### **Data Access Pattern:**
```
UI → OfflineDataContext → db.ts + syncService → Supabase
```

### **❌ FORBIDDEN:**
- UI Components accessing `db.ts` directly
- UI Components accessing `supabase` directly  
- Services accessing `supabase` (except syncService)

### **✅ ALLOWED:**
- UI Components using `useOfflineData()` hook
- Services accessing `db.ts` when called by OfflineDataContext
- syncService accessing Supabase
- Authentication context accessing Supabase

---

## 🔧 **Quick Fixes**

### **If you see this in UI components:**
```typescript
// ❌ WRONG
import { db } from '../lib/db';
import { supabase } from '../lib/supabase';
```

### **Replace with:**
```typescript
// ✅ CORRECT
import { useOfflineData } from '../contexts/OfflineDataContext';
const { products, addProduct, updateProduct } = useOfflineData();
```

---

## 📋 **Code Review Checklist**

- [ ] No `import { db }` in UI components
- [ ] No `import { supabase }` in UI components  
- [ ] All data operations use `useOfflineData()` hook
- [ ] Services only access `db.ts` if called by OfflineDataContext
- [ ] Only syncService accesses Supabase

---

## 🎯 **Why This Matters**

- **Offline-first**: Works without internet
- **Single Source of Truth**: Consistent data state
- **Automatic Sync**: Changes sync to cloud automatically
- **Performance**: Cached data, optimized re-renders
- **Error Handling**: Centralized error management
