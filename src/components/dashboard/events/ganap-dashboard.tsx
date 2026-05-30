"use client"

import React, { useState } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { doc, collection, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { completeEvent, payEventVendor } from '@/firebase/firestore/events-actions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getModuleTheme, useDynamicThemeColor } from '@/lib/theme-utils';
import { useEvents } from '@/hooks/use-events';
import { useToast } from '@/hooks/use-toast';
import { 
  CalendarHeart, 
  Plus, 
  MapPin,
  Clock,
  UserCircle,
  Truck,
  CheckCircle2,
  ChefHat,
  ChevronRight,
  ArrowLeft
} from "lucide-react";
import { EventModel } from '@/lib/schemas/events';

export function GanapDashboard() {
  const { currentTenant } = useTenant();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [isProcessing, setIsProcessing] = useState(false);

  const theme = getModuleTheme(currentTenant?.moduleType);
  useDynamicThemeColor(theme);

  // Events State
  const { events, upcomingEvents, ongoingEvents, pastEvents, loading: eventsLoading } = useEvents();

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
        status: 'Upcoming',
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

  const updateEventStatus = async (id: string, status: 'Upcoming' | 'Ongoing' | 'Done') => {
    if (!currentTenant || !db) return;
    try {
      if (status === 'Done') {
        await completeEvent(currentTenant.id, id, selectedEvent?.contractPrice || 0, `Event: ${selectedEvent?.title}`);
      } else {
        const eventRef = doc(db, 'tenants', currentTenant.id, 'events', id);
        await updateDoc(eventRef, { status, updatedAt: serverTimestamp() });
      }
      if (selectedEvent?.id === id) {
        setSelectedEvent({ ...selectedEvent, status });
      }
      toast({ title: 'Status Updated', description: `Event moved to ${status}.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
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

  // RENDER EVENT DETAIL VIEW
  if (selectedEvent) {
    return (
      <div className="flex-1 flex flex-col bg-slate-50 min-h-screen">
        <main className="p-4 space-y-4 pb-24">
          
          <Button variant="ghost" className="pl-0 -ml-2 text-slate-500 font-bold mb-2" onClick={() => setSelectedEvent(null)}>
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
              <Badge className={
                selectedEvent.status === 'Upcoming' ? 'bg-amber-100 text-amber-700' :
                selectedEvent.status === 'Ongoing' ? 'bg-cyan-100 text-cyan-700' : 'bg-emerald-100 text-emerald-700'
              }>{selectedEvent.status}</Badge>
            </CardHeader>

            <CardContent className="p-4 space-y-6">
              
              {/* Status Controls */}
              <div className="flex gap-2">
                <Button size="sm" variant={selectedEvent.status === 'Ongoing' ? 'default' : 'outline'} className="flex-1" onClick={() => updateEventStatus(selectedEvent.id!, 'Ongoing')}>
                  <CalendarHeart className="h-4 w-4 mr-1" /> Start Event
                </Button>
                <Button size="sm" variant={selectedEvent.status === 'Done' ? 'default' : 'outline'} className="flex-1" onClick={() => updateEventStatus(selectedEvent.id!, 'Done')}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Mark Done
                </Button>
              </div>

              {/* Payment Tracking */}
              <div className="bg-slate-100 p-3 rounded-lg border border-slate-200 flex justify-between items-center">
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

              {/* Logistics & Setup */}
              <div className="space-y-3">
                <h4 className="font-bold flex items-center gap-2"><ChefHat className="h-4 w-4 text-orange-500" /> Setup & Logistics</h4>
                <div className="space-y-2">
                  <Label className="text-xs">Food Package</Label>
                  <Input 
                    placeholder="e.g. Bronze Buffet Package" 
                    value={selectedEvent.foodPackage || ''} 
                    onChange={e => setSelectedEvent({...selectedEvent, foodPackage: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Setup Notes</Label>
                  <Textarea 
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
                  <div key={i} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <div>
                      <p className="font-bold text-sm">{v.name}</p>
                      <p className="text-xs text-slate-500">{v.role} • {v.contact} • ₱{((v.cost || 0) / 100).toLocaleString()}</p>
                    </div>
                    {v.status === 'Paid' ? (
                      <Badge className="bg-emerald-100 text-emerald-700 border-transparent text-[10px]">PAID</Badge>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => markVendorPaid(i)}>
                        Mark Paid
                      </Button>
                    )}
                  </div>
                ))}

                <div className="bg-white p-3 border border-slate-200 rounded-lg space-y-2 mt-2 shadow-sm">
                  <p className="text-xs font-bold text-slate-500">Assign New Vendor</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="Role (e.g. Florist)" className="text-xs h-8" value={newVendorRole} onChange={e=>setNewVendorRole(e.target.value)} />
                    <Input placeholder="Name" className="text-xs h-8" value={newVendorName} onChange={e=>setNewVendorName(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="Contact No." className="text-xs h-8" value={newVendorContact} onChange={e=>setNewVendorContact(e.target.value)} />
                    <Input type="number" placeholder="Fee (₱)" className="text-xs h-8" value={newVendorCost} onChange={e=>setNewVendorCost(parseFloat(e.target.value) || '')} />
                  </div>
                  <Button size="sm" variant="secondary" className="w-full h-8 text-xs" onClick={addVendor}>+ Assign</Button>
                </div>

              </div>
            </CardContent>
          </Card>
        </main>
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
                ₱{(upcomingEvents.reduce((acc, ev) => acc + (ev.contractPrice || 0), 0) / 100).toLocaleString()}
              </p>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-500">Completed Value</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-xl font-black text-emerald-600">
                ₱{(pastEvents.reduce((acc, ev) => acc + (ev.contractPrice || 0), 0) / 100).toLocaleString()}
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
                <Label className="text-xs">Event Title</Label>
                <Input placeholder="e.g. Reyes Wedding" value={newEventTitle} onChange={e => setNewEventTitle(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Client Name</Label>
                  <Input placeholder="John & Jane" value={newClientName} onChange={e => setNewClientName(e.target.value)} />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Date</Label>
                  <Input type="date" value={newEventDate} onChange={e => setNewEventDate(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Venue</Label>
                  <Input placeholder="e.g. The Glass Garden" value={newVenue} onChange={e => setNewVenue(e.target.value)} />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Contract Price (₱)</Label>
                  <Input type="number" placeholder="0" value={newContractPrice} onChange={e => setNewContractPrice(parseFloat(e.target.value) || '')} />
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
          <Tabs defaultValue="upcoming" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-4 rounded-xl">
              <TabsTrigger value="upcoming" className="rounded-lg text-xs md:text-sm font-bold">Upcoming ({upcomingEvents.length})</TabsTrigger>
              <TabsTrigger value="ongoing" className="rounded-lg text-xs md:text-sm font-bold">Ongoing ({ongoingEvents.length})</TabsTrigger>
              <TabsTrigger value="done" className="rounded-lg text-xs md:text-sm font-bold">Done ({pastEvents.length})</TabsTrigger>
            </TabsList>

            {[
              { id: 'upcoming', data: upcomingEvents, empty: 'No upcoming events.' },
              { id: 'ongoing', data: ongoingEvents, empty: 'No ongoing events right now.' },
              { id: 'done', data: pastEvents, empty: 'No completed events yet.' }
            ].map(tab => (
              <TabsContent key={tab.id} value={tab.id} className="space-y-3 animate-in slide-in-from-bottom-4 duration-300">
                {tab.data.length === 0 ? (
                  <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl text-slate-400">
                    <p className="text-xs font-medium">{tab.empty}</p>
                  </div>
                ) : (
                  tab.data.map(event => (
                    <Card key={event.id} className="shadow-sm border-slate-200 cursor-pointer active:scale-95 transition-transform" onClick={() => setSelectedEvent(event)}>
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
