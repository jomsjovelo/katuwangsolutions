import React from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { LucideIcon, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AppCardProps {
  name: string;
  tagline: string;
  category: string;
  icon: LucideIcon;
  imageSrc: string;
  onSelect: () => void;
  reverse?: boolean;
}

export function AppCard({ name, tagline, category, icon: Icon, imageSrc, onSelect, reverse }: AppCardProps) {
  return (
    <div className={cn(
      "flex flex-col md:flex-row items-center gap-8 md:gap-16 py-12 md:py-20 border-b border-border/10 last:border-0",
      reverse && "md:flex-row-reverse"
    )}>
      
      {/* Image Side */}
      <div className="w-full md:w-1/2">
        <div className="relative aspect-[4/3] w-full rounded-[32px] overflow-hidden shadow-2xl bg-slate-100 border-4 border-white group">
          <Image
            src={imageSrc}
            alt={name}
            fill
            className="object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent pointer-events-none" />
          <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between">
            <div className="p-3 bg-white/20 backdrop-blur-md rounded-2xl border border-white/30 shadow-xl">
               <Icon className="h-7 w-7 text-white" strokeWidth={2} />
            </div>
            <div className="bg-primary text-white text-[10px] font-black px-4 py-2 rounded-full uppercase tracking-widest shadow-lg">
              {category}
            </div>
          </div>
        </div>
      </div>

      {/* Content Side */}
      <div className="w-full md:w-1/2 space-y-6 text-center md:text-left px-4 md:px-0">
        <div className="space-y-3">
          <h2 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight">
            {name}
          </h2>
          <p className="text-lg md:text-xl text-slate-600 font-medium leading-relaxed italic">
            "{tagline}"
          </p>
        </div>
        
        <p className="text-sm text-slate-500 leading-relaxed max-w-md mx-auto md:mx-0">
          Dinisenyo para sa mabilis na operasyon ng iyong negosyo. Madaling gamitin, kahit sa mobile phone o tablet. Walang hassle, direkta sa point.
        </p>

        <div className="pt-4">
          <Button 
            className="h-14 px-8 rounded-2xl font-bold bg-slate-900 text-white hover:bg-slate-800 hover:-translate-y-0.5 transition-all active:scale-95 shadow-xl flex items-center gap-2 mx-auto md:mx-0"
            onClick={onSelect}
          >
            Subukan ang {name}
            <ChevronRight className="h-4 w-4 opacity-70" />
          </Button>
        </div>
      </div>

    </div>
  );
}
