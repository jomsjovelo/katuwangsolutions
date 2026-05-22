import { Timestamp } from 'firebase/firestore';

export interface Product {
  id: string;
  tenantId: string;
  name: string;
  sku?: string;
  category: string;
  currentStock: number;
  minStock: number;
  costPrice: number; // in centavos
  salePrice: number; // in centavos
  unit: string;
  isActive: boolean;
  createdAt?: Timestamp | Date | any;
  updatedAt?: Timestamp | Date | any;
}

export interface CartItem {
  productId: string;
  name: string;
  quantity: number;
  price: number; // centavos
  costPrice?: number; // centavos
}

export interface SaleRecord {
  id: string;
  tenantId: string;
  items: CartItem[];
  totalAmount: number; // centavos
  paymentMethod: string; // 'cash' | 'gcash'
  gcashRef?: string;
  createdAt?: Timestamp | Date | any;
  customerId?: string;
}

export interface Borrower {
  id: string;
  tenantId: string;
  name: string;
  phone?: string;
  creditLimit: number;
  outstanding: number;
  dailyDue: number;
  status: 'active' | 'cleared' | 'defaulted';
  createdAt?: Timestamp | Date | any;
}
