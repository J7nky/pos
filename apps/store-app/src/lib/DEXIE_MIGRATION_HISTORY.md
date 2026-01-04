# Dexie Database Migration History

This file documents all historical database migrations for reference. The current database uses a single consolidated version (54). This history is preserved for documentation purposes only.

## Migration Versions

### Version 5
**Purpose**: Schema update for suppliers, customers, sale_items, and inventory_items
**Status**: Consolidated into version 54

### Version 6
**Purpose**: Add payment_method to sale_items
**Status**: Consolidated into version 54

### Version 7
**Purpose**: Remove sales table (migrated to bill_line_items)
**Status**: Consolidated into version 54

### Version 9
**Purpose**: Bill management tables initialization
**Status**: Consolidated into version 54

### Version 11
**Purpose**: Fix sale items with empty created_by fields
**Status**: Consolidated into version 54

### Version 12
**Purpose**: Add created_by index to sale_items
**Status**: Consolidated into version 54

### Version 13
**Purpose**: Ensure hooks are properly registered
**Status**: Consolidated into version 54

### Version 15
**Purpose**: Remove sale_items table and migrate to bill_line_items
**Status**: Consolidated into version 54

### Version 19
**Purpose**: Initial schema with cash drawer tables
**Status**: Consolidated into version 54

### Version 20
**Purpose**: Add supplier advance balance fields
**Status**: Consolidated into version 54

### Version 21
**Purpose**: Schema updates
**Status**: Consolidated into version 54

### Version 22
**Purpose**: Add compound indexes
**Status**: Consolidated into version 54

### Version 23
**Purpose**: Add reminders table for unified reminder system
**Status**: Consolidated into version 54

### Version 24
**Purpose**: Add employee attendance tracking
**Status**: Consolidated into version 54

### Version 25
**Purpose**: Add is_global field to products for predefined global products
**Status**: Consolidated into version 54

### Version 26
**Purpose**: Add sku field to inventory_items for barcode tracking
**Status**: Consolidated into version 54

### Version 27
**Purpose**: Add currency field to inventory tables
**Status**: Consolidated into version 54

### Version 28
**Purpose**: Remove redundant fields from bill_line_items
**Status**: Consolidated into version 54

### Version 29
**Purpose**: Add accounting foundation tables (Phase 1)
**Status**: Consolidated into version 54

### Version 30
**Purpose**: Add branches table
**Status**: Consolidated into version 54

### Version 31
**Purpose**: BRANCH-CENTRIC REFACTOR - Add branch_id to all operational tables
**Status**: Consolidated into version 54
**Note**: This was a major architectural change making the system branch-centric

### Version 32
**Purpose**: Add subscription management tables for offline licensing
**Status**: Consolidated into version 54

### Version 33
**Purpose**: Schema updates
**Status**: Consolidated into version 54

### Version 34
**Purpose**: Schema updates
**Status**: Consolidated into version 54

### Version 35
**Purpose**: Add missing [store_id+branch_id] compound index to cash_drawer_sessions
**Status**: Consolidated into version 54

### Version 36
**Purpose**: Add missing [store_id+branch_id] compound indexes to all branch-scoped tables
**Status**: Consolidated into version 54

### Version 37
**Purpose**: Schema updates
**Status**: Consolidated into version 54

### Version 38
**Purpose**: Remove customers and suppliers tables (migrated to entities table)
**Status**: Consolidated into version 54
**Note**: Major migration - customers and suppliers unified into entities table

### Version 39
**Purpose**: Add entity_code index to entities table
**Status**: Consolidated into version 54

### Version 40
**Purpose**: Add RBAC tables (user_module_access)
**Status**: Consolidated into version 54

### Version 41
**Purpose**: Add is_system_entity index to entities table
**Status**: Consolidated into version 54

### Version 42
**Purpose**: Add compound indexes for balance calculation queries
**Status**: Consolidated into version 54

### Version 43
**Purpose**: Add back [store_id+branch_id] index to bill_audit_logs
**Status**: Consolidated into version 54

### Version 44
**Purpose**: Add sync_state table for event-driven sync
**Status**: Consolidated into version 54

### Version 45
**Purpose**: Add is_reversal and reversal_of_transaction_id fields to transactions
**Status**: Consolidated into version 54

### Version 46
**Purpose**: Unified RBAC - Replace user_module_access with role_permissions and user_permissions
**Status**: Consolidated into version 54

### Version 47
**Purpose**: Journal Entry Base Currency Schema
**Status**: Consolidated into version 54

### Version 48
**Purpose**: Add missing fields and indexes to balance_snapshots
**Status**: Consolidated into version 54

### Version 49
**Purpose**: Add logo fields to stores and branches tables
**Status**: Consolidated into version 54

### Version 50
**Purpose**: Add local authentication tables
**Status**: Consolidated into version 54

### Version 51
**Purpose**: Add P&L fields to inventory_bills
**Status**: Consolidated into version 54

### Version 52
**Purpose**: Change bills.customer_id to bills.entity_id
**Status**: Consolidated into version 54
**Note**: Unified customer/supplier/employee references in bills table

### Version 53
**Purpose**: Add bill_id, reversal_of_journal_entry_id, and entry_type to journal_entries
**Status**: Consolidated into version 54

### Version 54 (Current)
**Purpose**: Add entity_id to transactions table (unified field for customer_id, supplier_id, employee_id)
**Status**: Active - This is the current consolidated version

## Consolidation Notes

All previous versions have been consolidated into version 54. The current database schema includes all features from previous migrations:

- Branch-centric architecture (v31)
- Entities table migration (v38)
- Unified RBAC (v46)
- Bills entity_id migration (v52)
- Journal entry reversal fields (v53)
- Transactions entity_id migration (v54)

Since there is no production data, all users will start with a fresh version 54 database.

