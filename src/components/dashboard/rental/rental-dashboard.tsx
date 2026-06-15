"use client";

import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Truck, Package, CalendarDays, Plus, Loader2, CheckCircle2, AlertCircle, RotateCcw } from "lucide-react";
import { useRental } from '@/hooks/use-rental';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { collection, addDoc, serverTimestamp, doc, runTransaction, increment } from 'firebase/firestore';
import { processRentalBooking, processRentalReturn } from '@/firebase/firestore/rental-actions';
import { GCashQrModal } from '@/components/common/gcash-qr-modal';
import { ThermalReceiptPreview } from '@/components/common/thermal-receipt-preview';
import { useFirestore } from '@/firebase/provider';
import { useTenant } from '@/app/lib/tenant-context';
import { getModuleTheme, useDynamicThemeColor } from '@/lib/theme-utils';

export function RentalDashboard() {
  const [activeTab, setActiveTab] = useState<'active' | 'inventory' | 'calendar'>('active');
  const { inventory, inventoryLoading, inventoryError, activeBookings, bookingsLoading, bookingsError } = useRental();
  const db = useFirestore();
  const { currentTenant } = useTenant();
  const theme = getModuleTheme(currentTenant?.moduleType);
  useDynamicThemeColor(theme);

  React.useEffect(() => {
    if (inventoryError) {
      console.error("Inventory listener error:", inventoryError);
      setErrorMsg('Failed to sync inventory.');
      setTimeout(() => setErrorMsg(null), 4000);
    }
    if (bookingsError) {
      console.error("Bookings listener error:", bookingsError);
      setErrorMsg('Failed to sync bookings.');
      setTimeout(() => setErrorMsg(null), 4000);
    }
  }, [inventoryError, bookingsError]);

  // Toast state
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [returningId, setReturningId] = useState<string | null>(null);

  const showSuccess = (msg: string) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(null), 3000); };
  const showError = (msg: string) => { setErrorMsg(msg); setTimeout(() => setErrorMsg(null), 4000); };

  // Add Item State
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [itemName, setItemName] = useState('');
  const [itemCategory, setItemCategory] = useState('');
  const [itemRate, setItemRate] = useState('');
  const [itemQty, setItemQty] = useState('');

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !currentTenant) return;
    setIsAddingItem(true);
    try {
      await addDoc(collection(db, 'tenants', currentTenant.id, 'rental_inventory'), {
        name: itemName,
        category: itemCategory,
        dailyRate: Number(itemRate),
        totalQuantity: Number(itemQty),
        availableQuantity: Number(itemQty),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setItemName(''); setItemCategory(''); setItemRate(''); setItemQty('');
      showSuccess(`${itemName} naidagdag sa inventory!`);
    } catch (error: any) {
      showError(error?.message || 'Failed to add item. Please try again.');
    } finally {
      setIsAddingItem(false);
    }
  };

  // Add Booking State
  const [isAddingBooking, setIsAddingBooking] = useState(false);
  const [bookingItemId, setBookingItemId] = useState('');
  const [bookingCustomer, setBookingCustomer] = useState('');
  const [bookingCost, setBookingCost] = useState('');
  const [bookingPaymentTiming, setBookingPaymentTiming] = useState<'upfront'|'return'>('upfront');
  const [bookingPaymentMethod, setBookingPaymentMethod] = useState<'cash'|'gcash'>('cash');
  const [showGCashQr, setShowGCashQr] = useState(false);
  const [showNewBookingModal, setShowNewBookingModal] = useState(false);
  
  const [showReceipt, setShowReceipt] = useState(false);
  const [completedSale, setCompletedSale] = useState<{
    items: any[];
    total: number;
    paymentMethod: string;
    saleId?: string;
  } | null>(null);

  const handleAddBooking = async (e?: React.FormEvent, paymentRef?: string) => {
    if (e) e.preventDefault();
    if (!db || !currentTenant) return;
    setIsAddingBooking(true);
    try {
      const selectedItem = inventory.find(i => i.id === bookingItemId);
      if (!selectedItem) throw new Error("Item not found in inventory.");
      if (selectedItem.availableQuantity <= 0) throw new Error(`${selectedItem.name} is currently fully rented out.`);

      const bookingId = await processRentalBooking(
        currentTenant.id,
        bookingItemId,
        selectedItem.name,
        bookingCustomer,
        Number(bookingCost),
        bookingPaymentTiming,
        bookingPaymentTiming === 'upfront' ? bookingPaymentMethod : undefined,
        paymentRef
      );

      setCompletedSale({
        items: [{
          name: selectedItem.name,
          quantity: 1,
          price: Number(bookingCost) * 100
        }],
        total: Number(bookingCost) * 100,
        paymentMethod: bookingPaymentTiming === 'upfront' ? bookingPaymentMethod : 'Unpaid (Pay on Return)',
        saleId: bookingId
      });

      setBookingItemId(''); setBookingCustomer(''); setBookingCost('');
      setShowNewBookingModal(false);
      setShowReceipt(true);
      showSuccess(`Booking para kay ${bookingCustomer} naitala!`);
    } catch (error: any) {
      showError(error?.message || 'Failed to create booking. Please try again.');
    } finally {
      setIsAddingBooking(false);
    }
  };

  // Return a rented item back to inventory
  const handleReturnItem = async (booking: any) => {
    if (!db || !currentTenant) return;
    setReturningId(booking.id);
    try {
      let method = undefined;
      // If payment is pending, we assume cash for simple return without explicit UI right now unless we add a return modal
      // For now, let's default to cash if unpaid when they click return. 
      if (booking.paymentStatus === 'unpaid') {
         method = 'cash'; // TODO: add a modal for return payment if needed, but for now default to cash
      }
      await processRentalReturn(currentTenant.id, booking, method);
      showSuccess(`${booking.itemName} na-return ni ${booking.customerName}!`);
    } catch (error: any) {
      showError(error?.message || 'Failed to return item.');
    } finally {
      setReturningId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 bg-slate-50 min-h-screen">
      
      {/* Toast Alerts */}
      {successMsg && (
        <div className="fixed top-4 inset-x-4 z-50 bg-slate-900/95 text-white py-3 px-4 rounded-2xl border border-slate-700/50 text-xs font-bold flex items-center gap-2 shadow-2xl animate-in slide-in-from-top-4 duration-200">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="fixed top-4 inset-x-4 z-50 bg-red-600/95 text-white py-3 px-4 rounded-2xl border border-red-500/50 text-xs font-bold flex items-center gap-2 shadow-2xl animate-in slide-in-from-top-4 duration-200">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      
      {showGCashQr && currentTenant && (
        <GCashQrModal
        open={showGCashQr}
        onClose={() => setShowGCashQr(false)}
        totalAmount={Number(bookingCost) * 100}
        tenantName={currentTenant?.name || "Katuwang Rental"}
        paymentType="gcash"
        onPaymentVerified={async (method, ref) => {
          setShowGCashQr(false);
          await handleAddBooking(undefined, ref);
        }}
        theme={theme}
      />
      )}
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 animate-in slide-in-from-top-2">
        <div>
          <h1 className="text-2xl font-headline font-black text-slate-800 tracking-tight uppercase flex items-center gap-2">
            <Truck className="h-6 w-6" style={{ color: theme.primary }} />
            Rental Management
          </h1>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">{theme.name} • Equipment & Vehicle Rentals</p>
        </div>
        
        <div className="flex bg-white rounded-xl shadow-sm border border-slate-100 p-1 w-full sm:w-auto">
          <button 
            onClick={() => setActiveTab('active')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${activeTab === 'active' ? 'text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            style={activeTab === 'active' ? { backgroundColor: theme.primary } : {}}
          >
            <Truck className="h-4 w-4" /> Active
          </button>
          <button 
            onClick={() => setActiveTab('inventory')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${activeTab === 'inventory' ? 'text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            style={activeTab === 'inventory' ? { backgroundColor: theme.primary } : {}}
          >
            <Package className="h-4 w-4" /> Inventory
          </button>
          <button 
            onClick={() => setActiveTab('calendar')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${activeTab === 'calendar' ? 'text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            style={activeTab === 'calendar' ? { backgroundColor: theme.primary } : {}}
          >
            <CalendarDays className="h-4 w-4" /> Schedule
          </button>
        </div>
      </div>

      {activeTab === 'active' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in zoom-in-95 duration-300">
          <div className="lg:col-span-2 space-y-4">
            <Card className="shadow-sm border-slate-100">
              <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold uppercase tracking-widest text-slate-800">Current Rentals</CardTitle>
                  <CardDescription className="text-xs">Items currently rented out</CardDescription>
                </div>
                <Dialog open={showNewBookingModal} onOpenChange={setShowNewBookingModal}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="text-white rounded-lg h-9 border-none" style={{ backgroundColor: theme.primary }}>
                      <Plus className="h-4 w-4 mr-1" /> New Booking
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create New Booking</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      if (bookingPaymentTiming === 'upfront' && bookingPaymentMethod === 'gcash') {
                        setShowNewBookingModal(false);
                        setShowGCashQr(true);
                      } else {
                        handleAddBooking();
                      }
                    }} className="space-y-4 mt-4">
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Item to Rent</label>
                        <select 
                          required
                          value={bookingItemId}
                          onChange={(e) => setBookingItemId(e.target.value)}
                          className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 mt-1"
                        >
                          <option value="">Select Item</option>
                          {inventory.map(i => (
                            <option key={i.id} value={i.id}>{i.name} (₱{i.dailyRate}/day)</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Customer Name</label>
                        <Input id="booking-customer" name="bookingCustomer" required type="text" value={bookingCustomer} onChange={e => setBookingCustomer(e.target.value)} className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 mt-1" placeholder="Juan Dela Cruz" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Total Cost (₱)</label>
                        <Input id="booking-cost" name="bookingCost" required type="number" value={bookingCost} onChange={e => setBookingCost(e.target.value)} className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 mt-1" placeholder="5000" />
                      </div>
                      <div className="pt-2 border-t border-slate-100">
                        <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Payment Timing</label>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setBookingPaymentTiming('upfront')} className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${bookingPaymentTiming === 'upfront' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                            Pay Now
                          </button>
                          <button type="button" onClick={() => setBookingPaymentTiming('return')} className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${bookingPaymentTiming === 'return' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                            Pay Later
                          </button>
                        </div>
                      </div>
                      {bookingPaymentTiming === 'upfront' && (
                        <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                          <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Payment Method</label>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setBookingPaymentMethod('cash')} className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all flex items-center justify-center gap-1 ${bookingPaymentMethod === 'cash' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                              Cash
                            </button>
                            <button type="button" onClick={() => setBookingPaymentMethod('gcash')} className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all flex items-center justify-center gap-1 ${bookingPaymentMethod === 'gcash' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                              GCash
                            </button>
                          </div>
                        </div>
                      )}
                      <Button type="submit" disabled={isAddingBooking} className="w-full text-white border-none mt-4" style={{ backgroundColor: theme.primary }}>
                        {isAddingBooking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Booking'}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0">
                {bookingsLoading ? (
                  <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
                ) : activeBookings.length === 0 ? (
                  <div className="p-12 text-center text-slate-400">
                    <Truck className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <p className="font-medium text-sm">No active rentals right now.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {activeBookings.map(booking => (
                      <div key={booking.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{booking.itemName}</p>
                          <p className="text-xs text-slate-500">{booking.customerName} • ₱{booking.totalCost} 
                            <span className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ${booking.paymentStatus === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                              {booking.paymentStatus === 'paid' ? 'PAID' : 'UNPAID'}
                            </span>
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={returningId === booking.id}
                            onClick={() => {
                              if (booking.paymentStatus === 'unpaid') {
                                 if (window.confirm(`This booking is UNPAID (₱${booking.totalCost}). Collect payment now and return item?`)) {
                                    handleReturnItem(booking);
                                 }
                              } else {
                                 handleReturnItem(booking);
                              }
                            }}
                            className="h-8 rounded-lg px-3 text-[10px] font-black text-emerald-600 border-emerald-200 hover:bg-emerald-50 flex items-center gap-1"
                          >
                            {returningId === booking.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                            Return
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          <div className="space-y-4">
            <Card className="shadow-sm border-slate-100" style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})` }}>
              <CardContent className="p-6">
                <p className="text-xs font-bold uppercase tracking-widest text-white/70 mb-1">Items Out</p>
                <h2 className="text-4xl font-black text-white">{activeBookings.length}</h2>
              </CardContent>
            </Card>
            <Card className="shadow-sm border-slate-100">
              <CardContent className="p-6">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Returning Today</p>
                <h2 className="text-2xl font-black text-slate-800">
                  {activeBookings.filter(b => {
                    const today = new Date().toDateString();
                    const end = b.endDate && typeof b.endDate === 'object' && 'toDate' in b.endDate ? b.endDate.toDate() : new Date(b.endDate as any);
                    return end.toDateString() === today;
                  }).length}
                </h2>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'inventory' && (
        <Card className="animate-in fade-in zoom-in-95 duration-300 shadow-sm border-slate-100">
          <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-slate-800">Equipment Catalog</CardTitle>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-slate-800 hover:bg-slate-900 text-white rounded-lg h-9">
                  <Plus className="h-4 w-4 mr-1" /> Add Item
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Inventory Item</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddItem} className="space-y-4 mt-4">
                  <div>
                    <label htmlFor="item-name" className="text-xs font-bold text-slate-500 uppercase">Item Name</label>
                    <Input id="item-name" name="itemName" required type="text" value={itemName} onChange={e => setItemName(e.target.value)} className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 mt-1" placeholder="e.g. Caterpillar Excavator" />
                  </div>
                  <div>
                    <label htmlFor="item-category" className="text-xs font-bold text-slate-500 uppercase">Category</label>
                    <Input id="item-category" name="itemCategory" required type="text" value={itemCategory} onChange={e => setItemCategory(e.target.value)} className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 mt-1" placeholder="e.g. Heavy Machinery" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="item-rate" className="text-xs font-bold text-slate-500 uppercase">Daily Rate (₱)</label>
                      <Input id="item-rate" name="itemRate" required type="number" value={itemRate} onChange={e => setItemRate(e.target.value)} className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 mt-1" placeholder="5000" />
                    </div>
                    <div>
                      <label htmlFor="item-qty" className="text-xs font-bold text-slate-500 uppercase">Total Quantity</label>
                      <Input id="item-qty" name="itemQty" required type="number" value={itemQty} onChange={e => setItemQty(e.target.value)} className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 mt-1" placeholder="5" />
                    </div>
                  </div>
                  <Button type="submit" disabled={isAddingItem} className="w-full bg-slate-800 hover:bg-slate-900 text-white">
                    {isAddingItem ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Item'}
                  </Button>
                </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="p-0">
              {inventoryLoading ? (
                <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
              ) : inventory.length === 0 ? (
                <div className="p-12 text-center text-slate-400">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p className="font-medium text-sm">Inventory is empty. Add your first rental item.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {inventory.map(item => (
                    <div key={item.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                      <div>
                        <p className="font-bold text-slate-800 text-sm">{item.name}</p>
                        <p className="text-xs text-slate-500">{item.category}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-800 text-sm">{item.availableQuantity} / {item.totalQuantity} Available</p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">₱{item.dailyRate}/day</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
        </Card>
      )}

      {activeTab === 'calendar' && (
        <Card className="animate-in fade-in zoom-in-95 duration-300 shadow-sm border-slate-100">
           <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-slate-800">Booking Schedule</CardTitle>
            </CardHeader>
            <CardContent className="p-12 text-center text-slate-400">
              <CalendarDays className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p className="font-medium text-sm">Select dates to view upcoming reservations.</p>
            </CardContent>
        </Card>
      )}

      <ThermalReceiptPreview
        open={showReceipt}
        onClose={() => setShowReceipt(false)}
        storeName={currentTenant?.name || "Katuwang Rental"}
        receiptType="RENTAL BOOKING CONFIRMATION"
        items={completedSale?.items || []}
        totalAmountPesos={(completedSale?.total || 0) / 100}
        paymentMethod={completedSale?.paymentMethod || "cash"}
        transactionId={completedSale?.saleId}
        theme={theme}
      />
      
    </div>
  );
}
