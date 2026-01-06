# Entity Type Detection Guide

## Overview

After migrating from separate `customer_id`, `supplier_id`, and `employee_id` fields to a unified `entity_id` field in the transactions table, you need to look up the entity in the `entities` table to determine its type.

## Solution

The `entities` table has an `entity_type` field that indicates the type of entity:
- `'customer'`
- `'supplier'`
- `'employee'`
- `'cash'`
- `'internal'`

## How to Detect Entity Type

### Method 1: Using the Utility Function (Recommended)

Use the `getEntityTypeFromId` utility function from `utils/entityUtils.ts`:

```typescript
import { getEntityTypeFromId } from '../utils/entityUtils';

// Get entity type from a transaction's entity_id
const entityType = await getEntityTypeFromId(transaction.entity_id);

if (entityType === 'customer') {
  // Handle customer-specific logic
} else if (entityType === 'supplier') {
  // Handle supplier-specific logic
} else if (entityType === 'employee') {
  // Handle employee-specific logic
}
```

### Method 2: Direct Database Lookup

If you need more control or already have the database instance:

```typescript
import { getDB } from '../lib/db';

if (transaction.entity_id) {
  const entity = await getDB().entities.get(transaction.entity_id);
  if (entity && !entity._deleted) {
    const entityType = entity.entity_type; // 'customer' | 'supplier' | 'employee' | 'cash' | 'internal'
    // Use entityType as needed
  }
}
```

### Method 3: When You Already Have the Entity Object

If you've already loaded the entity object, use the synchronous helper:

```typescript
import { getEntityTypeFromEntity } from '../utils/entityUtils';

const entity = await getDB().entities.get(transaction.entity_id);
const entityType = getEntityTypeFromEntity(entity); // Returns null if entity is invalid
```

## Available Utility Functions

The `utils/entityUtils.ts` file provides several helper functions:

### `getEntityTypeFromId(entityId: string | null | undefined): Promise<EntityType | null>`
- Looks up entity by ID and returns its type
- Returns `null` if entity not found or deleted

### `getEntityTypeFromEntity(entity: Entity | null | undefined): EntityType | null`
- Synchronous function that extracts type from an already-loaded entity object
- Use this to avoid duplicate database lookups

### `getEntityTypeFromTransaction(transaction: { entity_id?: string | null }): Promise<EntityType | null>`
- Convenience wrapper for getting entity type from a transaction object

### `isEntityType(entityId: string | null | undefined, expectedType: EntityType): Promise<boolean>`
- Checks if an entity_id matches a specific entity type
- Returns `true` if matches, `false` otherwise

### `getEntityTypeFromTransactionWithLegacy(transaction): Promise<EntityType | null>`
- Supports both new `entity_id` field and legacy `customer_id`/`supplier_id`/`employee_id` fields
- Use during migration period for backward compatibility

## Examples from the Codebase

### Example 1: Transaction Service
```typescript
// From transactionService.ts line 1135-1142
if (transaction.entity_id) {
  const entity = await getDB().entities.get(transaction.entity_id);
  if (entity) {
    entityName = entity.name || 'Unknown Entity';
    entityType = entity.entity_type as 'customer' | 'supplier' | 'employee';
    entityId = transaction.entity_id;
  }
}
```

### Example 2: Audit Logging
```typescript
// From transactionService.ts line 1507
entityType: transaction.entity_id 
  ? (await getDB().entities.get(transaction.entity_id))?.entity_type as 'customer' | 'supplier' | 'employee' || 'cash_drawer' 
  : 'cash_drawer'
```

## Migration Notes

1. **Legacy Fields**: The old `customer_id`, `supplier_id`, and `employee_id` fields are still present in the schema for backward compatibility but should not be used for new code.

2. **Null Handling**: Always check if `entity_id` is null before looking it up. Transactions without an entity (e.g., cash drawer operations) will have `entity_id = null`.

3. **Performance**: If you need to check entity types for multiple transactions, consider batching the lookups or caching entity objects.

4. **Type Safety**: The `entity_type` field is strongly typed as `'customer' | 'supplier' | 'employee' | 'cash' | 'internal'`, so TypeScript will help catch type errors.

## Common Patterns

### Pattern 1: Filter transactions by entity type
```typescript
const customerTransactions = await Promise.all(
  transactions
    .filter(t => t.entity_id)
    .map(async (t) => {
      const entityType = await getEntityTypeFromId(t.entity_id);
      return entityType === 'customer' ? t : null;
    })
);
```

### Pattern 2: Group transactions by entity type
```typescript
const grouped = {
  customer: [] as Transaction[],
  supplier: [] as Transaction[],
  employee: [] as Transaction[],
  other: [] as Transaction[]
};

for (const transaction of transactions) {
  const entityType = await getEntityTypeFromId(transaction.entity_id);
  if (entityType === 'customer') {
    grouped.customer.push(transaction);
  } else if (entityType === 'supplier') {
    grouped.supplier.push(transaction);
  } else if (entityType === 'employee') {
    grouped.employee.push(transaction);
  } else {
    grouped.other.push(transaction);
  }
}
```

### Pattern 3: Conditional logic based on entity type
```typescript
const entityType = await getEntityTypeFromId(transaction.entity_id);

switch (entityType) {
  case 'customer':
    // Handle customer transaction
    break;
  case 'supplier':
    // Handle supplier transaction
    break;
  case 'employee':
    // Handle employee transaction
    break;
  default:
    // Handle cash drawer or other transaction
    break;
}
```

## Database Schema Reference

The `entities` table structure:
```typescript
interface Entity {
  id: string;
  store_id: string;
  branch_id: string | null;
  entity_type: 'customer' | 'supplier' | 'employee' | 'cash' | 'internal';
  entity_code: string;
  name: string;
  phone: string | null;
  is_system_entity: boolean;
  is_active: boolean;
  customer_data: object | null;
  supplier_data: object | null;
  created_at: string;
  updated_at: string;
  _synced: boolean;
  _deleted: boolean;
}
```

## Summary

To detect the entity type from a transaction's `entity_id`:

1. **Look up the entity** in the `entities` table using the `entity_id`
2. **Read the `entity_type` field** from the entity record
3. **Use the utility functions** from `utils/entityUtils.ts` for convenience and consistency

The entity type will be one of: `'customer'`, `'supplier'`, `'employee'`, `'cash'`, or `'internal'`.

