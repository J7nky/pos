# Currency Auto-Setting Implementation Summary

## 🎯 Goal
Automatically set currency fields to the store's preferred currency while allowing manual overrides through a switch in the UI.

## ✅ Implementation Complete

### 1. Database Schema
- **Already in place**: Currency fields exist in `inventory_bills` and `inventory_items` tables
- Migration v27 handles automatic currency field population from store preferences
- Fields: `currency`, `porterage_currency`, `transfer_currency`, `plastic_currency`

### 2. Type Definitions Updated

#### `/apps/store-app/src/hooks/useInventoryForms.ts`
- Added currency fields to `receiveForm` interface:
  - `porterage_currency: 'USD' | 'LBP'`
  - `transfer_currency: 'USD' | 'LBP'`
  - `plastic_currency: 'USD' | 'LBP'`
- Updated form initialization and reset functions to include currency fields

#### `/apps/store-app/src/components/inventory/ReceiveFormModal.tsx`
- Added `preferredCurrency` prop to component interface
- Updated bulk items type to include:
  - `price_currency?: 'USD' | 'LBP'`
  - `selling_price_currency?: 'USD' | 'LBP'`

### 3. Currency Switch Component

#### `/apps/store-app/src/components/common/CurrencySwitch.tsx` (NEW)
- Reusable toggle component for USD/LBP selection
- Props:
  - `value`: Current currency ('USD' | 'LBP')
  - `onChange`: Callback when currency changes
  - `disabled`: Optional disable state
  - `size`: 'sm' | 'md' | 'lg'
- Visual feedback with color-coded buttons (green for USD, blue for LBP)

### 4. Auto-Setting Logic

#### Inventory Items (`/apps/store-app/src/contexts/OfflineDataContext.tsx`)
- Line 1949: `currency: (itemData as any).currency ?? currency`
- Line 2184: `currency: (it as any).currency ?? currency`
- Automatically sets item currency to store's preferred currency if not specified

#### Bill Fees (`/apps/store-app/src/contexts/OfflineDataContext.tsx`)
- Line 2150: `currency` field in batch record automatically set to store preference

#### Receive Form Modal
- Auto-initialization effect (lines 83-116):
  - Sets `porterage_currency` to store preference when modal opens
  - Sets `transfer_currency` to store preference when modal opens
  - Sets `plastic_currency` to store preference when modal opens
  - Only updates if not already set or different from preference

### 5. UI Implementation

#### Bill-Level Currency Switch (Header)
- **Location**: Modal header (lines 432-443)
- **Single currency switch** controls all bill fees:
  - Porterage fee currency
  - Transfer fee currency
  - Plastic price currency
- **Label**: "Bill Currency"
- **Behavior**: Changing this switch updates all fee currencies simultaneously
- **Position**: Top-right of modal, next to close button

#### Bill Fee Fields (No Individual Switches)
- **Porterage Fee** (lines 601-613):
  - Input field for amount only
  - Currency controlled by bill-level switch

- **Transfer Fee** (lines 615-627):
  - Input field for amount only
  - Currency controlled by bill-level switch

- **Plastic Price** (lines 670-683):
  - Input field for amount only
  - Currency controlled by bill-level switch

#### Inventory Item Price Fields (Single Currency Switch)
- **Purchase Price Column** (lines 858-871):
  - MoneyInput field for price amount
  - No currency switch (controlled by selling price column)
  - Only shown for non-commission purchases

- **Selling Price Column** (lines 873-902):
  - MoneyInput field for selling price amount
  - **Single currency switch** controls BOTH price and selling_price
  - Changing currency updates both `price_currency` and `selling_price_currency`
  - Ensures one currency per inventory item
  - Size: Small (compact for table)

#### Product Row Initialization
- `addProductRow` function (lines 317-338):
  - Sets `price_currency` to `preferredCurrency`
  - Sets `selling_price_currency` to `preferredCurrency`
  - Ensures new items default to store preference

### 6. Integration Points

#### `/apps/store-app/src/pages/Inventory.tsx`
- Line 335: Passes `preferredCurrency={raw.currency}` to ReceiveFormModal
- Connects store preference to form component

## 📋 How It Works

### Automatic Currency Setting
1. **When opening the receive form**:
   - Modal reads store's `preferredCurrency` prop
   - Auto-sets all fee currency fields to store preference
   - Initializes new product rows with store preference

2. **When creating inventory items**:
   - Backend checks if currency is specified
   - Falls back to store's `currency` context value
   - Persists to database with correct currency

3. **When creating inventory bills**:
   - Batch record automatically includes store's currency
   - All associated fees inherit this currency

