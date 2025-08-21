import { AccountStatementService, AccountStatement, StatementTransaction } from '../accountStatementService';
import { Customer, Supplier, Transaction, SaleItem, InventoryItem, Product } from '../../types';

describe('AccountStatementService', () => {
  let service: AccountStatementService;
  let mockCustomer: Customer;
  let mockSupplier: Supplier;
  let mockProducts: Product[];
  let mockInventory: InventoryItem[];
  let mockSales: SaleItem[];
  let mockTransactions: Transaction[];

  beforeEach(() => {
    service = AccountStatementService.getInstance();
    
    // Mock data setup
    mockCustomer = {
      id: 'customer-1',
      name: 'John Doe',
      phone: '+1234567890',
      email: 'john@example.com',
      address: '123 Main St',
      is_active: true,
      lb_balance: 50000,
      usd_balance: 150.00,
      created_at: '2024-01-01T00:00:00Z',
      store_id: 'store-1'
    };

    mockSupplier = {
      id: 'supplier-1',
      name: 'Fresh Foods Inc',
      phone: '+0987654321',
      email: 'info@freshfoods.com',
      address: '456 Supplier Ave',
      type: 'commission',
      is_active: true,
      lb_balance: 25000,
      usd_balance: 75.00,
      created_at: '2024-01-01T00:00:00Z',
      store_id: 'store-1'
    };

    mockProducts = [
      {
        id: 'product-1',
        name: 'Fresh Tomatoes',
        category: 'Vegetables',
        store_id: 'store-1',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      },
      {
        id: 'product-2',
        name: 'Organic Apples',
        category: 'Fruits',
        store_id: 'store-1',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      }
    ];

    mockInventory = [
      {
        id: 'inventory-1',
        productId: 'product-1',
        supplierId: 'supplier-1',
        type: 'commission',
        quantity: 100,
        receivedQuantity: 100,
        unit: 'kg',
        weight: 1,
        commission_rate: 10,
        receivedAt: '2024-01-01T00:00:00Z',
        receivedBy: 'user-1',
        store_id: 'store-1',
        created_at: '2024-01-01T00:00:00Z'
      }
    ];

    mockSales = [
      {
        id: 'sale-1',
        inventory_item_id: 'inventory-1',
        product_id: 'product-1',
        supplier_id: 'supplier-1',
        customer_id: 'customer-1',
        quantity: 5,
        weight: 5,
        unit_price: 2.50,
        received_value: 12.50,
        payment_method: 'credit',
        notes: 'Credit sale',
        created_at: '2024-02-01T00:00:00Z',
        store_id: 'store-1',
        created_by: 'user-1'
      },
      {
        id: 'sale-2',
        inventory_item_id: 'inventory-1',
        product_id: 'product-1',
        supplier_id: 'supplier-1',
        customer_id: 'customer-1',
        quantity: 3,
        weight: 3,
        unit_price: 2.50,
        received_value: 7.50,
        payment_method: 'cash',
        notes: 'Cash sale',
        created_at: '2024-02-15T00:00:00Z',
        store_id: 'store-1',
        created_by: 'user-1'
      }
    ];

    mockTransactions = [
      {
        id: 'transaction-1',
        type: 'income',
        category: 'Customer Payment',
        amount: 50.00,
        currency: 'USD',
        description: 'Payment from John Doe for invoice #123',
        reference: 'PAY-001',
        created_at: '2024-03-01T00:00:00Z',
        store_id: 'store-1',
        created_by: 'user-1'
      },
      {
        id: 'transaction-2',
        type: 'expense',
        category: 'Supplier Payment',
        amount: 25.00,
        currency: 'USD',
        description: 'Payment to Fresh Foods Inc for commission',
        reference: 'PAY-002',
        created_at: '2024-03-15T00:00:00Z',
        store_id: 'store-1',
        created_by: 'user-1'
      }
    ];
  });

  describe('getInstance', () => {
    it('should return the same instance', () => {
      const instance1 = AccountStatementService.getInstance();
      const instance2 = AccountStatementService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('generateCustomerStatement', () => {
    it('should generate statement for customer with transactions', () => {
      const statement = service.generateCustomerStatement(
        mockCustomer,
        mockSales,
        mockTransactions,
        mockProducts,
        mockInventory
      );

      expect(statement).toBeDefined();
      expect(statement.entityId).toBe('customer-1');
      expect(statement.entityName).toBe('John Doe');
      expect(statement.entityType).toBe('customer');
      expect(statement.transactions).toHaveLength(2); // 1 credit sale + 1 payment
      expect(statement.financialSummary.openingBalance.USD).toBe(150.00);
      expect(statement.financialSummary.openingBalance.LBP).toBe(50000);
    });

    it('should handle customer with no transactions', () => {
      const emptyCustomer = { ...mockCustomer, lb_balance: 0, usd_balance: 0 };
      const statement = service.generateCustomerStatement(
        emptyCustomer,
        [],
        [],
        mockProducts,
        mockInventory
      );

      expect(statement.transactions).toHaveLength(0);
      expect(statement.financialSummary.totalSales.USD).toBe(0);
      expect(statement.financialSummary.totalPayments.USD).toBe(0);
    });

    it('should filter transactions by date range', () => {
      const customDateRange = {
        start: '2024-02-01T00:00:00Z',
        end: '2024-02-28T23:59:59Z'
      };

      const statement = service.generateCustomerStatement(
        mockCustomer,
        mockSales,
        mockTransactions,
        mockProducts,
        mockInventory,
        customDateRange
      );

      // Should only include sales from February, no payments
      expect(statement.transactions).toHaveLength(1);
      expect(statement.transactions[0].type).toBe('credit_sale');
    });

    it('should calculate running balance correctly', () => {
      const statement = service.generateCustomerStatement(
        mockCustomer,
        mockSales,
        mockTransactions,
        mockProducts,
        mockInventory
      );

      // Opening balance: $150.00
      // Credit sale: +$12.50 = $162.50
      // Payment: -$50.00 = $112.50
      expect(statement.financialSummary.currentBalance.USD).toBe(112.50);
    });

    it('should handle different currencies correctly', () => {
      const lbpTransaction: Transaction = {
        id: 'transaction-3',
        type: 'income',
        category: 'Customer Payment',
        amount: 10000,
        currency: 'LBP',
        description: 'LBP payment from John Doe',
        reference: 'PAY-003',
        created_at: '2024-03-20T00:00:00Z',
        store_id: 'store-1',
        created_by: 'user-1'
      };

      const statement = service.generateCustomerStatement(
        mockCustomer,
        mockSales,
        [...mockTransactions, lbpTransaction],
        mockProducts,
        mockInventory
      );

      expect(statement.financialSummary.currentBalance.LBP).toBe(40000); // 50000 - 10000
    });
  });

  describe('generateSupplierStatement', () => {
    it('should generate statement for supplier with transactions', () => {
      const statement = service.generateSupplierStatement(
        mockSupplier,
        mockSales,
        mockTransactions,
        mockProducts,
        mockInventory
      );

      expect(statement).toBeDefined();
      expect(statement.entityId).toBe('supplier-1');
      expect(statement.entityName).toBe('Fresh Foods Inc');
      expect(statement.entityType).toBe('supplier');
      expect(statement.transactions).toHaveLength(3); // 2 sales (commissions) + 1 payment
    });

    it('should calculate commission correctly', () => {
      const statement = service.generateSupplierStatement(
        mockSupplier,
        mockSales,
        mockTransactions,
        mockProducts,
        mockInventory
      );

      // Commission rate is 10%
      // Sale 1: $12.50 * 10% = $1.25
      // Sale 2: $7.50 * 10% = $0.75
      // Total commission: $2.00
      expect(statement.financialSummary.totalReceivings.USD).toBe(2.00);
    });

    it('should handle supplier with no sales', () => {
      const statement = service.generateSupplierStatement(
        mockSupplier,
        [],
        mockTransactions,
        mockProducts,
        mockInventory
      );

      expect(statement.transactions).toHaveLength(1); // Only payment transaction
      expect(statement.financialSummary.totalReceivings.USD).toBe(0);
    });

    it('should filter transactions by date range', () => {
      const customDateRange = {
        start: '2024-03-01T00:00:00Z',
        end: '2024-03-31T23:59:59Z'
      };

      const statement = service.generateSupplierStatement(
        mockSupplier,
        mockSales,
        mockTransactions,
        mockProducts,
        mockInventory,
        customDateRange
      );

      // Should only include payment transactions from March, no sales
      expect(statement.transactions).toHaveLength(1);
      expect(statement.transactions[0].type).toBe('payment');
    });
  });

  describe('exportToPDF', () => {
    it('should return a blob with statement content', async () => {
      const statement = service.generateCustomerStatement(
        mockCustomer,
        mockSales,
        mockTransactions,
        mockProducts,
        mockInventory
      );

      const blob = await service['exportToPDF'](statement);
      
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('text/plain');
    });
  });

  describe('generateStatementText', () => {
    it('should generate readable text format', () => {
      const statement = service.generateCustomerStatement(
        mockCustomer,
        mockSales,
        mockTransactions,
        mockProducts,
        mockInventory
      );

      const text = service['generateStatementText'](statement);
      
      expect(text).toContain('ACCOUNT STATEMENT');
      expect(text).toContain('John Doe');
      expect(text).toContain('customer');
      expect(text).toContain('FINANCIAL SUMMARY');
      expect(text).toContain('TRANSACTION HISTORY');
    });
  });

  describe('edge cases', () => {
    it('should handle missing product information', () => {
      const salesWithoutProduct = mockSales.map(sale => ({
        ...sale,
        product_id: 'non-existent-product'
      }));

      const statement = service.generateCustomerStatement(
        mockCustomer,
        salesWithoutProduct,
        mockTransactions,
        mockProducts,
        mockInventory
      );

      // Should still generate statement but with limited product info
      expect(statement.transactions).toHaveLength(1); // Only payment transaction
    });

    it('should handle missing inventory information', () => {
      const salesWithoutInventory = mockSales.map(sale => ({
        ...sale,
        inventory_item_id: 'non-existent-inventory'
      }));

      const statement = service.generateSupplierStatement(
        mockSupplier,
        salesWithoutInventory,
        mockTransactions,
        mockProducts,
        mockInventory
      );

      // Should use default commission rate (10%)
      expect(statement.financialSummary.totalReceivings.USD).toBe(2.00);
    });

    it('should handle zero amounts gracefully', () => {
      const zeroAmountSale: SaleItem = {
        ...mockSales[0],
        id: 'sale-zero',
        received_value: 0,
        quantity: 0
      };

      const statement = service.generateCustomerStatement(
        mockCustomer,
        [zeroAmountSale],
        [],
        mockProducts,
        mockInventory
      );

      expect(statement.transactions).toHaveLength(1);
      expect(statement.transactions[0].amount).toBe(0);
    });
  });
});
