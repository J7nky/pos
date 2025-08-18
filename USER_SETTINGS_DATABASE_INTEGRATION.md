# User Settings Database Integration

This document describes how user settings are now integrated with the database to provide persistent storage across devices and sessions.

## Overview

User settings are now automatically saved to the `users` table in the database, providing:
- Persistent storage across devices
- Synchronization between online and offline modes
- Better user experience with settings that follow the user

## Database Schema

The following user preferences are stored in the `users` table:

```sql
-- User preferences stored in database
preferred_currency: 'USD' | 'LBP'           -- User's preferred display currency
preferred_language: 'en' | 'ar' | 'fr'     -- User's preferred language
preferred_commission_rate: number           -- User's default commission rate

-- Local-only preferences (not in database)
lowStockAlertsEnabled: boolean              -- Low stock alert toggle
lowStockThreshold: number                   -- Low stock threshold value
```

## Implementation Details

### 1. SupabaseService.updateUserSettings()

A new method in `SupabaseService` handles updating user preferences:

```typescript
static async updateUserSettings(
  userId: string, 
  updates: {
    preferred_currency?: 'USD' | 'LBP';
    preferred_language?: 'en' | 'ar' | 'fr';
    preferred_commission_rate?: number;
  }
)
```

### 2. Context Integration

The `SupabaseDataContext` now:
- Loads user preferences from the database on initialization
- Saves changes to the database automatically
- Falls back to local storage if database operations fail

### 3. Settings Component

The Settings component now:
- Uses both `SupabaseDataContext` and `OfflineDataContext` appropriately
- Shows success/error messages for database operations
- Handles both online and offline scenarios gracefully

## Settings Behavior

### Database-Stored Settings

- **Currency Preference**: Automatically saved to database, loaded on login
- **Language Preference**: Automatically saved to database, loaded on login  
- **Commission Rate**: Automatically saved to database, loaded on login

### Local-Only Settings

- **Low Stock Alerts**: Stored locally only (could be added to database in future)
- **Low Stock Threshold**: Stored locally only (could be added to database in future)

## Error Handling

The system includes robust error handling:
- Database failures fall back to local storage
- User is notified of save success/failure
- Settings continue to work even if database is unavailable

## Migration

Existing users will:
- Keep their current local settings
- Have new settings automatically saved to database
- Experience no disruption to their workflow

## Future Enhancements

Potential improvements:
- Add low stock alert preferences to database
- Add more user preferences (theme, notifications, etc.)
- Implement settings sync between multiple devices
- Add settings import/export functionality
