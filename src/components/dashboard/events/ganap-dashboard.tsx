"use client"
import { usePinApproval } from '@/hooks/use-pin-approval';

import React, { useState } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { doc, collection, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { completeEvent, payEventVendor, addGuestToEvent, toggleGuestCheckIn, recordEventPayment, deleteEvent } from '@/firebase/firestore/events-actions';
import { useUser } from '@/firebase/auth/use-user';
import { useShift } from '@/hooks/use-shift';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getModuleTheme, useDynamicThemeColor } from '@/lib/theme-utils';
import { useEvents } from '@/hooks/use-events';
import { useToast } from '@/hooks/use-toast';
import { GCashQrModal } from '@/components/common/gcash-qr-modal';
import { CashModal } from '@/components/common/cash-modal';
import { ThermalReceiptPreview } from '@/components/common/thermal-receipt-preview';
import { Link as LinkIcon, ClipboardList, Truck, ChefHat, UserCircle, ArrowLeft, CalendarHeart, CheckCircle2, MapPin, Users, Phone, Wallet, Plus, Calendar as CalendarIcon, Clock, Edit2, Loader2, DollarSign, FileText, ChevronRight, CheckSquare, Sparkles, Building2, User, Coins, Briefcase, Trash2, Gift, Receipt } from "lucide-react";
import { DiscountInput } from '@/components/ui/discount-input';
import { EventModel } from '@/lib/schemas/events';




const VendorItem = React.memo(({ v, index, markVendorPaid }: any) => (
  <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
    <div>
      <p className="font-bold text-sm">{v.name}</p>
      <p className="text-xs text-slate-500">{v.role} • {v.contact} • ₱{((v.cost || 0) / 100).toLocaleString()}</p>
    </div>
    {v.status === 'Paid' ? (
      <Badge className="bg-emerald-100 text-emerald-700 border-transparent text-[10px]">PAID</Badge>
    ) : (
      <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => markVendorPaid(index)}>
        Mark Paid
      </Button>
    )}
  </div>
));
VendorItem.displayName = 'VendorItem';

