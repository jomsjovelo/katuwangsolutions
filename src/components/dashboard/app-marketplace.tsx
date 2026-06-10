"use client";

import React, { useState } from 'react';
import { X, CheckCircle2, ChevronRight, Grid, CreditCard } from 'lucide-react';
import { useTenant } from '@/app/lib/tenant-context';
import { useTenantStore } from '@/store/use-tenant-store';
import { getModuleTheme } from '@/lib/theme-utils';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { useAppStoreConfig } from '@/hooks/use-app-store-config';

interface AppMarketplaceProps {
  isOpen: boolean;
  onClose: () => void;
}

const APPS = [
  { id: 'benta-snap', name: 'Benta Snap', category: 'Retail', desc: 'Retail POS & Sari-Sari Store checkout', price: 199 },
  { id: 'hiram-snap', name: 'Hiram Snap', category: 'Retail', desc: 'Micro-lending and 5-6 tracker', price: 149 },
  { id: 'fresh-tally', name: 'Fresh Tally', category: 'Retail', desc: 'Palengke and fresh goods inventory', price: 149 },
  { id: 'tindahan-flow', name: 'Tindahan Flow', category: 'Retail', desc: 'Wholesale and local warehouse monitor', price: 299 },
  
  { id: 'bite-snap', name: 'Bite Snap', category: 'Food', desc: 'Eatery POS with Kitchen Display (KDS)', price: 299 },
  { id: 'timpla-track', name: 'Timpla Track', category: 'Food', desc: 'Cafe operations and counter orders', price: 199 },
  { id: 'ganap-master', name: 'Ganap Master', category: 'Events', desc: 'Catering and bulk order management', price: 399 },
  
  { id: 'spin-snap', name: 'Spin Snap', category: 'Service', desc: 'Laundry shop washer/dryer tracking', price: 199 },
  { id: 'hydro-sync', name: 'Hydro Sync', category: 'Service', desc: 'Water station delivery queue management', price: 149 },
  { id: 'auto-boss', name: 'Auto Boss', category: 'Service', desc: 'Car wash slots and package detailing', price: 249 },
  { id: 'wellness-pro', name: 'Wellness Pro', category: 'Service', desc: 'Spa and wellness booking center', price: 199 },
  { id: 'trim-track', name: 'Trim Track', category: 'Service', desc: 'Salon and barbershop chair tracking', price: 149 },
  { id: 'rep-sync', name: 'Rep Sync', category: 'Service', desc: 'Gym membership and daily walk-ins', price: 299 },
  
  { id: 'ledger-flow', name: 'Ledger Flow', category: 'Corporate', desc: 'Simple, clear accounting and main cash', price: 299 },
  { id: 'sahod-flow', name: 'Sahod Flow', category: 'Corporate', desc: 'Automated staff payroll and timesheets', price: 249 },
  
  { id: 'biyahe-sync', name: 'Biyahe Sync', category: 'Logistics', desc: 'Trucking and delivery fee tracker', price: 349 },
  { id: 'sundo-sync', name: 'Sundo Sync', category: 'Logistics', desc: 'Tricycle / Transport terminal dispatcher', price: 199 },
  { id: 'build-stack', name: 'Build Stack', category: 'Construction', desc: 'Hardware and construction supplies', price: 299 },
  { id: 'ani-grow', name: 'Ani Grow', category: 'Agriculture', desc: 'Farm harvest and bodega crop tracking', price: 199 },
  
  { id: 'rental', name: 'Rental', category: 'Service', desc: 'Equipment and vehicle rentals', price: 249 },
];

