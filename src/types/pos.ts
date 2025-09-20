export interface Customer {
  id: string;
  name: string;
  phone?: string;
  balance?: number;
}

export interface CartItem {
  productId: string;
  inventoryItemId: string;
  name: string;
  quantity: number;
  price: number;
  supplierName: string;
}

export interface BillTab {
  id: string;
  name: string;
  cart: CartItem[];
  customer?: Customer | null;
  notes?: string;
}
