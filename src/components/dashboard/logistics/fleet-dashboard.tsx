"use client"

import React, { useState, useRef } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { useCollection } from 'react-firebase-hooks/firestore';
import { collection, query, orderBy } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { addTrip, updateTripStatus, updateTripExpenses } from '@/firebase/firestore/logistics-actions';
import { chargeRetailSaleToCredit } from '@/firebase/firestore/credit-actions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { getModuleTheme, useDynamicThemeColor } from '@/lib/theme-utils';
import { useToast } from '@/hooks/use-toast';
import { GCashQrModal } from '@/components/common/gcash-qr-modal';
import { ThermalReceiptPreview } from '@/components/common/thermal-receipt-preview';
import { 
  Truck, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  Plus, 
  Navigation,
  Loader2,
  Banknote,
  Fuel,
  PenTool,
  MapIcon,
  ChevronDown,
  ChevronUp,
  Tractor,
  Receipt,
  Coins
} from "lucide-react";

export function FleetDashboard() {
  const { currentTenant } = useTenant();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDispatchForm, setShowDispatchForm] = useState(false);

  // Dispatch Form State
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [loadDesc, setLoadDesc] = useState('');
  const [driver, setDriver] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [fee, setFee] = useState<number | ''>('');

  // Expense Form State per Trip
  const [expenseInputs, setExpenseInputs] = useState<Record<string, number | ''>>({});

  // Signature Pad State
  const [showSignatureModal, setShowSignatureModal] = useState<string | null>(null);
  const [pendingGCashTripId, setPendingGCashTripId] = useState<string | null>(null);
  const [pendingGCashSignature, setPendingGCashSignature] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const [showGCashQr, setShowGCashQr] = useState(false);
  
  const [showReceipt, setShowReceipt] = useState(false);
  const [completedSale, setCompletedSale] = useState<{
    items: any[];
    total: number;
    paymentMethod: string;
    saleId?: string;
  } | null>(null);

  const theme = getModuleTheme(currentTenant?.moduleType);
  useDynamicThemeColor(theme);

  const tripsQuery = React.useMemo(() => {
    return currentTenant 
    ? query(collection(db, 'tenants', currentTenant.id, 'trips'), orderBy('createdAt', 'desc')) : null;
  }, [currentTenant?.id, db]);

  const [tripsSnapshot, loading, tripsError] = useCollection(tripsQuery as any);
  
  const trips = tripsSnapshot?.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })) || [];

  React.useEffect(() => {
    if (tripsError) {
      console.error("Fleet listener error:", tripsError);
      toast({ title: 'Connection Error', description: 'Failed to sync live trips.', variant: 'destructive' });
    }
  }, [tripsError, toast]);

  const plannedTrips = trips.filter((t: any) => t.status === 'planned');
  const activeTrips = trips.filter((t: any) => t.status === 'in_transit' || t.status === 'loading');
  const completedTrips = trips.filter((t: any) => t.status === 'completed').slice(0, 20);

  const [showArchive, setShowArchive] = useState(false);

  const isFarm = currentTenant?.moduleType === 'ani-grow';

  const handleDispatch = async () => {
    if (!currentTenant || !origin || !destination) return;
    const feeVal = Number(fee || 0);
    if (feeVal < 0 || isNaN(feeVal)) {
      toast({ title: 'Error', description: 'Invalid delivery fee amount.', variant: 'destructive' });
      return;
    }
    try {
      setIsProcessing(true);
      await addTrip(currentTenant.id, origin, destination, loadDesc, driver, plateNumber, Math.round(feeVal * 100));
      setOrigin(''); setDestination(''); setLoadDesc(''); setDriver(''); setPlateNumber(''); setFee('');
      setShowDispatchForm(false);
      toast({ title: 'Truck Dispatched!', description: `Heading to ${destination}` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const moveTrip = async (id: string, newStatus: 'loading' | 'in_transit' | 'completed', signatureData?: string, paymentMethod?: string) => {
    if (!currentTenant) return;
    try {
      setIsProcessing(true);
      await updateTripStatus(currentTenant.id, id, newStatus, signatureData, paymentMethod);
      if (newStatus === 'completed') {
        setShowSignatureModal(null);
        toast({ title: 'Trip Completed', description: 'Fee, expenses, and ePOD saved.' });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddExpense = async (tripId: string) => {
    if (!currentTenant) return;
    const amount = expenseInputs[tripId];
    if (!amount || amount <= 0) return;

    try {
      setIsProcessing(true);
      await updateTripExpenses(currentTenant.id, tripId, Math.round(Number(amount) * 100));
      setExpenseInputs(prev => ({ ...prev, [tripId]: '' }));
      toast({ title: 'Expense Logged', description: `₱${amount} added to trip expenses.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Canvas Drawing Handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setIsDrawing(true);
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleSaveSignatureAndComplete = async (paymentMethod: string = 'cash', overrideTripId?: string, overrideSignature?: string) => {
    const tripIdToUse = overrideTripId || showSignatureModal;
    if (!tripIdToUse || !currentTenant) return;
    
    let signatureDataToUse = overrideSignature;
    if (!signatureDataToUse) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      signatureDataToUse = canvas.toDataURL('image/png');
    }
    
    try {
      setIsProcessing(true);
      const trip = trips.find((t: any) => t.id === tripIdToUse);
      
      await moveTrip(tripIdToUse, 'completed', signatureDataToUse, paymentMethod);
      
      if (trip && trip.deliveryFee > 0) {
        setCompletedSale({
          items: [{ name: `Delivery: ${trip.origin} to ${trip.destination}`, quantity: 1, price: trip.deliveryFee }],
          total: trip.deliveryFee,
          paymentMethod,
          saleId: trip.id
        });
        setShowReceipt(true);
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
      setIsProcessing(false);
    }
  };

  const openMaps = (dest: string) => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`, '_blank');
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-h-screen">
      <main className="p-4 space-y-6 pb-24">
        
        {/* Header Section */}
        <section className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl" style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}>
              {isFarm ? <Tractor className="h-6 w-6" /> : <Truck className="h-6 w-6" />}
            </div>
            <div>
              <h3 className="text-lg font-headline font-bold">Dispatch Center</h3>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">{theme.name} • Fleet</p>
            </div>
          </div>
          <Button 
            onClick={() => setShowDispatchForm(!showDispatchForm)} 
            size="sm" 
            className="rounded-full h-10 w-10 p-0 shadow-md font-bold text-white"
            style={{ backgroundColor: theme.primary }}
          >
            <Plus className="h-5 w-5" />
          </Button>
        </section>

        {/* Dispatch Form */}
        {showDispatchForm && (
          <Card className="shadow-sm border-l-4" style={{ borderLeftColor: theme.primary }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold">New Trip Dispatch</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="trip-origin" className="text-[10px] uppercase">Origin</Label>
                  <Input id="trip-origin" name="tripOrigin" placeholder="e.g. QC" value={origin} onChange={e => setOrigin(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="trip-destination" className="text-[10px] uppercase">Destination</Label>
                  <Input id="trip-destination" name="tripDestination" placeholder="e.g. Makati" value={destination} onChange={e => setDestination(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="trip-load" className="text-[10px] uppercase">Load Description</Label>
                <Input id="trip-load" name="tripLoad" placeholder="e.g. 50 boxes of supplies" value={loadDesc} onChange={e => setLoadDesc(e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="trip-driver" className="text-[10px] uppercase">Driver Name</Label>
                  <Input id="trip-driver" name="tripDriver" placeholder="e.g. Jun" value={driver} onChange={e => setDriver(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="trip-plate" className="text-[10px] uppercase">Plate No.</Label>
                  <Input id="trip-plate" name="tripPlate" placeholder="e.g. ABC 1234" value={plateNumber} onChange={e => setPlateNumber(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="trip-fee" className="text-[10px] uppercase">Delivery Fee (₱)</Label>
                  <Input id="trip-fee" name="tripFee" type="number" placeholder="0.00" value={fee} onChange={e => setFee(Number(e.target.value) || '')} />
                </div>
              </div>
              <Button 
                onClick={handleDispatch}
                disabled={isProcessing || !origin || !destination}
                className="w-full mt-2 font-bold text-white"
                style={{ backgroundColor: theme.primary }}
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Truck className="h-4 w-4 mr-2" />}
                Dispatch Now
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-white shadow-sm border transition-colors duration-300" style={{ borderColor: `${theme.primary}20` }}>
            <CardHeader className="p-3 pb-0">
              <CardDescription className="text-[9px] font-black uppercase tracking-wider" style={{ color: theme.primary }}>On The Road</CardDescription>
              <CardTitle className="text-xl font-black">{activeTrips.length}</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1 text-[9px] font-bold text-muted-foreground uppercase flex items-center gap-1">Active Trips</CardContent>
          </Card>
          <Card className="bg-white border-slate-200 shadow-sm">
            <CardHeader className="p-3 pb-0">
              <CardDescription className="text-[9px] font-black uppercase tracking-wider text-slate-500">Pending</CardDescription>
              <CardTitle className="text-xl font-black">{plannedTrips.length}</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1 text-[9px] font-bold text-muted-foreground uppercase flex items-center gap-1">Planned Trips</CardContent>
          </Card>
        </div>

        {/* Live Dispatch Board */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Navigation className="h-4 w-4" style={{ color: theme.primary }} />
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-700">Live Board</h3>
            </div>
          </div>

          <div className="grid gap-3">
            {loading && <div className="text-center py-8 text-xs text-slate-400">Loading Fleet stream...</div>}
            
            {trips.filter((t: any) => t.status !== 'completed').map((trip: any) => (
              <div 
                key={trip.id} 
                className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm"
              >
                {/* Trip Header */}
                <div className="px-3 py-2 border-b bg-slate-50 flex items-center justify-between">
                  <Badge 
                    className="font-black text-[9px] text-white"
                    style={{ backgroundColor: trip.status === 'planned' ? '#64748b' : theme.primary }}
                  >
                    {trip.status.replace('_', ' ').toUpperCase()}
                  </Badge>
                  <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                    <Banknote className="h-3 w-3" />
                    ₱{((trip.deliveryFee || 0) / 100).toLocaleString()} Fee
                  </span>
                </div>

                {/* Route Info */}
                <div className="p-3 space-y-4">
                  <div className="relative pl-6 space-y-3">
                    <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-slate-200" />
                    <div className="relative">
                      <div className="absolute -left-6 top-0.5 h-3 w-3 rounded-full border-2 border-white bg-slate-300" />
                      <p className="text-xs font-bold text-slate-800">{trip.origin}</p>
                    </div>
                    <div className="relative">
                      <div className="absolute -left-6 top-0.5 h-3 w-3 rounded-full border-2 border-white" style={{ backgroundColor: theme.primary }} />
                      <p className="text-xs font-bold text-slate-800">{trip.destination}</p>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 grid grid-cols-3 gap-2 items-center text-center">
                    <div className="text-left">
                      <p className="text-[9px] text-slate-400 font-bold uppercase">Driver</p>
                      <p className="text-xs font-bold text-slate-700">{trip.driverName || 'Unassigned'}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-400 font-bold uppercase">Vehicle</p>
                      <p className="text-xs font-bold text-slate-700">{trip.plateNumber || 'TBD'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] text-slate-400 font-bold uppercase">Load</p>
                      <p className="text-xs font-bold text-slate-700">{trip.loadDescription || 'None'}</p>
                    </div>
                  </div>

                  {trip.status === 'in_transit' && (
                    <Button 
                      variant="outline" 
                      className="w-full h-8 text-[10px] font-bold text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100 mt-2"
                      onClick={() => openMaps(trip.destination)}
                    >
                      <MapIcon className="h-3 w-3 mr-1" /> Open Route in Google Maps
                    </Button>
                  )}

                  {/* Proof of Delivery (if completed) */}
                  {trip.status === 'completed' && trip.signatureData && (
                    <div className="pt-2 border-t border-dashed space-y-2">
                      <span className="text-[10px] font-bold text-emerald-600 uppercase flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Proof of Delivery (ePOD)
                      </span>
                      <div className="bg-white border border-slate-200 rounded-lg p-2 flex justify-center">
                        <img src={trip.signatureData} alt="Client Signature" className="max-h-20" />
                      </div>
                    </div>
                  )}

                  {/* Expense Tracking (for active trips) */}
                  {(trip.status === 'in_transit' || trip.status === 'loading') && (
                    <div className="pt-2 border-t border-dashed space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                          <Fuel className="h-3 w-3" /> Trip Expenses
                        </span>
                        <span className="text-xs font-bold text-red-500">
                          -₱{((trip.tripExpenses || 0) / 100).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Label htmlFor={`expense-${trip.id}`} className="sr-only">Add Expense Amount</Label>
                        <Input 
                          id={`expense-${trip.id}`}
                          name={`expenseAmount`}
                          placeholder="Gas/Toll (₱)" 
                          type="number"
                          className="h-8 text-xs"
                          value={expenseInputs[trip.id] || ''}
                          onChange={e => setExpenseInputs(prev => ({ ...prev, [trip.id]: Number(e.target.value) || '' }))}
                        />
                        <Button 
                          onClick={() => handleAddExpense(trip.id)}
                          disabled={isProcessing || !expenseInputs[trip.id]}
                          size="sm" 
                          variant="secondary"
                          className="h-8 text-xs font-bold"
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="pt-2">
                    {trip.status === 'planned' && (
                      <Button onClick={() => moveTrip(trip.id, 'loading')} disabled={isProcessing} className="w-full h-9 font-bold text-[10px] uppercase text-white" style={{ backgroundColor: theme.primary }}>
                        Start Loading
                      </Button>
                    )}
                    {trip.status === 'loading' && (
                      <Button onClick={() => moveTrip(trip.id, 'in_transit')} disabled={isProcessing} className="w-full h-9 font-bold text-[10px] uppercase text-white" style={{ backgroundColor: theme.primary }}>
                        Dispatch to Road
                      </Button>
                    )}
                    {trip.status === 'in_transit' && (
                      <Button onClick={() => setShowSignatureModal(trip.id)} disabled={isProcessing} className="w-full h-9 font-bold text-[10px] uppercase bg-emerald-500 text-white hover:bg-emerald-600">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Mark Delivered & Get ePOD
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Completed Trips Archive */}
        {completedTrips.length > 0 && (
          <section className="space-y-3 mt-6">
            <div 
              className="flex items-center justify-between px-3 py-2 bg-slate-200/50 rounded-xl cursor-pointer hover:bg-slate-200 transition-colors"
              onClick={() => setShowArchive(!showArchive)}
            >
              <div className="flex items-center gap-2 text-slate-600">
                <CheckCircle2 className="h-4 w-4" />
                <h3 className="text-xs font-black uppercase tracking-widest">Completed Trips ({completedTrips.length})</h3>
              </div>
              {showArchive ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
            </div>

            {showArchive && (
              <div className="grid gap-3 animate-in slide-in-from-top-2">
                {completedTrips.map((trip: any) => (
                  <div key={trip.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm opacity-80">
                    <div className="px-3 py-2 border-b bg-slate-50 flex justify-between items-center">
                      <Badge className="font-black text-[9px] bg-slate-500 text-white">COMPLETED</Badge>
                      <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                        <Banknote className="h-3 w-3" /> ₱{((trip.deliveryFee || 0) / 100).toLocaleString()}
                      </span>
                    </div>
                    <div className="p-3">
                      <div className="flex justify-between items-center mb-2">
                        <p className="text-xs font-bold text-slate-700">{trip.origin} → {trip.destination}</p>
                        <p className="text-[10px] text-slate-500">{new Date(trip.createdAt?.toDate()).toLocaleDateString()}</p>
                      </div>
                      {trip.signatureData && (
                        <div className="mt-2 pt-2 border-t flex items-center justify-between">
                          <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1"><CheckCircle2 className="h-3 w-3"/> ePOD Signed</span>
                          <img src={trip.signatureData} className="h-6" alt="sig" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Signature Modal */}
        {showSignatureModal && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in">
            <Card className="w-full max-w-sm bg-white shadow-2xl border-none">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <PenTool className="h-4 w-4" style={{ color: theme.primary }} />
                  Receiver Signature (ePOD)
                </CardTitle>
                <CardDescription className="text-xs">
                  Please ask the receiver to sign inside the box below to confirm delivery.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl overflow-hidden relative">
                  <canvas
                    ref={canvasRef}
                    width={320}
                    height={160}
                    className="w-full h-40 touch-none cursor-crosshair"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="absolute top-2 right-2 h-6 text-[10px] text-slate-500 hover:text-slate-700 bg-white/50"
                    onClick={clearSignature}
                  >
                    Clear
                  </Button>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button 
                    className="flex-1 text-white font-bold text-[10px]"
                    style={{ backgroundColor: theme.primary }}
                    onClick={() => handleSaveSignatureAndComplete('cash')}
                    disabled={isProcessing}
                  >
                    {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Coins className="h-3 w-3 mr-1" /> Paid Cash</>}
                  </Button>
                  <Button 
                    className="flex-1 text-white font-bold text-[10px]"
                    style={{ backgroundColor: '#007aff' }}
                    onClick={() => {
                      const canvas = canvasRef.current;
                      if (canvas) {
                        setPendingGCashSignature(canvas.toDataURL('image/png'));
                      }
                      setPendingGCashTripId(showSignatureModal);
                      setShowSignatureModal(null);
                      setShowGCashQr(true);
                    }}
                    disabled={isProcessing}
                  >
                    {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Receipt className="h-3 w-3 mr-1" /> GCash</>}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <GCashQrModal
          open={showGCashQr}
          onClose={() => {
            setShowGCashQr(false);
            setPendingGCashTripId(null);
          }}
          totalAmount={trips.find((t: any) => t.id === pendingGCashTripId)?.deliveryFee || 0}
          tenantName={currentTenant?.name || "Katuwang Logistics"}
          paymentType="gcash"
          onPaymentVerified={async (paymentMethod, gcashRef) => {
            setShowGCashQr(false);
            if (pendingGCashTripId && pendingGCashSignature) {
              await handleSaveSignatureAndComplete(paymentMethod, pendingGCashTripId, pendingGCashSignature);
            }
          }}
          theme={theme}
        />
        
        <ThermalReceiptPreview
          open={showReceipt}
          onClose={() => setShowReceipt(false)}
          storeName={currentTenant?.name || "Katuwang Logistics"}
          receiptType="DELIVERY RECEIPT (ePOD)"
          items={completedSale?.items || []}
          totalAmountPesos={(completedSale?.total || 0) / 100}
          paymentMethod={completedSale?.paymentMethod || "cash"}
          transactionId={completedSale?.saleId}
          theme={theme}
        />

      </main>
    </div>
  );
}
