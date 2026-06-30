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
import { useWaterDeliveries } from '@/hooks/use-water';
import { useToast } from '@/hooks/use-toast';
import { GCashQrModal } from '@/components/common/gcash-qr-modal';
import { ThermalReceiptPreview } from '@/components/common/thermal-receipt-preview';
import { ServicePaymentModal } from '@/components/common/service-payment-modal';
import { 
  Droplet, 
  Plus, 
  Truck,
  CheckCircle2,
  Package,
  CircleDollarSign,
  MapPin,
  User,
  ArrowRight,
  Navigation,
  Trash2
} from "lucide-react";

const PRICES = {
  round: 35,
  slim: 30,
};

const OrderCard = React.memo(({ order, actions, isOwner, onDelete }: { order: any, actions: React.ReactNode, isOwner: boolean, onDelete: (id: string) => void }) => {
  const openMaps = (address: string) => {
    const encoded = encodeURIComponent(address);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`, '_blank');
  };

  return (
    <Card className="shadow-sm border-slate-200 mb-3">
      <CardContent className="p-3">
        <div className="flex justify-between items-start mb-2">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1"><User className="h-3 w-3"/> {order.customerName}</h4>
              {isOwner && (
                <Button variant="ghost" size="icon" className="h-5 w-5 text-slate-400 hover:text-red-500 rounded-full shrink-0" onClick={() => onDelete(order.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
            <p className="text-xs text-slate-500 flex items-center gap-1 mt-1"><MapPin className="h-3 w-3 text-red-400"/> {order.address}</p>
          </div>
          <div className="text-right">
            <Badge variant="outline" className={order.paymentStatus === 'Paid' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}>
              {order.paymentStatus}
            </Badge>
            <p className="text-sm font-bold text-slate-700 mt-1">₱{(order.amountDue / 100).toLocaleString()}</p>
          </div>
        </div>
        
        <div className="flex gap-2 text-xs font-medium text-slate-600 mb-2 bg-slate-50 p-2 rounded-md border border-slate-100">
          {order.roundOrdered > 0 && <span>{order.roundOrdered} Round</span>}
          {order.roundOrdered > 0 && order.slimOrdered > 0 && <span>•</span>}
          {order.slimOrdered > 0 && <span>{order.slimOrdered} Slim</span>}
        </div>

        {/* Maps Button */}
        <button
          onClick={() => openMaps(order.address)}
          className="w-full h-7 mb-2 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 text-[10px] font-black flex items-center justify-center gap-1.5 cursor-pointer hover:bg-blue-100 transition-colors"
        >
          <Navigation className="h-3 w-3" /> Open in Google Maps
        </button>
        {order.driver && <p className="text-[10px] text-slate-500 mb-2 font-medium">Driver: {order.driver}</p>}

        {order.status === 'Delivered' && (
          <div className="space-y-1 mb-3">
            <div className="flex gap-2 text-xs font-medium text-emerald-600 bg-emerald-50 p-2 rounded-md border border-emerald-100">
              <span>Returns:</span>
              {order.roundReturned > 0 && <span>{order.roundReturned} Round</span>}
              {order.roundReturned > 0 && order.slimReturned > 0 && <span>•</span>}
              {order.slimReturned > 0 && <span>{order.slimReturned} Slim</span>}
              {order.roundReturned === 0 && order.slimReturned === 0 && <span>None</span>}
            </div>
            {(order.roundOrdered > order.roundReturned || order.slimOrdered > order.slimReturned) && (
              <div className="flex gap-2 text-xs font-bold text-amber-600 bg-amber-50 p-2 rounded-md border border-amber-100">
                <span>Loaned:</span>
                {order.roundOrdered > order.roundReturned && <span>{order.roundOrdered - order.roundReturned} Round</span>}
                {order.roundOrdered > order.roundReturned && order.slimOrdered > order.slimReturned && <span>•</span>}
                {order.slimOrdered > order.slimReturned && <span>{order.slimOrdered - order.slimReturned} Slim</span>}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          {actions}
        </div>
      </CardContent>
    </Card>
  );
});
OrderCard.displayName = 'OrderCard';

export function HydroDashboard() {
  const { currentTenant } = useTenant();
  const db = useFirestore();
  const { toast } = useToast();
  const { requireApproval } = usePinApproval();
  
  const [isProcessing, setIsProcessing] = useState(false);

  const theme = getModuleTheme(currentTenant?.moduleType);
  useDynamicThemeColor(theme);
  
  const { user } = useUser();
  const isOwner = currentTenant?.ownerUid === user?.uid || (currentTenant as any)?.role === 'owner';

  // Deliveries State
  const { orders, emptyReceivedOrders, washingOrders, refilledOrders, outForDeliveryOrders, completedOrders, loading, error: waterError } = useWaterDeliveries();

  const loanedRound = React.useMemo(() => orders ? orders.reduce((sum, o) => sum + Math.max(0, o.roundOrdered - o.roundReturned), 0) : 0, [orders]);
  const loanedSlim = React.useMemo(() => orders ? orders.reduce((sum, o) => sum + Math.max(0, o.slimOrdered - o.slimReturned), 0) : 0, [orders]);

  const [driverAssignments, setDriverAssignments] = useState<Record<string, string>>({});

  React.useEffect(() => {
    if (waterError) {
      console.error("Hydro listener error:", waterError);
      toast({ title: 'Connection Error', description: 'Failed to sync live deliveries.', variant: 'destructive' });
    }
  }, [waterError, toast]);

  // Create Delivery Form
  const [showAddForm, setShowAddForm] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [orderType, setOrderType] = useState<'Walk-in' | 'Delivery'>('Delivery');
  const [address, setAddress] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [roundQty, setRoundQty] = useState<number | ''>('');
  const [slimQty, setSlimQty] = useState<number | ''>('');
  const [priceOverride, setPriceOverride] = useState<number | ''>('');

  // Settlement Form (when delivering)
  const [settleOrderId, setSettleOrderId] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedOrderForStatus, setSelectedOrderForStatus] = useState<any>(null);
  const [roundReturned, setRoundReturned] = useState<number | ''>('');
  const [slimReturned, setSlimReturned] = useState<number | ''>('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [completedSale, setCompletedSale] = useState<{
    items: any[];
    total: number;
    paymentMethod: string;
    saleId?: string;
  } | null>(null);

  // Auto-calculate suggested price
  const roundCount = typeof roundQty === 'number' ? roundQty : 0;
  const slimCount = typeof slimQty === 'number' ? slimQty : 0;
  const suggestedPrice = (roundCount * PRICES.round) + (slimCount * PRICES.slim);
  const finalPrice = typeof priceOverride === 'number' ? priceOverride : suggestedPrice;

  const handleAddDelivery = async () => {
    if (!currentTenant || !db || !customerName) return;
    if (orderType === 'Delivery' && !address) {
      toast({ title: 'Error', description: 'Address is required for deliveries.', variant: 'destructive' });
      return;
    }
    if (roundCount === 0 && slimCount === 0) {
      toast({ title: 'Error', description: 'Please enter at least 1 round or slim gallon.', variant: 'destructive' });
      return;
    }
    if (finalPrice < 0 || isNaN(finalPrice)) {
      toast({ title: 'Error', description: 'Invalid price.', variant: 'destructive' });
      return;
    }

    setIsProcessing(true);
    try {
      const orderRef = doc(collection(db, 'tenants', currentTenant.id, 'water_deliveries'));
      await setDoc(orderRef, {
        tenantId: currentTenant.id,
        customerName,
        orderType,
        address: orderType === 'Walk-in' ? 'Walk-in Customer' : address,
        customerPhone: customerPhone || null,
        driver: '',
        roundOrdered: roundCount,
        slimOrdered: slimCount,
        roundReturned: 0,
        slimReturned: 0,
        status: 'Empty Received',
        amountDue: Math.round(finalPrice * 100), // convert to cents safely
        paymentStatus: 'Unpaid',
        createdAt: serverTimestamp(),
      });
      setCustomerName('');
      setAddress('');
      setCustomerPhone('');
      setRoundQty('');
      setSlimQty('');
      setPriceOverride('');
      setShowAddForm(false);
      toast({ title: 'Delivery Logged!', description: `Delivery for ${customerName} added to queue.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const updateStatus = async (id: string, status: string, additionalFields: any = {}) => {
    if (!currentTenant || !db) return;
    try {
      const orderRef = doc(db, 'tenants', currentTenant.id, 'water_deliveries', id);
      await updateDoc(orderRef, { status, updatedAt: serverTimestamp(), ...additionalFields });
      toast({ title: 'Delivery Updated', description: `Order moved to ${status}.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!currentTenant || !user) return;
    // Phase 2: Require Manager PIN for Deletions
    const approved = await requireApproval("Deleting a record requires Manager authorization.");
    if (!approved) return;

    if (!window.confirm("Sigurado ka bang gusto mong i-delete o i-void ang order na ito? Ibabalik nito ang bayad kung applicable.")) return;
    try {
      await deleteServiceOrder(currentTenant.id, 'water_deliveries', orderId, user.uid, user.displayName || user.email || 'Unknown User');
      toast({ title: 'Order Deleted', description: 'Order has been successfully reversed.' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleSettleAndDeliver = async (paymentMethod: string, discountCentavos: number, discountType?: 'percentage' | 'fixed', discountReason?: string) => {
    if (!settleOrderId || !currentTenant || !db) return;
    setIsProcessing(true);
    try {
      const ordersList = [...emptyReceivedOrders, ...washingOrders, ...refilledOrders, ...outForDeliveryOrders];
      const orderToSettle = ordersList.find(o => o.id === settleOrderId);
      if (orderToSettle) {
        const finalAmount = orderToSettle.amountDue - discountCentavos;
        await completeServiceOrder(
          currentTenant.id, 
          'water_deliveries', 
          settleOrderId, 
          'Completed', 
          finalAmount, 
          `Water Delivery: ${orderToSettle.customerName}`,
          undefined,
          {
            roundReturned: typeof roundReturned === 'number' ? roundReturned : 0,
            slimReturned: typeof slimReturned === 'number' ? slimReturned : 0,
          },
          paymentMethod,
          undefined,
          discountCentavos,
          discountType,
          discountReason
        );
        
        setCompletedSale({
          items: [
            ...(orderToSettle.roundOrdered > 0 ? [{ name: 'Round Gallon', quantity: orderToSettle.roundOrdered, price: PRICES.round * 100 }] : []),
            ...(orderToSettle.slimOrdered > 0 ? [{ name: 'Slim Gallon', quantity: orderToSettle.slimOrdered, price: PRICES.slim * 100 }] : []),
          ],
          total: finalAmount,
          paymentMethod,
          saleId: settleOrderId
        });

        toast({ title: 'Delivered', description: `Delivery to ${orderToSettle.customerName} completed and paid!` });
        setSettleOrderId(null);
        setSelectedOrderForStatus(null);
        setRoundReturned('');
        setSlimReturned('');
        setShowReceipt(true);
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50 relative">
      
      <main className="flex-1 overflow-auto p-4 bg-slate-50 relative">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Loaned Round</p>
                <h3 className="text-xl font-black text-amber-700">{loanedRound} Jugs</h3>
              </div>
              <Package className="h-6 w-6 text-amber-400 opacity-50" />
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Loaned Slim</p>
                <h3 className="text-xl font-black text-amber-700">{loanedSlim} Jugs</h3>
              </div>
              <Package className="h-6 w-6 text-amber-400 opacity-50" />
            </CardContent>
          </Card>
        </div>
        
        <section className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div 
              className="p-2 rounded-xl transition-colors duration-300"
              style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
            >
              <Droplet className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-headline font-bold">{currentTenant?.name || 'Water Station'}</h3>
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
              <CardTitle className="text-sm font-bold flex items-center gap-2"><Droplet className="h-4 w-4" /> New Delivery</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3 pt-0">
              <div className="flex gap-2 mb-2">
                <Button 
                  type="button"
                  variant={orderType === 'Delivery' ? 'default' : 'outline'} 
                  className="flex-1 h-8 text-xs font-bold"
                  onClick={() => setOrderType('Delivery')}
                  style={orderType === 'Delivery' ? { backgroundColor: theme.primary, color: 'white' } : {}}
                >
                  <Truck className="h-3 w-3 mr-1" /> Delivery
                </Button>
                <Button 
                  type="button"
                  variant={orderType === 'Walk-in' ? 'default' : 'outline'} 
                  className="flex-1 h-8 text-xs font-bold"
                  onClick={() => setOrderType('Walk-in')}
                  style={orderType === 'Walk-in' ? { backgroundColor: theme.primary, color: 'white' } : {}}
                >
                  <User className="h-3 w-3 mr-1" /> Walk-in
                </Button>
              </div>
              <div className="space-y-1">
                <Label htmlFor="customer-name" className="text-xs">Customer Name</Label>
                <Input id="customer-name" name="customerName" placeholder="e.g. Maria Santos" value={customerName} onChange={e => setCustomerName(e.target.value)} />
              </div>
              {orderType === 'Delivery' && (
                <div className="space-y-1">
                  <Label htmlFor="hydro-address" className="text-xs">Address</Label>
                  <Input id="hydro-address" name="address" placeholder="e.g. Blk 4 Lot 12, Phase 2" value={address} onChange={e => setAddress(e.target.value)} />
                </div>
              )}
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="round-qty" className="text-xs">Round Gallons</Label>
                  <Input id="round-qty" name="roundQty" type="number" placeholder="0" value={roundQty} onChange={e => setRoundQty(parseInt(e.target.value) || '')} />
                </div>
                <div className="flex-1 space-y-1">
                  <Label htmlFor="slim-qty" className="text-xs">Slim Gallons</Label>
                  <Input id="slim-qty" name="slimQty" type="number" placeholder="0" value={slimQty} onChange={e => setSlimQty(parseInt(e.target.value) || '')} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="price-override" className="text-xs flex justify-between">
                  <span>Total Price (₱)</span>
                  <span className="text-muted-foreground">Suggested: ₱{suggestedPrice}</span>
                </Label>
                <Input id="price-override" name="priceOverride" type="number" placeholder={`₱${suggestedPrice}`} value={priceOverride} onChange={e => setPriceOverride(parseFloat(e.target.value) || '')} />
              </div>
              <Button 
                className="w-full h-8 text-xs font-bold text-white" 
                style={{ backgroundColor: theme.primary }}
                onClick={handleAddDelivery}
                disabled={isProcessing || !customerName || (orderType === 'Delivery' && !address) || (roundCount === 0 && slimCount === 0)}
              >
                Log Order
              </Button>
            </CardContent>
          </Card>
        )}

        {/* SETTLEMENT MODAL */}
        {settleOrderId && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-sm shadow-xl animate-in fade-in zoom-in-95">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Settle & Complete</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-slate-500">How many empty bottles did the driver collect from the customer?</p>
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="round-returned" className="text-xs">Empty Round</Label>
                    <Input id="round-returned" name="roundReturned" type="number" placeholder="0" value={roundReturned} onChange={e => setRoundReturned(parseInt(e.target.value) || '')} />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="slim-returned" className="text-xs">Empty Slim</Label>
                    <Input id="slim-returned" name="slimReturned" type="number" placeholder="0" value={slimReturned} onChange={e => setSlimReturned(parseInt(e.target.value) || '')} />
                  </div>
                </div>
                <div className="flex gap-2 w-full mt-4">
                  <Button variant="outline" className="flex-1 font-bold" onClick={() => { setSettleOrderId(null); setSelectedOrderForStatus(null); }}>
                    Cancel
                  </Button>
                  <Button className="flex-1 font-bold text-white shadow-md border-none" style={{ backgroundColor: theme.primary }} onClick={() => setShowPaymentModal(true)}>
                    Proceed to Pay
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {loading ? (
          <div className="text-center py-8 text-sm text-slate-400">Loading deliveries...</div>
        ) : (
          <div className="flex flex-col md:flex-row gap-4 overflow-x-auto pb-4">
            
            {/* Empty Received Column */}
            <div className="flex-1 min-w-[300px]">
              <div className="flex items-center gap-2 mb-3 px-1">
                <Package className="h-4 w-4 text-amber-500" />
                <h4 className="font-bold text-sm text-slate-700">Empty Received</h4>
                <Badge variant="secondary" className="bg-white ml-auto">{emptyReceivedOrders.length}</Badge>
              </div>
              <div className="space-y-2">
                {emptyReceivedOrders.map(order => (
                  <OrderCard key={order.id} order={order} isOwner={isOwner} onDelete={handleDeleteOrder} actions={
                    <Button size="sm" className="w-full h-7 text-[10px] bg-cyan-500 hover:bg-cyan-600 text-white" onClick={() => updateStatus(order.id!, 'Washing')}>
                      <Droplet className="h-3 w-3 mr-1" /> Start Washing
                    </Button>
                  } />
                ))}
              </div>
            </div>

            {/* Washing Column */}
            <div className="flex-1 min-w-[300px]">
              <div className="flex items-center gap-2 mb-3 px-1">
                <Droplet className="h-4 w-4 text-cyan-500" />
                <h4 className="font-bold text-sm text-slate-700">Washing</h4>
                <Badge variant="secondary" className="bg-white ml-auto">{washingOrders.length}</Badge>
              </div>
              <div className="space-y-2">
                {washingOrders.map(order => (
                  <OrderCard key={order.id} order={order} isOwner={isOwner} onDelete={handleDeleteOrder} actions={
                    <Button size="sm" className="w-full h-7 text-[10px] bg-blue-500 hover:bg-blue-600 text-white" onClick={() => updateStatus(order.id!, 'Refilled')}>
                      <Plus className="h-3 w-3 mr-1" /> Finish Refill
                    </Button>
                  } />
                ))}
              </div>
            </div>

            {/* Refilled Column */}
            <div className="flex-1 min-w-[300px]">
              <div className="flex items-center gap-2 mb-3 px-1">
                <CheckCircle2 className="h-4 w-4 text-blue-500" />
                <h4 className="font-bold text-sm text-slate-700">Refilled & Ready</h4>
                <Badge variant="secondary" className="bg-white ml-auto">{refilledOrders.length}</Badge>
              </div>
              <div className="space-y-2">
                {refilledOrders.map(order => (
                  <OrderCard key={order.id} order={order} isOwner={isOwner} onDelete={handleDeleteOrder} actions={
                    order.orderType === 'Walk-in' ? (
                      <Button size="sm" className="w-full h-7 text-[10px] bg-emerald-500 hover:bg-emerald-600 text-white" onClick={() => setSettleOrderId(order.id!)}>
                        <CircleDollarSign className="h-3 w-3 mr-1" /> Settle & Complete
                      </Button>
                    ) : (
                      <div className="w-full flex gap-1">
                        <Input 
                          placeholder="Driver / Tricycle" 
                          className="h-7 text-[10px] border-slate-200"
                          value={driverAssignments[order.id as string] || ''}
                          onChange={e => setDriverAssignments(prev => ({...prev, [order.id as string]: e.target.value}))}
                        />
                        <Button 
                          size="sm" 
                          className="h-7 text-[10px] bg-slate-800 text-white hover:bg-slate-700" 
                          onClick={() => updateStatus(order.id!, 'Out for Delivery', { driver: driverAssignments[order.id as string] || 'Unknown' })}
                        >
                          <Truck className="h-3 w-3 mr-1" /> Dispatch
                        </Button>
                      </div>
                    )
                  } />
                ))}
              </div>
            </div>

            {/* Out for Delivery Column */}
            <div className="flex-1 min-w-[300px]">
              <div className="flex items-center gap-2 mb-3 px-1">
                <Truck className="h-4 w-4 text-cyan-500" />
                <h4 className="font-bold text-sm text-slate-700">Out for Delivery</h4>
                <Badge variant="secondary" className="bg-white ml-auto">{outForDeliveryOrders.length}</Badge>
              </div>
              <div className="space-y-2">
                {outForDeliveryOrders.map(order => (
                  <OrderCard key={order.id} order={order} isOwner={isOwner} onDelete={handleDeleteOrder} actions={
                    <Button size="sm" className="w-full h-7 text-[10px] bg-emerald-500 hover:bg-emerald-600 text-white" onClick={() => { setSettleOrderId(order.id!); setSelectedOrderForStatus(order); }}>
                      <CircleDollarSign className="h-3 w-3 mr-1" /> Settle & Complete
                    </Button>
                  } />
                ))}
              </div>
            </div>

            {/* Completed Column */}
            <div className="flex-1 min-w-[300px]">
              <div className="flex items-center gap-2 mb-3 px-1">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <h4 className="font-bold text-sm text-slate-700">Completed Today</h4>
                <Badge variant="secondary" className="bg-white ml-auto">{completedOrders.length}</Badge>
              </div>
              <div className="space-y-2 opacity-75">
                {completedOrders.map(order => (
                  <OrderCard key={order.id} order={order} isOwner={isOwner} onDelete={handleDeleteOrder} actions={
                    <Button disabled size="sm" variant="outline" className="w-full h-7 text-[10px] font-bold text-emerald-600 border-emerald-200 bg-emerald-50">
                      Settled
                    </Button>
                  } />
                ))}
              </div>
            </div>
          </div>
        )}

      </main>

      <ServicePaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        amountDue={selectedOrderForStatus?.amountDue || 0}
        onConfirm={(method, discountCentavos, discountType, discountReason) => {
          setShowPaymentModal(false);
          handleSettleAndDeliver(method, discountCentavos || 0, discountType || undefined, discountReason || '');
        }}
      />
      
      <ThermalReceiptPreview
        open={showReceipt}
        onClose={() => setShowReceipt(false)}
        storeName={currentTenant?.name || "Water Station"}
        receiptType="DELIVERY RECEIPT"
        items={completedSale?.items || []}
        totalAmountPesos={(completedSale?.total || 0) / 100}
        paymentMethod={completedSale?.paymentMethod || "cash"}
        transactionId={completedSale?.saleId}
        theme={theme}
      />

    </div>
  );
}
