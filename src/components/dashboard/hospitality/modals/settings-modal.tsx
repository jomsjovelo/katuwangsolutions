import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { PosCurrencyInput } from '@/components/ui/pos-currency-input';
import type { RoomData } from '@/firebase/firestore/tsek-in-actions';
import { useToast } from '@/hooks/use-toast';
import { generateIdempotencyKey, submitTsekInAdminMutation, TsekInClientError, type ShortTimeRates } from '@/lib/client/tsek-in-client';
import { resolveTsekInAdminIntent, type TsekInAdminIntent } from '@/lib/client/tsek-in-admin-intent';

interface SettingsModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  currentTenant: any;
  setCurrentTenant: (tenant: any) => void;
  rooms: RoomData[];
  theme: { primary: string };
}

export function SettingsModal({
  isOpen,
  onOpenChange,
  currentTenant,
  setCurrentTenant,
  rooms,
  theme
}: SettingsModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inFlightRef = useRef(false);
  const ratesIntentRef = useRef<TsekInAdminIntent | null>(null);
  const settingsIntentRef = useRef<TsekInAdminIntent | null>(null);
  const [settingsTab, setSettingsTab] = useState<'rates'|'global'>('rates');

  // Rates Form State
  const [rateForm, setRateForm] = useState<{ 
    category: string, 
    rate: string,
    rate3h: string,
    rate6h: string,
    rate8h: string,
    rate12h: string,
    extraPaxFee: string
  }>({ 
    category: '', 
    rate: '',
    rate3h: '',
    rate6h: '',
    rate8h: '',
    rate12h: '',
    extraPaxFee: ''
  });

  // Global Settings State
  const [globalCheckInTime, setGlobalCheckInTime] = useState('');
  const [globalCheckOutTime, setGlobalCheckOutTime] = useState('');

  useEffect(() => {
    if (isOpen && currentTenant) {
      setGlobalCheckInTime(currentTenant.standardCheckInTime || '');
      setGlobalCheckOutTime(currentTenant.standardCheckOutTime || '');
      inFlightRef.current = false;
      ratesIntentRef.current = null;
      settingsIntentRef.current = null;
      setIsSubmitting(false);
    }
  }, [isOpen, currentTenant]);

  const uniqueCategories = Array.from(new Set(rooms.map(r => r.type)));

  const handleCategorySelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const cat = e.target.value;
    if (!cat) {
      setRateForm({ category: '', rate: '', rate3h: '', rate6h: '', rate8h: '', rate12h: '', extraPaxFee: '' });
      return;
    }
    const sampleRoom = rooms.find(r => r.type === cat);
    if (sampleRoom) {
      setRateForm({
        category: cat,
        rate: sampleRoom.rateCentavos ? (sampleRoom.rateCentavos / 100).toString() : '',
        rate3h: sampleRoom.shortTimeRatesCentavos?.['3h'] ? (sampleRoom.shortTimeRatesCentavos['3h'] / 100).toString() : '',
        rate6h: sampleRoom.shortTimeRatesCentavos?.['6h'] ? (sampleRoom.shortTimeRatesCentavos['6h'] / 100).toString() : '',
        rate8h: sampleRoom.shortTimeRatesCentavos?.['8h'] ? (sampleRoom.shortTimeRatesCentavos['8h'] / 100).toString() : '',
        rate12h: sampleRoom.shortTimeRatesCentavos?.['12h'] ? (sampleRoom.shortTimeRatesCentavos['12h'] / 100).toString() : '',
        extraPaxFee: sampleRoom.extraPaxFeeCentavos ? (sampleRoom.extraPaxFeeCentavos / 100).toString() : '',
      });
    } else {
      setRateForm({ ...rateForm, category: cat });
    }
  };

  const handleUpdateRates = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant || !rateForm.category || isSubmitting || inFlightRef.current) return;
    setIsSubmitting(true);
    inFlightRef.current = true;
    try {
      const shortTimeRatesCentavos: ShortTimeRates = {};
      if (rateForm.rate3h) shortTimeRatesCentavos['3h'] = Math.round(parseFloat(rateForm.rate3h) * 100);
      if (rateForm.rate6h) shortTimeRatesCentavos['6h'] = Math.round(parseFloat(rateForm.rate6h) * 100);
      if (rateForm.rate8h) shortTimeRatesCentavos['8h'] = Math.round(parseFloat(rateForm.rate8h) * 100);
      if (rateForm.rate12h) shortTimeRatesCentavos['12h'] = Math.round(parseFloat(rateForm.rate12h) * 100);
      const payload = {
        operation: 'update-category-rates' as const,
        category: rateForm.category,
        rateCentavos: Math.round(parseFloat(rateForm.rate) * 100),
        shortTimeRatesCentavos,
        ...(rateForm.extraPaxFee ? { extraPaxFeeCentavos: Math.round(parseFloat(rateForm.extraPaxFee) * 100) } : {}),
      };
      const { request, nextIntent } = resolveTsekInAdminIntent(payload, ratesIntentRef.current, generateIdempotencyKey);
      ratesIntentRef.current = nextIntent;
      await submitTsekInAdminMutation(request);
      ratesIntentRef.current = null;
      onOpenChange(false);
      setRateForm({ category: '', rate: '', rate3h: '', rate6h: '', rate8h: '', rate12h: '', extraPaxFee: '' });
      toast({ title: "Success", description: `Rates updated for ${rateForm.category}.` });
    } catch (error) {
      toast({ title: "Error", description: error instanceof TsekInClientError ? error.message : 'An unexpected error occurred. Please try again.', variant: "destructive" });
    } finally {
      setIsSubmitting(false);
      inFlightRef.current = false;
    }
  };

  const handleSaveGlobalSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant || isSubmitting || inFlightRef.current) return;
    setIsSubmitting(true);
    inFlightRef.current = true;
    try {
      const payload = {
        operation: 'update-global-settings' as const,
        standardCheckInTime: globalCheckInTime,
        standardCheckOutTime: globalCheckOutTime,
      };
      const { request, nextIntent } = resolveTsekInAdminIntent(payload, settingsIntentRef.current, generateIdempotencyKey);
      settingsIntentRef.current = nextIntent;
      await submitTsekInAdminMutation(request);
      settingsIntentRef.current = null;
      
      setCurrentTenant({
        ...currentTenant,
        standardCheckInTime: globalCheckInTime,
        standardCheckOutTime: globalCheckOutTime
      });
      
      onOpenChange(false);
      toast({ title: "Success", description: "Global check-in settings saved!" });
    } catch (error) {
      toast({ title: "Error", description: error instanceof TsekInClientError ? error.message : 'An unexpected error occurred. Please try again.', variant: "destructive" });
    } finally {
      setIsSubmitting(false);
      inFlightRef.current = false;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex space-x-4 items-center">
            <span className="text-lg">Settings & Rates</span>
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button 
                type="button"
                className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${settingsTab === 'rates' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                onClick={() => setSettingsTab('rates')}
              >
                Category Rates
              </button>
              <button 
                type="button"
                className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${settingsTab === 'global' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                onClick={() => setSettingsTab('global')}
              >
                Global Settings
              </button>
            </div>
          </DialogTitle>
        </DialogHeader>

        {settingsTab === 'rates' && (
          <form onSubmit={handleUpdateRates} className="space-y-4">
            <div className="space-y-2">
              <Label>Select Category</Label>
              <select 
                required 
                className="w-full h-10 px-3 rounded-md border border-slate-200" 
                value={rateForm.category} 
                onChange={handleCategorySelect}
              >
                <option value="">-- Choose Category --</option>
                {uniqueCategories.map(cat => (
                  <option key={cat as string} value={cat as string}>{cat as string}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>New Daily Rate (₱/Night)</Label>
              <PosCurrencyInput required value={rateForm.rate} onChange={val => setRateForm({...rateForm, rate: val})} />
            </div>
            <div className="space-y-2">
              <Label>Extra Pax Fee/Night (₱)</Label>
              <PosCurrencyInput value={rateForm.extraPaxFee} onChange={val => setRateForm({...rateForm, extraPaxFee: val})} />
            </div>
            
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-3">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Update Short Time Rates (Optional)</Label>
              <div className="grid grid-cols-4 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">3 Hrs</Label>
                  <PosCurrencyInput value={rateForm.rate3h} onChange={val => setRateForm({...rateForm, rate3h: val})} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">6 Hrs</Label>
                  <PosCurrencyInput value={rateForm.rate6h} onChange={val => setRateForm({...rateForm, rate6h: val})} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">8 Hrs</Label>
                  <PosCurrencyInput value={rateForm.rate8h} onChange={val => setRateForm({...rateForm, rate8h: val})} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">12 Hrs</Label>
                  <PosCurrencyInput value={rateForm.rate12h} onChange={val => setRateForm({...rateForm, rate12h: val})} />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting || !rateForm.category} style={{ backgroundColor: theme.primary }}>Update Rates</Button>
            </DialogFooter>
          </form>
        )}

        {settingsTab === 'global' && (
          <form onSubmit={handleSaveGlobalSettings} className="space-y-4">
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-4">
              <div className="space-y-2">
                <Label>Standard Check-In Time</Label>
                <Input type="time" value={globalCheckInTime} onChange={e => setGlobalCheckInTime(e.target.value)} className="h-10 text-sm rounded-xl bg-white border-slate-200" />
              </div>
              <div className="space-y-2">
                <Label>Standard Check-Out Time</Label>
                <Input type="time" value={globalCheckOutTime} onChange={e => setGlobalCheckOutTime(e.target.value)} className="h-10 text-sm rounded-xl bg-white border-slate-200" />
                <p className="text-xs text-slate-500">For "Daily" stays, the check-out date will automatically snap to this time.</p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} style={{ backgroundColor: theme.primary }}>Save Settings</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
