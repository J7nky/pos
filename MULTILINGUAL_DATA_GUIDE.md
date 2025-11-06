# Multilingual Data Handling Guide

This guide explains how to handle multiple languages for database records like product names and transaction descriptions.

## Overview

The system now supports storing multilingual data in the database. You can store:
- **Product names**: `{ en: "apple", ar: "تفاح", fr: "pomme" }`
- **Transaction descriptions**: `{ en: "Payment received", ar: "تم استلام الدفع", fr: "Paiement reçu" }`

The system is **backwards compatible** - existing string values will continue to work seamlessly.

## Architecture

### Data Types

Multilingual data can be stored as:
- **Simple string** (backwards compatible): `"apple"`
- **Multilingual object**: `{ en: "apple", ar: "تفاح", fr: "pomme" }`

The system automatically detects the format and displays the appropriate translation based on the user's language preference.

### Supported Languages

- `en` - English
- `ar` - Arabic
- `fr` - French

## Usage

### 1. Creating Products with Multilingual Names

```typescript
import { db } from '@/lib/db';

// Option 1: Simple string (backwards compatible)
await db.products.add({
  id: 'product-1',
  name: 'apple', // Will be displayed as-is
  category: 'Fruits',
  image: 'apple.jpg',
  store_id: 'store-1',
  // ... other fields
});

// Option 2: Multilingual object
await db.products.add({
  id: 'product-2',
  name: {
    en: 'apple',
    ar: 'تفاح',
    fr: 'pomme'
  },
  category: 'Fruits',
  image: 'apple.jpg',
  store_id: 'store-1',
  // ... other fields
});
```

### 2. Creating Transactions with Multilingual Descriptions

```typescript
import { addTransaction } from '@/contexts/OfflineDataContext';

// Option 1: Simple string
await addTransaction({
  type: 'income',
  category: 'Customer Payment',
  amount: 100,
  currency: 'USD',
  description: 'Payment received', // Simple string
  // ... other fields
});

// Option 2: Multilingual object
await addTransaction({
  type: 'income',
  category: 'Customer Payment',
  amount: 100,
  currency: 'USD',
  description: {
    en: 'Payment received',
    ar: 'تم استلام الدفع',
    fr: 'Paiement reçu'
  },
  // ... other fields
});
```

### 3. Displaying Multilingual Data in Components

Use the `useMultilingual` hook to display translated data:

```tsx
import { useMultilingual } from '@/hooks/useMultilingual';

function ProductCard({ product }: { product: Product }) {
  const { getText } = useMultilingual();
  
  return (
    <div>
      <h3>{getText(product.name)}</h3>
      {/* Automatically displays the correct translation based on current language */}
    </div>
  );
}
```

### 4. Using Product-Specific Helper

```tsx
import { useProductMultilingual } from '@/hooks/useMultilingual';

function ProductList({ products }: { products: Product[] }) {
  const { getProductName } = useProductMultilingual();
  
  return (
    <ul>
      {products.map(product => (
        <li key={product.id}>{getProductName(product)}</li>
      ))}
    </ul>
  );
}
```

### 5. Using Transaction-Specific Helper

```tsx
import { useTransactionMultilingual } from '@/hooks/useMultilingual';

function TransactionList({ transactions }: { transactions: Transaction[] }) {
  const { getTransactionDescription } = useTransactionMultilingual();
  
  return (
    <ul>
      {transactions.map(transaction => (
        <li key={transaction.id}>
          {getTransactionDescription(transaction)}
        </li>
      ))}
    </ul>
  );
}
```

## Utility Functions

### Direct Utility Functions

If you need to work with multilingual data outside of React components:

```typescript
import { 
  getTranslatedString,
  createMultilingualFromString,
  updateMultilingual,
  mergeMultilingual
} from '@/utils/multilingual';

// Get translation for specific language
const productName = getTranslatedString(product.name, 'ar', 'en'); // Returns Arabic translation, falls back to English

// Convert existing string to multilingual format
const multilingualName = createMultilingualFromString('apple');
// Result: { en: 'apple', ar: 'apple', fr: 'apple' }

// Update a specific language translation
const updated = updateMultilingual(product.name, 'ar', 'تفاح');
// Updates or adds Arabic translation

// Merge multilingual objects
const merged = mergeMultilingual(existingTranslations, newTranslations);
```

## Migration Guide

### Migrating Existing String Data

If you have existing products with simple string names and want to convert them to multilingual:

```typescript
import { db } from '@/lib/db';
import { createMultilingualFromString } from '@/utils/multilingual';

// Get all products
const products = await db.products.toArray();

// Convert each product name to multilingual format
for (const product of products) {
  if (typeof product.name === 'string') {
    await db.products.update(product.id, {
      name: createMultilingualFromString(product.name)
    });
  }
}
```

