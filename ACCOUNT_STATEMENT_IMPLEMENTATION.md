# Account Statement Feature Implementation

## Overview

The Account Statement feature provides comprehensive financial reporting for customers and suppliers in the POS system. It generates detailed statements showing transaction history, product information, and financial summaries with support for both USD and LBP currencies.

## Features

### ✅ Implemented Features

1. **Detailed Transaction History**
   - Complete product information (name, quantity, unit price, total price, weight)
   - Transaction dates and types (sale, credit sale, payment, commission, receiving)
   - Payment methods and reference numbers
   - Chronological sorting

2. **Financial Summary**
   - Opening and current balances in both USD and LBP
   - Total sales, payments, and receivings
   - Net change calculations
   - Date range filtering

3. **Export & Print**
   - PDF export functionality (text-based for now)
   - Print-friendly styling
   - Professional formatting

4. **Offline Mode Support**
   - Works completely offline using local storage
   - Real-time data aggregation
   - No external dependencies

## Technical Architecture

### Service Layer

#### `AccountStatementService`
- **Singleton Pattern**: Ensures single instance across the application
- **Data Aggregation**: Combines sales, transactions, products, and inventory data
- **Balance Calculation**: Maintains running balances for accurate financial reporting
- **Currency Support**: Handles both USD and LBP with proper formatting

#### Key Methods

```typescript
// Generate customer statement
generateCustomerStatement(
  customer: Customer,
  sales: SaleItem[],
  transactions: Transaction[],
  products: Product[],
  inventory: InventoryItem[],
  dateRange?: { start: string; end: string }
): AccountStatement

// Generate supplier statement
generateSupplierStatement(
  supplier: Supplier,
  sales: SaleItem[],
  transactions: Transaction[],
  products: Product[],
  inventory: InventoryItem[],
  dateRange?: { start: string; end: string }
): AccountStatement
```

### Component Layer

#### `AccountStatementModal`
- **Responsive Design**: Adapts to different screen sizes
- **Date Range Picker**: Customizable statement periods
- **Real-time Updates**: Regenerates statements when date range changes
- **Error Handling**: Graceful fallbacks for missing data

#### `Customers` Component Updates
- **Action Buttons**: Added account statement button to customer/supplier tables
- **Modal Integration**: Seamless integration with existing UI
- **Data Passing**: Efficient data flow from context to modal

## Data Flow

```
OfflineDataContext → Customers Component → AccountStatementModal → AccountStatementService
       ↓                    ↓                      ↓                      ↓
   Local Storage    Action Button Click    Modal State Management    Data Processing
       ↓                    ↓                      ↓                      ↓
   Raw Data         Entity Selection       Statement Generation    Formatted Output
```

## Database Queries (Offline Mode)

### Customer Statement Data
```typescript
// Sales data
const customerSales = sales.filter(sale => 
  sale.customer_id === customerId && 
  isWithinDateRange(sale.created_at, dateRange)
);

// Payment transactions
const customerPayments = transactions.filter(t => 
  t.type === 'income' && 
  t.category === 'Customer Payment' &&
  t.description.includes(customerName) &&
  isWithinDateRange(t.created_at, dateRange)
);
```

### Supplier Statement Data
```typescript
// Commission-generating sales
const supplierSales = sales.filter(sale => 
  sale.supplier_id === supplierId && 
  isWithinDateRange(sale.created_at, dateRange)
);

// Payment transactions
const supplierPayments = transactions.filter(t => 
  t.type === 'expense' && 
  t.category === 'Supplier Payment' &&
  t.description.includes(supplierName) &&
  isWithinDateRange(t.created_at, dateRange)
);
```

## Usage Instructions

### For Customers

1. **Navigate** to Customers & Suppliers page
2. **Click** the purple FileText icon (📄) in the Actions column
3. **Adjust** date range if needed (defaults to current year)
4. **View** detailed transaction history and financial summary
5. **Export** to PDF or print as needed

### For Suppliers

1. **Switch** to Suppliers tab
2. **Click** the purple FileText icon (📄) in the Actions column
3. **Review** commission calculations and payment history
4. **Export** or print the statement

## Statement Sections

### Section 1: Detailed Transaction History
- **Date**: Transaction timestamp
- **Type**: Sale, Credit Sale, Payment, Commission, Receiving
- **Description**: Product details and transaction notes
- **Amount**: Transaction value in original currency
- **Balance After**: Running balance after transaction
- **Reference**: Transaction reference number

### Section 2: Financial Summary
- **Opening Balance**: Starting balance for the period
- **Current Balance**: Ending balance for the period
- **Total Sales/Commissions**: Revenue generated
- **Total Payments**: Payments made/received
- **Net Change**: Overall financial impact

## Styling & Print Support

