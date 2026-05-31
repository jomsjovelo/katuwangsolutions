"use client"

import React, { useState } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { useCollection } from 'react-firebase-hooks/firestore';
import { collection, query, orderBy } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { addTrip, updateTripStatus, updateTripExpenses } from '@/firebase/firestore/logistics-actions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { getModuleTheme, useDynamicThemeColor } from '@/lib/theme-utils';
import { useToast } from '@/hooks/use-toast';
import { 
  Truck, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  Plus, 
  Navigation,
  Loader2,
  Tractor,
  Banknote,
  Fuel
} from "lucide-react";

export function FleetDashboard() {
  const { currentTenant } = useTenant();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDispatchForm, setShowDispatchForm] = useState(false);

  // Dispatch Form State
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [loadDesc, setLoadDesc] = useState('');
  const [driver, setDriver] = useState('');
  const [fee, setFee] = useState<number | ''>('');

  // Expense Form State per Trip
  const [expenseInputs, setExpenseInputs] = useState<Record<string, number | ''>>({});

  const theme = getModuleTheme(currentTenant?.moduleType);
  useDynamicThemeColor(theme);

  const tripsQuery = currentTenant 
    ? query(collection(db, 'tenants', currentTenant.id, 'trips'), orderBy('createdAt', 'desc'))
    : null;

  const [tripsSnapshot, loading] = useCollection(tripsQuery as any);
  
  const trips = tripsSnapshot?.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })) || [];
  const plannedTrips = trips.filter((t: any) => t.status === 'planned');
  const activeTrips = trips.filter((t: any) => t.status === 'in_transit' || t.status === 'loading');

  const isFarm = currentTenant?.moduleType === 'ani-grow';

  const handleDispatch = async () => {
    if (!currentTenant || !origin || !destination) return;
    const feeVal = Number(fee || 0);
    if (feeVal < 0 || isNaN(feeVal)) {
      toast({ title: 'Error', description: 'Invalid delivery fee amount.', variant: 'destructive' });
      return;
    }
    try {
      setIsProcessing(true);
      await addTrip(currentTenant.id, origin, destination, loadDesc, driver, Math.round(feeVal * 100));
      setOrigin(''); setDestination(''); setLoadDesc(''); setDriver(''); setFee('');
      setShowDispatchForm(false);
      toast({ title: 'Truck Dispatched!', description: `Heading to ${destination}` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const moveTrip = async (id: string, newStatus: 'loading' | 'in_transit' | 'completed') => {
    if (!currentTenant) return;
    try {
      setIsProcessing(true);
      await updateTripStatus(currentTenant.id, id, newStatus);
      if (newStatus === 'completed') {
        toast({ title: 'Trip Completed', description: 'Fee and expenses synced to Ledger Flow.' });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddExpense = async (tripId: string) => {
    if (!currentTenant) return;
    const amount = expenseInputs[tripId];
    if (!amount || amount <= 0) return;

    try {
      setIsProcessing(true);
      await updateTripExpenses(currentTenant.id, tripId, Math.round(Number(amount) * 100));
      setExpenseInputs(prev => ({ ...prev, [tripId]: '' }));
      toast({ title: 'Expense Logged', description: `₱${amount} added to trip expenses.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-h-screen">
      <main className="p-4 space-y-6 pb-24">
        
        {/* Header Section */}
        <section className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl" style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}>
              {isFarm ? <Tractor className="h-6 w-6" /> : <Truck className="h-6 w-6" />}
            </div>
            <div>
              <h3 className="text-lg font-headline font-bold">Dispatch Center</h3>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">{theme.name} • Fleet</p>
            </div>
          </div>
          <Button 
            onClick={() => setShowDispatchForm(!showDispatchForm)} 
            size="sm" 
            className="rounded-full h-10 w-10 p-0 shadow-md font-bold text-white"
            style={{ backgroundColor: theme.primary }}
          >
            <Plus className="h-5 w-5" />
          </Button>
        </section>

        {/* Dispatch Form */}
        {showDispatchForm && (
          <Card className="shadow-sm border-l-4" style={{ borderLeftColor: theme.primary }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold">New Trip Dispatch</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase">Origin</Label>
                  <Input placeholder="e.g. QC" value={origin} onChange={e => setOrigin(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase">Destination</Label>
                  <Input placeholder="e.g. Makati" value={destination} onChange={e => setDestination(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase">Load Description</Label>
                <Input placeholder="e.g. 50 boxes of supplies" value={loadDesc} onChange={e => setLoadDesc(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase">Driver Name</Label>
                  <Input placeholder="e.g. Jun" value={driver} onChange={e => setDriver(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase">Delivery Fee (₱)</Label>
                  <Input type="number" placeholder="0.00" value={fee} onChange={e => setFee(Number(e.target.value) || '')} />
                </div>
              </div>
              <Button 
                onClick={handleDispatch}
                disabled={isProcessing || !origin || !destination}
                className="w-full mt-2 font-bold text-white"
                style={{ backgroundColor: theme.primary }}
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Truck className="h-4 w-4 mr-2" />}
                Dispatch Now
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-white shadow-sm border transition-colors duration-300" style={{ borderColor: `${theme.primary}20` }}>
            <CardHeader className="p-3 pb-0">
              <CardDescription className="text-[9px] font-black uppercase tracking-wider" style={{ color: theme.primary }}>On The Road</CardDescription>
              <CardTitle className="text-xl font-black">{activeTrips.length}</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1 text-[9px] font-bold text-muted-foreground uppercase flex items-center gap-1">Active Trips</CardContent>
          </Card>
          <Card className="bg-white border-slate-200 shadow-sm">
            <CardHeader className="p-3 pb-0">
              <CardDescription className="text-[9px] font-black uppercase tracking-wider text-slate-500">Pending</CardDescription>
              <CardTitle className="text-xl font-black">{plannedTrips.length}</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1 text-[9px] font-bold text-muted-foreground uppercase flex items-center gap-1">Planned Trips</CardContent>
          </Card>
        </div>

        {/* Live Dispatch Board */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Navigation className="h-4 w-4" style={{ color: theme.primary }} />
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-700">Live Board</h3>
            </div>
          </div>

          <div className="grid gap-3">
            {loading && <div className="text-center py-8 text-xs text-slate-400">Loading Fleet stream...</div>}
            
            {trips.filter((t: any) => t.status !== 'completed').map((trip: any) => (
              <div 
                key={trip.id} 
                className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm"
              >
                {/* Trip Header */}
                <div className="px-3 py-2 border-b bg-slate-50 flex items-center justify-between">
                  <Badge 
                    className="font-black text-[9px] text-white"
                    style={{ backgroundColor: trip.status === 'planned' ? '#64748b' : theme.primary }}
                  >
                    {trip.status.replace('_', ' ').toUpperCase()}
                  </Badge>
                  <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                    <Banknote className="h-3 w-3" />
                    ₱{((trip.deliveryFee || 0) / 100).toLocaleString()} Fee
                  </span>
                </div>

                {/* Route Info */}
                <div className="p-3 space-y-4">
                  <div className="relative pl-6 space-y-3">
                    <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-slate-200" />
                    <div className="relative">
                      <div className="absolute -left-6 top-0.5 h-3 w-3 rounded-full border-2 border-white bg-slate-300" />
                      <p className="text-xs font-bold text-slate-800">{trip.origin}</p>
                    </div>
                    <div className="relative">
                      <div className="absolute -left-6 top-0.5 h-3 w-3 rounded-full border-2 border-white" style={{ backgroundColor: theme.primary }} />
                      <p className="text-xs font-bold text-slate-800">{trip.destination}</p>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex justify-between items-center">
                    <div>
                      <p className="text-[9px] text-slate-400 font-bold uppercase">Driver</p>
                      <p className="text-xs font-bold text-slate-700">{trip.driverName || 'Unassigned'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] text-slate-400 font-bold uppercase">Load</p>
                      <p className="text-xs font-bold text-slate-700">{trip.loadDescription || 'None'}</p>
                    </div>
                  </div>

                  {/* Expense Tracking (for active trips) */}
                  {(trip.status === 'in_transit' || trip.status === 'loading') && (
                    <div className="pt-2 border-t border-dashed space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                          <Fuel className="h-3 w-3" /> Trip Expenses
                        </span>
                        <span className="text-xs font-bold text-red-500">
                          -₱{((trip.tripExpenses || 0) / 100).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Input 
                          placeholder="Gas/Toll (₱)" 
                          type="number"
                          className="h-8 text-xs"
                          value={expenseInputs[trip.id] || ''}
                          onChange={e => setExpenseInputs(prev => ({ ...prev, [trip.id]: Number(e.target.value) || '' }))}
                        />
                        <Button 
                          onClick={() => handleAddExpense(trip.id)}
                          disabled={isProcessing || !expenseInputs[trip.id]}
                          size="sm" 
                          variant="secondary"
                          className="h-8 text-xs font-bold"
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="pt-2">
                    {trip.status === 'planned' && (
                      <Button onClick={() => moveTrip(trip.id, 'loading')} disabled={isProcessing} className="w-full h-9 font-bold text-[10px] uppercase text-white" style={{ backgroundColor: theme.primary }}>
                        Start Loading
                      </Button>
                    )}
                    {trip.status === 'loading' && (
                      <Button onClick={() => moveTrip(trip.id, 'in_transit')} disabled={isProcessing} className="w-full h-9 font-bold text-[10px] uppercase text-white" style={{ backgroundColor: theme.primary }}>
                        Dispatch to Road
                      </Button>
                    )}
                    {trip.status === 'in_transit' && (
                      <Button onClick={() => moveTrip(trip.id, 'completed')} disabled={isProcessing} className="w-full h-9 font-bold text-[10px] uppercase bg-emerald-500 text-white hover:bg-emerald-600">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Mark Delivered
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

      </main>
    </div>
  );
}
