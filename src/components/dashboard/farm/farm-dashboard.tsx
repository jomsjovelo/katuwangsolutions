"use client"
import { usePinApproval } from '@/hooks/use-pin-approval';

import React, { useState } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { doc, collection, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { completeServiceOrder, deleteServiceOrder } from '@/firebase/firestore/service-actions';
import { useUser } from '@/firebase/auth/use-user';
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
import { ServicePaymentModal } from '@/components/common/service-payment-modal';
import { 
  Tractor, 
  Plus, 
  Sprout,
  Warehouse,
  CheckCircle2,
  Receipt,
  Coins,
  Trash2,
  Calendar,
  MapPin,
  Leaf
} from "lucide-react";

const HarvestCard = React.memo(({ harvest, actions, isOwner, handleDeleteHarvest }: { harvest: any, actions: React.ReactNode, isOwner: boolean, handleDeleteHarvest: (id: string) => void }) => (
  <Card className="shadow-sm border-slate-200 mb-3 hover:shadow-md transition-shadow">
    <CardContent className="p-3">
      <div className="flex justify-between items-start mb-3">
        <div className="flex gap-2">
          <div>
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
              {harvest.cropType}
            </h4>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <Badge variant="secondary" className="text-[10px] bg-amber-50 text-amber-600 border-amber-100">
                {harvest.quantity} {harvest.unit}
              </Badge>
              {harvest.fieldLocation && (
                <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {harvest.fieldLocation}
                </span>
              )}
              {harvest.expectedHarvestDate && harvest.status === 'Planted' && (
                <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Harvest: {harvest.expectedHarvestDate}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {isOwner && (
            <Button variant="ghost" size="icon" className="h-5 w-5 text-slate-400 hover:text-red-500 rounded-full shrink-0" onClick={() => handleDeleteHarvest(harvest.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
          {harvest.status !== 'Planted' && (
            <Badge variant="outline" className={harvest.paymentStatus === 'Paid' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}>
              {harvest.paymentStatus}
            </Badge>
          )}
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
));

export function FarmDashboard() {
  const { currentTenant } = useTenant();
  const db = useFirestore();
  const { toast } = useToast();
  const { requireApproval } = usePinApproval();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [showGCashQr, setShowGCashQr] = useState(false);
  const [pendingPaymentHarvest, setPendingPaymentHarvest] = useState<any | null>(null);
  const [pendingDiscountCentavos, setPendingDiscountCentavos] = useState(0);
  const [pendingDiscountType, setPendingDiscountType] = useState<'percentage'|'fixed'>('percentage');
  const [pendingDiscountReason, setPendingDiscountReason] = useState('');

  const [showReceipt, setShowReceipt] = useState(false);
  const [completedSale, setCompletedSale] = useState<{
    items: any[];
    total: number;
    paymentMethod: string;
    saleId?: string;
  } | null>(null);

  const theme = getModuleTheme(currentTenant?.moduleType);
  useDynamicThemeColor(theme);

  const { user } = useUser();
  const isOwner = currentTenant?.ownerUid === user?.uid || (currentTenant as any)?.role === 'owner';

  // Farm State
  const { harvests, loading, error } = useFarmHarvests();

  // Changed 'Planned' to 'Planted' for better semantics, falling back to 'Planned' for backward compatibility
  const plantedCrops = harvests.filter(h => h.status === 'Planted' || h.status === 'Planned');
  const inBodegaHarvests = harvests.filter(h => h.status === 'In Bodega');
  const dispatchedHarvests = harvests.filter(h => h.status === 'Dispatched');

  React.useEffect(() => {
    if (error) {
      console.error("Farm listener error:", error);
      toast({ title: 'Connection Error', description: 'Failed to sync harvests.', variant: 'destructive' });
    }
  }, [error, toast]);

  // Tabs State
  const [activeTab, setActiveTab] = useState<'field' | 'bodega'>('field');

  // Create Harvest Form
  const [showAddForm, setShowAddForm] = useState(false);
  const [cropType, setCropType] = useState('Palay (Rice)');
  const [quantity, setQuantity] = useState<number | ''>(''); // Treated as Est. Yield during planting
  const [unit, setUnit] = useState('Sacks');
  const [fieldLocation, setFieldLocation] = useState('');
  const [expectedValue, setExpectedValue] = useState<number | ''>('');
  const [expectedHarvestDate, setExpectedHarvestDate] = useState('');
  
  // Harvest Confirmation Form State
  const [harvestingCrop, setHarvestingCrop] = useState<any | null>(null);
  const [actualQuantity, setActualQuantity] = useState<number | ''>('');

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
        expectedHarvestDate: expectedHarvestDate || null,
        status: 'Planted',
        paymentStatus: 'Unpaid',
        createdAt: serverTimestamp(),
      });
      setCropType('Palay (Rice)');
      setQuantity('');
      setUnit('Sacks');
      setFieldLocation('');
      setExpectedValue('');
      setExpectedHarvestDate('');
      setShowAddForm(false);
      toast({ title: 'Crop Planted!', description: `${cropType} has been recorded in the field.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };


  const updateStatus = async (harvest: any, status: string, paymentStatus?: string, paymentMethod: string = 'cash', discountCentavos: number = 0, discountType?: 'percentage' | 'fixed', discountReason?: string) => {
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
          paymentMethod,
          undefined,
          discountCentavos,
          discountType,
          discountReason
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
        
        // If moving to bodega from planted, update with actual quantity
        if (status === 'In Bodega' && actualQuantity !== '') {
            updates.quantity = actualQuantity;
        }

        await updateDoc(harvestRef, updates);
      }
      toast({ title: 'Status Updated', description: `Crop moved to ${status}.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleDeleteHarvest = async (harvestId: string) => {
    if (!currentTenant || !user) return;
    // Phase 2: Require Manager PIN for Deletions
    const approved = await requireApproval("Deleting a record requires Manager authorization.");
    if (!approved) return;

    if (!window.confirm("Sigurado ka bang gusto mong i-delete o i-void ang record na ito? Ire-revert nito ang transaction sa master-cash kung sold na.")) return;
    try {
      setIsProcessing(true);
      await deleteServiceOrder(currentTenant.id, 'farm_harvests', harvestId, user.uid, user.displayName || user.email || 'Unknown User');
      toast({ title: 'Record Deleted', description: 'Record and associated financials reversed.' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmHarvest = async () => {
      if(!harvestingCrop || actualQuantity === '') return;
      setIsProcessing(true);
      await updateStatus(harvestingCrop, 'In Bodega');
      setHarvestingCrop(null);
      setActualQuantity('');
      setIsProcessing(false);
  }

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
          {activeTab === 'field' && (
            <Button size="sm" className="h-8 w-8 rounded-full p-0" onClick={() => setShowAddForm(!showAddForm)} style={{ backgroundColor: theme.primary }}>
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </section>

        {/* Tab Navigation */}
        <div className="flex gap-2 bg-white p-1 rounded-xl shadow-sm border border-slate-200">
            <Button 
                variant={activeTab === 'field' ? 'default' : 'ghost'}
                className={activeTab === 'field' ? "flex-1 shadow-sm font-bold" : "flex-1 text-slate-500 font-medium"}
                onClick={() => setActiveTab('field')}
                style={activeTab === 'field' ? { backgroundColor: theme.primary, color: '#fff' } : {}}
            >
                <Leaf className="h-4 w-4 mr-2" /> Field
            </Button>
            <Button 
                variant={activeTab === 'bodega' ? 'default' : 'ghost'}
                className={activeTab === 'bodega' ? "flex-1 shadow-sm font-bold" : "flex-1 text-slate-500 font-medium"}
                onClick={() => setActiveTab('bodega')}
                style={activeTab === 'bodega' ? { backgroundColor: theme.primary, color: '#fff' } : {}}
            >
                <Warehouse className="h-4 w-4 mr-2" /> Bodega
            </Button>
        </div>

        {showAddForm && activeTab === 'field' && (
          <Card className="shadow-sm border-slate-200 bg-white border-l-4 animate-in slide-in-from-top-2" style={{ borderLeftColor: theme.primary }}>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2"><Sprout className="h-4 w-4 text-emerald-600" /> New Crop Planting</CardTitle>
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
                  <Label htmlFor="quantity" className="text-xs">Est. Yield Qty</Label>
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
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="expected-date" className="text-xs">Expected Harvest</Label>
                  <Input id="expected-date" type="date" value={expectedHarvestDate} onChange={e => setExpectedHarvestDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="expected-value" className="text-xs">Est. Value (₱)</Label>
                  <Input id="expected-value" type="number" placeholder="0" value={expectedValue} onChange={e => setExpectedValue(parseFloat(e.target.value) || '')} />
                </div>
              </div>
              <Button 
                className="w-full h-8 text-xs font-bold text-white mt-2" 
                style={{ backgroundColor: theme.primary }}
                onClick={handleAddHarvest}
                disabled={isProcessing || !cropType || !quantity}
              >
                Log Planting
              </Button>
            </CardContent>
          </Card>
        )}

        {harvestingCrop && (
            <Card className="shadow-sm border-amber-200 bg-amber-50 border-l-4 animate-in slide-in-from-top-2" style={{ borderLeftColor: '#f59e0b' }}>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2"><Tractor className="h-4 w-4 text-amber-600" /> Harvest {harvestingCrop.cropType}</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3 pt-0">
                <p className="text-xs text-slate-600">Enter the actual harvested quantity to move to Bodega. (Estimated: {harvestingCrop.quantity} {harvestingCrop.unit})</p>
                <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                        <Label className="text-xs">Actual Yield ({harvestingCrop.unit})</Label>
                        <Input type="number" placeholder="0" value={actualQuantity} onChange={e => setActualQuantity(parseFloat(e.target.value) || '')} autoFocus />
                    </div>
                </div>
                <div className="flex gap-2 pt-2">
                    <Button variant="outline" className="flex-1 h-8 text-xs" onClick={() => { setHarvestingCrop(null); setActualQuantity(''); }}>Cancel</Button>
                    <Button className="flex-1 h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white" disabled={isProcessing || actualQuantity === ''} onClick={handleConfirmHarvest}>Confirm Harvest</Button>
                </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="text-center py-8 text-sm text-slate-400">Loading farm records...</div>
        ) : (
          <div className="pb-4">
            
            {activeTab === 'field' && (
                <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="flex items-center gap-2 mb-3 px-1">
                        <Sprout className="h-4 w-4 text-emerald-500" />
                        <h4 className="font-bold text-sm text-slate-700">Planted & Growing</h4>
                        <Badge variant="secondary" className="bg-white ml-auto">{plantedCrops.length}</Badge>
                    </div>
                    {plantedCrops.length === 0 && (
                        <div className="text-center py-10 bg-white rounded-xl border border-dashed border-slate-200">
                            <Leaf className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                            <p className="text-sm text-slate-500 font-medium">No crops currently in the field.</p>
                        </div>
                    )}
                    <div className="space-y-2">
                        {plantedCrops.map(harvest => (
                        <HarvestCard 
                            key={harvest.id} 
                            harvest={harvest} 
                            isOwner={isOwner}
                            handleDeleteHarvest={handleDeleteHarvest}
                            actions={
                            <Button size="sm" className="w-full h-7 text-[10px] bg-amber-600 hover:bg-amber-700" onClick={() => setHarvestingCrop(harvest)}>
                                <Tractor className="h-3 w-3 mr-1 text-amber-200" /> Harvest & Store
                            </Button>
                            } 
                        />
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'bodega' && (
                <div className="animate-in fade-in slide-in-from-left-4 duration-300 flex flex-col md:flex-row gap-4">
                    {/* In Bodega Column */}
                    <div className="flex-1 min-w-[280px]">
                        <div className="flex items-center gap-2 mb-3 px-1">
                            <Warehouse className="h-4 w-4 text-amber-600" />
                            <h4 className="font-bold text-sm text-slate-700">Bodega (Inventory)</h4>
                            <Badge variant="secondary" className="bg-white ml-auto">{inBodegaHarvests.length}</Badge>
                        </div>
                        {inBodegaHarvests.length === 0 && (
                            <div className="text-center py-8 text-xs text-slate-400 border border-dashed rounded-xl">Bodega is empty.</div>
                        )}
                        <div className="space-y-2">
                            {inBodegaHarvests.map(harvest => (
                            <HarvestCard 
                                key={harvest.id} 
                                harvest={harvest} 
                                isOwner={isOwner}
                                handleDeleteHarvest={handleDeleteHarvest}
                                actions={
                                <div className="flex gap-2 w-full">
                                    <Button size="sm" className="flex-1 h-7 text-[10px] font-bold text-white border-none" style={{ backgroundColor: theme.primary }} onClick={() => setPendingPaymentHarvest(harvest)}>
                                    <Coins className="h-3 w-3 mr-1" /> Pay / Dispatch
                                    </Button>
                                </div>
                                } 
                            />
                            ))}
                        </div>
                    </div>

                    {/* Sold Column */}
                    <div className="flex-1 min-w-[280px] mt-6 md:mt-0 pt-6 md:pt-0 border-t md:border-t-0 md:border-l border-slate-200 border-dashed md:pl-4">
                        <div className="flex items-center gap-2 mb-3 px-1">
                            <CheckCircle2 className="h-4 w-4 text-indigo-500" />
                            <h4 className="font-bold text-sm text-slate-700">Sold / Dispatched</h4>
                            <Badge variant="secondary" className="bg-white ml-auto">{dispatchedHarvests.length}</Badge>
                        </div>
                        {dispatchedHarvests.length === 0 && (
                            <div className="text-center py-8 text-xs text-slate-400 border border-dashed rounded-xl">No sales yet.</div>
                        )}
                        <div className="space-y-2 opacity-70">
                            {dispatchedHarvests.map(harvest => (
                            <HarvestCard 
                                key={harvest.id} 
                                harvest={harvest} 
                                isOwner={isOwner}
                                handleDeleteHarvest={handleDeleteHarvest}
                                actions={
                                <Button disabled size="sm" variant="outline" className="w-full h-7 text-[10px] font-bold text-indigo-600 border-indigo-200 bg-indigo-50">
                                    Settled
                                </Button>
                                } 
                            />
                            ))}
                        </div>
                    </div>
                </div>
            )}
          </div>
        )}

      </main>

      {pendingPaymentHarvest && !showGCashQr && (
        <ServicePaymentModal
          isOpen={!!pendingPaymentHarvest}
          onClose={() => setPendingPaymentHarvest(null)}
          amountDue={pendingPaymentHarvest.expectedValue * 100}
        onConfirm={(method, discountCentavos, discountType, discountReason) => {
            if (method === 'gcash') {
              setPendingDiscountCentavos(discountCentavos || 0);
              setPendingDiscountType(discountType || 'percentage');
              setPendingDiscountReason(discountReason || '');
              setShowGCashQr(true);
            } else {
              updateStatus(pendingPaymentHarvest, 'Dispatched', 'Paid', method, discountCentavos, discountType, discountReason);
              setPendingPaymentHarvest(null);
            }
          }}
        />
      )}

      <GCashQrModal
        open={showGCashQr}
        onClose={() => {
          setShowGCashQr(false);
          setPendingPaymentHarvest(null);
        }}
        totalAmount={((pendingPaymentHarvest?.expectedValue || 0) * 100) - pendingDiscountCentavos}
        tenantName={currentTenant?.name || "Katuwang Farm"}
        paymentType="gcash"
        onPaymentVerified={async (paymentMethod) => {
          if (pendingPaymentHarvest) {
            await updateStatus(pendingPaymentHarvest, 'Dispatched', 'Paid', paymentMethod, pendingDiscountCentavos, pendingDiscountType, pendingDiscountReason);
            setShowGCashQr(false);
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
