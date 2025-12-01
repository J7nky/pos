# Fix for Supabase Auth Admin Operations Error

## Problem
The admin app was getting "User not allowed" errors when trying to create users because it was using the anonymous key instead of the service role key for admin operations.

## Solution Steps

### 1. Add Service Role Key to Environment

Add the service role key to your `.env.local` file in the admin app:

```bash
# Add this line to apps/admin-app/.env.local
VITE_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

### 2. Get Your Service Role Key

1. Go to your Supabase project dashboard
2. Navigate to Project Settings → API
3. Copy the `service_role` key (not the `anon` key)
4. Add it to your `.env.local` file

### 3. Restart the Admin App

After adding the service role key, restart the admin app:

```bash
cd apps/admin-app
npm run dev
```

### 4. Run the RLS Fix (if not already done)

If you haven't already run the RLS recursion fix, execute the SQL in `fix_users_rls_recursion.sql` in your Supabase SQL Editor.

## What Was Fixed

1. **Environment Configuration**: Added `VITE_SUPABASE_SERVICE_ROLE_KEY` to `.env.example`
2. **Supabase Client Setup**: Created separate `supabaseAdmin` client with service role key
3. **User Service Updates**: Updated all admin auth operations to use `supabaseAdmin`:
   - `createUser()` - uses `supabaseAdmin.auth.admin.createUser()`
   - `deleteUser()` - uses `supabaseAdmin.auth.admin.deleteUser()`
   - `resetUserPassword()` - uses `supabaseAdmin.auth.admin.updateUserById()`

## Security Notes

- The service role key should only be used on the server-side or in admin interfaces
- Never expose the service role key in client-side code for public applications
- The admin app is considered a trusted admin interface, so service role usage is appropriate

## Testing

After applying these fixes:
1. Try creating a new user in the admin app
2. The "User not allowed" error should be resolved
3. Users should be created successfully in both Supabase Auth and the users table
