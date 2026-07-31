export interface ModulePartnerCopy {
  partnerCategory: string;
  heroHeadline: string;
  highlightWord: string;
  heroSubtitle: string;
  soloStruggles: string[];
  partnerWins: string[];
}

export const MODULE_PARTNER_CONTENT: Record<string, ModulePartnerCopy> = {
  'benta-snap': {
    partnerCategory: 'Sari-Sari Store & Retail',
    heroHeadline: 'Hindi ka na nag-iisa sa pagbabantay ng tindahan.',
    highlightWord: 'nag-iisa sa pagbabantay',
    heroSubtitle: 'Kami ang Katuwang mo araw-araw. Mabilis na checkout sa loob ng 5 segundo, awtomatikong bawas sa bodega, at siguradong walang kulang sa drawer.',
    soloStruggles: [
      'Nagkakamali sa kwenta ng sukli habang madaming bumibili sa tindahan.',
      'Hindi nalalaman agad kung alin ang paubos na paninda sa bodega.',
      'Nawawala o napupunit ang listahan ng utang sa lumang notebook.',
      'Nalilito sa palitan ng bantay kapag may kulang sa benta.',
    ],
    partnerWins: [
      '5-second 1-tap checkout — mabilis mag-benta kahit pila ang customer.',
      'Awtomatikong nababawas ang stock sa bodega sa bawat transaksyon.',
      'Ligtas na utang ledger — may kumpletong resibo at talaan ng benta.',
      'Strict shift auditing — alam mo agad kung balance ang cashier drawer.',
    ],
  },
  'fresh-tally': {
    partnerCategory: 'Palengke & Fresh Produce',
    heroHeadline: 'Katuwang mo para walang masayang na prutas at paninda.',
    highlightWord: 'walang masayang',
    heroSubtitle: 'Bawat nabubulok na supply ay perang nawawala. Kasama mo ang Fresh Tally para i-batch at ibenta muna ang malapit nang masira.',
    soloStruggles: [
      'Nakatambak ang lumang batch habang nabubuksan ang bagong delivery.',
      'Nagugulat na lang na may nabubulok na paninda sa ilalim ng ilagayan.',
      'Hindi alam kung aling supplier ang nagbibigay ng pinakasariwang supply.',
      'Walang malinaw na talaan kung magkano ang totoong nawala sa tapon.',
    ],
    partnerWins: [
      'Sell-First Expiration Reminders para maunang maibenta ang sariwa.',
      'Batch tracking ayon sa supplier para alam ang dapat bukasan.',
      'Supplier Scorecards para malaman kung sino ang matapat mag-supply.',
      'Photo-evidence logging sa na-write off o nasirang paninda.',
    ],
  },
  'build-stack': {
    partnerCategory: 'Hardware & Construction Supply',
    heroHeadline: 'Ang Katuwang mo para walang kontraktor na makakalusot sa utang.',
    highlightWord: 'makakalusot sa utang',
    heroSubtitle: 'Hardware store ka man o lumber yard, kami ang kasama mong nagtatala ng bawat sako ng semento, yero, at pako nang may buong seguridad.',
    soloStruggles: [
      'Nawawala ang papel na listahan ng pautang sa mga kontraktor.',
      'Nagbibigay ang bantay ng manual discount nang walang pahintulot mo.',
      'Nalilito sa imbentaryo kapag bulk order ng semento at bakal.',
      'Mahirap mag-audit ng drawer bawat palitan ng cashier.',
    ],
    partnerWins: [
      'Credit Ledger ng Kontraktor — may kumpletong resibo at pirma.',
      'Manager PIN requirement bago magbigay ng discount o bawas-presyo.',
      'Automated inventory update sa bawat construction material.',
      'Shift Cash Control — siguradong balance ang cashier bawat turnover.',
    ],
  },
  'bite-snap': {
    partnerCategory: 'Karinderya, Diner & Kainan',
    heroHeadline: 'Mula order hanggang kusina — may Katuwang ka sa mabilis na biyahe.',
    highlightWord: 'mabilis na biyahe',
    heroSubtitle: 'Tuloy-tuloy ang biyahe ng order sa kusina. Mabilis ang ikot ng mesa, maayos ang talahanayan, at tumpak ang kitang pumasok sa cashier.',
    soloStruggles: [
      'Nagkakamali ang kusina dahil sa hindi mabasang sulat sa order slip.',
      'Nawawalan ng mesa ang customer dahil walang nakakaalam kung aling table ang libre.',
      'Matagal mag-checkout at mag-sukli kaya naghihintay ang kumakain.',
      'Hindi malinaw kung magkano ang totoong benta bawat shift.',
    ],
    partnerWins: [
      'Live Kitchen Order Queue — diretso sa cook ang malinis na ticket.',
      'Visual Table Tracker — alamin agad kung aling mesa ang ready.',
      'Mabilis na Cash & GCash Checkout flow sa cashier.',
      'Strict Cashier Shift Audit — ligtas ang kita bawat araw.',
    ],
  },
  'timpla-track': {
    partnerCategory: 'Coffee Shop & Milk Tea Bar',
    heroHeadline: 'Tuloy ang timpla ng barista — kami ang Katuwang mo sa pila.',
    highlightWord: 'Katuwang mo sa pila',
    heroSubtitle: 'Gawa para sa mabilisang order sa cafe at milk tea bar. Alam ng barista ang susunod na timpla, ikaw naman alam mo kung nasaan ang pera.',
    soloStruggles: [
      'Nagkakahalo-halo ang inumin kapag marami ang naitalang order sa counter.',
      'Nagbibigay ng libreng inumin ang staff nang walang audit trail.',
      'Mabagal ang checkout kaya humahaba at nagagalit ang pila.',
      'Nalilito sa palitan ng barista kapag kulang ang perang nasa drawer.',
    ],
    partnerWins: [
      'Real-time Barista Queue — nakikita agad ng barista ang susunod na timpla.',
      'Manager PIN authorization bago magbigay ng complimentary drinks.',
      '10-second Order Punching para mabilis magpa-alis ng pila.',
      'Shift Cash Control para siguradong tumpak ang kita sa counter.',
    ],
  },
  'ganap-master': {
    partnerCategory: 'Event Coordination, Catering & Venues',
    heroHeadline: 'Bawat kasal at okasyon — may Katuwang kang nag-aayos ng detalye.',
    highlightWord: 'nag-aayos ng detalye',
    heroSubtitle: 'Hindi mo na kailangang mag-alala sa nalimutang bayad. Kontrata, hulugang downpayment, supplier payouts, at guest list — lahat maayos.',
    soloStruggles: [
      'Nakalilimutan kung sinong vendor ang nabayaran na at sino ang pending.',
      'Nawawala ang talaan ng hulog at balance ng kliyente sa kontrata.',
      'Manual at mabagal ang pag-check in ng mga bisita sa mismong venue.',
      'Kalat-kalat ang resibo kaya hirap kwentahin ang malinis na kita sa event.',
    ],
    partnerWins: [
      'Milestone Payment Tracker para sa hulugan at kontrata ng kliyente.',
      'Vendor Payout Ledger para malinaw ang bayad sa supplier.',
      'Digital Guest Check-In gamit ang phone o tablet sa pintuan.',
      'Full Contract Audit Trail — malinaw ang resibo at benta.',
    ],
  },
  'spin-snap': {
    partnerCategory: 'Laundromat & Dry Cleaning',
    heroHeadline: 'Walang nawawalang labada — kami ang Katuwang mo sa shop.',
    highlightWord: 'Katuwang mo sa shop',
    heroSubtitle: 'Mula sa pagtanggap ng kilo (Received), paglabak (Washing), pagtupi (Folding), hanggang sa pickup — tracked ang bawat damit at bayad.',
    soloStruggles: [
      'Nagkakabaligtad o nawawala ang damit ng customer sa mga ilagayan.',
      'Nakalilimutang singilin ang labada bago makuha ng customer.',
      'Hindi alam kung aling karga ang dapat munang itupi at tapusin.',
      'Mabagal mag-tala sa notebook habang may naghihintay na customer.',
    ],
    partnerWins: [
      '4-Step Job Status Flow: Received → Washing → Folding → Ready.',
      'Pre-pickup payment verification para siguradong bayad bago lumabas.',
      'Kilo rate calculator at instant resibo sa customer.',
      'Shift Cash Audit — balance ang cashier sa bawat palitan ng staff.',
    ],
  },
  'hydro-sync': {
    partnerCategory: 'Water Refilling Station',
    heroHeadline: 'Bawat galong lumabas ng istasyon — may Katuwang kang nagbabantay.',
    highlightWord: 'Katuwang kang nagbabantay',
    heroSubtitle: 'Walk-in refill man o delivery sa barangay — kasama mo kami para i-track ang bawat galon at koleksyon nang walang nawawalang pera.',
    soloStruggles: [
      'Nawawala ang tala ng delivery boy sa mga perang kinolekta sa kalsada.',
      'Hindi alam kung ilang galon ang naihatid vs. natitira sa bodega.',
      'Nakalilimutang maningil sa mga suking buwanan ang bayad sa tubig.',
      'Nalilito sa palitan ng pera sa cashier desk hapon-hapon.',
    ],
    partnerWins: [
      'Delivery & Walk-in Order Tracker — monitored ang bawat biyahe ng galon.',
      'Delivery Boy Collection Logger para siguradong naitremite ang pera.',
      'Integrated QR & Ref Logging para sa GCash payments.',
      'Shift Cash Audit — ligtas ang pera sa cashier desk.',
    ],
  },
  'auto-boss': {
    partnerCategory: 'Auto Repair, Car Wash & Detailing',
    heroHeadline: 'Transparent na repair — may Katuwang ang customer at shop mo.',
    highlightWord: 'may Katuwang',
    heroSubtitle: 'May malinaw na job order at status update ang bawat sasakyan. Transparent ang presyo sa piyesa at labor, kaya buo ang tiwala ng customer.',
    soloStruggles: [
      'Nagtatampo ang customer dahil walang balita kung gawa na ang sasakyan.',
      'Nawawalan ng tala sa mga naipanalitang piyesa at langis.',
      'Nag-aaway ang mekaniko at cashier dahil sa hindi malinaw na singilan.',
      'Nawawala ang resibo kapag may warranty claim ang customer.',
    ],
    partnerWins: [
      'Job Order Status Flow: Diagnosing → Repairing → Ready for Pickup.',
      'Malinaw na breakdowns ng Labor Cost + Spare Parts sa resibo.',
      'Manager PIN requirement bago magbigay ng discount sa repair.',
      'Shift Cash Audit — siguradong balance ang kita sa araw na iyon.',
    ],
  },
  'wellness-pro': {
    partnerCategory: 'Spa, Massage & Wellness Clinic',
    heroHeadline: 'Maginhawa sa customer, may Katuwang sa pamamahala.',
    highlightWord: 'Katuwang sa pamamahala',
    heroSubtitle: 'Tahimik at maginhawang session booking at checkout — mula waiting room hanggang sa matapos ang masahe at clinic care.',
    soloStruggles: [
      'Nagkakalituhan sa kwarto kung sinong therapist ang nakatoka.',
      'Mabagal at maingay ang singilan sa reception desk.',
      'Hindi ma-track kung aling package o promo discount ang ginamit.',
      'Nalilito sa cashier drawer kapag nagpapalitan ng staff.',
    ],
    partnerWins: [
      'Client Session Tracker: Waiting → In Session → Completed.',
      'Tahimik at 1-tap fast checkout sa front desk.',
      'Audited Promo & Student Discount controls.',
      'Strict Shift Accounting para balance ang kita bawat araw.',
    ],
  },
  'trim-track': {
    partnerCategory: 'Barbershop & Salon',
    heroHeadline: 'Wala nang kaguluhan sa pila — Katuwang mo sa upuan.',
    highlightWord: 'Katuwang mo sa upuan',
    heroSubtitle: 'Patas at mabilis na pila sa gupitan at salon. Makikita kung sino ang naghihintay, sinong ginugupitan, at sino ang magbabayad sa counter.',
    soloStruggles: [
      'Nagtatalo ang mga customer kung sino ang naunang dumating sa gupitan.',
      'Nawawala ang tala sa kung ilang ulo ang nagupitan ng barber bawat araw.',
      'Nagbibigay ng unregistered discount ang staff sa kakilala.',
      'Mabagal ang singilan sa counter kaya naghihintay ang lalabas na.',
    ],
    partnerWins: [
      'Visual Queue Tracker: Waiting → Seated → Completed.',
      'Barber & Stylist Job Logging para malinaw ang hatian sa komisyon.',
      'Manager PIN controls sa promo at discount redemptions.',
      '10-second Fast Checkout sa Cash at GCash.',
    ],
  },
  'rep-sync': {
    partnerCategory: 'Gym & Fitness Studio',
    heroHeadline: 'Pumasok, nag-buhat, nagbayad — Katuwang mo sa fitness desk.',
    highlightWord: 'Katuwang mo sa fitness desk',
    heroSubtitle: 'Daily workout rate man o personal training — tracked ang bawat session sa desk nang walang kalat at walang nawawalang bayad.',
    soloStruggles: [
      'Nakalilimutang singilin ang daily walk-in rate ng mga nagbu-buhat.',
      'Hindi alam kung ilang gymnast ang pumasok sa pasilidad araw-araw.',
      'Nawawala ang listahan ng mga kumuha ng personal trainer.',
      'Nalilito ang desk receptionist sa palitan ng pera hapon-hapon.',
    ],
    partnerWins: [
      'Desk Session Logger: Pending → Active → Completed.',
      'Fast Walk-In Daily Rate Payment System.',
      'Shift Cash Accountability para sa front desk employees.',
      'Malinis at propesyonal na resibo sa bawat client.',
    ],
  },
  'service-master': {
    partnerCategory: 'General Repair & Electronics Shop',
    heroHeadline: 'Kahit anong ayusin — may Katuwang kang nagtatala.',
    highlightWord: 'Katuwang kang nagtatala',
    heroSubtitle: 'TV, ref, cellphone, o handyman service — universal na job order system para sa maayos na repair, malinaw na resibo, at tapat na singilan.',
    soloStruggles: [
      'Nawawala ang ticket o claim tag ng gamit na pinagagawa.',
      'Hindi matandaan kung magkano ang napagkasunduang estimate cost.',
      'Nakalilimutang singilin ang nagastos na piyesa sa technician.',
      'Nagtatampo ang customer kapag matagal bago mabigyan ng update.',
    ],
    partnerWins: [
      'Universal Repair Job Tracker na angkop sa kahit anong gamit.',
      'Clear Estimate + Parts Breakdown sa digital resibo.',
      'Technician Assignment at Job Status Visibility.',
      'Audited Discount Controls para sa suking suki.',
    ],
  },
  'biyahe-sync': {
    partnerCategory: 'Trucking, Hauling & Transport Services',
    heroHeadline: 'Alam mo kung nasaan ang truck — Katuwang mo sa kalsada.',
    highlightWord: 'Katuwang mo sa kalsada',
    heroSubtitle: 'Mula loading hanggang drop-off, i-track ang bawat biyahe ng haul, gastos sa krudo at toll, at ang kabuuang kitang pumasok.',
    soloStruggles: [
      'Nawawala ang tala sa perang ibinigay sa driver para sa krudo at toll.',
      'Hindi alam kung aling biyahe ang nakasingil na at sino ang pending pa.',
      'Nagugulat na lang sa liit ng natirang kita matapos ang biyahe.',
      'Nalilito ang dispatcher kapag sabay-sabay ang biyahe ng fleet.',
    ],
    partnerWins: [
      'Trip Revenue & Expense Logger — automatic na bawas sa krudo.',
      'Status Flow: Preparing → In Transit → Completed & Billed.',
      'Client Billing Ledger na may kumpletong audit history.',
      'Master Ledger Integration — automatic ang pasok ng kita.',
    ],
  },
  'rental': {
    partnerCategory: 'Equipment, Vehicle & Gown Rentals',
    heroHeadline: 'Walang double-booking — Katuwang mo sa kagamitan.',
    highlightWord: 'Katuwang mo sa kagamitan',
    heroSubtitle: 'Kagamitan, sasakyan, o gown man ang pinaparentahan — malinaw ang calendar, stocks, at deposit return sa bawat booking.',
    soloStruggles: [
      'Nagkakaroon ng double-booking dahil hindi updated ang talaan sa papel.',
      'Hindi alam kung sinong customer ang humahawak sa gamit na nawawala.',
      'Nakalilimutang ibalik ang security deposit o singilin ang late fee.',
      'Nalilito sa kalendaryo kung kailan babalik ang kagamitan.',
    ],
    partnerWins: [
      'Visual Rental Calendar View — makikita ang booking availability.',
      'Active Rental Inventory Tracker — alamin kung sino ang humahawak.',
      'Security Deposit & Late Fee Return Workflow.',
      'Shift Cash Auditing — siguradong ligtas ang bayad sa counter.',
    ],
  },
  'sahod-flow': {
    partnerCategory: 'Pasahod at Bale Management',
    heroHeadline: 'Katuwang mo para mabilis at saktong pasahod sa tauhan.',
    highlightWord: 'mabilis at saktong pasahod',
    heroSubtitle: 'Auto-bawas sa vale, 1-tap payout sa staff, at rekta pasok sa gastos ng negosyo. Mabilis magpasahod nang walang sakit sa ulo.',
    soloStruggles: [
      'Nakalilimutang ibawas ang naunang bale o cash advance ng tao.',
      'Matagal mag-kwenta ng sweldo sa gabi gamit ang papel at calculator.',
      'Nagkakaroon ng sumbatan sa pagitan ng manager at empleyado sa oras.',
      'Hindi nakatala sa pangkalahatang gastos ng negosyo ang ipinasahod.',
    ],
    partnerWins: [
      'Automated Bale Deduction — bawas agad sa final payout summary.',
      '1-Tap Payout Approval — rekta nang nababawas sa Master Cash ledger.',
      'Employee Roster & Attendance History Overview.',
      'Zero Math Error Guarantee — protektado ang pera ng negosyo.',
    ],
  },
  'ledger-flow': {
    partnerCategory: 'Master Cash at Kita ng Negosyo',
    heroHeadline: 'Katuwang mo sa malinis at tapat na kwenta ng negosyo.',
    highlightWord: 'malinis at tapat na kwenta',
    heroSubtitle: 'Benta sa POS, pasahod sa staff, at bayad sa supplier — rekta lista sa master ledger para alam mo kung totoong kumikita ang negosyo.',
    soloStruggles: [
      'Hindi alam kung magkano talaga ang malinis na kita kumpara sa benta.',
      'Kalat-kalat ang resibo ng renta, ilaw, tubig, at gastusin sa tindahan.',
      'Kailangang mag-type nang dalawang beses mula sa resibo patungong libro.',
      'Nagugulat na lang na walang pambayad sa supplier sa katapusan.',
    ],
    partnerWins: [
      'Real-Time Master Cash Balance — kita agad ang totoong pera.',
      'Automated Multi-Module Sync — pasok agad ang benta mula sa POS.',
      '1-Tap Quick Expense Logger para sa renta, kuryente, at tubig.',
      'Net Profit & Asset Breakdown Card sa live dashboard.',
    ],
  },
  '5-6-tracker': {
    partnerCategory: 'Pautang at Arawang Singilan',
    heroHeadline: 'Katuwang mo sa araw-araw na koleksyon at pautang.',
    highlightWord: 'araw-araw na koleksyon',
    heroSubtitle: 'May limit ang utang bawat tao, may lista ng araw-araw na koleksyon, at ligtas ang puhunan mo sa bawat biyahe ng kolektor.',
    soloStruggles: [
      'Lumalampas ang borrower sa kayang bayaran kaya nagkaka-delay sa singil.',
      'Nawawala ang papel na listahan ng araw-araw na koleksyon sa kalsada.',
      'Hindi matukoy kung sinong kolektor ang humahawak sa pera.',
      'Nalilito sa interes at balance kapag nag-hulog ang manghihiram.',
    ],
    partnerWins: [
      'Borrower Credit Limit Locks — iwas-over-exposure sa pautang.',
      'Daily Collection Tracker — automatic na nag-se-sync sa ledger.',
      'Manager Audit Trail — monitored ang bawat discount o bawas.',
      'Shift Cash Audit — balance ang koleksyon bawat hapon.',
    ],
  },
  'tsek-in': {
    partnerCategory: 'Resort, Lodging & Apartelle PMS',
    heroHeadline: 'Aling kwarto ang bakante? May Katuwang kang nagpapakita sa screen.',
    highlightWord: 'Katuwang kang nagpapakita',
    heroSubtitle: 'Room status, guest check-in, at auto-billing sa checkout — tamang-tama para sa resort, lodging, apartment, o apartelle.',
    soloStruggles: [
      'Nagkakaroon ng double booking sa kwarto dahil hindi naisulat sa libro.',
      'Nakalilimutang singilin ang dagdag na gabi o extra guest sa room.',
      'Mabagal ang check-in process kaya naghihintay ang bisita sa lobby.',
      'Hindi alam kung aling kwarto ang kasalukuyang nililinis ng staff.',
    ],
    partnerWins: [
      'Visual Room Grid: Available (Green) → Occupied (Red) → Cleaning (Yellow).',
      'Automatic Night Billing & Extra Charges Calculator.',
      'Fast Digital Guest Check-In & Contact Logger.',
      'Shift Cash Audit — ligtas ang bayad sa front desk counter.',
    ],
  },
  'budget-mo': {
    partnerCategory: 'Personal Cash Flow & Savings',
    heroHeadline: 'Huwag nang manghula kung saan napunta ang sweldo mo.',
    highlightWord: 'sweldo mo',
    heroSubtitle: 'Kami ang Katuwang mo sa personal na barya. I-track ang daily expenses, ipon goals, at cash flow sa iisang simpleng app.',
    soloStruggles: [
      'Nagugulat na lang na ubos na ang sweldo bago mag-katapusan.',
      'Walang malinaw na listahan kung saan napupunta ang maliliit na gastos.',
      'Mahirap mag-ipon dahil laging sumosobra sa luho at kain sa labas.',
      'Nakakatamad mag-tala sa notebook o Excel spreadsheet.',
    ],
    partnerWins: [
      'Real-Time Available Cash Balance sa bawat segundo.',
      '1-Tap Quick Expense Presets para sa pamasahi, kape, at kain.',
      'Savings Envelopes at Financial Health Score Tracker.',
      'Gumagana sa phone o laptop kahit saan — ₱50/buwan lang!',
    ],
  },
};

