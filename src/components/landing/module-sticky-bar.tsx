"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ModuleStickyBarProps {
  moduleId: string;
  moduleName: string;
  priceText: string;
  accentColor?: string;
}

export function ModuleStickyBar({ moduleId, moduleName, priceText, accentColor = '#06B6D4' }: ModuleStickyBarProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 p-3 sm:p-4 shadow-2xl transition-all duration-300 animate-in slide-in-from-bottom-5">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-white font-black text-sm tracking-tight flex items-center gap-1.5">
            {moduleName}
            <span className="bg-amber-500 text-slate-950 text-[9px] font-black uppercase px-1.5 py-0.5 rounded">
              PROMO
            </span>
          </span>
          <span className="text-slate-400 text-xs font-bold flex items-center gap-1">
            <span className="text-emerald-400 font-black text-sm">{priceText}</span>
            <span className="text-[10px]">· ₱0 setup fee</span>
          </span>
        </div>

        <Link href={`/${moduleId}/onboarding`} className="shrink-0">
          <Button
            size="sm"
            className="h-11 px-5 text-xs font-black text-white shadow-lg rounded-xl flex items-center gap-1.5 active:scale-95 transition-all"
            style={{ backgroundColor: accentColor }}
          >
            <span>Subukan Na</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default ModuleStickyBar;
