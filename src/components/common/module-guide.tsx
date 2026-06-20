"use client"

import React from 'react';
import { X, Play, BookOpen, Star } from 'lucide-react';
import { useTenant } from '@/app/lib/tenant-context';
import { getModuleTheme } from '@/lib/theme-utils';

export interface ModuleGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface GuideContent {
  tagline: string;
  steps: string[];
  example: {
    scenario: string;
    action: string;
    result: string;
  };
}

export const MODULE_GUIDES: Record<string, GuideContent> = {
  'benta-snap': {
    tagline: 'I-snap ang benta sa iyong Sari-Sari store, mabilis at simple.',
    steps: [
      'Pindutin ang dilaw na buton na "+ Magdagdag ng Test Product" sa itaas para magkaroon ng tinda.',
      'I-click ang mga tinda sa listahan para mapuno ang iyong Basket sa ilalim.',
      'Buksan ang Basket sa ilalim para magbayad (pumili kung Cash o GCash) at makita ang resibo!'
    ],
    example: {
      scenario: 'Bumili si Aling Nena ng 2 kilo ng bigas at 1 kape.',
      action: 'I-click ang "Bigas" (x2) at "Kape" (x1), tapos i-click ang Checkout.',
      result: 'Lalabas ang digital na resibo na ₱120 at awtomatikong papasok ito sa araw-araw na benta.'
    }
  },
  'fresh-tally': {
    tagline: 'I-track ang sariwang paninda tulad ng gulay, prutas, at karne.',
    steps: [
      'Itala ang timbang o bilang ng bagong dating na sariwang paninda sa iyong bodega.',
      'Suriin ang critical low-stock warnings para maiwasan ang maubusan sa gitna ng benta.',
      'I-update ang presyo kada kilo base sa paggalaw ng presyo sa palengke ngayon.'
    ],
    example: {
      scenario: 'Bumaba ang presyo ng bawang sa bagsakan.',
      action: 'I-update ang presyo ng "Bawang" sa app mula ₱120/kilo pababa sa ₱90/kilo.',
      result: 'Lahat ng susunod na benta ng bawang ay gagamit na ng bagong presyo, iwas lugi o overprice.'
    }
  },
  'build-stack': {
    tagline: 'Pamahalaan ang semento, bakal, kahoy, at hardware supplies.',
    steps: [
      'Magtala ng bagong stock ng hardware supplies gamit ang "+ Magdagdag ng Item".',
      'I-track ang bundle o bilang ng sako ng semento at kahoy sa inventory card.',
      'Suriin ang daily release list para masigurong walang nawawalang materyales sa bodega.'
    ],
    example: {
      scenario: 'May dumating na 50 sako ng semento galing sa supplier.',
      action: 'I-click ang "Semento", mag-add ng 50 sacks sa "Restock", at ilagay ang supplier details.',
      result: 'Ang total na semento sa warehouse ay mag-a-update, ready na itong i-release para sa construction.'
    }
  },
  '5-6-tracker': {
    tagline: 'Pamahalaan ang 5-6 at pautang na may kumpiyansa.',
    steps: [
      'I-on ang "Collect Today" filter para mabilis makita kung sino ang mga may utang na dapat singilin ngayon at sino ang mga "Overdue".',
      'Pindutin ang "1-Tap" button sa pangalan ng borrower para mabilis na i-record ang kanilang arawang hulog nang walang kahirap-hirap.',
      'Magdagdag ng Borrower gamit ang "Add Debtor" at ilagay ang kanilang Area/Route, saka i-record ang bagong pautang (with term at interest).'
    ],
    example: {
      scenario: 'Nangutang si Mang Juan ng ₱5,000 payable in 1 month (5-6).',
      action: 'Mag-add ng Loan kay "Mang Juan", ilagay ang ₱5,000 (Principal), 20% interest at 30 days term.',
      result: 'Lilitaw si Mang Juan araw-araw sa "Collect Today". Pindutin lang ang "1-Tap" button para ma-record agad ang kanyang araw-araw na bayad.'
    }
  },
  'ledger-flow': {
    tagline: 'Panoorin ang pera mo lumago. Simple at malinaw na accounting.',
    steps: [
      'Pindutin ang berdeng "+ Kita" sa ilalim kung may pumasok na pera.',
      'Pindutin ang pulang "- Gastos" kapag may binayaran o binili sa tindahan.',
      'Tingnan ang balance sa main cash card para laging kontrolado ang kaban ng negosyo.'
    ],
    example: {
      scenario: 'Nagbayad ng kuryente ang tindahan worth ₱1,500.',
      action: 'Pindutin ang "- Gastos", ilagay ang "Kuryente" at ₱1,500.',
      result: 'Mababawasan ang Cash Balance ng ₱1,500 at papasok ito sa P&L Report bilang Expense.'
    }
  },
  'sahod-flow': {
    tagline: 'Sahod ng staff — tama, on time, at walang sakit sa ulo.',
    steps: [
      'Magtala ng tauhan gamit ang "+ Magdagdag ng Employee" sa iyong roster.',
      'Ilagay kung magkano ang kanilang sahod (Daily Rate o Fixed Monthly salary).',
      'Subaybayan ang dynamic estimated payroll card para ihanda ang sahod sa katapusan.'
    ],
    example: {
      scenario: 'Nag-cash advance (vale) si Boyet ng ₱500.',
      action: 'Pumunta sa profile ni Boyet, i-click ang "Cash Advance", at ilagay ang ₱500.',
      result: 'Awtomatikong ibabawas ang ₱500 sa susunod na sahod ni Boyet pagdating ng payday.'
    }
  },
  'bite-snap': {
    tagline: 'POS at KDS para sa kainan. Order hanggang kusina, automated.',
    steps: [
      'Tanggapin ang order sa screen at ilagay ang table number ng mesa.',
      'Awtomatikong lilipad ang order sa Kitchen Display ng tagaluto.',
      'Pindutin ang "Start Preparing" sa orders list pag lulutuin na, at "Serve" pag isisilbi na!'
    ],
    example: {
      scenario: 'Umorder ang Table 4 ng 2 Sisig at 1 Sinigang.',
      action: 'I-punch ang order para sa Table 4. Pindutin ang "Send to Kitchen".',
      result: 'Tutunog ang tablet sa kusina, at makikita ng cook ang order nang hindi na nagsusulat sa papel.'
    }
  },
  'timpla-track': {
    tagline: 'Cafe operations at counter orders, simplified.',
    steps: [
      'Piliin ang kape o pastries ng customer sa menu list.',
      'I-checkout ang order para awtomatikong pumasok ang bayad sa Cash Register.',
      'Tingnan ang active tickets para ihanda ang kape ng walang kalituhan.'
    ],
    example: {
      scenario: 'Umorder si Customer ng 1 Iced Latte (Large) add-on oat milk.',
      action: 'Piliin ang "Iced Latte", i-tap ang "Large" at "Oat Milk" modifiers, tapos Checkout.',
      result: 'Print ang sticker para sa tasa at pumasok ang kumpletong detalye sa barista monitor.'
    }
  },
  'ganap-master': {
    tagline: 'I-manage ang event catering at bulk orders, walang stress.',
    steps: [
      'Magtala ng bagong bulk order ng handaan at kailan ang schedule ng event.',
      'Subaybayan ang active preparations ng kusina para hindi mahuli sa delivery.',
      'Kumpletuhin ang order kapag naisilbi na para ideposito ang bayad.'
    ],
    example: {
      scenario: 'May nag-book ng catering para sa binyag sa susunod na Linggo (₱15k budget).',
      action: 'Gumawa ng Event ticket, ilagay ang detalye ng binyag, at i-record ang ₱5k downpayment.',
      result: 'Lilitaw ang event sa calendar reminder mo at maa-update ang ledger dahil sa downpayment.'
    }
  },
  'five-six-tracker': {
    tagline: 'Pamahalaan ang pautang, interes, at pang-araw-araw na koleksyon.',
    steps: [
      'Pindutin ang "Add Debtor" para i-set up ang bagong umutang, credit limit, at daily target.',
      'I-click ang "Pautangin Ulit" sa debtor card para i-release ang loan amount at autocompute ang 20% interes.',
      'Araw-araw, pindutin ang "Singilin" o "1-Tap" para direktang ilista ang bayad.',
      'Gumamit ng "Penalty" button para magdagdag ng interes sa mga na-late magbayad.'
    ],
    example: {
      scenario: 'Umutang si Maria ng ₱5,000.',
      action: 'I-click ang "Pautangin Ulit", ilagay ang 5000 bilang principal. Automatic lalabas ang 1000 na interes (Total: 6000).',
      result: 'Mag-uupdate ang kanyang balanse sa ₱6,000 at magkakaroon ng daily target amount na dapat niyang bayaran araw-araw.'
    }
  },
  'biyahe-sync': {
    tagline: 'I-track ang truck, biyahe, at delivery fee, real-time.',
    steps: [
      'Pindutin ang "+ I-dispatch ang Biyahe" at ilagay ang detalye ng karga at destinasyon.',
      'Pindutin ang trip card sa dispatch board para i-advance ang status: transit o arrived.',
      'I-click ang "Complete" pagkahatid ng karga para pumasok ang delivery fee sa main balance.'
    ],
    example: {
      scenario: 'Aalis ang Truck #1 para maghatid ng kargamento pa-Baguio.',
      action: 'I-dispatch ang Truck #1, ilagay ang driver na si "Kuya Cardo", at ang freight fee na ₱8,000.',
      result: 'Maa-update ang status ni Truck #1 to "On Transit", at naka-pending ang ₱8k collectible.'
    }
  },
  'ani-grow': {
    tagline: 'Mula sa bukid hanggang bodega. Subaybayan ang ani.',
    steps: [
      'Itala ang nadiskargang ani o karga mula sa biyahe sa bodegang destinasyon.',
      'I-track ang bigat at bilang ng sako sa dispatch monitor screen.',
      'Awtomatikong pumasok ang biyahe sa iyong finance account para sa bookkeeping.'
    ],
    example: {
      scenario: 'Dumating ang 100 sako ng palay galing sa bukid.',
      action: 'I-log ang "Palay", 100 sacks, at ilagay ang total kilos at kung saang farm nanggaling.',
      result: 'Papasok ito sa Inventory at madaling ma-compute ang total yield ng bukid ngayong harvest season.'
    }
  },
  'spin-snap': {
    tagline: 'Track laundry laundry orders ng wala kang effort.',
    steps: [
      'Magtala ng bagong customer at timbang ng labada gamit ang "+ Magdagdag ng Job".',
      'I-click ang "Simulan / Start" sa card para masubaybayan ang washing at drying progress.',
      'Pindutin ang "Tapusin / Complete" pag tiklop na para makuha ang bayad!'
    ],
    example: {
      scenario: 'Nagpadala si Ate Susan ng 8 kilos ng damit para sa Wash-Dry-Fold.',
      action: 'Gumawa ng job kay "Susan", ilagay ang 8 kilos, at i-click ang "Start Washing".',
      result: 'Makikita sa board na washing na ang damit ni Susan para alam mo kung alin ang uunahin sa dryer.'
    }
  },
  'hydro-sync': {
    tagline: 'I-manage ang deliveries ng water station mo, auto.',
    steps: [
      'Itala ang order ng mga galon sa listahan gamit ang "+ Magdagdag ng Job".',
      'I-track ang queue ng naghihintay na delivery slots.',
      'Pindutin ang "Tapusin / Complete" pag naihatid na para mag-update ang cash registry.'
    ],
    example: {
      scenario: 'Tumawag ang isang opisina para magpa-deliver ng 10 galon ng tubig.',
      action: 'Gumawa ng delivery job para sa "Opisina", ilagay ang 10 blue gallons.',
      result: 'Papasok sa listahan ng delivery boy ang job, at alam mong may babalik na 10 empty gallons.'
    }
  },
  'auto-boss': {
    tagline: 'Track slots ng car wash at detalye ng sasakyan. Maliwanag.',
    steps: [
      'Itala ang plaka ng sasakyan at ang napiling carwash package (Wash/Wax/Detail).',
      'Pindutin ang "Start" sa processing board kapag isinalang na ang kotse sa slot.',
      'Kumpletuhin ang task pag malinis na para makolekta ang bayad at pumasok sa ledger.'
    ],
    example: {
      scenario: 'Dumating ang Toyota Fortuner (ABC-1234) para magpa-Interior Detailing.',
      action: 'I-log ang ABC-1234, piliin ang "Detailing", at assign sa slot number 2.',
      result: 'Lilitaw sa board na occupied ang Slot 2 para hindi mag-overbook ang shop mo.'
    }
  },
  'wellness-pro': {
    tagline: 'Booking at bayad sa spa at wellness center, sa isang lugar.',
    steps: [
      'Itala ang pangalan ng kliyente at ang piniling treatment o gupit.',
      'I-track kung sino ang stylist na hahawak sa queue list.',
      'I-complete ang status kapag nakapahinga at nakabayad na ang customer.'
    ],
    example: {
      scenario: 'Nag-walk-in si Madam para magpa-Whole Body Massage at Facial.',
      action: 'Gumawa ng booking kay "Madam", piliin ang Massage at Facial services.',
      result: 'Awtomatikong isasama sa bill ang dalawang service para sa madaling checkout sa counter.'
    }
  },
  'trim-track': {
    tagline: 'Track ang upuan at gupit sa salon o barbershop.',
    steps: [
      'Itala ang pangalan ng customer at ang piniling serbisyo (Haircut, Color, etc.).',
      'Ilipat ang status sa "In Chair" kapag nagsimula na ang gupit.',
      'Pagkatapos, i-click ang "Checkout" para i-record ang bayad sa ledger.'
    ],
    example: {
      scenario: 'May customer na nagpa-Hair Color at Rebond.',
      action: 'I-log ang customer at i-tag na hawak siya ni Senior Stylist "Mark".',
      result: 'Mamomonitor mo kung ilang customer na ang nagawa ni Mark ngayong araw para sa kanyang komisyon.'
    }
  },
  'rep-sync': {
    tagline: 'Membership at gym attendance, planado at simple.',
    steps: [
      'I-register ang bagong member o i-log ang daily walk-in.',
      'I-check in ang member kapag pumasok sa gym (Attendance).',
      'Makita ang mga active members at mga kailangan nang mag-renew.'
    ],
    example: {
      scenario: 'Gusto mag-renew ni Coach ng 1-month gym membership.',
      action: 'Hanapin ang profile ni Coach, i-click ang "Renew", at tanggapin ang ₱1,000 payment.',
      result: 'Maa-update ang expiration date ng membership ni Coach ng isa pang buwan.'
    }
  },
  'sundo-sync': {
    tagline: 'Tricycle o transport dispatch monitor.',
    steps: [
      'Itala ang ruta o biyahe at ang driver na lalarga.',
      'I-track ang boundary o pamasahe sa live terminal screen.',
      'Kumpletuhin ang biyahe para awtomatikong mag-bookkeep sa financial ledger.'
    ],
    example: {
      scenario: 'Sumakay ang 4 na pasahero pa-Bayan sa Tricycle 01.',
      action: 'I-dispatch ang Tricycle 01, lagyan ng 4 passengers at destinasyong "Bayan".',
      result: 'Mamomonitor ng TODA o dispatcher kung ilang tricycle ang naka-deploy at ilang ang nasa pila.'
    }
  },
  'tindahan-flow': {
    tagline: 'Sari-Sari store inventory at wholesale monitor.',
    steps: [
      'Itala ang natitirang wholesale stocks ng mga de-lata at inumin.',
      'Pindutin ang stock levels para mapuno ang iyong local warehouse logs.',
      'Subaybayan ang aklat-de-benta sa ledger flow para laging may puhunan.'
    ],
    example: {
      scenario: 'Bumili ang ahente ng 10 kahon ng sardinas para sa wholesale.',
      action: 'Mag-benta ng 10 boxes ng sardinas sa system at tanggapin ang bulk payment.',
      result: 'Awtomatikong mababawasan ng 10 boxes ang iyong master inventory at lalaki ang cash-on-hand.'
    }
  }
};

