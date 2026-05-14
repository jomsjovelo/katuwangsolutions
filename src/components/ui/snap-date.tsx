'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { addDays } from 'date-fns';

export interface SnapDateProps extends React.ComponentProps<typeof DayPicker> {}

/**
 * Katuwang SnapDate (Syncros V18 Standard)
 * - 7-column grid with exactly 40px cell sizing.
 * - font-weight: 300 for date numbers.
 * - High-contrast primary selection with double-ring focus.
 * - Quick-select chips for mobile-first efficiency.
 */
export function SnapDate({
  className,
  classNames,
  showOutsideDays = true,
  onSelect,
  ...props
}: SnapDateProps) {
  
  const handleQuickSelect = (type: 'today' | 'yesterday' | '7days') => {
    const today = new Date();
    if (type === 'today') {
      // @ts-ignore
      onSelect?.(today);
    } else if (type === 'yesterday') {
      // @ts-ignore
      onSelect?.(addDays(today, -1));
    }
  };

  return (
    <div className={cn("p-6 bg-white rounded-[32px] shadow-2xl border border-slate-50 w-full max-w-sm mx-auto", className)}>
      <DayPicker
        showOutsideDays={showOutsideDays}
        className="w-full flex flex-col items-center"
        classNames={{
          months: "w-full flex flex-col space-y-6",
          month: "space-y-6 w-full",
          caption: "flex justify-between items-center px-2 py-1 mb-2",
          caption_label: "text-lg font-bold text-slate-800 tracking-tight",
          nav: "flex items-center gap-2",
          nav_button: cn(
            buttonVariants({ variant: "ghost" }),
            "h-10 w-10 p-0 hover:bg-slate-50 rounded-full transition-colors"
          ),
          table: "w-full",
          head_row: "flex justify-between mb-2",
          head_cell: "text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em] w-10 h-10 flex items-center justify-center",
          row: "flex justify-between mt-1",
          cell: "h-10 w-10 p-0 relative flex items-center justify-center",
          day: cn(
            "h-10 w-10 p-0 text-sm font-light transition-all rounded-full flex items-center justify-center hover:bg-slate-50 cursor-pointer",
            "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ring-offset-white", // Focus ring
            "relative after:absolute after:inset-[-4px] after:border-2 after:border-primary/20 after:rounded-full after:opacity-0 focus:after:opacity-100" // Double ring effect
          ),
          day_selected: "bg-primary text-white hover:bg-primary/90 font-bold scale-105 shadow-lg joy-glow !opacity-100",
          day_today: "text-primary font-black after:absolute after:bottom-1 after:w-1 after:h-1 after:bg-primary after:rounded-full",
          day_outside: "text-slate-300 opacity-50",
          day_disabled: "text-slate-200 opacity-30 cursor-not-allowed",
          day_hidden: "invisible",
          ...classNames,
        }}
        components={{
          IconLeft: () => <ChevronLeft className="h-5 w-5 text-slate-400" />,
          IconRight: () => <ChevronRight className="h-5 w-5 text-slate-400" />,
        }}
        {...props}
      />

      {/* Quick Select Chips - Bottom Weighted for Mobile */}
      <div className="mt-8 flex flex-wrap gap-2 justify-center border-t border-slate-50 pt-8">
        <button 
          onClick={() => handleQuickSelect('today')}
          className="px-5 py-2.5 rounded-full bg-slate-50 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:bg-[#FACC15] hover:text-white transition-all active:scale-95 shadow-sm"
        >
          Today
        </button>
        <button 
          onClick={() => handleQuickSelect('yesterday')}
          className="px-5 py-2.5 rounded-full bg-slate-50 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:bg-[#FACC15] hover:text-white transition-all active:scale-95 shadow-sm"
        >
          Yesterday
        </button>
        <button 
          className="px-5 py-2.5 rounded-full bg-slate-50 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:bg-[#FACC15] hover:text-white transition-all active:scale-95 shadow-sm"
        >
          Last 7 Days
        </button>
      </div>
    </div>
  );
}
