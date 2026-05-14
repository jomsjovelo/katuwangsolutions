'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { LucideIcon, ChevronRight } from 'lucide-react';

interface AppModule {
  name: string;
  icon: LucideIcon;
  tagline: string;
  imageSrc: string;
}

interface AppGroup {
  id: string;
  label: string;
  accentColor: string;
  apps: AppModule[];
}

interface AppSuiteCarouselProps {
  groups: AppGroup[];
  onSelect: () => void;
}

export function AppSuiteCarousel({ groups, onSelect }: AppSuiteCarouselProps) {
  const [activeGroupId, setActiveGroupId] = useState(groups[0].id);

  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? groups[0];

  return (
    <section id="products" className="py-10 bg-slate-50">
      {/* Section heading */}
      <div className="px-5 mb-5">
        <h2 className="text-xl font-black text-slate-900 tracking-tight">Katuwang App Suite</h2>
        <p className="text-xs text-slate-500 font-semibold uppercase tracking-widest mt-0.5">15 Industry Specific Modules</p>
      </div>

      {/* Group tab pills — horizontally scrollable */}
      <div className="flex gap-2 px-5 overflow-x-auto no-scrollbar pb-1 mb-5">
        {groups.map((group) => (
          <button
            key={group.id}
            onClick={() => setActiveGroupId(group.id)}
            className="flex-shrink-0 h-9 px-4 rounded-full text-xs font-bold tracking-wide uppercase transition-all active:scale-95"
            style={
              activeGroupId === group.id
                ? { backgroundColor: group.accentColor, color: '#fff' }
                : { backgroundColor: '#F1F5F9', color: '#64748B' }
            }
          >
            {group.label}
          </button>
        ))}
      </div>

      {/* Card carousel — horizontal swipe with peek */}
      <div className="flex gap-3 px-5 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-3">
        {activeGroup.apps.map((app) => {
          const Icon = app.icon;
          return (
            <div
              key={app.name}
              className="snap-start flex-shrink-0 w-[72vw] sm:w-[44vw] md:w-[28vw] bg-white rounded-2xl overflow-hidden shadow-md border border-slate-100"
            >
              {/* Photo */}
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
                <Image
                  src={app.imageSrc}
                  alt={app.name}
                  fill
                  className="object-cover"
                  sizes="72vw"
                />
              </div>

              {/* Card body */}
              <div className="p-4 space-y-2.5">
                {/* Icon + name */}
                <div className="flex items-center gap-2.5">
                  <div
                    className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${activeGroup.accentColor}18` }}
                  >
                    <Icon className="h-4.5 w-4.5" style={{ color: activeGroup.accentColor }} strokeWidth={2} />
                  </div>
                  <span className="text-sm font-black text-slate-900 leading-tight">{app.name}</span>
                </div>

                {/* Tagline */}
                <p className="text-xs text-slate-500 italic leading-snug">"{app.tagline}"</p>

                {/* CTA */}
                <Button
                  className="w-full h-11 rounded-xl font-bold text-xs text-white active:scale-95 transition-transform"
                  style={{ backgroundColor: activeGroup.accentColor }}
                  onClick={onSelect}
                >
                  Subukan ang {app.name}
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>
          );
        })}

        {/* Trailing space to show peek of scroll end */}
        <div className="flex-shrink-0 w-2" />
      </div>

      {/* Dot count indicator */}
      <div className="flex items-center justify-center gap-1.5 mt-3 px-5">
        {activeGroup.apps.map((_, i) => (
          <div
            key={i}
            className="h-1.5 rounded-full transition-all"
            style={{ width: i === 0 ? '16px' : '6px', backgroundColor: i === 0 ? activeGroup.accentColor : '#CBD5E1' }}
          />
        ))}
      </div>
    </section>
  );
}
