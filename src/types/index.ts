// Core type definitions for the ERP system
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'cashier';
  storeId: string;
  createdAt: string;
}
export interface Sale {
  id: string;
  storeId: string;
  customerId: string;
  customerName: string;
  totalAmount: number;
  paymentMethod: 'cash' | 'card' | 'credit';
  status: 'pending' | 'paid' | 'cancelled';
  notes: string;
  createdBy: string;
  createdAt: string;
  amountPaid: number;
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
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  email?: string ; // Updated to match database schema
  address: string;
  lb_balance?: number ; // Updated to match database schema
  usd_balance?: number ; // Updated to match database schema
  createdAt: string;
}

export interface InventoryItem {
  id: string;
  productId: string;
  supplierId: string;
  quantity: number;
  receivedQuantity: number;
  unit: 'kg' | 'piece' | 'box' | 'bag';
  weight?: number;
  price?: number;
  createdAt: string;
  batchId?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string ; // Updated to match database schema
  address?: string ; // Updated to match database schema
  lb_balance: number; // Changed from currentDebt to balance to match Supabase schema
  usd_balance: number; // Changed from currentDebt to balance to match Supabase schema
  isActive: boolean;
  createdAt: string;
}

export interface inventory_bills { id: string;
  supplier_id: string;
  porterage_fee?: number | null;
  transfer_fee?: number | null;
  received_at: string;
  store_id: string;
  created_by: string;
  status?: string;
  created_at:string;
  notes?:string;
  commission_rate?:string;
  plastic_fee?:string
  }

export interface SaleItem {
  id: string;
  inventoryItemId?: string; // Added to match Supabase schema
  productId: string;
  productName: string; // Required for validation
  supplierId: string;
  supplierName: string; // Required for validation
  customerId?: string; // Made optional to match Supabase schema
  quantity: number; // Added quantity field for cart items
  weight?: number;
  unitPrice: number;
  totalPrice: number; // Required for validation
  receivedValue?: number; // Matches received_value in database, optional for cart items
  paymentMethod?: 'cash' | 'card' | 'credit'; // Added payment method field
  notes?: string;
  createdBy?: string; // Added to match Supabase schema
  inventoryType?: 'commission' | 'cash'; // Added for inventory tracking
}

// Added missing interfaces to match database schema

export interface AccountsReceivable {
  id: string;
  customerId: string;
  customerName: string;
  invoiceNumber: string;
  amount: number;
  amountPaid: number;
  amountDue: number;
  dueDate: string;
  status: 'pending' | 'paid' | 'overdue' | 'partial';
  description?: string;
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
  status: 'pending' | 'paid' | 'overdue' | 'partial';
  description?: string;
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
