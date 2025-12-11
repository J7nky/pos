# "Reset to Default" Button - Behavior Guide

## 🎯 What It Does

**"Reset to Default"** removes your custom permission override and returns the user to their **role's default access**.

---

## 📊 Visual Examples

### Example 1: Cashier with Inventory Access (Custom Grant)

```
BEFORE Reset:
┌─────────────────────────────────────────────────────────────┐
│ Inventory                          [Custom Override] 🟡     │
│ Products, stock, receiving                                   │
│ Default for cashier: ✗ Blocked → Overridden to: ✓ Allowed   │
│                                                               │
│ Status: ✓ Allowed          [Reset to Default]                │
└─────────────────────────────────────────────────────────────┘

User's Navigation Menu:
✓ POS
✓ Inventory  ← Can access (custom)
✗ Accounting
```

**Click "Reset to Default"** → What happens:

```
AFTER Reset:
┌─────────────────────────────────────────────────────────────┐
│ Inventory                                              ⬜     │
│ Products, stock, receiving                                   │
│ Default for cashier: ✗ Blocked                               │
│                                                               │
│ Status: ✗ Blocked          [Grant] [Block (disabled)]        │
└─────────────────────────────────────────────────────────────┘

User's Navigation Menu:
✓ POS
✗ Inventory  ← Access removed (back to cashier default)
✗ Accounting
```

**Result**: 
- Custom override removed
- User loses Inventory access
- Returns to cashier default (no Inventory)
- Changes sync to ALL devices

---

### Example 2: Manager Blocked from Reports (Custom Block)

```
BEFORE Reset:
┌─────────────────────────────────────────────────────────────┐
│ Reports                            [Custom Override] 🟡     │
│ Analytics and reporting                                      │
│ Default for manager: ✓ Allowed → Overridden to: ✗ Blocked   │
│                                                               │
│ Status: ✗ Blocked          [Reset to Default]                │
└─────────────────────────────────────────────────────────────┘

User's Navigation Menu:
✓ POS
✓ Inventory
✓ Accounting
✗ Reports  ← Cannot access (custom block)
```

**Click "Reset to Default"** → What happens:

```
AFTER Reset:
┌─────────────────────────────────────────────────────────────┐
│ Reports                                                ⬜     │
│ Analytics and reporting                                      │
│ Default for manager: ✓ Allowed                               │
│                                                               │
│ Status: ✓ Allowed          [Grant (disabled)] [Block]        │
└─────────────────────────────────────────────────────────────┘

User's Navigation Menu:
✓ POS
✓ Inventory
✓ Accounting
✓ Reports  ← Access restored (back to manager default)
```

**Result**:
- Custom override removed
- User regains Reports access
- Returns to manager default (has Reports)
- Changes sync to ALL devices

---

## 🔄 Technical Flow

### Step-by-Step Process:

```
1. User Clicks "Reset to Default"
   ↓
2. Find custom override record in database
   ↓
3. Soft delete (_deleted: true, _synced: false)
   ↓
4. Physically delete from IndexedDB
   ↓
5. Sync service will sync deletion to Supabase
   ↓
6. Supabase syncs to all other devices
   ↓
7. UI reloads and shows role default
   ↓
8. Yellow → White, Reset button disappears
```

---

## 🎯 When to Use "Reset to Default"

### Use Cases:

**Scenario 1: Temporary Access No Longer Needed**
- You granted a cashier temporary access to Inventory
- They've finished the task
- Click "Reset to Default" to remove access

**Scenario 2: Policy Change**
- You blocked a manager from Settings
- Company policy changed
- Click "Reset to Default" to restore access

**Scenario 3: Clean Up Customizations**
- You want to standardize permissions
- Remove all custom overrides
- Click "Reset to Default" on all yellow rows

---

## 💡 Key Points to Remember

### 1. **Reset ≠ Block**
- Reset returns to role default (could be allowed OR blocked)
- Block explicitly denies access (creates custom override)

### 2. **Reset Only Appears on Custom Overrides**
- If row is white → no Reset button (already using default)
- If row is yellow → Reset button appears (has custom override)

### 3. **Reset Syncs Across Devices**
- Click Reset on desktop
- User's permissions update on ALL their devices
- No manual sync needed

### 4. **Reset is Reversible**
- Click Reset by accident? Just Grant/Block again
- Easy to undo

---

## 🧪 Quick Test

**Test the Reset Button**:

1. Edit a cashier user
2. Go to "Module Access" tab
3. Click "Grant" on Inventory
4. ✅ Row turns yellow, "Reset to Default" appears
5. Click "Reset to Default"
6. ✅ Row turns white, Grant/Block buttons return
7. ✅ Cashier can no longer access Inventory

**Perfect!** The Reset button is now working correctly! 🎉

---

## 📝 Summary

| Action | What Happens | UI Change | Access Change |
|--------|--------------|-----------|---------------|
| **Grant** | Create custom override (allow) | White → Yellow | Gains access |
| **Block** | Create custom override (deny) | White → Yellow | Loses access |
| **Reset** | Remove custom override | Yellow → White | Returns to role default |

The "Reset to Default" button is your **undo** button for custom permissions! ✨

