# Global Products Feature Implementation

## Overview

The system now supports **Global Predefined Products** that are accessible across all stores. This feature allows you to define a set of standard products (with name, category, and image) that will be available to all stores by default, while still allowing individual stores to create their own custom products.

## Architecture

### Database Schema Changes

#### 1. Products Table Enhancement
The `products` table has been extended with a new field:

- **`is_global`** (boolean): Indicates whether a product is globally accessible or store-specific
  - `true`: Global product, visible to all stores
  - `false` or `undefined`: Store-specific product, visible only to the creating store

#### 2. Database Types
Updated type definitions in:
- `/src/types/database.ts` - Supabase database types
- `/src/types/index.ts` - Business logic Product interface
- `/src/types/inventory.ts` - Inventory-specific Product interface

All Product interfaces now include:
```typescript
is_global?: boolean; // True for predefined global products, false/undefined for store-specific
```

### Database Migration

**Version 25 Migration** (added to `/src/lib/db.ts`):
- Adds `is_global` field to products table index
- Automatically sets `is_global = false` for all existing products (backwards compatible)
- Maintains data integrity during upgrade

## Core Functionality

### Helper Methods

The database class (`db.ts`) provides the following helper methods:

#### 1. `getAvailableProducts(storeId: string): Promise<Product[]>`
Returns all products available to a specific store (both global and store-specific).

**Usage:**
```typescript
import { db } from '@/lib/db';

// Get all products for a store
const storeId = 'store-123';
const allProducts = await db.getAvailableProducts(storeId);
// Returns: [global products] + [store-specific products]
```

#### 2. `getGlobalProducts(): Promise<Product[]>`
Returns only global predefined products.

**Usage:**
```typescript
// Get only global products
const globalProducts = await db.getGlobalProducts();
```

#### 3. `getStoreSpecificProducts(storeId: string): Promise<Product[]>`
Returns only store-specific products (excludes global products).

**Usage:**
```typescript
// Get only store-specific products
const storeProducts = await db.getStoreSpecificProducts(storeId);
```

#### 4. `createGlobalProduct(productData): Promise<string>`
Creates a new global product accessible to all stores.

**Usage:**
```typescript
const productId = await db.createGlobalProduct({
  name: 'Apple',
  category: 'Fruits',
  image: '/images/apple.jpg'
});
```

#### 5. `createStoreProduct(storeId: string, productData): Promise<string>`
Creates a new store-specific product.

**Usage:**
```typescript
const productId = await db.createStoreProduct(storeId, {
  name: 'Custom Product',
  category: 'Others',
  image: '/images/custom.jpg'
});
```

#### 6. `isProductGlobal(productId: string): Promise<boolean>`
Checks if a product is global.

**Usage:**
```typescript
const isGlobal = await db.isProductGlobal(productId);
if (isGlobal) {
  console.log('This product is available to all stores');
}
```

## Implementation Guide

### Step 1: Defining Global Products

You mentioned you'll define the predefined products later. When you're ready, here's how to do it:

**Option A: Define in Database Initialization**
```typescript
// Create a seed data file: /src/lib/seedGlobalProducts.ts
import { db } from './db';

export const GLOBAL_PRODUCTS = [
  { name: 'Apple', category: 'Fruits', image: '/images/fruits/apple.jpg' },
  { name: 'Banana', category: 'Fruits', image: '/images/fruits/banana.jpg' },
  { name: 'Orange', category: 'Fruits', image: '/images/fruits/orange.jpg' },
  { name: 'Tomato', category: 'Vegetables', image: '/images/vegetables/tomato.jpg' },
  { name: 'Potato', category: 'Vegetables', image: '/images/vegetables/potato.jpg' },
  { name: 'Basil', category: 'Herbs', image: '/images/herbs/basil.jpg' },
  { name: 'Mint', category: 'Herbs', image: '/images/herbs/mint.jpg' },
  { name: 'Almonds', category: 'Nuts', image: '/images/nuts/almonds.jpg' },
  { name: 'Cashews', category: 'Nuts', image: '/images/nuts/cashews.jpg' },
  // Add more as needed...
];

export async function seedGlobalProducts() {
  const existingGlobal = await db.getGlobalProducts();
  
  // Only seed if no global products exist
  if (existingGlobal.length === 0) {
    console.log('Seeding global products...');
    for (const product of GLOBAL_PRODUCTS) {
      await db.createGlobalProduct(product);
    }
    console.log(`✅ ${GLOBAL_PRODUCTS.length} global products seeded`);
  }
}
```

