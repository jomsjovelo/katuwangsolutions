"use client"

import React, { useState, useEffect } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { doc, collection, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { completeServiceOrder, deleteServiceOrder } from '@/firebase/firestore/service-actions';
import { useUser } from '@/firebase/auth/use-user';
import { awardPoints } from '@/firebase/firestore/loyalty-actions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getModuleTheme, useDynamicThemeColor } from '@/lib/theme-utils';
import { useLaundry } from '@/hooks/use-laundry';
import { useToast } from '@/hooks/use-toast';
import { ServicePaymentModal } from '@/components/common/service-payment-modal';
import { 
  Shirt, 
  Plus, 
  WashingMachine,
  CheckCircle2,
  Package,
  CircleDollarSign,
  Droplets,
  MessageSquare,
  Clock,
  Trash2
} from "lucide-react";

const RATES: Record<string, number> = {
  'Wash & Fold': 30,
  'Wash, Dry, Fold': 40,
  'Dry Clean': 100,
  'Ironing': 50,
};

let sharedInterval: NodeJS.Timeout | null = null;
let tickSubscribers: ((now: number) => void)[] = [];

function subscribeTick(cb: (now: number) => void) {
  tickSubscribers.push(cb);
  if (!sharedInterval) {
    sharedInterval = setInterval(() => {
      const current = Date.now();
      tickSubscribers.forEach(s => s(current));
    }, 60000);
  }
  return () => {
    tickSubscribers = tickSubscribers.filter(s => s !== cb);
    if (tickSubscribers.length === 0 && sharedInterval) {
      clearInterval(sharedInterval);
      sharedInterval = null;
    }
  };
}

function useMinuteTick() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    return subscribeTick(setNow);
  }, []);
  return now;
}

const WashTimer = React.memo(({ startTime }: { startTime: number }) => {
  const now = useMinuteTick();
  const elapsed = Math.floor((now - startTime) / 60000);
  
  return <span className="text-[10px] text-indigo-600 font-bold ml-1 flex items-center gap-1"><Clock className="h-3 w-3" />{elapsed}m</span>;
});

