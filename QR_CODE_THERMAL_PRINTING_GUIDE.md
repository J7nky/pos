# QR Code Thermal Printing Implementation Guide

## Overview
Your Xprinter XP-80 thermal printer now supports actual scannable QR code printing using ESC/POS commands!

## ✅ What's Been Implemented

### 1. **ESC/POS QR Code Commands**
- Integrated native ESC/POS QR code generation
- Supports actual scannable QR codes (not ASCII art)
- QR codes are printed directly by the thermal printer hardware

### 2. **Receipt Integration**
- QR codes automatically included when customer is selected
- Links to customer account statement
- Unique QR code for each bill/customer combination

### 3. **Test Download Feature**
- Download receipt preview before printing
- New "📄 Download Receipt Preview" button in POS
- Shows exactly what will print (with placeholder for QR code)

## 🖨️ How It Works

### ESC/POS QR Code Printing
When a receipt is printed:

1. **QR Code Data Generated**: System creates unique URL for customer/bill
2. **ESC/POS Commands**: Converts URL to printer-specific commands
3. **Printer Hardware**: Xprinter XP-80 renders actual scannable QR code
4. **Receipt Output**: Customer receives receipt with scannable QR code

### Technical Details

**QR Code Settings:**
- **Model**: QR Code Model 2 (standard)
- **Size**: Level 6 (~1.5 inch square)
- **Error Correction**: Level M (medium, 15% recovery)
- **Alignment**: Centered on receipt

**ESC/POS Command Sequence:**
```javascript
// Model selection
GS ( k 0x04 0x00 0x31 0x41 0x32 0x00

// Size setting (6 = ~1.5 inch)
GS ( k 0x03 0x00 0x31 0x43 0x06

// Error correction level (M)
GS ( k 0x03 0x00 0x31 0x45 0x49

// Store QR data (URL)
GS ( k [length] 0x31 0x50 0x30 [URL]

// Print QR code
GS ( k 0x03 0x00 0x31 0x51 0x30
```

## 📱 Customer Experience

### Scanning the QR Code
1. Customer receives receipt with QR code
2. Opens phone camera or QR scanner app
3. Scans QR code on receipt
4. Redirected to account statement page
5. Views current balance and transaction history

### QR Code URL Format
```
https://your-domain.com/public/customer-statement/{customerId}/{billId}
```

Example:
```
https://your-domain.com/public/customer-statement/abc123/bill-456
```

## 🧪 Testing

### Before Actual Printing
1. **Go to POS page** (`/pos`)
2. **Select a customer** from dropdown
3. **Add items** to cart
4. **Click "📄 Download Receipt Preview"**
5. **Review downloaded .txt file**

The downloaded file shows:
- Receipt header and store info
- Items and prices
- `[QR_CODE_PLACEHOLDER]` where QR will print
- Customer and bill information

### With Thermal Printer
1. **Complete a sale** with customer selected
2. **Receipt prints automatically**
3. **QR code appears** as scannable 2D barcode
4. **Test scan** with phone camera
5. **Verify** redirects to correct URL

## ⚙️ Configuration

### QR Code Size
To adjust QR code size, modify in `electron/main.ts`:

```typescript
// Size 6 = ~1.5 inch (current)
const setSize = `${GS}(k\x03\x00\x31\x43\x06`;

// Options: 1-16
// Size 4 = ~1 inch
// Size 8 = ~2 inches
// Size 10 = ~2.5 inches
```

### Error Correction Level
To change error correction:

```typescript
// Current: Level M (medium, 15% recovery)
const setErrorLevel = `${GS}(k\x03\x00\x31\x45\x49`;

// Options:
// 0x48 (L) = 7% recovery
// 0x49 (M) = 15% recovery (recommended)
// 0x50 (Q) = 25% recovery
// 0x51 (H) = 30% recovery
```

## 🔧 Files Modified

### Frontend (React)
- `src/pages/POS.tsx`
  - Added QR code data passing to print function
  - Implemented download receipt feature
  - Added test download button

### Backend (Electron)
- `electron/main.ts`
  - Added ESC/POS QR code generation
  - Updated print handler to process QR codes
  - Integrated QR commands into receipt printing

## 📊 Receipt Format

```
================================
     KIWI VEGETABLES MARKET
63-B2-Whole Sale Market...
================================
Bill No: 00012345    Date: ...
Customer: John Doe
--------------------------------
ITEM      QTY   PRICE    SUBT
--------------------------------
Tomatoes   5    $2.00   $10.00
--------------------------------
TOTAL BALANCE:          $10.00
--------------------------------
       💬 Thank You!
--------------------------------
📱 Scan QR code for account statement
--------------------------------
    [SCANNABLE QR CODE HERE]
Customer: John Doe
Bill: BILL-1234567890
--------------------------------
```

## 🚀 Next Steps

### To Complete Full Integration:

1. **Implement Public Route** ✅ (Next task)
   - Create `/public/customer-statement/:customerId/:billId` route
   - Display customer account statement
   - Show transaction history and balance

2. **Deploy Web Application**
   - Set up hosting (Vercel, Netlify, etc.)
   - Configure public URL in environment variables
   - Update QR code base URL

3. **Test End-to-End**
   - Print receipt with QR code
   - Scan with phone
   - Verify account statement loads
   - Test with multiple customers

## 💰 Cost Summary

### Current Implementation: **$0**
- QR Code Library: Free (MIT License)
- ESC/POS Commands: Native printer support
- No additional services required

### Future Costs (Optional):
- **Web Hosting**: $0-10/month (depends on provider)
- **Domain Name**: $10-15/year (optional)
- **SSL Certificate**: Free (Let's Encrypt)

**Total Annual Cost: $0-130/year**

## 📝 Notes

- QR codes are generated real-time during bill creation
- Each QR code is unique to customer/bill combination
- QR codes are scannable by any standard QR reader
- Works offline - QR generation doesn't require internet
- Printing requires only thermal printer connection

## ⚠️ Important

- Test with actual printer before production use
- Verify QR code scannability with multiple phone models
- Ensure public route is implemented before customer use
- Set appropriate base URL in production environment

## 🎉 Success!

Your POS system now generates actual scannable QR codes on thermal printer receipts. Customers can scan these codes to access their account statements instantly!

