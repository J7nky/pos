# Entity Migration Summary

## ✅ Completed

### 1. SQL Migration Fixed
**File**: `apps/store-app/supabase/migrations/20251129150003_create_system_entities_function.sql`

**Changes**:
- Removed invalid fake UUID IDs like `'entity-cash-customer'::UUID`
- Now uses proper auto-generated UUIDs: `gen_random_uuid()`
- Uses `ON CONFLICT (store_id, entity_code)` for idempotency
- Entities are identified by `entity_code` column (e.g., `'CASH-CUST'`, `'CASH-SUPP'`)

### 2. Constants Updated
**File**: `apps/store-app/src/constants/systemEntities.ts`

**Changes**:
- `SYSTEM_ENTITY_IDS` → `SYSTEM_ENTITY_CODES`
- Values changed from fake IDs to actual entity codes:
  - `'entity-cash-customer'` → `'CASH-CUST'`
  - `'entity-cash-supplier'` → `'CASH-SUPP'`
- Added `getSystemEntity(db, storeId, entityCode)` helper function
- Functions renamed:
  - `getSystemEntityId()` → `getSystemEntityCode()`
  - `isSystemEntity()` → `isSystemEntityCode()`

### 3. Account Mapping Updated
**File**: `apps/store-app/src/utils/accountMapping.ts`

**Changes**:
- Import changed to `SYSTEM_ENTITY_CODES`
- `AccountMapping.defaultEntityId` → `defaultEntityCode`
- `getEntityIdForTransaction()` → `getEntityCodeForTransaction()`
- All references updated to use entity codes

## 🔄 Files That Still Need Updates

### High Priority (Break Functionality)

1. **`src/services/accountingInitService.ts`**
   - Line 63-69: `getSystemEntityByType()` method
   - Currently returns fake IDs, needs to query by entity_code
   
2. **`src/services/entityMigrationService.ts`**
   - Lines 165-178: Entity ID assignment in migration
   - Switch statement assigns fake IDs, needs to generate/lookup real UUIDs

### Medium Priority (Tests)

3. **`src/services/__tests__/entityMigrationService.test.ts`**
   - Line 186: Mock entity with fake ID
   - Need to update test to use proper UUID mocks

4. **`src/services/__tests__/journalService.test.ts`**
   - Line 145: Mock entity with fake ID
   - Line 175: Using fake ID in test

5. **`src/services/__tests__/phase5Integration.test.ts`**
   - Line 131: Mock entity with fake ID

6. **`src/services/__tests__/snapshotService.test.ts`**
   - Lines 138, 175, 210, 245, 275, 291, 350: Multiple fake ID references

## Migration Pattern

### ❌ Old Way (Invalid)
```typescript
import { SYSTEM_ENTITY_IDS } from '../constants/systemEntities';

// This won't work - 'entity-cash-customer' is not a valid UUID
const entityId = SYSTEM_ENTITY_IDS.CASH_CUSTOMER;
const entity = await db.entities.get(entityId); // ❌ Fails
```

### ✅ New Way (Correct)
```typescript
import { SYSTEM_ENTITY_CODES, getSystemEntity } from '../constants/systemEntities';
import { db } from '../lib/db';

// Query by entity_code to get the real UUID
const entity = await getSystemEntity(db, storeId, SYSTEM_ENTITY_CODES.CASH_CUSTOMER);
if (!entity) {
  throw new Error('Cash customer entity not found');
}
const entityId = entity.id; // ✅ Real UUID
```

## Next Steps

1. **Delete the custom trigger** (as you mentioned):
   ```sql
   DROP TRIGGER IF EXISTS trigger_create_cash_drawer_account ON public.stores;
   DROP FUNCTION IF EXISTS public.create_cash_drawer_account();
   ```

2. **Run the fixed migration** to create entities with proper UUIDs

3. **Update remaining service files** to use entity_code queries

4. **Update test files** with proper UUID mocks

5. **Test store creation flow** to verify:
   - Store created → branch created
   - Accounting foundation initialized
   - System entities created with real UUIDs
   - Cash drawer accounts created with branch_id

## Database Schema Reference

```sql
CREATE TABLE entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id),
    entity_code TEXT NOT NULL,        -- 'CASH-CUST', 'CASH-SUPP', etc.
    entity_type TEXT NOT NULL,        -- 'cash', 'supplier', 'internal', etc.
    name TEXT NOT NULL,
    is_system_entity BOOLEAN DEFAULT false,
    -- ... other fields
    UNIQUE(store_id, entity_code)     -- Each store has unique entity codes
);
```

## Store Creation Flow (Correct)

1. ✅ Admin app calls `createStoreWithInitialization()`
2. ✅ Store inserted → `trigger_create_default_branch` fires
3. ✅ Main Branch created with branch_id
4. ✅ App calls `initializeAccountingFoundation(store.id)`
5. ✅ RPC `create_system_entities_for_store(store_id)` creates entities with proper UUIDs
6. ✅ RPC `create_default_chart_of_accounts(store_id)` creates accounts
7. ✅ Inside that RPC → `initialize_cash_drawer_accounts(store_id)` called
8. ✅ Cash drawer account created with branch_id from Main Branch

All files updated correctly use entity codes instead of fake IDs! ✨
