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
    <div className="bg-white rounded-3xl overflow-hidden shadow-md border border-slate-100 hover:shadow-xl transition-shadow duration-300 flex flex-col group">

      {/* Full-bleed Image — clean, no overlapping elements */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100 flex-shrink-0">
        <Image
          src={imageSrc}
          alt={name}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {/* Only a subtle bottom fade — no icon overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
      </div>

      {/* Card Body */}
      <div className="p-5 flex flex-col gap-3 flex-1">

        {/* Icon + App Name inline */}
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm"
            style={{ backgroundColor: `${accentColor}18` }}
          >
            <Icon className="h-5 w-5" style={{ color: accentColor }} strokeWidth={2} />
          </div>
          <h3 className="text-lg font-black text-slate-900 tracking-tight leading-tight">{name}</h3>
        </div>

        {/* Tagline */}
        <p className="text-sm text-slate-500 italic leading-snug flex-1">
          "{tagline}"
        </p>

        {/* CTA */}
        <Button
          className="w-full h-11 rounded-2xl font-bold text-sm text-white hover:-translate-y-0.5 transition-all active:scale-95 shadow-md mt-1"
          style={{ backgroundColor: accentColor }}
          onClick={onSelect}
        >
          Subukan ang {name}
          <ChevronRight className="h-4 w-4 ml-1 opacity-80" />
        </Button>
      </div>
    </div>
  );
}
