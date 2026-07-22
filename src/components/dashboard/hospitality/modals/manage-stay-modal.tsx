import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { PosCurrencyInput } from '@/components/ui/pos-currency-input';
import { RoomData, BookingData, checkOutGuest, extendGuestStay } from '@/firebase/firestore/tsek-in-actions';
import { useToast } from '@/hooks/use-toast';
import { formatInTimeZone } from 'date-fns-tz';

const TIMEZONE = 'Asia/Manila';

interface ManageStayModalProps {
  selectedBooking: any | null;
  onOpenChange: (open: boolean) => void;
  rooms: RoomData[];
  currentTenantId: string;
  theme: { primary: string };
  user: any;
  tenantStandardCheckOutTime?: string;
}

export function ManageStayModal({
  selectedBooking,
  onOpenChange,
  rooms,
  currentTenantId,
  theme,
  user,
  tenantStandardCheckOutTime
}: ManageStayModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [manageTab, setManageTab] = useState<'checkout' | 'extend'>('checkout');

  const getCurrentDateTimeLocal = () => {
    return formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd'T'HH:mm");
  };

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

  // Check Out State
  const [checkOutDate, setCheckOutDate] = useState('');
  const [extraChargesList, setExtraChargesList] = useState<{description: string, amountCentavos: number}[]>([]);
  const [newChargeDesc, setNewChargeDesc] = useState('');
  const [newChargeAmt, setNewChargeAmt] = useState('');
  const [checkoutPaymentMethod, setCheckoutPaymentMethod] = useState('cash');

  // Extend Stay State
  const [extendDuration, setExtendDuration] = useState('Daily');
  const [extendNights, setExtendNights] = useState('1');
  const [extendPayment, setExtendPayment] = useState('');
  const [extendPaymentMethod, setExtendPaymentMethod] = useState('cash');

  useEffect(() => {
    if (selectedBooking) {
      setManageTab('checkout');
      setCheckOutDate(getCurrentDateTimeLocal());
      setExtraChargesList([]);
      setNewChargeDesc('');
      setNewChargeAmt('');
      setCheckoutPaymentMethod('cash');
      setExtendDuration('Daily');
      setExtendNights('1');
      setExtendPayment('');
      setExtendPaymentMethod('cash');
    }
  }, [selectedBooking]);

  const handleCheckOut = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenantId || !selectedBooking) return;
    setIsSubmitting(true);
    try {
      const roomTotalCentavos = selectedBooking.totalRoomCostCentavos || 0;
      const totalExtraCentavos = extraChargesList.reduce((acc, curr) => acc + curr.amountCentavos, 0);
      const totalCostCentavos = roomTotalCentavos + totalExtraCentavos;
      const finalPaymentCentavos = totalCostCentavos - (selectedBooking.initialPaymentCentavos || 0);

      await checkOutGuest(
        currentTenantId,
        selectedBooking.id,
        selectedBooking.roomId,
        extraChargesList,
        finalPaymentCentavos,
        checkoutPaymentMethod,
        user?.uid,
        user?.displayName || user?.email || 'Unknown',
        new Date(checkOutDate)
      );
      onOpenChange(false);
      toast({ title: "Checked Out", description: "Guest successfully checked out." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExtendStay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenantId || !selectedBooking) return;
    setIsSubmitting(true);
    try {
      const room = rooms.find(r => r.id === selectedBooking.roomId);
      const addedCostCentavos = calculateTotalCostCentavos(room, extendDuration, '0', '0', extendNights);
      const newOutStr = computeCheckOutDate(selectedBooking.expectedCheckOutDate?.toDate().toISOString() || getCurrentDateTimeLocal(), extendDuration, extendNights);
      
      let durStr = extendDuration === 'Daily' ? `${extendNights} Night(s)` : `${extendDuration.replace('h', '')} Hour(s)`;
      
      await extendGuestStay(
        currentTenantId,
        selectedBooking.id,
        durStr,
        new Date(newOutStr),
        addedCostCentavos,
        Math.round(parseFloat(extendPayment || '0') * 100),
        extendPaymentMethod,
        user?.uid,
        user?.displayName || user?.email || 'Unknown'
      );
      
      toast({ title: "Extended", description: "Stay extended successfully." });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={!!selectedBooking} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex space-x-4 items-center">
            <span className="text-lg">Manage Stay</span>
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button 
                type="button"
                className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${manageTab === 'checkout' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                onClick={() => setManageTab('checkout')}
              >
                Check Out
              </button>
              <button 
                type="button"
                className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${manageTab === 'extend' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                onClick={() => setManageTab('extend')}
              >
                Extend Stay
              </button>
            </div>
          </DialogTitle>
        </DialogHeader>

        {selectedBooking && manageTab === 'checkout' && (
          <form onSubmit={handleCheckOut} className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-xl space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Room</span>
                <span className="font-bold">{selectedBooking.roomName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Guest</span>
                <span className="font-bold">{selectedBooking.guestName}</span>
              </div>
              <div className="flex justify-between text-indigo-600">
                <span className="text-indigo-600/80">Expected Check-Out</span>
                <span className="font-bold">
                  {selectedBooking.expectedCheckOutDate 
                    ? (selectedBooking.expectedCheckOutDate?.toDate 
                        ? new Date(selectedBooking.expectedCheckOutDate.toDate()).toLocaleString() 
                        : new Date(selectedBooking.expectedCheckOutDate).toLocaleString())
                    : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between mt-2 pt-2 border-t border-slate-200">
                <span className="text-slate-500">Total Room Cost</span>
                <span className="font-bold">₱{((selectedBooking.totalRoomCostCentavos || 0) / 100).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-emerald-600">
                <span>Less: Advance Payment</span>
                <span>- ₱{((selectedBooking.initialPaymentCentavos || 0) / 100).toLocaleString()}</span>
              </div>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Actual Check-Out Date & Time</Label>
                  <Input type="datetime-local" required value={checkOutDate} onChange={e => setCheckOutDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Add Extra Charge</Label>
                  <div className="flex gap-2">
                    <Input value={newChargeDesc} onChange={e => setNewChargeDesc(e.target.value)} placeholder="Description" />
                    <PosCurrencyInput value={newChargeAmt} onChange={setNewChargeAmt} className="w-32" />
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => {
                        if (newChargeDesc && newChargeAmt) {
                          setExtraChargesList([...extraChargesList, { description: newChargeDesc, amountCentavos: Math.round(parseFloat(newChargeAmt) * 100) }]);
                          setNewChargeDesc('');
                          setNewChargeAmt('');
                        }
                      }}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </div>
              
              {extraChargesList.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Extra Charges Breakdown</h4>
                  {extraChargesList.map((charge, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-white p-2 border border-slate-100 rounded-lg">
                      <span className="text-sm font-medium">{charge.description}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold">₱{(charge.amountCentavos / 100).toLocaleString()}</span>
                        <button type="button" onClick={() => setExtraChargesList(extraChargesList.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700">
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                    <span className="text-xs font-bold text-slate-500">Total Extras</span>
                    <span className="text-sm font-black">₱{(extraChargesList.reduce((acc, curr) => acc + curr.amountCentavos, 0) / 100).toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-between items-center py-2 border-t border-slate-200">
              {((selectedBooking.totalRoomCostCentavos || 0) - (selectedBooking.initialPaymentCentavos || 0) + extraChargesList.reduce((acc, curr) => acc + curr.amountCentavos, 0)) < 0 ? (
                <>
                  <span className="font-bold text-slate-800">Change Due (Sukli)</span>
                  <span className="text-xl font-black text-emerald-600">
                    ₱{(Math.abs((selectedBooking.totalRoomCostCentavos || 0) - (selectedBooking.initialPaymentCentavos || 0) + extraChargesList.reduce((acc, curr) => acc + curr.amountCentavos, 0)) / 100).toLocaleString()}
                  </span>
                </>
              ) : (
                <>
                  <span className="font-bold text-slate-800">Final Balance to Collect</span>
                  <span className="text-xl font-black text-rose-600">
                    ₱{(((selectedBooking.totalRoomCostCentavos || 0) - (selectedBooking.initialPaymentCentavos || 0) + extraChargesList.reduce((acc, curr) => acc + curr.amountCentavos, 0)) / 100).toLocaleString()}
                  </span>
                </>
              )}
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <select 
                className="w-full h-10 px-3 rounded-md border border-slate-200" 
                value={checkoutPaymentMethod} 
                onChange={e => setCheckoutPaymentMethod(e.target.value)}
                disabled={((selectedBooking.totalRoomCostCentavos || 0) - (selectedBooking.initialPaymentCentavos || 0) + extraChargesList.reduce((acc, curr) => acc + curr.amountCentavos, 0)) <= 0}
              >
                <option value="cash">Cash</option>
                <option value="gcash">GCash</option>
                <option value="maya">Maya</option>
              </select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-rose-600 hover:bg-rose-700 text-white">Settle & Check Out</Button>
            </DialogFooter>
          </form>
        )}

        {selectedBooking && manageTab === 'extend' && (
          <form onSubmit={handleExtendStay} className="space-y-4">
            <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-indigo-600/80">Current Check-Out</span>
                <span className="font-bold text-indigo-700">{selectedBooking.expectedCheckOutDate?.toDate ? new Date(selectedBooking.expectedCheckOutDate.toDate()).toLocaleString() : new Date(selectedBooking.expectedCheckOutDate).toLocaleString()}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Extend By</Label>
                <select className="w-full h-10 px-3 rounded-md border border-slate-200" value={extendDuration} onChange={e => setExtendDuration(e.target.value)}>
                  <option value="Daily">Daily (24h)</option>
                  <option value="3h">3 Hours</option>
                  <option value="6h">6 Hours</option>
                  <option value="8h">8 Hours</option>
                  <option value="12h">12 Hours</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>{extendDuration === 'Daily' ? 'Nights' : 'Quantity'}</Label>
                <Input type="number" min="1" required value={extendNights} onChange={e => setExtendNights(e.target.value)} disabled={extendDuration !== 'Daily'} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Optional: Collect Immediate Payment (₱)</Label>
              <PosCurrencyInput value={extendPayment} onChange={setExtendPayment} />
              <p className="text-xs text-slate-500">Leave 0 to just add to final check-out balance.</p>
            </div>

            {parseFloat(extendPayment || '0') > 0 && (
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <select 
                  className="w-full h-10 px-3 rounded-md border border-slate-200" 
                  value={extendPaymentMethod} 
                  onChange={e => setExtendPaymentMethod(e.target.value)}
                >
                  <option value="cash">Cash</option>
                  <option value="gcash">GCash</option>
                  <option value="maya">Maya</option>
                </select>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} style={{ backgroundColor: theme.primary }}>Confirm Extension</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
