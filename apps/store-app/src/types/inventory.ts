import type { MultilingualString } from '../utils/multilingual';
import type { CurrencyCode } from '@pos-platform/shared';

export interface Product {
  id: string;
  name: MultilingualString; // Supports both string (backwards compatible) and multilingual object { en: "apple", ar: "تفاح", fr: "pomme" }
  /** FK into `product_categories` (v64+). Source of truth. */
  category_id?: string;
  /** @deprecated Legacy text category. Kept readable during the transition;
   *  new writes go through `category_id`. Removed in a future release. */
  category?: string;
  image: string;
  is_global?: boolean; // True for predefined global products, false/undefined for store-specific
  created_at: string;
  createdAt: string;
  _synced?: boolean;
  _deleted?: boolean;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  type: 'commission' | 'cash';
  created_at: string;
  createdAt: string;
}

export interface InventoryItem {
  id: string;
  product_id: string;
  // supplier_id REMOVED - resolve via inventory_bills batch_id
  quantity: number;
  received_quantity: number;
  /** FK into `units_of_measure` (v64+). Source of truth. */
  unit_id?: string;
  /** @deprecated Legacy unit code. Dual-written during the transition. */
  unit?: string;
  /** Frozen originally-received weight (never decremented; see weight_remaining). */
  weight?: number;
  price?: number;
  currency: CurrencyCode;
  status?: string;
  batch_type: 'commission' | 'cash';
  created_at: string;
  createdAt: string;
  batch_id?: string | null;
  sku?: string | null;
  is_archived?: boolean;
  /**
   * Per-lot tracking mode (spec 019, v71). Set at receiving, immutable.
   * true ⇒ weight is MANDATORY on every POS sale and the lot keeps a live
   * weight_remaining; false ⇒ quantity-only lot, no weight capture.
   */
  weight_tracked?: boolean;
  /** Live on-hand weight (weight-tracked lots). Init = received weight. */
  weight_remaining?: number | null;
  /** Received weight ÷ received units, snapshot at receiving (proportional weight for unit losses). */
  nominal_unit_weight?: number | null;
  _synced?: boolean;
  _deleted?: boolean;
}

export interface StockLevel {
  product_id: string;
  product_name: string;
  current_stock: number;
  unit: string;
  suppliers: Array<{
    supplier_id: string;
    supplier_name: string;
    quantity: number;
  }>;
  last_received?: string;
}

export interface ProductForm {
  name: string;
  /** FK into `product_categories.id` for the current store. */
  category_id: string;
  image: string;
  capturedPhoto: string;
}

export interface SupplierForm {
  name: string;
  phone: string;
  email: string;
  address: string;
  type: 'commission' | 'cash';
}

export interface ReceiveForm {
  supplier_id: string;
  type: 'commission' | 'cash';
  porterage_fee: string;
  transfer_fee: string;
  commission_rate: number | null;
  status: string;
  empty_plastic: boolean;
  plastic_count: string;
  plastic_price: string;
}

export interface BulkItem {
  product_id?: string;
  quantity: string;
  /** FK into `units_of_measure.id`. */
  unit_id: string;
  /** @deprecated Legacy unit code; preserved on existing draft items. */
  unit?: string;
  price?: string;
  weight?: string;
}

export interface InventoryBatch {
  type: 'commission' | 'cash';
  supplier_id: string;
  created_by: string;
  status: string;
  porterage_fee?: number;
  transfer_fee?: number;
  plastic_fee?: number;
  commission_rate?: number;
  items: Array<{
    product_id: string;
    supplier_id: string;
    type: 'commission' | 'cash';
    quantity: number;
    received_quantity: number;
    /** FK into `units_of_measure.id`. */
    unit_id: string;
    /** @deprecated Legacy unit code; dual-written during the transition. */
    unit?: string;
    weight?: number;
    price?: number;
    status?: string;
  }>;
}

export interface ToastMessage {
  type: 'success' | 'error';
  message: string;
}

export interface LoadingState {
  form?: boolean;
  product?: boolean;
  supplier?: boolean;
  initial?: boolean;
}


