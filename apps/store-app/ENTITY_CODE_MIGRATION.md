# Entity Code Migration Guide

## Problem
The code was using fake string IDs like `'entity-cash-customer'` as UUID primary keys, which is invalid SQL.

## Solution
- **SQL**: Use proper auto-generated UUIDs for entity IDs
- **Code**: Query entities by `entity_code` (unique per store), not hardcoded IDs

## Changes Required

### ✅ Completed
1. **SQL Migration** - `20251129150003_create_system_entities_function.sql`
   - Removed hardcoded fake UUID IDs
   - Use `ON CONFLICT (store_id, entity_code)` for idempotency
   
2. **Constants** - `systemEntities.ts`
   - Renamed `SYSTEM_ENTITY_IDS` → `SYSTEM_ENTITY_CODES`
   - Values now match `entity_code` column (e.g., `'CASH-CUST'`)
   - Added `getSystemEntity()` helper to query by code

### 🔄 Files That Need Updates

The following files reference `SYSTEM_ENTITY_IDS` and need migration:

1. **`src/utils/accountMapping.ts`** (4 references)
   - Change `SYSTEM_ENTITY_IDS` → `SYSTEM_ENTITY_CODES`
   - Change `defaultEntityId` → `defaultEntityCode`
   - Query entities by code instead of using direct IDs

2. **`src/services/accountingInitService.ts`** (7 references)
   - Update `getSystemEntityByType()` to query by entity_code
   - Remove direct ID references

3. **`src/services/entityMigrationService.ts`** (4 references)
   - Update entity ID assignment logic
   - Use entity lookup by code

4. **Test Files** (6 files with multiple references)
   - Mock entities should have proper UUID IDs
   - Update test assertions to query by entity_code

## Migration Pattern

### Before (WRONG ❌)
```typescript
// Trying to use string as UUID
const cashEntityId = SYSTEM_ENTITY_IDS.CASH_CUSTOMER; // 'entity-cash-customer'
const entity = await db.entities.get(cashEntityId); // ❌ Won't work - not a UUID
```

### After (CORRECT ✅)
```typescript
// Query by entity_code
import { SYSTEM_ENTITY_CODES, getSystemEntity } from '../constants/systemEntities';

const cashEntity = await getSystemEntity(db, storeId, SYSTEM_ENTITY_CODES.CASH_CUSTOMER);
const entityId = cashEntity?.id; // Use the real UUID
```

## Database Schema

The `entities` table has:
```sql
CREATE TABLE entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id),
    entity_code TEXT NOT NULL, -- Human-readable code (e.g., 'CASH-CUST')
    entity_type TEXT NOT NULL,
    name TEXT NOT NULL,
    is_system_entity BOOLEAN DEFAULT false,
    -- ... other fields
    UNIQUE(store_id, entity_code) -- Ensures uniqueness per store
);
```

## Action Items

1. Run the fixed SQL migration
2. Update all files listed above to use `SYSTEM_ENTITY_CODES`
3. Replace direct ID usage with `getSystemEntity()` queries
4. Update tests to use proper UUIDs for mock data
5. Add compound index on `[store_id+entity_code]` if not exists (for Dexie queries)
