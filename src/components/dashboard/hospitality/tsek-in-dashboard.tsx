"use client"

import React, { useState, useEffect } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { doc, collection, onSnapshot, query, orderBy, Timestamp } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { useUser } from '@/firebase/auth/use-user';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PosCurrencyInput } from '@/components/ui/pos-currency-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { getModuleTheme } from '@/lib/theme-utils';
import { addRoom, updateRoomStatus, deleteRoom, checkInGuest, checkOutGuest, extendGuestStay, updateCategoryRates, RoomData, BookingData } from '@/firebase/firestore/tsek-in-actions';
import { useToast } from '@/hooks/use-toast';
import { Bed, Users, Plus, CheckCircle2, XCircle, MoreVertical, LogIn, LogOut, Brush, Trash2 } from 'lucide-react';

export function TsekInRoomsDashboard() {
  const { currentTenant, setCurrentTenant } = useTenant();
  const theme = getModuleTheme(currentTenant?.moduleType);
  const { toast } = useToast();
  const { user } = useUser();
  const [rooms, setRooms] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [isCheckInModalOpen, setIsCheckInModalOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isRateModalOpen, setIsRateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [roomToDelete, setRoomToDelete] = useState<string | null>(null);
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
  
  const [settingsTab, setSettingsTab] = useState<'rates'|'global'>('rates');
  
  // Settings State
  const [globalCheckInTime, setGlobalCheckInTime] = useState('');
  const [globalCheckOutTime, setGlobalCheckOutTime] = useState('');
  
  useEffect(() => {
    console.log('tsek-in-dashboard useEffect [currentTenant] triggered!', currentTenant);
    if (currentTenant) {
      setGlobalCheckInTime(currentTenant.standardCheckInTime || '');
      setGlobalCheckOutTime(currentTenant.standardCheckOutTime || '');
    }
  }, [currentTenant]);
  
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

  const getCurrentDateTimeLocal = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  };

  // Check In Form
  const [checkInDate, setCheckInDate] = useState(getCurrentDateTimeLocal());
  const [durationType, setDurationType] = useState('Daily');
  const [expectedCheckOutDate, setExpectedCheckOutDate] = useState(getCurrentDateTimeLocal());
  const [totalRoomCost, setTotalRoomCost] = useState(0);
  const [guestName, setGuestName] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [nights, setNights] = useState('1');
  const [extraPax, setExtraPax] = useState('0');
  const [extraPaxCost, setExtraPaxCost] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [initialPayment, setInitialPayment] = useState('');

  // Check Out / Manage Stay Form
  const [manageTab, setManageTab] = useState<'checkout' | 'extend'>('checkout');
  const [checkOutDate, setCheckOutDate] = useState(getCurrentDateTimeLocal());
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
    if (!currentTenant) return;
    const { db } = initializeFirebase();
    const unsubRooms = onSnapshot(query(collection(db, 'tenants', currentTenant.id, 'rooms'), orderBy('roomNumber', 'asc')), (snap) => {
      setRooms(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)).filter(r => !r.deletedAt));
    });
    const unsubBookings = onSnapshot(query(collection(db, 'tenants', currentTenant.id, 'bookings'), orderBy('createdAt', 'desc')), snap => {
      setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubRooms(); unsubBookings(); };
  }, [currentTenant]);

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant) return;
    if (rooms.length >= 25) {
      toast({ title: "Limit Reached", description: "You can only have up to 25 rooms.", variant: "destructive" });
      return;
    }
    
    setIsSubmitting(true);
    try {
      await addRoom(currentTenant.id, {
        roomNumber,
        type: roomType,
        rateCentavos: Math.round(parseFloat(rate) * 100),
        shortTimeRatesCentavos: {
          '3h': rate3h ? Math.round(parseFloat(rate3h) * 100) : undefined,
          '6h': rate6h ? Math.round(parseFloat(rate6h) * 100) : undefined,
          '8h': rate8h ? Math.round(parseFloat(rate8h) * 100) : undefined,
          '12h': rate12h ? Math.round(parseFloat(rate12h) * 100) : undefined,
        },
        capacity: parseInt(capacity),
        bedType,
        status: 'Available',
        extraPaxFeeCentavos: extraPaxFee ? Math.round(parseFloat(extraPaxFee) * 100) : undefined
      });
      setIsAddModalOpen(false);
      setRoomNumber('');
      setRate('');
      setRate3h('');
      setRate6h('');
      setRate8h('');
      setRate12h('');
      setExtraPaxFee('');
      toast({ title: "Success", description: "Room added successfully." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!currentTenant || !roomToDelete) return;
    setIsSubmitting(true);
    try {
      await deleteRoom(currentTenant.id, roomToDelete);
      toast({ title: "Deleted", description: "Room removed." });
      setRoomToDelete(null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (roomId: string, status: 'Available'|'Occupied'|'Cleaning') => {
    if (!currentTenant) return;
    try {
      await updateRoomStatus(currentTenant.id, roomId, status);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const getStatusColor = (status: string) => {
    if (status === 'Available') return 'bg-emerald-100 text-emerald-700';
    if (status === 'Occupied') return 'bg-rose-100 text-rose-700';
    return 'bg-amber-100 text-amber-700';
  };

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
    if (!currentTenant || !rateForm.category) return;
    setIsSubmitting(true);
    try {
      const shortTimeRatesCentavos: any = {};
      if (rateForm.rate3h) shortTimeRatesCentavos['3h'] = Math.round(parseFloat(rateForm.rate3h) * 100);
      if (rateForm.rate6h) shortTimeRatesCentavos['6h'] = Math.round(parseFloat(rateForm.rate6h) * 100);
      if (rateForm.rate8h) shortTimeRatesCentavos['8h'] = Math.round(parseFloat(rateForm.rate8h) * 100);
      if (rateForm.rate12h) shortTimeRatesCentavos['12h'] = Math.round(parseFloat(rateForm.rate12h) * 100);
      const paxFeeCentavos = rateForm.extraPaxFee ? Math.round(parseFloat(rateForm.extraPaxFee) * 100) : undefined;
      await updateCategoryRates(currentTenant.id, rateForm.category, Math.round(parseFloat(rateForm.rate) * 100), shortTimeRatesCentavos, paxFeeCentavos);
      setIsRateModalOpen(false);
      setRateForm({ category: '', rate: '', rate3h: '', rate6h: '', rate8h: '', rate12h: '', extraPaxFee: '' });
      toast({ title: "Success", description: `Rates updated for ${rateForm.category}.` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveGlobalSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant) return;
    setIsSubmitting(true);
    try {
      const { doc, setDoc } = await import('firebase/firestore');
      const { db } = initializeFirebase();
      const tenantRef = doc(db, 'tenants', currentTenant.id);
      await setDoc(tenantRef, {
        standardCheckInTime: globalCheckInTime,
        standardCheckOutTime: globalCheckOutTime
      }, { merge: true });
      
      setCurrentTenant({
        ...currentTenant,
        standardCheckInTime: globalCheckInTime,
        standardCheckOutTime: globalCheckOutTime
      });
      
      setIsRateModalOpen(false);
      toast({ title: "Success", description: "Global check-in settings saved!" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to calculate check out date
  const computeCheckOutDate = (startStr: string, durType: string, n: string) => {
    const start = new Date(startStr || getCurrentDateTimeLocal());
    if (durType === 'Daily') {
      start.setDate(start.getDate() + (parseInt(n) || 1));
      
      // If tenant has standardCheckOutTime (e.g. "12:00")
      if (currentTenant?.standardCheckOutTime) {
        const [hh, mm] = currentTenant.standardCheckOutTime.split(':');
        start.setHours(parseInt(hh), parseInt(mm), 0, 0);
      }
    } else {
      const hrs = parseInt(durType.replace('h', ''));
      start.setHours(start.getHours() + hrs);
    }
    start.setMinutes(start.getMinutes() - start.getTimezoneOffset());
    return start.toISOString().slice(0, 16);
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
      return stRateCentavos + paxTotalCentavos; // Short time is a fixed block, no "nights" multiplier
    }
  };

  const handleRoomSelect = (id: string) => {
    setSelectedRoomId(id);
    const room = rooms.find(r => r.id === id);
    if (room) {
      const nowStr = getCurrentDateTimeLocal();
      setCheckInDate(nowStr);
      const costCentavos = calculateTotalCostCentavos(room, durationType, extraPax, extraPaxCost, nights);
      setTotalRoomCost(costCentavos);
      setInitialPayment((costCentavos / 100).toString());
      setExpectedCheckOutDate(computeCheckOutDate(nowStr, durationType, nights));
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
      
      // Auto-populate from room settings if extra pax > 0 and fee is empty/0
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
    if (!currentTenant || !selectedRoomId) return;
    setIsSubmitting(true);
    try {
      const room = rooms.find(r => r.id === selectedRoomId);
      await checkInGuest(currentTenant.id, {
        roomId: room.id,
        roomName: room.roomNumber,
        guestName,
        contactInfo,
        checkInDate: new Date(checkInDate),
        nights: durationType === 'Daily' ? parseInt(nights) : parseInt(durationType.replace('h', '')), // just for reference
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
      setIsCheckInModalOpen(false);
      setGuestName('');
      setContactInfo('');
      setSelectedRoomId('');
      setExtraPax('0');
      setExtraPaxCost('0');
      setInitialPayment('');
      setCheckInDate(getCurrentDateTimeLocal());
      toast({ title: "Checked In", description: "Guest successfully checked in." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckOut = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant || !selectedBooking) return;
    setIsSubmitting(true);
    try {
      const roomTotalCentavos = selectedBooking.totalRoomCostCentavos || 0;
      const totalExtraCentavos = extraChargesList.reduce((acc, curr) => acc + curr.amountCentavos, 0);
      const totalCostCentavos = roomTotalCentavos + totalExtraCentavos;
      const finalPaymentCentavos = totalCostCentavos - (selectedBooking.initialPaymentCentavos || 0);

      await checkOutGuest(
        currentTenant.id,
        selectedBooking.id,
        selectedBooking.roomId,
        extraChargesList,
        finalPaymentCentavos,
        checkoutPaymentMethod,
        user?.uid,
        user?.displayName || user?.email || 'Unknown',
        new Date(checkOutDate)
      );
      setSelectedBooking(null);
      setExtraChargesList([]);
      setNewChargeDesc('');
      setNewChargeAmt('');
      setCheckOutDate(getCurrentDateTimeLocal());
      toast({ title: "Checked Out", description: "Guest successfully checked out." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExtendStay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant || !selectedBooking) return;
    setIsSubmitting(true);
    try {
      const room = rooms.find(r => r.id === selectedBooking.roomId);
      const addedCostCentavos = calculateTotalCostCentavos(room, extendDuration, '0', '0', extendNights);
      const newOutStr = computeCheckOutDate(selectedBooking.expectedCheckOutDate?.toDate().toISOString() || getCurrentDateTimeLocal(), extendDuration, extendNights);
      
      let durStr = extendDuration === 'Daily' ? `${extendNights} Night(s)` : `${extendDuration.replace('h', '')} Hour(s)`;
      
      await extendGuestStay(
        currentTenant.id,
        selectedBooking.id,
        durStr,
        new Date(newOutStr),
        addedCost,
        parseFloat(extendPayment || '0'),
        extendPaymentMethod,
        user?.uid,
        user?.displayName || user?.email || 'Unknown'
      );
      
      toast({ title: "Extended", description: "Stay extended successfully." });
      setExtendDuration('Daily');
      setExtendNights('1');
      setExtendPayment('');
      setSelectedBooking(null); // Close modal
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMigrate = async () => {
    if (!currentTenant) return;
    setIsSubmitting(true);
    try {
      const { collection, getDocs, writeBatch } = await import('firebase/firestore');
      const { db } = initializeFirebase();
      const batch = writeBatch(db);
      
      const roomsSnap = await getDocs(collection(db, 'tenants', currentTenant.id, 'rooms'));
      roomsSnap.docs.forEach(d => {
        const data = d.data();
        const updates: any = {};
        if (data.rate !== undefined && data.rateCentavos === undefined) updates.rateCentavos = Math.round(data.rate * 100);
        if (data.extraPaxFee !== undefined && data.extraPaxFeeCentavos === undefined) updates.extraPaxFeeCentavos = Math.round(data.extraPaxFee * 100);
        if (data.shortTimeRates && !data.shortTimeRatesCentavos) {
          const st: any = {};
          if (data.shortTimeRates['3h']) st['3h'] = Math.round(data.shortTimeRates['3h'] * 100);
          if (data.shortTimeRates['6h']) st['6h'] = Math.round(data.shortTimeRates['6h'] * 100);
          if (data.shortTimeRates['8h']) st['8h'] = Math.round(data.shortTimeRates['8h'] * 100);
          if (data.shortTimeRates['12h']) st['12h'] = Math.round(data.shortTimeRates['12h'] * 100);
          updates.shortTimeRatesCentavos = st;
        }
        if (Object.keys(updates).length > 0) batch.update(d.ref, updates);
      });
      
      const bookingsSnap = await getDocs(collection(db, 'tenants', currentTenant.id, 'bookings'));
      bookingsSnap.docs.forEach(d => {
        const data = d.data();
        const updates: any = {};
        if (data.initialPayment !== undefined && data.initialPaymentCentavos === undefined) updates.initialPaymentCentavos = Math.round(data.initialPayment * 100);
        if (data.rate !== undefined && data.rateCentavos === undefined) updates.rateCentavos = Math.round(data.rate * 100);
        if (data.extraPaxCost !== undefined && data.extraPaxCostCentavos === undefined) updates.extraPaxCostCentavos = Math.round(data.extraPaxCost * 100);
        if (data.totalRoomCost !== undefined && data.totalRoomCostCentavos === undefined) updates.totalRoomCostCentavos = Math.round(data.totalRoomCost * 100);
        if (data.finalPayment !== undefined && data.finalPaymentCentavos === undefined) updates.finalPaymentCentavos = Math.round(data.finalPayment * 100);
        if (data.extraCharges !== undefined && data.extraChargesCentavos === undefined) updates.extraChargesCentavos = Math.round(data.extraCharges * 100);
        
        if (data.extraChargesList && Array.isArray(data.extraChargesList)) {
           updates.extraChargesList = data.extraChargesList.map((c: any) => ({
             description: c.description,
             amountCentavos: c.amountCentavos !== undefined ? c.amountCentavos : Math.round((c.amount || 0) * 100)
           }));
        }
        if (Object.keys(updates).length > 0) batch.update(d.ref, updates);
      });
      
      await batch.commit();
      toast({ title: "Migration Complete", description: "All database records have been converted to centavos." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeBookings = bookings.filter(b => b.status === 'Active');

  const onRoomClick = (room: any) => {
    if (room.status === 'Available') {
      handleRoomSelect(room.id);
      setCheckInDate(getCurrentDateTimeLocal());
      setIsCheckInModalOpen(true);
    } else if (room.status === 'Occupied') {
      const activeBooking = activeBookings.find(b => b.roomId === room.id);
      if (activeBooking) {
        setSelectedBooking(activeBooking);
        setCheckOutDate(getCurrentDateTimeLocal());
        setExtraChargesList([]);
        setNewChargeDesc('');
        setNewChargeAmt('');
      }
    }
  };

  return (
    <div className="p-4 space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-xl font-black text-slate-800">Rooms</h2>
          <p className="text-sm text-slate-500">Manage your {rooms.length}/25 rooms</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setIsRateModalOpen(true)} variant="outline" className="rounded-xl shadow-sm">
            Manage Settings & Rate
          </Button>
          <Button onClick={() => setIsAddModalOpen(true)} className="rounded-xl shadow-sm" style={{ backgroundColor: theme.primary }}>
            <Plus className="h-4 w-4 mr-2" />
            Add Room
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {rooms.map(room => (
          <Card 
            key={room.id} 
            className={`overflow-hidden border-slate-200 transition-all ${(room.status === 'Available' || room.status === 'Occupied') ? 'cursor-pointer hover:shadow-md hover:border-slate-300' : ''}`}
            onClick={(e) => {
              // Prevent triggering if clicked on the trash button or ready button
              if ((e.target as HTMLElement).closest('button')) return;
              onRoomClick(room);
            }}
          >
            <div className={`h-2 w-full ${getStatusColor(room.status).split(' ')[0]}`} />
            <CardContent className="p-4 relative">
              <div className="flex justify-between items-start mb-2">
                <span className="font-black text-lg text-slate-800">{room.roomNumber}</span>
                <Badge variant="secondary" className={getStatusColor(room.status)}>{room.status}</Badge>
              </div>
              <p className="text-xs font-bold text-slate-500 mb-1">{room.type} • {room.bedType}</p>
              <p className="text-sm font-bold" style={{ color: theme.primary }}>₱{(room.rateCentavos / 100).toLocaleString()}/night</p>
              
              <div className="mt-4 flex gap-2">
                {room.status === 'Cleaning' && (
                  <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => handleStatusChange(room.id, 'Available')}>
                    <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-500" />
                    Ready
                  </Button>
                )}
                <Button size="icon" variant="ghost" className="absolute bottom-2 right-2 h-6 w-6 text-slate-400 hover:text-red-500" onClick={() => setRoomToDelete(room.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {rooms.length === 0 && (
          <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-200 rounded-2xl">
            <Bed className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 font-medium">No rooms added yet.</p>
          </div>
        )}
      </div>

      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
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
              <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} style={{ backgroundColor: theme.primary }}>Save Room</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isRateModalOpen} onOpenChange={setIsRateModalOpen}>
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
                <Button type="button" variant="outline" onClick={() => setIsRateModalOpen(false)}>Cancel</Button>
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
                <Button type="button" variant="outline" onClick={() => setIsRateModalOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting} style={{ backgroundColor: theme.primary }}>Save Settings</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isCheckInModalOpen} onOpenChange={setIsCheckInModalOpen}>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Check-In Date & Time</Label>
                <Input type="datetime-local" required value={checkInDate} onChange={e => handleCheckInDateChange(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Contact Info</Label>
                <Input required value={contactInfo} onChange={e => setContactInfo(e.target.value)} placeholder="Phone or ID" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Duration</Label>
                <select className="w-full h-10 px-3 rounded-md border border-slate-200" value={durationType} onChange={e => handleDurationChange(e.target.value)}>
                  <option value="Daily">Daily (24h)</option>
                  <option value="3h">3 Hours</option>
                  <option value="6h">6 Hours</option>
                  <option value="8h">8 Hours</option>
                  <option value="12h">12 Hours</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>{durationType === 'Daily' ? 'Nights' : 'Quantity'}</Label>
                <Input type="number" min="1" required value={nights} onChange={e => handleNightsChange(e.target.value)} disabled={durationType !== 'Daily'} />
              </div>
            </div>
            
            <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
              <Label className="text-xs font-bold text-indigo-500 uppercase tracking-wider">Expected Check-Out</Label>
              <p className="font-black text-indigo-700 mt-1">
                {new Date(expectedCheckOutDate).toLocaleString()}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Extra Pax (Qty)</Label>
                <Input type="number" min="0" value={extraPax} onChange={e => handleExtraPaxChange(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Extra Pax Fee/Night (₱)</Label>
                <PosCurrencyInput value={extraPaxCost} onChange={setExtraPaxCost} />
              </div>
              <div className="space-y-2">
                {/* Empty column to keep grid aligned if needed, or we can use the space */}
              </div>
            </div>
            
            {selectedRoomId && (
              <div className="p-3 bg-slate-50 rounded-xl mb-4 border border-slate-100 flex justify-between items-center">
                <span className="text-sm font-medium text-slate-500">Total Room Cost</span>
                <span className="text-lg font-black text-slate-800">
                  ₱{totalRoomCost.toLocaleString()}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Payment Collected (₱)</Label>
                <PosCurrencyInput value={initialPayment} onChange={setInitialPayment} />
              </div>
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <select className="w-full h-10 px-3 rounded-md border border-slate-200" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                  <option value="cash">Cash</option>
                  <option value="gcash">GCash</option>
                  <option value="maya">Maya</option>
                  <option value="bank_transfer">Bank Transfer</option>
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCheckInModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} style={{ backgroundColor: theme.primary }}>Confirm Check-In</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedBooking} onOpenChange={(open) => !open && setSelectedBooking(null)}>
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
                  <span className="font-bold">{new Date(selectedBooking.expectedCheckOutDate?.toDate() || new Date()).toLocaleString()}</span>
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
                <Button type="button" variant="outline" onClick={() => setSelectedBooking(null)}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting} className="bg-rose-600 hover:bg-rose-700 text-white">Settle & Check Out</Button>
              </DialogFooter>
            </form>
          )}

          {selectedBooking && manageTab === 'extend' && (
            <form onSubmit={handleExtendStay} className="space-y-4">
              <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-indigo-600/80">Current Check-Out</span>
                  <span className="font-bold text-indigo-700">{new Date(selectedBooking.expectedCheckOutDate?.toDate() || new Date()).toLocaleString()}</span>
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
                <Button type="button" variant="outline" onClick={() => setSelectedBooking(null)}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting} style={{ backgroundColor: theme.primary }}>Confirm Extension</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!roomToDelete} onOpenChange={(open) => !open && setRoomToDelete(null)}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Room?</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-slate-600">Are you sure you want to delete this room? This action cannot be undone.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRoomToDelete(null)}>Cancel</Button>
            <Button type="button" disabled={isSubmitting} variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