### Manual Override

#### Bill-Level Override
1. **User clicks bill currency switch** in header (USD/LBP toggle)
2. **All fee currencies update** simultaneously (porterage, transfer, plastic)
3. **Form state syncs** all fee currency fields
4. **On submit**, bill and all fees use selected currency

#### Item-Level Override
1. **User clicks item currency switch** in selling price column
2. **Both price and selling_price currencies update** for that item
3. **Other items remain unchanged** (independent selection)
4. **Ensures single currency per item** (no mixed currencies within one item)
5. **On submit**, each item saves its unified currency

## 🎨 User Experience

### Visual Feedback
- Currency switches use color coding:
  - **Green** for USD (with $ icon)
  - **Blue** for LBP (with ل.ل symbol)
- Active currency is highlighted with shadow
- Hover states for better interactivity

### Default Behavior
- All currency fields default to store preference
- Bill-level switch controls all fees uniformly
- Item-level switches allow per-item customization
- Manual changes are respected and saved

### Flexibility
- **Bill fees**: Single switch for consistency
- **Item prices**: Individual switches for flexibility
- Store preference is suggestion, not restriction
- Easy one-click currency switching

## 🔧 Technical Details

### State Management
- Currency fields stored in form state
- Synced with IndexedDB via OfflineDataContext
- Persisted across sessions

### Data Flow
```
Store Settings (preferred_currency)
    ↓
OfflineDataContext (currency state)
    ↓
ReceiveFormModal (preferredCurrency prop)
    ↓
Form State (porterage_currency, transfer_currency, etc.)
    ↓
CurrencySwitch Component (user interaction)
    ↓
Database (inventory_bills, inventory_items)
```

### Validation
- Currency fields validated during form submission
- Defaults applied if missing
- Type-safe with TypeScript

## 📊 Benefits

### For Users
- ✅ Reduced manual entry errors
- ✅ Consistent currency usage
- ✅ Easy override when needed
- ✅ Clear visual feedback

### For System
- ✅ Data consistency
- ✅ Proper currency tracking
- ✅ Accurate financial reporting
- ✅ Multi-currency support

### For Developers
- ✅ Type-safe implementation
- ✅ Reusable components
- ✅ Clean separation of concerns
- ✅ Easy to maintain and extend

## 🚀 Future Enhancements

### Potential Improvements
1. **Bulk currency change**: Change all fees at once
2. **Currency conversion**: Auto-convert between USD/LBP
3. **Currency history**: Track currency changes over time
4. **Per-supplier defaults**: Remember currency per supplier
5. **Currency validation**: Warn if mixing currencies inappropriately

## 📝 Files Modified

1. `/apps/store-app/src/hooks/useInventoryForms.ts` - Added currency fields
2. `/apps/store-app/src/components/common/CurrencySwitch.tsx` - NEW component (modern segmented control)
3. `/apps/store-app/src/components/common/MoneyInput.tsx` - Used for all money fields (smart input with recommendations)
4. `/apps/store-app/src/components/inventory/ReceiveFormModal.tsx` - Added switches, MoneyInput, and auto-setting
5. `/apps/store-app/src/pages/Inventory.tsx` - Pass preferred currency
6. `/apps/store-app/src/contexts/OfflineDataContext.tsx` - Already had auto-setting logic

## ✨ Summary

The implementation successfully achieves the goal of automatically setting currency fields to the store's preferred currency while providing an intuitive UI for manual overrides. The solution is:

- **Automatic**: Defaults to store preference
- **Flexible**: Easy manual override at two levels
- **Consistent**: Bill-level switch for fees, item-level switches for prices
- **User-friendly**: Clear visual feedback with color-coded switches
- **Maintainable**: Clean, type-safe code

### Two-Level Currency Control

1. **Bill Level** (Header Switch):
   - Controls all fee currencies uniformly
   - Porterage, transfer, and plastic fees
   - One switch for consistency

2. **Item Level** (Single Switch per Item):
   - One currency switch per inventory item
   - Controls both purchase price AND selling price
   - Ensures consistency within each item
   - Different items can have different currencies

### Smart Money Input Features

All money fields now use the **MoneyInput** component which provides:
- **Auto-recommendations**: Typing "5" suggests "5000" (adds 3 zeros)
- **Smart deletion**: Backspace clears the entire value for quick re-entry
- **Auto-complete**: Can pre-fill with suggested values on focus
- **Mobile-optimized**: Numeric keyboard with decimal support
- **Inline suggestions**: Quick-tap pill to accept recommended values

All currency fields automatically use the store's preferred currency by default, with intuitive switches available for manual adjustment when needed.
