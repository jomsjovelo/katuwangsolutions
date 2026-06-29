"use client"

import React, { useState } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { doc, collection, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { completeServiceOrder, deleteServiceOrder } from '@/firebase/firestore/service-actions';
import { useUser } from '@/firebase/auth/use-user';
import { getCustomerPoints } from '@/firebase/firestore/loyalty-actions';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from 'date-fns';
import { getModuleTheme, useDynamicThemeColor } from '@/lib/theme-utils';
import { useCarwashOrders } from '@/hooks/use-carwash';
import { useInventory } from '@/hooks/use-inventory';
import { useToast } from '@/hooks/use-toast';
import { ServicePaymentModal } from '@/components/common/service-payment-modal';
import { 
  Car, 
  Plus, 
  Droplets,
  Wind,
  CheckCircle2,
  CircleDollarSign,
  AlignJustify,
  CalendarDays,
  Clock,
  ArrowRight,
  Trash2
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

const INSPECTION_ITEMS = [
  'Scratches (Front)',
  'Scratches (Rear)',
  'Scratches (Sides)',
  'Dents (Front)',
  'Dents (Rear)',
  'Dents (Sides)',
  'Cracked Glass',
  'Broken Mirrors',
  'Antenna Removed',
  'Valuables Secured'
];

const OrderCard = React.memo(({ order, actions, isOwner, onDelete }: { order: any, actions: React.ReactNode, isOwner: boolean, onDelete: (id: string) => void }) => {
  const hasPriorDamage = order.inspectionNotes && order.inspectionNotes.length > 0;
  
  return (
  <Card className="shadow-sm border-slate-200 mb-3">
    <CardContent className="p-3">
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-bold text-slate-800 tracking-widest text-sm bg-slate-100 px-2 py-0.5 rounded border border-slate-200 inline-block">
              {order.plateNumber}
            </h4>
            {hasPriorDamage && (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[8px] font-black uppercase px-1.5 py-0">
                ⚠️ Prior Damage
              </Badge>
            )}
            {isOwner && (
              <Button variant="ghost" size="icon" className="h-5 w-5 text-slate-400 hover:text-red-500 rounded-full shrink-0 ml-1" onClick={() => onDelete(order.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
          <p className="text-xs text-slate-500 font-medium">{order.vehicleType} • {order.servicePackage}</p>
          {order.mechanicName && <p className="text-[10px] text-slate-400 mt-0.5">Assigned: {order.mechanicName}</p>}
          {order.partsUsed && order.partsUsed.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {order.partsUsed.map((p: any, i: number) => (
                <Badge key={i} variant="secondary" className="text-[9px] bg-slate-100 text-slate-600">
                  {p.quantity}x {p.name}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="text-right">
          <Badge variant="outline" className={order.paymentStatus === 'Paid' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}>
            {order.paymentStatus}
          </Badge>
          <p className="text-sm font-bold text-slate-700 mt-1">₱{(order.amountDue / 100).toLocaleString()}</p>
          {order.appointmentDate && order.status === 'Scheduled' && (
            <p className="text-[10px] font-bold text-amber-600 mt-0.5 flex items-center justify-end gap-1">
              <Clock className="h-3 w-3" />
              {order.appointmentDate.toDate ? format(order.appointmentDate.toDate(), 'MMM d, h:mm a') : format(new Date(order.appointmentDate), 'MMM d, h:mm a')}
            </p>
          )}
          {order.therapistCommission && (
            <p className="text-[9px] font-bold text-emerald-600 mt-0.5">
              +₱{(order.therapistCommission / 100).toLocaleString()} Comm
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        {actions}
      </div>
    </CardContent>
  </Card>
  );
});
OrderCard.displayName = 'OrderCard';

export function AutoBossDashboard() {
  const { currentTenant } = useTenant();
  const db = useFirestore();
  const { toast } = useToast();
  const { products, loading: inventoryLoading } = useInventory();
  
  const [isProcessing, setIsProcessing] = useState(false);

  const theme = getModuleTheme(currentTenant?.moduleType);
  useDynamicThemeColor(theme);
  
  const { user } = useUser();
  const isOwner = currentTenant?.ownerUid === user?.uid || (currentTenant as any)?.role === 'owner';

  // Carwash State
  const { scheduledOrders, queuedOrders, washingOrders, dryingOrders, readyOrders, loading, error: carwashError } = useCarwashOrders();

  React.useEffect(() => {
    if (carwashError) {
      console.error("Auto Boss listener error:", carwashError);
      toast({ title: 'Connection Error', description: 'Failed to sync live queue.', variant: 'destructive' });
    }
  }, [carwashError, toast]);

  // Create Drop-off Form
  const [showAddForm, setShowAddForm] = useState(false);
  const [isScheduled, setIsScheduled] = useState(false);
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [vehicleType, setVehicleType] = useState('Sedan');
  const [servicePackage, setServicePackage] = useState('Basic Wash');
  const [mechanicName, setMechanicName] = useState('');
  const [partsUsed, setPartsUsed] = useState<{productId: string, quantity: number, name: string, price: number}[]>([]);
  const [selectedPartId, setSelectedPartId] = useState('');
  const [selectedPartQty, setSelectedPartQty] = useState('1');
  const [priceOverride, setPriceOverride] = useState<number | ''>('');
  const [inspectionNotes, setInspectionNotes] = useState<string[]>([]);

  // Loyalty Program
  const [customerPhone, setCustomerPhone] = useState('');
  const [pointsBalance, setPointsBalance] = useState(0);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [isFetchingPoints, setIsFetchingPoints] = useState(false);

  // UI State
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedOrderForPayment, setSelectedOrderForPayment] = useState<any>(null);

  React.useEffect(() => {
    const fetchPoints = async () => {
      const cleanPhone = customerPhone.replace(/[^0-9+]/g, '');
      if (cleanPhone.length >= 10 && currentTenant) {
        setIsFetchingPoints(true);
        try {
          const points = await getCustomerPoints(currentTenant.id, cleanPhone);
          setPointsBalance(points);
        } catch (e) {
          console.error("Failed to fetch points", e);
        } finally {
          setIsFetchingPoints(false);
        }
      } else {
        setPointsBalance(0);
        setIsRedeeming(false);
      }
    };
    
    const timer = setTimeout(fetchPoints, 500);
    return () => clearTimeout(timer);
  }, [customerPhone, currentTenant?.id]);

  const toggleInspectionItem = (item: string) => {
    setInspectionNotes(prev => 
      prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]
    );
  };

  // Auto-calculate suggested price
  const basePrice = VEHICLE_BASE_PRICE[vehicleType] || 0;
  const addonPrice = PACKAGE_ADDON_PRICE[servicePackage] || 0;
  const suggestedPrice = basePrice + addonPrice;
  const rawFinalPrice = typeof priceOverride === 'number' ? priceOverride : suggestedPrice;
  const partsTotal = partsUsed.reduce((sum, p: any) => sum + ((p.price * p.quantity) / 100), 0);
  const pointsDiscount = isRedeeming ? 50 : 0;
  const finalPrice = Math.max(0, (rawFinalPrice + partsTotal) - pointsDiscount);

  const handleAddPart = () => {
    if (!selectedPartId || !selectedPartQty) return;
    const prod = products.find(p => p.id === selectedPartId);
    if (!prod) return;
    setPartsUsed(prev => [...prev, { productId: prod.id!, quantity: parseInt(selectedPartQty), name: prod.name, price: prod.salePrice }]);
    setSelectedPartId('');
    setSelectedPartQty('1');
  };

  const handleAddVehicle = async () => {
    if (!currentTenant || !db || !plateNumber || finalPrice < 0 || isNaN(finalPrice)) {
      if (finalPrice < 0 || isNaN(finalPrice)) toast({ title: 'Error', description: 'Invalid price.', variant: 'destructive' });
      return;
    }
    setIsProcessing(true);
    try {
      if (isRedeeming && customerPhone) {
        const { redeemPoints } = await import('@/firebase/firestore/loyalty-actions');
        await redeemPoints(currentTenant.id, customerPhone, 100);
      }

      let aptTimestamp = null;
      if (isScheduled && appointmentDate && appointmentTime) {
        aptTimestamp = new Date(`${appointmentDate}T${appointmentTime}`);
      }

      const orderRef = doc(collection(db, 'tenants', currentTenant.id, 'carwash_orders'));
      await setDoc(orderRef, {
        tenantId: currentTenant.id,
        plateNumber: plateNumber.toUpperCase(),
        vehicleType,
        servicePackage,
        status: isScheduled ? 'Scheduled' : 'Queued',
        amountDue: Math.round(finalPrice * 100), // convert to cents safely
        paymentStatus: 'Unpaid',
        inspectionNotes,
        mechanicName: mechanicName || null,
        partsUsed,
        customerPhone: customerPhone || null,
        appointmentDate: aptTimestamp,
        createdAt: serverTimestamp(),
      });
      setPlateNumber('');
      setVehicleType('Sedan');
      setServicePackage('Basic Wash');
      setPriceOverride('');
      setInspectionNotes([]);
      setMechanicName('');
      setPartsUsed([]);
      setCustomerPhone('');
      setIsRedeeming(false);
      setIsScheduled(false);
      setAppointmentDate('');
      setAppointmentTime('');
      setShowAddForm(false);
      toast({ title: isScheduled ? 'Appointment Booked!' : 'Vehicle Logged!', description: `Plate ${plateNumber.toUpperCase()} added.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const updateStatus = async (order: any, status: string, paymentStatus?: string, paymentMethod: string = 'cash', discountCentavos: number = 0, discountType?: 'percentage' | 'fixed') => {
    if (!currentTenant || !db) return;
    try {
      if (status === 'Completed' && paymentStatus === 'Paid') {
        const commissionPercentage = currentTenant.mechanicCommissionRate ?? 0.30;
        const laborAmount = order.amountDue - (order.partsUsed?.reduce((sum: number, p: any) => sum + (p.price * p.quantity), 0) || 0);
        const commissionCentavos = Math.round(Math.max(0, laborAmount) * commissionPercentage);

        await completeServiceOrder(
          currentTenant.id, 
          'carwash_orders', 
          order.id, 
          status, 
          order.amountDue, 
          `Auto Boss: ${order.plateNumber}`,
          commissionCentavos,
          { partsUsed: order.partsUsed || [] },
          paymentMethod,
          undefined,
          discountCentavos,
          discountType
        );
        if (order.customerPhone && order.amountDue > 0) {
          try {
            const { awardPoints } = await import('@/firebase/firestore/loyalty-actions');
            await awardPoints(currentTenant.id, order.customerPhone, order.amountDue, order.referrerCode);
          } catch (e) {
            console.error("Failed to award points:", e);
          }
        }
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

  const handleDeleteOrder = async (orderId: string) => {
    if (!currentTenant || !user) return;
    if (!window.confirm("Sigurado ka bang gusto mong i-delete o i-void ang order na ito? Ibabalik nito ang bayad kung applicable.")) return;
    try {
      await deleteServiceOrder(currentTenant.id, 'carwash_orders', orderId, user.uid, user.displayName || user.email || 'Unknown User');
      toast({ title: 'Order Deleted', description: 'Order has been successfully reversed.' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };


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
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <span className="flex items-center gap-2"><Car className="h-4 w-4" /> New Vehicle Arrival</span>
                <div className="flex items-center gap-2 text-xs">
                  <Switch checked={isScheduled} onCheckedChange={setIsScheduled} id="schedule-switch" />
                  <Label htmlFor="schedule-switch" className="text-xs cursor-pointer">Book for Later</Label>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3 pt-0">
              {isScheduled && (
                <div className="flex gap-2 p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="appointment-date" className="text-xs font-bold text-slate-700">Date</Label>
                    <Input id="appointment-date" name="appointmentDate" type="date" value={appointmentDate} onChange={e => setAppointmentDate(e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="appointment-time" className="text-xs font-bold text-slate-700">Time</Label>
                    <Input id="appointment-time" name="appointmentTime" type="time" value={appointmentTime} onChange={e => setAppointmentTime(e.target.value)} className="h-8 text-xs" />
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="plate-number" className="text-xs">Plate Number</Label>
                <Input id="plate-number" name="plateNumber" placeholder="e.g. ABC 1234" value={plateNumber} onChange={e => setPlateNumber(e.target.value)} className="uppercase" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="vehicle-type" className="text-xs">Vehicle Type</Label>
                  <select 
                    id="vehicle-type"
                    name="vehicleType"
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
                  <Label htmlFor="service-package" className="text-xs">Service Package</Label>
                  <select 
                    id="service-package"
                    name="servicePackage"
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

              <div className="flex items-center justify-between mt-4 mb-2">
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  className="text-xs text-slate-500 font-bold"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                >
                  {showAdvanced ? 'Hide Advanced Options' : '+ Show Advanced Options (Mechanic, Parts, Inspection)'}
                </Button>
              </div>

              {showAdvanced && (
                <div className="space-y-3 p-3 bg-slate-50 border border-slate-100 rounded-lg animate-in slide-in-from-top-2">
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <Label htmlFor="mechanic-name" className="text-xs">Mechanic / Staff Name</Label>
                      <Input id="mechanic-name" name="mechanicName" placeholder="e.g. Kuya J" value={mechanicName} onChange={e => setMechanicName(e.target.value)} className="h-9 bg-white" />
                    </div>
                  </div>

                  <div className="space-y-2 bg-white p-3 rounded-lg border border-slate-200 mt-2">
                    <Label className="text-xs font-bold">Parts & Materials Used</Label>
                    {partsUsed.length > 0 && (
                      <ul className="space-y-1 mb-2">
                        {partsUsed.map((p, idx) => (
                          <li key={idx} className="text-[10px] flex justify-between border-b border-slate-100 pb-1">
                            <span>{p.quantity}x {p.name}</span>
                            <span className="font-bold">₱{((p.price * p.quantity) / 100).toLocaleString()}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="flex gap-2 items-end">
                      <div className="flex-1 space-y-1">
                        <select 
                          className="w-full border-slate-200 rounded-md border p-2 text-xs h-8 bg-white"
                          value={selectedPartId}
                          onChange={(e) => setSelectedPartId(e.target.value)}
                        >
                          <option value="">Select Part...</option>
                          {products.map((p: any) => (
                            <option key={p.id} value={p.id}>{p.name} (₱{(p.salePrice/100).toFixed(2)})</option>
                          ))}
                        </select>
                      </div>
                      <div className="w-16 space-y-1">
                        <Input type="number" placeholder="Qty" className="h-8 text-xs bg-white" value={selectedPartQty} onChange={(e) => setSelectedPartQty(e.target.value)} />
                      </div>
                      <Button type="button" size="sm" variant="secondary" className="h-8 bg-slate-200 hover:bg-slate-300" onClick={handleAddPart}>Add</Button>
                    </div>
                  </div>

                  <div className="space-y-1 mt-2">
                    <Label className="text-xs">Pre-Wash Inspection Checklist</Label>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {INSPECTION_ITEMS.map(item => {
                        const isSelected = inspectionNotes.includes(item);
                        return (
                          <Badge 
                            key={item}
                            variant={isSelected ? "default" : "outline"}
                            className={`text-[9px] cursor-pointer py-0.5 px-2 ${isSelected ? '' : 'text-slate-500 bg-white border-slate-200'}`}
                            style={isSelected ? { backgroundColor: theme.primary } : {}}
                            onClick={() => toggleInspectionItem(item)}
                          >
                            {item}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-1 mt-4 border-t border-slate-100 pt-3">
                <Label htmlFor="customer-phone" className="text-xs">Customer Phone (For Loyalty Points)</Label>
                <Input id="customer-phone" placeholder="e.g. 09171234567" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="h-9" />
                {customerPhone && pointsBalance >= 100 && rawFinalPrice >= 50 && (
                  <div className="flex items-center space-x-2 mt-2 bg-emerald-50 p-2 rounded-lg border border-emerald-100">
                    <Switch 
                      id="redeem-points-autoboss" 
                      checked={isRedeeming}
                      onCheckedChange={setIsRedeeming}
                      className="data-[state=checked]:bg-emerald-500"
                    />
                    <Label htmlFor="redeem-points-autoboss" className="text-xs font-bold text-emerald-800 cursor-pointer">
                      Redeem 100 pts for ₱50 Off
                    </Label>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="price-override" className="text-xs flex justify-between">
                  <span>Labor Price (₱)</span>
                  <span className="text-muted-foreground">Suggested: ₱{suggestedPrice}</span>
                </Label>
                <div className="flex gap-2 items-center">
                  <Input id="price-override" name="priceOverride" className="flex-1" type="number" placeholder={`₱${suggestedPrice}`} value={priceOverride} onChange={e => setPriceOverride(parseFloat(e.target.value) || '')} />
                  {isRedeeming && <span className="text-xs font-bold text-emerald-600">-₱50.00 Rewards</span>}
                </div>
                {partsTotal > 0 && <div className="text-xs text-right text-slate-500 mt-1">+ ₱{partsTotal.toLocaleString()} for Parts</div>}
                <div className="text-right text-lg font-black text-slate-800">
                  Final: ₱{finalPrice.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </div>
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

        <Tabs defaultValue="queue" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4 rounded-xl">
            <TabsTrigger value="queue" className="rounded-lg text-xs md:text-sm font-bold">Live Queue</TabsTrigger>
            <TabsTrigger value="calendar" className="rounded-lg text-xs md:text-sm font-bold">Appointments</TabsTrigger>
          </TabsList>

          <TabsContent value="calendar" className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <CalendarDays className="h-5 w-5" style={{ color: theme.primary }} />
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">Upcoming Bookings</h3>
            </div>
            
            {loading ? (
              <div className="text-center py-8 text-sm text-slate-400">Loading bookings...</div>
            ) : scheduledOrders.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl text-slate-400">
                <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-xs font-medium">No upcoming appointments</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {scheduledOrders.map(order => (
                  <OrderCard key={order.id} order={order} isOwner={isOwner} onDelete={handleDeleteOrder} actions={
                    <Button size="sm" className="w-full h-7 text-[10px] bg-slate-800 hover:bg-slate-700" onClick={() => updateStatus(order, 'Queued')}>
                      <ArrowRight className="h-3 w-3 mr-1" /> Mark Arrived (Move to Queue)
                    </Button>
                  } />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="queue" className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
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
                  <OrderCard key={order.id} order={order} isOwner={isOwner} onDelete={handleDeleteOrder} actions={
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
                  <OrderCard key={order.id} order={order} isOwner={isOwner} onDelete={handleDeleteOrder} actions={
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
                  <OrderCard key={order.id} order={order} isOwner={isOwner} onDelete={handleDeleteOrder} actions={
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
                  <OrderCard key={order.id} order={order} isOwner={isOwner} onDelete={handleDeleteOrder} actions={
                    <Button size="sm" className="w-full h-7 text-[10px] bg-emerald-500 hover:bg-emerald-600" onClick={() => setSelectedOrderForPayment(order)}>
                      <CircleDollarSign className="h-3 w-3 mr-1" /> Pay & Release
                    </Button>
                  } />
                ))}
              </div>
            </div>

          </div>
        )}
          </TabsContent>
        </Tabs>

        {selectedOrderForPayment && (
          <ServicePaymentModal
            isOpen={!!selectedOrderForPayment}
            onClose={() => setSelectedOrderForPayment(null)}
            amountDue={selectedOrderForPayment.amountDue}
            onConfirm={(method, discountCentavos, discountType) => {
              updateStatus(selectedOrderForPayment, 'Completed', 'Paid', method, discountCentavos, discountType);
              setSelectedOrderForPayment(null);
            }}
          />
        )}

      </main>
    </div>
  );
}
