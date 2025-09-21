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
  commission_rate?:number | null;
  plastic_fee?:string;
  type:string
  }

// BillLineItem interface - maps directly to bill_line_items table
export interface BillLineItem {
  // Core identifiers
  id: string;
  storeId: string;
  billId: string;
  inventoryItemId: string;
  productId: string;
  supplierId: string;
  customerId?: string;
  
  // Quantity and pricing
  quantity: number;
  weight?: number;
  unitPrice: number;
  lineTotal: number; // Maps to line_total in database
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

// Cart item - partial BillLineItem for items being added to cart
export interface CartItem extends Omit<BillLineItem, 'id' | 'createdAt' | 'createdBy' | 'receivedValue'> {
  id?: string; // Optional for new cart items
  receivedValue?: number; // Optional until checkout
  createdAt?: string;
  createdBy?: string;
}

// Database transformation types for Supabase integration
export type BillLineItemDbRow = {
  id: string;
  store_id: string;
  bill_id: string;
  product_id: string;
  product_name: string;
  supplier_id: string;
  supplier_name: string;
  inventory_item_id: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  weight: number | null;
  notes: string | null;
  line_order: number;
  payment_method: 'cash' | 'card' | 'credit';
  customer_id: string | null;
  created_by: string;
  received_value: number;
  created_at: string;
  updated_at: string;
};

export type BillLineItemDbInsert = Omit<BillLineItemDbRow, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type BillLineItemDbUpdate = Partial<Omit<BillLineItemDbRow, 'id' | 'created_at' | 'updated_at' | 'store_id' | 'created_by'>>;

// Type transformation utilities
export const BillLineItemTransforms = {
  // Convert from database row to frontend BillLineItem
  fromDbRow: (dbRow: BillLineItemDbRow): BillLineItem => ({
    id: dbRow.id,
    storeId: dbRow.store_id,
    billId: dbRow.bill_id,
    inventoryItemId: dbRow.inventory_item_id || '',
    productId: dbRow.product_id,
    supplierId: dbRow.supplier_id,
    customerId: dbRow.customer_id || undefined,
    quantity: dbRow.quantity,
    weight: dbRow.weight || undefined,
    unitPrice: dbRow.unit_price,
    lineTotal: dbRow.line_total,
    receivedValue: dbRow.received_value,
    paymentMethod: dbRow.payment_method,
    notes: dbRow.notes || undefined,
    createdAt: dbRow.created_at,
    createdBy: dbRow.created_by,
    synced: true,
    deleted: false,
  }),

  // Convert from frontend BillLineItem to database insert
  toDbInsert: (billLineItem: BillLineItem): BillLineItemDbInsert => ({
    id: billLineItem.id,
    store_id: billLineItem.storeId,
    bill_id: billLineItem.billId,
    product_id: billLineItem.productId,
    product_name: '', // Will be populated from product lookup
    supplier_id: billLineItem.supplierId,
    supplier_name: '', // Will be populated from supplier lookup
    inventory_item_id: billLineItem.inventoryItemId || null,
    quantity: billLineItem.quantity,
    unit_price: billLineItem.unitPrice,
    line_total: billLineItem.lineTotal,
    weight: billLineItem.weight || null,
    notes: billLineItem.notes || null,
    line_order: 1, // Default order
    payment_method: billLineItem.paymentMethod,
    customer_id: billLineItem.customerId || null,
    created_by: billLineItem.createdBy,
    received_value: billLineItem.receivedValue,
  }),

  // Convert from frontend BillLineItem to database update
  toDbUpdate: (updates: Partial<BillLineItem>): BillLineItemDbUpdate => {
    const dbUpdate: BillLineItemDbUpdate = {};
    
    if (updates.inventoryItemId !== undefined) dbUpdate.inventory_item_id = updates.inventoryItemId || null;
    if (updates.productId !== undefined) dbUpdate.product_id = updates.productId;
    if (updates.supplierId !== undefined) dbUpdate.supplier_id = updates.supplierId;
    if (updates.customerId !== undefined) dbUpdate.customer_id = updates.customerId || null;
    if (updates.quantity !== undefined) dbUpdate.quantity = updates.quantity;
    if (updates.weight !== undefined) dbUpdate.weight = updates.weight || null;
    if (updates.unitPrice !== undefined) dbUpdate.unit_price = updates.unitPrice;
    if (updates.lineTotal !== undefined) dbUpdate.line_total = updates.lineTotal;
    if (updates.receivedValue !== undefined) dbUpdate.received_value = updates.receivedValue;
    if (updates.paymentMethod !== undefined) dbUpdate.payment_method = updates.paymentMethod;
    if (updates.notes !== undefined) dbUpdate.notes = updates.notes || null;
    
    return dbUpdate;
  },

  // Convert CartItem to BillLineItem (for checkout)
  fromCartItem: (cartItem: CartItem, id: string, billId: string, createdAt: string, createdBy: string): BillLineItem => ({
    ...cartItem,
    id,
    billId,
    createdAt,
    createdBy,
    lineTotal: cartItem.lineTotal || (cartItem.quantity * cartItem.unitPrice),
    receivedValue: cartItem.receivedValue || cartItem.lineTotal || (cartItem.quantity * cartItem.unitPrice),
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
  type: 'income' | 'expense' | 'sale' | 'payment' | 'credit_sale';
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
