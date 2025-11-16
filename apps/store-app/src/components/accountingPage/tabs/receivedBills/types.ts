/**
 * Shared types for Received Bills components
 */

export interface ReceivedBill {
  // Core identifiers
  id: string;
  batchId: string | null;
  productId: string;
  productName: string;
  supplierId: string;
  supplierName: string;

  // Bill type and fees
  type: 'commission' | 'purchase';
  batchPorterage: number | null;
  batchTransferFee: number | null;
  batchNotes: string | null;
  commissionRate?: number;

  // Quantities
  originalQuantity: number;
  remainingQuantity: number;
  totalSoldQuantity: number;
  unit?: string;
  weight?: number;

  // Financial data
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  avgUnitPrice: number;
  estimatedTotalValue: number;

  // Status and progress
  progress: number;
  status: 'active' | 'low_stock' | 'out_of_stock' | 'closed';
  isClosed: boolean;
  saleCount: number;

  // Metadata
  receivedAt: string;
  receivedBy: string;
}

export interface ReceivedBillGroup {
  // Group identifiers
  groupId: string;
  batchId: string | null;
  isBatch: boolean;

  // Display info
  supplierName: string;
  productName: string;
  type: string;

  // Items in group
  items: ReceivedBill[];

  // Aggregated quantities
  originalQuantity: number;
  remainingQuantity: number;
  totalSoldQuantity: number;

  // Aggregated financial data
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;

  // Aggregated status
  progress: number;
  status: string;
  receivedAt: string;
}

export interface SaleLineItem {
  // IDs
  id: string;
  saleId: string;
  bill_id: string;
  product_id: string;
  inventory_item_id: string;
  store_id: string;

  // Dates
  saleDate: string;
  created_at: string;

  // Customer info (from parent bill)
  customerId: string | null;
  customerName: string;

  // Product/Supplier info
  productName: string;
  supplierName: string;

  // Quantities and pricing
  quantity: number;
  weight: number | null;
  unitPrice: number;
  receivedValue: number;
  line_total: number;

  // Payment (from parent bill)
  paymentMethod: 'cash' | 'card' | 'credit';

  // Other
  notes: string | null;
  line_order: number;
}

export interface CloseBillFees {
  commission: number;
  porterage: number;
  transfer: number;
  supplierAmount: number;
}
