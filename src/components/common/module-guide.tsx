"use client"

import React from 'react';
import { X, Play, BookOpen, Star } from 'lucide-react';
import { useTenant } from '@/app/lib/tenant-context';
import { getModuleTheme } from '@/lib/theme-utils';

interface ModuleGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

interface GuideContent {
  tagline: string;
  steps: string[];
}

const MODULE_GUIDES: Record<string, GuideContent> = {
  'benta-snap': {
    tagline: 'I-snap ang benta sa iyong Sari-Sari store, mabilis at simple.',
    steps: [
      'Pindutin ang dilaw na buton na "+ Magdagdag ng Test Product" sa itaas para magkaroon ng tinda.',
      'I-click ang mga tinda sa listahan para mapuno ang iyong Basket sa ilalim.',
      'Buksan ang Basket sa ilalim para magbayad (pumili kung Cash o GCash) at makita ang resibo!'
    ]
  },
  'fresh-tally': {
    tagline: 'I-track ang sariwang paninda tulad ng gulay, prutas, at karne.',
    steps: [
      'Itala ang timbang o bilang ng bagong dating na sariwang paninda sa iyong bodega.',
      'Suriin ang critical low-stock warnings para maiwasan ang maubusan sa gitna ng benta.',
      'I-update ang presyo kada kilo base sa paggalaw ng presyo sa palengke ngayon.'
    ]
  },
  'build-stack': {
    tagline: 'Pamahalaan ang semento, bakal, kahoy, at hardware supplies.',
    steps: [
      'Magtala ng bagong stock ng hardware supplies gamit ang "+ Magdagdag ng Item".',
      'I-track ang bundle o bilang ng sako ng semento at kahoy sa inventory card.',
      'Suriin ang daily release list para masigurong walang nawawalang materyales sa bodega.'
    ]
  },
  'hiram-snap': {
    tagline: 'Pamahalaan ang 5-6 at pautang na may kumpiyansa.',
    steps: [
      'Tingnan ang "Daily Collectibles" sa itaas para malaman kung sino ang mga dapat maningil ngayon.',
      'Pindutin ang borrower sa listahan para mabilis na itala ang kanilang bayad.',
      'Gamitin ang dilaw na buton sa gilid para mag-release ng bagong utang at borrower.'
    ]
  },
  'ledger-flow': {
    tagline: 'Panoorin ang pera mo lumago. Simple at malinaw na accounting.',
    steps: [
      'Pindutin ang berdeng "+ Kita" sa ilalim kung may pumasok na pera.',
      'Pindutin ang pulang "- Gastos" kapag may binayaran o binili sa tindahan.',
      'Tingnan ang balance sa main cash card para laging kontrolado ang kaban ng negosyo.'
    ]
  },
  'sahod-flow': {
    tagline: 'Sahod ng staff — tama, on time, at walang sakit sa ulo.',
    steps: [
      'Magtala ng tauhan gamit ang "+ Magdagdag ng Employee" sa iyong roster.',
      'Ilagay kung magkano ang kanilang sahod (Daily Rate o Fixed Monthly salary).',
      'Subaybayan ang dynamic estimated payroll card para ihanda ang sahod sa katapusan.'
    ]
  },
  'bite-snap': {
    tagline: 'POS at KDS para sa kainan. Order hanggang kusina, automated.',
    steps: [
      'Tanggapin ang order sa screen at ilagay ang table number ng mesa.',
      'Awtomatikong lilipad ang order sa Kitchen Display ng tagaluto.',
      'Pindutin ang "Start Preparing" sa orders list pag lulutuin na, at "Serve" pag isisilbi na!'
    ]
  },
  'timpla-track': {
    tagline: 'Cafe operations at counter orders, simplified.',
    steps: [
      'Piliin ang kape o pastries ng customer sa menu list.',
      'I-checkout ang order para awtomatikong pumasok ang bayad sa Cash Register.',
      'Tingnan ang active tickets para ihanda ang kape ng walang kalituhan.'
    ]
  },
  'ganap-master': {
    tagline: 'I-manage ang event catering at bulk orders, walang stress.',
    steps: [
      'Magtala ng bagong bulk order ng handaan at kailan ang schedule ng event.',
      'Subaybayan ang active preparations ng kusina para hindi mahuli sa delivery.',
      'Kumpletuhin ang order kapag naisilbi na para ideposito ang bayad.'
    ]
  },
  'biyahe-sync': {
    tagline: 'I-track ang truck, biyahe, at delivery fee, real-time.',
    steps: [
      'Pindutin ang "+ I-dispatch ang Biyahe" at ilagay ang detalye ng karga at destinasyon.',
      'Pindutin ang trip card sa dispatch board para i-advance ang status: transit o arrived.',
      'I-click ang "Complete" pagkahatid ng karga para pumasok ang delivery fee sa main balance.'
    ]
  },
  'ani-grow': {
    tagline: 'Mula sa bukid hanggang bodega. Subaybayan ang ani.',
    steps: [
      'Itala ang nadiskargang ani o karga mula sa biyahe sa bodegang destinasyon.',
      'I-track ang bigat at bilang ng sako sa dispatch monitor screen.',
      'Awtomatikong pumasok ang biyahe sa iyong finance account para sa bookkeeping.'
    ]
  },
  'spin-snap': {
    tagline: 'Track laundry laundry orders ng wala kang effort.',
    steps: [
      'Magtala ng bagong customer at timbang ng labada gamit ang "+ Magdagdag ng Job".',
      'I-click ang "Simulan / Start" sa card para masubaybayan ang washing at drying progress.',
      'Pindutin ang "Tapusin / Complete" pag tiklop na para makuha ang bayad!'
    ]
  },
  'hydro-sync': {
    tagline: 'I-manage ang deliveries ng water station mo, auto.',
    steps: [
      'Itala ang order ng mga galon sa listahan gamit ang "+ Magdagdag ng Job".',
      'I-track ang queue ng naghihintay na delivery slots.',
      'Pindutin ang "Tapusin / Complete" pag naihatid na para mag-update ang cash registry.'
    ]
  },
  'auto-boss': {
    tagline: 'Track slots ng car wash at detalye ng sasakyan. Maliwanag.',
    steps: [
      'Itala ang plaka ng sasakyan at ang napiling carwash package (Wash/Wax/Detail).',
      'Pindutin ang "Start" sa processing board kapag isinalang na ang kotse sa slot.',
      'Kumpletuhin ang task pag malinis na para makolekta ang bayad at pumasok sa ledger.'
    ]
  },
  'wellness-pro': {
    tagline: 'Booking at bayad sa spa at wellness center, sa isang lugar.',
    steps: [
      'Itala ang pangalan ng kliyente at ang piniling treatment o gupit.',
      'I-track kung sino ang stylist na hahawak sa queue list.',
      'I-complete ang status kapag nakapahinga at nakabayad na ang customer.'
    ]
  },
  'rep-sync': {
    tagline: 'Membership at repair jobs, planado at simple.',
    steps: [
      'Itala ang gadget o gamit na kailangang ayusin at ang pangalan ng may-ari.',
      'Simulan ang repair task at ilagay ang pre-estimated delivery details.',
      'Pindutin ang "Tapusin" kapag nakuha na at na-claim na ang inayos na gadget.'
    ]
  },
  'sundo-sync': {
    tagline: 'Tricycle o transport dispatch monitor.',
    steps: [
      'Itala ang ruta o biyahe at ang driver na lalarga.',
      'I-track ang boundary o pamasahe sa live terminal screen.',
      'Kumpletuhin ang biyahe para awtomatikong mag-bookkeep sa financial ledger.'
    ]
  },
  'tindahan-flow': {
    tagline: 'Sari-Sari store inventory at wholesale monitor.',
    steps: [
      'Itala ang natitirang wholesale stocks ng mga de-lata at inumin.',
      'Pindutin ang stock levels para mapuno ang iyong local warehouse logs.',
      'Subaybayan ang aklat-de-benta sa ledger flow para laging may puhunan.'
    ]
  }
};

