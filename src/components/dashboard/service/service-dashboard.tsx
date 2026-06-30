"use client"
import { usePinApproval } from '@/hooks/use-pin-approval';

import React, { useState, useEffect } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { useCollection } from 'react-firebase-hooks/firestore';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { addJob, updateJobStatus } from '@/firebase/firestore/service-actions';
import { deleteServiceOrder } from '@/firebase/firestore/service-actions';
import { awardPoints } from '@/firebase/firestore/loyalty-actions';
import { useUser } from '@/firebase/auth/use-user';
import { JobStatus } from '@/lib/schemas/services';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { getModuleTheme, useDynamicThemeColor } from '@/lib/theme-utils';
import { useToast } from '@/hooks/use-toast';
import { GCashQrModal } from '@/components/common/gcash-qr-modal';
import { CashModal } from '@/components/common/cash-modal';
import { ServicePaymentModal } from '@/components/common/service-payment-modal';
import { ThermalReceiptPreview } from '@/components/common/thermal-receipt-preview';
import { 
  Plus, 
  Clock, 
  PlayCircle, 
  CheckCircle2,
  Loader2,
  AlertCircle,
  MessageSquare,
  Receipt,
  Coins,
  Trash2,
  UserCog,
  Wrench,
  CalendarDays
} from "lucide-react";

const ColumnHeader = React.memo(({ title, count, icon: Icon, colorClass }: any) => (
  <div className="flex items-center justify-between mb-3 px-1">
    <div className="flex items-center gap-2">
      <Icon className={cn("h-4 w-4", colorClass)} />
      <h4 className="font-bold text-sm text-slate-700">{title}</h4>
    </div>
    <Badge variant="secondary" className="font-black bg-white">{count}</Badge>
  </div>
));

