import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PosCurrencyInput } from '@/components/ui/pos-currency-input';
import { useToast } from '@/hooks/use-toast';
import {
  generateIdempotencyKey,
  submitTsekInCheckOut,
  submitTsekInExtension,
  TsekInClientError,
  type PaymentChannel,
} from '@/lib/client/tsek-in-client';
import {
  buildTsekInCheckOutBusinessPayload,
  buildTsekInExtensionBusinessPayload,
  resolveTsekInCheckOutIntent,
  resolveTsekInExtensionIntent,
  type TsekInCheckOutIntent,
  type TsekInExtensionIntent,
} from '@/lib/client/tsek-in-manage-stay-intent';

interface ManageStayModalProps {
  selectedBooking: any | null;
  onOpenChange: (open: boolean) => void;
  theme: { primary: string };
}

type DurationType = 'Daily' | '3h' | '6h' | '8h' | '12h';
type ExtraCharge = { description: string; amountCentavos: number };

function safeErrorMessage(error: unknown): string {
  return error instanceof TsekInClientError
    ? error.message
    : 'An unexpected error occurred. Please try again.';
}

function formatBookingDate(value: unknown): string {
  if (!value) return 'N/A';
  try {
    const candidate = typeof (value as { toDate?: unknown }).toDate === 'function'
      ? (value as { toDate: () => Date }).toDate()
      : value;
    const date = new Date(candidate as string | number | Date);
    return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleString();
  } catch {
    return 'N/A';
  }
}

