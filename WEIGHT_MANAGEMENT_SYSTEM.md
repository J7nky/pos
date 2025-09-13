# Weight Management System

## Overview

The Weight Management System provides comprehensive weight tracking and comparison functionality for inventory and sales operations. It addresses different weight requirements for various transaction types and provides tools for detecting discrepancies and potential issues.

## Key Features

### 1. **Flexible Weight Requirements**
- **Cash/Credit Purchases**: Weight typically required for accurate bill calculation
- **Commission Items**: Weight is optional for receiving but recommended for comparison
- **Sales**: Weight tracking for comparison with received weights

### 2. **Weight Comparison & Validation**
- Real-time weight discrepancy detection
- Configurable tolerance thresholds
- Automatic alerts for suspicious patterns
- Bill closing validation with weight checks

### 3. **Comprehensive Reporting**
- Product-supplier weight summaries
- Bill-level weight comparisons
- Discrepancy alerts and recommendations
- Historical weight tracking

## System Architecture

### Core Services

#### 1. WeightManagementService (`src/services/weightManagementService.ts`)
Primary service for weight tracking and analysis.

**Key Methods:**
- `getProductWeightSummary()` - Comprehensive weight analysis for product-supplier combinations
- `getBillWeightSummary()` - Weight summary for specific bills
- `getWeightDiscrepancyAlerts()` - System-wide discrepancy detection
- `generateBillClosingWeightReport()` - Assessment for bill closing decisions

#### 2. WeightConfigurationService (`src/services/weightConfigurationService.ts`)
Manages weight tracking settings and preferences.

**Configuration Options:**
- Weight requirements by transaction type
- Discrepancy thresholds (minor: 5%, major: 10%, critical: 20%)
- Tolerance levels for weight differences
- Display settings and units

#### 3. WeightValidationService (`src/services/weightValidationService.ts`)
Validates weight data for transactions and detects issues.

**Validation Features:**
- Sale weight validation against inventory
- Purchase weight validation with reasonableness checks
- Batch validation for multiple records
- Consistency checking across related records

### UI Components

#### WeightComparisonReport (`src/components/WeightComparisonReport.tsx`)
Comprehensive reporting component for weight analysis and bill closing decisions.

**Features:**
- Bill weight summaries with item-level details
- Product weight analysis over time
- Discrepancy alerts with severity levels
- Bill closing assessment with recommendations

## Database Schema

The system uses existing database fields:

### inventory_items table
- `weight: number | null` - Weight of received items (optional for commission)
- `quantity: number` - Quantity received
- `batch_id: string | null` - Links to inventory_bills

### sale_items table
- `weight: number | null` - Weight of sold items
- `quantity: number` - Quantity sold
- `inventory_item_id: string` - Links to source inventory

### inventory_bills table
- `type: string` - 'cash', 'credit', or 'commission'
- `status: string` - Bill status including 'closed'

## Weight Logic by Transaction Type

### 1. Cash/Credit Purchases
- **Weight**: Required for bill value calculation
- **Logic**: `total_value = weight * price_per_kg` (when weight provided)
- **Alternative**: `total_value = quantity * price_per_unit` (when no weight)
- **Validation**: Weight reasonableness checks against historical data

### 2. Commission Items
- **Weight**: Optional for receiving
- **Purpose**: Comparison only - not used for bill calculation
- **Logic**: When weight not provided, comparison shows "N/A"
- **Benefit**: Helps detect discrepancies when items are sold

### 3. Sales Transactions
- **Weight**: Required for weighted items, optional for others
- **Purpose**: Comparison with received weights
- **Validation**: Cannot exceed available inventory weight
- **Alerts**: Triggers when sold weight > received weight

## Weight Comparison Logic

### Status Types
1. **Balanced**: Weight difference within acceptable threshold (±5%)
2. **Over Sold**: Sold weight exceeds received weight (potential issue)
3. **Under Sold**: Received weight significantly exceeds sold weight
4. **No Comparison**: Received weight not available (commission items)

### Discrepancy Thresholds
- **Minor**: 5% - Warning level
- **Major**: 10% - Requires attention
- **Critical**: 20% - Blocks operations

### Tolerance Levels
- **Minimum**: 0.1kg - Ignore differences below this
- **Warning**: 0.5kg - Show warnings
- **Error**: 1.0kg - Block transactions

## Bill Closing Process

### Weight Assessment Steps
1. **Load Bill Data**: Get all items and their weight information
2. **Calculate Totals**: Sum received vs sold weights
3. **Check Discrepancies**: Compare against thresholds
4. **Generate Issues**: Create error/warning/info messages
5. **Make Decision**: Determine if bill can be closed

### Closing Rules
- **Can Close**: No errors, minor discrepancies within tolerance
- **Cannot Close**: Critical discrepancies or data errors
- **Requires Review**: Major discrepancies need approval

