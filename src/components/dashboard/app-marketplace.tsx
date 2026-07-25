"use client";

import React, { useState } from 'react';
import { X, CheckCircle2, ChevronRight, Grid, CreditCard, Copy, Check } from 'lucide-react';
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
  { id: 'fresh-tally', name: 'Fresh Tally', category: 'Retail', desc: 'Palengke and fresh goods inventory', price: 149 },
  { id: 'build-stack', name: 'Build Stack', category: 'Retail', desc: 'Hardware and construction supplies', price: 299 },
  { id: '5-6-tracker', name: '5-6 Tracker', category: 'Finance', desc: 'Micro-lending and collection tracker', price: 149 },
  
  { id: 'ledger-flow', name: 'Ledger Flow', category: 'Corporate', desc: 'Simple, clear accounting and main cash', price: 299 },
  { id: 'sahod-flow', name: 'Sahod Flow', category: 'Corporate', desc: 'Automated staff payroll and timesheets', price: 249 },
  
  { id: 'biyahe-sync', name: 'Biyahe Sync', category: 'Trucking', desc: 'Trucking service and hauling fee tracker', price: 349 },

  { id: 'bite-snap', name: 'Bite Snap', category: 'Food', desc: 'Eatery POS with Kitchen Display (KDS)', price: 299 },
  { id: 'timpla-track', name: 'Timpla Track', category: 'Food', desc: 'Cafe operations and counter orders', price: 199 },
  { id: 'ganap-master', name: 'Ganap Master', category: 'Events', desc: 'Catering and bulk order management', price: 399 },
  
  { id: 'spin-snap', name: 'Spin Snap', category: 'Service', desc: 'Laundry shop washer/dryer tracking', price: 199 },
  { id: 'hydro-sync', name: 'Hydro Sync', category: 'Service', desc: 'Water station delivery queue management', price: 149 },
  { id: 'auto-boss', name: 'Auto Boss', category: 'Service', desc: 'Car wash slots and package detailing', price: 249 },
  { id: 'wellness-pro', name: 'Wellness', category: 'Service', desc: 'Spa and wellness booking center', price: 199 },
  { id: 'trim-track', name: 'Trim Track', category: 'Service', desc: 'Salon and barbershop chair tracking', price: 149 },
  { id: 'rep-sync', name: 'Rep Sync', category: 'Service', desc: 'Gym membership and daily walk-ins', price: 299 },
  { id: 'service-master', name: 'Service Master', category: 'Service', desc: 'General repair and handyman tracking', price: 199 },
  
  { id: 'rental', name: 'Rental', category: 'Service', desc: 'Equipment and vehicle rentals', price: 249 },
];

