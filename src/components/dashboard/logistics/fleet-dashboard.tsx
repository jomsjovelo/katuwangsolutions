"use client"

import React, { useState } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { useCollection } from 'react-firebase-hooks/firestore';
import { collection, query, orderBy, getFirestore } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase/index';
import { addTrip, updateTripStatus } from '@/firebase/firestore/logistics-actions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getModuleTheme, useDynamicThemeColor } from '@/lib/theme-utils';
import { 
  Truck, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  Plus, 
  Navigation,
  Loader2,
  AlertCircle,
  Tractor
} from "lucide-react";

export function FleetDashboard() {
  const { currentTenant } = useTenant();
  const db = getFirestore(initializeFirebase().app, 'katuwang');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dynamically resolve Katuwang industry theme based on active tenant's moduleType
  const theme = getModuleTheme(currentTenant?.moduleType);
  
  // Immersive dynamic status bar viewport tracking for PWA Android/iOS notch
  useDynamicThemeColor(theme);

  // Live stream of trips
  const tripsQuery = currentTenant 
    ? query(
        collection(db, 'tenants', currentTenant.id, 'trips'),
        orderBy('createdAt', 'desc')
      )
    : null;

  const [tripsSnapshot, loading, hookError] = useCollection(tripsQuery as any);
  
  const trips = tripsSnapshot?.docs.map((doc: any) => ({
    id: doc.id,
    ...doc.data()
  })) || [];

  const plannedTrips = trips.filter((t: any) => t.status === 'planned');
  const activeTrips = trips.filter((t: any) => t.status === 'in_transit' || t.status === 'loading');

  const handleAddTestTrip = async () => {
    if (!currentTenant) return;
    try {
      setIsProcessing(true);
      setError(null);
      await addTrip(currentTenant.id, 'Manila Warehouse', 'Cebu Port', '100 Sacks of Rice');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const moveTrip = async (id: string, newStatus: 'planned' | 'loading' | 'in_transit' | 'arrived' | 'completed' | 'cancelled', amount?: number, destination?: string) => {
    if (!currentTenant) return;
    try {
      setIsProcessing(true);
      setError(null);
      await updateTripStatus(currentTenant.id, id, newStatus, amount, destination);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const isFarm = currentTenant?.moduleType === 'ani-grow';

  return (
    <div className="flex-1 flex flex-col bg-slate-50">
      <main className="p-4 space-y-6 pb-20">
        
        {/* Header Section styled dynamically to reflect Ani-Grow or Biyahe-Sync branding */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div 
                className="p-2 rounded-xl transition-colors duration-300"
                style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
              >
                {isFarm ? <Tractor className="h-6 w-6" /> : <Truck className="h-6 w-6" />}
              </div>
              <div>
                <h3 className="text-lg font-headline font-bold">Dispatch Center</h3>
                <p className="text-xs text-muted-foreground font-medium">{theme.name} • {currentTenant?.name || 'Logistics'}</p>
              </div>
            </div>
            <Button 
              onClick={handleAddTestTrip} 
              disabled={isProcessing} 
              size="sm" 
              className="rounded-full shadow-md font-bold text-white border-none active:scale-95 transition-transform"
              style={{ backgroundColor: theme.primary }}
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />} 
              Dispatch Truck
            </Button>
          </div>
        </section>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-xl border border-red-200 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3">
          <Card 
            className="bg-white shadow-sm border transition-colors duration-300"
            style={{ borderColor: `${theme.primary}20` }}
          >
            <CardHeader className="p-3 pb-0">
              <CardDescription 
                className="text-[9px] font-black uppercase tracking-wider"
                style={{ color: theme.primary }}
              >
                On The Road
              </CardDescription>
              <CardTitle className="text-xl font-black">{activeTrips.length}</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1 text-[9px] font-bold text-muted-foreground uppercase flex items-center gap-1">
              Active Trips
            </CardContent>
          </Card>
          <Card className="bg-white border-slate-200 shadow-sm">
            <CardHeader className="p-3 pb-0">
              <CardDescription className="text-[9px] font-black uppercase tracking-wider text-slate-500">To Be Dispatched</CardDescription>
              <CardTitle className="text-xl font-black">{plannedTrips.length}</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1 text-[9px] font-bold text-muted-foreground uppercase flex items-center gap-1">
              Planned Trips
            </CardContent>
          </Card>
        </div>

        {/* Live Dispatch Board */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-2">
              <Navigation className="h-5 w-5" style={{ color: theme.primary }} />
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">Live Board</h3>
            </div>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{trips.length} Total</span>
          </div>

          <div className="grid gap-3">
            {loading && <div className="text-center py-4 text-xs text-slate-400">Loading Fleet stream...</div>}
            
            {trips.filter((t: any) => t.status !== 'completed').map((trip: any) => (
              <div 
                key={trip.id} 
                className={cn(
                  "bg-white border-2 rounded-xl overflow-hidden shadow-sm transition-all duration-300"
                )}
                style={trip.status === 'planned' ? {} : { borderColor: `${theme.primary}30` }}
              >
                {/* Trip Header */}
                <div 
                  className={cn(
                    "px-3 py-2 border-b flex items-center justify-between"
                  )}
                  style={trip.status === 'planned' ? {} : { backgroundColor: `${theme.primary}08`, borderColor: `${theme.primary}20` }}
                >
                  <div className="flex items-center gap-2">
                    <Badge 
                      className="font-black text-[9px] text-white border-transparent"
                      style={trip.status === 'planned' ? { backgroundColor: '#64748b' } : { backgroundColor: theme.primary }}
                    >
                      {trip.status.replace('_', ' ').toUpperCase()}
                    </Badge>
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                    {isFarm ? <Tractor className="h-3 w-3" /> : <Truck className="h-3 w-3" />}
                    {trip.assetName || 'Unassigned'}
                  </span>
                </div>

                {/* Route Info */}
                <div className="p-3 space-y-3">
                  <div className="relative pl-6 space-y-3">
                    <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-slate-200" />
                    <div className="relative">
                      <div className="absolute -left-6 top-0.5 h-3 w-3 rounded-full border-2 border-white bg-slate-300" />
                      <p className="text-xs font-bold text-slate-800">{trip.origin}</p>
                    </div>
                    <div className="relative">
                      <div 
                        className="absolute -left-6 top-0.5 h-3 w-3 rounded-full border-2 border-white"
                        style={{ backgroundColor: theme.primary }}
                      />
                      <p className="text-xs font-bold text-slate-800">{trip.destination}</p>
                    </div>
                  </div>

                  <div className="flex justify-between items-center bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <span className="text-[10px] text-slate-500 font-medium">Driver: <span className="font-bold text-slate-700">{trip.driverName || 'TBD'}</span></span>
                    <span className="text-[10px] text-slate-500 font-medium">Load: <span className="font-bold text-slate-700">{trip.load}</span></span>
                  </div>

                  {/* Actions */}
                  {trip.status === 'planned' && (
                    <Button 
                      onClick={() => moveTrip(trip.id, 'loading')} 
                      disabled={isProcessing} 
                      className="w-full h-9 font-bold text-[10px] uppercase tracking-widest text-white border-none"
                      style={{ backgroundColor: theme.primary }}
                    >
                      Assign & Start Loading
                    </Button>
                  )}
                  {trip.status === 'loading' && (
                    <Button 
                      onClick={() => moveTrip(trip.id, 'in_transit')} 
                      disabled={isProcessing}
                      className="w-full h-9 font-bold uppercase tracking-widest text-[10px] text-white border-none"
                      style={{ backgroundColor: theme.primary }}
                    >
                      Dispatch
                    </Button>
                  )}
                  {trip.status === 'in_transit' && (
                    <Button onClick={() => moveTrip(trip.id, 'completed', 150000, trip.destination)} disabled={isProcessing} className="w-full h-9 font-bold text-[10px] uppercase tracking-widest bg-emerald-500 text-white hover:bg-emerald-600">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Complete & Invoice
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

      </main>
    </div>
  );
}
