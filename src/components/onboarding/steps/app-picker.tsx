"use client"

import React from 'react';
import { 
  ShoppingCart, Leaf, Hammer, Sprout,
  Utensils, Coffee, ChefHat, CalendarHeart, RotateCcw, Droplets,
  Sparkles, Sun, Wrench, Banknote, BookText, Truck, Wallet
} from 'lucide-react';
import { cn } from '@/lib/utils';

const apps = [
  { 
    category: 'Retail & Tindahan',
    items: [
      { id: 'benta-snap', name: 'Benta Snap', icon: ShoppingCart, desc: 'Para sa mga tindahan — i-snap ang benta, real-time.' },
      { id: 'fresh-tally', name: 'Fresh Tally', icon: Leaf, desc: 'Para sa palengke at talipapa — alamin ang stock mo agad.' },
      { id: 'build-stack', name: 'Build Stack', icon: Hammer, desc: 'Para sa hardware at konstruksiyon — i-track ang materyales.' },
      { id: 'ani-grow', name: 'Ani Grow', icon: Sprout, desc: 'Para sa mga magsasaka — mula sa bukid hanggang bodega.' },
    ]
  },
  { 
    category: 'Pagkain & Inumin',
    items: [
      { id: 'bite-snap', name: 'Bite Snap', icon: Utensils, desc: 'Para sa mga kainan — order, bayad, at resibo sa seconds.' },
      { id: 'timpla-track', name: 'Timpla Track', icon: Coffee, desc: 'Para sa mga café — simpleng pag-manage ng operasyon.' },
      { id: 'ganap-master', name: 'Ganap Master', icon: CalendarHeart, desc: 'Para sa events — i-manage ang layout at food, walang stress.' },
    ]
  },
  { 
    category: 'Serbisyo',
    items: [
      { id: 'spin-snap', name: 'Spin Snap', icon: RotateCcw, desc: 'Para sa laundry shop — track ang orders ng walang effort.' },
      { id: 'hydro-sync', name: 'Hydro Sync', icon: Droplets, desc: 'Para sa water station — i-manage ang deliveries, auto.' },
      { id: 'shine-sync', name: 'Shine Sync', icon: Sparkles, desc: 'Para sa car wash — track slots at bayad, maliwanag.' },
      { id: 'glow-sync', name: 'Glow Sync', icon: Sun, desc: 'Para sa salon at spa — booking at bayad, sa isang lugar.' },
      { id: 'rep-sync', name: 'Rep Sync', icon: Wrench, desc: 'Para sa gym at fitness — membership, attendance, payments.' },
    ]
  },
  { 
    category: 'Pananago ng Negosyo',
    items: [
      { id: 'sahod-flow', name: 'Sahod Flow', icon: Banknote, desc: 'Para sa lahat — tama ang sahod, on time palagi.' },
      { id: 'ledger-flow', name: 'Ledger Flow', icon: BookText, desc: 'Para sa lahat — panoorin ang pera mo lumago.' },
      { id: 'biyahe-sync', name: 'Biyahe Sync', icon: Truck, desc: 'Para sa delivery at logistics — track biyahe, real-time.' },
    ]
  },
  {
    category: 'Pinansyal & Pagpapautang',
    items: [
      { id: 'hiram-snap', name: 'Hiram Snap', icon: Wallet, desc: 'Para sa 5-6 at lending — i-track ang pautang at singil araw-araw.' },
    ]
  }
];

interface AppPickerStepProps {
  selectedId: string;
  onSelect: (id: string) => void;
}

export function AppPickerStep({ selectedId, onSelect }: AppPickerStepProps) {
  return (
    <div className="p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-1">
        <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900">What is your business type?</h2>
        <p className="text-slate-600 text-sm font-medium">Pick the perfect app for your business.</p>
      </div>

      <div className="space-y-10">
        {apps.map((group) => (
          <div key={group.category} className="space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 pl-1">{group.category}</h3>
            <div className="grid gap-3">
              {group.items.map((app) => (
                <button
                  key={app.id}
                  onClick={() => onSelect(app.id)}
                  className={cn(
                    "flex items-center gap-4 p-4 rounded-2xl border text-left transition-all active:scale-[0.98]",
                    selectedId === app.id 
                      ? "bg-primary/5 border-primary shadow-sm" 
                      : "bg-white border-slate-100 hover:border-slate-300"
                  )}
                >
                  <div className={cn(
                    "h-12 w-12 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                    selectedId === app.id ? "bg-primary text-white" : "bg-slate-100 text-slate-500"
                  )}>
                    <app.icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900">{app.name}</div>
                    <div className="text-xs text-slate-600 leading-snug line-clamp-2">{app.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
