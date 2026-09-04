import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { PosCurrencyInput } from '@/components/ui/pos-currency-input';
import { useToast } from '@/hooks/use-toast';
import { generateIdempotencyKey, submitTsekInAdminMutation, TsekInClientError, type ShortTimeRates } from '@/lib/client/tsek-in-client';
import { resolveTsekInAdminIntent, type TsekInAdminIntent } from '@/lib/client/tsek-in-admin-intent';

interface AddRoomModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  theme: { primary: string };
  roomsCount: number;
}

export function AddRoomModal({
  isOpen,
  onOpenChange,
  theme,
  roomsCount
}: AddRoomModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inFlightRef = useRef(false);
  const intentRef = useRef<TsekInAdminIntent | null>(null);

  // Form State
  const [roomNumber, setRoomNumber] = useState('');
  const [extraPaxFee, setExtraPaxFee] = useState('');
  const [roomType, setRoomType] = useState('Standard');
  const [rate, setRate] = useState('');
  const [capacity, setCapacity] = useState('2');
  const [bedType, setBedType] = useState('1 Queen');
  const [rate3h, setRate3h] = useState('');
  const [rate6h, setRate6h] = useState('');
  const [rate8h, setRate8h] = useState('');
  const [rate12h, setRate12h] = useState('');

  useEffect(() => {
    if (isOpen) {
      intentRef.current = null;
      inFlightRef.current = false;
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || inFlightRef.current) return;
    if (roomsCount >= 25) {
      toast({ title: "Limit Reached", description: "You can only have up to 25 rooms.", variant: "destructive" });
      return;
    }
    
    setIsSubmitting(true);
    inFlightRef.current = true;
    try {
      const shortTimeRatesCentavos: ShortTimeRates = {};
      if (rate3h) shortTimeRatesCentavos['3h'] = Math.round(parseFloat(rate3h) * 100);
      if (rate6h) shortTimeRatesCentavos['6h'] = Math.round(parseFloat(rate6h) * 100);
      if (rate8h) shortTimeRatesCentavos['8h'] = Math.round(parseFloat(rate8h) * 100);
      if (rate12h) shortTimeRatesCentavos['12h'] = Math.round(parseFloat(rate12h) * 100);
      const payload = {
        operation: 'create-room' as const,
        roomNumber,
        type: roomType,
        rateCentavos: Math.round(parseFloat(rate) * 100),
        shortTimeRatesCentavos,
        capacity: parseInt(capacity),
        bedType,
        ...(extraPaxFee ? { extraPaxFeeCentavos: Math.round(parseFloat(extraPaxFee) * 100) } : {}),
      };
      const { request, nextIntent } = resolveTsekInAdminIntent(payload, intentRef.current, generateIdempotencyKey);
      intentRef.current = nextIntent;
      await submitTsekInAdminMutation(request);
      intentRef.current = null;
      onOpenChange(false);
      setRoomNumber('');
      setRate('');
      setRate3h('');
      setRate6h('');
      setRate8h('');
      setRate12h('');
      setExtraPaxFee('');
      toast({ title: "Success", description: "Room added successfully." });
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
          <DialogTitle>Add New Room</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleAddRoom} className="space-y-4">
          <div className="space-y-2">
            <Label>Room Number / Name</Label>
            <Input value={roomNumber} onChange={e => setRoomNumber(e.target.value)} required placeholder="e.g. 101 or Villa A" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Room Category / Type</Label>
              <Input required value={roomType} onChange={e => setRoomType(e.target.value)} placeholder="e.g. Standard, Deluxe" />
            </div>
            <div className="space-y-2">
              <Label>Daily Rate (₱/Night)</Label>
              <PosCurrencyInput required value={rate} onChange={setRate} />
            </div>
            <div className="space-y-2">
              <Label>Extra Pax Fee/Night (₱)</Label>
              <PosCurrencyInput value={extraPaxFee} onChange={setExtraPaxFee} />
            </div>
          </div>
          
          <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-3">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Short Time Rates (Optional)</Label>
            <div className="grid grid-cols-4 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">3 Hrs</Label>
                <PosCurrencyInput value={rate3h} onChange={setRate3h} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">6 Hrs</Label>
                <PosCurrencyInput value={rate6h} onChange={setRate6h} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">8 Hrs</Label>
                <PosCurrencyInput value={rate8h} onChange={setRate8h} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">12 Hrs</Label>
                <PosCurrencyInput value={rate12h} onChange={setRate12h} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Capacity</Label>
              <Input type="number" min="1" required value={capacity} onChange={e => setCapacity(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Bed Type</Label>
              <Input value={bedType} required onChange={e => setBedType(e.target.value)} placeholder="e.g. 1 Queen" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting} style={{ backgroundColor: theme.primary }}>Save Room</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