const JobCard = ({ job, moveJob, theme, isProcessing, isOwner, handleDeleteJob, setPendingJobPayment, setShowGCashQr, setShowCashModal, handleCopySMS, activeSmsJob, smsText }: any) => (
  <div 
    className="bg-white p-3 rounded-xl border shadow-sm space-y-3 cursor-pointer transition-all duration-200 active:scale-95 relative overflow-hidden"
    style={{ borderLeft: `4px solid ${theme.primary}` }}
  >
    {isProcessing && (
      <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] flex items-center justify-center z-10">
        <Loader2 className="h-5 w-5 animate-spin text-slate-500" style={{ color: theme.primary }} />
      </div>
    )}
    <div className="flex justify-between items-start">
      <div className="flex gap-2">
        <div>
          <div className="font-bold text-sm text-slate-900">{job.customerName}</div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{job.serviceId}</div>
          {job.deviceModel && (
              <div className="flex items-center gap-1 mt-1 text-[10px] font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded w-fit">
                  <Wrench className="h-3 w-3" /> {job.deviceModel}
              </div>
          )}
          {job.technicianName && (
              <div className="flex items-center gap-1 mt-1 text-[10px] font-medium text-slate-500">
                  <UserCog className="h-3 w-3" /> Tech: {job.technicianName}
              </div>
          )}
          {job.targetDate && (
              <div className="flex items-center gap-1 mt-1 text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded w-fit">
                  <CalendarDays className="h-3 w-3" /> Target: {job.targetDate}
              </div>
          )}
        </div>
        {isOwner && (
          <Button variant="ghost" size="icon" className="h-5 w-5 text-slate-400 hover:text-red-500 rounded-full shrink-0" onClick={() => handleDeleteJob(job.id)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
      <div className="text-right">
        <Badge 
          className="text-[9px] font-black uppercase border-transparent mb-1"
          style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
        >
          ₱{(job.amount / 100).toLocaleString()}
        </Badge>
        {((job.laborCost || 0) > 0 || (job.partsCost || 0) > 0) && (
            <div className="text-[9px] text-slate-500 flex flex-col items-end">
                <span>Labor: ₱{((job.laborCost || 0)/100).toLocaleString()}</span>
                <span>Parts: ₱{((job.partsCost || 0)/100).toLocaleString()}</span>
            </div>
        )}
      </div>
    </div>
    
    {/* Action Buttons based on status */}
    <div className="flex gap-2">
      {job.status === 'pending' && (
        <Button 
          disabled={isProcessing} 
          size="sm" 
          onClick={() => moveJob(job, 'in_progress')} 
          className="w-full h-8 text-[10px] font-bold uppercase tracking-widest text-white border-none"
          style={{ backgroundColor: theme.primary }}
        >
          Start Job
        </Button>
      )}
      {job.status === 'in_progress' && (
        <Button 
          disabled={isProcessing} 
          size="sm" 
          onClick={() => moveJob(job, 'completed_unpaid')} 
          className="w-full h-8 text-[10px] font-bold uppercase tracking-widest text-emerald-600 border-emerald-200 bg-emerald-50"
        >
          Mark Completed
        </Button>
      )}
      {job.status === 'completed_unpaid' && (
        <div className="flex flex-col gap-2 w-full">
          <div className="flex gap-2 w-full">
            <Button 
              disabled={isProcessing} 
              size="sm" 
              onClick={() => {
                setPendingJobPayment(job);
            <Button size="sm" className="w-full bg-emerald-500 hover:bg-emerald-600 font-bold" onClick={() => setPendingJobPayment(job)}>
              <Coins className="h-4 w-4 mr-1" /> Pay Order
            </Button>
          <Button 
            disabled={isProcessing} 
            size="sm" 
            variant="outline"
            onClick={() => {
              const newLabor = window.prompt("Update Labor Cost (,) if needed:", ((job.laborCost || 0)/100).toString());
              const newParts = window.prompt("Update Parts Cost (,) if needed:", ((job.partsCost || 0)/100).toString());
              
              if (newLabor !== null && newParts !== null && !isNaN(Number(newLabor)) && !isNaN(Number(newParts))) {
                 const labor = Number(newLabor) * 100;
                 const parts = Number(newParts) * 100;
                 moveJob({ ...job, amount: labor + parts, laborCost: labor, partsCost: parts }, 'completed_unpaid', 'cash', labor + parts);
              }
            }} 
            className="w-full h-7 text-[9px] font-bold uppercase text-slate-500"
          >
            Update Pricing
          </Button>
        </div>
      )}
      {job.status === 'completed' && (
        <div className="flex flex-col gap-2 w-full">
          <Button disabled size="sm" variant="outline" className="w-full h-8 text-[10px] font-bold uppercase tracking-widest text-emerald-600 border-emerald-200 bg-emerald-50 opacity-70">
            <CheckCircle2 className="h-3 w-3 mr-1" /> Paid & Done
          </Button>
          {job.phoneNumber && (
            <Button size="sm" variant="secondary" className="w-full h-8 text-[10px] font-bold" onClick={() => handleCopySMS(job)}>
              <MessageSquare className="h-3 w-3 mr-1" /> Copy SMS Notification
            </Button>
          )}
        </div>
      )}
    </div>

    {/* SMS Preview area */}
    {activeSmsJob === job.id && (
      <div className="mt-3 bg-slate-50 border border-slate-200 p-2 rounded-lg text-[10px] text-slate-600">
        <p className="font-bold mb-1">Copied to clipboard:</p>
        <p className="italic">"{smsText}"</p>
      </div>
    )}
  </div>
);

export function ServiceDashboard() {
  const { currentTenant } = useTenant();
  const db = useFirestore();
  const { toast } = useToast();
  const { requireApproval } = usePinApproval();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dynamically resolve Katuwang industry theme based on active tenant's moduleType
  const theme = getModuleTheme(currentTenant?.moduleType);
  
  // Immersive dynamic status bar viewport tracking for PWA Android/iOS notch
  useDynamicThemeColor(theme);
  
  const { user } = useUser();
  const isOwner = currentTenant?.ownerUid === user?.uid || (currentTenant as any)?.role === 'owner';

  // Live stream of jobs
  const jobsQuery = React.useMemo(() => {
    return currentTenant 
    ? query(collection(db, 'tenants', currentTenant.id, 'jobs'),
        orderBy('createdAt', 'desc'), limit(100)) : null;
  }, [currentTenant?.id, db]);

  const [jobsSnapshot, loading, hookError] = useCollection(jobsQuery as any);
  
  const jobs = jobsSnapshot?.docs.map((doc: any) => ({
    id: doc.id,
    ...doc.data()
  })) || [];

  React.useEffect(() => {
    if (hookError) {
      console.error("Jobs listener error:", hookError);
      toast({ title: 'Connection Error', description: 'Failed to sync live jobs.', variant: 'destructive' });
    }
  }, [hookError, toast]);

  const pendingJobs = jobs.filter((j: any) => j.status === 'pending');
  const activeJobs = jobs.filter((j: any) => j.status === 'in_progress');
  const completedUnpaidJobs = jobs.filter((j: any) => j.status === 'completed_unpaid');
  const completedJobs = jobs.filter((j: any) => j.status === 'completed');

  const [showAddForm, setShowAddForm] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [serviceDesc, setServiceDesc] = useState('');
  
  // Appliance/Repair specific fields
  const [deviceModel, setDeviceModel] = useState('');
  const [technicianName, setTechnicianName] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [laborCost, setLaborCost] = useState<number | ''>('');
  const [partsCost, setPartsCost] = useState<number | ''>('');
  const [price, setPrice] = useState<number | ''>('');
  
  // Auto-calculate total price
  useEffect(() => {
      const l = typeof laborCost === 'number' ? laborCost : 0;
      const p = typeof partsCost === 'number' ? partsCost : 0;
      if (l > 0 || p > 0) {
          setPrice(l + p);
      }
  }, [laborCost, partsCost]);

  const commonServices = [
    { name: 'Diagnosis/Checkup' },
    { name: 'General Cleaning' },
    { name: 'Part Replacement' },
    { name: 'Home Service' },
    { name: 'General Repair' }
  ];
  
  const [smsText, setSmsText] = useState('');
  const [activeSmsJob, setActiveSmsJob] = useState<string | null>(null);

  const [pendingJobPayment, setPendingJobPayment] = useState<any | null>(null);

  const [showReceipt, setShowReceipt] = useState(false);
  const [completedSale, setCompletedSale] = useState<{
    items: any[];
    total: number;
    paymentMethod: string;
    saleId?: string;
  } | null>(null);

  const handleAddJob = async () => {
    if (!currentTenant || !customerName || !serviceDesc || !price) return;
    try {
      setIsProcessing(true);
      setError(null);
      await addJob(
          currentTenant.id, 
          customerName, 
          serviceDesc, 
          Math.round(Number(price) * 100), 
          phoneNumber,
          {
              deviceModel,
              technicianName,
              targetDate,
              laborCost: typeof laborCost === 'number' ? laborCost * 100 : 0,
              partsCost: typeof partsCost === 'number' ? partsCost * 100 : 0
          }
      );
      
      setCustomerName('');
      setPhoneNumber('');
      setServiceDesc('');
      setDeviceModel('');
      setTechnicianName('');
      setTargetDate('');
      setLaborCost('');
      setPartsCost('');
      setPrice('');
      setShowAddForm(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const moveJob = async (job: any, newStatus: JobStatus, paymentMethod: string = 'cash', overrideAmount?: number) => {
    if (!currentTenant) return;
    const isSensitive = newStatus === 'completed';
    try {
      if (isSensitive) setIsProcessing(true);
      setError(null);
      
      const finalAmount = overrideAmount ?? job.amount;
      const updatePromise = updateJobStatus(
        currentTenant.id, 
        job.id, 
        newStatus, 
        finalAmount, 
        job.customerName,
        job.laborCost,
        job.partsCost
      );
      
      if (isSensitive) {
        await updatePromise;
        if (job.phoneNumber) {
          await awardPoints(currentTenant.id, job.phoneNumber, finalAmount || 0);
        }
        setCompletedSale({
          items: [{ name: job.serviceId, quantity: 1, price: finalAmount }],
          total: finalAmount,
          paymentMethod,
          saleId: job.id
        });
        setShowReceipt(true);
      } else {
        // Optimistic UI: Don't await, let Firestore local cache update immediately
        updatePromise.catch(e => {
          console.error("Optimistic update failed:", e);
          toast({ title: 'Update failed', description: 'Please check your connection and try again.', variant: 'destructive' });
        });
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      if (isSensitive) setIsProcessing(false);
    }
  };

  const handlePaymentConfirm = async (job: any, method: string, discountCentavos: number, discountType: string, discountReason: string) => {
    const finalAmount = (job.amount || 0) - discountCentavos;
    await moveJob(job, 'completed', method, finalAmount);
    setPendingJobPayment(null);
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!currentTenant || !user) return;
    // Phase 2: Require Manager PIN for Deletions
    const approved = await requireApproval("Deleting a record requires Manager authorization.");
    if (!approved) return;

    if (!window.confirm("Sigurado ka bang gusto mong i-delete o i-void ang order na ito? Ibabalik nito the bayad kung applicable.")) return;
    try {
      await deleteServiceOrder(currentTenant.id, 'jobs', jobId, user.uid, user.displayName || user.email || 'Unknown User');
      toast({ title: 'Order Deleted', description: 'Order has been successfully reversed.' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleCopySMS = (job: any) => {
    const text = `Hi ${job.customerName}, your service (${job.serviceId}) is now COMPLETE and ready! - ${currentTenant?.name}`;
    navigator.clipboard.writeText(text);
    toast({ title: 'SMS Copied!', description: 'Paste it in your messaging app.' });
    setActiveSmsJob(job.id);
    setSmsText(text);
  };



  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-h-screen">
      <main className="p-4 space-y-6 pb-20">
        {/* Header Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-headline font-bold">Queue Manager</h3>
              <p className="text-xs text-muted-foreground font-medium">{theme.name} • {currentTenant?.name || 'Service Business'}</p>
            </div>
            <Button 
              onClick={() => setShowAddForm(!showAddForm)} 
              disabled={isProcessing} 
              size="sm" 
              className="rounded-full shadow-md font-bold text-white border-none active:scale-95 transition-transform h-10 w-10 p-0"
              style={{ 
                backgroundColor: theme.primary,
                boxShadow: `0 8px 16px -4px ${theme.primary}40`
              }}
            >
              {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />} 
            </Button>
          </div>
        </section>

        {showAddForm && (
          <Card className="shadow-sm bg-white border-l-4 animate-in slide-in-from-top-2" style={{ borderLeftColor: theme.primary }}>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Wrench className="h-4 w-4" style={{ color: theme.primary }} /> New Repair / Service Job
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="customer-name" className="text-xs">Customer Name</Label>
                  <Input id="customer-name" name="customerName" placeholder="e.g. Juan" value={customerName} onChange={e => setCustomerName(e.target.value)} autoFocus />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="phone-number" className="text-xs">Phone (Optional)</Label>
                  <Input id="phone-number" name="phoneNumber" placeholder="09XX..." value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-xs">Quick Select Category</Label>
                <div className="flex flex-wrap gap-2">
                  {commonServices.map(svc => (
                    <Badge 
                      key={svc.name}
                      variant="outline"
                      className="cursor-pointer hover:bg-slate-100 text-[10px] py-1 border-slate-200"
                      onClick={() => {
                        setServiceDesc(svc.name);
                      }}
                    >
                      {svc.name}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="service-desc" className="text-xs">Issue / Description</Label>
                <Input id="service-desc" name="serviceDesc" placeholder="e.g. No power, needs checkup" value={serviceDesc} onChange={e => setServiceDesc(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="device-model" className="text-xs">Device / Appliance</Label>
                  <Input id="device-model" name="deviceModel" placeholder='e.g. Samsung TV 42"' value={deviceModel} onChange={e => setDeviceModel(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="technician" className="text-xs">Technician</Label>
                    <Input id="technician" name="technician" placeholder="e.g. Kuya Boy" value={technicianName} onChange={e => setTechnicianName(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="target-date" className="text-xs">Target Date</Label>
                    <Input id="target-date" type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} className="h-9 text-xs" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                <div className="space-y-1">
                  <Label htmlFor="labor-cost" className="text-xs">Labor (₱)</Label>
                  <Input id="labor-cost" name="laborCost" type="number" placeholder="0" value={laborCost} onChange={e => setLaborCost(parseFloat(e.target.value) || '')} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="parts-cost" className="text-xs">Parts (₱)</Label>
                  <Input id="parts-cost" name="partsCost" type="number" placeholder="0" value={partsCost} onChange={e => setPartsCost(parseFloat(e.target.value) || '')} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="service-price" className="text-xs font-bold">Total (₱)</Label>
                  <Input id="service-price" name="servicePrice" type="number" placeholder="0" value={price} onChange={e => setPrice(parseFloat(e.target.value) || '')} className="h-8 text-xs font-bold border-indigo-200 focus-visible:ring-indigo-500" />
                </div>
              </div>
              <Button 
                className="w-full h-8 text-xs font-bold text-white mt-2" 
                style={{ backgroundColor: theme.primary }}
                onClick={handleAddJob}
                disabled={isProcessing || !customerName || !serviceDesc || !price}
              >
                Create Job
              </Button>
            </CardContent>
          </Card>
        )}

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-xl border border-red-200 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-white border-slate-200 shadow-sm">
            <CardHeader className="p-3 pb-0">
              <CardDescription 
                className="text-[9px] font-black uppercase tracking-wider"
                style={{ color: theme.primary }}
              >
                In Queue
              </CardDescription>
              <CardTitle className="text-xl font-black">{pendingJobs.length + activeJobs.length}</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1 text-[9px] font-bold text-muted-foreground uppercase flex items-center gap-1">
              Active Jobs
            </CardContent>
          </Card>
          <Card className="bg-white border-slate-200 shadow-sm">
            <CardHeader className="p-3 pb-0">
              <CardDescription className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Completed</CardDescription>
              <CardTitle className="text-xl font-black">{completedJobs.length}</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1 text-[9px] font-bold text-muted-foreground uppercase flex items-center gap-1">
              Done Today
            </CardContent>
          </Card>

          {/* Kanban Board (Vertical scrollable columns on mobile) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Pending Column */}
            <div className="bg-slate-100/50 p-3 rounded-2xl border border-slate-200">
              <ColumnHeader title="Pending / Quotation" count={pendingJobs.length} icon={Clock} colorClass="text-amber-500" />
              <div className="grid gap-2">
                {loading && <div className="text-center py-4 text-xs text-slate-400">Loading DB...</div>}
                {pendingJobs.map((job: any) => (
                <JobCard 
                  key={job.id} 
                  job={job}
                  theme={theme}
                  isProcessing={isProcessing}
                  isOwner={isOwner}
                  handleDeleteJob={handleDeleteJob}
                  moveJob={moveJob}
                  setPendingJobPayment={setPendingJobPayment}
                  handleCopySMS={handleCopySMS}
                  activeSmsJob={activeSmsJob}
                  smsText={smsText}
                />
              ))}  {!loading && pendingJobs.length === 0 && <p className="text-xs text-center py-4 text-slate-400 font-medium">No waiting jobs</p>}
              </div>
            </div>

            {/* In Progress Column */}
            <div 
              className="p-3 rounded-2xl border transition-colors duration-300"
              style={{ backgroundColor: `${theme.primary}05`, borderColor: `${theme.primary}20` }}
            >
              <ColumnHeader title="In Progress" count={activeJobs.length} icon={PlayCircle} colorClass="text-slate-700" style={{ color: theme.primary }} />
              <div className="grid gap-2">
                {activeJobs.map((job: any) => (
                <JobCard 
                  key={job.id} 
                  job={job}
                  theme={theme}
                  isProcessing={isProcessing}
                  isOwner={isOwner}
                  handleDeleteJob={handleDeleteJob}
                  moveJob={moveJob}
                  setPendingJobPayment={setPendingJobPayment}
                  handleCopySMS={handleCopySMS}
                  activeSmsJob={activeSmsJob}
                  smsText={smsText}
                />
              ))}  {!loading && activeJobs.length === 0 && <p className="text-xs text-center py-4 font-medium" style={{ color: theme.primary }}>No active jobs</p>}
              </div>
            </div>

            {/* Completed Unpaid Column */}
            <div className="bg-amber-50/50 p-3 rounded-2xl border border-amber-100">
              <ColumnHeader title="Resolved (Unpaid)" count={completedUnpaidJobs.length} icon={CheckCircle2} colorClass="text-amber-600" />
              <div className="grid gap-2">
                {completedUnpaidJobs.map((job: any) => (
                <JobCard 
                  key={job.id} 
                  job={job}
                  theme={theme}
                  isProcessing={isProcessing}
                  isOwner={isOwner}
                  handleDeleteJob={handleDeleteJob}
                  moveJob={moveJob}
                  setPendingJobPayment={setPendingJobPayment}
                  handleCopySMS={handleCopySMS}
                  activeSmsJob={activeSmsJob}
                  smsText={smsText}
                />
              ))}  {!loading && completedUnpaidJobs.length === 0 && <p className="text-xs text-center py-4 text-amber-500/50 font-medium">No unpaid jobs</p>}
              </div>
            </div>

            {/* Completed Paid Column */}
            <div className="bg-emerald-50/50 p-3 rounded-2xl border border-emerald-100">
              <ColumnHeader title="Completed (Paid)" count={completedJobs.length} icon={CheckCircle2} colorClass="text-emerald-500" />
              <div className="grid gap-2 opacity-75">
                {completedJobs.slice(0, 10).map((job: any) => (
                <JobCard 
                  key={job.id} 
                  job={job}
                  theme={theme}
                  isProcessing={isProcessing}
                  isOwner={isOwner}
                  handleDeleteJob={handleDeleteJob}
                  moveJob={moveJob}
                  setPendingJobPayment={setPendingJobPayment}
                  handleCopySMS={handleCopySMS}
                  activeSmsJob={activeSmsJob}
                  smsText={smsText}
                />
              ))}  {!loading && completedJobs.length === 0 && <p className="text-xs text-center py-4 text-emerald-300 font-medium">No paid jobs yet</p>}
              </div>
            </div>
          </div>
        </div>

      </main>

      <ServicePaymentModal
        isOpen={!!pendingJobPayment}
        onClose={() => setPendingJobPayment(null)}
        amountDue={(pendingJobPayment?.amount || 0) / 100}
        onConfirm={(method, discountCentavos, discountType, discountReason) => handlePaymentConfirm(pendingJobPayment, method, discountCentavos, discountType, discountReason)}
      />
      
      <ThermalReceiptPreview
        open={showReceipt}
        onClose={() => setShowReceipt(false)}
        storeName={currentTenant?.name || "Katuwang Service"}
        receiptType="SERVICE INVOICE"
        items={completedSale?.items || []}
        totalAmountPesos={(completedSale?.total || 0) / 100}
        paymentMethod={completedSale?.paymentMethod || "cash"}
        transactionId={completedSale?.saleId}
        theme={theme}
      />

    </div>
  );
}
