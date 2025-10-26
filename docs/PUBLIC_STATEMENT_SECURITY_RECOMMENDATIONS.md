# Public Customer Statement Security Recommendations

## Current Security Issues

### Critical Vulnerabilities
1. **Unrestricted Data Access**: RLS policies with `USING (true)` allow anonymous users to read ALL data
2. **Client-side Filtering Only**: Data filtering happens in React, not at database level
3. **No URL Validation**: Anyone can construct URLs to access other customers' data
4. **No Expiration**: QR codes work indefinitely
5. **No Audit Trail**: No logging of access attempts

## Recommended Security Improvements

### Option 1: Server-Side Access Tokens (RECOMMENDED)

#### Implementation
1. Generate time-limited access tokens when creating bills
2. Store tokens in a new `public_access_tokens` table
3. Validate tokens server-side before allowing data access

```sql
-- Create access tokens table
CREATE TABLE public_access_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  bill_id UUID NOT NULL REFERENCES bills(id),
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accessed_at TIMESTAMPTZ,
  access_count INT DEFAULT 0,
  revoked BOOLEAN DEFAULT false
);

-- Index for fast token lookups
CREATE INDEX idx_public_access_tokens_token ON public_access_tokens(token) WHERE NOT revoked;

-- RLS policy for token validation
CREATE POLICY "Validate access tokens"
ON customers FOR SELECT
TO anon
USING (
  id IN (
    SELECT customer_id 
    FROM public_access_tokens 
    WHERE token = current_setting('app.access_token', true)
    AND expires_at > NOW()
    AND NOT revoked
  )
);
```

#### Benefits
- Tokens expire automatically (e.g., 90 days)
- Tokens can be revoked if needed
- Access is logged and counted
- Database-level security enforcement

#### QR Code Format
```
https://yourapp.com/public/statement?token=abc123xyz...
```

---

### Option 2: Row-Level Security with URL Parameters

#### Implementation
Use PostgreSQL's `current_setting()` to pass customer_id securely:

```sql
-- Secure RLS policy for customers
CREATE POLICY "Public customers can read own data"
ON customers FOR SELECT
TO anon
USING (
  id::text = current_setting('request.jwt.claim.customer_id', true)
  OR id::text = current_setting('app.customer_id', true)
);

-- Secure RLS policy for bill_line_items
CREATE POLICY "Public read access for customer bill_line_items"
ON bill_line_items FOR SELECT
TO anon
USING (
  customer_id::text = current_setting('app.customer_id', true)
);

-- Similar for other tables...
```

#### Implementation in React
```typescript
// Set customer_id in session before queries
await supabase.rpc('set_customer_context', { 
  p_customer_id: customerId 
});

// Then fetch data - RLS will automatically filter
const { data } = await supabase
  .from('bill_line_items')
  .select('*'); // RLS filters to customer_id automatically
```

#### Benefits
- Database-level filtering
- No client-side manipulation possible
- Still relatively simple to implement

---

### Option 3: Supabase Edge Functions (Most Secure)

#### Implementation
Create a server-side Edge Function to validate and serve data:

```typescript
// supabase/functions/customer-statement/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const { token } = await req.json()
  
  // Create admin client (bypass RLS)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! // Admin access
  )
  
  // Validate token
  const { data: tokenData, error } = await supabase
    .from('public_access_tokens')
    .select('customer_id, bill_id, expires_at, revoked')
    .eq('token', token)
    .single()
  
  if (error || !tokenData || tokenData.revoked) {
    return new Response('Invalid token', { status: 401 })
  }
  
  if (new Date(tokenData.expires_at) < new Date()) {
    return new Response('Token expired', { status: 401 })
  }
  
  // Log access
  await supabase
    .from('public_access_tokens')
    .update({ 
      accessed_at: new Date().toISOString(),
      access_count: tokenData.access_count + 1
    })
    .eq('token', token)
  
  // Fetch and return data (filtered by customer_id)
  const { data: customerData } = await supabase
    .from('customers')
    .select('*')
    .eq('id', tokenData.customer_id)
    .single()
  
  const { data: billLineItems } = await supabase
    .from('bill_line_items')
    .select('*')
    .eq('customer_id', tokenData.customer_id)
  
  // ... fetch other data ...
  
  return new Response(JSON.stringify({
    customer: customerData,
    billLineItems,
    // ... other data
  }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

#### Benefits
- Complete server-side validation
- No direct database access from client
- Full control over data exposure
- Proper audit logging
- Most secure option

---

## Additional Security Measures

### 1. Rate Limiting
Implement rate limiting to prevent abuse:
```sql
-- Track access attempts
CREATE TABLE access_logs (
  ip_address INET,
  accessed_at TIMESTAMPTZ DEFAULT NOW(),
  token TEXT,
  success BOOLEAN
);

-- Limit to 10 requests per minute per IP
CREATE INDEX idx_access_logs_ip_time ON access_logs(ip_address, accessed_at);
```

### 2. Data Minimization
Only expose necessary fields:
```typescript
// Instead of select('*'), be specific
const { data } = await supabase
  .from('bill_line_items')
  .select(`
    id,
    product_name,
    quantity,
    unit_price,
    line_total,
    created_at
  `)
  .eq('customer_id', customerId);
