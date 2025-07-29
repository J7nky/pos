// Core type definitions for the ERP system
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'cashier';
  storeId: string;
  createdAt: string;
}

export interface Store {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  image: string;
  isActive: boolean;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  isActive: boolean;
  createdAt: string;
}

export interface InventoryItem {
  id: string;
  productId: string;
  supplierId: string;
  type: 'commission' | 'cash';
  quantity: number;
  receivedQuantity: number;
  unit: 'kg' | 'piece' | 'box' | 'bag';
  weight?: number;
  porterage?: number;
  transferFee?: number;
  price?: number;
  commissionRate?: number;
  notes?: string;
  receivedAt: string;
  receivedBy: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  currentDebt: number;
  isActive: boolean;
  createdAt: string;
}

export interface SaleItem {
  id: string;
  productId: string;
  productName: string;
  supplierId: string;
  supplierName: string;
  quantity: number;
  weight?: number;
  unitPrice: number;
  totalPrice: number;
  notes?: string;
  inventoryType?: 'commission' | 'cash'; // Track which type of inventory this item came from
}

export interface Sale {
  id: string;
  customerId?: string;
  items: SaleItem[];
  subtotal: number;
  total: number;
  paymentMethod: 'cash' | 'card' | 'credit';
  amountPaid: number;
  amountDue: number;
  status: 'completed' | 'pending' | 'cancelled';
  notes?: string;
  createdAt: string;
  createdBy: string;
}

export interface Payment {
  id: string;
  customerId: string;
  saleId?: string;
  amount: number;
  method: 'cash' | 'card';
  reference?: string;
  notes?: string;
  createdAt: string;
  createdBy: string;
}

export interface Transaction {
  id: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  currency: 'USD' | 'LBP';
  description: string;
  reference?: string;
  createdAt: string;
  createdBy: string;
}

export interface AccountsReceivable {
  id: string;
  customerId: string;
  customerName: string;
  invoiceNumber: string;
  amount: number;
  amountPaid: number;
  amountDue: number;
  dueDate: string;
  status: 'pending' | 'overdue' | 'paid' | 'partial';
  createdAt: string;
  lastPaymentDate?: string;
}

export interface AccountsPayable {
  id: string;
  supplierId: string;
  supplierName: string;
  invoiceNumber: string;
  amount: number;
  amountPaid: number;
  amountDue: number;
  dueDate: string;
  status: 'pending' | 'overdue' | 'paid' | 'partial';
  description: string;
  createdAt: string;
  lastPaymentDate?: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
}

export interface JournalEntry {
  id: string;
  date: string;
  reference: string;
  description: string;
  entries: Array<{
    account: string;
    debit: number;
    credit: number;
  }>;
  totalDebit: number;
  totalCredit: number;
  createdBy: string;
  createdAt: string;
}

export interface CashDrawer {
  id: string;
  openingAmount: number;
  currentAmount: number;
  totalCashSales: number;
  totalCashPayments: number;
  totalExpenses: number;
  openedAt: string;
  openedBy: string;
  closedAt?: string;
  closedBy?: string;
  status: 'open' | 'closed';
}

export interface ReportParams {
  startDate: string;
  endDate: string;
  productCategory?: string;
  supplierId?: string;
  paymentStatus?: 'paid' | 'unpaid' | 'partial';
  includeProfit?: boolean;
}

export interface StockLevel {
  productId: string;
  productName: string;
  currentStock: number;
  unit: string;
  lastReceived: string;
  suppliers: Array<{
    supplierId: string;
    supplierName: string;
    quantity: number;
  }>;
}

export interface ChartOfAccount {
  id: string;
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  subType: string;
  balance: number;
  description?: string;
  isActive: boolean;
  createdAt: string;
}

export interface AuditTrail {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  userId: string;
  timestamp: string;
  changes: Record<string, any>;
  metadata: Record<string, any>;
}