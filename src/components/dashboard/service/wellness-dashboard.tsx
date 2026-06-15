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
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from 'date-fns';
import { getModuleTheme, useDynamicThemeColor } from '@/lib/theme-utils';
import { useSpaAppointments } from '@/hooks/use-spa';
import { useToast } from '@/hooks/use-toast';
import { ServicePaymentModal } from '@/components/common/service-payment-modal';
import { 
  Sun, 
  Plus, 
  UserCircle2,
  Flower2,
  Coffee,
  CheckCircle2,
  CircleDollarSign,
  CalendarDays,
  Clock,
  ArrowRight
} from "lucide-react";

const SERVICE_PRICES: Record<string, number> = {
  'Massage': 500,
  'Facial': 800,
  'Body Scrub': 1000,
  'Spa Package': 1500,
};

export function WellnessDashboard() {
  const { currentTenant } = useTenant();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [isProcessing, setIsProcessing] = useState(false);

  const theme = getModuleTheme(currentTenant?.moduleType);
  useDynamicThemeColor(theme);

  // Spa State
  const { scheduledAppointments, waitingAppointments, inSessionAppointments, restingAppointments, doneAppointments, loading } = useSpaAppointments();
  const [roomAssignments, setRoomAssignments] = useState<Record<string, string>>({});

  // Create Booking Form
  const [showAddForm, setShowAddForm] = useState(false);
  const [isScheduled, setIsScheduled] = useState(false);
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('');
  const [clientName, setClientName] = useState('');
  const [therapistName, setTherapistName] = useState('');
  const [serviceType, setServiceType] = useState('Massage');
  const [priceOverride, setPriceOverride] = useState<number | ''>('');
  const [selectedOrderForPayment, setSelectedOrderForPayment] = useState<any>(null);

  // Loyalty Program
  const [customerPhone, setCustomerPhone] = useState('');
  const [pointsBalance, setPointsBalance] = useState(0);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [isFetchingPoints, setIsFetchingPoints] = useState(false);

  React.useEffect(() => {
    const fetchPoints = async () => {
      const cleanPhone = customerPhone.replace(/[^0-9+]/g, '');
      if (cleanPhone.length >= 10 && currentTenant) {
        setIsFetchingPoints(true);
        try {
          const { getCustomerPoints } = await import('@/firebase/firestore/loyalty-actions');
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
  }, [customerPhone, currentTenant]);

  // Auto-calculate suggested price
  const suggestedPrice = SERVICE_PRICES[serviceType] || 0;
  const rawFinalPrice = typeof priceOverride === 'number' ? priceOverride : suggestedPrice;
  const pointsDiscount = isRedeeming ? 50 : 0;
  const finalPrice = Math.max(0, rawFinalPrice - pointsDiscount);

  const handleAddAppointment = async () => {
    if (!currentTenant || !db || !clientName || !therapistName) return;
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

      const apptRef = doc(collection(db, 'tenants', currentTenant.id, 'spa_appointments'));
      await setDoc(apptRef, {
        tenantId: currentTenant.id,
        clientName,
        therapistName,
        serviceType,
        status: isScheduled ? 'Scheduled' : 'Waiting',
        amountDue: Math.round(finalPrice * 100), // convert to cents securely
        paymentStatus: 'Unpaid',
        customerPhone: customerPhone || null,
        appointmentDate: aptTimestamp,
        createdAt: serverTimestamp(),
      });
      setClientName('');
      setTherapistName('');
      setServiceType('Massage');
      setPriceOverride('');
      setCustomerPhone('');
      setIsRedeeming(false);
      setIsScheduled(false);
      setAppointmentDate('');
      setAppointmentTime('');
      setShowAddForm(false);
      toast({ title: isScheduled ? 'Appointment Booked!' : 'Booking Added!', description: isScheduled ? `${clientName} has been booked.` : `${clientName} is now in the waiting lounge.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const updateStatus = async (appointment: any, status: string, paymentStatus?: string, roomName?: string, paymentMethod: string = 'cash') => {
    if (!currentTenant || !db) return;
    try {
      if (paymentStatus === 'Paid') {
        // ERP INTEGRATION: Complete order and collect payment
        
        // Calculate commission for the therapist (Default 40% if not set in tenant settings)
        const commissionPercentage = currentTenant.therapistCommissionRate ?? 0.40;
        const commissionCentavos = Math.round((appointment.amountDue || 0) * commissionPercentage);
        
        await completeServiceOrder(
          currentTenant.id,
          'spa_appointments',
          appointment.id,
          status,
          appointment.amountDue || 0,
          `Spa/Massage: ${appointment.clientName} (${appointment.serviceType})`,
          commissionCentavos,
          {},
          paymentMethod
        );
        if (appointment.customerPhone && appointment.amountDue > 0) {
          try {
            const { awardPoints } = await import('@/firebase/firestore/loyalty-actions');
            await awardPoints(currentTenant.id, appointment.customerPhone, appointment.amountDue, appointment.referrerCode);
          } catch (e) {
            console.error("Failed to award points:", e);
          }
        }
      } else {
        const apptRef = doc(db, 'tenants', currentTenant.id, 'spa_appointments', appointment.id);
        const updates: any = { status, updatedAt: serverTimestamp() };
        if (paymentStatus) updates.paymentStatus = paymentStatus;
        if (roomName) updates.roomNumber = roomName;
        await updateDoc(apptRef, updates);
      }
      toast({ title: 'Status Updated', description: `Client moved to ${status}.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const AppointmentCard = ({ appointment, actions }: { appointment: any, actions: React.ReactNode }) => (
    <Card className="shadow-sm border-slate-200 mb-3 hover:shadow-md transition-shadow">
      <CardContent className="p-3">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
              <UserCircle2 className="h-4 w-4 text-purple-400" />
              {appointment.clientName}
            </h4>
            <div className="flex items-center gap-2 mt-1.5">
              <Badge variant="secondary" className="text-[10px] bg-purple-50 text-purple-600 border-purple-100">
                {appointment.serviceType}
              </Badge>
              <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                w/ {appointment.therapistName}
              </span>
              {appointment.roomNumber && (
                <Badge variant="outline" className="text-[9px] border-slate-200 text-slate-600 bg-slate-50">
                  {appointment.roomNumber}
                </Badge>
              )}
            </div>
          </div>
          <div className="text-right">
            <Badge variant="outline" className={appointment.paymentStatus === 'Paid' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}>
              {appointment.paymentStatus}
            </Badge>
            <p className="text-sm font-bold text-slate-700 mt-1">₱{(appointment.amountDue / 100).toLocaleString()}</p>
            {appointment.appointmentDate && appointment.status === 'Scheduled' && (
              <p className="text-[10px] font-bold text-amber-600 mt-0.5 flex items-center justify-end gap-1">
                <Clock className="h-3 w-3" />
                {appointment.appointmentDate.toDate ? format(appointment.appointmentDate.toDate(), 'MMM d, h:mm a') : format(new Date(appointment.appointmentDate), 'MMM d, h:mm a')}
              </p>
            )}
            {appointment.therapistCommission && (
              <p className="text-[9px] font-bold text-emerald-600 mt-0.5">
                +₱{(appointment.therapistCommission / 100).toLocaleString()} Comm
              </p>
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
              <Sun className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-headline font-bold">{currentTenant?.name || 'Wellness Center'}</h3>
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
                <span className="flex items-center gap-2"><Sun className="h-4 w-4 text-purple-500" /> New Walk-in / Booking</span>
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
                    <Label className="text-xs font-bold text-slate-700">Date</Label>
                    <Input type="date" value={appointmentDate} onChange={e => setAppointmentDate(e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs font-bold text-slate-700">Time</Label>
                    <Input type="time" value={appointmentTime} onChange={e => setAppointmentTime(e.target.value)} className="h-8 text-xs" />
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Client Name</Label>
                <Input placeholder="e.g. Ana Reyes" value={clientName} onChange={e => setClientName(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Therapist</Label>
                  <Input placeholder="e.g. Jen" value={therapistName} onChange={e => setTherapistName(e.target.value)} />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Service</Label>
                  <select 
                    className="w-full border-slate-200 rounded-md border p-2 text-sm h-9"
                    value={serviceType}
                    onChange={(e) => setServiceType(e.target.value)}
                  >
                    {Object.keys(SERVICE_PRICES).map(type => (
                      <option key={type} value={type}>{type} (₱{SERVICE_PRICES[type]})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1 mt-2">
                <Label htmlFor="customer-phone" className="text-xs">Customer Phone (For Points)</Label>
                <Input id="customer-phone" placeholder="e.g. 09171234567" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="h-9" />
                {customerPhone && pointsBalance >= 100 && rawFinalPrice >= 50 && (
                  <div className="flex items-center space-x-2 mt-2 bg-emerald-50 p-2 rounded-lg border border-emerald-100">
                    <Switch 
                      id="redeem-points-wellness" 
                      checked={isRedeeming}
                      onCheckedChange={setIsRedeeming}
                      className="data-[state=checked]:bg-emerald-500"
                    />
                    <Label htmlFor="redeem-points-wellness" className="text-xs font-bold text-emerald-800 cursor-pointer">
                      Redeem 100 pts for ₱50 Off
                    </Label>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs flex justify-between">
                  <span>Total Price (₱)</span>
                  <span className="text-muted-foreground">Suggested: ₱{suggestedPrice}</span>
                </Label>
                <div className="flex gap-2 items-center">
                  <Input className="flex-1" type="number" placeholder={`₱${suggestedPrice}`} value={priceOverride} onChange={e => setPriceOverride(parseFloat(e.target.value) || '')} />
                  {isRedeeming && <span className="text-xs font-bold text-emerald-600">-₱50.00 Rewards</span>}
                </div>
                <div className="text-right text-lg font-black text-slate-800">
                  Final: ₱{finalPrice.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <Button 
                className="w-full h-8 text-xs font-bold text-white" 
                style={{ backgroundColor: theme.primary }}
                onClick={handleAddAppointment}
                disabled={isProcessing || !clientName || !therapistName}
              >
                Log Client
              </Button>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="queue" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4 rounded-xl">
            <TabsTrigger value="queue" className="rounded-lg text-xs md:text-sm font-bold">Live Lounge</TabsTrigger>
            <TabsTrigger value="calendar" className="rounded-lg text-xs md:text-sm font-bold">Appointments</TabsTrigger>
          </TabsList>

          <TabsContent value="calendar" className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <CalendarDays className="h-5 w-5" style={{ color: theme.primary }} />
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">Upcoming Bookings</h3>
            </div>
            
            {loading ? (
              <div className="text-center py-8 text-sm text-slate-400">Loading bookings...</div>
            ) : scheduledAppointments.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl text-slate-400">
                <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-xs font-medium">No upcoming appointments</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {scheduledAppointments.map(appt => (
                  <AppointmentCard key={appt.id} appointment={appt} actions={
                    <Button size="sm" className="w-full h-7 text-[10px] bg-slate-800 hover:bg-slate-700" onClick={() => updateStatus(appt, 'Waiting')}>
                      <ArrowRight className="h-3 w-3 mr-1" /> Client Arrived
                    </Button>
                  } />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="queue" className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
            {loading ? (
              <div className="text-center py-8 text-sm text-slate-400">Loading reception board...</div>
            ) : (
          <div className="flex flex-col md:flex-row gap-4 overflow-x-auto pb-4">
            
            {/* Waiting Column */}
            <div className="flex-1 min-w-[280px]">
              <div className="flex items-center gap-2 mb-3 px-1">
                <UserCircle2 className="h-4 w-4 text-amber-500" />
                <h4 className="font-bold text-sm text-slate-700">Waiting Lounge</h4>
                <Badge variant="secondary" className="bg-white ml-auto">{waitingAppointments.length}</Badge>
              </div>
              <div className="space-y-2">
                {waitingAppointments.map(appt => (
                  <AppointmentCard key={appt.id} appointment={appt} actions={
                    <div className="w-full flex gap-1">
                      <select 
                        className="border border-slate-200 text-[10px] rounded px-1 max-w-[80px]"
                        value={roomAssignments[appt.id as string] || ''}
                        onChange={e => setRoomAssignments(prev => ({...prev, [appt.id as string]: e.target.value}))}
                      >
                        <option value="">Room</option>
                        <option value="Room 1">Room 1</option>
                        <option value="Room 2">Room 2</option>
                        <option value="Room 3">Room 3</option>
                        <option value="VIP Room">VIP</option>
                      </select>
                      <Button 
                        size="sm" 
                        className="flex-1 h-7 text-[10px] bg-purple-600 hover:bg-purple-700" 
                        disabled={!roomAssignments[appt.id as string]}
                        onClick={() => updateStatus(appt, 'In Session', undefined, roomAssignments[appt.id as string])}
                      >
                        <Flower2 className="h-3 w-3 mr-1 text-purple-200" /> Start
                      </Button>
                    </div>
                  } />
                ))}
              </div>
            </div>

            {/* In Session Column */}
            <div className="flex-1 min-w-[280px]">
              <div className="flex items-center gap-2 mb-3 px-1">
                <Flower2 className="h-4 w-4 text-purple-500" />
                <h4 className="font-bold text-sm text-slate-700">In Session</h4>
                <Badge variant="secondary" className="bg-white ml-auto">{inSessionAppointments.length}</Badge>
              </div>
              <div className="space-y-2">
                {inSessionAppointments.map(appt => (
                  <AppointmentCard key={appt.id} appointment={appt} actions={
                    <Button size="sm" className="w-full h-7 text-[10px] bg-sky-500 hover:bg-sky-600 text-white" onClick={() => updateStatus(appt, 'Resting')}>
                      <Coffee className="h-3 w-3 mr-1 text-sky-100" /> Move to Resting Area
                    </Button>
                  } />
                ))}
              </div>
            </div>

            {/* Resting Column */}
            <div className="flex-1 min-w-[280px]">
              <div className="flex items-center gap-2 mb-3 px-1">
                <Coffee className="h-4 w-4 text-sky-400" />
                <h4 className="font-bold text-sm text-slate-700">Resting / Tea Area</h4>
                <Badge variant="secondary" className="bg-white ml-auto">{restingAppointments.length}</Badge>
              </div>
              <div className="space-y-2">
                {restingAppointments.map(appt => (
                  <AppointmentCard key={appt.id} appointment={appt} actions={
                    <Button size="sm" className="w-full h-7 text-[10px] bg-emerald-500 hover:bg-emerald-600 text-white" onClick={() => setSelectedOrderForPayment(appt)}>
                      <CircleDollarSign className="h-3 w-3 mr-1" /> Checkout & Pay
                    </Button>
                  } />
                ))}
              </div>
            </div>

            {/* Done Column */}
            <div className="flex-1 min-w-[280px]">
              <div className="flex items-center gap-2 mb-3 px-1">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <h4 className="font-bold text-sm text-slate-700">Completed Today</h4>
                <Badge variant="secondary" className="bg-white ml-auto">{doneAppointments.length}</Badge>
              </div>
              <div className="space-y-2 opacity-70">
                {doneAppointments.map(appt => (
                  <AppointmentCard key={appt.id} appointment={appt} actions={
                    <Button disabled size="sm" variant="outline" className="w-full h-7 text-[10px] font-bold text-emerald-600 border-emerald-200 bg-emerald-50">
                      Settled
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
            onConfirm={(method) => {
              updateStatus(selectedOrderForPayment, 'Done', 'Paid', undefined, method);
              setSelectedOrderForPayment(null);
            }}
          />
        )}

      </main>
    </div>
  );
}
