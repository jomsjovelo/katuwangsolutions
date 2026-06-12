"use client"

import React, { useState } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { doc, collection, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { completeServiceOrder } from '@/firebase/firestore/service-actions';
import { awardPoints } from '@/firebase/firestore/loyalty-actions';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getModuleTheme, useDynamicThemeColor } from '@/lib/theme-utils';
import { useSalonAppointments } from '@/hooks/use-salon';
import { useToast } from '@/hooks/use-toast';
import { 
  Scissors, 
  Plus, 
  UserCircle2,
  Armchair,
  CheckCircle2,
  CircleDollarSign,
  Trophy,
  Megaphone
} from "lucide-react";

const SERVICE_PRICES: Record<string, number> = {
  'Haircut': 200,
  'Shave/Beard': 150,
  'Hair Color': 800,
  'Treatment': 500,
  'Rebond': 1500,
};

export function TrimTrackDashboard() {
  const { currentTenant } = useTenant();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [isProcessing, setIsProcessing] = useState(false);

  const theme = getModuleTheme(currentTenant?.moduleType);
  useDynamicThemeColor(theme);

  // Salon State
  const { waitingAppointments, inChairAppointments, doneAppointments, loading, error: salonError } = useSalonAppointments();
  const [chairAssignments, setChairAssignments] = useState<Record<string, string>>({});

  React.useEffect(() => {
    if (salonError) {
      console.error("Salon listener error:", salonError);
      toast({ title: 'Connection Error', description: 'Failed to sync appointments.', variant: 'destructive' });
    }
  }, [salonError, toast]);

  // Create Booking Form
  const [showAddForm, setShowAddForm] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [stylistName, setStylistName] = useState('');
  const [serviceType, setServiceType] = useState('Haircut');
  const [priceOverride, setPriceOverride] = useState<number | ''>('');

  // Auto-calculate suggested price
  const suggestedPrice = SERVICE_PRICES[serviceType] || 0;
  const finalPrice = typeof priceOverride === 'number' ? priceOverride : suggestedPrice;

  const handleAddAppointment = async () => {
    if (!currentTenant || !db || !customerName || !stylistName || finalPrice < 0 || isNaN(finalPrice)) {
      if (finalPrice < 0 || isNaN(finalPrice)) toast({ title: 'Error', description: 'Invalid price.', variant: 'destructive' });
      return;
    }
    setIsProcessing(true);
    try {
      const apptRef = doc(collection(db, 'tenants', currentTenant.id, 'salon_appointments'));
      await setDoc(apptRef, {
        tenantId: currentTenant.id,
        customerName,
        phoneNumber,
        stylistName,
        serviceType,
        status: 'Waiting',
        queueNumber: waitingAppointments.length + inChairAppointments.length + doneAppointments.length + 1,
        amountDue: Math.round(finalPrice * 100), // convert to cents safely
        paymentStatus: 'Unpaid',
        createdAt: serverTimestamp(),
      });
      setCustomerName('');
      setPhoneNumber('');
      setStylistName('');
      setServiceType('Haircut');
      setPriceOverride('');
      setShowAddForm(false);
      toast({ title: 'Customer Logged!', description: `${customerName} is now waiting.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const updateStatus = async (appt: any, status: string, paymentStatus?: string, chairNumber?: string) => {
    if (!currentTenant || !db) return;
    try {
      if (status === 'Done' && paymentStatus === 'Paid') {
        await completeServiceOrder(
          currentTenant.id, 
          'salon_appointments', 
          appt.id, 
          status, 
          appt.amountDue, 
          `Salon: ${appt.serviceType} for ${appt.customerName}`
        );
        
        // Loyalty Points
        if (appt.phoneNumber) {
          await awardPoints(currentTenant.id, appt.phoneNumber, appt.amountDue || 0);
        }
      } else {
        const apptRef = doc(db, 'tenants', currentTenant.id, 'salon_appointments', appt.id);
        const updates: any = { status, updatedAt: serverTimestamp() };
        if (paymentStatus) updates.paymentStatus = paymentStatus;
        if (chairNumber) updates.chairNumber = chairNumber;
        await updateDoc(apptRef, updates);
      }
      toast({ title: 'Status Updated', description: `Customer moved to ${status}.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const leaderboard = React.useMemo(() => {
    const stats: Record<string, { count: number, total: number }> = {};
    doneAppointments.forEach((appt: any) => {
      const name = appt.stylistName || 'Unknown';
      if (!stats[name]) stats[name] = { count: 0, total: 0 };
      stats[name].count += 1;
      stats[name].total += appt.amountDue || 0;
    });
    return Object.entries(stats).sort((a, b) => b[1].total - a[1].total);
  }, [doneAppointments]);

  const AppointmentCard = ({ appointment, actions }: { appointment: any, actions: React.ReactNode }) => (
    <Card className="shadow-sm border-slate-200 mb-3 hover:shadow-md transition-shadow">
      <CardContent className="p-3">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
              <span className="bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded font-black">#{appointment.queueNumber || '?'}</span>
              {appointment.customerName}
            </h4>
            <div className="flex items-center gap-2 mt-1.5">
              <Badge variant="secondary" className="text-[10px] bg-rose-50 text-rose-600 border-rose-100">
                {appointment.serviceType}
              </Badge>
              <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                by {appointment.stylistName}
              </span>
              {appointment.chairNumber && (
                <Badge variant="outline" className="text-[9px] border-slate-200 text-slate-600 bg-slate-50 ml-1">
                  {appointment.chairNumber}
                </Badge>
              )}
            </div>
          </div>
          <div className="text-right">
            <Badge variant="outline" className={appointment.paymentStatus === 'Paid' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}>
              {appointment.paymentStatus}
            </Badge>
            <p className="text-sm font-bold text-slate-700 mt-1">₱{(appointment.amountDue / 100).toLocaleString()}</p>
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
              <Scissors className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-headline font-bold">{currentTenant?.name || 'Salon & Barbershop'}</h3>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">{theme.name}</p>
            </div>
          </div>
          <Button size="sm" className="h-8 w-8 rounded-full p-0" onClick={() => setShowAddForm(!showAddForm)} style={{ backgroundColor: theme.primary }}>
            <Plus className="h-4 w-4" />
          </Button>
        </section>

        {/* Now Serving Banner */}
        {inChairAppointments.length > 0 && (
          <div className="bg-slate-800 text-white p-3 rounded-2xl flex items-center gap-3 shadow-md animate-in slide-in-from-top-4">
            <div className="p-2 bg-white/20 rounded-xl">
              <Megaphone className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest">Now Serving</p>
              <p className="text-sm font-bold flex gap-2">
                {inChairAppointments.map((appt: any) => (
                  <span key={appt.id}>#{appt.queueNumber || '?'}</span>
                ))}
              </p>
            </div>
          </div>
        )}

        {showAddForm && (
          <Card className="shadow-sm border-slate-200 bg-white border-l-4" style={{ borderLeftColor: theme.primary }}>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2"><Scissors className="h-4 w-4 text-rose-500" /> New Customer</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3 pt-0">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="customer-name" className="text-xs">Customer Name</Label>
                  <Input id="customer-name" name="customerName" placeholder="e.g. John Doe" value={customerName} onChange={e => setCustomerName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="phone-number" className="text-xs">Phone (For Rewards)</Label>
                  <Input id="phone-number" name="phoneNumber" placeholder="09XX" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="stylist-name" className="text-xs">Barber / Stylist</Label>
                  <Input id="stylist-name" name="stylistName" placeholder="e.g. Mark" value={stylistName} onChange={e => setStylistName(e.target.value)} />
                </div>
                <div className="flex-1 space-y-1">
                  <Label htmlFor="service-type" className="text-xs">Service</Label>
                  <select 
                    id="service-type"
                    name="serviceType"
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
                onClick={handleAddAppointment}
                disabled={isProcessing || !customerName || !stylistName}
              >
                Log Customer
              </Button>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="text-center py-8 text-sm text-slate-400">Loading shop floor...</div>
        ) : (
          <div className="flex flex-col md:flex-row gap-4 overflow-x-auto pb-4">
            
            {/* Waiting Column */}
            <div className="flex-1 min-w-[280px]">
              <div className="flex items-center gap-2 mb-3 px-1">
                <UserCircle2 className="h-4 w-4 text-amber-500" />
                <h4 className="font-bold text-sm text-slate-700">Waiting Area</h4>
                <Badge variant="secondary" className="bg-white ml-auto">{waitingAppointments.length}</Badge>
              </div>
              <div className="space-y-2">
                {waitingAppointments.map(appt => (
                  <AppointmentCard key={appt.id} appointment={appt} actions={
                    <div className="w-full flex gap-1">
                      <select 
                        className="border border-slate-200 text-[10px] rounded px-1 max-w-[80px]"
                        value={chairAssignments[appt.id as string] || ''}
                        onChange={e => setChairAssignments(prev => ({...prev, [appt.id as string]: e.target.value}))}
                      >
                        <option value="">Chair</option>
                        <option value="Chair 1">Chair 1</option>
                        <option value="Chair 2">Chair 2</option>
                        <option value="Chair 3">Chair 3</option>
                        <option value="Chair 4">Chair 4</option>
                      </select>
                      <Button 
                        size="sm" 
                        className="flex-1 h-7 text-[10px] bg-rose-600 hover:bg-rose-700 disabled:opacity-50" 
                        disabled={!chairAssignments[appt.id as string]}
                        onClick={() => updateStatus(appt, 'In Chair', undefined, chairAssignments[appt.id as string])}
                      >
                        <Armchair className="h-3 w-3 mr-1 text-rose-200" /> Sit In Chair
                      </Button>
                    </div>
                  } />
                ))}
              </div>
            </div>

            {/* In Chair Column */}
            <div className="flex-1 min-w-[280px]">
              <div className="flex items-center gap-2 mb-3 px-1">
                <Armchair className="h-4 w-4 text-rose-500" />
                <h4 className="font-bold text-sm text-slate-700">In Chair</h4>
                <Badge variant="secondary" className="bg-white ml-auto">{inChairAppointments.length}</Badge>
              </div>
              <div className="space-y-2">
                {inChairAppointments.map(appt => (
                  <AppointmentCard key={appt.id} appointment={appt} actions={
                    <Button size="sm" className="w-full h-7 text-[10px] bg-emerald-500 hover:bg-emerald-600 text-white" onClick={() => updateStatus(appt, 'Done', 'Paid')}>
                      <CircleDollarSign className="h-3 w-3 mr-1" /> Finish & Checkout
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

        {/* Barber Leaderboard */}
        {leaderboard.length > 0 && (
          <Card className="shadow-sm border-slate-200 mt-4">
            <CardHeader className="p-4 pb-2 border-b bg-slate-50">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" /> Stylist Leaderboard Today
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {leaderboard.map(([name, stat], idx) => (
                  <div key={name} className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                        {idx + 1}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{name}</p>
                        <p className="text-[10px] text-slate-500 font-medium">{stat.count} customer{stat.count !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black" style={{ color: theme.primary }}>₱{(stat.total / 100).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

      </main>
    </div>
  );
}
