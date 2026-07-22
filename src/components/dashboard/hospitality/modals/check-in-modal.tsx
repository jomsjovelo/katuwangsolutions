import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { PosCurrencyInput } from '@/components/ui/pos-currency-input';
import { RoomData, checkInGuest } from '@/firebase/firestore/tsek-in-actions';
import { useToast } from '@/hooks/use-toast';
import { formatInTimeZone } from 'date-fns-tz';

const TIMEZONE = 'Asia/Manila';

interface CheckInModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedRoomId: string;
  rooms: RoomData[];
  currentTenantId: string;
  theme: { primary: string };
  user: any;
  tenantStandardCheckOutTime?: string;
}

export function CheckInModal({
  isOpen,
  onOpenChange,
  selectedRoomId: initialRoomId,
  rooms,
  currentTenantId,
  theme,
  user,
  tenantStandardCheckOutTime
}: CheckInModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const getCurrentDateTimeLocal = () => {
    return formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd'T'HH:mm");
  };

  const [checkInDate, setCheckInDate] = useState('');
  const [durationType, setDurationType] = useState('Daily');
  const [expectedCheckOutDate, setExpectedCheckOutDate] = useState('');
  const [totalRoomCost, setTotalRoomCost] = useState(0);
  const [guestName, setGuestName] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState(initialRoomId);
  const [nights, setNights] = useState('1');
  const [extraPax, setExtraPax] = useState('0');
  const [extraPaxCost, setExtraPaxCost] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [initialPayment, setInitialPayment] = useState('');

  // Sync prop to state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedRoomId(initialRoomId);
      const nowStr = getCurrentDateTimeLocal();
      setCheckInDate(nowStr);
      const room = rooms.find(r => r.id === initialRoomId);
      if (room) {
        const costCentavos = calculateTotalCostCentavos(room, 'Daily', '0', '0', '1');
        setTotalRoomCost(costCentavos);
        setInitialPayment((costCentavos / 100).toString());
        setExpectedCheckOutDate(computeCheckOutDate(nowStr, 'Daily', '1'));
      }
      setDurationType('Daily');
      setNights('1');
      setExtraPax('0');
      setExtraPaxCost('0');
      setGuestName('');
      setContactInfo('');
      setPaymentMethod('cash');
    }
  }, [isOpen, initialRoomId, rooms]);

  const computeCheckOutDate = (startStr: string, durType: string, n: string) => {
    const start = new Date(startStr || getCurrentDateTimeLocal());
    if (durType === 'Daily') {
      start.setDate(start.getDate() + (parseInt(n) || 1));
      if (tenantStandardCheckOutTime) {
        const [hh, mm] = tenantStandardCheckOutTime.split(':');
        start.setHours(parseInt(hh), parseInt(mm), 0, 0);
      }
    } else {
      const hrs = parseInt(durType.replace('h', ''));
      start.setHours(start.getHours() + hrs);
    }
    // Convert back to input datetime-local string
    const yr = start.getFullYear();
    const mo = String(start.getMonth() + 1).padStart(2, '0');
    const da = String(start.getDate()).padStart(2, '0');
    const hr = String(start.getHours()).padStart(2, '0');
    const mi = String(start.getMinutes()).padStart(2, '0');
    return `${yr}-${mo}-${da}T${hr}:${mi}`;
  };

  const calculateTotalCostCentavos = (room: any, durType: string, paxStr: string, paxCostStr: string, nightsStr: string) => {
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
  };

  const handleRoomSelect = (id: string) => {
    setSelectedRoomId(id);
    const room = rooms.find(r => r.id === id);
    if (room) {
      const costCentavos = calculateTotalCostCentavos(room, durationType, extraPax, extraPaxCost, nights);
      setTotalRoomCost(costCentavos);
      setInitialPayment((costCentavos / 100).toString());
      setExpectedCheckOutDate(computeCheckOutDate(checkInDate, durationType, nights));
    }
  };

  const handleDurationChange = (val: string) => {
    setDurationType(val);
    const room = rooms.find(r => r.id === selectedRoomId);
    if (room) {
      const costCentavos = calculateTotalCostCentavos(room, val, extraPax, extraPaxCost, nights);
      setTotalRoomCost(costCentavos);
      setInitialPayment((costCentavos / 100).toString());
      setExpectedCheckOutDate(computeCheckOutDate(checkInDate, val, nights));
    }
  };

  const handleCheckInDateChange = (val: string) => {
    setCheckInDate(val);
    setExpectedCheckOutDate(computeCheckOutDate(val, durationType, nights));
  };

  const handleNightsChange = (val: string) => {
    setNights(val);
    const room = rooms.find(r => r.id === selectedRoomId);
    if (room) {
      const costCentavos = calculateTotalCostCentavos(room, durationType, extraPax, extraPaxCost, val);
      setTotalRoomCost(costCentavos);
      setInitialPayment((costCentavos / 100).toString());
      setExpectedCheckOutDate(computeCheckOutDate(checkInDate, durationType, val));
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

  const handleExtraPaxCostChange = (val: string) => {
    setExtraPaxCost(val);
    const room = rooms.find(r => r.id === selectedRoomId);
    if (room) {
      const costCentavos = calculateTotalCostCentavos(room, durationType, extraPax, val, nights);
      setTotalRoomCost(costCentavos);
      setInitialPayment((costCentavos / 100).toString());
    }
  };

  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoomId) return;
    setIsSubmitting(true);
    try {
      const room = rooms.find(r => r.id === selectedRoomId);
      if (!room || !room.id) return;
      await checkInGuest(currentTenantId, {
        roomId: room.id,
        roomName: room.roomNumber,
        guestName,
        contactInfo,
        checkInDate: new Date(checkInDate),
        nights: durationType === 'Daily' ? parseInt(nights) : parseInt(durationType.replace('h', '')),
        paymentMethod,
        initialPaymentCentavos: Math.round(parseFloat(initialPayment || '0') * 100),
        rateCentavos: room.rateCentavos,
        extraPax: parseInt(extraPax || '0'),
        extraPaxCostCentavos: Math.round(parseFloat(extraPaxCost || '0') * 100),
        expectedCheckOutDate: new Date(expectedCheckOutDate),
        totalRoomCostCentavos: totalRoomCost,
        userId: user?.uid,
        userName: user?.displayName || user?.email || 'Unknown'
      });
      onOpenChange(false);
      toast({ title: "Checked In", description: "Guest successfully checked in." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
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
              <select required className="w-full h-10 px-3 rounded-md border border-slate-200" value={durationType} onChange={e => handleDurationChange(e.target.value)}>
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
              <PosCurrencyInput value={extraPaxCost} onChange={handleExtraPaxCostChange} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Check-In Date/Time</Label>
              <Input type="datetime-local" required value={checkInDate} onChange={e => handleCheckInDateChange(e.target.value)} />
            </div>
            <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
              <Label className="text-xs font-bold text-indigo-500 uppercase tracking-wider">Expected Check-Out</Label>
              <p className="font-black text-indigo-700 mt-1">
                {expectedCheckOutDate ? formatInTimeZone(new Date(expectedCheckOutDate), TIMEZONE, 'MMM d, yyyy h:mm a') : 'Calculating...'}
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 space-y-4">
            <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl">
              <span className="font-bold text-slate-700">Total Cost</span>
              <span className="font-black text-lg" style={{ color: theme.primary }}>₱{(totalRoomCost / 100).toLocaleString()}</span>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Initial Payment (₱)</Label>
                <PosCurrencyInput required value={initialPayment} onChange={setInitialPayment} />
              </div>
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <select className="w-full h-10 px-3 rounded-md border border-slate-200" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                  <option value="cash">Cash</option>
                  <option value="gcash">GCash</option>
                  <option value="maya">Maya</option>
                  <option value="card">Card</option>
                </select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting} style={{ backgroundColor: theme.primary }}>Confirm Check-In</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