### Adding Translations to Existing Products

```typescript
import { db } from '@/lib/db';
import { updateMultilingual } from '@/utils/multilingual';

// Update product with Arabic translation
const product = await db.products.get('product-id');
if (product) {
  const updatedName = updateMultilingual(product.name, 'ar', 'تفاح');
  await db.products.update(product.id, { name: updatedName });
}
```

## Best Practices

1. **Always use the hooks** - Use `useMultilingual()` or specific hooks like `useProductMultilingual()` when displaying multilingual data in components.

2. **Store translations when creating** - When creating new products or transactions, provide multilingual translations if available:
   ```typescript
   {
     name: {
       en: 'apple',
       ar: 'تفاح',
       fr: 'pomme'
     }
   }
   ```

3. **Backwards compatibility** - The system supports both string and multilingual objects. Existing string data will continue to work without modification.

4. **Fallback behavior** - If a translation is not available for the current language, the system will:
   - Try English (`en`) as fallback
   - Try Arabic (`ar`) as secondary fallback
   - Return the first available translation
   - Return empty string if no translations exist

5. **Search and filtering** - When searching or filtering products, consider searching in all languages:
   ```typescript
   const searchTerm = 'apple';
   const products = await db.products
     .filter(p => {
       const name = typeof p.name === 'string' ? p.name : 
         (p.name.en || p.name.ar || p.name.fr || '');
       return name.toLowerCase().includes(searchTerm.toLowerCase());
     })
     .toArray();
   ```

## Database Schema

The database schema supports multilingual data natively through IndexedDB's JSON storage:

- **Product.name**: `string | { en: string, ar: string, fr: string }`
- **Transaction.description**: `string | { en: string, ar: string, fr: string }`

No database migration is required - IndexedDB automatically handles JSON objects.

## Examples

### Example: Product Form with Multilingual Input

```tsx
import { useState } from 'react';
import { useMultilingual } from '@/hooks/useMultilingual';

function ProductForm() {
  const { currentLanguage } = useMultilingual();
  const [name, setName] = useState({
    en: '',
    ar: '',
    fr: ''
  });

  const handleSubmit = async () => {
    await db.products.add({
      id: generateId(),
      name, // Multilingual object
      category: 'Fruits',
      // ... other fields
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        placeholder="English name"
        value={name.en}
        onChange={(e) => setName({ ...name, en: e.target.value })}
      />
      <input
        placeholder="الاسم بالعربية"
        value={name.ar}
        onChange={(e) => setName({ ...name, ar: e.target.value })}
      />
      <input
        placeholder="Nom en français"
        value={name.fr}
        onChange={(e) => setName({ ...name, fr: e.target.value })}
      />
      <button type="submit">Create Product</button>
    </form>
  );
}
```

### Example: Displaying Product with Language Switcher

```tsx
import { useState } from 'react';
import { useI18n } from '@/i18n';
import { getTranslatedString } from '@/utils/multilingual';

function ProductDisplay({ product }: { product: Product }) {
  const { language, setLanguage } = useI18n();
  const [displayLanguage, setDisplayLanguage] = useState(language);

  const productName = getTranslatedString(product.name, displayLanguage as any);

  return (
    <div>
      <h2>{productName}</h2>
      <select 
        value={displayLanguage} 
        onChange={(e) => setDisplayLanguage(e.target.value)}
      >
        <option value="en">English</option>
        <option value="ar">العربية</option>
        <option value="fr">Français</option>
      </select>
    </div>
  );
}
```

## Troubleshooting

### Issue: Product name displays as "[object Object]"

**Solution**: Make sure you're using the `getText()` function from `useMultilingual()` hook:
```tsx
// ❌ Wrong
<div>{product.name}</div>

// ✅ Correct
const { getText } = useMultilingual();
<div>{getText(product.name)}</div>
```

### Issue: Translations not showing for existing data

**Solution**: Existing string data is backwards compatible and will display as-is. To add translations, update the records:
```typescript
await db.products.update(productId, {
  name: {
    en: product.name, // Keep existing value
    ar: 'تفاح', // Add Arabic
    fr: 'pomme' // Add French
  }
});
```

## Summary

- ✅ Backwards compatible with existing string data
- ✅ Supports multilingual objects: `{ en: "...", ar: "...", fr: "..." }`
- ✅ Automatic translation based on user's language preference
- ✅ Fallback to English if translation not available
- ✅ Easy-to-use hooks for React components
- ✅ Utility functions for non-React code

The multilingual system is now fully integrated and ready to use!

