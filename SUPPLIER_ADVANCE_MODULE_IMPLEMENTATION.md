# Supplier Advance Module Implementation

## Overview
This document describes the complete implementation of the Supplier Advance Payment module, which allows tracking and managing advance payments made to suppliers.

## Date Implemented
Saturday, November 1, 2025

## Features Implemented

### 1. Database Schema Updates
**Files Modified:**
- `src/types/database.ts` - Added advance_lb_balance and advance_usd_balance fields to suppliers table
- `src/types/index.ts` - Updated Supplier interface with advance payment fields
- `src/lib/db.ts` - Updated IndexedDB schema (v20) with supplier advance fields and migration

**New Fields:**
- `advance_lb_balance`: Number - Tracks advance payments in LBP
- `advance_usd_balance`: Number - Tracks advance payments in USD

**Migration Created:**
- `supabase/migrations/20250201000000_add_supplier_advance_fields.sql`
  - Adds advance balance columns to suppliers table
  - Sets default values to 0
  - Adds check constraints to ensure non-negative balances
  - Includes documentation comments

### 2. Supplier Form Enhancement
**File Modified:** `src/components/common/SupplierFormModal.tsx`

**Features:**
- Added optional advance payment section to supplier form
- Supports both LBP and USD advance amounts
- Clean UI with helpful hints directing users to the Supplier Advances tab
- Maintains backward compatibility - advances default to 0

### 3. Supplier Advances Management Component
**File Created:** `src/components/accountingPage/tabs/SupplierAdvances.tsx`

**Features:**
- **Statistics Dashboard:**
  - Total USD advances
  - Total LBP advances
  - Number of suppliers with active advances
  - Total transaction count

- **Advance Payment Recording:**
  - Give advance (withdraw cash, increase supplier advance balance)
  - Deduct advance (reduce supplier advance balance)
  - Date selection
  - Supplier selection with create-new option
  - Currency selection (USD/LBP)
  - Description field

- **Supplier Listing:**
  - Search functionality
  - View all suppliers with their advance balances
  - Click to view detailed transaction history

- **Transaction History Modal:**
  - Detailed view of all advance transactions per supplier
  - Date filtering (all time, today, week, month)
  - Currency filtering
  - Transaction details with amounts and descriptions

- **Export Functionality:**
  - Export supplier advances to CSV

### 4. Business Logic Implementation
**File Modified:** `src/contexts/OfflineDataContext.tsx`

**New Function:** `processSupplierAdvance`

**Logic Flow:**
1. Validates advance amount
2. Finds supplier in local database
3. Calculates new advance balance based on type (give/deduct)
4. Prevents negative advance balances
5. Updates supplier record in IndexedDB
6. Creates transaction record with proper categorization
7. For "give" type:
   - Checks cash drawer balance
   - Withdraws amount from cash drawer
   - Updates cash drawer balance
8. Triggers data refresh and sync

**Offline-First Architecture:**
- All operations happen on IndexedDB first
- Changes marked as unsynced (_synced: false)
- Automatic sync to Supabase when online
- Follows established pattern: Supabase → syncService → IndexedDB → Context → UI

### 5. Navigation Integration
**Files Modified:**
- `src/pages/Customers.tsx` - Added supplier-advances tab alongside customers and suppliers tabs
- `src/pages/Accounting.tsx` - Added supplier-advances tab rendering (also available in Accounting page)
- `src/components/accountingPage/tabs/ActionTabsBar.tsx` - Added tab button with Banknote icon

**New Tab:** "Supplier Advances"
- **Primary Location:** Customers page (alongside Customers and Suppliers tabs)
- Also available in Accounting page between "Received Bills" and "Cash Drawer"
- Uses Banknote icon from lucide-react
- Persistent tab state with localStorage

## Technical Architecture

### Data Flow
```
User Action → SupplierAdvances Component
  ↓
processSupplierAdvance (OfflineDataContext)
  ↓
1. Validate & Calculate
2. Update Supplier (updateSupplier)
3. Create Transaction Record
4. Update Cash Drawer (if giving advance)
  ↓
IndexedDB (Local Storage)
  ↓
syncService (Background Sync)
  ↓
Supabase (Cloud Database)
```

### Transaction Types
- **Give Advance:**
  - Type: expense
  - Category: "Supplier Advance"
  - Cash drawer: Withdrawn
  - Supplier advance balance: Increased

- **Deduct Advance:**
  - Type: income
  - Category: "Supplier Advance"
  - Cash drawer: No change
  - Supplier advance balance: Decreased

### Validation Rules
1. Amount must be positive
2. Supplier must exist
3. For deductions: cannot exceed current advance balance
4. For advances: cannot exceed cash drawer balance
5. Currency must be USD or LBP

## User Interface

### Statistics Cards
- Clean, modern design with icons
- Color-coded by currency (Green for USD, Blue for LBP)
- Real-time updates

### Forms
- Clean, responsive layout
- Dropdown selectors for suppliers
- Date picker for transaction dating
- Optional description field
- Validation feedback

### Tables
- Sortable columns
- Search functionality
- Responsive design
- Click-through for detailed views

## Testing Checklist

- [x] Database migration created
- [x] Type definitions updated
- [x] IndexedDB schema updated
- [x] UI component created
- [x] Business logic implemented
- [x] Tab navigation added
- [ ] End-to-end testing
- [ ] Sync testing (online/offline)
- [ ] Data integrity verification
- [ ] User acceptance testing

## Future Enhancements
1. Advance payment reports
2. Advance payment reminders
3. Automatic deduction from supplier payments
4. Advance payment analytics
5. Mobile app integration

## Dependencies
- React 18+
- TypeScript
- Dexie.js (IndexedDB wrapper)
- Supabase Client
- lucide-react (icons)
- Tailwind CSS

## Migration Instructions
1. Run Supabase migration: `20250201000000_add_supplier_advance_fields.sql`
2. IndexedDB will auto-migrate on next page load (v20)
3. Existing suppliers will have advance balances initialized to 0
4. No data loss or downtime required

## Notes
- All advance balances are stored as positive numbers
- Currency conversions use store exchange rate
- Cash drawer always operates in LBP internally
- Advances are tracked separately from regular supplier balances
- Full audit trail maintained through transactions table

*This document is a living roadmap and will be updated as priorities shift and new requirements emerge.*


