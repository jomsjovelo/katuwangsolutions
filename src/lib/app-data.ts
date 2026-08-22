import {
  ShoppingCart, Leaf, Hammer, Utensils, Coffee, CalendarHeart, RotateCcw,
  Droplets, Sparkles, Sun, Scissors, Dumbbell, Wrench, Truck, Car, Banknote,
  BookText, HandCoins, Bed, LucideIcon
} from 'lucide-react';

export type AppModule = {
  id: string;
  name: string;
  icon: LucideIcon;
  tagline: string;
  imageSrc: string;
  features: string[];
  description: string;
  targetUsers?: string[];
};

export type AppGroup = {
  id: string;
  label: string;
  accentColor: string;
  apps: AppModule[];
};

export type BentaBusinessProfile = 'standard-retail' | 'fresh-goods' | 'hardware-supplies' | 'wholesale';

export const BENTA_PROFILES: { id: BentaBusinessProfile; label: string; description: string }[] = [
  { id: 'standard-retail', label: 'General Retail / Sari-Sari', description: 'Para sa sari-sari store, grocery, mini mart, RTW, at general retail' },
  { id: 'fresh-goods', label: 'Palengke / Fresh Goods', description: 'Basic POS at sales recording para sa paninda' },
  { id: 'hardware-supplies', label: 'Hardware / Construction', description: 'POS, benta, inventory, at pautang tracking para sa hardware' },
  { id: 'wholesale', label: 'Wholesale / Distribution', description: 'POS, benta, at inventory para sa wholesale selling' },
];

export const DEFAULT_BENTA_BUSINESS_PROFILE: BentaBusinessProfile = 'standard-retail';

