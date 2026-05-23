import React from 'react';

export interface ModuleTheme {
  primary: string;         // Hex code (for browser meta theme-color notch)
  primaryBg: string;       // Tailwind background gradient classes
  primaryText: string;     // Tailwind text color classes
  primaryBorder: string;   // Tailwind border color classes
  secondary: string;       // Secondary accent hex code
  secondaryBg: string;     // Tailwind secondary background classes
  secondaryText: string;   // Tailwind secondary text color classes
  glowClass: string;       // Custom dynamic Joy-Glow shadow classes
  name: string;            // Cheerful Tagalog module title
  tagline: string;         // Happy, uplifting marketing tagline in Tagalog
}

export const MODULE_THEMES: Record<string, ModuleTheme> = {
  // 1. Retail
  'benta-snap': {
    primary: '#06B6D4',
    primaryBg: 'from-cyan-500 to-cyan-600',
    primaryText: 'text-cyan-600',
    primaryBorder: 'border-cyan-200',
    secondary: '#FACC15',
    secondaryBg: 'bg-yellow-400 hover:bg-yellow-500',
    secondaryText: 'text-slate-900',
    glowClass: 'joy-glow',
    name: 'Benta Snap',
    tagline: 'Mabilis na retail at benta terminal'
  },
  'fresh-tally': {
    primary: '#10B981',
    primaryBg: 'from-emerald-500 to-emerald-600',
    primaryText: 'text-emerald-600',
    primaryBorder: 'border-emerald-200',
    secondary: '#F59E0B',
    secondaryBg: 'bg-amber-400 hover:bg-amber-500',
    secondaryText: 'text-slate-900',
    glowClass: 'joy-glow-emerald',
    name: 'Fresh Tally',
    tagline: 'Masariwang pagsubaybay sa prutas at paninda'
  },
  'build-stack': {
    primary: '#475569',
    primaryBg: 'from-slate-600 to-slate-700',
    primaryText: 'text-slate-600',
    primaryBorder: 'border-slate-200',
    secondary: '#FACC15',
    secondaryBg: 'bg-yellow-400 hover:bg-yellow-500',
    secondaryText: 'text-slate-900',
    glowClass: 'joy-glow-slate',
    name: 'Build Stack',
    tagline: 'Matatag na hardware at materyales monitor'
  },
  
  // 2. Lending
  'hiram-snap': {
    primary: '#10B981',
    primaryBg: 'from-emerald-500 to-emerald-600',
    primaryText: 'text-emerald-600',
    primaryBorder: 'border-emerald-200',
    secondary: '#F59E0B',
    secondaryBg: 'bg-amber-400 hover:bg-amber-500',
    secondaryText: 'text-slate-900',
    glowClass: 'joy-glow-emerald',
    name: 'Hiram Snap',
    tagline: 'Ligtas na pamamahala ng utang at puhunan'
  },
  
  // 3. Accounting
  'ledger-flow': {
    primary: '#6366F1',
    primaryBg: 'from-indigo-500 to-indigo-600',
    primaryText: 'text-indigo-600',
    primaryBorder: 'border-indigo-200',
    secondary: '#F43F5E',
    secondaryBg: 'bg-rose-500 hover:bg-rose-600',
    secondaryText: 'text-white',
    glowClass: 'joy-glow-indigo',
    name: 'Ledger Flow',
    tagline: 'Malinaw at tumpak na accounting at aklat-de-benta'
  },
  
  // 4. Payroll
  'sahod-flow': {
    primary: '#2563EB',
    primaryBg: 'from-blue-600 to-blue-700',
    primaryText: 'text-blue-600',
    primaryBorder: 'border-blue-200',
    secondary: '#FDA4AF',
    secondaryBg: 'bg-rose-300 hover:bg-rose-400',
    secondaryText: 'text-slate-900',
    glowClass: 'joy-glow-blue-deep',
    name: 'Sahod Flow',
    tagline: 'Mabilis at madaling payroll para sa mga staff'
  },
  
  // 5. Logistics (Biyahe)
  'biyahe-sync': {
    primary: '#3B82F6',
    primaryBg: 'from-blue-500 to-blue-600',
    primaryText: 'text-blue-600',
    primaryBorder: 'border-blue-200',
    secondary: '#FF7A00',
    secondaryBg: 'bg-orange-500 hover:bg-orange-600',
    secondaryText: 'text-white',
    glowClass: 'joy-glow-blue',
    name: 'Biyahe Sync',
    tagline: 'Maayos na logistics at paghahatid ng produkto'
  },
  
  // 6. Agriculture (Ani)
  'ani-grow': {
    primary: '#D97706',
    primaryBg: 'from-amber-600 to-amber-700',
    primaryText: 'text-amber-600',
    primaryBorder: 'border-amber-200',
    secondary: '#10B981',
    secondaryBg: 'bg-emerald-500 hover:bg-emerald-600',
    secondaryText: 'text-white',
    glowClass: 'joy-glow-amber',
    name: 'Ani Grow',
    tagline: 'Maayos na logistics at ani monitoring'
  },
  
  // 7. Food Diner
  'bite-snap': {
    primary: '#F97316',
    primaryBg: 'from-orange-500 to-orange-600',
    primaryText: 'text-orange-600',
    primaryBorder: 'border-orange-200',
    secondary: '#EAB308',
    secondaryBg: 'bg-yellow-400 hover:bg-yellow-500',
    secondaryText: 'text-slate-900',
    glowClass: 'joy-glow-orange',
    name: 'Bite Snap',
    tagline: 'Malinamnam na pamamahala ng kusina at menu'
  },
  
  // 8. Kitchen Recipe
  'timpla-track': {
    primary: '#EF4444',
    primaryBg: 'from-red-500 to-red-600',
    primaryText: 'text-red-600',
    primaryBorder: 'border-red-200',
    secondary: '#FEF08A',
    secondaryBg: 'bg-yellow-200 hover:bg-yellow-300',
    secondaryText: 'text-slate-900',
    glowClass: 'joy-glow-red',
    name: 'Timpla Track',
    tagline: 'Malinamnam na pagsubaybay sa recipe at sangkap'
  },
  
  // 9. Food Catering
  'ganap-master': {
    primary: '#EA580C',
    primaryBg: 'from-orange-600 to-orange-700',
    primaryText: 'text-orange-600',
    primaryBorder: 'border-orange-200',
    secondary: '#FEF3C7',
    secondaryBg: 'bg-amber-100 hover:bg-amber-200',
    secondaryText: 'text-amber-900',
    glowClass: 'joy-glow-orange',
    name: 'Ganap Master',
    tagline: 'Malinamnam na pamamahala ng catering at handaan'
  },
  
  // 10. Laundry (Spin)
  'spin-snap': {
    primary: '#22D3EE',
    primaryBg: 'from-cyan-400 to-cyan-500',
    primaryText: 'text-cyan-600',
    primaryBorder: 'border-cyan-200',
    secondary: '#0EA5E9',
    secondaryBg: 'bg-sky-500 hover:bg-sky-600',
    secondaryText: 'text-white',
    glowClass: 'joy-glow',
    name: 'Spin Snap',
    tagline: 'Mabilis na serbisyo sa labada at katuwang sa trabaho'
  },
  
  // 11. Water Refilling
  'hydro-sync': {
    primary: '#0284C7',
    primaryBg: 'from-sky-600 to-sky-700',
    primaryText: 'text-sky-600',
    primaryBorder: 'border-sky-200',
    secondary: '#2DD4BF',
    secondaryBg: 'bg-teal-400 hover:bg-teal-500',
    secondaryText: 'text-slate-900',
    glowClass: 'joy-glow-sky',
    name: 'Hydro Sync',
    tagline: 'Mabilis na serbisyo sa tubig at katuwang sa trabaho'
  },
  
  // 12. Cleaning Service
  'auto-boss': {
    primary: '#34D399',
    primaryBg: 'from-emerald-400 to-emerald-500',
    primaryText: 'text-emerald-600',
    primaryBorder: 'border-emerald-200',
    secondary: '#C084FC',
    secondaryBg: 'bg-purple-400 hover:bg-purple-500',
    secondaryText: 'text-slate-900',
    glowClass: 'joy-glow-emerald',
    name: 'Auto Boss',
    tagline: 'Mabilis na serbisyo sa paglilinis at katuwang sa trabaho'
  },
  
  // 13. Spa/Salon appointments
  'wellness-pro': {
    primary: '#A855F7',
    primaryBg: 'from-purple-500 to-purple-600',
    primaryText: 'text-purple-600',
    primaryBorder: 'border-purple-200',
    secondary: '#F472B6',
    secondaryBg: 'bg-pink-400 hover:bg-pink-500',
    secondaryText: 'text-slate-900',
    glowClass: 'joy-glow-violet',
    name: 'Wellness Pro',
    tagline: 'Mabilis na serbisyo sa spa/salong katuwang sa ganda'
  },
  
  // 14. Technical Repair shop
  'rep-sync': {
    primary: '#475569',
    primaryBg: 'from-slate-600 to-slate-700',
    primaryText: 'text-slate-600',
    primaryBorder: 'border-slate-200',
    secondary: '#FACC15',
    secondaryBg: 'bg-yellow-400 hover:bg-yellow-500',
    secondaryText: 'text-slate-900',
    glowClass: 'joy-glow-violet',
    name: 'Rep Sync',
    tagline: 'Mabilis na serbisyo sa pagkumpuni at katuwang sa trabaho'
  },

  // 15. Commuter dispatch
  'sundo-sync': {
    primary: '#FF5A00',
    primaryBg: 'from-orange-500 to-orange-600',
    primaryText: 'text-orange-600',
    primaryBorder: 'border-orange-200',
    secondary: '#94A3B8',
    secondaryBg: 'bg-slate-400 hover:bg-slate-500',
    secondaryText: 'text-white',
    glowClass: 'joy-glow-orange',
    name: 'Sundo Sync',
    tagline: 'Mabilis na transport dispatch at katuwang sa biyahe'
  },

  // 16. E-Commerce
  'tindahan-flow': {
    primary: '#EC4899',
    primaryBg: 'from-pink-500 to-pink-600',
    primaryText: 'text-pink-600',
    primaryBorder: 'border-pink-200',
    secondary: '#F59E0B',
    secondaryBg: 'bg-amber-400 hover:bg-amber-500',
    secondaryText: 'text-slate-900',
    glowClass: 'joy-glow-pink',
    name: 'Tindahan Flow',
    tagline: 'Masayang tindahan online para sa mas mabilis na benta'
  }
};

/**
 * Helper to fetch theme values dynamically based on moduleType.
 * Defaults back to 'benta-snap' if not found or empty.
 */
export function getModuleTheme(moduleType?: string): ModuleTheme {
  const key = moduleType || 'benta-snap';
  return MODULE_THEMES[key] || MODULE_THEMES['benta-snap'];
}

/**
 * Custom hook to dynamically adjust browser theme-color meta tags
 * for an immersive PWA mobile experience.
 */
export function useDynamicThemeColor(theme: ModuleTheme) {
  React.useEffect(() => {
    // Attempt to locate standard meta element
    let metaTag = document.querySelector('meta[name="theme-color"]');
    
    if (!metaNodeValid(metaTag)) {
      metaTag = document.createElement('meta');
      metaTag.setAttribute('name', 'theme-color');
      document.head.appendChild(metaTag);
    }
    
    // Dynamically update viewport background matching the active module
    metaTag.setAttribute('content', theme.primary);
  }, [theme]);
}

function metaNodeValid(el: Element | null): el is HTMLMetaElement {
  return el !== null && el instanceof HTMLMetaElement;
}