**Option B: Admin Interface for Creating Global Products**
Create an admin page/component that allows you to manage global products.

### Step 2: Using Global Products in Components

When displaying products in your store UI (e.g., inventory management, POS):

```typescript
import { db } from '@/lib/db';
import { useStore } from '@/store';

function ProductSelector() {
  const { currentStore } = useStore();
  const [products, setProducts] = useState<Product[]>([]);
  
  useEffect(() => {
    // Load all available products (global + store-specific)
    loadProducts();
  }, [currentStore?.id]);
  
  async function loadProducts() {
    if (!currentStore?.id) return;
    
    const allProducts = await db.getAvailableProducts(currentStore.id);
    setProducts(allProducts);
  }
  
  return (
    <div>
      <h2>Products</h2>
      <div>
        {products.map(product => (
          <ProductCard 
            key={product.id} 
            product={product}
            isGlobal={product.is_global}
          />
        ))}
      </div>
      
      {/* Button to create store-specific product */}
      <button onClick={handleCreateCustomProduct}>
        Create Custom Product
      </button>
    </div>
  );
}
```

### Step 3: Distinguishing Global vs Store Products in UI

You can visually distinguish global products from custom ones:

```tsx
function ProductCard({ product, isGlobal }) {
  return (
    <div className="product-card">
      <img src={product.image} alt={product.name} />
      <h3>{product.name}</h3>
      <span className="category">{product.category}</span>
      
      {/* Badge to indicate global product */}
      {isGlobal && (
        <span className="badge global">Global</span>
      )}
      
      {/* Only allow editing/deleting store-specific products */}
      {!isGlobal && (
        <div className="actions">
          <button onClick={() => handleEdit(product.id)}>Edit</button>
          <button onClick={() => handleDelete(product.id)}>Delete</button>
        </div>
      )}
    </div>
  );
}
```

## Best Practices

### 1. Store ID for Global Products
Global products use `'global'` as their `store_id`. This is a **special reserved value** that should not be used for actual stores.

**Important Notes:**
- When querying, filter by `is_global = true` to identify global products
- The `store_id = 'global'` is used for consistency with the database schema (which requires a store_id)
- In Supabase RLS policies, you must check `is_global = true` rather than `store_id = 'global'`
- Never create a real store with ID `'global'`

Example query pattern:
```typescript
// ✅ Correct: Use is_global field
const globalProducts = await db.products
  .where('is_global').equals(true)
  .toArray();

// ❌ Incorrect: Don't rely on store_id alone
const globalProducts = await db.products
  .where('store_id').equals('global')
  .toArray();
```

### 2. Preventing Global Product Modification
Global products should typically be:
- **Read-only** for regular users
- **Editable only by system administrators** (if you implement this)

```typescript
async function deleteProduct(productId: string) {
  const isGlobal = await db.isProductGlobal(productId);
  
  if (isGlobal && !isAdmin) {
    throw new Error('Cannot delete global products');
  }
  
  // Proceed with deletion for store-specific products
  await db.products.update(productId, { _deleted: true });
}
```

### 3. Syncing with Backend
When syncing with Supabase:
- Global products should be synced once to the backend
- Each store should sync their own store-specific products
- Use Row Level Security (RLS) policies to protect global products

```sql
-- Example Supabase RLS policy for products table
-- Note: You'll need to join with a stores table or have a way to determine
-- which store the current user belongs to. This is a simplified example.

-- Allow reading global products OR products from the user's store
CREATE POLICY "Allow read access to global and own store products"
  ON products FOR SELECT
  USING (
    is_global = true 
    OR 
    store_id IN (
      SELECT id FROM stores WHERE owner_user_id = auth.uid()
      -- Adjust based on your user-store relationship
    )
  );

-- Prevent creation of global products (only system admins should do this)
CREATE POLICY "Allow insert of store products only"
  ON products FOR INSERT
  WITH CHECK (
    is_global = false 
    AND 
    store_id IN (
      SELECT id FROM stores WHERE owner_user_id = auth.uid()
    )
  );

-- Allow update only for store-specific products owned by the user
CREATE POLICY "Allow update of own store products only"
  ON products FOR UPDATE
  USING (
    is_global = false 
    AND 
    store_id IN (
      SELECT id FROM stores WHERE owner_user_id = auth.uid()
    )
  );

-- Prevent deletion of global products
CREATE POLICY "Allow delete of own store products only"
  ON products FOR DELETE
  USING (
    is_global = false 
    AND 
    store_id IN (
      SELECT id FROM stores WHERE owner_user_id = auth.uid()
    )
  );

-- For global products: Create a separate policy for system administrators
-- This assumes you have an admin role in your users table
CREATE POLICY "Allow admins to manage global products"
  ON products FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'system_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'system_admin'
    )
  );
```

