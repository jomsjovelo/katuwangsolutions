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
import { useFarmHarvests } from '@/hooks/use-farm';
import { useToast } from '@/hooks/use-toast';
import { GCashQrModal } from '@/components/common/gcash-qr-modal';
import { ThermalReceiptPreview } from '@/components/common/thermal-receipt-preview';
import { 
  Tractor, 
  Plus, 
  Sprout,
  Warehouse,
  Truck,
  CheckCircle2,
  CircleDollarSign,
  Receipt,
  Coins
} from "lucide-react";

export function FarmDashboard() {
  const { currentTenant } = useTenant();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [showGCashQr, setShowGCashQr] = useState(false);
  const [pendingPaymentHarvest, setPendingPaymentHarvest] = useState<any | null>(null);

  const [showReceipt, setShowReceipt] = useState(false);
  const [completedSale, setCompletedSale] = useState<{
    items: any[];
    total: number;
    paymentMethod: string;
    saleId?: string;
  } | null>(null);

  const theme = getModuleTheme(currentTenant?.moduleType);
  useDynamicThemeColor(theme);

  // Farm State
  const { harvests, loading, error } = useFarmHarvests();

  const plannedHarvests = harvests.filter(h => h.status === 'Planned');
  const inBodegaHarvests = harvests.filter(h => h.status === 'In Bodega');
  const dispatchedHarvests = harvests.filter(h => h.status === 'Dispatched');

  React.useEffect(() => {
    if (error) {
      console.error("Farm listener error:", error);
      toast({ title: 'Connection Error', description: 'Failed to sync harvests.', variant: 'destructive' });
    }
  }, [error, toast]);

  // Create Harvest Form
  const [showAddForm, setShowAddForm] = useState(false);
  const [cropType, setCropType] = useState('Palay (Rice)');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [unit, setUnit] = useState('Sacks');
  const [fieldLocation, setFieldLocation] = useState('');
  const [expectedValue, setExpectedValue] = useState<number | ''>('');

  const handleAddHarvest = async () => {
    if (!currentTenant || !db || !cropType || !quantity) return;
    setIsProcessing(true);
    try {
      const harvestRef = doc(collection(db, 'tenants', currentTenant.id, 'farm_harvests'));
      await setDoc(harvestRef, {
        tenantId: currentTenant.id,
        cropType,
        quantity,
        unit,
        fieldLocation,
        expectedValue: expectedValue || 0,
        status: 'Planned',
        paymentStatus: 'Unpaid',
        createdAt: serverTimestamp(),
      });
      setCropType('Palay (Rice)');
      setQuantity('');
      setUnit('Sacks');
      setFieldLocation('');
      setExpectedValue('');
      setShowAddForm(false);
      toast({ title: 'Harvest Planned!', description: `Harvest plan for ${cropType} created.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const updateStatus = async (harvest: any, status: string, paymentStatus?: string, paymentMethod: string = 'cash') => {
    if (!currentTenant || !db) return;
    try {
      if (status === 'Dispatched' && paymentStatus === 'Paid') {
        await completeServiceOrder(
          currentTenant.id, 
          'farm_harvests', 
          harvest.id, 
          status, 
          harvest.expectedValue * 100, // stored in expectedValue as whole peso
          `Agriculture: Sold ${harvest.quantity} ${harvest.unit} of ${harvest.cropType}`,
          undefined,
          {},
          paymentMethod
        );
        
        setCompletedSale({
          items: [{ name: `Harvest Sold: ${harvest.quantity} ${harvest.unit} ${harvest.cropType}`, quantity: 1, price: harvest.expectedValue * 100 }],
          total: harvest.expectedValue * 100,
          paymentMethod,
          saleId: harvest.id
        });
        setShowReceipt(true);
      } else {
        const harvestRef = doc(db, 'tenants', currentTenant.id, 'farm_harvests', harvest.id);
        const updates: any = { status, updatedAt: serverTimestamp() };
        if (paymentStatus) updates.paymentStatus = paymentStatus;
        await updateDoc(harvestRef, updates);
      }
      toast({ title: 'Status Updated', description: `Crop moved to ${status}.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const HarvestCard = ({ harvest, actions }: { harvest: any, actions: React.ReactNode }) => (
    <Card className="shadow-sm border-slate-200 mb-3 hover:shadow-md transition-shadow">
      <CardContent className="p-3">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
              {harvest.cropType}
            </h4>
            <div className="flex items-center gap-2 mt-1.5">
              <Badge variant="secondary" className="text-[10px] bg-amber-50 text-amber-600 border-amber-100">
                {harvest.quantity} {harvest.unit}
              </Badge>
              {harvest.fieldLocation && (
                <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                  Location: {harvest.fieldLocation}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <Badge variant="outline" className={harvest.paymentStatus === 'Paid' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}>
              {harvest.paymentStatus}
            </Badge>
            {harvest.expectedValue > 0 && (
              <p className="text-sm font-bold text-slate-700 mt-1">₱{(harvest.expectedValue).toLocaleString()}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
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
              <Tractor className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-headline font-bold">{currentTenant?.name || 'Farm Dashboard'}</h3>
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
              <CardTitle className="text-sm font-bold flex items-center gap-2"><Sprout className="h-4 w-4 text-emerald-600" /> New Harvest Plan</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3 pt-0">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="crop-type" className="text-xs">Crop Type</Label>
                  <Input id="crop-type" placeholder="e.g. Rice, Corn, Copra" value={cropType} onChange={e => setCropType(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="field-location" className="text-xs">Field / Plot</Label>
                  <Input id="field-location" placeholder="e.g. North Field" value={fieldLocation} onChange={e => setFieldLocation(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="quantity" className="text-xs">Quantity</Label>
                  <Input id="quantity" type="number" placeholder="0" value={quantity} onChange={e => setQuantity(parseFloat(e.target.value) || '')} />
                </div>
                <div className="flex-1 space-y-1">
                  <Label htmlFor="unit" className="text-xs">Unit</Label>
                  <select 
                    id="unit"
                    className="w-full border-slate-200 rounded-md border p-2 text-sm h-9"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                  >
                    <option value="Sacks">Sacks</option>
                    <option value="Kilos">Kilos</option>
                    <option value="Tons">Tons</option>
                    <option value="Boxes">Boxes</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="expected-value" className="text-xs">Expected Value (₱)</Label>
                <Input id="expected-value" type="number" placeholder="0" value={expectedValue} onChange={e => setExpectedValue(parseFloat(e.target.value) || '')} />
              </div>
              <Button 
                className="w-full h-8 text-xs font-bold text-white" 
                style={{ backgroundColor: theme.primary }}
                onClick={handleAddHarvest}
                disabled={isProcessing || !cropType || !quantity}
              >
                Log Harvest
              </Button>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="text-center py-8 text-sm text-slate-400">Loading farm records...</div>
        ) : (
          <div className="flex flex-col md:flex-row gap-4 overflow-x-auto pb-4">
            
            {/* Planned Harvest Column */}
            <div className="flex-1 min-w-[280px]">
              <div className="flex items-center gap-2 mb-3 px-1">
                <Sprout className="h-4 w-4 text-emerald-500" />
                <h4 className="font-bold text-sm text-slate-700">Ready to Harvest</h4>
                <Badge variant="secondary" className="bg-white ml-auto">{plannedHarvests.length}</Badge>
              </div>
              <div className="space-y-2">
                {plannedHarvests.map(harvest => (
                  <HarvestCard key={harvest.id} harvest={harvest} actions={
                    <Button size="sm" className="w-full h-7 text-[10px] bg-amber-600 hover:bg-amber-700" onClick={() => updateStatus(harvest, 'In Bodega')}>
                      <Warehouse className="h-3 w-3 mr-1 text-amber-200" /> Store in Bodega
                    </Button>
                  } />
                ))}
              </div>
            </div>

            {/* In Bodega Column */}
            <div className="flex-1 min-w-[280px]">
              <div className="flex items-center gap-2 mb-3 px-1">
                <Warehouse className="h-4 w-4 text-amber-600" />
                <h4 className="font-bold text-sm text-slate-700">Bodega (Inventory)</h4>
                <Badge variant="secondary" className="bg-white ml-auto">{inBodegaHarvests.length}</Badge>
              </div>
              <div className="space-y-2">
                {inBodegaHarvests.map(harvest => (
                  <HarvestCard key={harvest.id} harvest={harvest} actions={
                    <div className="flex gap-2 w-full">
                      <Button size="sm" className="flex-1 h-7 text-[10px] font-bold text-white border-none" style={{ backgroundColor: theme.primary }} onClick={() => updateStatus(harvest, 'Dispatched', 'Paid', 'cash')}>
                        <Coins className="h-3 w-3 mr-1" /> Cash
                      </Button>
                      <Button size="sm" className="flex-1 h-7 text-[10px] font-bold text-white border-none" style={{ backgroundColor: '#007aff' }} onClick={() => {
                        setPendingPaymentHarvest(harvest);
                        setShowGCashQr(true);
                      }}>
                        <Receipt className="h-3 w-3 mr-1" /> GCash
                      </Button>
                    </div>
                  } />
                ))}
              </div>
            </div>

            {/* Sold Column */}
            <div className="flex-1 min-w-[280px]">
              <div className="flex items-center gap-2 mb-3 px-1">
                <CheckCircle2 className="h-4 w-4 text-indigo-500" />
                <h4 className="font-bold text-sm text-slate-700">Sold / Dispatched</h4>
                <Badge variant="secondary" className="bg-white ml-auto">{dispatchedHarvests.length}</Badge>
              </div>
              <div className="space-y-2 opacity-70">
                {dispatchedHarvests.map(harvest => (
                  <HarvestCard key={harvest.id} harvest={harvest} actions={
                    <Button disabled size="sm" variant="outline" className="w-full h-7 text-[10px] font-bold text-indigo-600 border-indigo-200 bg-indigo-50">
                      Settled
                    </Button>
                  } />
                ))}
              </div>
            </div>

          </div>
        )}

      </main>

      <GCashQrModal
        open={showGCashQr}
        onClose={() => {
          setShowGCashQr(false);
          setPendingPaymentHarvest(null);
        }}
        totalAmount={(pendingPaymentHarvest?.expectedValue || 0) * 100}
        tenantName={currentTenant?.name || "Katuwang Farm"}
        paymentType="gcash"
        onPaymentVerified={async (paymentMethod, gcashRef) => {
          setShowGCashQr(false);
          if (pendingPaymentHarvest) {
            await updateStatus(pendingPaymentHarvest, 'Dispatched', 'Paid', paymentMethod);
            setPendingPaymentHarvest(null);
          }
        }}
        theme={theme}
      />
      
      <ThermalReceiptPreview
        open={showReceipt}
        onClose={() => setShowReceipt(false)}
        storeName={currentTenant?.name || "Katuwang Farm"}
        receiptType="HARVEST SALE RECEIPT"
        items={completedSale?.items || []}
        totalAmountPesos={(completedSale?.total || 0) / 100}
        paymentMethod={completedSale?.paymentMethod || "cash"}
        transactionId={completedSale?.saleId}
        theme={theme}
      />

    </div>
  );
}
