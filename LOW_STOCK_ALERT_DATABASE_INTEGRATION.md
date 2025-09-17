# Low Stock Alert Database Integration

This document describes the integration of the `low_stock_alert` field into the stores table and the implementation of database-synced low stock alert functionality.

## Overview

The low stock alert setting is now stored in the database (`stores.low_stock_alert`) and synchronized across devices, providing:
- Persistent storage across devices and sessions
- Synchronization between online and offline modes
- Consistent low stock alert behavior across all user devices

## Database Schema

### Stores Table Update

Added `low_stock_alert` field to the `stores` table:

```sql
-- New column in stores table
low_stock_alert: BOOLEAN NOT NULL DEFAULT true
```

### Migration

The migration file `20250124000000_add_low_stock_alert_to_stores.sql` adds:
- `low_stock_alert` column with default value `true`
- Proper documentation and constraints
- Updates existing stores to have alerts enabled by default

## Implementation Details

### 1. Database Types Updated

**`src/types/database.ts`:**
```typescript
stores: {
  Row: {
    // ... existing fields
    low_stock_alert: boolean;
  };
  Insert: {
    // ... existing fields
    low_stock_alert?: boolean;
  };
  Update: {
    // ... existing fields
    low_stock_alert?: boolean;
  };
}
```

### 2. Local Database Schema Updated

**`src/lib/db.ts`:**
```typescript
export interface Store extends BaseEntity {
  // ... existing fields
  low_stock_alert: boolean; // Low stock alert enabled/disabled
}
```

### 3. SupabaseService Updated

**`src/services/supabaseService.ts`:**
```typescript
static async updateStoreSettings(
  storeId: string, 
  updates: {
    // ... existing fields
    low_stock_alert?: boolean;
  }
)
```

### 4. OfflineDataContext Enhanced

**`src/contexts/OfflineDataContext.tsx`:**

#### Loading from Database
```typescript
// Load low_stock_alert from cached store data
if (existingStore.low_stock_alert !== undefined) {
  setLowStockAlertsEnabled(existingStore.low_stock_alert);
}
```

#### Database-Synced Toggle Function
```typescript
const toggleLowStockAlerts = async (enabled: boolean) => {
  // Update local state immediately
  setLowStockAlertsEnabled(enabled);
  
  // Update IndexedDB with sync flag
  await db.stores
    .where('id')
    .equals(storeId)
    .modify({ 
      low_stock_alert: enabled,
      _synced: false,
      updated_at: new Date().toISOString()
    });

  // Trigger sync to update database
  debouncedSync();
};
```

### 5. Settings Component Updated

**`src/components/Settings.tsx`:**
```typescript
const handleToggleAlerts = async (enabled: boolean) => {
  try {
    await toggleLowStockAlerts(enabled);
    setShowSaveMessage(true);
    setSaveError(null);
  } catch (error) {
    setSaveError('Failed to save low stock alert setting to database');
  }
};
```

## Settings Behavior

### Database-Stored Settings

- **Low Stock Alert Toggle**: Automatically saved to database, loaded on app start
- **Cross-device sync**: Setting changes sync across all user devices
- **Offline persistence**: Setting works offline and syncs when online

### Local-Only Settings

- **Low Stock Threshold**: Still stored locally (not in database)
- **Other UI preferences**: Remain local-only

## Sync Integration

### Automatic Sync

The low stock alert setting is automatically synced through the existing sync system:

1. **Local Update**: Setting changes update local state immediately
2. **IndexedDB Update**: Changes saved to IndexedDB with `_synced: false`
3. **Background Sync**: Changes uploaded to Supabase during next sync
4. **Cross-device**: Other devices receive updates on next sync

### Sync Order

The `stores` table is synced first in the sync order, ensuring low stock alert settings are available before other dependent operations.

## Error Handling

### Graceful Degradation

- **Database errors**: Local state reverts to previous value
- **Sync failures**: Setting remains functional locally
- **Network issues**: Setting works offline, syncs when online

### User Feedback

- **Success**: Green toast notification when setting saved
- **Error**: Red toast notification with error message
- **Loading**: Visual feedback during database operations

## Testing

### Manual Testing Steps

1. **Change Setting**: Toggle low stock alert in Settings
2. **Verify Local**: Check that setting persists after app restart
3. **Check Database**: Verify setting appears in Supabase stores table
4. **Cross-device**: Test setting syncs to other devices
5. **Offline**: Test setting works when offline

### Console Logging

Look for these log messages:
- `✅ Low stock alert updated locally: true/false`
- `📦 Using cached store data:` (shows low_stock_alert field)
- Sync status messages during background sync

## Migration Notes

### Existing Stores

- All existing stores will have `low_stock_alert = true` by default
- No data loss or breaking changes
- Existing low stock alert behavior preserved

### Rollback

If rollback is needed:
```sql
-- Remove the low_stock_alert column
ALTER TABLE stores DROP COLUMN low_stock_alert;
```

## Benefits

### User Experience

- **Consistent Settings**: Low stock alert setting follows user across devices
- **Offline Support**: Setting works without internet connection
- **Immediate Response**: UI updates instantly, database syncs in background
- **Error Recovery**: Graceful handling of network/database issues

### Technical Benefits

- **Data Integrity**: Single source of truth in database
- **Sync Efficiency**: Leverages existing sync infrastructure
- **Type Safety**: Full TypeScript support for new field
- **Backward Compatibility**: No breaking changes to existing code

## Files Modified

1. `src/types/database.ts` - Added low_stock_alert to stores table types
2. `src/lib/db.ts` - Updated Store interface
3. `src/services/supabaseService.ts` - Added low_stock_alert to updateStoreSettings
4. `src/contexts/OfflineDataContext.tsx` - Implemented database-synced toggle function
5. `src/components/Settings.tsx` - Updated to handle async toggle function
6. `supabase/migrations/20250124000000_add_low_stock_alert_to_stores.sql` - Database migration

## Result

The low stock alert setting now:
- ✅ Stores in database for persistence
- ✅ Syncs across all user devices
- ✅ Works offline with local caching
- ✅ Provides immediate UI feedback
- ✅ Handles errors gracefully
- ✅ Maintains backward compatibility

The low stock alert functionality is now fully integrated with the database sync system! 🎉
