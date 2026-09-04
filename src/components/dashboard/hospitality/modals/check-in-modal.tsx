import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { PosCurrencyInput } from '@/components/ui/pos-currency-input';
import { useToast } from '@/hooks/use-toast';
import { formatInTimeZone } from 'date-fns-tz';
import {
  submitTsekInCheckIn,
  generateIdempotencyKey,
  TsekInClientError,
  type CheckInRequest,
  type PaymentChannel,
} from '@/lib/client/tsek-in-client';
import {
  buildTsekInCheckInBusinessPayload,
  resolveTsekInCheckInIntent,
  type TsekInCheckInFormValues,
  type TsekInCheckInIntent,
} from '@/lib/client/tsek-in-checkin-intent';

const TIMEZONE = 'Asia/Manila';

interface CheckInModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedRoomId: string;
  rooms: RoomData[];
  theme: { primary: string };
  tenantStandardCheckOutTime?: string;
}

interface RoomData {
  id: string;
  roomNumber: string;
  rateCentavos: number;
  shortTimeRatesCentavos?: Record<string, number>;
  extraPaxFeeCentavos?: number;
  capacity: number;
  status: string;
}

function computeCheckOutDate(startStr: string, durType: string, n: string, standardCheckOutTime?: string): string {
  const start = new Date(startStr || new Date().toISOString());
  if (durType === 'Daily') {
    start.setDate(start.getDate() + (parseInt(n) || 1));
    if (standardCheckOutTime) {
      const [hh, mm] = standardCheckOutTime.split(':');
      start.setHours(parseInt(hh), parseInt(mm), 0, 0);
    }
  } else {
    const hrs = parseInt(durType.replace('h', ''));
    start.setHours(start.getHours() + hrs);
  }
  const yr = start.getFullYear();
  const mo = String(start.getMonth() + 1).padStart(2, '0');
  const da = String(start.getDate()).padStart(2, '0');
  const hr = String(start.getHours()).padStart(2, '0');
  const mi = String(start.getMinutes()).padStart(2, '0');
  return `${yr}-${mo}-${da}T${hr}:${mi}`;
}

function calculateTotalCostCentavos(room: RoomData | undefined, durType: string, paxStr: string, paxCostStr: string, nightsStr: string): number {
  if (!room) return 0;
  const pax = parseInt(paxStr || '0');
  const paxCostCentavos = Math.round(parseFloat(paxCostStr || '0') * 100);
  const n = parseInt(nightsStr || '0');
  const paxTotalCentavos = pax * paxCostCentavos;

  if (durType === 'Daily') {
    return (room.rateCentavos + paxTotalCentavos) * n;
  } else {
    const stRateCentavos = room.shortTimeRatesCentavos?.[durType] || room.rateCentavos;
    return stRateCentavos + paxTotalCentavos;
  }
}

