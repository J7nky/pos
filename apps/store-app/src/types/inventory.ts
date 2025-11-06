import type { MultilingualString } from '@pos-platform/shared';

export interface Product {
  id: string;
  name: MultilingualString; // Supports both string (backwards compatible) and multilingual object { en: "apple", ar: "تفاح", fr: "pomme" }
  category: 'Fruits' | 'Vegetables' | 'Herbs' | 'Nuts' | 'Others';
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
  unit: 'kg' | 'piece' | 'box' | 'bag' | 'bundle' | 'dozen';
  weight?: number;
  price?: number;
  status?: string;
  batch_type: 'commission' | 'cash';
  created_at: string;
  createdAt: string;
  batch_id?: string | null;
  sku?: string | null;
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
  category: 'Fruits' | 'Vegetables' | 'Herbs' | 'Nuts' | 'Others';
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
  unit: 'kg' | 'piece' | 'box' | 'bag' | 'bundle' | 'dozen';
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
    unit: 'kg' | 'piece' | 'box' | 'bag' | 'bundle' | 'dozen';
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