### Issue Types
- **Error**: Blocks closing (e.g., over-selling by >10%)
- **Warning**: Allows closing but shows alert
- **Info**: Informational only (e.g., optional weight not provided)

## Usage Examples

### 1. Receiving Commission Items

```typescript
// Weight is optional for commission items
const commissionItem = {
  product_id: "product-123",
  supplier_id: "supplier-456", 
  type: "commission",
  quantity: 10,
  unit: "box",
  weight: null, // Optional - for comparison only
  price: 5.00 // Price per unit, not per kg
};
```

### 2. Selling Items with Weight Comparison

```typescript
// Validate sale weight against inventory
const validation = await weightValidationService.validateSaleWeight({
  inventoryItemId: "inv-123",
  saleQuantity: 2,
  saleWeight: 5.5, // kg
  customerId: "customer-789"
});

if (!validation.isValid) {
  console.log("Validation errors:", validation.errors);
}
```

### 3. Bill Closing with Weight Check

```typescript
// Generate closing report
const closingReport = await weightManagementService
  .generateBillClosingWeightReport("bill-123");

if (closingReport.canClose) {
  // Proceed with closing
} else {
  // Show issues to user
  console.log("Cannot close due to:", closingReport.issues);
}
```

### 4. Weight Discrepancy Monitoring

```typescript
// Get all discrepancy alerts
const alerts = await weightManagementService
  .getWeightDiscrepancyAlerts("store-123");

// Filter high-severity alerts
const criticalAlerts = alerts.filter(alert => 
  alert.severity === 'high'
);
```

## Configuration

### Default Settings
```typescript
const defaultConfig = {
  requireWeightForCashPurchases: true,
  requireWeightForCreditPurchases: true,
  requireWeightForCommissionItems: false, // Optional
  
  discrepancyThresholds: {
    minor: 5,    // 5%
    major: 10,   // 10% 
    critical: 20 // 20%
  },
  
  tolerances: {
    minimum: 0.1, // 100g
    warning: 0.5, // 500g
    error: 1.0    // 1kg
  }
};
```

### Customization
```typescript
// Update configuration
weightConfigurationService.updateConfiguration({
  requireWeightForCommissionItems: true, // Make weight required
  discrepancyThresholds: {
    minor: 3,  // Stricter threshold
    major: 8,
    critical: 15
  }
});
```

## Integration Points

### 1. POS System Integration
- Weight validation during cart updates
- Real-time weight calculations
- Inventory availability checks

### 2. Inventory Management
- Weight tracking during receiving
- Batch-level weight summaries
- Stock level calculations

### 3. Accounting System
- Weight-based value calculations
- Commission tracking
- Discrepancy reporting

### 4. Bill Management
- Weight summaries in bills
- Closing validations
- Audit trail for weight changes

## Best Practices

### 1. Data Entry
- Always record weight for cash/credit purchases
- Consider recording weight for commission items
- Use consistent units (kg recommended)
- Validate weights during entry

### 2. Monitoring
- Review discrepancy alerts regularly
- Investigate over-selling immediately
- Monitor weight patterns for anomalies
- Keep configuration thresholds reasonable

### 3. Bill Closing
- Review weight report before closing
- Resolve critical discrepancies first
- Document reasons for major discrepancies
- Use weight comparison for fraud detection

### 4. Training
- Train staff on weight requirements by type
- Emphasize accuracy for weighted items
- Explain commission weight benefits
- Regular review of discrepancy reports

## Troubleshooting

### Common Issues

1. **Over-selling Alerts**
   - Check for data entry errors
   - Verify inventory receipts
   - Look for unauthorized sales

2. **Missing Weight Data**
   - Update historical records if needed
   - Configure requirements properly
   - Train staff on importance

3. **Large Discrepancies**
   - Investigate measurement accuracy
   - Check for product variations
   - Review supplier consistency

4. **Performance Issues**
   - Use date ranges for large datasets
   - Consider archiving old data
   - Optimize database queries

### Error Messages

- "Weight required for cash/credit items" - Enter weight for purchase
- "Sale weight exceeds inventory" - Check available stock
- "Significant weight discrepancy" - Verify measurements
- "Cannot close bill with critical errors" - Resolve discrepancies first

## Future Enhancements

1. **Advanced Analytics**
   - Weight trend analysis
   - Supplier comparison reports
   - Seasonal weight variations

2. **Automation**
   - Scale integration
   - Automatic weight capture
   - Real-time alerts

3. **Mobile Support**
   - Weight entry on mobile devices
   - Barcode scanning with weight
   - Field inventory checks

4. **Integration**
   - ERP system synchronization
   - Third-party scale systems
   - IoT sensor integration

## Conclusion

The Weight Management System provides a comprehensive solution for tracking and comparing weights across different transaction types. It balances flexibility (optional weight for commission items) with accuracy (required weight for cash/credit items) while providing robust validation and reporting capabilities.

The system helps detect discrepancies, prevent over-selling, and maintain accurate inventory records while accommodating different business requirements for weight tracking.
