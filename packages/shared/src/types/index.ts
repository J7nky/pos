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

// Re-export MultilingualString for convenience
export type { MultilingualString, SupportedLanguage } from '../utils/multilingual';