export function AppMarketplace({ isOpen, onClose }: AppMarketplaceProps) {
  const { currentTenant } = useTenant();
  const db = useFirestore();
  const { toast } = useToast();
  
  const switchActiveModule = useTenantStore(state => state.switchActiveModule);
  const unlockModule = useTenantStore(state => state.unlockModule);
  const [checkoutApp, setCheckoutApp] = useState<{id: string, name: string, price: number} | null>(null);
  const { getAppPrice } = useAppStoreConfig();
  const [copiedNumber, setCopiedNumber] = useState<string | null>(null);
  const [submittingPayment, setSubmittingPayment] = useState(false);

  const PAYMENT_NUMBER = '09951665423';
  const PAYMENT_NUMBER_DISPLAY = '0995 166 5423';

  const copyPaymentNumber = (type: string) => {
    navigator.clipboard.writeText(PAYMENT_NUMBER).catch(() => {});
    setCopiedNumber(type);
    setTimeout(() => setCopiedNumber(null), 2500);
  };

  const handlePaymentSent = async () => {
    if (!currentTenant || !checkoutApp) return;
    setSubmittingPayment(true);
    try {
      const tenantRef = doc(db, 'tenants', currentTenant.id);
      await updateDoc(tenantRef, {
        subscriptionStatus: 'pending',
        lastPaymentRequestedModule: checkoutApp.id,
        updatedAt: new Date()
      });
      toast({
        title: "Payment Request Sent! 🎉",
        description: "Admin has been notified. Your module will be activated as soon as payment is verified.",
      });
      setCheckoutApp(null);
      onClose();
    } catch (e: any) {
      toast({
        title: "Submission Error",
        description: e.message || "Failed to notify admin. Please message us on Messenger.",
        variant: "destructive"
      });
    } finally {
      setSubmittingPayment(false);
    }
  };

  if (!isOpen || !currentTenant) return null;

  const baseTheme = getModuleTheme(currentTenant.moduleType);
  const unlocked = currentTenant.unlockedModules || [];
  
  // Is the specific app already available for the user?
  const isUnlocked = (appId: string) => appId === currentTenant.moduleType || unlocked.includes(appId);

  const handleSimulatePayment = (appId: string, appName: string, price: number) => {
    setCheckoutApp({ id: appId, name: appName, price });
  };

  const handleOpenApp = (appId: string) => {
    switchActiveModule(appId);
    onClose();
  };

  const getMessengerUrl = (appId: string, appName: string, price: number) => {
    const text = [
      'Bayad ko na po para sa bagong module!',
      '',
      `Email: ${currentTenant.ownerEmail || ''}`,
      `Negosyo: ${currentTenant.name || ''}`,
      `Module ID: ${appId}`,
      `Module Name: ${appName}`,
      `Halaga: ₱${price}`,
      '',
      '(Screenshot attached below 👇)'
    ].join('\n');

    return `https://m.me/katuwangsolutions?text=${encodeURIComponent(text)}`;
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

        {/* Urgency Banner */}
        <div className="bg-gradient-to-r from-red-500 to-rose-600 p-3 rounded-xl mb-4 shrink-0 shadow-md animate-in slide-in-from-top-2">
          <div className="flex items-start gap-2">
            <span className="text-xl">🔥</span>
            <div>
              <p className="text-white text-xs font-black uppercase tracking-widest mb-0.5">Early Adopter Promo!</p>
              <p className="text-red-100 text-[10px] font-medium leading-snug">
                Get Budget Mo for ₱50/mo, and other modules for just ₱99/mo instead of ₱199.
              </p>
            </div>
          </div>
        </div>

        {checkoutApp ? (
          <div className="flex-1 flex flex-col items-center justify-start overflow-y-auto p-4 space-y-5 animate-in slide-in-from-right-4">
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-2">
                <CreditCard className="h-6 w-6" />
              </div>
              <h3 className="font-black text-xl text-slate-800 uppercase tracking-tight">Unlock {checkoutApp.name}</h3>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Magbayad lamang ng <strong className="text-emerald-600 text-sm font-black">₱{checkoutApp.price}/mo</strong> via GCash o Maya.
              </p>
            </div>

            {/* Payment Number Cards */}
            <div className="w-full space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-left">Official Payment Account</p>
              <div className="grid grid-cols-2 gap-2.5">
                {/* GCash */}
                <div className="bg-blue-50/80 border border-blue-100 p-3 rounded-2xl flex flex-col items-center text-center">
                  <span className="text-[10px] font-black text-[#007DFE] uppercase tracking-wider mb-1">GCash</span>
                  <p className="text-sm font-black text-slate-800 tracking-wider mb-2 tabular-nums">{PAYMENT_NUMBER_DISPLAY}</p>
                  <Button
                    size="sm"
                    className="w-full h-8 text-[11px] font-bold bg-[#007DFE] hover:bg-blue-700 text-white rounded-xl"
                    onClick={() => copyPaymentNumber('gcash')}
                  >
                    {copiedNumber === 'gcash' ? (
                      <><Check className="h-3 w-3 mr-1" /> Copied!</>
                    ) : (
                      <><Copy className="h-3 w-3 mr-1" /> Copy Number</>
                    )}
                  </Button>
                </div>

                {/* Maya */}
                <div className="bg-emerald-50/80 border border-emerald-100 p-3 rounded-2xl flex flex-col items-center text-center">
                  <span className="text-[10px] font-black text-[#00A14B] uppercase tracking-wider mb-1">Maya</span>
                  <p className="text-sm font-black text-slate-800 tracking-wider mb-2 tabular-nums">{PAYMENT_NUMBER_DISPLAY}</p>
                  <Button
                    size="sm"
                    className="w-full h-8 text-[11px] font-bold bg-[#00A14B] hover:bg-emerald-700 text-white rounded-xl"
                    onClick={() => copyPaymentNumber('maya')}
                  >
                    {copiedNumber === 'maya' ? (
                      <><Check className="h-3 w-3 mr-1" /> Copied!</>
                    ) : (
                      <><Copy className="h-3 w-3 mr-1" /> Copy Number</>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* Clear Steps */}
            <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl w-full space-y-2 text-left">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Mga Hakbang sa Pagbayad</p>
              <div className="space-y-2 text-xs font-medium text-slate-600">
                <div className="flex gap-2 items-start">
                  <span className="font-black text-indigo-600">1.</span>
                  <span>Mag-send ng <strong>₱{checkoutApp.price}</strong> sa GCash/Maya number sa itaas.</span>
                </div>
                <div className="flex gap-2 items-start">
                  <span className="font-black text-indigo-600">2.</span>
                  <span>Kunan ng <strong>Screenshot</strong> ang resibo ng GCash/Maya.</span>
                </div>
                <div className="flex gap-2 items-start">
                  <span className="font-black text-indigo-600">3.</span>
                  <span>I-click ang button sa ibaba para ma-isend ang screenshot sa Messenger.</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="w-full space-y-2 pt-2">
              <Button 
                className="w-full rounded-2xl h-12 font-bold text-white shadow-lg active:scale-95 transition-transform bg-[#0099FF] hover:bg-blue-600"
                onClick={() => {
                  window.open(getMessengerUrl(checkoutApp.id, checkoutApp.name, checkoutApp.price), '_blank');
                }}
              >
                Send Screenshot on Messenger 💬
              </Button>

              <Button 
                variant="outline"
                className="w-full rounded-2xl h-11 font-bold text-slate-700 border-slate-200"
                disabled={submittingPayment}
                onClick={handlePaymentSent}
              >
                {submittingPayment ? "Notifying Admin..." : "I've Sent My Payment → Notify Admin"}
              </Button>

              <Button 
                variant="ghost" 
                className="w-full rounded-xl h-9 text-xs font-bold text-slate-400 hover:text-slate-600"
                onClick={() => setCheckoutApp(null)}
              >
                Go Back
              </Button>
            </div>
          </div>
        ) : (
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
                              <div className="text-[9px] font-black text-white bg-red-500 px-2 py-0.5 rounded-md mb-1 inline-block uppercase tracking-widest shadow-sm">
                                SAVE ₱{pricing.originalPrice - pricing.price}/mo
                              </div>
                            )}
                            <div className="font-black text-slate-800 tracking-tight flex items-center justify-end gap-1.5">
                              {pricing.isPromo && (
                                <span className="text-slate-400 line-through text-[11px] font-bold">₱{pricing.originalPrice}</span>
                              )}
                              <span className="text-emerald-600">₱{pricing.price}<span className="text-[9px] text-slate-400 font-bold ml-0.5">/mo</span></span>
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
                      onClick={() => {
                        const pricing = getAppPrice(app.id, app.price);
                        handleSimulatePayment(app.id, app.name, pricing.price);
                      }}
                    >
                      <CreditCard className="h-4 w-4 mr-2 opacity-80" />
                      Avail Now
                      <ChevronRight className="h-4 w-4 ml-1 opacity-50" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        
      </div>
    </div>
  );
}
