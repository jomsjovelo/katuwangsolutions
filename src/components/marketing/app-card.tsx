'use client';

import React from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { LucideIcon, ChevronRight } from 'lucide-react';

export interface AppCardProps {
  name: string;
  tagline: string;
  category: string;
  icon: LucideIcon;
  imageSrc: string;
  accentColor: string;
  onSelect: () => void;
}

export function AppCard({ name, tagline, icon: Icon, imageSrc, accentColor, onSelect }: AppCardProps) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100 hover:shadow-lg transition-shadow duration-300 flex flex-col group">

      {/* Full-bleed image — taller on mobile for visual impact */}
      <div className="relative aspect-[3/2] w-full overflow-hidden bg-slate-100 flex-shrink-0">
        <Image
          src={imageSrc}
          alt={name}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/15 to-transparent pointer-events-none" />
      </div>

      {/* Card body — compact for mobile */}
      <div className="p-3.5 sm:p-4 flex flex-col gap-2 sm:gap-3 flex-1">

        {/* Icon inline before name */}
        <div className="flex items-center gap-2.5">
          <div
            className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
            style={{ backgroundColor: `${accentColor}18` }}
          >
            <Icon className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: accentColor }} strokeWidth={2} />
          </div>
          <h3 className="text-sm sm:text-base font-black text-slate-900 tracking-tight leading-tight">{name}</h3>
        </div>

        {/* Tagline */}
        <p className="text-xs sm:text-sm text-slate-500 italic leading-snug flex-1">
          "{tagline}"
        </p>

        {/* CTA — minimum 44px touch target on mobile */}
        <Button
          className="w-full h-10 sm:h-11 rounded-xl font-bold text-xs sm:text-sm text-white hover:-translate-y-0.5 transition-all active:scale-95 mt-1"
          style={{ backgroundColor: accentColor }}
          onClick={onSelect}
        >
          Subukan ang {name}
          <ChevronRight className="h-3.5 w-3.5 ml-1 opacity-80" />
        </Button>
      </div>
    </div>
  );
}