```

### 3. HTTPS Only
Ensure all requests use HTTPS to prevent token interception.

### 4. Token Rotation
Allow customers to regenerate tokens if compromised:
```sql
-- Revoke old token and generate new one
UPDATE public_access_tokens 
SET revoked = true 
WHERE customer_id = $1 AND bill_id = $2;

INSERT INTO public_access_tokens (customer_id, bill_id, token, expires_at)
VALUES ($1, $2, generate_random_token(), NOW() + INTERVAL '90 days');
```

### 5. Sensitive Data Masking
Consider masking sensitive information in public views:
```typescript
// Mask phone numbers
const maskedPhone = customer.phone.replace(/(\d{3})\d{4}(\d{3})/, '$1****$2');
```

---

## Implementation Priority

### Immediate (Must Do)
1. ✅ Implement Option 1 (Access Tokens) - Provides immediate security
2. ✅ Add token expiration (90 days recommended)
3. ✅ Change RLS policies to validate tokens

### Short Term (Should Do)
4. ✅ Add rate limiting
5. ✅ Implement access logging
6. ✅ Data minimization (only expose necessary fields)

### Long Term (Nice to Have)
7. ⚪ Migrate to Edge Functions (Option 3)
8. ⚪ Add customer notification on first access
9. ⚪ Implement token rotation
10. ⚪ Add analytics dashboard for access patterns

---

## Example: Complete Secure Implementation

### Step 1: Create Token System
```sql
-- Run this migration
CREATE TABLE public_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  bill_id UUID NOT NULL REFERENCES bills(id),
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'base64'),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accessed_at TIMESTAMPTZ,
  access_count INT DEFAULT 0,
  revoked BOOLEAN DEFAULT false,
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX idx_public_access_tokens_token ON public_access_tokens(token) WHERE NOT revoked AND expires_at > NOW();
CREATE INDEX idx_public_access_tokens_customer ON public_access_tokens(customer_id);
```

### Step 2: Update RLS Policies
```sql
-- Replace existing policies with secure token-based ones
DROP POLICY IF EXISTS "Public customers can read own data" ON customers;
DROP POLICY IF EXISTS "Public read access for customer bill_line_items" ON bill_line_items;

CREATE POLICY "Token-based customer access"
ON customers FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public_access_tokens
    WHERE token = current_setting('app.access_token', true)
    AND customer_id = customers.id
    AND expires_at > NOW()
    AND NOT revoked
  )
);

CREATE POLICY "Token-based bill_line_items access"
ON bill_line_items FOR SELECT
TO anon
USING (
  customer_id IN (
    SELECT customer_id FROM public_access_tokens
    WHERE token = current_setting('app.access_token', true)
    AND expires_at > NOW()
    AND NOT revoked
  )
);
```

### Step 3: Generate Tokens When Creating Bills
```typescript
// In your POS system, after creating a bill
const { data: token } = await supabase
  .from('public_access_tokens')
  .insert({
    customer_id: customerId,
    bill_id: billId,
    expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days
  })
  .select('token')
  .single();

// Generate QR code with token
const qrUrl = `${window.location.origin}/public/statement?token=${token.token}`;
```

### Step 4: Update PublicCustomerStatement Component
```typescript
// Extract token from URL instead of customer_id/bill_id
const { token } = useParams<{ token: string }>();

// Validate token and set context before fetching data
const validateAndFetch = async () => {
  // First, validate the token and get customer_id
  const { data: tokenData, error } = await supabase
    .from('public_access_tokens')
    .select('customer_id, bill_id, expires_at, revoked')
    .eq('token', token)
    .single();
  
  if (error || !tokenData || tokenData.revoked) {
    setError('Invalid or expired access link');
    return;
  }
  
  if (new Date(tokenData.expires_at) < new Date()) {
    setError('This link has expired');
    return;
  }
  
  // Set the token in session context for RLS
  await supabase.rpc('set_access_token', { p_token: token });
  
  // Now fetch data - RLS will automatically filter
  const { data: customerData } = await supabase
    .from('customers')
    .select('*')
    .single(); // RLS ensures only matching customer
    
  // Continue with other fetches...
};
```

---

## Testing Security

### Test Cases
1. ✅ Try accessing with expired token - should fail
2. ✅ Try accessing with invalid token - should fail
3. ✅ Try accessing with revoked token - should fail
4. ✅ Try to access other customer's data with valid token - should fail
5. ✅ Try manipulating URL parameters - should fail
6. ✅ Try direct Supabase API calls without token - should fail

---

## Compliance Considerations

### GDPR Compliance
- Implement token expiration (right to be forgotten)
- Add access logging (audit trail)
- Allow token revocation (data access control)
- Provide data export functionality

### PCI DSS (if handling payment data)
- Use HTTPS only
- Implement rate limiting
- Log all access attempts
- Regular security audits

---

## Conclusion

**Current Status**: 🔴 **INSECURE** - Anonymous users can access all customer data

**Recommended Action**: Implement Option 1 (Access Tokens) immediately to secure the feature before deploying to production.

The token-based approach provides a good balance of security and usability while being relatively straightforward to implement.

