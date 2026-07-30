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
  description?: string;
  benefits?: string[];
  stats?: { value: string; label: string }[];
  howItWorks?: { step: string; detail: string }[];
  targetUsers?: string[];
};

export type AppGroup = {
  id: string;
  label: string;
  accentColor: string;
  apps: AppModule[];
};

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
        tagline: 'Mabilis na POS at auto-inventory para sa sari-sari store at retail!',
        imageSrc: '/apps/benta-snap.png',
        features: ['1-Tap Checkout', 'Auto-Stock Deduction', 'GCash & Cash Support', 'Shift Auditing', 'Shift Summary'],
        description: 'Patakbuhin ang iyong sari-sari store o retail shop nang walang stress. Ang Benta Snap ay nagbibigay ng mabilis na checkout sa loob ng 5 segundo, awtomatikong bawas sa bodega, at strict shift logging para iwas-kulang sa cashier at iwas-kawala ng paninda.',
        benefits: [
          'Mag-process ng benta sa loob ng 5 segundo gamit ang 1-tap checkout',
          'Awtomatikong nababawas ang stock sa bodega sa bawat transaksyon',
          'May strict shift audit para malaman kung may kulang o sobra sa cashier',
          'Tumatanggap ng Cash at GCash sa iisang simpleng resibo'
        ],
        stats: [
          { value: '100%', label: 'Cash Drawer Accuracy' },
          { value: '₱0', label: 'Setup Fee' },
          { value: '5 sec', label: 'Avg. Checkout Time' }
        ],
        howItWorks: [
          { step: 'I-tap ang Paninda', detail: 'Pumili sa skreen para mabilis na idagdag sa cart ng customer.' },
          { step: 'Pumili ng Bayad', detail: 'Pumili sa Cash o GCash at i-record ang benta instantly.' },
          { step: 'Mag-Close ng Shift', detail: 'I-declare ang benta sa drawer; automatic ang kwenta ng sobra o kulang.' }
        ],
        targetUsers: ['Sari-sari Stores', 'Retail Shops', 'Pharmacies', 'Mini Marts']
      },
      {
        id: 'fresh-tally',
        name: 'Fresh Tally',
        icon: Leaf,
        tagline: 'Smart inventory at batch tracking para sa sariwang paninda!',
        imageSrc: '/apps/fresh-tally.png',
        features: ['Perishables tracking', 'Batch expiration alerts', 'Supplier management', 'Waste logging', 'Auto-discount suggestions'],
        description: 'Bawat nabubulok na gulay o prutas ay perang nawawala. Bina-batch ng Fresh Tally ang iyong paninda ayon sa expiration date at supplier para lagi mong alam kung ano ang dapat ibenta muna. Bawasan ang tapon at palaguin ang kita araw-araw.',
        benefits: [
          'Awtomatikong "sell-first" reminders batay sa expiration dates',
          'Batch tracking para alam kung aling delivery ang unang bubuksan',
          'Supplier scorecards para malaman kung sino ang may pinakasariwang supply',
          'Photo-evidence logging para sa nasirang paninda o spoiled stock'
        ],
        stats: [
          { value: '40%', label: 'Bawas sa Tapon' },
          { value: '100+', label: 'Supported Categories' },
          { value: '1 Tap', label: 'Para mag-log ng Delivery' }
        ],
        howItWorks: [
          { step: 'I-log ang Delivery', detail: 'Kunan ng larawan ang resibo at i-group ang batches ayon sa supplier.' },
          { step: 'Sell-First Alert', detail: 'Awtomatikong makikita kung aling paninda ang kailangang maibenta ngayon.' },
          { step: 'Track Quality', detail: 'Suriin kung aling supplier ang laging sariwa ang binibigay.' }
        ],
        targetUsers: ['Produce Vendors', 'Meat & Fish Shops', 'Grocery Stores', 'Fruit Stands']
      },
      {
        id: 'build-stack',
        name: 'Build Stack',
        icon: Hammer,
        tagline: 'Hardware at construction supply management na may Utang Ledger!',
        imageSrc: '/apps/build-stack.png',
        features: ['Retail Credit (Utang)', 'Quick Checkout', 'Shift Tracking', 'Discount Authorization', 'Inventory Sync'],
        description: 'Mabilis at ligtas na pamamahala para sa hardware store. Kontrolado ang bulk discounts, contractor credit lines, at inventory ng semento, yero, at pako. Siguradong walang nawawalang tala ng utang ng iyong mga kontraktor.',
        benefits: [
          'I-track ang utang ng mga kontraktor nang may kumpletong resibo',
          'Kailangan ng Manager PIN bago magbigay ng bulk o manual discounts',
          'Strict shift tracking para balance ang cashier drawer bawat palit-palitan',
          'Awtomatikong updated ang inventory ng iyong construction supplies'
        ],
        stats: [
          { value: '100%', label: 'Credit Security' },
          { value: '0', label: 'Nawawalang Utang' },
          { value: '1 Min', label: 'Mabilis na Checkout' }
        ],
        howItWorks: [
          { step: 'Pumili & Authorize', detail: 'I-cart ang paninda at mag-PIN kapag may bulk discount.' },
          { step: 'Charge sa Utang', detail: 'I-charge ang buong transaksyon sa ledger ng kontraktor.' },
          { step: 'Shift Cash Audit', detail: 'Ligtas na naka-record ang lahat ng benta sa active shift.' }
        ],
        targetUsers: ['Hardware Stores', 'Construction Supply', 'Lumber Yards']
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
        tagline: 'Mabilis na order-to-kitchen flow para sa karinderya at kainan!',
        imageSrc: '/apps/bite-snap.png',
        features: ['Table Assignment', 'Kitchen Prep Queue', 'Order Status Tracking', 'Checkout Flow', 'Shift Audit'],
        description: 'Mula sa pag-upo ng customer hanggang sa pagbabayad, mabilis at tuloy-tuloy ang biyahe ng order sa Bite Snap. Deretso sa kusina ang mga order, maayos ang talahanayan ng mesa, at tumpak ang kwenta sa cashier.',
        benefits: [
          'Mag-assign ng mesa at malaman kung sino ang naghihintay ng pagkain',
          'Live Kitchen View para ma-update ng cook kung "Cooking" o "Ready" na',
          'May exact change calculator at GCash payment support',
          'Ang bawat discount at benta ay nakatali sa active cashier shift'
        ],
        stats: [
          { value: '2×', label: 'Mabilis na Kusina' },
          { value: '0', label: 'Nawawalang Order' },
          { value: '100%', label: 'Cash Drawer Control' }
        ],
        howItWorks: [
          { step: 'Assign Table & Order', detail: 'I-punch in ang order ng customer at pumili ng table number.' },
          { step: 'Lutuin sa Kusina', detail: 'I-update ng cook ang status habang inihahanda ang pagkain.' },
          { step: 'Cashier Checkout', detail: 'I-process ang bayad via Cash o GCash at i-clear ang table.' }
        ],
        targetUsers: ['Restaurants', 'Karinderya', 'Diners', 'Fast Food Kiosks']
      },
      {
        id: 'timpla-track',
        name: 'Timpla Track',
        icon: Coffee,
        tagline: 'Rapid order queue at barista tracker para sa cafe at milk tea!',
        imageSrc: '/apps/timpla-track.png',
        features: ['Order Queue', 'Beverage Prep Status', 'Quick Checkout', 'Shift Integrity', 'Manager Discounts'],
        description: 'Sadyang ginawa para sa mga coffee shop at milk tea bar. Mabilis ang order queue ng barista para walang kalat sa pila at kumpleto ang benta araw-araw.',
        benefits: [
          'Real-time order queue na nakikita kapwa ng cashier at barista',
          'Status tracking para sunod-sunod at tamang inumin ang maihain',
          'Manager PIN requirement bago magbigay ng complimentary o staff drinks',
          'Shift logging para tumpak ang palitan ng cashier sa umaga at hapon'
        ],
        stats: [
          { value: '10 sec', label: 'Order Punching' },
          { value: '100%', label: 'Discount Auditing' },
          { value: '2×', label: 'Queue Speed' }
        ],
        howItWorks: [
          { step: 'I-punch ang Inumin', detail: 'Mabilis na pumili ng beverages at i-add sa barista queue.' },
          { step: 'Timpla ng Barista', detail: 'I-update ang status sa "Preparing" hanggang sa "Served".' },
          { step: 'Cash Audit', detail: 'Ligtas na naka-record ang lahat ng bayad sa araw na iyon.' }
        ],
        targetUsers: ['Coffee Shops', 'Milk Tea Bars', 'Drink Kiosks']
      },
      {
        id: 'ganap-master',
        name: 'Ganap Master',
        icon: CalendarHeart,
        tagline: 'Event command center para sa coordinators, caterers, at venues!',
        imageSrc: '/apps/ganap-master.png',
        features: ['Contract Pricing', 'Client Payments', 'Vendor Tracking', 'Guest Check-in', 'Discount Auditing'],
        description: 'Ang bawat kasal at okasyon ay may napakaraming financial details. Ang Ganap Master ang iyong all-in-one command center: i-track ang vendor payouts, client downpayments, guest RSVPs, at contract pricing nang may kumpletong resibo.',
        benefits: [
          'I-track ang kontrata at hulog ng kliyente sa bawat milestones',
          'Bantayan ang bayad sa mga supplier at malaman kung sino pa ang pending',
          'Digital guest check-in sa mismong araw ng okasyon',
          'Kumpletong audit trail sa bawat discount o pagbabago sa presyo'
        ],
        stats: [
          { value: '100%', label: 'Linaw sa Badyet' },
          { value: '0', label: 'Nakalimutang Vendor' },
          { value: '1 App', label: 'Papalit sa 5 Spreadsheets' }
        ],
        howItWorks: [
          { step: 'Gawa ng Event', detail: 'I-setup ang contract price at ilista ang inaasahang vendor costs.' },
          { step: 'Track Payments', detail: 'I-record ang hulog ng kliyente at i-pay out ang mga supplier.' },
          { step: 'Digital Check-In', detail: 'I-scan at i-check in ang mga bisita sa mismong venue.' }
        ],
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
        tagline: 'Laundry job tracking mula drop-off hanggang pickup!',
        imageSrc: '/apps/spin-snap.png',
        features: ['Job Tracking', 'Service Status Flow', 'Quick Checkout', 'Shift Accountability', 'GCash Support'],
        description: 'Huwag nang mawalan o magkamali sa labada ng customer. Bina-tsek ng Spin Snap ang bawat karga mula sa pagtanggap (Received), paglabak (Washing), pagtupi (Folding), hanggang sa pagkuha (Ready). Siguradong bayad bago irelease.',
        benefits: [
          'I-track ang labada mula Received, Washing, Folding, hanggang Ready',
          'Magbigay ng safe discounts para sa suking customer nang may audit trail',
          'Wala nang nagkakabaligtad na damit o nakakalimutang singilin',
          'Cashier shift logs para siguradong balance ang kita ng labahan'
        ],
        stats: [
          { value: '0', label: 'Nawawalang Labada' },
          { value: '100%', label: 'Status Visibility' },
          { value: '5 sec', label: 'Mabilis na Checkout' }
        ],
        howItWorks: [
          { step: 'Tanggapin ang Labada', detail: 'I-log ang timbang (kilo) at presyo ayon sa pangalan ng customer.' },
          { step: 'I-update ang Status', detail: 'Ilipat ang job mula sa washing hanggang sa nakatupi na.' },
          { step: 'Singil & Pickup', detail: 'Tanggapin ang bayad at i-mark na nakuha na ng customer.' }
        ],
        targetUsers: ['Laundromats', 'Dry Cleaners', 'Self-Service Laundry']
      },
      {
        id: 'hydro-sync',
        name: 'Hydro Sync',
        icon: Droplets,
        tagline: 'Water refilling station order at delivery tracker!',
        imageSrc: '/apps/hydro-sync.png',
        features: ['Refill Jobs', 'Delivery Status', 'Payment Processing', 'Discount Audits', 'Shift Logs'],
        description: 'Ang water refilling ay mabilisang negosyo na nangangailangan ng tumpak na tala. Sa Hydro Sync, madaling i-track ang walk-in refill at neighborhood deliveries. Siguradong bawat galon na lumabas ay may katapat na kita.',
        benefits: [
          'I-track ang job orders mula Pending, Out for Delivery, hanggang Completed',
          'Mag-apply ng manager-approved discounts sa bulk orders nang ligtas',
          'Protektado ang cashier drawer gamit ang strict shift accounting',
          'Wala nang nawawalang galon o nakakalimutang koleksyon sa delivery'
        ],
        stats: [
          { value: '100%', label: 'Delivery Tracking' },
          { value: '₱0', label: 'Missing Cash' },
          { value: '2×', label: 'Order Clarity' }
        ],
        howItWorks: [
          { step: 'I-log ang Water Order', detail: 'Gawan ng job order para sa walk-in refill o delivery sa bahay.' },
          { step: 'I-track ang Biyahe', detail: 'I-update ang status kapag lumabas na ang delivery boy.' },
          { step: 'Kolektahin ang Bayad', detail: 'Tanggapin ang cash o GCash kapag naihatid na ang tubig.' }
        ],
        targetUsers: ['Water Refilling Stations', 'Ice Plants', 'Mineral Water Dealers']
      },
      {
        id: 'auto-boss',
        name: 'Auto Boss',
        icon: Sparkles,
        tagline: 'Job order at repair tracking para sa auto shop at car wash!',
        imageSrc: '/apps/auto-boss.png',
        features: ['Repair Jobs', 'Status Workflow', 'Discount Control', 'Shift Accountability', 'GCash & Cash'],
        description: 'Ang tiwala ng kostumer ang pundasyon ng auto shop. Sa Auto Boss, may malinaw na job order at status update ang bawat sasakyan. Transparent ang singilan sa piyesa at labor, at maayos ang kooperasyon ng mekaniko at cashier.',
        benefits: [
          'I-track ang repair mula Diagnosing, Repairing, hanggang Ready for Pick-up',
          'Safely apply discounts sa mahal na repair nang may full audit trail',
          'Shift logging para siguradong tumutugma ang perang hawak sa cashier',
          'Magbigay ng propesyonal at malinis na resibo sa bawat customer'
        ],
        stats: [
          { value: '100%', label: 'Job Tracking' },
          { value: '0', label: 'Nawawalang Piyesa' },
          { value: '100%', label: 'Audit Security' }
        ],
        howItWorks: [
          { step: 'Gawa ng Job Order', detail: 'I-log ang sira ng kotse/motor at magbigay ng malinaw na tantyang presyo.' },
          { step: 'Kumpuni ng Mekaniko', detail: 'I-update ang status habang ginagawa at ginagawan ng paraan.' },
          { step: 'Singil & Release', detail: 'Singilin ang customer at i-release ang sasakyan nang may resibo.' }
        ],
        targetUsers: ['Auto Repair Shops', 'Car Washes', 'Motorcycle Shops', 'Detailing']
      },
      {
        id: 'wellness-pro',
        name: 'Wellness',
        icon: Sun,
        tagline: 'Spa, massage, at clinic session booking & checkout system!',
        imageSrc: '/apps/wellness-pro.png',
        features: ['Service Jobs', 'Client Tracking', 'Payment Flow', 'Discount Logs', 'Shift Auditing'],
        description: 'Ang iyong spa ay lugar ng kapahingahan — dapat maginhawa rin ang iyong software. Ang Wellness ay nagbibigay ng magandang paraan para i-track ang customer sessions at singilin sila nang mabilis at walang kalat sa pader o papel.',
        benefits: [
          'I-track ang client sessions mula Waiting, In Session, hanggang Completed',
          'Mag-apply ng promo discounts nang may malinaw na audit trail',
          'Panatilihing balance ang cash drawer bawat palit-palitan ng therapist o cashier',
          'Magbigay ng maayos at tahimik na checkout experience sa customer'
        ],
        stats: [
          { value: '100%', label: 'Session Tracking' },
          { value: '0', label: 'Kulang sa Cash' },
          { value: '10 sec', label: 'Mabilis na Checkout' }
        ],
        howItWorks: [
          { step: 'I-log ang Session', detail: 'Gawan ng job order ang napiling hilot o spa package.' },
          { step: 'Track Activity', detail: 'I-update ang status habang nasa session room ang customer.' },
          { step: 'Mabilis na Checkout', detail: 'Singilin ang customer bago sila lumabas ng spa.' }
        ],
        targetUsers: ['Spas', 'Massage Clinics', 'Wellness Centers', 'Skin Clinics']
      },
      {
        id: 'trim-track',
        name: 'Trim Track',
        icon: Scissors,
        tagline: 'Barbershop at salon queue management & cashier system!',
        imageSrc: '/apps/trim-track.png',
        features: ['Queue Tracking', 'Service Flow', 'Quick Payment', 'Manager Discounts', 'Shift Logs'],
        description: 'Panatilihing puno ang upuan ng iyong gupitan. Sa Trim Track, madaling i-manage ang mga walk-in customer mula sa pila (Waiting), pag-upo sa upuan (Seated), hanggang sa pagbabayad sa cashier nang may buong proteksyon sa pera.',
        benefits: [
          'Makikita kung sino ang naghihintay, sino ang ginugupitan, at sino ang tapos na',
          'Mag-apply ng loyalty o student discounts nang may buong audit trail',
          'Alisin ang kulang sa cashier gamit ang strict shift accounting',
          'Tumanggap ng cash at GCash sa mabilis na paraan'
        ],
        stats: [
          { value: '100%', label: 'Queue Visibility' },
          { value: '₱0', label: 'Nawawalang Benta' },
          { value: '10 sec', label: 'Checkout Time' }
        ],
        howItWorks: [
          { step: 'Ilagay sa Pila', detail: 'Mag-log ng job kapag pumasok ang customer sa gupitan.' },
          { step: 'Iupo sa Chair', detail: 'I-update sa "In Progress" kapag sinimulan na ang gupit.' },
          { step: 'Tapos & Bayad', detail: 'Markahang tapos na at singilin ang customer sa cashier.' }
        ],
        targetUsers: ['Barbershops', 'Salons', 'Beauty Parlors', 'Nail Spas']
      },
      {
        id: 'rep-sync',
        name: 'Rep Sync',
        icon: Dumbbell,
        tagline: 'Gym session tracking at daily rate payment system!',
        imageSrc: '/apps/rep-sync.png',
        features: ['Session Tracking', 'Payment Processing', 'Discount Auditing', 'Status Workflow', 'Shift Integrity'],
        description: 'Patakbuhin ang iyong fitness center nang walang kaguluhan. I-track ang walk-in daily workouts, personal training sessions, at singilin ang mga gymnast agad. Ituon ang pansin sa pagsasanay, hindi sa papel.',
        benefits: [
          'I-track ang gym goers mula Pending, In Session, hanggang Completed',
          'Mag-alok ng student o promo discounts nang ligtas',
          'Bawat bayad ay nakatali sa active desk employee sa shift na iyon',
          'Mabilis na singilan para hindi mag-dikit ang pila sa pintuan'
        ],
        stats: [
          { value: '100%', label: 'Linaw sa Session' },
          { value: '100%', label: 'Shift Accuracy' },
          { value: '1 App', label: 'Buong Kontrol' }
        ],
        howItWorks: [
          { step: 'I-log ang Client', detail: 'Gawan ng session kapag pumasok ang client sa gym.' },
          { step: 'Track Workout', detail: 'Panatilihing active habang nag-bubuhat sila sa loob.' },
          { step: 'Kolektahin ang Fee', detail: 'Singilin ang daily fee bago sila umuwi.' }
        ],
        targetUsers: ['Gyms', 'CrossFit Boxes', 'Fitness Studios', 'Boxing Gyms']
      },
      {
        id: 'service-master',
        name: 'Service Master',
        icon: Wrench,
        tagline: 'General repair, handyman, at electronics shop manager!',
        imageSrc: '/apps/service-master.png',
        features: ['General Jobs', 'Status Updates', 'Discount Support', 'Shift Audits', 'Payment Processing'],
        description: 'Nag-aayos ka man ng TV, ref, cellphone, o nagbibigay ng handyman services, maayos ang iyong talaan sa Service Master. Alamin kung ano ang dapat ayusin at siguraduhing bayad ang bawat serbisyo.',
        benefits: [
          'Universal job system na nababagay sa kahit anong klase ng repair',
          'Magbigay ng discounts nang may kumpletong manager audit log',
          'Siguraduhing tumutugma ang benta sa resibo at perang nasa cashier',
          'Magbigay ng malinaw na presyo at tapat na resibo sa customer'
        ],
        stats: [
          { value: '100%', label: 'Job Accountability' },
          { value: '0', label: 'Nakalimutang Singilin' },
          { value: '100%', label: 'Ligtas na Audit' }
        ],
        howItWorks: [
          { step: 'I-log ang Sira', detail: 'Gawan ng job order kung ano ang kailangang ayusin at magkano.' },
          { step: 'Ginagawa Pa', detail: 'I-update ang job status habang ginagawa ng technician.' },
          { step: 'Resibo & Bayad', detail: 'Singilin sa Cash o GCash kapag maayos na at ie-turnover.' }
        ],
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
        tagline: 'Trucking, hauling, at trip revenue & expense tracker!',
        imageSrc: '/apps/biyahe-sync.png',
        features: ['Trip Tracking', 'Status Flow', 'Expense Logging', 'Revenue Processing', 'Shift Audits'],
        description: 'Magkaroon ng buong linaw sa iyong negosyo sa trucking at hakot. I-track ang bawat biyahe mula sa paghahanda hanggang sa pagbaba ng kargamento, i-record ang singil sa kliyente, at agad na i-bawas ang gastos sa krudo at toll.',
        benefits: [
          'Ilipat ang biyahe mula Preparing, In Transit, hanggang Completed',
          'Ligtas na singilin ang kliyente nang may audited discount controls',
          'Agad na i-record ang gastos sa krudo, toll, at allowance sa dashboard',
          'Strict shift logs para may pananagutan ang dispatcher sa hawak na pera'
        ],
        stats: [
          { value: '100%', label: 'Linaw sa Biyahe' },
          { value: '100%', label: 'Tala sa Krudo' },
          { value: '0', label: 'Nawawalang Kita' }
        ],
        howItWorks: [
          { step: 'I-schedule ang Biyahe', detail: 'I-log ang destinasyon, bayad ng client, at assigned driver.' },
          { step: 'Subaybayan ang Biyahe', detail: 'I-update ang status habang naglalakbay at naghapakot.' },
          { step: 'Kwentahin ang Kita', detail: 'I-record ang bayad at i-bawas ang krudo sa master ledger.' }
        ],
        targetUsers: ['Trucking Companies', 'Haulers', 'Moving Services', 'Delivery Fleets']
      },
      {
        id: 'rental',
        name: 'Rental',
        icon: Car,
        tagline: 'Equipment, vehicle, at gown rental inventory manager!',
        imageSrc: '/apps/rental.png',
        features: ['Active Rentals', 'Inventory Tracking', 'Calendar View', 'Return Processing', 'Discount Audits'],
        description: 'Huwag nang manghula kung aling gamit ang available. Bina-tsek ng Rental Master ang lahat ng active bookings, pinamamahalaan ang iyong mga gamit, at pinapabilis ang pag-isoli at pagbabayad para maiwasan ang double-booking.',
        benefits: [
          'Visual calendar para makita ang mga booking sa mga susunod na araw',
          'Tukoy kung ilang kagamitan ang available vs. kasalukuyang pinarentahan',
          'Ligtas na i-process ang pagbabalik at pag-soli ng security deposit',
          'Strict shift logging para walang nawawalang pera sa counter'
        ],
        stats: [
          { value: '0', label: 'Double Bookings' },
          { value: '100%', label: 'Linaw sa Kagamitan' },
          { value: '100%', label: 'Audit Trail' }
        ],
        howItWorks: [
          { step: 'Suriin ang Availability', detail: 'Tingnan sa calendar kung aling kagamitan ang libre sa petsang iyon.' },
          { step: 'Gawa ng Booking', detail: 'I-log ang detalye ng customer at ilabas ang gamit.' },
          { step: 'Isoli & Singilin', detail: 'Tanggapin ang gamit pabalik sa bodega at singilin ang benta.' }
        ],
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
        tagline: 'Payroll at bale management para sa mga empleyado!',
        imageSrc: '/apps/sahod-flow.png',
        features: ['Employee Roster', 'Salary Tracking', 'Cash Advances (Bale)', 'Direct Ledger Integration', '1-Tap Payout'],
        description: 'Hindi kailangang maging masakit sa ulo ang payroll. Inaayos ng Sahod Flow ang listahan ng empleyado, ang kanilang arawan o lingguhang sweldo, at awtomatikong binabawas ang cash advance (bale). 1-Tap Payout na direktang nag-i-integrate sa iyong Master Cash ledger.',
        benefits: [
          'Awtomatikong binabawas ang cash advance (bale) sa huling sweldo',
          '1-Tap Payout na agad na nag-i-record ng gastos sa negosyo',
          'Malinaw na makikita kung sino ang nabayaran na at sino ang pending pa',
          'Alisin ang maling kwenta sa papel o calculator'
        ],
        stats: [
          { value: '100%', label: 'Tumpak sa Kwenta' },
          { value: '0', label: 'Maling Math' },
          { value: '1 Min', label: 'Mabilis na Payroll' }
        ],
        howItWorks: [
          { step: 'Magdagdag ng Empleyado', detail: 'I-rehistro ang staff at i-set ang kanilang sweldo at schedule.' },
          { step: 'I-log ang Bale', detail: 'I-record ang anumang cash advance na auto-deduct sa sweldo.' },
          { step: 'I-release ang Sweldo', detail: 'Apprubahan ang payroll; automatic nang nababawas sa Master Cash.' }
        ],
        targetUsers: ['SMEs', 'Contractors', 'Retail Owners', 'Shops']
      },
      {
        id: 'ledger-flow',
        name: 'Ledger Flow',
        icon: BookText,
        tagline: 'Ang central master cash at expense ledger ng iyong negosyo!',
        imageSrc: '/apps/ledger-flow.png',
        features: ['Master Cash Account', 'Income Tracking', 'Expense Logging', 'Automated Integration', 'Financial Overview'],
        description: 'Ang Ledger Flow ang puso ng pananalapi ng iyong negosyo. Ang bawat transaksyon mula sa iba pang modules — benta sa POS, payroll sa Sahod Flow, pambayad sa supplier, at utang — ay awtomatikong dumadaloy dito. May buong linaw ka sa totoong pera ng negosyo.',
        benefits: [
          'Walang kailangang i-type nang mano-mano para sa transaksyon mula sa ibang modules',
          'Madaling mag-log ng ad-hoc expenses tulad ng kuryente, tubig, o renta',
          'Real-time na makikita ang totoong Master Cash balance ng iyong negosyo',
          'Protektado ang negosyo sa mga terentadong gastos o tago na lugi'
        ],
        stats: [
          { value: '100%', label: 'Automated Sync' },
          { value: 'Real-time', label: 'Update sa Pera' },
          { value: '0', label: 'Nawawalang Resibo' }
        ],
        howItWorks: [
          { step: 'Kusa ang Sync', detail: 'Ang benta at gastos mula sa ibang apps ay kusang pumapasok dito.' },
          { step: 'Manual Entry', detail: 'I-log ang bayad sa ilaw, tubig, o iba pang gastos nang mabilis.' },
          { step: 'Suriin ang Pera', detail: 'Lagi mong alam kung magkano talaga ang malinis na pera ng negosyo.' }
        ],
        targetUsers: ['Business Owners', 'Accountants', 'Managers']
      },
      {
        id: '5-6-tracker',
        name: '5-6 Tracker',
        icon: HandCoins,
        tagline: 'Micro-lending at daily collection tracker na may limit locks!',
        imageSrc: '/apps/5-6-tracker.png',
        features: ['Borrower Profiles', 'Loan Issuance', 'Payment Tracking', 'Discount Auditing', 'Shift Logs'],
        description: 'Ang pamamahala sa pautang ay nangangailangan ng tumpak na talaan. Inaayos ng 5-6 Tracker ang credit limits ng hiraman, natitirang utang, at bina-tsek ang araw-araw na koleksyon nang may strict audit trail para protektado ang iyong kapital.',
        benefits: [
          'Maglagay ng strict credit limit bawat borrower para iwas-over-exposure',
          'I-record ang araw-araw na singil nang may audited discount control',
          'Ang pautang at koleksyon ay agad na nag-sa-sync sa iyong Master Cash ledger',
          'Strict employee shifts para ligtas ang drawer sa anumang kulang'
        ],
        stats: [
          { value: '100%', label: 'Capital Security' },
          { value: '0', label: 'Nawawalang Tala' },
          { value: '100%', label: 'Shift Protection' }
        ],
        howItWorks: [
          { step: 'Gawa ng Profile', detail: 'I-setup ang borrower at maglagay ng maximum credit limit.' },
          { step: 'I-release ang Pautang', detail: 'Ilabas ang kapital na agad na magbabawas sa Master Ledger.' },
          { step: 'Araw-Araw na Singil', detail: 'I-log ang daily collections nang ligtas sa active employee shift.' }
        ],
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
        tagline: 'Lightweight PMS para sa resorts, lodging, at apartelles!',
        imageSrc: '/apps/tsek-in.png',
        features: ['Room Setup', 'Guest Check-in', 'Check-out & Billing', 'Room Status Board', 'Occupancy Rates'],
        description: 'Ang Tsek-In ay ang tamang-tamang Property Management System para sa iyong resort, boarding house, apartment, apartelle, o motel. Madaling makita kung aling kwarto ang occupied, libre, o linilinis, habang tumpak ang kwenta sa bill ng bisita.',
        benefits: [
          'Makikita ang status ng lahat ng kwarto sa simpleng grid (Available, Occupied, Cleaning)',
          'Awtomatikong kinukwenta ang kabuuang bill batay sa gabi ng pag-stay kapag nag-checkout',
          'Mabilis na i-record ang pangalan at contact details ng bisita',
          'Tamang-tama para sa maliliit hanggang katamtamang pasilidad (hanggang 25 kwarto)'
        ],
        stats: [
          { value: '100%', label: 'Occupancy Tracking' },
          { value: '₱99/mo', label: 'Mababang Bayad' },
          { value: '0', label: 'Double Bookings' }
        ],
        howItWorks: [
          { step: 'I-setup ang Kwarto', detail: 'Ilagay ang pangalan ng kwarto, capacity, at presyo bawat gabi.' },
          { step: 'Check-In ng Bisita', detail: 'I-assign ang kwarto, i-set ang ilang gabi, at i-record ang initial deposit.' },
          { step: 'Check-Out & Singil', detail: 'Kinukwenta ng app ang buong stay at extra charges para sa final billing.' }
        ],
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
        tagline: 'Your personal budgeting assistant.',
        imageSrc: '/apps/budget-mo.png',
        features: ['Income Tracking', 'Goal Envelopes', 'Real-time Cash Flow', 'Expense Logging'],
        description: 'Ang personal budgeting app na iwas-petsa-de-peligro at iwas-ipon-loss. I-budget ang daily gastos, i-track ang utang at pa-utang, at mag-ipon nang walang stress — kahit offline!',
        benefits: [
          'Visually track all cash flow and expenses nang malinaw',
          'Gumawa ng strict budget envelopes para sa Needs, Wants, at Savings',
          'Perfect para sa personal expense tracking, ipon goals, at utang management'
        ],
        stats: [
          { value: '100%', label: 'Budget Visibility' },
          { value: '₱50/mo', label: 'Promo (Was ₱100)' },
          { value: '0', label: 'Lost Expenses' }
        ],
        howItWorks: [
          { step: 'I-set ang Envelopes', detail: 'Gumawa ng kategorya at lagyan ng budget limit ang bawat isa.' },
          { step: 'I-track ang Gastos', detail: 'I-log ang bawat gastos at makikita agad ang natitirang pera.' },
          { step: 'Mag-Ipon nang Walang Stress', detail: 'Bantayan ang iyong ipon goals at siguraduhing hindi maubos bago mag-katapusan.' }
        ],
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
  return lower;
}