const OrderCard = React.memo(({ order, actions, isOwner, onDelete }: { order: any, actions: React.ReactNode, isOwner: boolean, onDelete: (id: string) => void }) => (
  <Card className="shadow-sm border-slate-200 mb-3">
    <CardContent className="p-3">
      <div className="flex justify-between items-start mb-2">
        <div className="flex gap-2">
          <div>
            <h4 className="font-bold text-slate-800 text-sm">{order.customerName}</h4>
            <div className="text-xs text-slate-500 flex items-center mt-0.5">
            {order.kilos} kg • {order.serviceType}
            {order.status === 'Washing' && order.washStartTime && <WashTimer startTime={order.washStartTime} />}
            {order.machineNumber && (
              <Badge variant="outline" className="text-[9px] border-slate-200 text-slate-600 bg-slate-50 ml-2">
                {order.machineNumber}
              </Badge>
            )}
          </div>
          </div>
          {isOwner && (
            <Button variant="ghost" size="icon" className="h-5 w-5 text-slate-400 hover:text-red-500 rounded-full shrink-0" onClick={() => onDelete(order.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
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
));
OrderCard.displayName = 'OrderCard';

export function SpinDashboard() {
  const { currentTenant } = useTenant();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [isProcessing, setIsProcessing] = useState(false);

  const theme = getModuleTheme(currentTenant?.moduleType);
  useDynamicThemeColor(theme);

  const { user } = useUser();
  const isOwner = currentTenant?.ownerUid === user?.uid || (currentTenant as any)?.role === 'owner';

  // Laundry State
  const { queuedOrders, washingOrders, readyOrders, claimedOrders, loading, error: laundryError } = useLaundry();
  const [machineAssignments, setMachineAssignments] = useState<Record<string, string>>({});

  useEffect(() => {
    if (laundryError) {
      console.error("Spin listener error:", laundryError);
      toast({ title: 'Connection Error', description: 'Failed to sync live queue.', variant: 'destructive' });
    }
  }, [laundryError, toast]);

  // Create Drop-off Form
  const [showAddForm, setShowAddForm] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [kilos, setKilos] = useState<number | ''>('');
  const [serviceType, setServiceType] = useState('Wash, Dry, Fold');
  const [priceOverride, setPriceOverride] = useState<number | ''>('');
  const [selectedOrderForPayment, setSelectedOrderForPayment] = useState<any>(null);

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
        phoneNumber,
        kilos,
        serviceType,
        status: 'Queued',
        amountDue: Math.round(finalPrice * 100), // convert to cents securely
        paymentStatus: 'Unpaid',
        createdAt: serverTimestamp(),
      });
      setCustomerName('');
      setPhoneNumber('');
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

  const updateStatus = async (order: any, status: string, paymentStatus?: string, machineNumber?: string, paymentMethod: string = 'cash', discountCentavos: number = 0, discountType?: 'percentage' | 'fixed') => {
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
          `Laundry: ${order.customerName} (${order.kilos}kg)`,
          undefined,
          {},
          paymentMethod,
          discountCentavos,
          discountType
        );
        
        // Loyalty Points
        if (order.phoneNumber) {
          await awardPoints(currentTenant.id, order.phoneNumber, order.amountDue || 0, order.referrerCode);
        }
      } else {
        const orderRef = doc(db, 'tenants', currentTenant.id, 'laundry_orders', order.id);
        const updates: any = { status, updatedAt: serverTimestamp() };
        if (paymentStatus) updates.paymentStatus = paymentStatus;
        if (machineNumber) updates.machineNumber = machineNumber;
        if (status === 'Washing') updates.washStartTime = Date.now();
        await updateDoc(orderRef, updates);
      }
      toast({ title: 'Status Updated', description: `Order moved to ${status}.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleCopySMS = (order: any) => {
    const text = `Hi ${order.customerName}! Your laundry (${order.kilos}kg) at ${currentTenant?.name} is ready for pickup. Amount due: ₱${(order.amountDue / 100).toLocaleString()}. See you soon!`;
    navigator.clipboard.writeText(text);
    toast({ title: 'SMS Copied', description: 'Message ready to paste.' });
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!currentTenant || !user) return;
    if (!window.confirm("Sigurado ka bang gusto mong i-delete o i-void ang order na ito? Ibabalik nito ang bayad kung applicable.")) return;
    try {
      await deleteServiceOrder(currentTenant.id, 'laundry_orders', orderId, user.uid, user.displayName || user.email || 'Unknown User');
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
              <div className="grid grid-cols-1 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="customer-name" className="text-xs">Customer Name</Label>
                  <Input id="customer-name" name="customerName" placeholder="e.g. Maria Santos" value={customerName} onChange={e => setCustomerName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="customer-phone" className="text-xs">Phone Number (For Points & SMS)</Label>
                  <Input id="customer-phone" name="customerPhone" placeholder="e.g. 09171234567" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="laundry-weight" className="text-xs">Weight (Kilos)</Label>
                  <Input id="laundry-weight" name="laundryWeight" type="number" placeholder="0" value={kilos} onChange={e => setKilos(parseFloat(e.target.value) || '')} />
                </div>
                <div className="flex-1 space-y-1">
                  <Label htmlFor="laundry-service" className="text-xs">Service</Label>
                  <select 
                    id="laundry-service"
                    name="laundryService"
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
                <Label htmlFor="price-override" className="text-xs flex justify-between">
                  <span>Total Price (₱)</span>
                  <span className="text-muted-foreground">Suggested: ₱{suggestedPrice}</span>
                </Label>
                <Input id="price-override" name="priceOverride" type="number" placeholder={`₱${suggestedPrice}`} value={priceOverride} onChange={e => setPriceOverride(parseFloat(e.target.value) || '')} />
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
                  <OrderCard key={order.id} order={order} isOwner={isOwner} onDelete={handleDeleteOrder} actions={
                    <div className="w-full flex gap-1">
                      <select 
                        className="border border-slate-200 text-[10px] rounded px-1 max-w-[80px]"
                        value={machineAssignments[order.id as string] || ''}
                        onChange={e => setMachineAssignments(prev => ({...prev, [order.id as string]: e.target.value}))}
                      >
                        <option value="">Washer</option>
                        <option value="W1">W1</option>
                        <option value="W2">W2</option>
                        <option value="W3">W3</option>
                        <option value="W4">W4</option>
                      </select>
                      <Button 
                        size="sm" 
                        className="flex-1 h-7 text-[10px] bg-slate-800 disabled:opacity-50" 
                        disabled={!machineAssignments[order.id as string]}
                        onClick={() => updateStatus(order, 'Washing', undefined, machineAssignments[order.id as string])}
                      >
                        <Droplets className="h-3 w-3 mr-1" /> Start Washing
                      </Button>
                    </div>
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
                  <OrderCard key={order.id} order={order} isOwner={isOwner} onDelete={handleDeleteOrder} actions={
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
                  <OrderCard key={order.id} order={order} isOwner={isOwner} onDelete={handleDeleteOrder} actions={
                    <>
                      <Button size="sm" variant="outline" className="flex-1 h-7 text-[10px] border-slate-200" onClick={() => handleCopySMS(order)}>
                        <MessageSquare className="h-3 w-3 mr-1 text-slate-500" /> SMS
                      </Button>
                      <Button size="sm" className="flex-1 h-7 text-[10px] bg-emerald-500 hover:bg-emerald-600" onClick={() => setSelectedOrderForPayment(order)}>
                        <CircleDollarSign className="h-3 w-3 mr-1" /> Pay & Claim
                      </Button>
                    </>
                  } />
                ))}
              </div>
            </div>

            {/* Claimed Column */}
            <div className="flex-1 min-w-[300px]">
              <div className="flex items-center gap-2 mb-3 px-1">
                <CheckCircle2 className="h-4 w-4 text-slate-500" />
                <h4 className="font-bold text-sm text-slate-700">Claimed Today</h4>
                <Badge variant="secondary" className="bg-white ml-auto">{claimedOrders.length}</Badge>
              </div>
              <div className="space-y-2 opacity-75">
                {claimedOrders.map(order => (
                  <OrderCard key={order.id} order={order} isOwner={isOwner} onDelete={handleDeleteOrder} actions={
                    <Button disabled size="sm" variant="outline" className="w-full h-7 text-[10px] font-bold text-emerald-600 border-emerald-200 bg-emerald-50">
                      Completed
                    </Button>
                  } />
                ))}
              </div>
            </div>

          </div>
        )}

        {selectedOrderForPayment && (
          <ServicePaymentModal
            isOpen={!!selectedOrderForPayment}
            onClose={() => setSelectedOrderForPayment(null)}
            amountDue={selectedOrderForPayment.amountDue}
            onConfirm={(method, discountCentavos, discountType) => {
              updateStatus(selectedOrderForPayment, 'Claimed', 'Paid', undefined, method, discountCentavos, discountType);
              setSelectedOrderForPayment(null);
            }}
          />
        )}

      </main>
    </div>
  );
}
