// Multilingual data types
import type { MultilingualString } from '../utils/multilingual';
import type { CurrencyCode } from './currency';

export type {
  StoreCore,
  StoreCoreInsert,
  BranchCore,
  UserCore,
  StoreSubscriptionCore,
} from './supabase-core';

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
  currency: CurrencyCode;
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

// Dexie / full store row shapes live in store-app (`types/index.ts`); shared exports only cross-app
// contract cores (`StoreCore`, etc. in `./supabase-core`) — see IMPROVEMENTS §1.4.

// Re-export MultilingualString for convenience
export type { MultilingualString, SupportedLanguage } from '../utils/multilingual';

export type { CurrencyCode, CurrencyMeta } from './currency';
export { CURRENCY_META } from './currency';

export type { CountryConfig } from './countries';
export { COUNTRY_CONFIGS, COUNTRY_MAP, getDefaultCurrenciesForCountry } from './countries';