export const appGroups: AppGroup[] = [
  {
    id: 'retail',
    label: 'Retail',
    accentColor: '#06B6D4',
    apps: [
      {
        id: 'benta-snap',
        name: 'Benta Snap',
        icon: ShoppingCart,
        tagline: 'POS, Sales & Inventory para sa negosyo mo.',
        imageSrc: '/apps/benta-snap.png',
        features: ['Sales Recording & POS', 'Inventory Monitoring', 'Customer Credit Tracking', 'Thermal Receipts & Cashier Shift'],
        description: 'POS, Sales & Inventory para sa Sari-Sari, Grocery, General Retail, Hardware at negosyo mo.',
        targetUsers: ['Sari-Sari Stores', 'Groceries & Mini Marts', 'Retail Shops', 'Hardware Stores', 'General Retail & Wholesale']
      }
    ]
  },
  {
    id: 'food',
    label: 'Food & Events',
    accentColor: '#F97316',
    apps: [
      {
        id: 'bite-snap',
        name: 'Bite Snap',
        icon: Utensils,
        tagline: 'Manage orders, tables, kitchen queue, and cashier workflow.',
        imageSrc: '/apps/bite-snap.png',
        features: ['Order Management', 'Table Management', 'Kitchen Queue', 'Cashier Workflow'],
        description: 'Manage orders, tables, kitchen queue, and cashier workflow.',
        targetUsers: ['Restaurants', 'Karinderya', 'Diners', 'Fast Food Kiosks']
      },
      {
        id: 'timpla-track',
        name: 'Timpla Track',
        icon: Coffee,
        tagline: 'Organize café orders and preparation queue.',
        imageSrc: '/apps/timpla-track.png',
        features: ['Café Orders', 'Preparation Queue'],
        description: 'Organize café orders and preparation queue.',
        targetUsers: ['Coffee Shops', 'Milk Tea Bars', 'Drink Kiosks']
      },
      {
        id: 'ganap-master',
        name: 'Ganap Master',
        icon: CalendarHeart,
        tagline: 'Manage events, client and payment records, and RSVP workflow.',
        imageSrc: '/apps/ganap-master.png',
        features: ['Event Records', 'Client Records', 'Payment Records', 'RSVP Workflow'],
        description: 'Manage events, client and payment records, and RSVP workflow.',
        targetUsers: ['Event Planners', 'Wedding Coordinators', 'Caterers', 'Venues']
      }
    ]
  },
  {
    id: 'service',
    label: 'Serbisyo',
    accentColor: '#8B5CF6',
    apps: [
      {
        id: 'spin-snap',
        name: 'Spin Snap',
        icon: RotateCcw,
        tagline: 'Track laundry jobs through Received, Washing, Folding, and Ready.',
        imageSrc: '/apps/spin-snap.png',
        features: ['Received', 'Washing', 'Folding', 'Ready'],
        description: 'Track laundry jobs through Received, Washing, Folding, and Ready.',
        targetUsers: ['Laundromats', 'Dry Cleaners', 'Self-Service Laundry']
      },
      {
        id: 'hydro-sync',
        name: 'Hydro Sync',
        icon: Droplets,
        tagline: 'Track water-refill orders and delivery queue.',
        imageSrc: '/apps/hydro-sync.png',
        features: ['Refill Orders', 'Delivery Queue'],
        description: 'Track water-refill orders and delivery queue.',
        targetUsers: ['Water Refilling Stations', 'Ice Plants', 'Mineral Water Dealers']
      },
      {
        id: 'auto-boss',
        name: 'Auto Boss',
        icon: Sparkles,
        tagline: 'Manage carwash and service job orders, status, parts, and labor records.',
        imageSrc: '/apps/auto-boss.png',
        features: ['Job Orders', 'Job Status', 'Parts Records', 'Labor Records'],
        description: 'Manage carwash and service job orders, status, parts, and labor records.',
        targetUsers: ['Auto Repair Shops', 'Car Washes', 'Motorcycle Shops', 'Detailing']
      },
      {
        id: 'wellness-pro',
        name: 'Wellness',
        icon: Sun,
        tagline: 'Organize spa and massage appointments, sessions, and billing.',
        imageSrc: '/apps/wellness-pro.png',
        features: ['Appointments', 'Sessions', 'Billing Records'],
        description: 'Organize spa and massage appointments, sessions, and billing.',
        targetUsers: ['Spas', 'Massage Clinics', 'Wellness Centers', 'Skin Clinics']
      },
      {
        id: 'trim-track',
        name: 'Trim Track',
        icon: Scissors,
        tagline: 'Manage salon and barbershop queue, services, and payment records.',
        imageSrc: '/apps/trim-track.png',
        features: ['Customer Queue', 'Service Records', 'Payment Records'],
        description: 'Manage salon and barbershop queue, services, and payment records.',
        targetUsers: ['Barbershops', 'Salons', 'Beauty Parlors', 'Nail Spas']
      },
      {
        id: 'rep-sync',
        name: 'Rep Sync',
        icon: Dumbbell,
        tagline: 'Track memberships, walk-ins, trainer activities, and related records for gyms and fitness centers.',
        imageSrc: '/apps/rep-sync.png',
        features: ['Memberships', 'Walk-ins', 'Trainer Activities', 'Related Records'],
        description: 'Track memberships, walk-ins, trainer activities, and related records for gyms and fitness centers.',
        targetUsers: ['Gyms', 'CrossFit Boxes', 'Fitness Studios', 'Boxing Gyms']
      },
      {
        id: 'service-master',
        name: 'Service Master',
        icon: Wrench,
        tagline: 'Manage service and repair jobs, status, and payment records.',
        imageSrc: '/apps/service-master.png',
        features: ['Service Jobs', 'Repair Jobs', 'Job Status', 'Payment Records'],
        description: 'Manage service and repair jobs, status, and payment records.',
        targetUsers: ['Appliance Repair', 'Electronics Shops', 'Handyman Services', 'Phone Repair']
      }
    ]
  },
  {
    id: 'logistics',
    label: 'Logistics & Rental',
    accentColor: '#10B981',
    apps: [
      {
        id: 'biyahe-sync',
        name: 'Biyahe Sync',
        icon: Truck,
        tagline: 'Track trips, customer charges, fuel, tolls, expenses, and income.',
        imageSrc: '/apps/biyahe-sync.png',
        features: ['Trip Tracking', 'Customer Charges', 'Fuel and Tolls', 'Expenses and Income'],
        description: 'Track trips, customer charges, fuel, tolls, expenses, and income.',
        targetUsers: ['Trucking Companies', 'Haulers', 'Moving Services', 'Delivery Fleets']
      },
      {
        id: 'rental',
        name: 'Rental',
        icon: Car,
        tagline: 'Track rental inventory, bookings, returns, and payments.',
        imageSrc: '/apps/rental.png',
        features: ['Rental Inventory', 'Bookings', 'Returns', 'Payments'],
        description: 'Track rental inventory, bookings, returns, and payments.',
        targetUsers: ['Equipment Rentals', 'Vehicle Rentals', 'Gown & Suit Rentals', 'Party Rentals']
      }
    ]
  },
  {
    id: 'financial',
    label: 'Pinansyal & HR',
    accentColor: '#3B82F6',
    apps: [
      {
        id: 'sahod-flow',
        name: 'Sahod Flow',
        icon: Banknote,
        tagline: 'Manage employee and payroll records for supported daily or monthly rates.',
        imageSrc: '/apps/sahod-flow.png',
        features: ['Employee Records', 'Daily-Rate Payroll', 'Monthly-Rate Payroll'],
        description: 'Manage employee and payroll records for supported daily or monthly rates.',
        targetUsers: ['SMEs', 'Contractors', 'Retail Owners', 'Shops']
      },
      {
        id: 'ledger-flow',
        name: 'Ledger Flow',
        icon: BookText,
        tagline: 'Record and review income and expense records.',
        imageSrc: '/apps/ledger-flow.png',
        features: ['Income Records', 'Expense Records', 'Record Review'],
        description: 'Record and review income and expense records.',
        targetUsers: ['Business Owners', 'Accountants', 'Managers']
      },
      {
        id: '5-6-tracker',
        name: '5-6 Tracker',
        icon: HandCoins,
        tagline: 'Track loans, balances, collections, and credit limits.',
        imageSrc: '/apps/5-6-tracker.png',
        features: ['Loan Tracking', 'Balance Records', 'Collection Tracking', 'Credit Limits'],
        description: 'Track loans, balances, collections, and credit limits.',
        targetUsers: ['Micro-Lenders', 'Financiers', 'Co-ops', 'Credit Unions']
      }
    ]
  },
  {
    id: 'hospitality',
    label: 'Hospitality',
    accentColor: '#D97706',
    apps: [
      {
        id: 'tsek-in',
        name: 'Tsek-In',
        icon: Bed,
        tagline: 'Lightweight property-management workflow for room status, guest stays, and checkout billing for small lodging businesses.',
        imageSrc: '/apps/tsek-in.png',
        features: ['Room Status', 'Guest Stays', 'Checkout Billing'],
        description: 'Lightweight property-management workflow for room status, guest stays, and checkout billing for small lodging businesses.',
        targetUsers: ['Resorts', 'Boarding Houses', 'Apartelles', 'Motels', 'Transient Houses']
      }
    ]
  },
  {
    id: 'finance',
    label: 'Finance',
    accentColor: '#8B5CF6',
    apps: [
      {
        id: 'budget-mo',
        name: 'Budget Mo',
        icon: Banknote,
        tagline: 'Track budgets, transactions, debts, and savings for personal or small-business planning.',
        imageSrc: '/apps/budget-mo.png',
        features: ['Budgets', 'Transactions', 'Debts', 'Savings'],
        description: 'Track budgets, transactions, debts, and savings for personal or small-business planning.',
        targetUsers: ['Individuals', 'Employees', 'Students', 'Freelancers']
      }
    ]
  }
];

export const activeModules: AppModule[] = appGroups.flatMap(g => g.apps);
export const activeModulesCount = activeModules.length;
export const businessModules = activeModules.filter(a => a.id !== 'budget-mo');
export const standardModulesCount = businessModules.length;

export function getActiveAppById(id: string): AppModule | undefined {
  const normalized = normalizeModuleId(id);
  return activeModules.find(a => a.id === normalized);
}

export function isValidActiveModuleId(id: string): boolean {
  const normalized = normalizeModuleId(id);
  return activeModules.some(a => a.id === normalized);
}

export function normalizeModuleId(id: string): string {
  if (!id) return '';
  const lower = id.toLowerCase();
  if (lower === 'fleet-sync') return 'biyahe-sync';
  if (lower === 'rental-track') return 'rental';
  if (lower === 'fresh-tally' || lower === 'build-stack') return 'benta-snap';
  return lower;
}
