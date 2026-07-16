"use client"

import React from 'react';
import { 
  ShoppingCart, Leaf, Hammer, Sprout,
  Utensils, Coffee, ChefHat, CalendarHeart, RotateCcw, Droplets,
  Sparkles, Sun, Wrench, Banknote, BookText, Truck, Wallet, Scissors, Dumbbell
} from 'lucide-react';
import { cn } from '@/lib/utils';

import { appGroups } from '@/lib/app-data';

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
        {appGroups.map((group) => (
          <div key={group.id} className="space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 pl-1">{group.label}</h3>
            <div className="grid gap-3">
              {group.apps.map((app) => {
                const Icon = app.icon;
                return (
                  <button
                    key={app.id}
                    data-module-id={app.id}
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
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-900">{app.name}</div>
                      <div className="text-xs text-slate-600 leading-snug line-clamp-2">{app.tagline}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
