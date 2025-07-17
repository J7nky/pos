# Demo User Setup Guide

Follow these steps to create a demo/test user for development:

## Step 1: Create Auth User in Supabase Dashboard

1. **Go to your Supabase project dashboard**
   - Navigate to [supabase.com](https://supabase.com)
   - Select your project

2. **Create the authentication user**
   - Go to **Authentication** > **Users**
   - Click **"Add user"** or **"Invite"**
   - Fill in the details:
     ```
     Email: demo@market.com
     Password: demo123
     ```
   - **Important**: Copy the User ID that gets generated (it looks like: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`)

## Step 2: Update the User Profile

1. **Run the demo user migration**
   - Execute the SQL in `supabase/migrations/003_create_demo_user.sql`
   - This creates the store and sample data

2. **Update the user profile with the real auth user ID**
   - In your Supabase SQL editor, run:
   ```sql
   UPDATE users 
   SET id = 'YOUR_ACTUAL_AUTH_USER_ID_HERE'
   WHERE id = 'demo-user-id-placeholder';
   ```
   - Replace `YOUR_ACTUAL_AUTH_USER_ID_HERE` with the User ID from Step 1

## Step 3: Test the Demo User

1. **Start your development server**
   ```bash
   npm run dev
   ```

2. **Login with demo credentials**
   - Email: `demo@market.com`
   - Password: `demo123`

3. **Verify the setup**
   - You should see the demo store data
   - Sample products, suppliers, and customers should be available
   - All modules should work with the demo data

## Alternative: Quick Setup Script

If you prefer, you can also create the auth user programmatically:

```javascript
// Run this in your browser console on the Supabase dashboard
const { data, error } = await supabase.auth.admin.createUser({
  email: 'demo@market.com',
  password: 'demo123',
  email_confirm: true
});

console.log('User created:', data.user.id);
// Use this ID to update the users table
```

## Demo User Details

- **Email**: demo@market.com
- **Password**: demo123
- **Role**: Admin (full access)
- **Store**: Demo Wholesale Market
- **Sample Data**: Products, suppliers, customers, and expense categories included

## Troubleshooting

- **"User not found" error**: Make sure you've updated the users table with the correct auth user ID
- **"Access denied" error**: Check that the user's store_id matches the store in the stores table
- **Login fails**: Verify the email and password are correct in Supabase Auth

The demo user will have access to all features and sample data for testing the application.