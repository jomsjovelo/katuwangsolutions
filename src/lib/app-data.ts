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
  description: string;       // 2–3 sentence sales narrative
  benefits: string[];        // 3–4 "why it matters" bullets
  stats: { value: string; label: string }[]; // 2–3 impact metrics
  howItWorks: { step: string; detail: string }[]; // 3-step workflow
  targetUsers: string[];     // Target audience tags
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
      {
        id: 'benta-snap',
        name: 'Benta Snap',
        icon: ShoppingCart,
        tagline: 'Lightning-fast retail checkout to maximize your daily sales.',
        imageSrc: '/apps/benta-snap.png',
        features: ['Real-time inventory sync', 'Barcode scanning', 'Daily sales reports', 'Low stock alerts', 'Multi-payment support'],
        description: 'Run your sari-sari store or retail shop like a seasoned pro. Benta Snap delivers lightning-fast checkout, automatic stock deductions, and end-of-day sales summaries — all from a single smartphone. Stop losing sales to slow queues and manual counting errors.',
        benefits: [
          'Process transactions in under 5 seconds — even offline',
          'Get instant alerts when stock drops below your set threshold',
          'See your top-selling products at a glance every morning',
          'Accept cash, GCash, and e-wallets in one unified flow',
        ],
        stats: [
          { value: '100%', label: 'Stock accuracy' },
          { value: '₱0', label: 'Setup fee' },
          { value: '99.9%', label: 'Uptime guarantee' },
        ],
        howItWorks: [
          { step: 'Scan or tap a product', detail: 'Use barcode scanner or search by name — even without internet.' },
          { step: 'Customer pays any way', detail: 'Accept cash, GCash, Maya, and e-wallets in one tap.' },
          { step: 'Stock updates automatically', detail: 'No manual counting — inventory deducts itself after every sale.' }
        ],
        targetUsers: ['Sari-sari Stores', 'Retail Shops', 'Market Stalls']
      },
      {
        id: 'fresh-tally',
        name: 'Fresh Tally',
        icon: Leaf,
        tagline: 'Smart inventory tracking to keep your fresh produce moving.',
        imageSrc: '/apps/fresh-tally.png',
        features: ['Perishables tracking', 'Batch expiration alerts', 'Supplier management', 'Waste logging', 'Auto-discount suggestions'],
        description: 'Every spoiled mango is money thrown away. Fresh Tally tracks your produce by batch, expiry date, and supplier so you always know exactly what to sell first. Reduce waste, cut losses, and keep your shelves looking fresh every single day.',
        benefits: [
          'Automatic "sell first" suggestions based on expiry dates',
          'Batch-level tracking so you know exactly which delivery to pull',
          'Supplier scorecards to identify your most reliable partners',
          'Photo-evidence logging for damaged or rejected stock',
        ],
        stats: [
          { value: '40%', label: 'Avg. waste reduction' },
          { value: '100+', label: 'Produce categories supported' },
          { value: '1 tap', label: 'To log a full delivery' },
        ],
        howItWorks: [
          { step: 'Log incoming deliveries', detail: 'Snap a photo of the receipt and log batches by supplier and expiry.' },
          { step: 'Get sell-first alerts', detail: 'System automatically highlights which produce needs to move today.' },
          { step: 'Track supplier quality', detail: 'See which suppliers consistently deliver fresh vs. spoiled goods.' }
        ],
        targetUsers: ['Produce Vendors', 'Meat Shops', 'Grocery Stores']
      },
      {
        id: 'build-stack',
        name: 'Build Stack',
        icon: Hammer,
        tagline: 'Precision material tracking for seamless construction supply.',
        imageSrc: '/apps/build-stack.png',
        features: ['Bulk item management', 'Delivery scheduling', 'Contractor pricing', 'Credit limits', 'Unit conversion'],
        description: 'Construction supply is complex — thousands of SKUs, bulk orders, and contractor credit lines. Build Stack brings it all under control with a purpose-built system for hardware and building material retailers. Win more contractor accounts and deliver on time, every time.',
        benefits: [
          'Manage thousands of SKUs including bundle and unit pricing',
          'Schedule deliveries and track driver ETAs in real time',
          'Set unique price tiers for walk-in, wholesale, and contractor clients',
          'Generate delivery receipts and charge slips on the spot',
        ],
        stats: [
          { value: '5,000+', label: 'SKUs supported' },
          { value: '60%', label: 'Less manual paperwork' },
          { value: '2 min', label: 'To create a delivery order' },
        ],
        howItWorks: [
          { step: 'Manage bulk & units', detail: 'Set pricing for pieces, boxes, or truckloads with ease.' },
          { step: 'Track contractor lines', detail: 'Keep a running credit line for trusted contractors and builders.' },
          { step: 'Dispatch deliveries', detail: 'Generate delivery receipts and track driver routes in real-time.' }
        ],
        targetUsers: ['Hardware Stores', 'Construction Supply', 'Lumber Yards']
      },
    ],
  },
  {
    id: 'food',
    label: 'Food',
    accentColor: '#F97316',
    apps: [
      {
        id: 'bite-snap',
        name: 'Bite Snap',
        icon: Utensils,
        tagline: 'Rapid order-to-kitchen flow for hungry diners.',
        imageSrc: '/apps/bite-snap.png',
        features: ['Kitchen Display System', 'Table management', 'Split bills', 'Menu modifiers', 'Waiter tablets'],
        description: 'From the moment a customer sits down to the second they pay, Bite Snap keeps your restaurant running at full speed. Orders fly instantly to the kitchen display, tables are tracked in real time, and split bills take seconds — not minutes. Give your diners an experience worth coming back for.',
        benefits: [
          'Orders appear on the kitchen display the instant they are placed',
          'Color-coded table map shows status at a glance across the floor',
          'Split bills by seat, item, or percentage with one tap',
          'Built-in menu modifiers handle customizations without confusion',
        ],
        stats: [
          { value: '2×', label: 'Faster table turnaround' },
          { value: '0', label: 'Lost orders reported' },
          { value: '15 sec', label: 'Avg. order entry' },
        ],
        howItWorks: [
          { step: 'Punch in orders fast', detail: 'Waitstaff tap in orders that instantly appear on the kitchen display.' },
          { step: 'Track table status', detail: 'Color-coded map shows who is eating, waiting, or ready to pay.' },
          { step: 'Split bills instantly', detail: 'Divide the check by seat, item, or equally without the math headache.' }
        ],
        targetUsers: ['Restaurants', 'Diners', 'Food Parks']
      },
      {
        id: 'timpla-track',
        name: 'Timpla Track',
        icon: Coffee,
        tagline: 'Crafted cafe operations for the perfect brew every time.',
        imageSrc: '/apps/timpla-track.png',
        features: ['Recipe costing', 'Loyalty cards', 'Order queue', 'Ingredient deduction', 'Barista displays'],
        description: 'Your cafe deserves more than a generic POS. Timpla Track is built for coffee shops, milk tea bars, and artisan beverages — with recipe-level costing, a loyal customer program, and a smooth order queue that keeps baristas in their rhythm. Grow your regulars, protect your margins.',
        benefits: [
          'Know the exact cost and profit of every cup you serve',
          'Digital loyalty stamps that customers redeem automatically',
          'Real-time order queue visible to baristas and front-of-house',
          'Ingredient deduction per recipe keeps stock accurate automatically',
        ],
        stats: [
          { value: '25%', label: 'Avg. margin improvement' },
          { value: '3×', label: 'Loyalty redemption rate' },
          { value: '8 sec', label: 'Avg. order entry time' },
        ],
        howItWorks: [
          { step: 'Take custom orders', detail: 'Easily handle sugar levels, add-ons, and sizes in the queue.' },
          { step: 'Deduct ingredients', detail: 'Every cup sold automatically updates your milk, syrup, and bean inventory.' },
          { step: 'Reward regulars', detail: 'Digital loyalty stamps automatically apply to their phone number.' }
        ],
        targetUsers: ['Coffee Shops', 'Milk Tea Bars', 'Kiosks']
      },
      {
        id: 'ganap-master',
        name: 'Ganap Master',
        icon: CalendarHeart,
        tagline: 'Orchestrate unforgettable events with flawless planning.',
        imageSrc: '/apps/ganap-master.png',
        features: ['Vendor payments', 'Guest RSVP', 'Timeline builder', 'Conflict detection', 'Day-of checklist'],
        description: 'Weddings, debut parties, corporate dinners — every event has a hundred moving parts. Ganap Master is your all-in-one event command center: track vendor payments, manage guest RSVPs, and build a precise program timeline so nothing falls through the cracks on the big day.',
        benefits: [
          'Centralized vendor list with payment schedules and due-date alerts',
          'Digital RSVP links your guests can confirm from their phones',
          'Drag-and-drop program timeline with time-block conflict detection',
          'Day-of checklist shared live with your entire event team',
        ],
        stats: [
          { value: '200+', label: 'Events managed' },
          { value: '50%', label: 'Less coordinator stress' },
          { value: '1 app', label: 'Replaces 5 spreadsheets' },
        ],
        howItWorks: [
          { step: 'Build the timeline', detail: 'Drag and drop program blocks and assign vendors to each step.' },
          { step: 'Manage the guestlist', detail: 'Send digital RSVPs and track dietary restrictions in one place.' },
          { step: 'Track payments', detail: 'Know exactly when the caterer, photographer, and venue deposits are due.' }
        ],
        targetUsers: ['Event Planners', 'Wedding Coordinators', 'Caterers']
      },
    ],
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
        tagline: 'Automated laundry tracking from drop-off to pickup.',
        imageSrc: '/apps/spin-snap.png',
        features: ['Machine scheduling', 'Weigh-in ticketing', 'SMS alerts', 'Service type tracking', 'Lost-item prevention'],
        description: 'Never lose a customer\'s clothes again. Spin Snap tracks every batch from the moment it\'s weighed in to the second it\'s picked up — with automated SMS updates that keep your customers informed and your front desk stress-free. Run a cleaner, smarter laundry shop.',
        benefits: [
          'Digital tickets replace hand-written tags — no more mismatched loads',
          'Automatic SMS tells customers when their laundry is ready',
          'Machine schedule board prevents double-booking and idle time',
          'Track daily revenue by service type (wash, dry, fold, press)',
        ],
        stats: [
          { value: '0', label: 'Lost items' },
          { value: '30%', label: 'Fewer call-ins' },
          { value: '5 sec', label: 'To print a ticket' },
        ],
        howItWorks: [
          { step: 'Weigh and tag', detail: 'Log the laundry weight, service type, and generate a digital claim stub.' },
          { step: 'Assign machines', detail: 'Slot the batch into a washer/dryer schedule to maximize throughput.' },
          { step: 'Notify customer', detail: 'System sends an automatic SMS the moment the laundry is folded and ready.' }
        ],
        targetUsers: ['Laundromats', 'Dry Cleaners', 'Self-Service Laundry']
      },
      {
        id: 'hydro-sync',
        name: 'Hydro Sync',
        icon: Droplets,
        tagline: 'Streamlined water delivery logistics for thirsty neighborhoods.',
        imageSrc: '/apps/hydro-sync.png',
        features: ['Jug tracking', 'Route optimization', 'Subscription billing', 'Driver notes', 'Empty jug counts'],
        description: 'Water delivery is a logistics game — and Hydro Sync lets you win it. Track every gallon jug across multiple routes, automate subscription billing, and give your drivers turn-by-turn optimized routes so they deliver more in less time. Grow your subscriber base without growing your headaches.',
        benefits: [
          'Know exactly how many jugs are out, returned, or missing at any time',
          'Optimized daily routes cut fuel costs and delivery time',
          'Auto-billing for subscribers — no more chasing monthly payments',
          'Driver app with customer notes and delivery confirmation',
        ],
        stats: [
          { value: '20%', label: 'Fuel savings' },
          { value: '2×', label: 'More deliveries' },
          { value: '₱0', label: 'Missed billing' },
        ],
        howItWorks: [
          { step: 'Load the truck', detail: 'Log how many full jugs are assigned to each driver for the day.' },
          { step: 'Route deliveries', detail: 'Drivers follow an optimized map to drop off water and collect empties.' },
          { step: 'Auto-bill subscribers', detail: 'Monthly recurring payments are handled automatically.' }
        ],
        targetUsers: ['Water Refilling Stations', 'Ice Plants', 'Beverage Distributors']
      },
      {
        id: 'auto-boss',
        name: 'Auto Boss',
        icon: Sparkles,
        tagline: 'Rev up your shop with automated slot and payment tracking.',
        imageSrc: '/apps/auto-boss.png',
        features: ['Service history', 'Mechanic assignment', 'Parts inventory', 'Digital invoices', 'Labor costing'],
        description: 'Your auto shop runs on trust — and Auto Boss helps you build it. Every vehicle gets a complete service history, every mechanic is assigned clear jobs, and your parts inventory is always accounted for. Show customers a professional, transparent experience that keeps them coming back.',
        benefits: [
          'Full service history per vehicle — searchable by plate or owner',
          'Mechanic job cards with time tracking and labor costing',
          'Parts inventory with low-stock alerts and supplier reorder list',
          'Professional digital invoices customers can save and share',
        ],
        stats: [
          { value: '4.9★', label: 'Customer trust' },
          { value: '35%', label: 'More repeat visits' },
          { value: '10 min', label: 'To close a record' },
        ],
        howItWorks: [
          { step: 'Log vehicle issue', detail: 'Search by plate number to pull up full service history and add new complaints.' },
          { step: 'Assign mechanic & parts', detail: 'Allocate a bay, assign a mechanic, and pull parts from inventory.' },
          { step: 'Invoice transparently', detail: 'Generate a professional digital invoice with labor and parts breakdown.' }
        ],
        targetUsers: ['Auto Repair Shops', 'Car Washes', 'Detailing Centers']
      },
      {
        id: 'wellness-pro',
        name: 'Wellness Pro',
        icon: Sun,
        tagline: 'Elevate your spa experience with seamless booking and billing.',
        imageSrc: '/apps/wellness-pro.png',
        features: ['Appointment calendar', 'Staff commissions', 'Package sales', 'Client notes', 'Room scheduling'],
        description: 'Your spa is a sanctuary — your software should feel the same way. Wellness Pro gives you a beautiful appointment calendar, automated staff commission tracking, and flexible package deals that keep clients coming back again and again. Deliver premium service with zero administrative chaos.',
        benefits: [
          'Online booking calendar synced across all therapists and rooms',
          'Automatic commission calculation per staff member per service',
          'Sell and redeem prepaid session packages with ease',
          'Client preference notes so every visit feels personal',
        ],
        stats: [
          { value: '45%', label: 'More repeat bookings' },
          { value: '100%', label: 'Commission accuracy' },
          { value: '5 min', label: 'To onboard staff' },
        ],
        howItWorks: [
          { step: 'Book appointments', detail: 'Manage the calendar for all therapists and rooms in one view.' },
          { step: 'Track commissions', detail: 'System automatically calculates each therapist’s cut per service.' },
          { step: 'Sell packages', detail: 'Clients buy 10-session passes that digitally deduct upon every visit.' }
        ],
        targetUsers: ['Spas', 'Massage Clinics', 'Aesthetic Centers']
      },
      {
        id: 'trim-track',
        name: 'Trim Track',
        icon: Scissors,
        tagline: 'Keep your barber chairs full and your payments tracked.',
        imageSrc: '/apps/trim-track.png',
        features: ['Walk-in queue', 'Barber tips', 'Inventory of hair products', 'Service duration estimates', 'Weekly payouts'],
        description: 'A great barber shop lives and dies by the queue. Trim Track puts your walk-in flow on autopilot — customers see their wait time, barbers see their next client, and tips are tracked automatically so payouts are always fair. Run a tighter shop and happier team.',
        benefits: [
          'Digital walk-in queue displayed on a TV or tablet in the shop',
          'Tip tracking per barber with weekly payout summary',
          'Hair product inventory with revenue tracking for retail sales',
          'Service menu with duration estimates for accurate queue times',
        ],
        stats: [
          { value: '30%', label: 'Less idle time' },
          { value: '₱0', label: 'Tip disputes' },
          { value: '2×', label: 'Retail sales' },
        ],
        howItWorks: [
          { step: 'Queue walk-ins', detail: 'Customers see their exact wait time on a digital display board.' },
          { step: 'Complete service', detail: 'Barber finishes the cut and taps the service menu to finalize pricing.' },
          { step: 'Track tips & payouts', detail: 'Daily tips and service commissions are tracked for weekly payout.' }
        ],
        targetUsers: ['Barber Shops', 'Salons', 'Nail Bars']
      },
      {
        id: 'rep-sync',
        name: 'Rep Sync',
        icon: Dumbbell,
        tagline: 'Automate gym memberships, attendance, and renewals effortlessly.',
        imageSrc: '/apps/rep-sync.png',
        features: ['Member check-in', 'Trainer booking', 'Supplement sales', 'Renewal SMS', 'RFID integration'],
        description: 'Growing a gym means managing hundreds of members, trainers, and schedules simultaneously. Rep Sync handles member check-ins, sends renewal reminders before memberships lapse, tracks trainer bookings, and even logs your supplement counter sales — all in one powerful platform.',
        benefits: [
          'QR code or biometric check-in with automatic attendance logging',
          'Renewal reminders sent via SMS 7 days before expiry',
          'Trainer session scheduling with booking confirmation for members',
          'Supplement and merchandise POS built right in',
        ],
        stats: [
          { value: '90%', label: 'Renewal rate' },
          { value: '3 sec', label: 'Check-in time' },
          { value: '₱0', label: 'Manual follow-ups' },
        ],
        howItWorks: [
          { step: 'Scan to enter', detail: 'Members use their phone or RFID to log attendance instantly.' },
          { step: 'Track renewals', detail: 'System texts members 7 days before their monthly pass expires.' },
          { step: 'Sell merch & supplements', detail: 'Built-in POS for protein shakes, water, and gym gear.' }
        ],
        targetUsers: ['Gyms', 'Fitness Studios', 'Boxing Clubs']
      },
    ],
  },
  {
    id: 'business',
    label: 'Negosyo',
    accentColor: '#10B981',
    apps: [
      {
        id: 'sahod-flow',
        name: 'Sahod Flow',
        icon: Banknote,
        tagline: 'Effortless payroll management for a happy, on-time team.',
        imageSrc: '/apps/sahod-flow.png',
        features: ['Attendance tracking', 'Payslip generation', 'Deduction management', 'Overtime calculation', 'Holiday pay'],
        description: 'Payroll day should be a celebration, not a nightmare. Sahod Flow automates attendance tallying, deduction calculations, and payslip generation so your team gets paid accurately and on time — every time. Keep your people happy and your books clean.',
        benefits: [
          'Daily attendance logs feed directly into payroll — no reentry',
          'SSS, PhilHealth, Pag-IBIG deductions computed automatically',
          'Digital payslips sent straight to each employee\'s phone',
          'Overtime, holiday pay, and night differential handled correctly',
        ],
        stats: [
          { value: '4 hrs', label: 'Saved per cycle' },
          { value: '100%', label: 'Deduction accuracy' },
          { value: '0', label: 'Payroll disputes' },
        ],
        howItWorks: [
          { step: 'Log daily time', detail: 'Employees clock in/out using a secure PIN or biometric scan.' },
          { step: 'Auto-compute deductions', detail: 'System calculates SSS, PhilHealth, late penalties, and overtime.' },
          { step: 'Generate payslips', detail: 'One tap creates digital payslips sent straight to employee phones.' }
        ],
        targetUsers: ['Small Businesses', 'Franchisees', 'BPO Branches']
      },
      {
        id: 'ledger-flow',
        name: 'Ledger Flow',
        icon: BookText,
        tagline: 'Crystal-clear financial insights to watch your profits soar.',
        imageSrc: '/apps/ledger-flow.png',
        features: ['Expense categorization', 'Profit & Loss statements', 'Tax ready reports', 'Auto-sync sales', 'Dashboard metrics'],
        description: 'You cannot grow what you cannot see. Ledger Flow gives you a real-time view of every peso in and out of your business — categorized, totaled, and presented in clean Profit & Loss statements that are ready for your accountant or BIR filing. Financial clarity, finally.',
        benefits: [
          'Categorize every expense with one tap — no accounting degree needed',
          'Live dashboard shows your running profit margin at all times',
          'Monthly P&L and cash flow reports generated automatically',
          'Export tax-ready summaries in BIR-compliant format',
        ],
        stats: [
          { value: '80%', label: 'Faster book close' },
          { value: '100%', label: 'BIR-ready' },
          { value: '₱0', label: 'Accountant OT fees' },
        ],
        howItWorks: [
          { step: 'Log every expense', detail: 'Categorize daily operational costs with a few simple taps.' },
          { step: 'Sync with sales', detail: 'Automatically pulls daily revenue from your Katuwang POS apps.' },
          { step: 'View the bottom line', detail: 'Instantly generate P&L reports to see your true monthly profit.' }
        ],
        targetUsers: ['Business Owners', 'Accountants', 'Bookkeepers']
      },
      {
        id: 'biyahe-sync',
        name: 'Biyahe Sync',
        icon: Truck,
        tagline: 'Real-time fleet dispatching to keep your business moving.',
        imageSrc: '/apps/biyahe-sync.png',
        features: ['Driver tracking', 'ePOD signatures', 'Fuel expense logs', 'Route performance', 'GPS map'],
        description: 'Every delivery is a promise to your customer. Biyahe Sync keeps that promise by putting you in full control of your fleet — track drivers in real time, capture digital proof of delivery, and log fuel expenses automatically. Deliver faster, dispute less, and cut operating costs.',
        benefits: [
          'Live GPS map of all drivers and vehicles from one screen',
          'Electronic Proof of Delivery with customer signature on phone',
          'Fuel expense log tied to each trip for accurate costing',
          'Delivery performance reports by driver, route, and vehicle',
        ],
        stats: [
          { value: '15%', label: 'Fuel cost reduction' },
          { value: '0', label: 'Delivery disputes' },
          { value: '2×', label: 'Dispatcher efficiency' },
        ],
        howItWorks: [
          { step: 'Dispatch fleet', detail: 'Assign vehicles, drivers, and delivery routes for the day.' },
          { step: 'Capture signatures', detail: 'Drivers get digital Proof of Delivery right on their phones.' },
          { step: 'Log fuel & tolls', detail: 'Drivers log on-road expenses that sync directly to your dashboard.' }
        ],
        targetUsers: ['Logistics', 'Delivery Fleets', 'Distributors']
      },
    ],
  },
  {
    id: 'financial',
    label: 'Pinansyal',
    accentColor: '#3B82F6',
    apps: [
      {
        id: '5-6-tracker',
        name: '5-6 Tracker',
        icon: BookText,
        tagline: 'Secure, automated lending lists for faster collections.',
        imageSrc: '/apps/5-6-tracker.png',
        features: ['Interest calculator', 'Due date reminders', 'Partial payment tracking', 'Audit trails', 'Daily reports'],
        description: 'Managing a lending list in your head — or on scattered notebooks — is a recipe for missed payments and disputes. 5-6 Tracker digitizes your entire book: automatic interest calculations, due-date SMS reminders to borrowers, and a crystal-clear payment history for every account. Collect with confidence.',
        benefits: [
          'Automatic interest computation based on your custom rate and term',
          'SMS reminders sent to borrowers 1 day before their due date',
          'Log partial payments instantly with running balance updates',
          'Full payment history per borrower — audit-ready at any time',
        ],
        stats: [
          { value: '95%', label: 'On-time collection' },
          { value: '0', label: 'Calculation errors' },
          { value: '10×', label: 'More accounts managed' },
        ],
        howItWorks: [
          { step: 'Set loan terms', detail: 'Enter the principal, interest rate, and daily/weekly payment schedule.' },
          { step: 'Send reminders', detail: 'System automatically texts borrowers when their payment is due.' },
          { step: 'Log collections', detail: 'Record full or partial payments while the balance auto-updates.' }
        ],
        targetUsers: ['Micro-Lenders', 'Cooperatives', 'Bumbay Operators']
      },
    ],
  },
];