### Print CSS
- **Location**: `src/styles/print.css`
- **Features**: 
  - Optimized for A4 paper
  - Proper page breaks
  - High contrast for readability
  - Professional formatting

### Responsive Design
- **Mobile**: Single column layout
- **Tablet**: Two-column grid
- **Desktop**: Four-column financial summary
- **Print**: Optimized for paper output

## Error Handling

### Data Validation
- **Missing Products**: Graceful fallback with limited information
- **Empty Transactions**: Clear "no data" messaging
- **Invalid Dates**: Default to current year range
- **Currency Issues**: Safe fallback to USD

### User Feedback
- **Loading States**: Spinner during statement generation
- **Toast Messages**: Success/error notifications
- **Empty States**: Helpful messaging for no data scenarios

## Testing

### Unit Tests
- **Location**: `src/services/__tests__/accountStatementService.test.ts`
- **Coverage**: 
  - Customer statements with/without transactions
  - Supplier commission calculations
  - Date range filtering
  - Currency handling
  - Edge cases and error scenarios

### Test Scenarios
```typescript
describe('AccountStatementService', () => {
  it('should generate statement for customer with transactions')
  it('should handle customer with no transactions')
  it('should filter transactions by date range')
  it('should calculate running balance correctly')
  it('should handle different currencies correctly')
  it('should calculate commission correctly')
  it('should handle missing product information')
  it('should handle zero amounts gracefully')
});
```

## Performance Considerations

### Data Processing
- **Efficient Filtering**: Uses native Array.filter() methods
- **Minimal Memory**: Processes data in streams rather than loading all at once
- **Caching**: Statement results cached during modal session

### UI Responsiveness
- **Async Processing**: Non-blocking statement generation
- **Loading States**: Immediate user feedback
- **Debounced Updates**: Prevents excessive recalculations

## Future Enhancements

### Phase 2 Features
1. **Real PDF Generation**: Integration with jsPDF or similar library
2. **Email Integration**: Direct email sending of statements
3. **Batch Processing**: Generate multiple statements at once
4. **Advanced Filtering**: Product categories, payment methods, etc.

### Phase 3 Features
1. **Statement Templates**: Customizable layouts
2. **Scheduled Reports**: Automated statement generation
3. **Data Export**: CSV, Excel formats
4. **Audit Trail**: Statement generation history

## Dependencies

### Core Dependencies
- **React**: UI framework
- **TypeScript**: Type safety
- **Tailwind CSS**: Styling
- **Lucide React**: Icons

### Service Dependencies
- **Local Storage**: Data persistence
- **Date APIs**: Date manipulation and formatting
- **Blob API**: File export functionality

## Browser Support

- **Chrome**: 80+
- **Firefox**: 75+
- **Safari**: 13+
- **Edge**: 80+

## Installation & Setup

### 1. Import Components
```typescript
import AccountStatementModal from './components/AccountStatementModal';
import { AccountStatementService } from './services/accountStatementService';
```

### 2. Include Print Styles
```typescript
import './styles/print.css';
```

### 3. Add Action Buttons
```typescript
<button 
  onClick={() => handleViewAccountStatement(entity, entityType)}
  className="text-purple-600 hover:text-purple-800"
  title="View Account Statement"
>
  <FileText className="w-4 h-4" />
</button>
```

### 4. Integrate Modal
```typescript
<AccountStatementModal
  isOpen={!!showAccountStatement}
  onClose={() => setShowAccountStatement(null)}
  entity={selectedEntity}
  entityType={showAccountStatement}
  sales={sales}
  transactions={transactions}
  products={products}
  inventory={inventory}
/>
```

## Troubleshooting

### Common Issues

1. **Statement Not Loading**
   - Check browser console for errors
   - Verify data exists in local storage
   - Ensure all required props are passed

2. **Incorrect Balances**
   - Verify transaction data integrity
   - Check currency conversion logic
   - Review date range filtering

3. **Print Issues**
   - Ensure print.css is imported
   - Check browser print settings
   - Verify CSS media queries

### Debug Mode
```typescript
// Enable debug logging
localStorage.setItem('debug_account_statement', 'true');

// Check data in console
console.log('Sales:', sales);
console.log('Transactions:', transactions);
console.log('Generated Statement:', statement);
```

## Contributing

### Code Style
- **TypeScript**: Strict mode enabled
- **ESLint**: Standard React/TypeScript rules
- **Prettier**: Consistent formatting
- **Jest**: Comprehensive testing

### Development Workflow
1. **Feature Branch**: Create from main
2. **Tests**: Write tests before implementation
3. **Documentation**: Update README and inline docs
4. **Review**: Submit PR for code review
5. **Merge**: After approval and CI passing

## License

This feature is part of the POS system and follows the same licensing terms.

---

**Last Updated**: December 2024  
**Version**: 1.0.0  
**Status**: Production Ready