export const DEFAULT_GUIDE: GuideContent = {
  tagline: 'Ang katuwang mo sa negosyo. Mura. Mabilis. Maaasahan.',
  steps: [
    'Magtala ng bagong aklat o record gamit ang malalaking dilaw at berdeng button.',
    'Panoorin ang live updates na awtomatikong nagsi-sync kahit ikaw ay offline.',
    'Pindutin ang "Profile" o switcher button sa itaas para mag-palit ng aktibong module.'
  ],
  example: {
    scenario: 'Halimbawa, gusto mong maglista ng bagong transaksyon.',
    action: 'Hanapin ang malaking button sa dashboard na may "+", at ilagay ang detalye.',
    result: 'Makikita ito agad sa iyong listahan at papasok sa mga reports para sa buwan na ito.'
  }
};

export function ModuleGuide({ isOpen, onClose }: ModuleGuideProps) {
  const { currentTenant } = useTenant();
  const theme = getModuleTheme(currentTenant?.moduleType);

  if (!isOpen) return null;

  const moduleType = currentTenant?.moduleType || 'benta-snap';
  const guide = MODULE_GUIDES[moduleType] || DEFAULT_GUIDE;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="absolute inset-0" onClick={onClose} />
      <div 
        className="relative bg-white border-t border-slate-100 rounded-t-[32px] p-6 pb-nav shadow-2xl w-full max-w-[430px] space-y-6 animate-in slide-in-from-bottom duration-300"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
      >
        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto -mt-2 mb-2" onClick={onClose} />

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="p-1 rounded-lg text-white" style={{ backgroundColor: theme.primary }}>
                <BookOpen className="h-4 w-4" />
              </span>
              <h2 className="font-headline font-black text-slate-800 text-lg uppercase tracking-tight">
                Gabay sa Paggamit
              </h2>
            </div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
              {currentTenant?.name || 'Katuwang'} · {currentTenant?.moduleType}
            </p>
          </div>
          
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 active:scale-90 transition-transform">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 rounded-2xl flex items-start gap-3 border border-dashed text-left" style={{ backgroundColor: `${theme.primary}08`, borderColor: `${theme.primary}30` }}>
          <span className="text-xl">💡</span>
          <p className="text-xs font-bold leading-relaxed" style={{ color: theme.primary }}>{guide.tagline}</p>
        </div>

        <div className="space-y-4 text-left">
          {guide.steps.map((step, idx) => (
            <div key={idx} className="flex items-start gap-4 animate-in fade-in duration-300" style={{ animationDelay: `${idx * 0.1}s` }}>
              <span className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0 shadow-sm" style={{ backgroundColor: theme.primary }}>
                {idx + 1}
              </span>
              <p className="text-xs text-slate-600 font-medium leading-relaxed pt-0.5">{step}</p>
            </div>
          ))}
        </div>

        {/* Display the new example section */}
        {guide.example && (
          <div className="mt-6 pt-6 border-t border-slate-100 space-y-3">
            <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Halimbawa ng Transaksyon</h4>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-3">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Sitwasyon</span>
                <p className="text-sm font-semibold text-slate-700">{guide.example.scenario}</p>
              </div>
              <div className="border-t border-slate-200/50 pt-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Paano Gawin</span>
                <p className="text-sm text-slate-600">{guide.example.action}</p>
              </div>
              <div className="border-t border-slate-200/50 pt-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Resulta</span>
                <p className="text-sm font-medium" style={{ color: theme.primary }}>{guide.example.result}</p>
              </div>
            </div>
          </div>
        )}

        <button 
          onClick={onClose}
          className="w-full h-12 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-md select-none border-none"
          style={{ backgroundColor: theme.primary, boxShadow: `0 10px 20px -5px ${theme.primary}50` }}
        >
          Nakuha Ko Na! 👍
        </button>
      </div>
    </div>
  );
}
