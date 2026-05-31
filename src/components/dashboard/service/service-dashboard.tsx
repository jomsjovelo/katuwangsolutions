"use client"

import React, { useState } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { useCollection } from 'react-firebase-hooks/firestore';
import { collection, query, orderBy } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { addJob, updateJobStatus } from '@/firebase/firestore/service-actions';
import { JobStatus } from '@/lib/schemas/services';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getModuleTheme, useDynamicThemeColor } from '@/lib/theme-utils';
import { 
  Plus, 
  Clock, 
  PlayCircle, 
  CheckCircle2,
  Loader2,
  AlertCircle
} from "lucide-react";

export function ServiceDashboard() {
  const { currentTenant } = useTenant();
  const db = useFirestore();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dynamically resolve Katuwang industry theme based on active tenant's moduleType
  const theme = getModuleTheme(currentTenant?.moduleType);
  
  // Immersive dynamic status bar viewport tracking for PWA Android/iOS notch
  useDynamicThemeColor(theme);

  // Live stream of jobs
  const jobsQuery = currentTenant 
    ? query(
        collection(db, 'tenants', currentTenant.id, 'jobs'),
        orderBy('createdAt', 'desc')
      )
    : null;

  const [jobsSnapshot, loading, hookError] = useCollection(jobsQuery as any);
  
  const jobs = jobsSnapshot?.docs.map((doc: any) => ({
    id: doc.id,
    ...doc.data()
  })) || [];

  const pendingJobs = jobs.filter((j: any) => j.status === 'pending');
  const activeJobs = jobs.filter((j: any) => j.status === 'in_progress');
  const completedJobs = jobs.filter((j: any) => j.status === 'completed');

  const handleAddTestJob = async () => {
    if (!currentTenant) return;
    try {
      setIsProcessing(true);
      setError(null);
      await addJob(currentTenant.id, `Customer ${Math.floor(Math.random() * 1000)}`, 'Premium Wash', 35000); // ₱350.00
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const moveJob = async (id: string, newStatus: JobStatus, amount?: number, customerName?: string) => {
    if (!currentTenant) return;
    try {
      setIsProcessing(true);
      setError(null);
      await updateJobStatus(currentTenant.id, id, newStatus, amount, customerName);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const ColumnHeader = ({ title, count, icon: Icon, colorClass }: any) => (
    <div className="flex items-center justify-between mb-3 px-1">
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", colorClass)} />
        <h4 className="font-bold text-sm text-slate-700">{title}</h4>
      </div>
      <Badge variant="secondary" className="font-black bg-white">{count}</Badge>
    </div>
  );

  const JobCard = ({ job }: { job: any }) => (
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
        <div>
          <div className="font-bold text-sm text-slate-900">{job.customerName}</div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{job.serviceId}</div>
        </div>
        <div className="text-right">
          <Badge 
            className="text-[9px] font-black uppercase border-transparent"
            style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
          >
            ₱{(job.amount / 100).toLocaleString()}
          </Badge>
        </div>
      </div>
      
      {/* Action Buttons based on status */}
      <div className="flex gap-2">
        {job.status === 'pending' && (
          <Button 
            disabled={isProcessing} 
            size="sm" 
            onClick={() => moveJob(job.id, 'in_progress')} 
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
            onClick={() => moveJob(job.id, 'completed', job.amount, job.customerName)} 
            className="w-full h-8 text-[10px] font-bold uppercase tracking-widest bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            Complete & Pay
          </Button>
        )}
        {job.status === 'completed' && (
          <Button disabled size="sm" variant="outline" className="w-full h-8 text-[10px] font-bold uppercase tracking-widest text-emerald-600 border-emerald-200 bg-emerald-50 opacity-70">
            <CheckCircle2 className="h-3 w-3 mr-1" /> Paid & Done
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col bg-slate-50">
      <main className="p-4 space-y-6 pb-20">
        {/* Header Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-headline font-bold">Queue Manager</h3>
              <p className="text-xs text-muted-foreground font-medium">{theme.name} • {currentTenant?.name || 'Service Business'}</p>
            </div>
            <Button 
              onClick={handleAddTestJob} 
              disabled={isProcessing} 
              size="sm" 
              className="rounded-full shadow-md font-bold text-white border-none active:scale-95 transition-transform"
              style={{ 
                backgroundColor: theme.primary,
                boxShadow: `0 8px 16px -4px ${theme.primary}40`
              }}
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />} 
              New Test Job
            </Button>
          </div>
        </section>

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
        </div>

        {/* Kanban Board (Vertical scrollable columns on mobile) */}
        <div className="flex flex-col gap-6">
          {/* Pending Column */}
          <div className="bg-slate-100/50 p-3 rounded-2xl border border-slate-200">
            <ColumnHeader title="Waiting" count={pendingJobs.length} icon={Clock} colorClass="text-amber-500" />
            <div className="grid gap-2">
              {loading && <div className="text-center py-4 text-xs text-slate-400">Loading DB...</div>}
              {pendingJobs.map((job: any) => <JobCard key={job.id} job={job} />)}
              {!loading && pendingJobs.length === 0 && <p className="text-xs text-center py-4 text-slate-400 font-medium">No waiting jobs</p>}
            </div>
          </div>

          {/* In Progress Column */}
          <div 
            className="p-3 rounded-2xl border transition-colors duration-300"
            style={{ backgroundColor: `${theme.primary}05`, borderColor: `${theme.primary}20` }}
          >
            <ColumnHeader title="In Progress" count={activeJobs.length} icon={PlayCircle} colorClass="text-slate-700" style={{ color: theme.primary }} />
            <div className="grid gap-2">
              {activeJobs.map((job: any) => <JobCard key={job.id} job={job} />)}
              {!loading && activeJobs.length === 0 && <p className="text-xs text-center py-4 font-medium" style={{ color: theme.primary }}>No active jobs</p>}
            </div>
          </div>

          {/* Completed Column */}
          <div className="bg-emerald-50/50 p-3 rounded-2xl border border-emerald-100">
            <ColumnHeader title="Done Today" count={completedJobs.length} icon={CheckCircle2} colorClass="text-emerald-500" />
            <div className="grid gap-2 opacity-75">
              {completedJobs.map((job: any) => <JobCard key={job.id} job={job} />)}
              {!loading && completedJobs.length === 0 && <p className="text-xs text-center py-4 text-emerald-300 font-medium">No completed jobs yet</p>}
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
