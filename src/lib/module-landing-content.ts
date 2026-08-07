export interface ModuleLandingCopy {
  headline: string;
  highlightWord: string;
  subtitle: string;
  tagline: string;
  description: string;
}

export const MODULE_LANDING_CONTENT: Record<string, ModuleLandingCopy> = {
  'benta-snap': {
    headline: 'Mag-checkout sa mabilis na flow.',
    highlightWord: 'mabilis na flow',
    subtitle: 'Bawat nabentang paninda ay naitatala sa system. Maayos ang drawer at organisado ang paninda.',
    tagline: 'Mabilis na POS at auto-inventory para sa sari-sari store at retail',
    description: 'Patakbuhin ang iyong sari-sari store o retail shop nang walang stress. 1-tap checkout, awtomatikong bawas sa bodega, at strict shift logging para iwas-kulang sa cashier.',
  },
  'fresh-tally': {
    headline: 'Alam mo ba kung anong paninda ang mauunang masira?',
    highlightWord: 'mauunang masira',
    subtitle: 'Huwag hayaang maging tapon ang kita mo. I-track ang expiration dates at batches para maibenta muna ang sariwang supply.',
    tagline: 'Smart inventory at batch tracking para sa sariwang paninda',
    description: 'Bawat nabubulok na gulay o prutas ay puhunan na maaring maaksaya. Bina-batch ng Fresh Tally ang iyong paninda ayon sa expiration date para maibenta muna ang dapat mauna.',
  },
  'build-stack': {
    headline: 'Maayos na talaan para sa bawat kontraktor o mamimili sa utang.',
    highlightWord: 'talaan para sa bawat kontraktor',
    subtitle: 'Hardware store man o construction supply — bawat utang, discount, at sako ng semento ay may malinaw na talaan.',
    tagline: 'Hardware at construction supply management na may Utang Ledger',
    description: 'Mabilis at ligtas na pamamahala para sa hardware store. Kontrolado ang bulk discounts, credit lines ng kontraktor, at stock ng semento, yero, at pako.',
  },
  'bite-snap': {
    headline: 'Mula order hanggang kusina — maayos na pag-lista ng ticket.',
    highlightWord: 'maayos na pag-lista ng ticket',
    subtitle: 'Diretso sa lutuan ang order ng customer. Mabilis ang ikot ng mesa, tumpak ang bayad sa cashier, at maayos ang kainan.',
    tagline: 'Mabilis na order-to-kitchen flow para sa karinderya at kainan',
    description: 'Mula sa pag-upo ng customer hanggang sa pagbabayad, mabilis ang biyahe ng order. Diretso sa kusina ang tickets at tumpak ang kwenta sa cashier.',
  },
  'timpla-track': {
    headline: 'Tuloy ang timpla ng barista, walang nagkakagulo sa pila.',
    highlightWord: 'walang nagkakagulo sa pila',
    subtitle: 'Mabilis na order queue na gawa para sa coffee shop at milk tea bar. Alam ng barista ang susunod na timpla, alam mo ang kita.',
    tagline: 'Rapid order queue at barista tracker para sa cafe at milk tea',
    description: 'Sadyang ginawa para sa mga coffee shop at milk tea bars. Mabilis ang order queue ng barista para walang kalat sa pila at kumpleto ang benta araw-araw.',
  },
  'ganap-master': {
    headline: 'Bawat kasal at okasyon, iisang app lang ang kailangan.',
    highlightWord: 'iisang app lang',
    subtitle: 'Kontrata, hulugan ng kliyente, supplier payouts, at guest list — lahat ng detalye ng event, maayos at kumpleto.',
    tagline: 'Event command center para sa coordinators, caterers, at venues',
    description: 'Ang all-in-one command center para sa events: i-track ang vendor payouts, client downpayments, guest RSVPs, at kontrata nang may kumpletong resibo.',
  },
  'spin-snap': {
    headline: 'Maayos na talaan ng labada, walang nakakalimutang singil.',
    highlightWord: 'Maayos na talaan ng labada',
    subtitle: 'Mula sa pagtanggap ng damit, paglabak, hanggang sa pagtupi at pickup — malinaw ang status at bayad ng bawat kilo.',
    tagline: 'Laundry job tracking mula drop-off hanggang pickup',
    description: 'Huwag nang magkamali sa labada ng customer. Bina-tsek ng Spin Snap ang bawat karga mula Received hanggang Ready. Maayos na na-i-record ang bayad bago i-release.',
  },
  'hydro-sync': {
    headline: 'Bawat galong lumabas ng istasyon, may katapat na bayad.',
    highlightWord: 'may katapat na bayad',
    subtitle: 'Walk-in refill man o delivery sa kapitbahay — i-track ang bawat galon at koleksyon nang may maayos na talaan.',
    tagline: 'Water refilling station order at delivery tracker',
    description: 'Sa Hydro Sync, madaling i-track ang walk-in refill at neighborhood deliveries. Laging may tala ang bawat galong lumabas.',
  },
  'auto-boss': {
    headline: 'Mula diagnose hanggang release — malinaw ang buong repair.',
    highlightWord: 'malinaw ang buong repair',
    subtitle: 'Transparent ang presyo sa piyesa at labor. Maayos ang status update ng sasakyan kaya tapat at kompyansa ang customer.',
    tagline: 'Job order at repair tracking para sa auto shop at car wash',
    description: 'May malinaw na job order at status update ang bawat sasakyan sa shop. Transparent ang singilan sa piyesa at labor, at maayos ang cashier logs.',
  },
  'wellness-pro': {
    headline: 'Relax ang customer sa session, relax din ang sistema mo.',
    highlightWord: 'Relax ang customer',
    subtitle: 'Tahimik at maginhawang session booking at checkout — mula waiting room hanggang sa matapos ang hilot at masahe.',
    tagline: 'Spa, massage, at clinic session booking at checkout system',
    description: 'Nagbibigay ng magandang paraan para i-track ang customer sessions at singilin sila nang mabilis, tahimik, at walang kalat sa papel.',
  },
  'trim-track': {
    headline: 'Wala nang nagtatanong ng "Sino na ang susunod?" sa gupitan.',
    highlightWord: 'Sino na ang susunod',
    subtitle: 'Patas at mabilis na pila sa barbershop o salon. Makikita kung sino ang naghihintay, sinong ginugupitan, at sino ang magbabayad.',
    tagline: 'Barbershop at salon queue management at cashier system',
    description: 'Madaling i-manage ang mga customer mula sa pila hanggang sa pag-upo at pagbabayad sa cashier nang may buong proteksyon sa pera.',
  },
  'rep-sync': {
    headline: 'Pumasok, nag-buhat, nagbayad — ganun kasimple.',
    highlightWord: 'ganun kasimple',
    subtitle: 'Daily workout rate man o personal training — tracked ang bawat session sa desk nang walang kalat at may maayos na resibo.',
    tagline: 'Gym session tracking at daily rate payment system',
    description: 'Patakbuhin ang iyong fitness center nang walang kaguluhan. I-track ang walk-in daily workouts at training sessions nang mabilis at maayos.',
  },
  'service-master': {
    headline: 'Kahit anong ayusin — may malinaw na tala at resibo.',
    highlightWord: 'may malinaw na tala',
    subtitle: 'TV, ref, cellphone, o handyman service — universal na job order system para sa maayos na repair at tapat na singilan.',
    tagline: 'General repair, handyman, at electronics shop manager',
    description: 'Nag-aayos ka man ng gamit sa bahay o electronics, maayos ang iyong talaan sa Service Master. Alamin kung ano ang dapat ayusin at i-record ang bawat serbisyo.',
  },
  'biyahe-sync': {
    headline: 'Alam mo kung nasaan ang truck at kung magkano ang gastos.',
    highlightWord: 'magkano ang gastos',
    subtitle: 'Mula loading hanggang drop-off, i-track ang bawat biyahe ng haul, gastos sa krudo at toll, at ang kabuuang kitang pumasok.',
    tagline: 'Trucking, hauling, at trip revenue at expense tracker',
    description: 'Magkaroon ng buong linaw sa iyong negosyo sa trucking at hakot. I-track ang biyahe, i-record ang singil sa client, at agad na i-bawas ang krudo at toll.',
  },
  'rental': {
    headline: 'Organisadong booking, maayos na talaan ng kagamitan.',
    highlightWord: 'Organisadong booking',
    subtitle: 'Kagamitan, sasakyan, o gown man ang pinaparentahan — malinaw ang calendar, stocks, at deposit return sa bawat booking.',
    tagline: 'Equipment, vehicle, at gown rental inventory manager',
    description: 'Bina-tsek ng Rental Master ang lahat ng active bookings, pinamamahalaan ang mga gamit, at pinapabilis ang pag-isoli at pagbabayad.',
  },
  'sahod-flow': {
    headline: 'Katuwang mo para mabilis at saktong pasahod sa tauhan.',
    highlightWord: 'mabilis at saktong pasahod',
    subtitle: 'Auto-bawas sa vale, 1-tap payout sa staff, at rekta pasok sa gastos ng negosyo. Mabilis magpasahod nang walang sakit sa ulo.',
    tagline: 'Payroll at bale management para sa mga empleyado',
    description: 'Inaayos ng Sahod Flow ang listahan ng empleyado, arawan o lingguhang sweldo, at auto-bawas sa bale bago ang 1-tap payout.',
  },
  'ledger-flow': {
    headline: 'Katuwang mo sa malinis at tapat na kwenta ng negosyo.',
    highlightWord: 'malinis at tapat na kwenta',
    subtitle: 'Benta sa POS, pasahod sa staff, at bayad sa supplier — rekta lista sa master ledger para alam mo kung totoong kumikita ang negosyo.',
    tagline: 'Ang central master cash at expense ledger ng iyong negosyo',
    description: 'Ang Ledger Flow ang puso ng pananalapi ng negosyo. Ang bawat transaksyon mula sa ibang modules ay rekta lista dito para sa real-time cash balance.',
  },
  '5-6-tracker': {
    headline: 'Katuwang mo sa araw-araw na koleksyon at pautang.',
    highlightWord: 'araw-araw na koleksyon',
    subtitle: 'May limit ang utang bawat tao, may lista ng araw-araw na koleksyon, at ligtas ang puhunan mo sa bawat biyahe ng kolektor.',
    tagline: 'Micro-lending at daily collection tracker na may limit locks',
    description: 'Inaayos ng 5-6 Tracker ang credit limits ng hiraman, natitirang utang, at bina-tsek ang araw-araw na koleksyon nang may strict audit trail.',
  },
  'tsek-in': {
    headline: 'Aling kwarto ang bakante? Isang tingin lang sa screen.',
    highlightWord: 'Isang tingin lang',
    subtitle: 'Room status, guest check-in, at auto-billing sa checkout — tamang-tama para sa resort, lodging, apartment, o apartelle.',
    tagline: 'Lightweight PMS para sa resorts, lodging, at apartelles',
    description: 'Ang Tsek-In ay ang tamang-tamang Property Management System para sa resort o apartelle. Madaling makita ang kwartong occupied, libre, o nililinis.',
  },
  'budget-mo': {
    headline: 'Huwag nang manghula kung saan napunta ang sweldo mo.',
    highlightWord: 'sweldo mo',
    subtitle: 'I-track ang daily expenses, ipon goals, at cash flow sa iisang simpleng app. Walang kumplikadong spreadsheet — madaling i-onboard!',
    tagline: 'Your personal budgeting assistant.',
    description: 'Ang personal budgeting app na iwas-petsa-de-peligro. I-budget ang daily gastos, i-track ang utang at pa-utang, at mag-ipon nang walang stress.',
  },
};
