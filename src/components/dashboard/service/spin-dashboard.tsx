"use client"

import React, { useState, useEffect } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { doc, collection, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { completeServiceOrder } from '@/firebase/firestore/service-actions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getModuleTheme, useDynamicThemeColor } from '@/lib/theme-utils';
import { useLaundry } from '@/hooks/use-laundry';
import { useToast } from '@/hooks/use-toast';
import { 
  Shirt, 
  Plus, 
  WashingMachine,
  CheckCircle2,
  Package,
  CircleDollarSign,
  Droplets
} from "lucide-react";

const RATES: Record<string, number> = {
  'Wash & Fold': 30,
  'Wash, Dry, Fold': 40,
  'Dry Clean': 100,
  'Ironing': 50,
};

export function SpinDashboard() {
  const { currentTenant } = useTenant();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [isProcessing, setIsProcessing] = useState(false);

  const theme = getModuleTheme(currentTenant?.moduleType);
  useDynamicThemeColor(theme);

  // Laundry State
  const { queuedOrders, washingOrders, readyOrders, claimedOrders, loading } = useLaundry();

  // Create Drop-off Form
  const [showAddForm, setShowAddForm] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [kilos, setKilos] = useState<number | ''>('');
  const [serviceType, setServiceType] = useState('Wash, Dry, Fold');
  const [priceOverride, setPriceOverride] = useState<number | ''>('');

  // Auto-calculate suggested price
  const suggestedPrice = typeof kilos === 'number' ? kilos * RATES[serviceType] : 0;
  const finalPrice = typeof priceOverride === 'number' ? priceOverride : suggestedPrice;

  const handleAddDropoff = async () => {
    if (!currentTenant || !db || !customerName || !kilos) return;
    setIsProcessing(true);
    try {
      const orderRef = doc(collection(db, 'tenants', currentTenant.id, 'laundry_orders'));
      await setDoc(orderRef, {
        tenantId: currentTenant.id,
        customerName,
        kilos,
        serviceType,
        status: 'Queued',
        amountDue: Math.round(finalPrice * 100), // convert to cents securely
        paymentStatus: 'Unpaid',
        createdAt: serverTimestamp(),
      });
      setCustomerName('');
      setKilos('');
      setPriceOverride('');
      setShowAddForm(false);
      toast({ title: 'Drop-off Recorded!', description: `Laundry for ${customerName} added to queue.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const updateStatus = async (order: any, status: string, paymentStatus?: string) => {
    if (!currentTenant || !db) return;
    try {
      if (paymentStatus === 'Paid') {
        // ERP INTEGRATION: Complete order and collect payment
        await completeServiceOrder(
          currentTenant.id,
          'laundry_orders',
          order.id,
          status,
          order.amountDue || 0,
          `Laundry: ${order.customerName} (${order.kilos}kg)`
        );
      } else {
        const orderRef = doc(db, 'tenants', currentTenant.id, 'laundry_orders', order.id);
        const updates: any = { status, updatedAt: serverTimestamp() };
        if (paymentStatus) updates.paymentStatus = paymentStatus;
        await updateDoc(orderRef, updates);
      }
      toast({ title: 'Status Updated', description: `Order moved to ${status}.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const OrderCard = ({ order, actions }: { order: any, actions: React.ReactNode }) => (
    <Card className="shadow-sm border-slate-200 mb-3">
      <CardContent className="p-3">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h4 className="font-bold text-slate-800 text-sm">{order.customerName}</h4>
            <p className="text-xs text-slate-500">{order.kilos} kg • {order.serviceType}</p>
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
              <WashingMachine className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-headline font-bold">{currentTenant?.name || 'Laundry Shop'}</h3>
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
              <CardTitle className="text-sm font-bold flex items-center gap-2"><Shirt className="h-4 w-4" /> New Drop-off</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3 pt-0">
              <div className="space-y-1">
                <Label className="text-xs">Customer Name</Label>
                <Input placeholder="e.g. Juan Cruz" value={customerName} onChange={e => setCustomerName(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Weight (Kilos)</Label>
                  <Input type="number" placeholder="0" value={kilos} onChange={e => setKilos(parseFloat(e.target.value) || '')} />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Service</Label>
                  <select 
                    className="w-full border-slate-200 rounded-md border p-2 text-sm h-9"
                    value={serviceType}
                    onChange={(e) => setServiceType(e.target.value)}
                  >
                    {Object.keys(RATES).map(type => (
                      <option key={type} value={type}>{type} (₱{RATES[type]}/kg)</option>
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
                onClick={handleAddDropoff}
                disabled={isProcessing || !customerName || !kilos}
              >
                Log Laundry
              </Button>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="text-center py-8 text-sm text-slate-400">Loading orders...</div>
        ) : (
          <div className="flex flex-col md:flex-row gap-4 overflow-x-auto pb-4">
            
            {/* Queued Column */}
            <div className="flex-1 min-w-[300px]">
              <div className="flex items-center gap-2 mb-3 px-1">
                <Package className="h-4 w-4 text-amber-500" />
                <h4 className="font-bold text-sm text-slate-700">Queued</h4>
                <Badge variant="secondary" className="bg-white ml-auto">{queuedOrders.length}</Badge>
              </div>
              <div className="space-y-2">
                {queuedOrders.map(order => (
                  <OrderCard key={order.id} order={order} actions={
                    <Button size="sm" className="w-full h-7 text-[10px] bg-slate-800" onClick={() => updateStatus(order, 'Washing')}>
                      <Droplets className="h-3 w-3 mr-1" /> Start Washing
                    </Button>
                  } />
                ))}
              </div>
            </div>

            {/* Washing Column */}
            <div className="flex-1 min-w-[300px]">
              <div className="flex items-center gap-2 mb-3 px-1">
                <Droplets className="h-4 w-4 text-cyan-500" />
                <h4 className="font-bold text-sm text-slate-700">Washing / Drying</h4>
                <Badge variant="secondary" className="bg-white ml-auto">{washingOrders.length}</Badge>
              </div>
              <div className="space-y-2">
                {washingOrders.map(order => (
                  <OrderCard key={order.id} order={order} actions={
                    <Button size="sm" className="w-full h-7 text-[10px] bg-indigo-500 hover:bg-indigo-600" onClick={() => updateStatus(order, 'Ready')}>
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Mark Ready
                    </Button>
                  } />
                ))}
              </div>
            </div>

            {/* Ready Column */}
            <div className="flex-1 min-w-[300px]">
              <div className="flex items-center gap-2 mb-3 px-1">
                <Shirt className="h-4 w-4 text-emerald-500" />
                <h4 className="font-bold text-sm text-slate-700">Ready for Pickup</h4>
                <Badge variant="secondary" className="bg-white ml-auto">{readyOrders.length}</Badge>
              </div>
              <div className="space-y-2">
                {readyOrders.map(order => (
                  <OrderCard key={order.id} order={order} actions={
                    <Button size="sm" className="w-full h-7 text-[10px] bg-emerald-500 hover:bg-emerald-600" onClick={() => updateStatus(order, 'Claimed', 'Paid')}>
                      <CircleDollarSign className="h-3 w-3 mr-1" /> Pay & Claim
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