const GuestItem = React.memo(({ guest, handleToggleCheckIn }: any) => (
  <div 
    className={`flex items-center justify-between p-2.5 rounded-lg border text-xs transition-colors cursor-pointer ${
      guest.checkedIn 
        ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
        : 'bg-white border-slate-200 text-slate-700'
    }`}
    onClick={() => handleToggleCheckIn(guest.id, guest.checkedIn)}
  >
    <div className="flex items-center gap-2">
      <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
        guest.checkedIn ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'
      }`}>
        {guest.checkedIn && <CheckCircle2 className="h-2.5 w-2.5 text-white" />}
      </div>
      <div>
        <p className="font-bold">{guest.name}</p>
        <p className="text-[9px] text-slate-400">{guest.tableOrSeat} • {guest.mealPref}</p>
      </div>
    </div>
    <span className={`text-[9px] font-black uppercase ${guest.checkedIn ? 'text-emerald-600' : 'text-slate-400'}`}>
      {guest.checkedIn ? 'In ✓' : 'Tap to Check In'}
    </span>
  </div>
));
GuestItem.displayName = 'GuestItem';

const EventItem = React.memo(({ event, onSelect }: any) => (
  <Card className="shadow-sm border-slate-200 cursor-pointer active:scale-95 transition-transform" onClick={() => onSelect(event)}>
    <CardContent className="p-4 flex items-center justify-between">
      <div>
        <h4 className="font-bold text-slate-800">{event.title}</h4>
        <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
          <Clock className="h-3 w-3" /> {event.eventDate}
        </p>
      </div>
      <ChevronRight className="h-5 w-5 text-slate-400" />
    </CardContent>
  </Card>
));
EventItem.displayName = 'EventItem';

export function GanapDashboard() {
  const { currentTenant } = useTenant();
  const db = useFirestore();
  const { toast } = useToast();
  const { requireApproval } = usePinApproval();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { user } = useUser();
  const { activeShift } = useShift();
  const isOwner = currentTenant?.ownerUid === user?.uid || (currentTenant as any)?.role === 'owner';

  const theme = getModuleTheme(currentTenant?.moduleType);
  useDynamicThemeColor(theme);

  // Events State
  const { events, inquiryEvents, depositedEvents, prepEvents, eventDayEvents, completedEvents, loading: eventsLoading } = useEvents();

  // Create Event Form
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [newEventDate, setNewEventDate] = useState('');
  const [newVenue, setNewVenue] = useState('');
  const [newContractPrice, setNewContractPrice] = useState<number | ''>('');

  // Selected Event Details
  const [selectedEvent, setSelectedEvent] = useState<EventModel | null>(null);

  // Vendor Assignment Form
  const [newVendorRole, setNewVendorRole] = useState('');
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorContact, setNewVendorContact] = useState('');
  const [newVendorCost, setNewVendorCost] = useState<number | ''>('');

  // Payment Form
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number | ''>('');
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [showCashModal, setShowCashModal] = useState(false);
  const [cashTendered, setCashTendered] = useState('');
  const [showGCashQr, setShowGCashQr] = useState(false);
  
  const [showReceipt, setShowReceipt] = useState(false);
  const [completedSale, setCompletedSale] = useState<{
    items: any[];
    total: number;
    discountCentavos: number;
    discountType: string;
    paymentMethod: string;
    saleId?: string;
  } | null>(null);

  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState<string>('');
  const [discountReason, setDiscountReason] = useState<string>('');

  const parsedPaymentAmount = typeof paymentAmount === 'number' ? paymentAmount : 0;
  const parsedDiscount = parseFloat(discountValue) || 0;
  let discountCentavos = 0;
  if (discountType === 'percentage') {
    discountCentavos = Math.round((parsedPaymentAmount * 100 * parsedDiscount) / 100);
  } else {
    discountCentavos = Math.round(parsedDiscount * 100);
  }
  if (discountCentavos > parsedPaymentAmount * 100) discountCentavos = parsedPaymentAmount * 100;
  const finalTotalCentavos = Math.max(0, parsedPaymentAmount * 100 - discountCentavos);

  // Guest List State
  const [guests, setGuests] = useState<any[]>([]);
  const [guestsLoading, setGuestsLoading] = useState(false);
  const [newGuestName, setNewGuestName] = useState('');
  const [newGuestTable, setNewGuestTable] = useState('');
  const [newGuestMeal, setNewGuestMeal] = useState('');

  // Add Event
  const handleAddEvent = async () => {
    const finalPrice = typeof newContractPrice === 'number' ? newContractPrice : 0;
    if (!currentTenant || !db || !newEventTitle || !newClientName || !newEventDate || finalPrice < 0 || isNaN(finalPrice)) {
      if (finalPrice < 0 || isNaN(finalPrice)) toast({ title: 'Error', description: 'Invalid price.', variant: 'destructive' });
      return;
    }
    setIsProcessing(true);
    try {
      const eventRef = doc(collection(db, 'tenants', currentTenant.id, 'events'));
      await setDoc(eventRef, {
        tenantId: currentTenant.id,
        title: newEventTitle,
        clientName: newClientName,
        eventDate: newEventDate,
        venue: newVenue,
        status: 'Inquiry',
        contractPrice: Math.round(finalPrice * 100),
        amountPaid: 0,
        setupNotes: '',
        foodPackage: '',
        vendors: [],
        createdAt: serverTimestamp(),
      });
      setNewEventTitle('');
      setNewClientName('');
      setNewEventDate('');
      setNewVenue('');
      setNewContractPrice('');
      setShowAddEvent(false);
      toast({ title: 'Event Created!', description: `${newEventTitle} scheduled successfully.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const updateEventStatus = async (id: string, status: 'Inquiry'|'Deposited'|'Preparation'|'Event Day'|'Completed') => {
    if (!currentTenant || !db) return;
    try {
      const eventRef = doc(db, 'tenants', currentTenant.id, 'events', id);
      await updateDoc(eventRef, { status, updatedAt: serverTimestamp() });
      if (selectedEvent?.id === id) {
        setSelectedEvent({ ...selectedEvent, status });
      }
      toast({ title: 'Status Updated', description: `Event moved to ${status}.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleDeleteEvent = async () => {
    if (!currentTenant || !user || !selectedEvent?.id) return;
    // Phase 2: Require Manager PIN for Deletions
    const approved = await requireApproval("Deleting a record requires Manager authorization.");
    if (!approved) return;

    if (!window.confirm("Sigurado ka bang gusto mong i-delete ang event na ito? Babalik ang ibinayad sa Master Cash kung mayroon man.")) return;
    try {
      setIsDeleting(true);
      await deleteEvent(currentTenant.id, selectedEvent.id, user.uid, user.displayName || user.email || 'Unknown User');
      toast({ title: 'Event Deleted', description: 'The event has been successfully voided.' });
      setSelectedEvent(null);
      setGuests([]);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  const updateSetupNotes = async (id: string, notes: string, foodPkg: string) => {
    if (!currentTenant || !db) return;
    try {
      const eventRef = doc(db, 'tenants', currentTenant.id, 'events', id);
      await updateDoc(eventRef, { setupNotes: notes, foodPackage: foodPkg, updatedAt: serverTimestamp() });
      toast({ title: 'Logistics Saved', description: `Setup notes updated.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const addVendor = async () => {
    const cost = typeof newVendorCost === 'number' ? newVendorCost : 0;
    if (!currentTenant || !db || !selectedEvent?.id || !newVendorRole || !newVendorName || cost < 0 || isNaN(cost)) {
      if (cost < 0 || isNaN(cost)) toast({ title: 'Error', description: 'Invalid cost.', variant: 'destructive' });
      return;
    }
    try {
      const newVendor = {
        role: newVendorRole,
        name: newVendorName,
        contact: newVendorContact,
        cost: Math.round(cost * 100),
        status: 'Pending' as const
      };
      const updatedVendors = [...(selectedEvent.vendors || []), newVendor];
      
      const eventRef = doc(db, 'tenants', currentTenant.id, 'events', selectedEvent.id);
      await updateDoc(eventRef, { vendors: updatedVendors, updatedAt: serverTimestamp() });
      
      setSelectedEvent({ ...selectedEvent, vendors: updatedVendors });
      setNewVendorRole('');
      setNewVendorName('');
      setNewVendorContact('');
      setNewVendorCost('');
      toast({ title: 'Vendor Assigned', description: `${newVendorName} added.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const markVendorPaid = async (vendorIdx: number) => {
    if (!currentTenant || !db || !selectedEvent?.id || !selectedEvent?.vendors) return;
    try {
      const vendor = selectedEvent.vendors[vendorIdx];
      await payEventVendor(currentTenant.id, selectedEvent.id, vendorIdx, vendor.cost || 0, `Vendor Payment: ${vendor.name} (${vendor.role})`);
      
      const updatedVendors = [...selectedEvent.vendors];
      updatedVendors[vendorIdx].status = 'Paid';
      
      setSelectedEvent({ ...selectedEvent, vendors: updatedVendors });
      toast({ title: 'Vendor Paid', description: `${vendor.name} payment recorded.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleRecordPayment = async (method: string = 'cash') => {
    const amount = typeof paymentAmount === 'number' ? paymentAmount : 0;
    if (!currentTenant || !selectedEvent?.id || amount <= 0) return;
    
    setPaymentProcessing(true);
    try {
      await recordEventPayment(
        currentTenant.id, 
        selectedEvent.id, 
        Math.round(amount * 100), 
        `Client Payment for Event: ${selectedEvent.title}`,
        discountCentavos,
        discountType,
        discountReason,
        user?.uid,
        user?.displayName || user?.email || 'Unknown',
        activeShift?.id
      );
      setSelectedEvent({ ...selectedEvent, amountPaid: (selectedEvent.amountPaid || 0) + finalTotalCentavos + discountCentavos });
      
      setCompletedSale({
        items: [{ name: `Payment for ${selectedEvent.title}`, quantity: 1, price: Math.round(amount * 100) }],
        total: finalTotalCentavos,
        discountCentavos,
        discountType,
        paymentMethod: method,
        saleId: selectedEvent.id
      });
      
      setPaymentAmount('');
      setDiscountValue('');
      setShowPaymentModal(false);
      setShowReceipt(true);
      toast({ title: 'Payment Received', description: `₱${amount.toLocaleString()} has been recorded.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setPaymentProcessing(false);
    }
  };

  // Load guests when an event is selected
  const loadGuests = async (eventId: string) => {
    if (!currentTenant || !db) return;
    setGuestsLoading(true);
    try {
      const { collection, getDocs, query, orderBy } = await import('firebase/firestore');
      const guestsRef = collection(db, 'tenants', currentTenant.id, 'events', eventId, 'guests');
      const snap = await getDocs(query(guestsRef, orderBy('createdAt', 'asc')));
      setGuests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e: any) {
      console.error('Failed to load guests', e);
      toast({ title: 'Error', description: 'Failed to load guest list.', variant: 'destructive' });
    } finally {
      setGuestsLoading(false);
    }
  };

  const handleAddGuest = async () => {
    if (!currentTenant || !selectedEvent?.id || !newGuestName.trim()) return;
    try {
      await addGuestToEvent(currentTenant.id, selectedEvent.id, newGuestName, newGuestTable, newGuestMeal);
      setNewGuestName('');
      setNewGuestTable('');
      setNewGuestMeal('');
      toast({ title: 'Guest Added', description: `${newGuestName} is on the list.` });
      await loadGuests(selectedEvent.id);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleToggleCheckIn = async (guestId: string, currentCheckedIn: boolean) => {
    if (!currentTenant || !selectedEvent?.id) return;
    try {
      await toggleGuestCheckIn(currentTenant.id, selectedEvent.id, guestId, !currentCheckedIn);
      setGuests(prev => prev.map(g => g.id === guestId ? { ...g, checkedIn: !currentCheckedIn } : g));
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const copyRsvpLink = () => {
    if (!currentTenant || !selectedEvent?.id) return;
    const url = `${window.location.origin}/rsvp/${currentTenant.id}/${selectedEvent.id}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Link Copied!', description: 'RSVP link copied to clipboard.' });
  };

  // RENDER EVENT DETAIL VIEW
  if (selectedEvent) {
    return (
      <div className="flex-1 flex flex-col bg-slate-50 min-h-screen">
        <main className="p-4 space-y-4 pb-24">
          
          <Button variant="ghost" className="pl-0 -ml-2 text-slate-500 font-bold mb-2" onClick={() => { setSelectedEvent(null); setGuests([]); }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Board
          </Button>

          <Card className="shadow-sm border-slate-200">
            <CardHeader className="p-4 flex flex-row items-start justify-between border-b border-slate-100">
              <div>
                <CardTitle className="text-xl font-bold">{selectedEvent.title}</CardTitle>
                <div className="flex flex-wrap gap-2 mt-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><UserCircle className="h-3 w-3" /> {selectedEvent.clientName}</span>
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {selectedEvent.eventDate}</span>
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {selectedEvent.venue}</span>
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <Badge className={
                  selectedEvent.status === 'Inquiry' ? 'bg-slate-100 text-slate-700' :
                  selectedEvent.status === 'Deposited' || selectedEvent.status === 'Preparation' ? 'bg-amber-100 text-amber-700' :
                  selectedEvent.status === 'Event Day' ? 'bg-cyan-100 text-cyan-700' : 'bg-emerald-100 text-emerald-700'
                }>{selectedEvent.status}</Badge>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 rounded-full bg-red-50" onClick={handleDeleteEvent} disabled={isDeleting}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
              </div>
            </CardHeader>

            <CardContent className="p-4 space-y-6">
              
              {/* Status Controls */}
              <div className="flex flex-wrap gap-2">
                {['Inquiry', 'Deposited', 'Preparation', 'Event Day', 'Completed'].map(s => (
                  <Button 
                    key={s}
                    size="sm" 
                    variant={selectedEvent.status === s ? 'default' : 'outline'} 
                    className="flex-1 text-[10px]" 
                    onClick={() => updateEventStatus(selectedEvent.id!, s as any)}
                  >
                    {s}
                  </Button>
                ))}
              </div>

              {/* Payment Tracking */}
              {/* Event Countdown & Guest Attendance Progress */}
              <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-600" />
                  <span className="text-xs font-black text-amber-900">
                    {isNaN(new Date(selectedEvent.eventDate).getTime())
                      ? "Event Schedule Set"
                      : (Math.ceil((new Date(selectedEvent.eventDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) > 0
                        ? `⏱️ ${Math.ceil((new Date(selectedEvent.eventDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} Days Countdown`
                        : "🎉 Event Day / Past Event")}
                  </span>
                </div>
                <Badge className="bg-amber-500 text-white border-none text-[9px] font-bold">
                  {guests.filter(g => g.checkedIn).length} / {guests.length} Checked In
                </Badge>
              </div>

              {/* Milestone Payment Progress */}
              <div className="bg-slate-100 p-3 rounded-lg border border-slate-200 flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Contract Price</p>
                    <p className="text-lg font-black text-slate-800">₱{((selectedEvent.contractPrice || 0) / 100).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Balance</p>
                    <p className="text-lg font-black text-rose-500">
                      ₱{(((selectedEvent.contractPrice || 0) - (selectedEvent.amountPaid || 0)) / 100).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-bold text-slate-500">
                    <span>Downpayment (30%)</span>
                    <span>Mid-Payment (70%)</span>
                    <span>Fully Paid (100%)</span>
                  </div>
                  <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 transition-all duration-500 rounded-full" 
                      style={{ width: `${Math.min(100, Math.round(((selectedEvent.amountPaid || 0) / Math.max(1, selectedEvent.contractPrice || 1)) * 100))}%` }} 
                    />
                  </div>
                </div>
                
                <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full bg-white text-slate-700 border-slate-300">
                      <Wallet className="h-4 w-4 mr-2 text-emerald-600" />
                      Record Client Payment
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Record Payment</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label htmlFor="payment-amount" className="text-xs">Amount Received (₱)</Label>
                        <Input 
                          id="payment-amount"
                          name="paymentAmount"
                          type="number" 
                          placeholder="0" 
                          value={paymentAmount} 
                          onChange={e => setPaymentAmount(parseFloat(e.target.value) || '')} 
                        />
                      </div>

                      <DiscountInput 
                        discountType={discountType}
                        discountValue={discountValue}
                        discountReason={discountReason}
                        onTypeChange={setDiscountType}
                        onValueChange={setDiscountValue}
                        onReasonChange={setDiscountReason}
                        subtotal={(typeof paymentAmount === 'number' ? paymentAmount : 0) * 100}
                      />

                      <div className="flex gap-2 w-full pt-4 mt-4 border-t border-slate-100">
                        <Button 
                          variant="outline" 
                          onClick={() => setShowCashModal(true)}
                          disabled={paymentProcessing || !paymentAmount}
                          className="flex-1 font-bold h-12 border-none text-white shadow-md active:scale-95"
                          style={{ backgroundColor: theme.primary }}
                        >
                          {paymentProcessing ? 'Processing...' : 'Pay Cash'}
                        </Button>
                        <Button 
                          onClick={() => {
                            setShowPaymentModal(false);
                            setShowGCashQr(true);
                          }}
                          disabled={paymentProcessing || !paymentAmount}
                          className="flex-1 font-bold h-12 text-white border-none shadow-md active:scale-95"
                          style={{ backgroundColor: '#007aff' }}
                        >
                          {paymentProcessing ? 'Processing...' : 'Pay GCash'}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Logistics & Setup */}
              <div className="space-y-3">
                <h4 className="font-bold flex items-center gap-2"><ChefHat className="h-4 w-4 text-orange-500" /> Setup & Logistics</h4>
                <div className="space-y-2">
                  <Label htmlFor="food-package" className="text-xs">Food Package</Label>
                  <Input 
                    id="food-package"
                    name="foodPackage"
                    placeholder="e.g. Bronze Buffet Package" 
                    value={selectedEvent.foodPackage || ''} 
                    onChange={e => setSelectedEvent({...selectedEvent, foodPackage: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="setup-notes" className="text-xs">Setup Notes</Label>
                  <Textarea 
                    id="setup-notes"
                    name="setupNotes"
                    placeholder="e.g. Buffet line near the garden, VIP tables on the left..." 
                    value={selectedEvent.setupNotes || ''} 
                    onChange={e => setSelectedEvent({...selectedEvent, setupNotes: e.target.value})}
                    className="h-24"
                  />
                </div>
                <Button 
                  size="sm" 
                  className="w-full"
                  onClick={() => updateSetupNotes(selectedEvent.id!, selectedEvent.setupNotes || '', selectedEvent.foodPackage || '')}
                >
                  Save Logistics
                </Button>
              </div>

              {/* Vendors */}
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <h4 className="font-bold flex items-center gap-2"><Truck className="h-4 w-4 text-purple-500" /> Vendors & Suppliers</h4>
                
                {selectedEvent.vendors?.map((v, i) => (
                  <VendorItem key={i} v={v} index={i} markVendorPaid={markVendorPaid} />
                ))}

                <div className="bg-white p-3 border border-slate-200 rounded-lg space-y-2 mt-2 shadow-sm">
                  <p className="text-xs font-bold text-slate-500">Assign New Vendor</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input id="vendor-role" name="vendorRole" placeholder="Role (e.g. Florist)" className="text-xs h-8" value={newVendorRole} onChange={e=>setNewVendorRole(e.target.value)} />
                    <Input id="vendor-name" name="vendorName" placeholder="Name" className="text-xs h-8" value={newVendorName} onChange={e=>setNewVendorName(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input id="vendor-contact" name="vendorContact" placeholder="Contact No." className="text-xs h-8" value={newVendorContact} onChange={e=>setNewVendorContact(e.target.value)} />
                    <Input id="vendor-cost" name="vendorCost" type="number" placeholder="Fee (₱)" className="text-xs h-8" value={newVendorCost} onChange={e=>setNewVendorCost(parseFloat(e.target.value) || '')} />
                  </div>
                  <Button size="sm" variant="secondary" className="w-full h-8 text-xs" onClick={addVendor}>+ Assign</Button>
                </div>

              </div>

              {/* Guest List Section */}
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold flex items-center gap-2">
                    <Users className="h-4 w-4 text-indigo-500" /> 
                    Guest List
                    <span className="text-xs font-normal text-slate-400">({guests.filter(g => g.checkedIn).length}/{guests.length} checked in)</span>
                  </h4>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={copyRsvpLink}>
                      <LinkIcon className="h-3 w-3 mr-1" /> RSVP Link
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => loadGuests(selectedEvent.id!)}>
                      <ClipboardList className="h-3 w-3 mr-1" /> Refresh
                    </Button>
                  </div>
                </div>

                {/* Add Guest Form */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Add Guest</p>
                  <div className="grid grid-cols-3 gap-2">
                    <Input id="guest-name" name="guestName" placeholder="Guest Name" className="text-xs h-8 col-span-1" value={newGuestName} onChange={e => setNewGuestName(e.target.value)} />
                    <Input id="guest-table" name="guestTable" placeholder="Table / Seat" className="text-xs h-8" value={newGuestTable} onChange={e => setNewGuestTable(e.target.value)} />
                    <Input id="guest-meal" name="guestMeal" placeholder="Meal Pref." className="text-xs h-8" value={newGuestMeal} onChange={e => setNewGuestMeal(e.target.value)} />
                  </div>
                  <Button size="sm" variant="secondary" className="w-full h-8 text-xs" onClick={handleAddGuest} disabled={!newGuestName.trim()}>
                    <Plus className="h-3 w-3 mr-1" /> Add to List
                  </Button>
                </div>

                {/* Guest Roster */}
                {guestsLoading ? (
                  <p className="text-xs text-slate-400 text-center py-4">Loading guests...</p>
                ) : guests.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4 border-2 border-dashed border-slate-200 rounded-lg">
                    No guests yet. Add one above or click Load to refresh.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {guests.map(guest => (
                      <GuestItem key={guest.id} guest={guest} handleToggleCheckIn={handleToggleCheckIn} />
                    ))}
                  </div>
                )}
              </div>

            </CardContent>
          </Card>
        </main>

        <CashModal 
        open={showCashModal}
        onClose={() => { setShowCashModal(false); setCashTendered(''); }}
        totalAmount={finalTotalCentavos}
        cashTendered={cashTendered}
        onCashTenderedChange={setCashTendered}
        onConfirm={() => {
          setShowCashModal(false);
          handleRecordPayment('cash');
        }}
        theme={theme}
      />
      <GCashQrModal
          open={showGCashQr}
          onClose={() => setShowGCashQr(false)}
          totalAmount={finalTotalCentavos}
          tenantName={currentTenant?.name || "Katuwang Events"}
          paymentType="gcash"
          onPaymentVerified={async (paymentMethod, gcashRef) => {
            setShowGCashQr(false);
            await handleRecordPayment(paymentMethod);
          }}
          theme={theme}
        />
        
        <ThermalReceiptPreview
          open={showReceipt}
          onClose={() => setShowReceipt(false)}
          storeName={currentTenant?.name || "Katuwang Events"}
          receiptType="EVENT PAYMENT RECEIPT"
          items={completedSale?.items || []}
          totalAmountPesos={(completedSale?.total || 0) / 100}
          paymentMethod={completedSale?.paymentMethod || "cash"}
          transactionId={completedSale?.saleId}
          theme={theme}
        />

      </div>
    );
  }

  // RENDER MAIN BOARD VIEW
  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-h-screen">
      <main className="p-4 space-y-4 pb-24">
        
        <section className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div 
              className="p-2 rounded-xl transition-colors duration-300"
              style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
            >
              <CalendarHeart className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-headline font-bold">{currentTenant?.name || 'Event Planner'}</h3>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">{theme.name}</p>
            </div>
          </div>
        </section>

        {/* Revenue Summary */}
        <div className="grid grid-cols-2 gap-3 mt-2">
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-500">Pipeline Value</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-xl font-black text-slate-800">
                ₱{(([...inquiryEvents, ...depositedEvents, ...prepEvents, ...eventDayEvents].reduce((acc, ev) => acc + (ev.contractPrice || 0), 0)) / 100).toLocaleString()}
              </p>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-500">Completed Value</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-xl font-black text-emerald-600">
                ₱{(completedEvents.reduce((acc, ev) => acc + (ev.contractPrice || 0), 0) / 100).toLocaleString()}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-between items-center mt-2">
          <h3 className="font-black uppercase tracking-widest text-slate-500 text-xs">Events Board</h3>
          <Button size="sm" className="h-8 text-xs font-bold rounded-full" onClick={() => setShowAddEvent(!showAddEvent)}>
            <Plus className="h-3 w-3 mr-1" /> New Event
          </Button>
        </div>

        {showAddEvent && (
          <Card className="shadow-sm border-slate-200 bg-white">
            <CardContent className="p-4 space-y-3">
              <div className="space-y-1">
                <Label htmlFor="event-title" className="text-xs">Event Title</Label>
                <Input id="event-title" name="eventTitle" placeholder="e.g. Reyes Wedding" value={newEventTitle} onChange={e => setNewEventTitle(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="client-name" className="text-xs">Client Name</Label>
                  <Input id="client-name" name="clientName" placeholder="John & Jane" value={newClientName} onChange={e => setNewClientName(e.target.value)} />
                </div>
                <div className="flex-1 space-y-1">
                  <Label htmlFor="event-date" className="text-xs">Date</Label>
                  <Input id="event-date" name="eventDate" type="date" value={newEventDate} onChange={e => setNewEventDate(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="event-venue" className="text-xs">Venue</Label>
                  <Input id="event-venue" name="eventVenue" placeholder="e.g. The Glass Garden" value={newVenue} onChange={e => setNewVenue(e.target.value)} />
                </div>
                <div className="flex-1 space-y-1">
                  <Label htmlFor="contract-price" className="text-xs">Contract Price (₱)</Label>
                  <Input id="contract-price" name="contractPrice" type="number" placeholder="0" value={newContractPrice} onChange={e => setNewContractPrice(parseFloat(e.target.value) || '')} />
                </div>
              </div>
              <Button 
                className="w-full h-8 text-xs font-bold text-white" 
                style={{ backgroundColor: theme.primary }}
                onClick={handleAddEvent}
                disabled={isProcessing || !newEventTitle || !newClientName || !newEventDate}
              >
                Create Event
              </Button>
            </CardContent>
          </Card>
        )}

        {eventsLoading ? (
          <div className="text-center py-8 text-sm text-slate-400">Loading events...</div>
        ) : (
          <Tabs defaultValue="inquiry" className="w-full">
            <TabsList className="grid w-full grid-cols-5 mb-4 rounded-xl h-auto">
              <TabsTrigger value="inquiry" className="rounded-lg text-[9px] md:text-xs font-bold py-2 whitespace-normal h-full">Inquiry ({inquiryEvents?.length || 0})</TabsTrigger>
              <TabsTrigger value="deposited" className="rounded-lg text-[9px] md:text-xs font-bold py-2 whitespace-normal h-full">Deposit ({depositedEvents?.length || 0})</TabsTrigger>
              <TabsTrigger value="prep" className="rounded-lg text-[9px] md:text-xs font-bold py-2 whitespace-normal h-full">Prep ({prepEvents?.length || 0})</TabsTrigger>
              <TabsTrigger value="event_day" className="rounded-lg text-[9px] md:text-xs font-bold py-2 whitespace-normal h-full">Event Day ({eventDayEvents?.length || 0})</TabsTrigger>
              <TabsTrigger value="completed" className="rounded-lg text-[9px] md:text-xs font-bold py-2 whitespace-normal h-full">Done ({completedEvents?.length || 0})</TabsTrigger>
            </TabsList>

            {[
              { id: 'inquiry', data: inquiryEvents || [], empty: 'No inquiries.' },
              { id: 'deposited', data: depositedEvents || [], empty: 'No deposited events.' },
              { id: 'prep', data: prepEvents || [], empty: 'No prep right now.' },
              { id: 'event_day', data: eventDayEvents || [], empty: 'No events today.' },
              { id: 'completed', data: completedEvents || [], empty: 'No completed events.' }
            ].map(tab => (
              <TabsContent key={tab.id} value={tab.id} className="space-y-3 animate-in slide-in-from-bottom-4 duration-300">
                {tab.data.length === 0 ? (
                  <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl text-slate-400">
                    <p className="text-xs font-medium">{tab.empty}</p>
                  </div>
                ) : (
                  tab.data.map(event => (
                    <EventItem key={event.id} event={event} onSelect={setSelectedEvent} />
                  ))
                )}
              </TabsContent>
            ))}
          </Tabs>
        )}

      </main>
    </div>
  );
}
