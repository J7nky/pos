# Admin Database Setup Guide

## ✅ Use the SAME Database

**You DON'T need a new database!** The admin app should use the **same Supabase database** as your store app, but with different access controls.

## Why Use the Same Database?

1. **Single Source of Truth** - All data in one place
2. **Shared Data** - Global products, stores, subscriptions are shared
3. **Easier Management** - One database to manage, backup, and sync
4. **Cost Effective** - No need for separate database instances
5. **Data Consistency** - Changes reflect immediately across both apps

## Database Schema Changes Needed

### 1. Create Admin Users Table

```sql
-- Create admin_users table for admin authentication
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('super_admin', 'admin')),
  stores UUID[], -- Array of store IDs they can manage (empty = all stores)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP,
  is_active BOOLEAN DEFAULT true
);

-- Create index for faster lookups
CREATE INDEX idx_admin_users_email ON admin_users(email);
CREATE INDEX idx_admin_users_role ON admin_users(role);
CREATE INDEX idx_admin_users_active ON admin_users(is_active);

-- Enable RLS
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only admins can view admin_users
CREATE POLICY "Admins can view admin_users"
ON admin_users FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admin_users
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'admin')
    AND is_active = true
  )
);
```

### 2. Update Products Table RLS Policies

```sql
-- Allow super admins to create global products
CREATE POLICY "Super admins can create global products"
ON products FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM admin_users
    WHERE id = auth.uid()
    AND role = 'super_admin'
    AND is_active = true
  )
  AND is_global = true
);

-- Allow super admins to update global products
CREATE POLICY "Super admins can update global products"
ON products FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admin_users
    WHERE id = auth.uid()
    AND role = 'super_admin'
    AND is_active = true
  )
  AND is_global = true
);

-- Allow super admins to delete global products
CREATE POLICY "Super admins can delete global products"
ON products FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admin_users
    WHERE id = auth.uid()
    AND role = 'super_admin'
    AND is_active = true
  )
  AND is_global = true
);
```

### 3. Create Store Subscriptions Table

```sql
-- Create store_subscriptions table
CREATE TABLE IF NOT EXISTS store_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  plan VARCHAR(50) NOT NULL CHECK (plan IN ('basic', 'premium', 'enterprise')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'expired', 'cancelled', 'trial')),
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) NOT NULL CHECK (currency IN ('USD', 'LBP')),
  billing_cycle VARCHAR(20) NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  cancelled_at TIMESTAMP,
  cancellation_reason TEXT
);

-- Create index for faster lookups
CREATE INDEX idx_store_subscriptions_store_id ON store_subscriptions(store_id);
CREATE INDEX idx_store_subscriptions_status ON store_subscriptions(status);
CREATE INDEX idx_store_subscriptions_end_date ON store_subscriptions(end_date);

-- Enable RLS
ALTER TABLE store_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Admins can view all subscriptions
CREATE POLICY "Admins can view all subscriptions"
ON store_subscriptions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admin_users
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'admin')
    AND is_active = true
  )
);

-- RLS Policy: Store owners can view their own subscriptions
CREATE POLICY "Store owners can view own subscriptions"
ON store_subscriptions FOR SELECT
TO authenticated
USING (
  store_id IN (
    SELECT store_id FROM users
    WHERE id = auth.uid()
  )
);
```

### 4. Create Payments Table

```sql
-- Create payments table for subscription payments
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_subscription_id UUID REFERENCES store_subscriptions(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) NOT NULL CHECK (currency IN ('USD', 'LBP')),
  payment_method VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  transaction_id VARCHAR(255),
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  notes TEXT
);

-- Create index for faster lookups
CREATE INDEX idx_payments_subscription_id ON payments(store_subscription_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_paid_at ON payments(paid_at);

-- Enable RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Admins can view all payments
CREATE POLICY "Admins can view all payments"
ON payments FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admin_users
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'admin')
    AND is_active = true
  )
);

-- RLS Policy: Store owners can view their own payments
CREATE POLICY "Store owners can view own payments"
ON payments FOR SELECT
TO authenticated
USING (
  store_subscription_id IN (
    SELECT id FROM store_subscriptions
    WHERE store_id IN (
      SELECT store_id FROM users
      WHERE id = auth.uid()
    )
  )
);
```

## Migration File

