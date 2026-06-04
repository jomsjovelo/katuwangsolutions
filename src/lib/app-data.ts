import {
  ShoppingCart, Leaf, Hammer,
  Utensils, Coffee, CalendarHeart, RotateCcw, Droplets,
  Sparkles, Sun, Banknote, BookText, Truck, Scissors, Dumbbell, LucideIcon
} from 'lucide-react';

export interface AppModule {
  id: string; // e.g. benta-snap
  name: string;
  icon: LucideIcon;
  tagline: string;
  imageSrc: string;
  features: string[];
}

export interface AppGroup {
  id: string;
  label: string;
  accentColor: string;
  apps: AppModule[];
}

export const appGroups: AppGroup[] = [
  {
    id: 'retail',
    label: 'Retail',
    accentColor: '#06B6D4',
    apps: [
      { id: 'benta-snap', name: 'Benta Snap', icon: ShoppingCart, tagline: 'Lightning-fast retail checkout to maximize your daily sales.', imageSrc: '/apps/benta-snap.png', features: ['Real-time inventory sync', 'Barcode scanning', 'Daily sales reports'] },
      { id: 'fresh-tally', name: 'Fresh Tally', icon: Leaf, tagline: 'Smart inventory tracking to keep your fresh produce moving.', imageSrc: '/apps/fresh-tally.png', features: ['Perishables tracking', 'Batch expiration alerts', 'Supplier management'] },
      { id: 'build-stack', name: 'Build Stack', icon: Hammer, tagline: 'Precision material tracking for seamless construction supply.', imageSrc: '/apps/build-stack.png', features: ['Bulk item management', 'Delivery scheduling', 'Contractor pricing'] },
    ],
  },
  {
    id: 'food',
    label: 'Food',
    accentColor: '#F97316',
    apps: [
      { id: 'bite-snap', name: 'Bite Snap', icon: Utensils, tagline: 'Rapid order-to-kitchen flow for hungry diners.', imageSrc: '/apps/bite-snap.png', features: ['Kitchen Display System', 'Table management', 'Split bills'] },
      { id: 'timpla-track', name: 'Timpla Track', icon: Coffee, tagline: 'Crafted cafe operations for the perfect brew every time.', imageSrc: '/apps/timpla-track.png', features: ['Recipe costing', 'Loyalty cards', 'Order queue'] },
      { id: 'ganap-master', name: 'Ganap Master', icon: CalendarHeart, tagline: 'Orchestrate unforgettable events with flawless planning.', imageSrc: '/apps/ganap-master.png', features: ['Vendor payments', 'Guest RSVP', 'Timeline builder'] },
    ],
  },
  {
    id: 'service',
    label: 'Serbisyo',
    accentColor: '#8B5CF6',
    apps: [
      { id: 'spin-snap', name: 'Spin Snap', icon: RotateCcw, tagline: 'Automated laundry tracking from drop-off to pickup.', imageSrc: '/apps/spin-snap.png', features: ['Machine scheduling', 'Weigh-in ticketing', 'SMS alerts'] },
      { id: 'hydro-sync', name: 'Hydro Sync', icon: Droplets, tagline: 'Streamlined water delivery logistics for thirsty neighborhoods.', imageSrc: '/apps/hydro-sync.png', features: ['Jug tracking', 'Route optimization', 'Subscription billing'] },
      { id: 'auto-boss', name: 'Auto Boss', icon: Sparkles, tagline: 'Rev up your shop with automated slot and payment tracking.', imageSrc: '/apps/auto-boss.png', features: ['Service history', 'Mechanic assignment', 'Parts inventory'] },
      { id: 'wellness-pro', name: 'Wellness Pro', icon: Sun, tagline: 'Elevate your spa experience with seamless booking and billing.', imageSrc: '/apps/wellness-pro.png', features: ['Appointment calendar', 'Staff commissions', 'Package sales'] },
      { id: 'trim-track', name: 'Trim Track', icon: Scissors, tagline: 'Keep your barber chairs full and your payments tracked.', imageSrc: '/apps/trim-track.png', features: ['Walk-in queue', 'Barber tips', 'Inventory of hair products'] },
      { id: 'rep-sync', name: 'Rep Sync', icon: Dumbbell, tagline: 'Automate gym memberships, attendance, and renewals effortlessly.', imageSrc: '/apps/rep-sync.png', features: ['Member check-in', 'Trainer booking', 'Supplement sales'] },
    ],
  },
  {
    id: 'business',
    label: 'Negosyo',
    accentColor: '#10B981',
    apps: [
      { id: 'sahod-flow', name: 'Sahod Flow', icon: Banknote, tagline: 'Effortless payroll management for a happy, on-time team.', imageSrc: '/apps/sahod-flow.png', features: ['Attendance tracking', 'Payslip generation', 'Deduction management'] },
      { id: 'ledger-flow', name: 'Ledger Flow', icon: BookText, tagline: 'Crystal-clear financial insights to watch your profits soar.', imageSrc: '/apps/ledger-flow.png', features: ['Expense categorization', 'Profit & Loss statements', 'Tax ready reports'] },
      { id: 'biyahe-sync', name: 'Biyahe Sync', icon: Truck, tagline: 'Real-time fleet dispatching to keep your business moving.', imageSrc: '/apps/biyahe-sync.png', features: ['Driver tracking', 'ePOD signatures', 'Fuel expense logs'] },
    ],
  },
  {
    id: 'financial',
    label: 'Pinansyal',
    accentColor: '#3B82F6',
    apps: [
      { id: '5-6-tracker', name: '5-6 Tracker', icon: BookText, tagline: 'Secure, automated lending lists for faster collections.', imageSrc: '/apps/5-6-tracker.png', features: ['Interest calculator', 'Due date reminders', 'Partial payment tracking'] },
    ],
  },
];
