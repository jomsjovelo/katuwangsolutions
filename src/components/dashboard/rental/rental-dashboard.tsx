"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Truck, Package, CalendarDays, Plus, Loader2 } from "lucide-react";
import { useRental } from '@/hooks/use-rental';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useTenant } from '@/app/lib/tenant-context';

export function RentalDashboard() {
  const [activeTab, setActiveTab] = useState<'active' | 'inventory' | 'calendar'>('active');
  const { inventory, inventoryLoading, activeBookings, bookingsLoading } = useRental();
  const db = useFirestore();
  const { currentTenant } = useTenant();

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
      // close modal can be handled by setting a state or just let the uncontrolled trigger do it,
      // but here we just reset.
    } catch (error) {
      console.error(error);
    } finally {
      setIsAddingItem(false);
    }
  };

  // Add Booking State
  const [isAddingBooking, setIsAddingBooking] = useState(false);
  const [bookingItemId, setBookingItemId] = useState('');
  const [bookingCustomer, setBookingCustomer] = useState('');
  const [bookingCost, setBookingCost] = useState('');

  const handleAddBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !currentTenant) return;
    setIsAddingBooking(true);
    try {
      const selectedItem = inventory.find(i => i.id === bookingItemId);
      if (!selectedItem) throw new Error("Item not found");

      await addDoc(collection(db, 'tenants', currentTenant.id, 'rental_bookings'), {
        itemId: bookingItemId,
        itemName: selectedItem.name,
        customerId: 'guest', // hardcoded for now until we build customer picker
        customerName: bookingCustomer,
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000), // tomorrow
        status: 'active',
        totalCost: Number(bookingCost),
        depositStatus: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setBookingItemId(''); setBookingCustomer(''); setBookingCost('');
    } catch (error) {
      console.error(error);
    } finally {
      setIsAddingBooking(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 bg-slate-50 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 animate-in slide-in-from-top-2">
        <div>
          <h1 className="text-2xl font-headline font-black text-slate-800 tracking-tight uppercase flex items-center gap-2">
            <Truck className="h-6 w-6 text-amber-500" />
            Rental Management
          </h1>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">Equipment & Vehicle Rentals</p>
        </div>
        
        <div className="flex bg-white rounded-xl shadow-sm border border-slate-100 p-1 w-full sm:w-auto">
          <button 
            onClick={() => setActiveTab('active')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${activeTab === 'active' ? 'bg-amber-100 text-amber-700' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <Truck className="h-4 w-4" /> Active
          </button>
          <button 
            onClick={() => setActiveTab('inventory')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${activeTab === 'inventory' ? 'bg-amber-100 text-amber-700' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <Package className="h-4 w-4" /> Inventory
          </button>
          <button 
            onClick={() => setActiveTab('calendar')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${activeTab === 'calendar' ? 'bg-amber-100 text-amber-700' : 'text-slate-500 hover:bg-slate-50'}`}
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
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white rounded-lg h-9">
                      <Plus className="h-4 w-4 mr-1" /> New Booking
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create New Booking</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleAddBooking} className="space-y-4 mt-4">
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
                        <input required type="text" value={bookingCustomer} onChange={e => setBookingCustomer(e.target.value)} className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 mt-1" placeholder="Juan Dela Cruz" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Total Cost (₱)</label>
                        <input required type="number" value={bookingCost} onChange={e => setBookingCost(e.target.value)} className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 mt-1" placeholder="5000" />
                      </div>
                      <Button type="submit" disabled={isAddingBooking} className="w-full bg-amber-500 hover:bg-amber-600 text-white">
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
                          <p className="text-xs text-slate-500">{booking.customerName}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-amber-600 text-sm">₱{booking.totalCost}</p>
                          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">Active</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          <div className="space-y-4">
            <Card className="bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md border-none">
              <CardContent className="p-6">
                <p className="text-xs font-bold uppercase tracking-widest text-amber-100 mb-1">Items Out</p>
                <h2 className="text-4xl font-black">{activeBookings.length}</h2>
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
                      <label className="text-xs font-bold text-slate-500 uppercase">Item Name</label>
                      <input required type="text" value={itemName} onChange={e => setItemName(e.target.value)} className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 mt-1" placeholder="e.g. Caterpillar Excavator" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase">Category</label>
                      <input required type="text" value={itemCategory} onChange={e => setItemCategory(e.target.value)} className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 mt-1" placeholder="e.g. Heavy Machinery" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Daily Rate (₱)</label>
                        <input required type="number" value={itemRate} onChange={e => setItemRate(e.target.value)} className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 mt-1" placeholder="5000" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Total Quantity</label>
                        <input required type="number" value={itemQty} onChange={e => setItemQty(e.target.value)} className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 mt-1" placeholder="5" />
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

    </div>
  );
}