Create a new migration file: `supabase/migrations/[timestamp]_create_admin_tables.sql`

```sql
-- Migration: Create admin tables and policies
-- This migration adds admin functionality to the existing database

-- 1. Admin Users Table
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('super_admin', 'admin')),
  stores UUID[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP,
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON admin_users(role);
CREATE INDEX IF NOT EXISTS idx_admin_users_active ON admin_users(is_active);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- 2. Store Subscriptions Table
CREATE TABLE IF NOT EXISTS store_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  plan VARCHAR(50) NOT NULL CHECK (plan IN ('basic', 'premium', 'enterprise')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'expired', 'cancelled', 'trial')),
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) NOT NULL CHECK (currency IN ('USD', 'LBP')),
  billing_cycle VARCHAR(20) NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  cancelled_at TIMESTAMP,
  cancellation_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_store_subscriptions_store_id ON store_subscriptions(store_id);
CREATE INDEX IF NOT EXISTS idx_store_subscriptions_status ON store_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_store_subscriptions_end_date ON store_subscriptions(end_date);

ALTER TABLE store_subscriptions ENABLE ROW LEVEL SECURITY;

-- 3. Payments Table
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_subscription_id UUID REFERENCES store_subscriptions(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) NOT NULL CHECK (currency IN ('USD', 'LBP')),
  payment_method VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  transaction_id VARCHAR(255),
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_payments_subscription_id ON payments(store_subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments(paid_at);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for admin_users
CREATE POLICY "Admins can view admin_users"
ON admin_users FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admin_users
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'admin')
    AND is_active = true
  )
);

-- RLS Policies for store_subscriptions
CREATE POLICY "Admins can view all subscriptions"
ON store_subscriptions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admin_users
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'admin')
    AND is_active = true
  )
);

CREATE POLICY "Store owners can view own subscriptions"
ON store_subscriptions FOR SELECT
TO authenticated
USING (
  store_id IN (
    SELECT store_id FROM users
    WHERE id = auth.uid()
  )
);

-- RLS Policies for payments
CREATE POLICY "Admins can view all payments"
ON payments FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admin_users
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'admin')
    AND is_active = true
  )
);

CREATE POLICY "Store owners can view own payments"
ON payments FOR SELECT
TO authenticated
USING (
  store_subscription_id IN (
    SELECT id FROM store_subscriptions
    WHERE store_id IN (
      SELECT store_id FROM users
      WHERE id = auth.uid()
    )
  )
);

-- Update products RLS policies for global product management
CREATE POLICY "Super admins can create global products"
ON products FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM admin_users
    WHERE id = auth.uid()
    AND role = 'super_admin'
    AND is_active = true
  )
  AND is_global = true
);

CREATE POLICY "Super admins can update global products"
ON products FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admin_users
    WHERE id = auth.uid()
    AND role = 'super_admin'
    AND is_active = true
  )
  AND is_global = true
);

CREATE POLICY "Super admins can delete global products"
ON products FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admin_users
    WHERE id = auth.uid()
    AND role = 'super_admin'
    AND is_active = true
  )
  AND is_global = true
);
```

## Create Initial Super Admin User

After running the migration, create your first super admin user:

```sql
-- Create super admin user (replace with your actual email and user ID)
INSERT INTO admin_users (id, email, name, role, stores, is_active)
VALUES (
  'YOUR_AUTH_USER_ID', -- Get this from Supabase Auth
  'admin@example.com',
  'Super Admin',
  'super_admin',
  ARRAY[]::UUID[], -- Empty array = can manage all stores
  true
);
```

Or do it programmatically in your admin app:

```typescript
// apps/admin-app/src/services/adminService.ts
export async function createSuperAdmin(userId: string, email: string, name: string) {
  const { data, error } = await supabase
    .from('admin_users')
    .insert({
      id: userId,
      email,
      name,
      role: 'super_admin',
      stores: [],
      is_active: true,
    });

  if (error) throw error;
  return data;
}
```

## Summary

✅ **Use the SAME database** - No new database needed  
✅ **Add new tables** - `admin_users`, `store_subscriptions`, `payments`  
✅ **Update RLS policies** - Different access for admin vs store users  
✅ **Keep existing data** - All your current data stays intact  

The admin app will use the same Supabase URL and anon key, but with different RLS policies that check for admin users.