### 4. Search and Filtering
When implementing search functionality:

```typescript
async function searchProducts(storeId: string, searchTerm: string) {
  const allProducts = await db.getAvailableProducts(storeId);
  
  return allProducts.filter(product => 
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.category.toLowerCase().includes(searchTerm.toLowerCase())
  );
}
```

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Global Products                      │
│  (is_global = true, store_id = 'global')               │
│  - Apple, Banana, Orange, etc.                         │
└─────────────────────────────────────────────────────────┘
                           │
                           │ Available to all stores
                           ▼
        ┌──────────────────────────────────────┐
        │                                      │
        │                                      │
┌───────▼─────────┐              ┌─────────────▼────────┐
│   Store A       │              │   Store B            │
│                 │              │                      │
│ Global Products │              │ Global Products      │
│     +           │              │     +                │
│ Custom Products │              │ Custom Products      │
│ - Product A1    │              │ - Product B1         │
│ - Product A2    │              │ - Product B2         │
└─────────────────┘              └──────────────────────┘
```

## Migration Path for Existing Data

The migration (v25) automatically handles existing products:
1. All existing products get `is_global = false` (store-specific)
2. No data loss occurs
3. Stores continue to see only their own products
4. After migration, you can create global products that will appear in all stores

## Testing the Feature

```typescript
// Test script
async function testGlobalProducts() {
  const storeId1 = 'store-1';
  const storeId2 = 'store-2';
  
  // Create global products
  const globalId1 = await db.createGlobalProduct({
    name: 'Apple',
    category: 'Fruits',
    image: '/images/apple.jpg'
  });
  
  const globalId2 = await db.createGlobalProduct({
    name: 'Banana',
    category: 'Fruits',
    image: '/images/banana.jpg'
  });
  
  // Create store-specific products
  const store1ProductId = await db.createStoreProduct(storeId1, {
    name: 'Store 1 Special',
    category: 'Others',
    image: '/images/special1.jpg'
  });
  
  const store2ProductId = await db.createStoreProduct(storeId2, {
    name: 'Store 2 Special',
    category: 'Others',
    image: '/images/special2.jpg'
  });
  
  // Verify Store 1 sees: 2 global + 1 store-specific = 3 products
  const store1Products = await db.getAvailableProducts(storeId1);
  console.assert(store1Products.length === 3, 'Store 1 should see 3 products');
  
  // Verify Store 2 sees: 2 global + 1 store-specific = 3 products
  const store2Products = await db.getAvailableProducts(storeId2);
  console.assert(store2Products.length === 3, 'Store 2 should see 3 products');
  
  // Verify global products are visible to both
  const globalProducts = await db.getGlobalProducts();
  console.assert(globalProducts.length === 2, 'Should have 2 global products');
  
  console.log('✅ All tests passed!');
}
```

## Future Enhancements

Potential improvements to consider:

1. **Product Templates**: Allow stores to "clone" global products and customize them
2. **Product Categories as Global**: Make categories global as well
3. **Product Variants**: Support for product variations (e.g., different sizes)
4. **Bulk Import**: Import global products from CSV/JSON
5. **Product Approval Workflow**: Allow stores to suggest new global products
6. **Multi-language Support**: Translate global product names based on store language preference

## Troubleshooting

### Issue: Global products not appearing
**Solution**: Check that `is_global` is set to `true` and the product is not soft-deleted (`_deleted = false`)

### Issue: Cannot create global product
**Solution**: Ensure you're using the correct method `createGlobalProduct()` and not directly inserting with a store_id

### Issue: Migration errors
**Solution**: The migration is idempotent. If it fails, you can safely re-run it. All existing products will be marked as `is_global = false`

## Summary

The Global Products feature provides:
- ✅ Predefined products accessible across all stores
- ✅ Ability for stores to create custom products
- ✅ Clear separation between global and store-specific products
- ✅ Backwards compatibility with existing data
- ✅ Easy-to-use helper methods for product management
- ✅ Foundation for future enhancements

---

**Implementation Date**: November 5, 2025  
**Database Version**: v25  
**Status**: ✅ Complete and Ready for Use

