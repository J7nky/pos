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

// Unified SaleItem interface - single source of truth
export interface SaleItem {
  // Core identifiers
  id: string;
  storeId: string;
  inventoryItemId: string;
  productId: string;
  supplierId: string;
  customerId?: string;
  
  // Quantity and pricing
  quantity: number;
  weight?: number;
  unitPrice: number;
  totalPrice: number; // Calculated field for UI
  receivedValue: number; // Amount actually received
  
  // Transaction details
  paymentMethod: 'cash' | 'card' | 'credit';
  notes?: string;
  
  // Metadata
  createdAt: string;
  createdBy: string;
  
  // Local state (for cart items, optional fields)
  inventoryType?: 'commission' | 'cash';
  
  // Sync state (for offline functionality)
  synced?: boolean;
  deleted?: boolean;
}

// Cart item - partial SaleItem for items being added to cart
export interface CartItem extends Omit<SaleItem, 'id' | 'createdAt' | 'createdBy' | 'receivedValue'> {
  id?: string; // Optional for new cart items
  receivedValue?: number; // Optional until checkout
  createdAt?: string;
  createdBy?: string;
}

// Database transformation types for Supabase integration
export type SaleItemDbRow = {
  id: string;
  store_id: string;
  inventory_item_id: string;
  product_id: string;
  supplier_id: string;
  customer_id: string | null;
  quantity: number;
  weight: number | null;
  unit_price: number;
  received_value: number;
  payment_method: 'cash' | 'card' | 'credit';
  notes: string | null;
  created_at: string;
  created_by: string;
};

export type SaleItemDbInsert = Omit<SaleItemDbRow, 'id' | 'created_at'> & {
  id?: string;
  created_at?: string;
};

export type SaleItemDbUpdate = Partial<Omit<SaleItemDbRow, 'id' | 'created_at' | 'store_id' | 'created_by'>>;

// Type transformation utilities
export const SaleItemTransforms = {
  // Convert from database row to frontend SaleItem
  fromDbRow: (dbRow: SaleItemDbRow): SaleItem => ({
    id: dbRow.id,
    storeId: dbRow.store_id,
    inventoryItemId: dbRow.inventory_item_id,
    productId: dbRow.product_id,
    supplierId: dbRow.supplier_id,
    customerId: dbRow.customer_id || undefined,
    quantity: dbRow.quantity,
    weight: dbRow.weight || undefined,
    unitPrice: dbRow.unit_price,
    totalPrice: dbRow.quantity * dbRow.unit_price, // Calculate total
    receivedValue: dbRow.received_value,
    paymentMethod: dbRow.payment_method,
    notes: dbRow.notes || undefined,
    createdAt: dbRow.created_at,
    createdBy: dbRow.created_by,
    synced: true,
    deleted: false,
  }),

  // Convert from frontend SaleItem to database insert
  toDbInsert: (saleItem: SaleItem): SaleItemDbInsert => ({
    id: saleItem.id,
    store_id: saleItem.storeId,
    inventory_item_id: saleItem.inventoryItemId,
    product_id: saleItem.productId,
    supplier_id: saleItem.supplierId,
    customer_id: saleItem.customerId || null,
    quantity: saleItem.quantity,
    weight: saleItem.weight || null,
    unit_price: saleItem.unitPrice,
    received_value: saleItem.receivedValue,
    payment_method: saleItem.paymentMethod,
    notes: saleItem.notes || null,
    created_at: saleItem.createdAt,
    created_by: saleItem.createdBy,
  }),

  // Convert from frontend SaleItem to database update
  toDbUpdate: (updates: Partial<SaleItem>): SaleItemDbUpdate => {
    const dbUpdate: SaleItemDbUpdate = {};
    
    if (updates.inventoryItemId !== undefined) dbUpdate.inventory_item_id = updates.inventoryItemId;
    if (updates.productId !== undefined) dbUpdate.product_id = updates.productId;
    if (updates.supplierId !== undefined) dbUpdate.supplier_id = updates.supplierId;
    if (updates.customerId !== undefined) dbUpdate.customer_id = updates.customerId || null;
    if (updates.quantity !== undefined) dbUpdate.quantity = updates.quantity;
    if (updates.weight !== undefined) dbUpdate.weight = updates.weight || null;
    if (updates.unitPrice !== undefined) dbUpdate.unit_price = updates.unitPrice;
    if (updates.receivedValue !== undefined) dbUpdate.received_value = updates.receivedValue;
    if (updates.paymentMethod !== undefined) dbUpdate.payment_method = updates.paymentMethod;
    if (updates.notes !== undefined) dbUpdate.notes = updates.notes || null;
    
    return dbUpdate;
  },

  // Convert CartItem to SaleItem (for checkout)
  fromCartItem: (cartItem: CartItem, id: string, createdAt: string, createdBy: string): SaleItem => ({
    ...cartItem,
    id,
    createdAt,
    createdBy,
    receivedValue: cartItem.receivedValue || cartItem.totalPrice, // Default to totalPrice if not set
    synced: false,
    deleted: false,
  }),
};

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
  reference: string | null;
  store_id: string;
  created_by: string;
  created_at: string;
  supplier_id: string | null;
  customer_id: string | null;
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

export interface StatementTransaction {
  id: string;
  date: string;
  type: 'sale' | 'payment'|'income'|'expense';
  description: string;
  amount: number;
  quantity: number;
  weight: number;
  price: number;
  currency: 'USD' | 'LBP';
  balanceAfter: number;
  paymentMethod?: string;
  productDetails?: StatementProductDetail[];
  reference?: string;
}

export interface StatementProductDetail {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  weight?: number;
  commissionRate?: number;
  commissionAmount?: number;
  notes?: string;
}
