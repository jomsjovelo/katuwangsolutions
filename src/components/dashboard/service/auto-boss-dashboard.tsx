"use client"

import React, { useState } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { doc, collection, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { completeServiceOrder } from '@/firebase/firestore/service-actions';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getModuleTheme, useDynamicThemeColor } from '@/lib/theme-utils';
import { useCarwashOrders } from '@/hooks/use-carwash';
import { useToast } from '@/hooks/use-toast';
import { 
  Car, 
  Plus, 
  Droplets,
  Wind,
  CheckCircle2,
  CircleDollarSign,
  AlignJustify
} from "lucide-react";

const VEHICLE_BASE_PRICE: Record<string, number> = {
  'Motorcycle': 100,
  'Sedan': 150,
  'SUV': 200,
  'Van': 250,
};

const PACKAGE_ADDON_PRICE: Record<string, number> = {
  'Basic Wash': 0,
  'Wash & Wax': 100,
  'Interior Detail': 500,
  'Full Detail': 1000,
};

export function AutoBossDashboard() {
  const { currentTenant } = useTenant();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [isProcessing, setIsProcessing] = useState(false);

  const theme = getModuleTheme(currentTenant?.moduleType);
  useDynamicThemeColor(theme);

  // Carwash State
  const { queuedOrders, washingOrders, dryingOrders, readyOrders, loading } = useCarwashOrders();

  // Create Drop-off Form
  const [showAddForm, setShowAddForm] = useState(false);
  const [plateNumber, setPlateNumber] = useState('');
  const [vehicleType, setVehicleType] = useState('Sedan');
  const [servicePackage, setServicePackage] = useState('Basic Wash');
  const [priceOverride, setPriceOverride] = useState<number | ''>('');

  // Auto-calculate suggested price
  const basePrice = VEHICLE_BASE_PRICE[vehicleType] || 0;
  const addonPrice = PACKAGE_ADDON_PRICE[servicePackage] || 0;
  const suggestedPrice = basePrice + addonPrice;
  const finalPrice = typeof priceOverride === 'number' ? priceOverride : suggestedPrice;

  const handleAddVehicle = async () => {
    if (!currentTenant || !db || !plateNumber || finalPrice < 0 || isNaN(finalPrice)) {
      if (finalPrice < 0 || isNaN(finalPrice)) toast({ title: 'Error', description: 'Invalid price.', variant: 'destructive' });
      return;
    }
    setIsProcessing(true);
    try {
      const orderRef = doc(collection(db, 'tenants', currentTenant.id, 'carwash_orders'));
      await setDoc(orderRef, {
        tenantId: currentTenant.id,
        plateNumber: plateNumber.toUpperCase(),
        vehicleType,
        servicePackage,
        status: 'Queued',
        amountDue: Math.round(finalPrice * 100), // convert to cents safely
        paymentStatus: 'Unpaid',
        createdAt: serverTimestamp(),
      });
      setPlateNumber('');
      setVehicleType('Sedan');
      setServicePackage('Basic Wash');
      setPriceOverride('');
      setShowAddForm(false);
      toast({ title: 'Vehicle Logged!', description: `Plate ${plateNumber.toUpperCase()} added to queue.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const updateStatus = async (order: any, status: string, paymentStatus?: string) => {
    if (!currentTenant || !db) return;
    try {
      if (status === 'Completed' && paymentStatus === 'Paid') {
        await completeServiceOrder(
          currentTenant.id, 
          'carwash_orders', 
          order.id, 
          status, 
          order.amountDue, 
          `Carwash: ${order.plateNumber}`
        );
      } else {
        const orderRef = doc(db, 'tenants', currentTenant.id, 'carwash_orders', order.id);
        const updates: any = { status, updatedAt: serverTimestamp() };
        if (paymentStatus) updates.paymentStatus = paymentStatus;
        await updateDoc(orderRef, updates);
      }
      toast({ title: 'Status Updated', description: `Vehicle moved to ${status}.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const OrderCard = ({ order, actions }: { order: any, actions: React.ReactNode }) => (
    <Card className="shadow-sm border-slate-200 mb-3">
      <CardContent className="p-3">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h4 className="font-bold text-slate-800 tracking-widest text-sm bg-slate-100 px-2 py-0.5 rounded border border-slate-200 inline-block mb-1">
              {order.plateNumber}
            </h4>
            <p className="text-xs text-slate-500 font-medium">{order.vehicleType} • {order.servicePackage}</p>
          </div>
          <div className="text-right">
            <Badge variant="outline" className={order.paymentStatus === 'Paid' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}>
              {order.paymentStatus}
            </Badge>
            <p className="text-sm font-bold text-slate-700 mt-1">₱{(order.amountDue / 100).toLocaleString()}</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          {actions}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-h-screen">
      <main className="p-4 space-y-4 pb-24">
        
        <section className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div 
              className="p-2 rounded-xl transition-colors duration-300"
              style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
            >
              <Car className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-headline font-bold">{currentTenant?.name || 'Car Wash'}</h3>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">{theme.name}</p>
            </div>
          </div>
          <Button size="sm" className="h-8 w-8 rounded-full p-0" onClick={() => setShowAddForm(!showAddForm)} style={{ backgroundColor: theme.primary }}>
            <Plus className="h-4 w-4" />
          </Button>
        </section>

        {showAddForm && (
          <Card className="shadow-sm border-slate-200 bg-white border-l-4" style={{ borderLeftColor: theme.primary }}>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2"><Car className="h-4 w-4" /> New Vehicle Arrival</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3 pt-0">
              <div className="space-y-1">
                <Label className="text-xs">Plate Number</Label>
                <Input placeholder="e.g. ABC 1234" value={plateNumber} onChange={e => setPlateNumber(e.target.value)} className="uppercase" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Vehicle Type</Label>
                  <select 
                    className="w-full border-slate-200 rounded-md border p-2 text-sm h-9"
                    value={vehicleType}
                    onChange={(e) => setVehicleType(e.target.value)}
                  >
                    {Object.keys(VEHICLE_BASE_PRICE).map(type => (
                      <option key={type} value={type}>{type} (₱{VEHICLE_BASE_PRICE[type]})</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Service Package</Label>
                  <select 
                    className="w-full border-slate-200 rounded-md border p-2 text-sm h-9"
                    value={servicePackage}
                    onChange={(e) => setServicePackage(e.target.value)}
                  >
                    {Object.keys(PACKAGE_ADDON_PRICE).map(type => (
                      <option key={type} value={type}>{type} (+₱{PACKAGE_ADDON_PRICE[type]})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex justify-between">
                  <span>Total Price (₱)</span>
                  <span className="text-muted-foreground">Suggested: ₱{suggestedPrice}</span>
                </Label>
                <Input type="number" placeholder={`₱${suggestedPrice}`} value={priceOverride} onChange={e => setPriceOverride(parseFloat(e.target.value) || '')} />
              </div>
              <Button 
                className="w-full h-8 text-xs font-bold text-white" 
                style={{ backgroundColor: theme.primary }}
                onClick={handleAddVehicle}
                disabled={isProcessing || !plateNumber}
              >
                Log Vehicle
              </Button>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="text-center py-8 text-sm text-slate-400">Loading bay slots...</div>
        ) : (
          <div className="flex flex-col md:flex-row gap-4 overflow-x-auto pb-4">
            
            {/* Queued Column */}
            <div className="flex-1 min-w-[280px]">
              <div className="flex items-center gap-2 mb-3 px-1">
                <AlignJustify className="h-4 w-4 text-amber-500" />
                <h4 className="font-bold text-sm text-slate-700">Waiting Line</h4>
                <Badge variant="secondary" className="bg-white ml-auto">{queuedOrders.length}</Badge>
              </div>
              <div className="space-y-2">
                {queuedOrders.map(order => (
                  <OrderCard key={order.id} order={order} actions={
                    <Button size="sm" className="w-full h-7 text-[10px] bg-slate-800 hover:bg-slate-700" onClick={() => updateStatus(order, 'Washing')}>
                      <Droplets className="h-3 w-3 mr-1 text-cyan-400" /> Move to Wash Bay
                    </Button>
                  } />
                ))}
              </div>
            </div>

            {/* Washing Column */}
            <div className="flex-1 min-w-[280px]">
              <div className="flex items-center gap-2 mb-3 px-1">
                <Droplets className="h-4 w-4 text-cyan-500" />
                <h4 className="font-bold text-sm text-slate-700">Washing</h4>
                <Badge variant="secondary" className="bg-white ml-auto">{washingOrders.length}</Badge>
              </div>
              <div className="space-y-2">
                {washingOrders.map(order => (
                  <OrderCard key={order.id} order={order} actions={
                    <Button size="sm" className="w-full h-7 text-[10px] bg-cyan-600 hover:bg-cyan-700 text-white" onClick={() => updateStatus(order, 'Drying')}>
                      <Wind className="h-3 w-3 mr-1 text-sky-200" /> Move to Drying
                    </Button>
                  } />
                ))}
              </div>
            </div>

            {/* Drying Column */}
            <div className="flex-1 min-w-[280px]">
              <div className="flex items-center gap-2 mb-3 px-1">
                <Wind className="h-4 w-4 text-sky-400" />
                <h4 className="font-bold text-sm text-slate-700">Drying / Detailing</h4>
                <Badge variant="secondary" className="bg-white ml-auto">{dryingOrders.length}</Badge>
              </div>
              <div className="space-y-2">
                {dryingOrders.map(order => (
                  <OrderCard key={order.id} order={order} actions={
                    <Button size="sm" className="w-full h-7 text-[10px] bg-indigo-500 hover:bg-indigo-600" onClick={() => updateStatus(order, 'Ready')}>
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Mark Ready
                    </Button>
                  } />
                ))}
              </div>
            </div>

            {/* Ready Column */}
            <div className="flex-1 min-w-[280px]">
              <div className="flex items-center gap-2 mb-3 px-1">
                <Car className="h-4 w-4 text-emerald-500" />
                <h4 className="font-bold text-sm text-slate-700">Ready for Release</h4>
                <Badge variant="secondary" className="bg-white ml-auto">{readyOrders.length}</Badge>
              </div>
              <div className="space-y-2">
                {readyOrders.map(order => (
                  <OrderCard key={order.id} order={order} actions={
                    <Button size="sm" className="w-full h-7 text-[10px] bg-emerald-500 hover:bg-emerald-600" onClick={() => updateStatus(order, 'Completed', 'Paid')}>
                      <CircleDollarSign className="h-3 w-3 mr-1" /> Pay & Release
                    </Button>
                  } />
                ))}
              </div>
            </div>

          </div>
        )}

      </main>
    </div>
  );
}
