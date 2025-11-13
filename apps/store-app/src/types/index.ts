// Multilingual data types
import type { MultilingualString } from '../utils/multilingual';

// Core type definitions for the ERP system
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'cashier';
  storeId: string;
  createdAt: string;
}

// Employee interface for admin management (extends User with additional employee fields)
export interface Employee {
  id: string;
  store_id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'cashier';
  phone?: string | null;
  address?: string | null;
  monthly_salary?: string | null; // Stored as string to match database schema
  lbp_balance?: number | null; // Monthly salary in LBP
  usd_balance?: number | null; // Monthly salary in USD
  working_hours_start?: string | null; // Format: "HH:mm" (e.g., "09:00")
  working_hours_end?: string | null; // Format: "HH:mm" (e.g., "17:00")
  working_days?: string | null; // Comma-separated days (e.g., "Monday,Tuesday,Wednesday,Thursday,Friday")
  created_at: string;
  updated_at: string;
  _synced?: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
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
  name: MultilingualString; // Supports both string (backwards compatible) and multilingual object { en: "apple", ar: "تفاح", fr: "pomme" }
  category: string;
  image: string;
  is_global?: boolean; // True for predefined global products, false/undefined for store-specific
  createdAt: string;
  _synced?: boolean;
  _deleted?: boolean;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  email?: string ; // Updated to match database schema
  address: string;
  lb_balance?: number ; // Updated to match database schema
  usd_balance?: number ; // Updated to match database schema
  advance_lb_balance?: number ; // Advance payments in LBP
  advance_usd_balance?: number ; // Advance payments in USD
  createdAt: string;
  _synced?: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
}

export interface InventoryItem {
  id: string;
  store_id: string;
  product_id: string;
  supplier_id?: string; // Optional: can be obtained from inventory_bills via batch_id, but may exist for legacy data
  quantity: number;
  received_quantity: number;
  unit: 'kg' | 'piece' | 'box' | 'bag'|'bundle';
  weight?: number | null;
  price?: number | null;
  selling_price?: number | null;
  type?: string | null;
  created_at: string;
  received_at?: string | null;
  batch_id?: string | null;
  sku?: string | null;
  _synced?: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string ; // Updated to match database schema
  address?: string ; // Updated to match database schema
  lb_balance: number; // Changed from currentDebt to balance to match Supabase schema
  usd_balance: number; // Changed from currentDebt to balance to match Supabase schema
  lb_max_balance?: number; // Maximum allowed balance in LBP
  usd_max_balance?: number; // Maximum allowed balance in USD
  is_active: boolean;
  createdAt: string;
  _synced?: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
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
  _synced?: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
  }

// Bill interface - maps directly to bills table (snake_case for db compatibility)
export interface Bill {
  id: string;
  store_id: string;
  bill_number: string;
  customer_id: string | null;
  subtotal: number;
  total_amount: number;
  payment_method: 'cash' | 'card' | 'credit';
  payment_status: 'paid' | 'partial' | 'pending';
  amount_paid: number;
  amount_due: number;
  bill_date: string;
  notes: string | null;
  status: 'active' | 'cancelled' | 'refunded';
  created_by: string;
  created_at: string;
  updated_at: string;
  last_modified_by: string | null;
  last_modified_at: string | null;
  _synced?: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
}

// BillLineItem interface - maps directly to bill_line_items table (snake_case for db compatibility)
export interface BillLineItem {
  // Core identifiers
  id: string;
  store_id: string;
  bill_id: string;
  inventory_item_id: string | null;
  product_id: string;
  supplier_id: string;
  customer_id: string | null;
  
  // Product/Supplier names (denormalized for performance)
  product_name: MultilingualString; // Supports both string (backwards compatible) and multilingual object
  supplier_name: string;
  
  // Quantity and pricing
  quantity: number;
  weight: number | null;
  unit_price: number;
  line_total: number;
  received_value: number;
  
