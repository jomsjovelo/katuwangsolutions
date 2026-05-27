"use client"

import React from 'react';
import { 
  ShoppingCart, Leaf, Hammer, Sprout,
  Utensils, Coffee, ChefHat, CalendarHeart, RotateCcw, Droplets,
  Sparkles, Sun, Wrench, Banknote, BookText, Truck, Wallet, Scissors, Dumbbell
} from 'lucide-react';
import { cn } from '@/lib/utils';

const apps = [
  { 
    category: 'Retail & Tindahan',
    items: [
      { id: 'benta-snap', name: 'Benta Snap', icon: ShoppingCart, desc: 'Lightning-fast retail checkout to maximize your daily sales.' },
      { id: 'fresh-tally', name: 'Fresh Tally', icon: Leaf, desc: 'Smart inventory tracking to keep your fresh produce moving.' },
      { id: 'build-stack', name: 'Build Stack', icon: Hammer, desc: 'Precision material tracking for seamless construction supply.' },
      { id: 'ani-grow', name: 'Ani Grow', icon: Sprout, desc: 'End-to-end farm-to-warehouse tracking for agriculture.' },
    ]
  },
  { 
    category: 'Pagkain & Inumin',
    items: [
      { id: 'bite-snap', name: 'Bite Snap', icon: Utensils, desc: 'Rapid order-to-kitchen flow for hungry diners.' },
      { id: 'timpla-track', name: 'Timpla Track', icon: Coffee, desc: 'Crafted cafe operations for the perfect brew every time.' },
      { id: 'ganap-master', name: 'Ganap Master', icon: CalendarHeart, desc: 'Orchestrate unforgettable events with flawless planning.' },
    ]
  },
  { 
    category: 'Serbisyo',
    items: [
      { id: 'spin-snap', name: 'Spin Snap', icon: RotateCcw, desc: 'Automated laundry tracking from drop-off to pickup.' },
      { id: 'hydro-sync', name: 'Hydro Sync', icon: Droplets, desc: 'Streamlined water delivery logistics for thirsty neighborhoods.' },
      { id: 'auto-boss', name: 'Auto Boss', icon: Sparkles, desc: 'Rev up your shop with automated slot and payment tracking.' },
      { id: 'wellness-pro', name: 'Wellness Pro', icon: Sun, desc: 'Elevate your spa experience with seamless booking and billing.' },
      { id: 'trim-track', name: 'Trim Track', icon: Scissors, desc: 'Keep your barber chairs full and your payments tracked.' },
      { id: 'rep-sync', name: 'Rep Sync', icon: Dumbbell, desc: 'Automate gym memberships, attendance, and renewals effortlessly.' },
    ]
  },
  { 
    category: 'Pananago ng Negosyo',
    items: [
      { id: 'sahod-flow', name: 'Sahod Flow', icon: Banknote, desc: 'Effortless payroll management for a happy, on-time team.' },
      { id: 'ledger-flow', name: 'Ledger Flow', icon: BookText, desc: 'Crystal-clear financial insights to watch your profits soar.' },
      { id: 'biyahe-sync', name: 'Biyahe Sync', icon: Truck, desc: 'Real-time fleet dispatching to keep your business moving.' },
    ]
  },
  {
    category: 'Pinansyal & Pagpapautang',
    items: [
      { id: '5-6-tracker', name: '5-6 Tracker', icon: BookText, desc: 'Secure, automated lending lists for faster collections.' },
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