const DEFAULT_GUIDE: GuideContent = {
  tagline: 'Ang katuwang ng negosyo mo. Mura. Mabilis. Maaasahan.',
  steps: [
    'Magtala ng bagong aklat o record gamit ang malalaking dilaw at berdeng button.',
    'Panoorin ang live updates na awtomatikong nagsi-sync kahit ikaw ay offline.',
    'Pindutin ang "Profile" o switcher button sa itaas para mag-palit ng aktibong module.'
  ]
};

export function ModuleGuide({ isOpen, onClose }: ModuleGuideProps) {
  const { currentTenant } = useTenant();
  const theme = getModuleTheme(currentTenant?.moduleType);

  if (!isOpen) return null;

  const moduleType = currentTenant?.moduleType || 'benta-snap';
  const guide = MODULE_GUIDES[moduleType] || DEFAULT_GUIDE;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
      {/* Background click close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Slide-up guide container */}
      <div 
        className="relative bg-white border-t border-slate-100 rounded-t-[32px] p-6 pb-nav shadow-2xl w-full max-w-[430px] space-y-6 animate-in slide-in-from-bottom duration-300"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
      >
        {/* Header Indicator */}
        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto -mt-2 mb-2" onClick={onClose} />

        {/* Title block */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span 
                className="p-1 rounded-lg text-white" 
                style={{ backgroundColor: theme.primary }}
              >
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
          
          <button 
            onClick={onClose}
            className="h-8 w-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 active:scale-90 transition-transform"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tagline tinted container */}
        <div 
          className="p-4 rounded-2xl flex items-start gap-3 border border-dashed text-left"
          style={{ 
            backgroundColor: `${theme.primary}08`, 
            borderColor: `${theme.primary}30` 
          }}
        >
          <span className="text-xl">💡</span>
          <p 
            className="text-xs font-bold leading-relaxed"
            style={{ color: theme.primary }}
          >
            {guide.tagline}
          </p>
        </div>

        {/* Dynamic step items */}
        <div className="space-y-4 text-left">
          {guide.steps.map((step, idx) => (
            <div key={idx} className="flex items-start gap-4 animate-in fade-in duration-300" style={{ animationDelay: `${idx * 0.1}s` }}>
              {/* Animated number bubble */}
              <span 
                className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0 shadow-sm"
                style={{ backgroundColor: theme.primary }}
              >
                {idx + 1}
              </span>
              <p className="text-xs text-slate-600 font-medium leading-relaxed pt-0.5">
                {step}
              </p>
            </div>
          ))}
        </div>

        {/* Action button */}
        <button 
          onClick={onClose}
          className="w-full h-12 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-md select-none border-none"
          style={{ 
            backgroundColor: theme.primary,
            boxShadow: `0 10px 20px -5px ${theme.primary}50` 
          }}
        >
          Nakuha Ko Na! 👍
        </button>
      </div>
    </div>
  );
}
