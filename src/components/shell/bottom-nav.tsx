'use client';

import React from 'react';
import { Home, ShoppingCart, Package, BarChart2, User } from 'lucide-react';

const tabs = [
  { id: 'home',    label: 'Home',    Icon: Home },
  { id: 'benta',   label: 'Benta',   Icon: ShoppingCart },
  { id: 'stock',   label: 'Stock',   Icon: Package },
  { id: 'ulat',    label: 'Ulat',    Icon: BarChart2 },
  { id: 'profile', label: 'Profile', Icon: User },
] as const;

type TabId = typeof tabs[number]['id'];

interface BottomNavProps {
  activeTab?: TabId;
  onTabChange?: (tab: TabId) => void;
}

export function BottomNav({ activeTab = 'home', onTabChange }: BottomNavProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-slate-200/80"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-stretch h-14">
        {tabs.map(({ id, label, Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange?.(id)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 relative active:scale-95 transition-transform duration-100"
            >
              {/* Active indicator dot */}
              {isActive && (
                <span className="absolute top-1.5 left-1/2 -translate-x-1/2 h-1 w-5 rounded-full bg-primary" />
              )}
              <Icon
                className="h-5 w-5 transition-colors duration-150"
                strokeWidth={isActive ? 2.5 : 1.5}
                color={isActive ? '#06B6D4' : '#94A3B8'}
              />
              <span
                className="text-[9px] font-bold uppercase tracking-widest transition-colors duration-150"
                style={{ color: isActive ? '#06B6D4' : '#94A3B8' }}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
