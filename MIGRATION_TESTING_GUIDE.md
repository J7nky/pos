# Migration Testing Guide

This guide explains how to test the entities migration scripts before proceeding with the full migration.

---

## Quick Start

### Option 1: Use the Web UI (Recommended)

1. **Start your development server:**
   ```bash
   npm run dev
   # or
   pnpm dev
   ```

2. **Navigate to the migration test page:**
   ```
   http://localhost:5173/migration-test
   # or in Electron: navigate to /migration-test
   ```

3. **Use the test buttons:**
   - **Verify Only** - Check current migration status (safe, read-only)
   - **Migrate Only** - Run migration script (updates entities table)
   - **Run Full Test** - Verify → Migrate (if needed) → Verify again

### Option 2: Browser Console

1. **Open Developer Tools (F12)**

2. **Run verification:**
   ```javascript
   import('./scripts/runMigrationTest').then(m => {
     m.quickVerify('your-store-id-here');
   });
   ```

3. **Run migration:**
   ```javascript
   import('./scripts/runMigrationTest').then(m => {
     m.quickMigrate('your-store-id-here');
   });
   ```

4. **Run full test:**
   ```javascript
   import('./scripts/runMigrationTest').then(m => {
     m.runMigrationTest('your-store-id-here', true); // true = auto-migrate
   });
   ```

### Option 3: Direct Script Import

In any component or script:

```typescript
import { verifyEntitiesMigration, printVerificationReport } from './scripts/verifyEntitiesMigration';
import { migrateToEntitiesOnly, printMigrationResult } from './scripts/migrateToEntitiesOnly';

// Verify
const report = await verifyEntitiesMigration(storeId);
printVerificationReport(report);

// Migrate
const result = await migrateToEntitiesOnly(storeId);
printMigrationResult(result);
```

---

## Understanding the Results

### Verification Report

The verification script checks:

1. **Customers Migration:**
   - Total customers in legacy table
   - How many are migrated to entities
   - Missing entities (not migrated)
   - Balance mismatches
   - Wrong entity types

2. **Suppliers Migration:**
   - Same checks as customers

3. **Employees Migration:**
   - Same checks as customers/suppliers

4. **Foreign Key References:**
   - Valid references (entity exists and correct type)
   - Invalid references (entity missing or wrong type)
   - Issues in bills, inventory_bills, transactions

5. **Summary:**
   - `allMigrated: true/false` - Are all entities properly migrated?
   - `totalEntities` - Total migrated entities
   - `totalLegacy` - Total in legacy tables
   - `discrepancies` - Number of issues found

### Migration Result

The migration script reports:

1. **Migration Counts:**
   - `customersMigrated` - New entities created
   - `suppliersMigrated` - New entities created
   - `employeesMigrated` - New entities created

2. **Update Counts:**
   - `customersUpdated` - Existing entities updated (balance sync)
   - `suppliersUpdated` - Existing entities updated
   - `employeesUpdated` - Existing entities updated

3. **Errors:**
   - List of any errors during migration
   - Includes entity ID, name, and error message

4. **Summary:**
   - `success: true/false` - Did migration complete without errors?
   - `totalProcessed` - Total entities processed
   - `totalMigrated` - New entities created
   - `totalUpdated` - Existing entities updated
   - `totalErrors` - Number of errors

---

## Testing Workflow

### Step 1: Initial Verification

Run verification to see current state:

```typescript
const report = await verifyEntitiesMigration(storeId);
```

**What to look for:**
- Are all entities migrated? (`report.summary.allMigrated`)
- Are there balance mismatches?
- Are foreign key references valid?

### Step 2: Run Migration (if needed)

If verification shows missing entities or issues:

```typescript
const result = await migrateToEntitiesOnly(storeId);
```

**What to look for:**
- Did migration complete successfully? (`result.summary.success`)
- How many entities were migrated?
- Are there any errors?

### Step 3: Verify Again

After migration, verify again:

```typescript
const postReport = await verifyEntitiesMigration(storeId);
```

**What to look for:**
- `allMigrated: true` - All entities properly migrated
- No balance mismatches
- All foreign keys valid

---

## Common Scenarios

### Scenario 1: All Entities Already Migrated

**Verification Result:**
```
Summary:
  All Migrated: ✅ YES
  Total Entities: 150
  Total Legacy: 150
  Discrepancies: 0
```

**Action:** No migration needed! You can proceed to Phase 2 (code updates).

### Scenario 2: Some Entities Missing

**Verification Result:**
```
Customers:
  Total: 50
  Migrated: 45
  Missing: 5
```

**Action:** Run migration script to migrate missing entities.

### Scenario 3: Balance Mismatches

**Verification Result:**
```
Customers:
  Issues:
    - Customer Name (id): Balance mismatch: legacy (USD: 100, LBP: 0) vs entity (USD: 95, LBP: 0)
```

**Action:** Run migration script to sync balances. The migration script will update existing entities if balances are out of sync.

### Scenario 4: Foreign Key Issues

**Verification Result:**
```
Foreign Keys:
  Invalid: 3
  Issues:
    - bills.customer_id (bill-id): Entity not found
```

**Action:** Investigate these issues. They may indicate:
- Orphaned records (customer deleted but bills still reference it)
- Data corruption
- Migration incomplete

---

## Troubleshooting

### Error: "No store ID found"

**Solution:** Make sure you're logged in and have a valid store ID.

### Error: "Entity not found in entities table"

**Solution:** Run migration script to create missing entities.

### Error: "Balance mismatch"

**Solution:** Run migration script. It will update existing entities to sync balances.

### Error: "Wrong entity type"

**Solution:** This indicates data corruption. The migration script will fix this by updating the entity type.

### Migration Errors

If migration reports errors:

1. **Check the error message** - It will tell you which entity failed and why
2. **Common causes:**
   - Duplicate entity_code (shouldn't happen, but check)
   - Invalid data in legacy table
   - Database constraint violations

3. **Fix manually if needed:**
   - Check the specific entity in the database
   - Fix the data issue
   - Re-run migration

---

## Next Steps After Testing

Once verification shows `allMigrated: true` and no discrepancies:

1. ✅ **Phase 1 Complete** - All data migrated
2. **Proceed to Phase 2** - Update code to use entities table only
3. **After Phase 2** - Remove legacy tables (Phase 3)

---

## Files Reference

- **Test Page:** `apps/store-app/src/pages/MigrationTest.tsx`
- **Test Runner:** `apps/store-app/src/scripts/runMigrationTest.ts`
- **Verification Script:** `apps/store-app/src/scripts/verifyEntitiesMigration.ts`
- **Migration Script:** `apps/store-app/src/scripts/migrateToEntitiesOnly.ts`

---

## Safety Notes

⚠️ **Important:**
- Verification is **read-only** - safe to run anytime
- Migration **updates** the entities table - make sure you have backups
- Migration is **idempotent** - safe to run multiple times
- Migration runs in a **transaction** - all or nothing

✅ **Best Practice:**
1. Run verification first
2. Review the report
3. Run migration if needed
4. Verify again
5. Proceed to Phase 2 only after verification passes

