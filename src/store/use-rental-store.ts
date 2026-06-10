import { create } from 'zustand';

export interface RentalItem {
  id: string;
  name: string;
  category: string;
  totalQuantity: number;
  availableQuantity: number;
  dailyRate: number;
  hourlyRate?: number;
  status: 'available' | 'maintenance' | 'retired';
  createdAt: any;
}

export interface RentalBooking {
  id: string;
  customerId: string;
  customerName: string;
  itemId: string;
  itemName: string;
  startDate: any;
  endDate: any;
  status: 'reserved' | 'active' | 'completed' | 'cancelled' | 'overdue';
  totalCost: number;
  depositAmount: number;
  depositReturned: boolean;
  createdAt: any;
}

interface RentalState {
  inventory: RentalItem[];
  bookings: RentalBooking[];
  loading: boolean;
  error: string | null;
  setInventory: (items: RentalItem[]) => void;
  setBookings: (bookings: RentalBooking[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useRentalStore = create<RentalState>((set) => ({
  inventory: [],
  bookings: [],
  loading: true,
  error: null,
  setInventory: (items) => set({ inventory: items }),
  setBookings: (bookings) => set({ bookings }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error })
}));
