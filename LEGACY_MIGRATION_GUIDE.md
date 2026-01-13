# Legacy CSV Migration Guide

This guide explains how to migrate opening balances from legacy Access database (.mdb) files using the mchar.csv export format.

## Overview

The Balance Migration system now supports importing legacy accounting data from Access databases. The system processes the `mchar.csv` table with specific business logic to automatically classify entities and calculate opening balances.

## How to Export from Access Database

### Option 1: Using Microsoft Access
1. Open the `.mdb` file in Microsoft Access
2. Find the `mchar` table
3. Right-click → Export → Text File
4. Choose CSV format
5. Save as `mchar.csv`

### Option 2: Using mdb-tools (Linux/Mac)
```bash
mdb-export database.mdb mchar > mchar.csv
```

## CSV File Structure

The exported `mchar.csv` must contain these columns **in this exact order**:

| Position | Column | Description | Required For Processing |
|----------|--------|-------------|------------------------|
| 0 | id | Entity ID | No (ignored) |
| 1 | account | Account code | No (ignored) |
| 2 | description | Entity name | **Yes** |
| 3 | fia | Entity flag (4 = customer/supplier) | **Yes** |
| 4 | typex | Type code | No (ignored) |
| 5 | address | Address | No (ignored) |
| 6 | tel | Telephone | No (ignored) |
| 7 | FAX | Fax number | No (ignored) |
| 8 | curr | Currency code | No (ignored) |
| 9 | ydfamt | Yearly debit amount | **Yes** |
| 10 | ycfamt | Yearly credit amount | **Yes** |
| 11 | ydbamt1 | Yearly debit amount (period 1) | **Yes** |
| 12 | ycbamt1 | Yearly credit amount (period 1) | **Yes** |
| 13 | ydbamt2 | Yearly debit amount (period 2) | **Yes** |
| 14 | ycbamt2 | Yearly credit amount (period 2) | **Yes** |
| 15+ | ... | Additional columns (if any) | No (ignored) |

**Note:** The file must have at least 15 columns. Additional columns beyond column 14 are acceptable and will be ignored.

## Processing Logic

### 1. Filtering
Only rows where `fia = 4` are processed (note: the field is named `fia` not `fla`). All other rows are automatically skipped.

Additionally, entities with balances less than 1 LBP (in absolute value) are skipped to avoid migrating insignificant amounts or rounding errors.

### 2. Balance Calculation
The system calculates the balance using this exact formula:

```
balance = (ydfamt + ydbamt1 + ydbamt2) - (ycfamt + ycbamt1 + ycbamt2)
```

- Missing or null values are treated as 0
- All balances are in LBP (Lebanese Pound)

### 3. Entity Classification

Based on the calculated balance:

- **balance > 0** → Customer (they owe us money)
  - Creates entity with credit balance
  - Journal entry: Debit AR (1200), Credit Owner's Equity (3100)

- **balance < 0** → Supplier (we owe them money)
  - Creates entity with debit balance
  - Journal entry: Debit Owner's Equity (3100), Credit AP (2100)

- **|balance| < 1** → Skipped (balances between -1 and 1 are not migrated)

## Sample Data

See `sample-mchar.csv` for example data with expected processing results:

| Row | Entity | fia | Balance Calc | Result |
|-----|--------|-----|--------------|--------|
| 1001 | Customer ABC | 4 | 800,000 | Customer, credit 800,000 LBP |
| 1002 | Supplier XYZ | 4 | -500,000 | Supplier, debit 500,000 LBP |
| 1003 | Customer DEF | 4 | 200,000 | Customer, credit 200,000 LBP |
| 1004 | Some Account | 5 | - | Skipped (fia ≠ 4) |
| 1005 | Zero Balance | 4 | 0 | Skipped (|balance| < 1) |
| 1006 | Supplier GHI | 4 | -300,000 | Supplier, debit 300,000 LBP |

## How to Use

### Step 1: Export CSV
Export the `mchar` table from your Access database as described above.

### Step 2: Access Admin Portal
1. Log in to the Admin Portal
2. Navigate to **Balance Migration** page

### Step 3: Select Format
1. Choose **"Legacy Format (mchar.csv from Access)"** radio button
2. Select your store and branch

### Step 4: Upload File
1. Click "Choose File"
2. Select your exported `mchar.csv` file
3. Click "Open"

The system will automatically:
- Parse the CSV file (expects at least 15 columns in the Access export format)
- Filter rows (fia = 4 only)
- Calculate balances using the 6 amount columns
- Classify entities (Customer/Supplier) based on balance sign
- Skip balances with absolute value < 1 (e.g., 0.45, -0.45, 0.99)

### Step 5: Preview & Verify
Review the processed data in the preview table:
- Entity names
- Entity types (Customer/Supplier)
- Calculated balances
- Any validation errors

### Step 6: Import
1. Click "Import Balances"
2. Confirm the import
3. Wait for the migration to complete

The system will:
- Create entities (if they don't exist)
- Create opening balance transactions
- Create journal entries (double-entry accounting)
- Emit events for real-time sync

## Validation Rules

The system validates each row:

✅ Entity name must not be empty
✅ Entity type must be customer or supplier
✅ At least one balance (debit or credit) must be non-zero
✅ Only one balance can be non-zero (not both)
✅ Customers cannot have debit balances
✅ Suppliers cannot have credit balances
✅ Balances must be positive (not negative)

Rows that fail validation will be shown in the preview with error messages.

## Database Impact

For each successfully imported entity, the system creates:

1. **Entity Record** (if it doesn't exist)
   - Type: Customer or Supplier
   - Name from `description` field
   - Currency: LBP

2. **Transaction Record**
   - Category: `opening_balance`
   - Amount: Calculated balance
   - Reference: Auto-generated (OB-YYYYMMDD-HHMMSS)

3. **Journal Entries** (2 entries per entity)
   - Debit entry
   - Credit entry
   - Posted to correct accounts based on entity type

4. **Events** (for real-time sync across devices)
   - Entity created/updated event
   - Transaction posted event
   - Journal entries posted events

## Troubleshooting

### "Failed to parse mchar.csv"
- Ensure the file is a valid CSV format
- Check that all required columns are present
- Verify the file is UTF-8 encoded

### "No entities found"
- Check that your file has rows where `fia = 4` (note: field name is `fia` not `fla`)
- Verify that entities have balances with absolute value >= 1
- Ensure the file has at least 15 columns in the correct order
- Check the browser console for detailed logs showing which rows were skipped and why

### "Entity name is required"
- The `description` field cannot be empty
- Each entity must have a valid name

### Validation Errors
- Review the error messages in the "Details" column
- Common issues:
  - Wrong entity type for balance type
  - Both debit and credit balances set
  - Negative balance values

## Technical Details

- **Client-side Processing**: All CSV parsing happens in the browser
- **No Backend Required**: Uses existing RPC functions
- **Currency**: Always LBP (hardcoded as per legacy system)
- **Atomic Operations**: Each entity migration is atomic (all-or-nothing)
- **Event-Driven**: Syncs across all devices in real-time

## Files Modified

- `/apps/admin-app/src/services/balanceMigrationService.ts` - Added `parseMcharFile()` method
- `/apps/admin-app/src/pages/BalanceMigration.tsx` - Added file type selection and routing

## Sample CSV Location

`/sample-mchar.csv` - Use this as a template or for testing

