# 🔧 Apply Database Migration v42

## The Issue

Your database schema is on an older version and needs to be upgraded to v42 to get the compound indexes.

## Quick Fix (Run in Console)

Open browser console (F12) and run:

```javascript
// Force close and delete database to trigger fresh schema
const { db } = await import('./src/lib/db.js');

console.log('Current DB version:', db.verno);

// Close the database
await db.close();

// Delete it (this forces recreation with latest schema)
await db.delete();

// Reload page - will create fresh DB with v42 schema
window.location.reload();
```

**NOTE:** This will recreate your database. Since you're pre-launch with test data only, this is safe!

## After Reload

After the page reloads:
1. Check console - should see: `🔧 Running migration v42`
2. Schema errors should disappear
3. Cash drawer balance should work

---

## Alternative: Manual Schema Check

```javascript
const { db } = await import('./src/lib/db.js');

console.log('Database Info:');
console.log('Version:', db.verno);
console.log('Tables:', db.tables.map(t => t.name));

// Check journal_entries schema
const journalTable = db.table('journal_entries');
console.log('Journal Entries Indexes:', journalTable.schema.indexes);

// Should see: [entity_id+currency+account_code], [store_id+branch_id], etc.
```