  // Transaction details
  payment_method: 'cash' | 'card' | 'credit';
  notes: string | null;
  line_order: number;
  
  // Metadata
  created_at: string;
  updated_at: string;
  created_by: string;
  
  // Sync state (for offline functionality)
  _synced: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
}

// Cart item - partial BillLineItem for items being added to cart
export interface CartItem extends Omit<BillLineItem, 'id' | 'created_at' | 'created_by' | 'received_value'> {
  id?: string; // Optional for new cart items
  received_value?: number; // Optional until checkout
  created_at?: string;
  created_by?: string;
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
    store_id: dbRow.store_id,
    bill_id: dbRow.bill_id,
    inventory_item_id: dbRow.inventory_item_id,
    product_id: dbRow.product_id,
    supplier_id: dbRow.supplier_id,
    customer_id: dbRow.customer_id,
    product_name: dbRow.product_name,
    supplier_name: dbRow.supplier_name,
    quantity: dbRow.quantity,
    weight: dbRow.weight,
    unit_price: dbRow.unit_price,
    line_total: dbRow.line_total,
    received_value: dbRow.received_value,
    payment_method: dbRow.payment_method,
    notes: dbRow.notes,
    line_order: dbRow.line_order,
    created_at: dbRow.created_at,
    updated_at: dbRow.updated_at,
    created_by: dbRow.created_by,
    _synced: true,
    _lastSyncedAt: undefined,
    _deleted: false,
  }),

  // Convert from frontend BillLineItem to database insert
  toDbInsert: (billLineItem: BillLineItem): BillLineItemDbInsert => ({
    id: billLineItem.id,
    store_id: billLineItem.store_id,
    bill_id: billLineItem.bill_id,
    product_id: billLineItem.product_id,
    product_name: billLineItem.product_name,
    supplier_id: billLineItem.supplier_id,
    supplier_name: billLineItem.supplier_name,
    inventory_item_id: billLineItem.inventory_item_id,
    quantity: billLineItem.quantity,
    unit_price: billLineItem.unit_price,
    line_total: billLineItem.line_total,
    weight: billLineItem.weight,
    notes: billLineItem.notes,
    line_order: billLineItem.line_order,
    payment_method: billLineItem.payment_method,
    customer_id: billLineItem.customer_id,
    created_by: billLineItem.created_by,
    received_value: billLineItem.received_value,
  }),

  // Convert from frontend BillLineItem to database update
  toDbUpdate: (updates: Partial<BillLineItem>): BillLineItemDbUpdate => {
    const dbUpdate: BillLineItemDbUpdate = {};
    
    if (updates.inventory_item_id !== undefined) dbUpdate.inventory_item_id = updates.inventory_item_id;
    if (updates.product_id !== undefined) dbUpdate.product_id = updates.product_id;
    if (updates.supplier_id !== undefined) dbUpdate.supplier_id = updates.supplier_id;
    if (updates.customer_id !== undefined) dbUpdate.customer_id = updates.customer_id;
    if (updates.quantity !== undefined) dbUpdate.quantity = updates.quantity;
    if (updates.weight !== undefined) dbUpdate.weight = updates.weight;
    if (updates.unit_price !== undefined) dbUpdate.unit_price = updates.unit_price;
    if (updates.line_total !== undefined) dbUpdate.line_total = updates.line_total;
    if (updates.received_value !== undefined) dbUpdate.received_value = updates.received_value;
    if (updates.payment_method !== undefined) dbUpdate.payment_method = updates.payment_method;
    if (updates.notes !== undefined) dbUpdate.notes = updates.notes;
    
    return dbUpdate;
  },

  // Convert CartItem to BillLineItem (for checkout)
  fromCartItem: (cartItem: CartItem, id: string, billId: string, createdAt: string, createdBy: string): BillLineItem => ({
    ...cartItem,
    id,
    bill_id: billId,
    created_at: createdAt,
    created_by: createdBy,
    line_total: cartItem.line_total || (cartItem.quantity * cartItem.unit_price),
    received_value: cartItem.received_value || cartItem.line_total || (cartItem.quantity * cartItem.unit_price),
    _synced: false,
    _deleted: false,
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
  description: MultilingualString; // Supports both string (backwards compatible) and multilingual object
  reference: string | null;
  store_id: string;
  created_by: string;
  created_at: string;
  supplier_id: string | null;
  customer_id: string | null;
  _synced: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
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

// Additional interfaces for db.ts (Dexie-specific) - matches database schema exactly
export interface Store {
  id: string;
  store_id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  preferred_currency: 'USD' | 'LBP';
  preferred_language: 'en' | 'ar' | 'fr';
  preferred_commission_rate: number;
  exchange_rate: number;
  low_stock_alert: boolean;
  created_at: string;
  updated_at: string;
  _synced: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
}

export interface CashDrawerAccount {
  id: string;
  store_id: string;
  account_code: string;
  name: string;
  currency: string;
  is_active: boolean;
  current_balance: number | null;
  created_at: string;
  updated_at: string;
  _synced: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
}

export interface CashDrawerSession {
  id: string;
  store_id: string;
  account_id: string;
  opened_by: string;
  opened_at: string;
  closed_at?: string;
  closed_by?: string;
  opening_amount: number;
  expected_amount?: number;
  actual_amount?: number;
  variance?: number;
  status: 'open' | 'closed';
  notes?: string;
  created_at: string;
  updated_at: string;
  _synced: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
}

export interface MissedProduct {
  id: string;
  store_id: string;
  session_id: string;
  inventory_item_id: string;
  system_quantity: number;
  physical_quantity: number;
  variance: number;
  notes?: string;
  product_name: string;
  created_at: string;
  updated_at: string;
  _synced: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
}

export interface BillAuditLog {
  id: string;
  store_id: string;
  bill_id: string;
  action: 'created' | 'updated' | 'deleted' | 'item_added' | 'item_removed' | 'item_modified' | 'payment_updated';
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
  change_reason: string | null;
  changed_by: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
  _synced: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
}

export interface SyncMetadata {
  id: string;
  table_name: string;
  last_synced_at: string;
}

export interface PendingSync {
  id: string;
  table_name: string;
  record_id: string;
  operation: 'create' | 'update' | 'delete';
  created_at: string;
  retry_count: number;
}

// Notification types
export type NotificationType = 
  | 'low_stock'
  | 'bill_due'
  | 'payment_due'
  | 'payment_reminder'
  | 'sync_complete'
  | 'sync_error'
  | 'inventory_alert'
  | 'cash_drawer_discrepancy'
  | 'bill_ready_to_close'
  | 'reminder_due'
  | 'reminder_overdue'
  | 'reminder_upcoming'
  | 'info'
  | 'warning'
  | 'error'
  | 'success';

export interface NotificationRecord {
  id: string;
  store_id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  priority: 'low' | 'medium' | 'high';
  action_url?: string;
  action_label?: string;
  metadata?: Record<string, any>;
  created_at: string;
  expires_at?: string;
}

export interface NotificationPreferences {
  store_id: string;
  enabled: boolean;
  enabled_types: NotificationType[];
  sound_enabled: boolean;
  show_in_app: boolean;
  auto_dismiss_seconds?: number;
  max_notifications_in_history: number;
}

// =====================================================
// UNIFIED REMINDER SYSTEM TYPES
// =====================================================

export type ReminderType = 
  | 'supplier_advance_review'
  | 'payment_due'
  | 'bill_payment'
  | 'customer_followup'
  | 'inventory_reorder'
  | 'contract_renewal'
  | 'license_expiration'
  | 'equipment_maintenance'
  | 'employee_review'
  | 'insurance_renewal'
  | 'lease_renewal'
  | 'custom';

export type ReminderEntityType = 
  | 'supplier'
  | 'customer'
  | 'transaction'
  | 'bill'
  | 'inventory'
  | 'employee'
  | 'contract'
  | 'equipment'
  | 'license'
  | 'other';

export type ReminderStatus = 
  | 'pending'
  | 'completed'
  | 'dismissed'
  | 'overdue'
  | 'snoozed';

export type RecurrencePattern = 
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly';

// Cloud notification channels (for future use)
export interface NotificationChannels {
  in_app: boolean;
  email?: boolean;
  sms?: boolean;
  push?: boolean;
}

// Cloud notification history entry (for future use)
export interface NotificationHistoryEntry {
  sent_at: string;
  channel: 'in_app' | 'email' | 'sms' | 'push';
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'read' | 'clicked';
  provider_id?: string;
  error_message?: string;
  opened_at?: string;
  clicked_at?: string;
}

// Employee Attendance interface for check-in/check-out tracking
export interface EmployeeAttendance {
  id: string;
  store_id: string;
  employee_id: string;
  check_in_at: string; // ISO datetime string
  check_out_at?: string | null; // ISO datetime string, null if still checked in
  notes?: string | null;
  created_at: string;
  updated_at: string;
  _synced: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
}

export interface Reminder {
  // Primary key and store relationship
  id: string;
  store_id: string;
  
  // What to remind about
  type: ReminderType;
  
  // Who/what is this about (polymorphic relationship)
  entity_type: ReminderEntityType;
  entity_id: string;
  entity_name: string; // Denormalized for performance
  
  // When to remind
  due_date: string; // ISO date string
  remind_before_days: number[]; // [7, 3, 1, 0] = remind 7, 3, 1 days before and on due date
  
  
  // Status tracking
  status: ReminderStatus;
  completed_at?: string;
  completed_by?: string;
  completion_note?: string;
  snoozed_until?: string; // ISO date string
  
  // Notification tracking (for local notifications)
  last_notified_at?: string;
  notification_count: number;
  
  // Details
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  action_url?: string;
  
  // Metadata (flexible for type-specific data)
  metadata?: Record<string, any>;
  
  // =====================================================
  // CLOUD NOTIFICATION INFRASTRUCTURE (FUTURE USE)
  // These fields are included for future cloud notification support
  // Currently inactive but ready for activation without code changes
  // =====================================================
  
  // Notification delivery channels (for future cloud notifications)
  notification_channels?: NotificationChannels;
  
  // Cloud notification settings (INACTIVE - for future use)
  send_via_cloud?: boolean; // Set to TRUE to enable cloud notifications
  cloud_notification_sent?: boolean;
  next_cloud_notification_at?: string;
  
  // Notification history tracking (for future cloud delivery tracking)
  notification_history?: NotificationHistoryEntry[];
  
  // User targeting (who should be notified - for future multi-user support)
  notify_users?: string[]; // Array of user IDs
  notify_roles?: ('admin' | 'manager' | 'cashier')[]; // Array of roles
  
  // =====================================================
  // END CLOUD NOTIFICATION INFRASTRUCTURE
  // =====================================================
  
  // Audit fields
  created_at: string;
  created_by: string;
  updated_at: string;
  
  // Sync state (for offline functionality)
  _synced: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
}

// Helper type for creating reminders (omits auto-generated fields)
export type CreateReminderInput = Omit<
  Reminder,
  'id' | 'created_at' | 'updated_at' | 'notification_count' | '_synced' | '_lastSyncedAt' | '_deleted'
> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

// Helper type for updating reminders
export type UpdateReminderInput = Partial<
  Omit<Reminder, 'id' | 'store_id' | 'created_at' | 'created_by' | '_synced' | '_lastSyncedAt'>
>;

// Reminder statistics
export interface ReminderStats {
  total: number;
  pending: number;
  overdue: number;
  dueToday: number;
  dueThisWeek: number;
  completed: number;
  byType: Record<ReminderType, number>;
  byPriority: Record<'low' | 'medium' | 'high' | 'urgent', number>;
}
