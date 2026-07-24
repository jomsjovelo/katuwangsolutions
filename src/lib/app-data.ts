import {
  ShoppingCart, Hammer, Leaf,
  Utensils, Coffee, CalendarHeart, 
  RotateCcw, Droplets, Sparkles, Sun, Scissors, Dumbbell, Wrench,
  Truck, Car, Tractor, 
  Banknote, BookText, HandCoins, LucideIcon, Bed, Users
} from 'lucide-react';

export interface AppModule {
  id: string; 
  name: string;
  icon: LucideIcon;
  tagline: string;
  imageSrc: string;
  features: string[];
  description: string;       
  benefits: string[];        
  stats: { value: string; label: string }[]; 
  howItWorks: { step: string; detail: string }[]; 
  targetUsers: string[];     
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
        features: ['1-Tap Checkout', 'Auto-Stock Deduction', 'GCash & Cash Support', 'Shift Auditing', 'Shift Summary'],
        description: 'Run your sari-sari store or retail shop like a seasoned pro. Benta Snap delivers lightning-fast checkout, automatic stock deductions, and strict shift logging so cash shortages become a thing of the past. Stop losing sales to manual counting errors.',
        benefits: [
          'Process transactions in under 5 seconds',
          'Inventory automatically deducts when items are checked out',
          'Audit logs strictly record cash declarations vs. actual drawer cash',
          'Accept cash or GCash effortlessly in one unified flow',
        ],
        stats: [
          { value: '100%', label: 'Cash Drawer Accuracy' },
          { value: '₱0', label: 'Setup fee' },
          { value: '5 sec', label: 'Avg. Checkout' },
        ],
        howItWorks: [
          { step: 'Add to Cart', detail: 'Tap products on the screen to instantly add them to the customer cart.' },
          { step: 'Select Payment', detail: 'Choose Cash or GCash and quickly process the transaction.' },
          { step: 'Close Shift', detail: 'Declare drawer cash; the system automatically calculates shortages or overages.' }
        ],
        targetUsers: ['Sari-sari Stores', 'Retail Shops', 'Pharmacies']
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
        tagline: 'Precision hardware tracking for seamless construction supply.',
        imageSrc: '/apps/build-stack.png',
        features: ['Retail Credit (Utang)', 'Quick Checkout', 'Shift Tracking', 'Discount Authorization', 'Inventory Sync'],
        description: 'Construction supply is complex — high-value orders and contractor credit lines. Build Stack brings it all under control with a purpose-built system for hardware retailers. Handle walk-ins quickly while easily extending and tracking credit for your loyal contractors.',
        benefits: [
          'Track contractor "utang" explicitly inside the retail flow',
          'Require Manager PIN for authorizing manual discounts',
          'Strict shift tracking ensures cash accountability across cashiers',
          'Keep your hardware inventory perfectly synced automatically',
        ],
        stats: [
          { value: '100%', label: 'Credit Accountability' },
          { value: '0', label: 'Lost Utang Records' },
          { value: '1 min', label: 'Checkout Time' },
        ],
        howItWorks: [
          { step: 'Cart & Authorize', detail: 'Select hardware items and request Manager PIN if giving bulk discounts.' },
          { step: 'Charge to Credit', detail: 'Checkout normally or easily charge the entire transaction to a contractor\'s ledger.' },
          { step: 'Track Shift Cash', detail: 'All hardware sales are safely locked into the active employee\'s shift log.' }
        ],
        targetUsers: ['Hardware Stores', 'Construction Supply', 'Lumber Yards']
      },
    ],
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
        tagline: 'Rapid order-to-kitchen flow for hungry diners.',
        imageSrc: '/apps/bite-snap.png',
        features: ['Table Assignment', 'Kitchen Prep Queue', 'Order Status Tracking', 'Checkout Flow', 'Shift Audit'],
        description: 'From the moment a customer sits down to the second they pay, Bite Snap keeps your restaurant running at full speed. Orders go to a prep queue, tables are tracked in real-time, and shift-based payments ensure every centavo is accounted for.',
        benefits: [
          'Assign specific tables and track exactly who is waiting for food',
          'Kitchen view lets chefs update items to "Cooking" and "Ready"',
          'Cashiers process payments with exact change calculation and GCash support',
          'Every discount and payment is tied to the active cashier\'s shift',
        ],
        stats: [
          { value: '2×', label: 'Faster Kitchen Flow' },
          { value: '0', label: 'Lost Orders' },
          { value: '100%', label: 'Cash Accountability' },
        ],
        howItWorks: [
          { step: 'Assign Table & Order', detail: 'Waitstaff punch in orders and assign a specific table number.' },
          { step: 'Kitchen Prepares', detail: 'The kitchen updates the order status until the food is served.' },
          { step: 'Cashier Checkout', detail: 'Process the payment via Cash or GCash and close the table.' }
        ],
        targetUsers: ['Restaurants', 'Diners', 'Eateries (Carinderia)']
      },
      {
        id: 'timpla-track',
        name: 'Timpla Track',
        icon: Coffee,
        tagline: 'Crafted cafe operations for the perfect brew every time.',
        imageSrc: '/apps/timpla-track.png',
        features: ['Order Queue', 'Beverage Prep Status', 'Quick Checkout', 'Shift Integrity', 'Manager Discounts'],
        description: 'Your cafe deserves more than a generic POS. Timpla Track is built for coffee shops and milk tea bars with a rapid order queue that keeps baristas in their rhythm. Serve drinks faster while protecting your margins with strict discount tracking.',
        benefits: [
          'Real-time order queue visible to both cashiers and baristas',
          'Status tracking ensures drinks are served in exactly the right order',
          'Require Manager PIN for staff discounts or complimentary drinks',
          'Shift logging ensures your morning and afternoon cashiers are balanced',
        ],
        stats: [
          { value: '10 sec', label: 'Order Entry' },
          { value: '100%', label: 'Discount Auditing' },
          { value: '2×', label: 'Queue Efficiency' },
        ],
        howItWorks: [
          { step: 'Punch Order', detail: 'Quickly select beverages and checkout to add to the queue.' },
          { step: 'Barista Prep', detail: 'The barista updates the drink to "Preparing" then "Served".' },
          { step: 'Audit Cash', detail: 'All payments and discounts are securely logged under the shift.' }
        ],
        targetUsers: ['Coffee Shops', 'Milk Tea Bars', 'Kiosks']
      },
      {
        id: 'ganap-master',
        name: 'Ganap Master',
        icon: CalendarHeart,
        tagline: 'Orchestrate unforgettable events with flawless budget planning.',
        imageSrc: '/apps/ganap-master.png',
        features: ['Contract Pricing', 'Client Payments', 'Vendor Tracking', 'Guest Check-in', 'Discount Auditing'],
        description: 'Every event has a hundred moving financial parts. Ganap Master is your all-in-one event command center: track vendor payments, record client deposits, manage guest RSVPs, and finalize contract pricing with full audit trails.',
        benefits: [
          'Track the exact contract price and client payments over time',
          'Manage vendor costs and track who has been paid and who is pending',
          'Check-in guests digitally on the day of the event',
          'All discounts and financial adjustments are strictly audited',
        ],
        stats: [
          { value: '100%', label: 'Budget Clarity' },
          { value: '0', label: 'Missed Vendor Dues' },
          { value: '1 app', label: 'Replaces 5 Spreadsheets' },
        ],
        howItWorks: [
          { step: 'Create Event & Vendors', detail: 'Setup the contract price and list all expected vendor costs.' },
          { step: 'Track Finances', detail: 'Record client deposits and execute vendor payouts from your ledger.' },
          { step: 'Manage Guests', detail: 'Track RSVPs and check them in as they arrive at the venue.' }
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
        features: ['Job Tracking', 'Service Status Flow', 'Quick Checkout', 'Shift Accountability', 'GCash Support'],
        description: 'Never lose a customer\'s clothes again. Spin Snap tracks every batch from the moment it\'s received to the second it\'s picked up. Keep your front desk stress-free and run a cleaner, more profitable laundry shop.',
        benefits: [
          'Track jobs through Received, Washing, Folding, and Ready statuses',
          'Easily apply and audit discounts for loyal customers or bulk wash',
          'No more mismatched loads or forgotten payments',
          'Cashier shifts ensure total accountability for all laundry payments',
        ],
        stats: [
          { value: '0', label: 'Lost Batches' },
          { value: '100%', label: 'Status Visibility' },
          { value: '5 sec', label: 'To checkout' },
        ],
        howItWorks: [
          { step: 'Create Laundry Job', detail: 'Log the weight and price, assigning it to the customer.' },
          { step: 'Update Status', detail: 'Move the job through the washing and folding workflow.' },
          { step: 'Checkout & Pickup', detail: 'Process payment securely and mark the clothes as picked up.' }
        ],
        targetUsers: ['Laundromats', 'Dry Cleaners', 'Self-Service Laundry']
      },
      {
        id: 'hydro-sync',
        name: 'Hydro Sync',
        icon: Droplets,
        tagline: 'Streamlined water delivery and refill tracking.',
        imageSrc: '/apps/hydro-sync.png',
        features: ['Refill Jobs', 'Delivery Status', 'Payment Processing', 'Discount Audits', 'Shift Logs'],
        description: 'Water refilling is a high-volume business that needs precision. Hydro Sync lets you track walk-in refills and deliveries seamlessly. Accept payments instantly and ensure every drop of water translates to accounted revenue.',
        benefits: [
          'Track jobs from Pending to Out for Delivery to Completed',
          'Easily apply manager-approved discounts for bulk orders',
          'Protect your cash drawer with strict shift-based accounting',
          'Never lose track of unpaid water deliveries again',
        ],
        stats: [
          { value: '100%', label: 'Delivery Tracking' },
          { value: '₱0', label: 'Missing Cash' },
          { value: '2×', label: 'Order Clarity' },
        ],
        howItWorks: [
          { step: 'Log Water Order', detail: 'Create a job for either walk-in refill or neighborhood delivery.' },
          { step: 'Track Delivery', detail: 'Update the job status when the water leaves the station.' },
          { step: 'Complete Payment', detail: 'Process cash or GCash upon delivery or pickup.' }
        ],
        targetUsers: ['Water Refilling Stations', 'Ice Plants']
      },
      {
        id: 'auto-boss',
        name: 'Auto Boss',
        icon: Sparkles,
        tagline: 'Rev up your shop with accurate job and payment tracking.',
        imageSrc: '/apps/auto-boss.png',
        features: ['Repair Jobs', 'Status Workflow', 'Discount Control', 'Shift Accountability', 'GCash & Cash'],
        description: 'Your auto shop runs on trust — and Auto Boss helps you build it. Every vehicle gets a clear job order and status flow. Process payments transparently and ensure your mechanics and cashiers are perfectly synced.',
        benefits: [
          'Track jobs from Diagnosing to Repairing to Ready',
          'Safely apply discounts to expensive repairs with full audit trails',
          'Shift logging ensures cash accountability across your front desk',
          'Deliver a professional, organized experience to every customer',
        ],
        stats: [
          { value: '100%', label: 'Job Tracking' },
          { value: '0', label: 'Lost Vehicles' },
          { value: '100%', label: 'Audit Compliance' },
        ],
        howItWorks: [
          { step: 'Create Job Order', detail: 'Log the vehicle issue and provide a price estimate.' },
          { step: 'Update Workflow', detail: 'Move the vehicle through diagnostics and active repair.' },
          { step: 'Invoice & Release', detail: 'Process the final payment and release the vehicle to the customer.' }
        ],
        targetUsers: ['Auto Repair Shops', 'Car Washes', 'Detailing Centers']
      },
      {
        id: 'wellness-pro',
        name: 'Wellness',
        icon: Sun,
        tagline: 'Elevate your spa experience with seamless booking and billing.',
        imageSrc: '/apps/wellness-pro.png',
        features: ['Service Jobs', 'Client Tracking', 'Payment Flow', 'Discount Logs', 'Shift Auditing'],
        description: 'Your spa is a sanctuary — your software should feel the same way. Wellness gives you a beautiful way to track ongoing client sessions and process payments effortlessly. Deliver premium service with zero administrative chaos.',
        benefits: [
          'Track client sessions from Waiting to In Session to Completed',
          'Easily apply promotional discounts with strict audit logging',
          'Keep your front desk cash perfectly balanced across shifts',
          'Provide a calm, professional checkout experience',
        ],
        stats: [
          { value: '100%', label: 'Session Tracking' },
          { value: '0', label: 'Cash Discrepancies' },
          { value: '10 sec', label: 'Checkout Time' },
        ],
        howItWorks: [
          { step: 'Log Session', detail: 'Create a job for the requested massage or wellness service.' },
          { step: 'Track Status', detail: 'Update the status while the client is in their session.' },
          { step: 'Checkout', detail: 'Process their payment smoothly as they prepare to leave.' }
        ],
        targetUsers: ['Spas', 'Massage Clinics', 'Wellness Centers']
      },
      {
        id: 'trim-track',
        name: 'Trim Track',
        icon: Scissors,
        tagline: 'Stay sharp with easy salon and barbershop management.',
        imageSrc: '/apps/trim-track.png',
        features: ['Queue Tracking', 'Service Flow', 'Quick Payment', 'Manager Discounts', 'Shift Logs'],
        description: 'Keep your chairs full and your cash drawer accurate. Trim Track lets you manage walk-in customers seamlessly, moving them from the waiting area to the chair and straight through to payment with full financial auditing.',
        benefits: [
          'Visually track who is waiting, who is seated, and who is done',
          'Apply loyalty discounts safely with comprehensive audit trails',
          'Eliminate cash shortages with strict employee shift accounting',
          'Accept modern payment methods like GCash effortlessly',
        ],
        stats: [
          { value: '100%', label: 'Queue Visibility' },
          { value: '₱0', label: 'Lost Payments' },
          { value: '10 sec', label: 'Checkout Flow' },
        ],
        howItWorks: [
          { step: 'Add to Queue', detail: 'Create a job when a customer walks in.' },
          { step: 'Seat Customer', detail: 'Update the status to In Progress when they hit the chair.' },
          { step: 'Finish & Pay', detail: 'Mark the cut as complete and process their payment.' }
        ],
        targetUsers: ['Barbershops', 'Salons', 'Beauty Parlors']
      },
      {
        id: 'rep-sync',
        name: 'Rep Sync',
        icon: Dumbbell,
        tagline: 'Power up your gym with smooth session tracking.',
        imageSrc: '/apps/rep-sync.png',
        features: ['Session Tracking', 'Payment Processing', 'Discount Auditing', 'Status Workflow', 'Shift Integrity'],
        description: 'Rep Sync helps you run your fitness center effortlessly. Track walk-in sessions, personal training jobs, and process payments instantly. Keep your focus on your clients, not on complicated paperwork.',
        benefits: [
          'Track active gym goers from Pending to In Session to Completed',
          'Easily offer student or promotional discounts safely',
          'Every transaction is strictly tied to the active desk employee',
          'Lightning-fast checkout keeps the front desk moving',
        ],
        stats: [
          { value: '100%', label: 'Session Clarity' },
          { value: '100%', label: 'Shift Accuracy' },
          { value: '1 App', label: 'Total Control' },
        ],
        howItWorks: [
          { step: 'Log Session', detail: 'Create a job when a client arrives for a workout.' },
          { step: 'Track Activity', detail: 'Keep the session active while they are in the gym.' },
          { step: 'Complete Payment', detail: 'Process their fee when their session concludes.' }
        ],
        targetUsers: ['Gyms', 'CrossFit Boxes', 'Fitness Studios']
      },
      {
        id: 'service-master',
        name: 'Service Master',
        icon: Wrench,
        tagline: 'The ultimate tool for tracking general repairs and services.',
        imageSrc: '/apps/service-master.png',
        features: ['General Jobs', 'Status Updates', 'Discount Support', 'Shift Audits', 'Payment Processing'],
        description: 'Whether you fix appliances, repair electronics, or provide general handyman services, Service Master keeps your jobs organized. Track exactly what needs fixing and ensure you get paid securely for every job.',
        benefits: [
          'Universal workflow fits any repair or service industry',
          'Apply discounts cleanly with full manager audit trails',
          'Ensure your cash drawer always matches your daily jobs',
          'Provide transparent pricing and rapid checkout for customers',
        ],
        stats: [
          { value: '100%', label: 'Job Accountability' },
          { value: '0', label: 'Missed Invoices' },
          { value: '100%', label: 'Secure Audits' },
        ],
        howItWorks: [
          { step: 'Log the Repair', detail: 'Create a job detailing the service needed and the price.' },
          { step: 'Work in Progress', detail: 'Update the job to reflect active repair status.' },
          { step: 'Invoice Customer', detail: 'Process the payment via cash or GCash when the job is done.' }
        ],
        targetUsers: ['Appliance Repair', 'Electronics Shops', 'Handyman Services']
      },
    ],
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
        tagline: 'Track your fleet, trips, and trucking revenue effortlessly.',
        imageSrc: '/apps/biyahe-sync.png',
        features: ['Trip Tracking', 'Status Flow', 'Expense Logging', 'Revenue Processing', 'Shift Audits'],
        description: 'Biyahe Sync brings total clarity to your trucking and hauling business. Track every trip from preparation to completion, safely record client payments, and instantly log operational expenses against your master ledger.',
        benefits: [
          'Move trips from Preparing to In Transit to Completed',
          'Safely process client payments with audited discount capabilities',
          'Instantly record fuel and toll expenses right from the dashboard',
          'Shift logs ensure dispatcher accountability for all cash handled',
        ],
        stats: [
          { value: '100%', label: 'Trip Visibility' },
          { value: '100%', label: 'Expense Tracking' },
          { value: '0', label: 'Lost Revenue' },
        ],
        howItWorks: [
          { step: 'Schedule Trip', detail: 'Log the destination, expected revenue, and assigned driver.' },
          { step: 'Track Logistics', detail: 'Update the status as the truck moves and completes the haul.' },
          { step: 'Record Finances', detail: 'Log client payments and deduct fuel expenses from the ledger.' }
        ],
        targetUsers: ['Trucking Companies', 'Haulers', 'Moving Services']
      },
      {
        id: 'rental',
        name: 'Rental',
        icon: Car,
        tagline: 'Complete control over your equipment and vehicle rentals.',
        imageSrc: '/apps/rental.png',
        features: ['Active Rentals', 'Inventory Tracking', 'Calendar View', 'Return Processing', 'Discount Audits'],
        description: 'Stop guessing what equipment is available. Rental Master tracks all active bookings, manages your total inventory pool, and handles payment processing upon return—ensuring you never double-book or lose an asset.',
        benefits: [
          'Visual calendar helps you schedule future rentals without conflicts',
          'Track exactly how many items are available vs currently rented out',
          'Safely process return payments and apply audited discounts',
          'Strict shift logging protects your business from cash discrepancies',
        ],
        stats: [
          { value: '0', label: 'Double Bookings' },
          { value: '100%', label: 'Asset Visibility' },
          { value: '100%', label: 'Audit Trail' },
        ],
        howItWorks: [
          { step: 'Check Availability', detail: 'View the inventory or calendar to see what items are free.' },
          { step: 'Create Booking', detail: 'Log the customer details and dispatch the rental item.' },
          { step: 'Process Return', detail: 'Receive the item back into inventory and collect the final payment.' }
        ],
        targetUsers: ['Equipment Rentals', 'Vehicle Rentals', 'Gown Rentals']
      },
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
        tagline: 'Simplified payroll distribution for MSMEs.',
        imageSrc: '/apps/sahod-flow.png',
        features: ['Employee Roster', 'Salary Tracking', 'Cash Advances (Bale)', 'Direct Ledger Integration', '1-Tap Payout'],
        description: 'Payroll doesn\'t have to be a headache. Sahod Flow tracks your employee base, manages their daily or weekly salaries, and handles cash advances (bale) automatically. Payouts instantly deduct from your Master Cash ledger.',
        benefits: [
          'Automatically deduct cash advances from an employee\'s final salary',
          '1-Tap Payout securely logs the expense into your business ledger',
          'Clear visibility into who has been paid and who is pending',
          'Eliminate manual math errors and lost paper records',
        ],
        stats: [
          { value: '100%', label: 'Ledger Accuracy' },
          { value: '0', label: 'Math Errors' },
          { value: '1 Min', label: 'Payroll Processing' },
        ],
        howItWorks: [
          { step: 'Add Employees', detail: 'Register your staff and set their expected salary and cycle.' },
          { step: 'Log Advances', detail: 'Record any "bale" which will be auto-deducted later.' },
          { step: 'Execute Payout', detail: 'Approve payroll and instantly deduct the funds from your Master Cash.' }
        ],
        targetUsers: ['SMEs', 'Contractors', 'Retail Owners']
      },
      {
        id: 'ledger-flow',
        name: 'Ledger Flow',
        icon: BookText,
        tagline: 'Your business\'s central financial nervous system.',
        imageSrc: '/apps/ledger-flow.png',
        features: ['Master Cash Account', 'Income Tracking', 'Expense Logging', 'Automated Integration', 'Financial Overview'],
        description: 'Ledger Flow is the beating heart of your business. Every single transaction from every other module—sales, payroll, vendor payouts, and loans—automatically flows into this master ledger. Total financial clarity at your fingertips.',
        benefits: [
          'No manual entry needed for transactions originating from other modules',
          'Manually log ad-hoc income and expenses with precise categorization',
          'Real-time view of your true Master Cash balance',
          'Bulletproof financial tracking protects you against hidden losses',
        ],
        stats: [
          { value: '100%', label: 'Automated Sync' },
          { value: 'Real-time', label: 'Balance Updates' },
          { value: '0', label: 'Lost Records' },
        ],
        howItWorks: [
          { step: 'Automatic Sync', detail: 'Sales and expenses from other apps flow here instantly.' },
          { step: 'Manual Entry', detail: 'Log custom utility bills or random income easily.' },
          { step: 'Review Balance', detail: 'Always know exactly how much cash your business truly holds.' }
        ],
        targetUsers: ['Business Owners', 'Accountants', 'Managers']
      },
      {
        id: '5-6-tracker',
        name: '5-6 Tracker',
        icon: HandCoins,
        tagline: 'Professional lending management with strict accountability.',
        imageSrc: '/apps/5-6-tracker.png',
        features: ['Borrower Profiles', 'Loan Issuance', 'Payment Tracking', 'Discount Auditing', 'Shift Logs'],
        description: 'Running a micro-lending business requires flawless record keeping. The 5-6 Tracker manages borrower limits, outstanding balances, and tracks daily payments with strict audit trails so your capital is always protected.',
        benefits: [
          'Enforce strict credit limits per borrower to prevent over-exposure',
          'Record daily payments with audited discount capabilities',
          'Loans and payments immediately sync with your Master Cash ledger',
          'Employee shifts strictly protect the cash drawer from discrepancies',
        ],
        stats: [
          { value: '100%', label: 'Capital Tracking' },
          { value: '0', label: 'Lost Balances' },
          { value: '100%', label: 'Shift Security' },
        ],
        howItWorks: [
          { step: 'Create Borrower', detail: 'Setup the client profile and assign a maximum credit limit.' },
          { step: 'Issue Loan', detail: 'Release capital which instantly deducts from your Master Ledger.' },
          { step: 'Track Payments', detail: 'Log daily collections securely under your active employee shift.' }
        ],
        targetUsers: ['Micro-Lenders', 'Financiers', 'Co-ops']
      },
    ],
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
        tagline: 'Lightweight Property Management for small lodging businesses.',
        imageSrc: '/apps/tsek-in.png',
        features: ['Room Setup', 'Guest Check-in', 'Check-out & Billing', 'Room Status Board', 'Occupancy Rates'],
        description: 'Tsek-In is the perfectly-sized Property Management System for your small resort, boarding house, apartment, apartelle, or motel. Easily track which rooms are occupied, available, or being cleaned, while keeping an active tab on guest bills and extra charges.',
        benefits: [
          'Visually track all room statuses in a simple grid (Available, Occupied, Cleaning)',
          'Automatically compute the total bill based on nights stayed upon checkout',
          'Record guest information and contact details efficiently',
          'Perfectly sized for small properties, supporting up to 25 rooms effortlessly'
        ],
        stats: [
          { value: '100%', label: 'Occupancy Tracking' },
          { value: '₱99/mo', label: 'Flat Rate' },
          { value: '0', label: 'Double Bookings' },
        ],
        howItWorks: [
          { step: 'Setup Rooms', detail: 'Create your rooms with their types, capacities, and nightly rates.' },
          { step: 'Check-In Guests', detail: 'Assign a room, set the number of nights, and record any initial payment.' },
          { step: 'Check-Out & Settle', detail: 'The system computes the total stay and any extra charges for final billing.' }
        ],
        targetUsers: ['Resorts', 'Boarding Houses', 'Apartelles', 'Motels']
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
        tagline: 'Your personal budgeting assistant.',
        imageSrc: '/apps/budget-mo.png',
        features: ['Income Tracking', 'Goal Envelopes', 'Real-time Cash Flow', 'Expense Logging'],
        description: 'Budget Mo helps you monitor every cent. Track your incomes, set goal envelopes, and monitor your cash flow in real-time. Make sure your finances are always on track.',
        benefits: [
          'Visually track all cash flow and expenses',
          'Create strict budget envelopes to limit overspending',
          'Perfect for personal expense tracking, ipon goals, and utang management'
        ],
        stats: [
          { value: '100%', label: 'Budget Visibility' },
          { value: '₱50/mo', label: 'Promo (Was ₱100)' },
          { value: '0', label: 'Lost Expenses' },
        ],
        howItWorks: [
          { step: 'Set Envelopes', detail: 'Create categories and assign budget limits to them.' },
          { step: 'Track Expenses', detail: 'Log every expense and see your remaining balance.' }
        ],
        targetUsers: ['Individuals', 'Employees', 'Students', 'Freelancers']
      }
    ]
  }
];