export function CheckInModal({
  isOpen,
  onOpenChange,
  selectedRoomId: initialRoomId,
  rooms,
  theme,
  tenantStandardCheckOutTime
}: CheckInModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inFlightRef = useRef(false);

  const getCurrentDateTimeLocal = () => {
    return formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd'T'HH:mm");
  };

  const [checkInDate, setCheckInDate] = useState('');
  const [durationType, setDurationType] = useState<'Daily' | '3h' | '6h' | '8h' | '12h'>('Daily');
  const [expectedCheckOutDate, setExpectedCheckOutDate] = useState('');
  const [totalRoomCost, setTotalRoomCost] = useState(0);
  const [guestName, setGuestName] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState(initialRoomId);
  const [nights, setNights] = useState('1');
  const [extraPax, setExtraPax] = useState('0');
  const [extraPaxCost, setExtraPaxCost] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<PaymentChannel>('cash');
  const [initialPayment, setInitialPayment] = useState('');

  const intentRef = useRef<TsekInCheckInIntent | null>(null);

  // Sync prop to state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedRoomId(initialRoomId);
      const nowStr = getCurrentDateTimeLocal();
      setCheckInDate(nowStr);
      intentRef.current = null;
      const room = rooms.find(r => r.id === initialRoomId);
      if (room) {
        const costCentavos = calculateTotalCostCentavos(room, 'Daily', '0', '0', '1');
        setTotalRoomCost(costCentavos);
        setInitialPayment((costCentavos / 100).toString());
        setExpectedCheckOutDate(computeCheckOutDate(nowStr, 'Daily', '1', tenantStandardCheckOutTime));
      }
      setDurationType('Daily');
      setNights('1');
      setExtraPax('0');
      setExtraPaxCost('0');
      setGuestName('');
      setContactInfo('');
      setPaymentMethod('cash');
      setIsSubmitting(false);
      inFlightRef.current = false;
    }
  }, [isOpen, initialRoomId, rooms, tenantStandardCheckOutTime]);

  const handleRoomSelect = (id: string) => {
    setSelectedRoomId(id);
    const room = rooms.find(r => r.id === id);
    if (room) {
      const costCentavos = calculateTotalCostCentavos(room, durationType, extraPax, extraPaxCost, nights);
      setTotalRoomCost(costCentavos);
      setInitialPayment((costCentavos / 100).toString());
      setExpectedCheckOutDate(computeCheckOutDate(checkInDate, durationType, nights, tenantStandardCheckOutTime));
    }
  };

  const handleDurationChange = (val: 'Daily' | '3h' | '6h' | '8h' | '12h') => {
    setDurationType(val);
    const room = rooms.find(r => r.id === selectedRoomId);
    if (room) {
      const costCentavos = calculateTotalCostCentavos(room, val, extraPax, extraPaxCost, nights);
      setTotalRoomCost(costCentavos);
      setInitialPayment((costCentavos / 100).toString());
      setExpectedCheckOutDate(computeCheckOutDate(checkInDate, val, nights, tenantStandardCheckOutTime));
    }
  };

  const handleCheckInDateChange = (val: string) => {
    setCheckInDate(val);
    setExpectedCheckOutDate(computeCheckOutDate(val, durationType, nights, tenantStandardCheckOutTime));
  };

  const handleNightsChange = (val: string) => {
    setNights(val);
    const room = rooms.find(r => r.id === selectedRoomId);
    if (room) {
      const costCentavos = calculateTotalCostCentavos(room, durationType, extraPax, extraPaxCost, val);
      setTotalRoomCost(costCentavos);
      setInitialPayment((costCentavos / 100).toString());
      setExpectedCheckOutDate(computeCheckOutDate(checkInDate, durationType, val, tenantStandardCheckOutTime));
    }
  };

  const handleExtraPaxChange = (val: string) => {
    setExtraPax(val);
    const room = rooms.find(r => r.id === selectedRoomId);
    if (room) {
      const parsedPax = parseInt(val || '0');
      let currentPaxCost = extraPaxCost;
      if (parsedPax > 0 && (!currentPaxCost || currentPaxCost === '0') && room.extraPaxFeeCentavos !== undefined) {
        currentPaxCost = (room.extraPaxFeeCentavos / 100).toString();
        setExtraPaxCost(currentPaxCost);
      }
      const costCentavos = calculateTotalCostCentavos(room, durationType, val, currentPaxCost, nights);
      setTotalRoomCost(costCentavos);
      setInitialPayment((costCentavos / 100).toString());
    }
  };

  // Extra-pax price is no longer editable; only room's stored fee is shown
  const handleExtraPaxCostChange = (val: string) => {
    // Disabled - server-authoritative rate
  };

  const buildFormValues = useCallback((): TsekInCheckInFormValues => ({
    roomId: selectedRoomId,
    guestName,
    contactInfo,
    durationType,
    nights,
    extraPax,
    paymentMethod,
    initialPayment,
  }), [selectedRoomId, guestName, contactInfo, durationType, nights, extraPax, paymentMethod, initialPayment]);

  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoomId || isSubmitting || inFlightRef.current) return;

    if (!guestName.trim()) {
      toast({ title: "Error", description: "Guest name is required.", variant: "destructive" });
      return;
    }

    const initialPaymentCents = Math.round(parseFloat(initialPayment || '0') * 100);
    if (initialPaymentCents < 0) {
      toast({ title: "Error", description: "Initial payment cannot be negative.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    inFlightRef.current = true;

    try {
      const formValues = buildFormValues();
      const businessPayload = buildTsekInCheckInBusinessPayload(formValues);
      const { request, nextIntent } = resolveTsekInCheckInIntent(
        businessPayload,
        intentRef.current,
        generateIdempotencyKey
      );
      intentRef.current = nextIntent;

      const receipt = await submitTsekInCheckIn(request);
      onOpenChange(false);
      toast({ title: "Checked In", description: "Guest successfully checked in." });
      // Reset intent on success
      intentRef.current = null;
    } catch (err) {
      if (err instanceof TsekInClientError) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      } else {
        toast({ title: "Error", description: "An unexpected error occurred. Please try again.", variant: "destructive" });
      }
      // On failure, retain intent so identical retry reuses the key
    } finally {
      setIsSubmitting(false);
      inFlightRef.current = false;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Guest Check-In</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCheckIn} className="space-y-4">
          <div className="space-y-2">
            <Label>Select Room</Label>
            <select required className="w-full h-10 px-3 rounded-md border border-slate-200 bg-slate-100" disabled value={selectedRoomId}>
              <option value={selectedRoomId}>{rooms.find(r => r.id === selectedRoomId)?.roomNumber}</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Guest Name</Label>
            <Input required value={guestName} onChange={e => setGuestName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Contact Info (Optional)</Label>
            <Input value={contactInfo} onChange={e => setContactInfo(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Duration Type</Label>
              <select required className="w-full h-10 px-3 rounded-md border border-slate-200" value={durationType} onChange={e => handleDurationChange(e.target.value as 'Daily' | '3h' | '6h' | '8h' | '12h')}>
                <option value="Daily">Daily</option>
                <option value="3h">Short Time (3 Hrs)</option>
                <option value="6h">Short Time (6 Hrs)</option>
                <option value="8h">Short Time (8 Hrs)</option>
                <option value="12h">Short Time (12 Hrs)</option>
              </select>
            </div>
            {durationType === 'Daily' && (
              <div className="space-y-2">
                <Label>Nights</Label>
                <Input type="number" min="1" required value={nights} onChange={e => handleNightsChange(e.target.value)} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Extra Pax</Label>
              <Input type="number" min="0" value={extraPax} onChange={e => handleExtraPaxChange(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Extra Pax Cost/Night (₱)</Label>
              <p className="text-sm text-slate-500">₱{(parseFloat(extraPaxCost) || 0).toFixed(2)} (server-authoritative)</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Check-In Time</Label>
              <p className="text-sm text-slate-500">Server-authoritative timestamp will be used</p>
            </div>
            <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
              <Label className="text-xs font-bold text-indigo-500 uppercase tracking-wider">Estimated Check-Out</Label>
              <p className="font-black text-indigo-700 mt-1">
                {expectedCheckOutDate ? formatInTimeZone(new Date(expectedCheckOutDate), TIMEZONE, 'MMM d, yyyy h:mm a') : 'Calculating...'}
              </p>
              <p className="text-xs text-indigo-500 mt-1">Server confirms final checkout time</p>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 space-y-4">
            <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl">
              <span className="font-bold text-slate-700">Estimated Total</span>
              <span className="font-black text-lg" style={{ color: theme.primary }}>₱{(totalRoomCost / 100).toLocaleString()}</span>
            </div>
            <p className="text-xs text-slate-500">Server confirms final amount</p>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Initial Payment (₱)</Label>
                <PosCurrencyInput required value={initialPayment} onChange={setInitialPayment} />
              </div>
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <select className="w-full h-10 px-3 rounded-md border border-slate-200" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as PaymentChannel)}>
                  <option value="cash">Cash</option>
                  <option value="gcash">GCash</option>
                  <option value="maya">Maya</option>
                  <option value="card">Card</option>
                </select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting} style={{ backgroundColor: theme.primary }}>
              {isSubmitting ? 'Checking In...' : 'Confirm Check-In'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}