export function ManageStayModal({ selectedBooking, onOpenChange, theme }: ManageStayModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inFlightRef = useRef(false);
  const [manageTab, setManageTab] = useState<'checkout' | 'extend'>('checkout');
  const [extraChargesList, setExtraChargesList] = useState<ExtraCharge[]>([]);
  const [newChargeDesc, setNewChargeDesc] = useState('');
  const [newChargeAmt, setNewChargeAmt] = useState('');
  const [checkoutPaymentMethod, setCheckoutPaymentMethod] = useState<PaymentChannel>('cash');
  const [extendDuration, setExtendDuration] = useState<DurationType>('Daily');
  const [extendNights, setExtendNights] = useState('1');
  const [extendPayment, setExtendPayment] = useState('');
  const [extendPaymentMethod, setExtendPaymentMethod] = useState<PaymentChannel>('cash');
  const checkoutIntentRef = useRef<TsekInCheckOutIntent | null>(null);
  const extensionIntentRef = useRef<TsekInExtensionIntent | null>(null);

  useEffect(() => {
    if (!selectedBooking) return;
    setManageTab('checkout');
    setExtraChargesList([]);
    setNewChargeDesc('');
    setNewChargeAmt('');
    setCheckoutPaymentMethod('cash');
    setExtendDuration('Daily');
    setExtendNights('1');
    setExtendPayment('');
    setExtendPaymentMethod('cash');
    setIsSubmitting(false);
    inFlightRef.current = false;
    checkoutIntentRef.current = null;
    extensionIntentRef.current = null;
  }, [selectedBooking]);

  const handleCheckOut = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedBooking?.id || isSubmitting || inFlightRef.current) return;
    setIsSubmitting(true);
    inFlightRef.current = true;
    try {
      const payload = buildTsekInCheckOutBusinessPayload({
        bookingId: selectedBooking.id,
        extraCharges: extraChargesList,
        paymentChannel: checkoutPaymentMethod,
      });
      const { request, nextIntent } = resolveTsekInCheckOutIntent(
        payload,
        checkoutIntentRef.current,
        generateIdempotencyKey,
      );
      checkoutIntentRef.current = nextIntent;
      const receipt = await submitTsekInCheckOut(request);
      checkoutIntentRef.current = null;
      onOpenChange(false);
      toast({
        title: 'Checked Out',
        description: receipt.action === 'refund'
          ? 'Guest checked out and the server confirmed the refund.'
          : 'Guest successfully checked out.',
      });
    } catch (error) {
      toast({ title: 'Error', description: safeErrorMessage(error), variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
      inFlightRef.current = false;
    }
  };

  const handleExtendStay = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedBooking?.id || isSubmitting || inFlightRef.current) return;
    const collectionCentavos = Math.round(Number.parseFloat(extendPayment || '0') * 100);
    if (!Number.isSafeInteger(collectionCentavos) || collectionCentavos < 0) {
      toast({ title: 'Error', description: 'Payment must be a valid non-negative amount.', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    inFlightRef.current = true;
    try {
      const payload = buildTsekInExtensionBusinessPayload({
        bookingId: selectedBooking.id,
        durationType: extendDuration,
        nights: extendNights,
        collection: extendPayment,
        paymentChannel: extendPaymentMethod,
      });
      const { request, nextIntent } = resolveTsekInExtensionIntent(
        payload,
        extensionIntentRef.current,
        generateIdempotencyKey,
      );
      extensionIntentRef.current = nextIntent;
      await submitTsekInExtension(request);
      extensionIntentRef.current = null;
      onOpenChange(false);
      toast({ title: 'Extended', description: 'Stay extended successfully.' });
    } catch (error) {
      toast({ title: 'Error', description: safeErrorMessage(error), variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
      inFlightRef.current = false;
    }
  };

  const addExtraCharge = () => {
    const description = newChargeDesc.trim();
    const amountCentavos = Math.round(Number.parseFloat(newChargeAmt || '0') * 100);
    if (!description || !Number.isSafeInteger(amountCentavos) || amountCentavos < 0) {
      toast({ title: 'Error', description: 'Enter a valid charge description and amount.', variant: 'destructive' });
      return;
    }
    setExtraChargesList((current) => [...current, { description, amountCentavos }]);
    setNewChargeDesc('');
    setNewChargeAmt('');
  };

  const storedRoomCost = selectedBooking?.totalRoomCostCentavos ?? 0;
  const storedCollected = selectedBooking?.totalCollectedCentavos ?? selectedBooking?.initialPaymentCentavos ?? 0;
  const estimatedExtras = extraChargesList.reduce((sum, charge) => sum + charge.amountCentavos, 0);
  const estimatedBalance = storedRoomCost + estimatedExtras - storedCollected;

  return (
    <Dialog open={!!selectedBooking} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-4">
            <span className="text-lg">Manage Stay</span>
            <div className="flex rounded-lg bg-slate-100 p-1">
              <button type="button" disabled={isSubmitting} className={`rounded-md px-3 py-1 text-xs font-medium ${manageTab === 'checkout' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`} onClick={() => setManageTab('checkout')}>Check Out</button>
              <button type="button" disabled={isSubmitting} className={`rounded-md px-3 py-1 text-xs font-medium ${manageTab === 'extend' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`} onClick={() => setManageTab('extend')}>Extend Stay</button>
            </div>
          </DialogTitle>
        </DialogHeader>

        {selectedBooking && manageTab === 'checkout' && (
          <form onSubmit={handleCheckOut} className="space-y-4">
            <div className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Room</span><span className="font-bold">{selectedBooking.roomName}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Guest</span><span className="font-bold">{selectedBooking.guestName}</span></div>
              <div className="flex justify-between text-indigo-600"><span>Expected Check-Out</span><span className="font-bold">{formatBookingDate(selectedBooking.expectedCheckOutDate)}</span></div>
              <div className="mt-2 flex justify-between border-t border-slate-200 pt-2"><span className="text-slate-500">Stored Room Cost</span><span className="font-bold">₱{(storedRoomCost / 100).toLocaleString()}</span></div>
              <p className="text-xs text-slate-500">The server confirms the final balance and checkout timestamp.</p>
            </div>

            <div className="space-y-2">
              <Label>Add Extra Charge</Label>
              <div className="flex gap-2">
                <Input value={newChargeDesc} onChange={(event) => setNewChargeDesc(event.target.value)} placeholder="Description" maxLength={200} />
                <PosCurrencyInput value={newChargeAmt} onChange={setNewChargeAmt} className="w-32" />
                <Button type="button" variant="outline" onClick={addExtraCharge}>Add</Button>
              </div>
            </div>

            {extraChargesList.length > 0 && (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                {extraChargesList.map((charge, index) => (
                  <div key={`${charge.description}-${index}`} className="flex items-center justify-between rounded-lg bg-white p-2">
                    <span className="text-sm font-medium">{charge.description}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold">₱{(charge.amountCentavos / 100).toLocaleString()}</span>
                      <button type="button" onClick={() => setExtraChargesList((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="text-red-500">×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between border-t border-slate-200 py-2">
              <div><span className="font-bold text-slate-800">Estimated Balance</span><p className="text-xs text-slate-500">Server-authoritative on submission</p></div>
              <span className={`text-xl font-black ${estimatedBalance < 0 ? 'text-emerald-600' : 'text-rose-600'}`}>₱{(Math.abs(estimatedBalance) / 100).toLocaleString()}</span>
            </div>

            <div className="space-y-2">
              <Label>Settlement Channel</Label>
              <select className="h-10 w-full rounded-md border border-slate-200 px-3" value={checkoutPaymentMethod} onChange={(event) => setCheckoutPaymentMethod(event.target.value as PaymentChannel)}>
                <option value="cash">Cash</option><option value="gcash">GCash</option><option value="maya">Maya</option><option value="card">Card</option>
              </select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-rose-600 text-white hover:bg-rose-700">{isSubmitting ? 'Processing…' : 'Settle & Check Out'}</Button>
            </DialogFooter>
          </form>
        )}

        {selectedBooking && manageTab === 'extend' && (
          <form onSubmit={handleExtendStay} className="space-y-4">
            <div className="space-y-2 rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm">
              <div className="flex justify-between"><span className="text-indigo-600/80">Current Check-Out</span><span className="font-bold text-indigo-700">{formatBookingDate(selectedBooking.expectedCheckOutDate)}</span></div>
              <p className="text-xs text-indigo-600/80">The server confirms the extension rate and new checkout time.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Extend By</Label>
                <select className="h-10 w-full rounded-md border border-slate-200 px-3" value={extendDuration} onChange={(event) => setExtendDuration(event.target.value as DurationType)}>
                  <option value="Daily">Night(s)</option><option value="3h">3 Hours</option><option value="6h">6 Hours</option><option value="8h">8 Hours</option><option value="12h">12 Hours</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>{extendDuration === 'Daily' ? 'Nights' : 'Duration'}</Label>
                <Input type="number" min="1" max="365" required value={extendNights} onChange={(event) => setExtendNights(event.target.value)} disabled={extendDuration !== 'Daily'} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Optional Immediate Payment (₱)</Label>
              <PosCurrencyInput value={extendPayment} onChange={setExtendPayment} />
              <p className="text-xs text-slate-500">The server adds any unpaid amount to the booking balance.</p>
            </div>
            {Number.parseFloat(extendPayment || '0') > 0 && (
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <select className="h-10 w-full rounded-md border border-slate-200 px-3" value={extendPaymentMethod} onChange={(event) => setExtendPaymentMethod(event.target.value as PaymentChannel)}>
                  <option value="cash">Cash</option><option value="gcash">GCash</option><option value="maya">Maya</option><option value="card">Card</option>
                </select>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} style={{ backgroundColor: theme.primary }}>{isSubmitting ? 'Processing…' : 'Confirm Extension'}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
