"use client";

import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Tenant } from '@/store/use-tenant-store';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getAuth, sendPasswordResetEmail } from 'firebase/auth';
import { initializeFirebase } from '@/firebase';
import { getFirestore, collection, query, where, onSnapshot } from 'firebase/firestore';
import { Mail, Key, Store, Calendar, Layers, ShieldAlert, Activity, User, Fingerprint, X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdminTenantDetailsProps {
  tenant: Tenant | null;
  isOpen: boolean;
  onClose: () => void;
  updateNextBillingDate: (id: string, date: Date | null) => Promise<void>;
  processTenantRenewal?: (tenant: Tenant) => Promise<void>;
  toggleTenantModule?: (id: string, current: string[] | undefined, moduleId: string) => Promise<void>;
}

const AVAILABLE_MODULES = ['benta-snap', 'fresh-tally', 'build-stack', '5-6-tracker', 'ledger-flow', 'sahod-flow', 'biyahe-sync', 'ani-grow', 'bite-snap', 'timpla-track', 'ganap-master', 'spin-snap', 'hydro-sync', 'auto-boss', 'wellness-pro', 'trim-track', 'rep-sync', 'rental'];

export function AdminTenantDetails({ tenant, isOpen, onClose, updateNextBillingDate, processTenantRenewal, toggleTenantModule }: AdminTenantDetailsProps) {
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isUpdatingDate, setIsUpdatingDate] = useState(false);
  const [isRenewing, setIsRenewing] = useState(false);
  const [isTogglingModule, setIsTogglingModule] = useState(false);
  const [selectedModuleToAdd, setSelectedModuleToAdd] = useState('');
  const [staffList, setStaffList] = useState<any[]>([]);

  useEffect(() => {
    if (!tenant) {
      setStaffList([]);
      return;
    }
    const db = getFirestore();
    const q = query(
      collection(db, 'users'),
      where('tenantId', '==', tenant.id),
      where('role', '==', 'staff')
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      setStaffList(snap.docs.map(doc => ({ uid: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [tenant]);

  if (!tenant) return null;

  const handlePasswordReset = async () => {
    if (!tenant.ownerEmail) {
      alert("No owner email found for this tenant.");
      return;
    }
    
    if (confirm(`Send password reset email to ${tenant.ownerEmail}?`)) {
      setIsSendingReset(true);
      try {
        const { auth } = initializeFirebase();
        await sendPasswordResetEmail(auth, tenant.ownerEmail);
        alert(`Password reset email sent successfully to ${tenant.ownerEmail}`);
      } catch (error: any) {
        console.error("Failed to send reset email:", error);
        alert(`Failed to send email: ${error.message}`);
      } finally {
        setIsSendingReset(false);
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'pending': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'suspended': return 'bg-rose-100 text-rose-700 border-rose-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-md w-full overflow-y-auto">
        <SheetHeader className="mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary/10 rounded-xl text-primary">
              <Store className="h-6 w-6" />
            </div>
            <div>
              <SheetTitle className="text-2xl font-black font-headline uppercase tracking-tight">{tenant.name}</SheetTitle>
              <SheetDescription className="flex items-center gap-1 font-mono text-xs">
                <Fingerprint className="h-3 w-3" /> {tenant.id}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-6">
          {/* Status Banner */}
          <div className={cn("p-4 rounded-xl border flex items-center justify-between", getStatusColor(tenant.subscriptionStatus))}>
            <div className="flex items-center gap-2 font-bold uppercase tracking-widest text-xs">
              <Activity className="h-4 w-4" /> Status
            </div>
            <Badge className={cn("uppercase font-black tracking-widest", getStatusColor(tenant.subscriptionStatus))}>
              {tenant.subscriptionStatus}
            </Badge>
          </div>

          {/* Owner Details */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500">Owner Identity</h4>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <Mail className="h-4 w-4 text-slate-400" />
                <span className="font-medium text-slate-700">{tenant.ownerEmail || 'No email associated'}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <User className="h-4 w-4 text-slate-400" />
                <span className="font-mono text-xs text-slate-500">{tenant.ownerUid}</span>
              </div>
            </div>
          </div>

          {/* Subscription Details */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500">Subscription & Modules</h4>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-slate-500 flex items-center gap-2"><Layers className="h-4 w-4" /> Core Module</span>
                <span className="font-bold uppercase text-sm">{tenant.moduleType}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-slate-500">Pricing Tier</span>
                <Badge variant="outline" className="uppercase font-bold text-[10px] tracking-wider bg-white">
                  {tenant.pricingTier.replace('_', ' ')}
                </Badge>
              </div>
              <div className="pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-500 block">Next Billing Date</span>
                  {processTenantRenewal && (
                    <Button 
                      size="sm"
                      onClick={async () => {
                        if (confirm(`Are you sure you want to process a 30-day renewal for ${tenant.name}? This will apply any referral bonuses if applicable.`)) {
                          setIsRenewing(true);
                          try {
                            await processTenantRenewal(tenant);
                            alert("Renewal processed successfully.");
                          } catch (err) {
                            alert("Failed to process renewal.");
                          } finally {
                            setIsRenewing(false);
                          }
                        }
                      }}
                      disabled={isRenewing}
                      className="h-7 text-[10px] font-bold bg-emerald-500 hover:bg-emerald-600 text-white tracking-widest uppercase rounded-lg"
                    >
                      {isRenewing ? 'Processing...' : '+30 Days (Renew)'}
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Input 
                    type="date"
                    className="flex-1 text-sm font-bold border border-slate-200 rounded-xl h-12 px-3 focus:ring-2 focus:ring-primary focus:outline-none"
                    defaultValue={tenant.nextBillingDate ? new Date(typeof tenant.nextBillingDate === 'object' && tenant.nextBillingDate !== null && 'seconds' in tenant.nextBillingDate ? (tenant.nextBillingDate as any).seconds * 1000 : tenant.nextBillingDate as any).toISOString().split('T')[0] : ''}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      setIsUpdatingDate(true);
                      updateNextBillingDate(tenant.id, new Date(e.target.value))
                        .finally(() => setIsUpdatingDate(false));
                    }}
                    disabled={isUpdatingDate || isRenewing}
                  />
                  {tenant.nextBillingDate && (
                    <Button 
                      variant="ghost" 
                      onClick={() => {
                        setIsUpdatingDate(true);
                        updateNextBillingDate(tenant.id, null).finally(() => setIsUpdatingDate(false));
                      }}
                      className="text-slate-400 hover:text-destructive h-12 px-4 rounded-xl font-bold"
                      disabled={isUpdatingDate || isRenewing}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
              <div className="pt-2 border-t border-slate-200">
                <span className="text-xs font-bold uppercase text-slate-500 mb-2 block">Unlocked Add-ons</span>
                
                {/* Existing Modules */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {(!tenant.unlockedModules || tenant.unlockedModules.length === 0) && (
                    <span className="text-xs text-slate-400">No add-ons unlocked.</span>
                  )}
                  {tenant.unlockedModules?.map(mod => (
                    <Badge key={mod} className="bg-primary/10 text-primary border-primary/20 flex items-center gap-1 py-1">
                      {mod}
                      {toggleTenantModule && (
                        <button 
                          onClick={async () => {
                            if(confirm(`Remove module ${mod}?`)) {
                              setIsTogglingModule(true);
                              await toggleTenantModule(tenant.id, tenant.unlockedModules, mod).finally(() => setIsTogglingModule(false));
                            }
                          }}
                          disabled={isTogglingModule}
                          className="hover:bg-primary/20 rounded-full p-0.5 ml-1 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </Badge>
                  ))}
                </div>

                {/* Add Module UI */}
                {toggleTenantModule && (
                  <div className="flex items-center gap-2 mt-2">
                    <select 
                      className="flex-1 h-9 rounded-lg border border-slate-200 text-xs font-medium px-2 focus:ring-2 focus:ring-primary focus:outline-none"
                      value={selectedModuleToAdd}
                      onChange={(e) => setSelectedModuleToAdd(e.target.value)}
                      disabled={isTogglingModule}
                    >
                      <option value="">Select app to add...</option>
                      {AVAILABLE_MODULES
                        .filter(m => m !== tenant.moduleType && !(tenant.unlockedModules || []).includes(m))
                        .map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))
                      }
                    </select>
                    <Button 
                      size="sm"
                      disabled={!selectedModuleToAdd || isTogglingModule}
                      onClick={async () => {
                        if (selectedModuleToAdd) {
                          setIsTogglingModule(true);
                          await toggleTenantModule(tenant.id, tenant.unlockedModules, selectedModuleToAdd)
                            .then(() => setSelectedModuleToAdd(''))
                            .finally(() => setIsTogglingModule(false));
                        }
                      }}
                      className="h-9 px-3 rounded-lg text-xs font-bold"
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Staff Members */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500">Team Members</h4>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
              {staffList.length === 0 ? (
                <div className="text-center py-4 text-xs text-slate-400">No staff members found.</div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {staffList.map((staff) => (
                    <div key={staff.uid} className="py-2 flex items-center justify-between first:pt-0 last:pb-0">
                      <div>
                        <div className="font-bold text-sm text-slate-800">{staff.email}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-slate-500 font-mono">UID: {staff.uid.slice(0, 8)}...</span>
                          <Badge className={cn("uppercase text-[8px] tracking-widest py-0 px-1 border-none", 
                            staff.subscriptionStatus === 'active' ? "bg-emerald-100 text-emerald-700" : 
                            staff.subscriptionStatus === 'pending' ? "bg-amber-100 text-amber-700" : 
                            "bg-slate-100 text-slate-700"
                          )}>
                            {staff.subscriptionStatus || 'unknown'}
                          </Badge>
                        </div>
                      </div>
                      {staff.subscriptionStatus === 'pending' && (
                        <Button 
                          size="sm" 
                          onClick={async () => {
                            if(confirm(`Approve staff member ${staff.email}?`)) {
                               const { getFirestore, doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
                               const db = getFirestore();
                               await updateDoc(doc(db, 'users', staff.uid), {
                                 subscriptionStatus: 'active',
                                 updatedAt: serverTimestamp()
                               });
                            }
                          }}
                          className="bg-amber-500 hover:bg-amber-600 text-white font-bold h-8 px-3 text-xs rounded-lg"
                        >
                          Approve
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Timestamp */}
          {tenant.createdAt && (
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
              <Calendar className="h-4 w-4" />
              Created on {new Date(typeof tenant.createdAt === 'object' && tenant.createdAt !== null && 'seconds' in tenant.createdAt ? (tenant.createdAt as any).seconds * 1000 : tenant.createdAt as any).toLocaleDateString()}
            </div>
          )}

          {/* Admin Actions */}
          <div className="space-y-3 pt-4 border-t">
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" /> Admin Actions
            </h4>
            <div className="grid gap-2">
              <Button 
                variant="outline" 
                className="w-full justify-start font-bold h-12 rounded-xl"
                onClick={handlePasswordReset}
                disabled={isSendingReset || !tenant.ownerEmail}
              >
                <Key className="h-4 w-4 mr-2 text-primary" />
                {isSendingReset ? 'Sending...' : 'Send Password Reset Email'}
              </Button>
            </div>
          </div>
        </div>

        <SheetFooter className="mt-8">
          <Button variant="ghost" onClick={onClose} className="w-full font-bold uppercase tracking-widest h-12 rounded-xl">
            Close Panel
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
