# QR Code URL Encoding Fix

## Problem

When scanning QR codes, the route was not matching:
```
Error: No routes matched location "/public/statement/9LwgU/87yNpQCUPD8NrwxV7fJpr80YW4wDhUOYUcR04="
```

## Root Cause

The base64-encoded token contains **special characters** like:
- `/` (forward slash) - Interpreted as path separator
- `+` (plus) - Can be interpreted as space
- `=` (equals) - Used in query strings

Example token: `9LwgU/87yNpQ...`
- The `/` splits the URL into multiple segments
- React Router sees: `/public/statement/9LwgU` and `/87yNpQ...` as separate paths
- Route pattern `/public/statement/:token` doesn't match

## Solution

**URL-encode the token** when creating the URL, and **decode** when reading it.

### Changes Made

#### 1. QRCodeService - Encode Token in URL

**File:** `src/services/qrCodeService.ts`

```typescript
// Before (Broken)
const publicUrl = `${this.baseUrl}/public/statement/${token}`;
// URL: /public/statement/9LwgU/87yNpQ... ❌ Multiple path segments

// After (Fixed)
const encodedToken = encodeURIComponent(token);
const publicUrl = `${this.baseUrl}/public/statement/${encodedToken}`;
// URL: /public/statement/9LwgU%2F87yNpQ... ✅ Single path segment
```

Changes in both:
- `generateBillQRCode()` - Main method
- `generateBillQRCodeSVG()` - SVG variant

#### 2. PublicCustomerStatement - Decode Token

**File:** `src/pages/PublicCustomerStatement.tsx`

```typescript
// Before (Broken)
const { token } = useParams<{ token: string }>();
// token = "9LwgU" (truncated at /)

// After (Fixed)
const { token: encodedToken } = useParams<{ token: string }>();
const token = encodedToken ? decodeURIComponent(encodedToken) : undefined;
// token = "9LwgU/87yNpQ..." (full token restored)
```

## How URL Encoding Works

### Special Characters in Base64

Base64 encoding uses these characters:
- `A-Z`, `a-z`, `0-9` - Safe ✅
- `+` - Encoded to `%2B`
- `/` - Encoded to `%2F` 
- `=` - Encoded to `%3D`

### Example Transformation

**Original Token:**
```
9LwgU/87yNpQCUPD8NrwxV7fJpr80YW4wDhUOYUcR04=
```

**URL-Encoded Token:**
```
9LwgU%2F87yNpQCUPD8NrwxV7fJpr80YW4wDhUOYUcR04%3D
```

**URL:**
```
Before: /public/statement/9LwgU/87yNpQCUPD8NrwxV7fJpr80YW4wDhUOYUcR04=
After:  /public/statement/9LwgU%2F87yNpQCUPD8NrwxV7fJpr80YW4wDhUOYUcR04%3D
```

## Flow Diagram

```
1. Generate Token (Supabase)
   ↓
   9LwgU/87yNpQ... (raw base64)
   
2. Encode Token (QRCodeService)
   ↓
   9LwgU%2F87yNpQ... (URL-encoded)
   
3. Create QR Code
   ↓
   https://domain.com/public/statement/9LwgU%2F87yNpQ...
   
4. User Scans QR Code
   ↓
   Browser navigates to URL
   
5. React Router Matches
   ↓
   Route: /public/statement/:token
   Param: token = "9LwgU%2F87yNpQ..." (still encoded)
   
6. Decode Token (PublicCustomerStatement)
   ↓
   9LwgU/87yNpQ... (raw base64 restored)
   
7. Validate Token (Supabase)
   ↓
   Match found ✅
```

## Testing

### Test Case 1: QR Code Generation
```typescript
// Generate QR code
const result = await qrService.generateBillQRCode(customerId, null);

// Check console logs:
// - Token (raw): 9LwgU/87yNpQ...
// - Token (encoded): 9LwgU%2F87yNpQ...
// - QR URL: .../public/statement/9LwgU%2F87yNpQ...
```

### Test Case 2: QR Code Scanning
```
1. Scan QR code with phone
2. Check browser URL bar:
   Should show: /public/statement/9LwgU%2F87yNpQ...
3. Check console logs:
   - Token (encoded): 9LwgU%2F87yNpQ...
   - Token (decoded): 9LwgU/87yNpQ...
4. Page should load successfully ✅
```

### Test Case 3: Manual URL Entry
```
Bad:  /public/statement/9LwgU/87yNpQ...  ❌ (Will not match route)
Good: /public/statement/9LwgU%2F87yNpQ... ✅ (Will match route)
```

## Why This Happened

PostgreSQL's `gen_random_bytes()` generates random bytes, then we base64-encode them:

```sql
token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'base64')
```

Base64 encoding **always includes** `/`, `+`, and `=` characters, which are URL-unsafe when used in path parameters.

## Alternative Solutions (Not Used)

### Option 1: Base64URL Encoding
Replace `/` with `_` and `+` with `-`:
```sql
-- Would need custom function in PostgreSQL
-- More complex, not standard
```

### Option 2: Query Parameter
```
/public/statement?token=abc123...
```
Pros: No encoding needed
Cons: Longer QR code, less elegant URL

### Option 3: Hex Encoding
```sql
encode(gen_random_bytes(32), 'hex')
```
Pros: No special characters
Cons: Longer token (64 chars vs 44)

**We chose URL encoding** because:
- ✅ Simple and standard
- ✅ Works with existing database schema
- ✅ No migration needed
- ✅ Most reliable

## Browser Compatibility

`encodeURIComponent()` and `decodeURIComponent()` are supported in:
- ✅ All modern browsers
- ✅ IE 5.5+ (legacy)
- ✅ All mobile browsers
- ✅ Node.js

## Security Impact

**No security impact** - URL encoding:
- Does not change the token value
- Is reversible (decode gets original)
- Does not expose additional information
- Is standard practice for URLs

The token remains:
- ✅ Unique
- ✅ Random
- ✅ Secure
- ✅ Time-limited

## Files Modified

1. ✅ `src/services/qrCodeService.ts` - Encode token in URL
2. ✅ `src/pages/PublicCustomerStatement.tsx` - Decode token from URL

## No Migration Required

- No database changes needed
- Tokens are still stored as plain base64
- Encoding/decoding happens only in URLs

## Conclusion

The fix ensures that base64 tokens with special characters work correctly in URL paths by:
1. **Encoding** when creating QR codes
2. **Decoding** when reading from URL

**Status:** ✅ FIXED - QR codes now scan and route correctly!