export function AppMarketplace({ isOpen, onClose }: AppMarketplaceProps) {
  const { currentTenant } = useTenant();
  const db = useFirestore();
  const { toast } = useToast();
  
  const { switchActiveModule, unlockModule } = useTenantStore();
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const { getAppPrice } = useAppStoreConfig();

  if (!isOpen || !currentTenant) return null;

  const baseTheme = getModuleTheme(currentTenant.moduleType);
  const unlocked = currentTenant.unlockedModules || [];
  
  // Is the specific app already available for the user?
  const isUnlocked = (appId: string) => appId === currentTenant.moduleType || unlocked.includes(appId);

  const handleSimulatePayment = async (appId: string) => {
    // 2C: Prevent double-processing if already in a payment flow
    if (isProcessing !== null) return;
    setIsProcessing(appId);
    try {
      // Update remote Firestore
      const tenantRef = doc(db, 'tenants', currentTenant.id);
      await updateDoc(tenantRef, {
        unlockedModules: arrayUnion(appId)
      });
      
      // Update local Zustand state
      unlockModule(currentTenant.id, appId);
      
      toast({
        title: "App Unlocked! 🎉",
        description: `You can now access the newly purchased module.`,
      });
      
      // Switch to the newly bought app automatically
      switchActiveModule(appId);
      onClose();
    } catch (e) {
      console.error(e);
      toast({
        title: "Transaction Failed",
        description: "Unable to process simulated payment.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(null);
    }
  };

  const handleOpenApp = (appId: string) => {
    switchActiveModule(appId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="absolute inset-0" onClick={onClose} />
      
      <div 
        className="relative bg-white border-t border-slate-100 rounded-t-[32px] p-6 pb-nav shadow-2xl w-full max-w-md h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-300"
      >
        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto -mt-2 mb-4 shrink-0" onClick={onClose} />
        
        <div className="flex items-start justify-between gap-4 mb-4 shrink-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                <Grid className="h-5 w-5" />
              </span>
              <h2 className="font-headline font-black text-slate-800 text-2xl uppercase tracking-tight">
                App Store
              </h2>
            </div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
              Upgrade Your Business Ecosystem
            </p>
          </div>
          
          <button 
            onClick={onClose}
            className="h-8 w-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 active:scale-90 transition-transform shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable App List */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 pr-1 pb-10">
          {APPS.map((app) => {
            const hasApp = isUnlocked(app.id);
            const appTheme = getModuleTheme(app.id);
            
            return (
              <div 
                key={app.id} 
                className="p-4 rounded-2xl border border-slate-100 bg-white shadow-sm flex flex-col gap-3"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full text-slate-500 bg-slate-100">
                      {app.category}
                    </span>
                    <h3 className="font-headline font-black text-slate-800 text-sm mt-1.5">{app.name}</h3>
                    <p className="text-xs text-slate-500 font-medium leading-snug max-w-[200px] mt-0.5">
                      {app.desc}
                    </p>
                  </div>
                  <div className="text-right">
                    {(() => {
                      const pricing = getAppPrice(app.id, app.price);
                      return (
                        <>
                          {pricing.isPromo && (
                            <div className="text-[10px] font-bold text-red-500 mb-0.5 animate-pulse uppercase tracking-widest">
                              Promo Sale!
                            </div>
                          )}
                          <div className="font-black text-slate-800 tracking-tight flex items-center justify-end gap-1">
                            {pricing.isPromo && (
                              <span className="text-slate-300 line-through text-[10px]">₱{pricing.originalPrice}</span>
                            )}
                            <span>₱{pricing.price}<span className="text-[8px] text-slate-400 font-bold">/mo</span></span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {hasApp ? (
                  <Button 
                    variant="outline"
                    className="w-full rounded-xl h-10 font-bold border-slate-200 text-slate-600 hover:bg-slate-50"
                    onClick={() => handleOpenApp(app.id)}
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mr-2" />
                    Open App
                  </Button>
                ) : (
                  <Button 
                    className="w-full rounded-xl h-10 font-bold text-white shadow-md transition-transform active:scale-[0.98]"
                    style={{ backgroundColor: appTheme.primary }}
                    disabled={isProcessing === app.id}
                    onClick={() => handleSimulatePayment(app.id)}
                  >
                    {isProcessing === app.id ? (
                      <span className="animate-pulse">Processing Payment...</span>
                    ) : (
                      <>
                        <CreditCard className="h-4 w-4 mr-2 opacity-80" />
                        Avail Now
                        <ChevronRight className="h-4 w-4 ml-1 opacity-50" />
                      </>
                    )}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        
      </div>
    </div>
  );
}
