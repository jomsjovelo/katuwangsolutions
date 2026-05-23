"use client"

import React, { useState } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { doc, collection, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getModuleTheme, useDynamicThemeColor } from '@/lib/theme-utils';
import { useRepairJobs } from '@/hooks/use-repair';
import { useToast } from '@/hooks/use-toast';
import { 
  Wrench, 
  Plus, 
  UserCircle2,
  Settings,
  CheckCircle2,
  CircleDollarSign,
  Smartphone
} from "lucide-react";

export function RepSyncDashboard() {
  const { currentTenant } = useTenant();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [isProcessing, setIsProcessing] = useState(false);

  const theme = getModuleTheme(currentTenant?.moduleType);
  useDynamicThemeColor(theme);

  // Repair Jobs State
  const { queuedJobs, repairingJobs, readyJobs, releasedJobs, loading } = useRepairJobs();

  // Create Job Form
  const [showAddForm, setShowAddForm] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [itemName, setItemName] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [estimatedCost, setEstimatedCost] = useState<number | ''>('');

  const handleAddJob = async () => {
    if (!currentTenant || !db || !customerName || !itemName || !issueDescription) return;
    setIsProcessing(true);
    try {
      const jobRef = doc(collection(db, 'tenants', currentTenant.id, 'repair_jobs'));
      await setDoc(jobRef, {
        tenantId: currentTenant.id,
        customerName,
        itemName,
        issueDescription,
        status: 'Queued',
        estimatedCost: (typeof estimatedCost === 'number' ? estimatedCost : 0) * 100, // convert to cents
        paymentStatus: 'Unpaid',
        createdAt: serverTimestamp(),
      });
      setCustomerName('');
      setItemName('');
      setIssueDescription('');
      setEstimatedCost('');
      setShowAddForm(false);
      toast({ title: 'Repair Job Added!', description: `${itemName} is now queued.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const updateStatus = async (id: string, status: string, paymentStatus?: string) => {
    if (!currentTenant || !db) return;
    try {
      const jobRef = doc(db, 'tenants', currentTenant.id, 'repair_jobs', id);
      const updates: any = { status, updatedAt: serverTimestamp() };
      if (paymentStatus) updates.paymentStatus = paymentStatus;
      await updateDoc(jobRef, updates);
      toast({ title: 'Job Updated', description: `Item moved to ${status}.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const JobCard = ({ job, actions }: { job: any, actions: React.ReactNode }) => (
    <Card className="shadow-sm border-slate-200 mb-3 hover:shadow-md transition-shadow">
      <CardContent className="p-3">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
              <Smartphone className="h-4 w-4 text-slate-500" />
              {job.itemName}
            </h4>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                <UserCircle2 className="h-3 w-3" /> {job.customerName}
              </span>
            </div>
          </div>
          <div className="text-right">
            <Badge variant="outline" className={job.paymentStatus === 'Paid' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}>
              {job.paymentStatus}
            </Badge>
            <p className="text-sm font-bold text-slate-700 mt-1">₱{(job.estimatedCost / 100).toLocaleString()}</p>
          </div>
        </div>
        
        <div className="bg-slate-50 p-2 rounded-md mb-3 border border-slate-100">
          <p className="text-xs text-slate-600 font-medium leading-tight line-clamp-2">"{job.issueDescription}"</p>
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
              <Wrench className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-headline font-bold">{currentTenant?.name || 'Repair Shop'}</h3>
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
              <CardTitle className="text-sm font-bold flex items-center gap-2"><Wrench className="h-4 w-4 text-slate-500" /> Intake Item</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3 pt-0">
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Customer Name</Label>
                  <Input placeholder="e.g. John Doe" value={customerName} onChange={e => setCustomerName(e.target.value)} />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Item / Device</Label>
                  <Input placeholder="e.g. iPhone 12" value={itemName} onChange={e => setItemName(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Issue Description</Label>
                <Input placeholder="e.g. Broken screen, won't turn on" value={issueDescription} onChange={e => setIssueDescription(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Estimated Cost (₱)</Label>
                <Input type="number" placeholder="₱0.00" value={estimatedCost} onChange={e => setEstimatedCost(parseFloat(e.target.value) || '')} />
              </div>
              <Button 
                className="w-full h-8 text-xs font-bold text-white" 
                style={{ backgroundColor: theme.primary }}
                onClick={handleAddJob}
                disabled={isProcessing || !customerName || !itemName || !issueDescription}
              >
                Log Intake
              </Button>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="text-center py-8 text-sm text-slate-400">Loading repair bench...</div>
        ) : (
          <div className="flex flex-col md:flex-row gap-4 overflow-x-auto pb-4">
            
            {/* Queued Column */}
            <div className="flex-1 min-w-[280px]">
              <div className="flex items-center gap-2 mb-3 px-1">
                <Wrench className="h-4 w-4 text-amber-500" />
                <h4 className="font-bold text-sm text-slate-700">Intake Queue</h4>
                <Badge variant="secondary" className="bg-white ml-auto">{queuedJobs.length}</Badge>
              </div>
              <div className="space-y-2">
                {queuedJobs.map(job => (
                  <JobCard key={job.id} job={job} actions={
                    <Button size="sm" className="w-full h-7 text-[10px] bg-slate-800 hover:bg-slate-900" onClick={() => updateStatus(job.id!, 'Repairing')}>
                      <Settings className="h-3 w-3 mr-1" /> Start Repair
                    </Button>
                  } />
                ))}
              </div>
            </div>

            {/* Repairing Column */}
            <div className="flex-1 min-w-[280px]">
              <div className="flex items-center gap-2 mb-3 px-1">
                <Settings className="h-4 w-4 text-blue-500 animate-[spin_3s_linear_infinite]" />
                <h4 className="font-bold text-sm text-slate-700">On The Bench</h4>
                <Badge variant="secondary" className="bg-white ml-auto">{repairingJobs.length}</Badge>
              </div>
              <div className="space-y-2">
                {repairingJobs.map(job => (
                  <JobCard key={job.id} job={job} actions={
                    <Button size="sm" className="w-full h-7 text-[10px] bg-sky-500 hover:bg-sky-600 text-white" onClick={() => updateStatus(job.id!, 'Ready')}>
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Mark Fixed
                    </Button>
                  } />
                ))}
              </div>
            </div>

            {/* Ready Column */}
            <div className="flex-1 min-w-[280px]">
              <div className="flex items-center gap-2 mb-3 px-1">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <h4 className="font-bold text-sm text-slate-700">Ready for Pickup</h4>
                <Badge variant="secondary" className="bg-white ml-auto">{readyJobs.length}</Badge>
              </div>
              <div className="space-y-2">
                {readyJobs.map(job => (
                  <JobCard key={job.id} job={job} actions={
                    <Button size="sm" className="w-full h-7 text-[10px] bg-emerald-500 hover:bg-emerald-600 text-white" onClick={() => updateStatus(job.id!, 'Released', 'Paid')}>
                      <CircleDollarSign className="h-3 w-3 mr-1" /> Pay & Release
                    </Button>
                  } />
                ))}
              </div>
            </div>

            {/* Released Column */}
            <div className="flex-1 min-w-[280px]">
              <div className="flex items-center gap-2 mb-3 px-1">
                <CircleDollarSign className="h-4 w-4 text-slate-400" />
                <h4 className="font-bold text-sm text-slate-700">Released Today</h4>
                <Badge variant="secondary" className="bg-white ml-auto">{releasedJobs.length}</Badge>
              </div>
              <div className="space-y-2 opacity-60">
                {releasedJobs.map(job => (
                  <JobCard key={job.id} job={job} actions={
                    <Button disabled size="sm" variant="outline" className="w-full h-7 text-[10px] font-bold text-emerald-600 border-emerald-200 bg-emerald-50">
                      Completed
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
