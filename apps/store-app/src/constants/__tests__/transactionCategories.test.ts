/**
 * Transaction Categories Tests
 * Simple tests to verify categories and type mappings
 */

import { describe, it, expect } from 'vitest';
import {
  TRANSACTION_CATEGORIES,
  TRANSACTION_TYPES,
  isValidTransactionCategory,
  getTransactionType,
  CATEGORY_TO_TYPE_MAP
} from '../transactionCategories';

describe('Transaction Categories', () => {
  describe('Constants', () => {
    it('should have all categories defined (kept in sync with TRANSACTION_CATEGORIES)', () => {
      const categories = Object.keys(TRANSACTION_CATEGORIES);
      expect(categories.length).toBeGreaterThan(0);
      expect(categories).toHaveLength(Object.values(TRANSACTION_CATEGORIES).length);
    });

    it('should have INCOME and EXPENSE types', () => {
      expect(TRANSACTION_TYPES.INCOME).toBe('income');
      expect(TRANSACTION_TYPES.EXPENSE).toBe('expense');
    });

    it('should have correct category values', () => {
      expect(TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT).toBe('Customer Payment');
      expect(TRANSACTION_CATEGORIES.SUPPLIER_PAYMENT).toBe('Supplier Payment');
      expect(TRANSACTION_CATEGORIES.ACCOUNTS_RECEIVABLE).toBe('Accounts Receivable');
      expect(TRANSACTION_CATEGORIES.ACCOUNTS_PAYABLE).toBe('Accounts Payable');
    });
  });

  describe('Category Validation', () => {
    it('should validate correct categories', () => {
      expect(isValidTransactionCategory('Customer Payment')).toBe(true);
      expect(isValidTransactionCategory('Supplier Payment')).toBe(true);
      expect(isValidTransactionCategory('Cash Drawer Sale')).toBe(true);
    });

    it('should reject invalid categories', () => {
      expect(isValidTransactionCategory('Invalid Category')).toBe(false);
      expect(isValidTransactionCategory('')).toBe(false);
      expect(isValidTransactionCategory('random text')).toBe(false);
    });
  });

  describe('Type Mapping', () => {
    it('should map customer transactions to INCOME', () => {
      expect(getTransactionType(TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT)).toBe('income');
      expect(getTransactionType(TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT_RECEIVED)).toBe('income');
      expect(getTransactionType(TRANSACTION_CATEGORIES.CUSTOMER_CREDIT_SALE)).toBe('income');
    });

    it('should map supplier payments to correct types', () => {
      expect(getTransactionType(TRANSACTION_CATEGORIES.SUPPLIER_PAYMENT)).toBe('expense');
      expect(getTransactionType(TRANSACTION_CATEGORIES.SUPPLIER_PAYMENT_RECEIVED)).toBe('expense');
      expect(getTransactionType(TRANSACTION_CATEGORIES.SUPPLIER_REFUND)).toBe('income');
      expect(getTransactionType(TRANSACTION_CATEGORIES.SUPPLIER_CREDIT_SALE)).toBe('expense');
      expect(getTransactionType(TRANSACTION_CATEGORIES.SUPPLIER_COMMISSION)).toBe('expense');
    });

    it('should map cash drawer transactions correctly', () => {
      expect(getTransactionType(TRANSACTION_CATEGORIES.CASH_DRAWER_SALE)).toBe('income');
      expect(getTransactionType(TRANSACTION_CATEGORIES.CASH_DRAWER_PAYMENT)).toBe('income');
      expect(getTransactionType(TRANSACTION_CATEGORIES.CASH_DRAWER_REFUND)).toBe('expense');
      expect(getTransactionType(TRANSACTION_CATEGORIES.CASH_DRAWER_EXPENSE)).toBe('expense');
    });

    it('should map employee transactions correctly', () => {
      expect(getTransactionType(TRANSACTION_CATEGORIES.EMPLOYEE_PAYMENT)).toBe('expense');
      expect(getTransactionType(TRANSACTION_CATEGORIES.EMPLOYEE_PAYMENT_RECEIVED)).toBe('income');
    });

    it('should map accounting transactions correctly', () => {
      expect(getTransactionType(TRANSACTION_CATEGORIES.ACCOUNTS_RECEIVABLE)).toBe('income');
      expect(getTransactionType(TRANSACTION_CATEGORIES.ACCOUNTS_PAYABLE)).toBe('expense');
    });

    it('should have complete mapping for all categories', () => {
      const allCategories = Object.values(TRANSACTION_CATEGORIES);
      const mappedCategories = Object.keys(CATEGORY_TO_TYPE_MAP);
      
      expect(mappedCategories).toHaveLength(allCategories.length);
      
      allCategories.forEach(category => {
        expect(CATEGORY_TO_TYPE_MAP[category]).toBeDefined();
        expect(['income', 'expense']).toContain(CATEGORY_TO_TYPE_MAP[category]);
      });
    });
  });

  describe('Business Logic Verification', () => {
    it('should correctly identify money coming in as INCOME', () => {
      const incomeCategories = [
        TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT,
        TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT_RECEIVED,
        TRANSACTION_CATEGORIES.CUSTOMER_CREDIT_SALE,
        TRANSACTION_CATEGORIES.SUPPLIER_REFUND,
        TRANSACTION_CATEGORIES.SUPPLIER_PORTERAGE,
        TRANSACTION_CATEGORIES.SUPPLIER_TRANSFER_FEE,
        TRANSACTION_CATEGORIES.SUPPLIER_ADVANCE_DEDUCTED,
        TRANSACTION_CATEGORIES.CASH_DRAWER_SALE,
        TRANSACTION_CATEGORIES.CASH_DRAWER_PAYMENT,
        TRANSACTION_CATEGORIES.EMPLOYEE_PAYMENT_RECEIVED,
        TRANSACTION_CATEGORIES.ACCOUNTS_RECEIVABLE,
      ];

      incomeCategories.forEach(category => {
        expect(getTransactionType(category)).toBe('income');
      });
    });

    it('should correctly identify money going out as EXPENSE', () => {
      const expenseCategories = [
        TRANSACTION_CATEGORIES.SUPPLIER_PAYMENT,
        TRANSACTION_CATEGORIES.SUPPLIER_PAYMENT_RECEIVED,
        TRANSACTION_CATEGORIES.SUPPLIER_CREDIT_SALE,
        TRANSACTION_CATEGORIES.SUPPLIER_COMMISSION,
        TRANSACTION_CATEGORIES.SUPPLIER_ADVANCE_GIVEN,
        TRANSACTION_CATEGORIES.CUSTOMER_REFUND,
        TRANSACTION_CATEGORIES.INVENTORY_CASH_PURCHASE,
        TRANSACTION_CATEGORIES.INVENTORY_PRICE_ADJUSTMENT,
        TRANSACTION_CATEGORIES.CASH_DRAWER_REFUND,
        TRANSACTION_CATEGORIES.CASH_DRAWER_EXPENSE,
        TRANSACTION_CATEGORIES.EMPLOYEE_PAYMENT,
        TRANSACTION_CATEGORIES.ACCOUNTS_PAYABLE,
      ];

      expenseCategories.forEach(category => {
        expect(getTransactionType(category)).toBe('expense');
      });
    });
  });
});
