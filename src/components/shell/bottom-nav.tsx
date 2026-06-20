'use client';

import React from 'react';
import { Home, ShoppingCart, Package, BarChart2, User, Banknote } from 'lucide-react';
import { useTenant } from '@/app/lib/tenant-context';
import { getModuleTheme } from '@/lib/theme-utils';
import { useHaptic } from '@/hooks/use-haptic';
import { useInventory } from '@/hooks/use-inventory';

const tabs = [
  { id: 'home',    label: 'Home',    Icon: Home },
  { id: 'benta',   label: 'Sale',   Icon: ShoppingCart },
  { id: 'stock',   label: 'Stock',   Icon: Package },
  { id: 'ulat',    label: 'Report',    Icon: BarChart2 },
  { id: 'kita',    label: 'Kita Ko', Icon: Banknote },
  { id: 'profile', label: 'Profile', Icon: User },
] as const;

type TabId = typeof tabs[number]['id'];

interface BottomNavProps {
  activeTab?: TabId;
  onTabChange?: (tab: TabId) => void;
}

export function BottomNav({ activeTab = 'home', onTabChange }: BottomNavProps) {
  const { currentTenant } = useTenant();
  const theme = getModuleTheme(currentTenant?.moduleType);
  const haptic = useHaptic();
  
  // Use inventory hook to get low stock alerts (only returns items if tenant has products)
  const { lowStockItems, outOfStockItems } = useInventory();
  const hasOutStock = outOfStockItems?.length > 0;
  const hasLowStock = lowStockItems?.length > 0;

  return (
    <nav
      className="fixed bottom-0 w-full z-50 bg-white/95 backdrop-blur-xl border-t border-slate-200/80"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-stretch h-14">
        {tabs.map(({ id, label, Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => {
                haptic(10);
                onTabChange?.(id);
              }}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 relative active:scale-95 transition-transform duration-100"
            >
              {/* Active indicator dot dynamically colored matching current tenant theme */}
              {isActive && (
                <span 
                  className="absolute top-1.5 left-1/2 -translate-x-1/2 h-1 w-5 rounded-full transition-colors duration-300" 
                  style={{ backgroundColor: theme.primary }}
                />
              )}
              
              <div className="relative">
                <Icon
                  className="h-5 w-5 transition-colors duration-300"
                  strokeWidth={isActive ? 2.5 : 1.5}
                  color={isActive ? theme.primary : '#94A3B8'}
                />
                {/* Low Stock / Out of Stock Notification Dot on the Stock Tab */}
                {id === 'stock' && (hasOutStock || hasLowStock) && (
                  <span 
                    className={`absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-white ${hasOutStock ? 'bg-red-500 animate-pulse' : 'bg-amber-500'}`}
                  />
                )}
              </div>
              
              <span
                className="text-[9px] font-bold uppercase tracking-widest transition-colors duration-300"
                style={{ color: isActive ? theme.primary : '#94A3B8' }}
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
