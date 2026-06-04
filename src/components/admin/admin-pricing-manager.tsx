import React, { useState } from 'react';
import { useAppStoreConfig } from '@/hooks/use-app-store-config';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { Tag, Save, Percent, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function AdminPricingManager() {
  const db = useFirestore();
  const { config, loading } = useAppStoreConfig();
  const { toast } = useToast();
  
  const [basePrice, setBasePrice] = useState(config.defaultAppPrice.toString());
  const [promoAppId, setPromoAppId] = useState('');
  const [promoPrice, setPromoPrice] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Sync state when config loads
  React.useEffect(() => {
    if (!loading) {
      setBasePrice(config.defaultAppPrice.toString());
    }
  }, [config.defaultAppPrice, loading]);

  const handleSaveBasePrice = async () => {
    setIsSaving(true);
    try {
      const docRef = doc(db, 'system', 'appStoreConfig');
      await setDoc(docRef, { defaultAppPrice: Number(basePrice) }, { merge: true });
      toast({ title: 'Success', description: 'Base price updated to ₱' + basePrice });
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to update base price', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleApplyPromo = async () => {
    if (!promoAppId || !promoPrice) return;
    setIsSaving(true);
    try {
      const docRef = doc(db, 'system', 'appStoreConfig');
      await setDoc(docRef, {
        promotions: {
          ...config.promotions,
          [promoAppId]: Number(promoPrice)
        }
      }, { merge: true });
      
      toast({ title: 'Promo Applied', description: `${promoAppId} is now ₱${promoPrice}` });
      setPromoAppId('');
      setPromoPrice('');
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to apply promo', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearPromos = async () => {
    setIsSaving(true);
    try {
      const docRef = doc(db, 'system', 'appStoreConfig');
      await updateDoc(docRef, { promotions: {} });
      toast({ title: 'Promos Cleared', description: 'All active promotions removed' });
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to clear promos', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <div className="h-10 w-10 bg-indigo-500/10 text-indigo-600 rounded-xl flex items-center justify-center">
          <Tag className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-headline font-black text-slate-800 text-lg uppercase tracking-tight">
            Dynamic Pricing Engine
          </h2>
          <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
            Control App Store Rates Live
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Base Price Config */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
          <label className="text-xs font-black uppercase tracking-widest text-slate-500 block mb-2">Global Base Price</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black">₱</span>
              <input 
                type="number"
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                className="w-full pl-8 pr-4 h-10 rounded-lg border-slate-200 text-sm font-bold"
              />
            </div>
            <button 
              onClick={handleSaveBasePrice}
              disabled={isSaving}
              className="px-4 h-10 bg-slate-900 text-white rounded-lg text-xs font-bold active:scale-95 transition-transform disabled:opacity-50 flex items-center gap-2"
            >
              <Save className="h-4 w-4" /> Save
            </button>
          </div>
        </div>

        {/* Promo Config */}
        <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
          <label className="text-xs font-black uppercase tracking-widest text-orange-600 block mb-2">Run App Promotion</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input 
              type="text"
              placeholder="App ID (e.g., benta-snap)"
              value={promoAppId}
              onChange={(e) => setPromoAppId(e.target.value)}
              className="flex-1 h-10 rounded-lg border-orange-200 text-sm font-bold bg-white px-3"
            />
            <div className="relative w-full sm:w-32">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-400 font-black">₱</span>
              <input 
                type="number"
                placeholder="Promo"
                value={promoPrice}
                onChange={(e) => setPromoPrice(e.target.value)}
                className="w-full pl-8 pr-4 h-10 rounded-lg border-orange-200 text-sm font-bold bg-white"
              />
            </div>
            <button 
              onClick={handleApplyPromo}
              disabled={isSaving || !promoAppId || !promoPrice}
              className="px-4 h-10 bg-orange-600 text-white rounded-lg text-xs font-bold active:scale-95 transition-transform disabled:opacity-50 flex items-center gap-2 justify-center"
            >
              <Percent className="h-4 w-4" /> Apply
            </button>
          </div>
        </div>

        {/* Active Promos List */}
        {Object.keys(config.promotions).length > 0 && (
          <div className="pt-2">
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Active Promos</h4>
              <button 
                onClick={handleClearPromos}
                className="text-[10px] text-red-500 font-bold uppercase hover:underline flex items-center gap-1"
              >
                <RefreshCw className="h-3 w-3" /> Clear All
              </button>
            </div>
            <div className="space-y-2">
              {Object.entries(config.promotions).map(([appId, price]) => (
                <div key={appId} className="flex justify-between items-center p-3 bg-red-50 text-red-700 rounded-lg border border-red-100">
                  <span className="text-xs font-bold">{appId}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs line-through opacity-50">₱{config.defaultAppPrice}</span>
                    <span className="text-sm font-black">₱{price}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
