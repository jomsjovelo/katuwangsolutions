'use client';

import React from 'react';
import { Home, ShoppingCart, Package, BarChart2, User, Banknote, Wallet, Users, Bed, PiggyBank, Target, Receipt } from 'lucide-react';
import { useTenant } from '@/app/lib/tenant-context';
import { getModuleTheme } from '@/lib/theme-utils';
import { useHaptic } from '@/hooks/use-haptic';
import { useInventory } from '@/hooks/use-inventory';

type TabId = 'home' | 'benta' | 'stock' | 'ulat' | 'kita' | 'profile';


interface BottomNavProps {
  activeTab?: TabId;
  onTabChange?: (tab: TabId) => void;
}

const NavItem = React.memo(({ 
  id, label, Icon, isActive, themePrimary, hasOutStock, hasLowStock, haptic, onTabChange 
}: {
  id: TabId, label: string, Icon: any, isActive: boolean, themePrimary: string, 
  hasOutStock: boolean, hasLowStock: boolean, haptic: any, onTabChange?: (tab: TabId) => void
}) => {
  return (
    <button
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
          style={{ backgroundColor: themePrimary }}
        />
      )}
      
      <div className="relative">
        <Icon
          className="h-5 w-5 transition-colors duration-300"
          strokeWidth={isActive ? 2.5 : 1.5}
          color={isActive ? themePrimary : '#94A3B8'}
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
        style={{ color: isActive ? themePrimary : '#94A3B8' }}
      >
        {label}
      </span>
    </button>
  );
});

export function BottomNav({ activeTab = 'home', onTabChange }: BottomNavProps) {
  const { currentTenant } = useTenant();
  const theme = getModuleTheme(currentTenant?.moduleType);
  const haptic = useHaptic();
  
  // Use inventory hook to get low stock alerts (only returns items if tenant has products)
  const { lowStockItems, outOfStockItems } = useInventory();
  const hasOutStock = outOfStockItems?.length > 0;
  const hasLowStock = lowStockItems?.length > 0;

  const isLending = currentTenant?.moduleType === '5-6-tracker';
  const isHospitality = currentTenant?.moduleType === 'tsek-in';
  const isBudgeting = currentTenant?.moduleType === 'budget-mo';
  
  const getBentaLabel = () => {
    if (isLending) return 'Ledger';
    if (isHospitality) return 'Guests';
    if (isBudgeting) return 'Logs';
    return 'Sale';
  };

  const getBentaIcon = () => {
    if (isLending) return Wallet;
    if (isHospitality) return Users;
    if (isBudgeting) return Receipt;
    return ShoppingCart;
  };

  const tabs = [
    { id: 'home',    label: isBudgeting ? 'Dashboard' : 'Home',    Icon: Home },
    ...(isHospitality || isBudgeting ? [] : [{ id: 'benta',   label: getBentaLabel(),   Icon: getBentaIcon() }]),
    ...(isHospitality ? [{ id: 'rooms', label: 'Rooms', Icon: Bed }] : []),
    ...(isLending ? [] : [{ id: 'stock',   label: isBudgeting ? 'Savings' : 'Stock',   Icon: isBudgeting ? PiggyBank : Package }]),
    { id: 'ulat',    label: isBudgeting ? 'Insights' : 'Report',    Icon: isBudgeting ? Target : BarChart2 },
    ...(isHospitality ? [] : [{ id: 'kita',    label: 'Kita Ko', Icon: Banknote }]),
    { id: 'profile', label: 'Profile', Icon: User },
  ] as const;

  return (
    <nav
      className="fixed bottom-0 w-full z-50 bg-white/95 backdrop-blur-xl border-t border-slate-200/80"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-stretch h-14">
        {tabs.map(({ id, label, Icon }) => {
          const isActive = activeTab === id;
          return (
            <NavItem
              key={id}
              id={id as TabId}
              label={label}
              Icon={Icon}
              isActive={isActive}
              themePrimary={theme.primary}
              hasOutStock={hasOutStock}
              hasLowStock={hasLowStock}
              haptic={haptic}
              onTabChange={onTabChange}
            />
          );
        })}
      </div>
    </nav>
  );
}