export function getModulePartnerCopy(moduleId: string): ModulePartnerCopy {
  return MODULE_PARTNER_CONTENT[moduleId] || {
    partnerCategory: 'Katuwang Ecosystem',
    heroHeadline: 'Hindi ka na nag-iisa sa pamamahala ng negosyo mo.',
    highlightWord: 'nag-iisa sa pamamahala',
    heroSubtitle: 'Kami ang matapat mong Katuwang sa araw-araw. Protektado ang kita, maayos ang paninda, at mabilis ang biyahe ng negosyo.',
    soloStruggles: [
      'Nag-iisa sa pagtutuos sa gabi matapos ang mahabang araw ng trabaho.',
      'Nagkakamali sa sukli o benta dahil sa pagod at dami ng inaasikaso.',
      'Walang malinaw na talaan kung magkano ang malinis na kitang pumasok.',
      'Hirap mag-isa kapag may nawawalang paninda o pera sa drawer.',
    ],
    partnerWins: [
      'Matapat na katuwang na nagtatala ng bawat piso sa negosyo.',
      'Mabilis na checkout at auto-inventory para sa simpleng pamamahala.',
      'Real-time financial reports para alam mo agad ang kita.',
      'Shift cash protection para ligtas ang pera araw-araw.',
    ],
  };
}