export const activeModules: AppModule[] = appGroups.flatMap(g => g.apps);
export const activeModulesCount: number = activeModules.length;
export const standardModulesCount: number = activeModules.filter(m => m.id !== 'budget-mo').length;

export function normalizeModuleId(id: string): string {
  if (!id) return '';
  const cleanId = id.toLowerCase().trim();
  if (cleanId === 'fleet-sync') return 'biyahe-sync';
  if (cleanId === 'rental-track') return 'rental';
  return cleanId;
}

export function isValidActiveModuleId(id: string): boolean {
  const canonicalId = normalizeModuleId(id);
  return activeModules.some(a => a.id === canonicalId);
}

export function getActiveAppById(id: string): AppModule | undefined {
  const canonicalId = normalizeModuleId(id);
  if (!isValidActiveModuleId(canonicalId)) return undefined;
  return activeModules.find(a => a.id === canonicalId);
}

const legacyApps: Record<string, AppModule> = {
  'farm-master': {
    id: 'farm-master',
    name: 'Farm Master',
    icon: Tractor,
    tagline: 'Modern management for traditional farming operations.',
    imageSrc: '/apps/farm-master.png',
    features: ['Crop Cycle Tracking', 'Livestock Management', 'Harvest Logs', 'Expense Tracking', 'Revenue Recording'],
    description: 'Farming is a complex business that needs precise record keeping. Farm Master allows you to track planting cycles, monitor livestock inventory, log harvest yields, and record daily operational expenses all in one place.',
    benefits: [
      'Track crops from planting to harvest with clear status indicators',
      'Manage livestock counts and record feed or medicine expenses',
      'Safely record harvest sales and instantly update your financial ledger',
      'Make data-driven decisions on which crops are most profitable',
    ],
    stats: [
      { value: '100%', label: 'Cycle Visibility' },
      { value: '0', label: 'Lost Expenses' },
      { value: '1 App', label: 'Total Farm Control' },
    ],
    howItWorks: [
      { step: 'Start a Cycle', detail: 'Log a new crop planting or livestock acquisition.' },
      { step: 'Track Expenses', detail: 'Record fertilizers, feeds, and labor costs as they happen.' },
      { step: 'Harvest & Sell', detail: 'Log the final yield and record the sales revenue into the ledger.' }
    ],
    targetUsers: ['Farms', 'Poultries', 'Piggeries']
  }
};

export function getAppById(id: string): AppModule | undefined {
  const activeApp = getActiveAppById(id);
  if (activeApp) return activeApp;
  const normalizedId = normalizeModuleId(id);
  if (normalizedId === 'farm-master') {
    return legacyApps['farm-master'];
  }
  return undefined;
}

