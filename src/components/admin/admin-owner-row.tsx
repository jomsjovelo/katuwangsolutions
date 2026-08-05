import React, { useState } from 'react';
import { AdminTenant } from '@/hooks/use-admin-tenants';
import { PricingTier, SubscriptionStatus } from '@/store/use-tenant-store';
import { TableRow, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Mail, Layers, Calendar, ChevronDown, ChevronUp, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OwnerGroup {
  id: string;
  ownerEmail: string;
  primaryBusinessName: string;
  tenants: AdminTenant[];
}

interface AdminOwnerRowProps {
  group: OwnerGroup;
  updatingPricingFor: string | null;
  onUpdatePricing: (tenantId: string, tier: PricingTier) => void;
  onUpdateModulePricing?: (tenantId: string, moduleId: string, tier: PricingTier) => void;
  onUpdateStatus: (tenant: AdminTenant, status: SubscriptionStatus) => Promise<void>;
  onUpdateModuleStatus?: (tenantId: string, moduleId: string, status: SubscriptionStatus) => Promise<void>;
  onShowDetails: (tenant: AdminTenant) => void;
  onPurge: (tenant: AdminTenant) => void;
  toggleTenantModule?: (tenantId: string, currentModules: string[] | undefined, moduleId: string) => Promise<void>;
  approvePendingModuleRequest?: (tenantId: string, requestItem: { moduleId: string; price?: number }) => Promise<void>;
  onUpdateNextBillingDate?: (tenantId: string, date: Date | null) => Promise<void>;
}

export function getEffectiveNextBillingDate(nextBillingDate: any, createdAt: any): Date | null {
  if (nextBillingDate) {
    const d = new Date(typeof nextBillingDate === 'object' && nextBillingDate !== null && 'seconds' in nextBillingDate ? (nextBillingDate as any).seconds * 1000 : nextBillingDate as any);
    if (!isNaN(d.getTime())) return d;
  }
  if (createdAt) {
    const created = new Date(typeof createdAt === 'object' && createdAt !== null && 'seconds' in createdAt ? (createdAt as any).seconds * 1000 : createdAt as any);
    if (!isNaN(created.getTime())) {
      const fallback = new Date(created);
      fallback.setDate(fallback.getDate() + 30);
      return fallback;
    }
  }
  return null;
}

export function getLifecycleState(nextBillingDate: any, status: string, createdAt?: any) {
  if (status === 'pending') {
    return { state: 'PENDING', label: '⏳ PENDING', badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 font-bold' };
  }
  if (status === 'expired' || status === 'suspended') {
    return { state: 'EXPIRED', label: '🚨 EXPIRED', badgeClass: 'bg-rose-500 text-white font-black animate-pulse border-rose-600' };
  }
  
  const date = getEffectiveNextBillingDate(nextBillingDate, createdAt);
  if (!date) return { state: 'HEALTHY', label: 'NO DATE', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200 font-bold' };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { state: 'EXPIRED', label: '🚨 OVERDUE', badgeClass: 'bg-rose-500 text-white font-black animate-pulse border-rose-600' };
  }
  if (diffDays === 0) {
    return { state: 'DUE_TODAY', label: '⚠️ DUE TODAY', badgeClass: 'bg-amber-500 text-white font-black animate-pulse border-amber-600' };
  }
  if (diffDays <= 3) {
    return { state: 'EXPIRING_SOON', label: `⚠️ EXPIRES IN ${diffDays}d`, badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 font-black' };
  }
  return { state: 'HEALTHY', label: 'ACTIVE', badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200 font-bold' };
}

export function AdminOwnerRow({
  group,
  updatingPricingFor,
  onUpdatePricing,
  onUpdateModulePricing,
  onUpdateStatus,
  onUpdateModuleStatus,
  onShowDetails,
  onPurge,
  toggleTenantModule,
  approvePendingModuleRequest,
  onUpdateNextBillingDate
}: AdminOwnerRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [updatingStatusFor, setUpdatingStatusFor] = useState<string | null>(null);

  const activeCount = group.tenants.reduce((acc, t) => {
    const primaryActive = t.subscriptionStatus === 'active' ? 1 : 0;
    const unlockedActive = (t.unlockedModules || [])
      .filter(mod => mod !== t.moduleType && (t.moduleStatuses?.[mod] || 'active') === 'active')
      .length;
    return acc + primaryActive + unlockedActive;
  }, 0);

  const pendingCount = group.tenants.filter(t => t.subscriptionStatus === 'pending').length;

  const suspendedCount = group.tenants.reduce((acc, t) => {
    const primarySuspended = t.subscriptionStatus === 'suspended' ? 1 : 0;
    const unlockedSuspended = (t.unlockedModules || [])
      .filter(mod => mod !== t.moduleType && t.moduleStatuses?.[mod] === 'suspended')
      .length;
    return acc + primarySuspended + unlockedSuspended;
  }, 0);

  const pendingRequestCount = group.tenants.reduce((acc, t) => {
    const validPending = (t.pendingModuleRequests || []).filter(
      r => !(t.unlockedModules || []).includes(r.moduleId)
    );
    if (validPending.length > 0) return acc + validPending.length;
    if (t.lastPaymentRequestedModule && !(t.unlockedModules || []).includes(t.lastPaymentRequestedModule)) {
      return acc + 1;
    }
    return acc;
  }, 0);

  const lifecycleStats = group.tenants.reduce((acc, t) => {
    const primaryInfo = getLifecycleState(t.nextBillingDate, t.subscriptionStatus);
    if (primaryInfo.state === 'DUE_TODAY') acc.dueToday++;
    else if (primaryInfo.state === 'EXPIRING_SOON') acc.expiringSoon++;
    else if (primaryInfo.state === 'EXPIRED') acc.expired++;

    (t.unlockedModules || []).forEach(mod => {
      if (mod === t.moduleType) return;
      const modStatus = t.moduleStatuses?.[mod] || 'active';
      const modInfo = getLifecycleState(t.nextBillingDate, modStatus);
      if (modInfo.state === 'DUE_TODAY') acc.dueToday++;
      else if (modInfo.state === 'EXPIRING_SOON') acc.expiringSoon++;
      else if (modInfo.state === 'EXPIRED') acc.expired++;
    });
    return acc;
  }, { dueToday: 0, expiringSoon: 0, expired: 0 });

  return (
    <>
      <TableRow className={cn("border-secondary/30 transition-colors", isExpanded ? "bg-secondary/10" : "hover:bg-secondary/5")}>
        <TableCell>
          <div className="flex flex-col gap-1">
            <span className="font-bold text-lg">{group.ownerEmail}</span>
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <span className="flex items-center gap-1 font-medium">{group.primaryBusinessName}</span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-1">
              {group.tenants[0]?.createdAt && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>
                    {new Date(
                      typeof group.tenants[0].createdAt === 'object' && 'seconds' in group.tenants[0].createdAt
                        ? (group.tenants[0].createdAt as any).seconds * 1000
                        : (group.tenants[0].createdAt as any)
                    ).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1">
                <Layers className="h-3 w-3" />
                <span>{group.tenants.length} Module{group.tenants.length > 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>
        </TableCell>
        <TableCell className="hidden md:table-cell">
          <div className="flex flex-wrap gap-1">
            {group.tenants.slice(0, 3).map(t => (
              <Badge key={t.id} variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[10px] uppercase tracking-wider font-bold">
                {t.moduleType}
              </Badge>
            ))}
            {group.tenants.length > 3 && (
              <Badge variant="outline" className="bg-secondary text-secondary-foreground border-secondary/50 text-[10px] uppercase tracking-wider font-bold">
                + {group.tenants.length - 3} more
              </Badge>
            )}
          </div>
        </TableCell>
        <TableCell className="hidden md:table-cell">
          <div className="flex flex-col gap-1 text-xs font-medium">
            {lifecycleStats.dueToday > 0 && (
              <span className="text-amber-800 font-black bg-amber-400 border border-amber-500 px-2 py-0.5 rounded-full inline-flex items-center gap-1 text-[10px] uppercase tracking-wider animate-pulse shadow-sm">
                ⚠️ {lifecycleStats.dueToday} DUE TODAY
              </span>
            )}
            {lifecycleStats.expiringSoon > 0 && (
              <span className="text-amber-900 font-bold bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1 text-[10px] uppercase tracking-wider">
                ⏳ {lifecycleStats.expiringSoon} EXPIRING SOON
              </span>
            )}
            {lifecycleStats.expired > 0 && (
              <span className="text-rose-700 font-black bg-rose-100 border border-rose-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1 text-[10px] uppercase tracking-wider animate-pulse">
                🚨 {lifecycleStats.expired} EXPIRED
              </span>
            )}
            {activeCount > 0 && <span className="text-emerald-600 font-bold">{activeCount} Active</span>}
            {pendingCount > 0 && <span className="text-amber-600 font-bold">{pendingCount} Pending Approval</span>}
            {pendingRequestCount > 0 && (
              <span className="text-amber-600 font-bold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full inline-block text-[10px] uppercase tracking-wider">
                ⚠️ {pendingRequestCount} Add-on Request{pendingRequestCount > 1 ? 's' : ''}
              </span>
            )}
            {suspendedCount > 0 && <span className="text-destructive font-bold">{suspendedCount} Suspended</span>}
          </div>
        </TableCell>
        <TableCell className="text-right">
          <Button
            variant={isExpanded ? "default" : "outline"}
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="font-bold text-xs"
          >
            {isExpanded ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
            {isExpanded ? 'Hide Modules' : 'Manage Modules'}
          </Button>
        </TableCell>
      </TableRow>

      {isExpanded && (
        <TableRow className="bg-secondary/5 border-b border-secondary/30">
          <TableCell colSpan={4} className="p-0">
            <div className="p-4 md:pl-12">
              <div className="bg-white rounded-xl border border-secondary shadow-sm overflow-hidden">
                {/* Desktop Header */}
                <div className="hidden md:grid grid-cols-5 bg-slate-50 border-b border-secondary text-xs uppercase text-slate-500 font-bold tracking-wider p-4">
                  <div>Module ID</div>
                  <div>Pricing Tier</div>
                  <div>Next Billing Date</div>
                  <div>Status</div>
                  <div className="text-right">Actions</div>
                </div>
                
                {/* Responsive Body */}
                <div className="divide-y divide-secondary">
                  {group.tenants.map(tenant => {
                    const effectiveDate = getEffectiveNextBillingDate(tenant.nextBillingDate, tenant.createdAt);
                    const lifecycle = getLifecycleState(tenant.nextBillingDate, tenant.subscriptionStatus, tenant.createdAt);
                    return (
                      <React.Fragment key={tenant.id}>
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 md:gap-4 p-4 hover:bg-slate-50/50 items-center">
                          
                            {/* Module ID */}
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-800 flex items-center gap-1">
                                <Layers className="h-3 w-3 text-primary" />
                                {tenant.moduleType.toUpperCase()}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono mt-0.5">{tenant.id}</span>
                            </div>
                            
                            {/* Pricing Tier */}
                            <div className="flex items-center justify-between md:justify-start">
                              <span className="md:hidden text-[10px] font-bold text-slate-400 uppercase tracking-wider w-28">Pricing:</span>
                              <div className="relative inline-block w-full md:w-36 flex-1">
                                {updatingPricingFor === tenant.id && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-lg z-10">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                                  </div>
                                )}
                                <select
                                  value={tenant.pricingTier}
                                  onChange={(e) => onUpdatePricing(tenant.id, e.target.value as PricingTier)}
                                  className="w-full text-xs font-bold uppercase tracking-wider bg-secondary/20 border-secondary rounded-lg px-3 py-2 text-slate-700 outline-none focus:ring-2 focus:ring-primary appearance-none cursor-pointer"
                                >
                                  <option value="foc">Free Of Charge (FOC)</option>
                                  <option value="promo_50">Budget Promo (₱50)</option>
                                  <option value="promo_99">Promo (₱99)</option>
                                  <option value="standard_199">Standard (₱199)</option>
                                  <option value="enterprise">Enterprise (₱499)</option>
                                </select>
                              </div>
                            </div>

                            {/* Next Billing Date */}
                            <div className="flex items-center justify-between md:justify-start">
                              <span className="md:hidden text-[10px] font-bold text-slate-400 uppercase tracking-wider w-28">Next Billing:</span>
                              <div className="flex flex-col gap-1">
                                <span className="text-xs font-bold text-slate-700 font-mono flex items-center gap-1">
                                  <Calendar className="h-3 w-3 text-slate-400" />
                                  {effectiveDate ? effectiveDate.toLocaleDateString() : 'N/A'}
                                </span>
                                <Badge className={cn("text-[9px] px-2 py-0.5 uppercase tracking-wider w-fit border shadow-none", lifecycle.badgeClass)}>
                                  {lifecycle.label}
                                </Badge>
                              </div>
                            </div>
                            
                            {/* Status */}
                            <div className="flex items-center justify-between md:justify-start">
                              <span className="md:hidden text-[10px] font-bold text-slate-400 uppercase tracking-wider w-28">Status:</span>
                              <div className="flex items-center gap-3 flex-1 justify-end md:justify-start relative">
                                {updatingStatusFor === tenant.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                ) : (
                                  <Switch 
                                    checked={tenant.subscriptionStatus === 'active'}
                                    onCheckedChange={async (checked) => {
                                      setUpdatingStatusFor(tenant.id);
                                      try {
                                        await onUpdateStatus(tenant, checked ? 'active' : 'suspended');
                                      } catch (e: any) {
                                        alert('Failed to update status: ' + e.message);
                                      } finally {
                                        setUpdatingStatusFor(null);
                                      }
                                    }}
                                    className="data-[state=checked]:bg-emerald-500"
                                  />
                                )}
                                <span className={cn(
                                  "text-xs font-bold uppercase tracking-wider w-16 text-right md:text-left",
                                  tenant.subscriptionStatus === 'active' ? "text-emerald-600" :
                                  tenant.subscriptionStatus === 'pending' ? "text-amber-600" :
                                  tenant.subscriptionStatus === 'expired' ? "text-rose-600 font-black animate-pulse" : "text-destructive"
                                )}>
                                  {tenant.subscriptionStatus}
                                </span>
                              </div>
                            </div>
                            
                            {/* Actions */}
                            <div className="flex items-center justify-end gap-1.5 border-t border-secondary/50 md:border-t-0 pt-3 md:pt-0 mt-2 md:mt-0">
                              {onUpdateNextBillingDate && (
                                <Button
                                  size="sm"
                                  onClick={async () => {
                                    const newExpiry = new Date();
                                    newExpiry.setMonth(newExpiry.getMonth() + 1);
                                    
                                    if (confirm(`Extend subscription for ${tenant.name} by +1 Month until ${newExpiry.toLocaleDateString()}?`)) {
                                      await onUpdateNextBillingDate(tenant.id, newExpiry);
                                      if (tenant.subscriptionStatus === 'expired') {
                                        await onUpdateStatus(tenant, 'active');
                                      }
                                    }
                                  }}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] h-8 px-2.5 rounded-lg shadow-sm"
                                  title="Extend subscription by +1 Month"
                                >
                                  +1 Month
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onShowDetails(tenant)}
                                className="bg-primary/10 text-primary hover:bg-primary hover:text-white font-bold text-xs h-8 px-2.5"
                              >
                                Details
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onPurge(tenant)}
                                className="h-8 w-8 text-destructive hover:bg-destructive hover:text-white transition-colors"
                                title="Purge Tenant Data"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                        </div>

                      {/* Render Active Unlocked Add-on Modules */}
                      {(tenant.unlockedModules || []).filter(mod => mod !== tenant.moduleType).map(mod => (
                        <div key={mod} className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-4 p-4 bg-emerald-500/5 border border-emerald-200/60 rounded-xl items-center my-1">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                              <Layers className="h-3.5 w-3.5 text-emerald-600" />
                              {mod.toUpperCase()}
                              <Badge className="bg-emerald-600 text-white text-[9px] uppercase tracking-wider font-bold ml-1">
                                Unlocked Add-on
                              </Badge>
                            </span>
                            <span className="text-[10px] text-emerald-600 font-mono mt-0.5">Purchased Add-on Module</span>
                          </div>

                          {/* Pricing Tier */}
                          <div className="flex items-center justify-between md:justify-start">
                            <span className="md:hidden text-[10px] font-bold text-slate-400 uppercase tracking-wider w-24">Pricing:</span>
                            <div className="relative inline-block w-full md:w-40 flex-1">
                              <select
                                value={tenant.modulePricingTiers?.[mod] || (mod === 'budget-mo' ? 'promo_50' : 'promo_99')}
                                onChange={(e) => onUpdateModulePricing ? onUpdateModulePricing(tenant.id, mod, e.target.value as PricingTier) : onUpdatePricing(tenant.id, e.target.value as PricingTier)}
                                className="w-full text-xs font-bold uppercase tracking-wider bg-emerald-500/10 border-emerald-300 rounded-lg px-3 py-2 text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500 appearance-none cursor-pointer"
                              >
                                <option value="foc">Free Of Charge (FOC)</option>
                                <option value="promo_50">Budget Promo (₱50)</option>
                                <option value="promo_99">Promo (₱99)</option>
                                <option value="standard_199">Standard (₱199)</option>
                                <option value="enterprise">Enterprise (₱499)</option>
                              </select>
                            </div>
                          </div>

                          {/* Active / Suspended Toggle Switch */}
                          <div className="flex items-center justify-between md:justify-start gap-2">
                            <span className="md:hidden text-[10px] font-bold text-slate-400 uppercase tracking-wider w-24">Status:</span>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={(tenant.moduleStatuses?.[mod] || 'active') === 'active'}
                                disabled={updatingStatusFor === `${tenant.id}_${mod}`}
                                onCheckedChange={async (checked) => {
                                  const newStatus: SubscriptionStatus = checked ? 'active' : 'suspended';
                                  setUpdatingStatusFor(`${tenant.id}_${mod}`);
                                  try {
                                    if (onUpdateModuleStatus) {
                                      await onUpdateModuleStatus(tenant.id, mod, newStatus);
                                    }
                                  } catch (e: any) {
                                    alert('Failed to update status: ' + e.message);
                                  } finally {
                                    setUpdatingStatusFor(null);
                                  }
                                }}
                              />
                              <span className={cn(
                                "text-xs font-bold uppercase tracking-wider",
                                (tenant.moduleStatuses?.[mod] || 'active') === 'active' ? "text-emerald-600" : "text-destructive"
                              )}>
                                {(tenant.moduleStatuses?.[mod] || 'active') === 'active' ? 'ACTIVE' : 'SUSPENDED'}
                              </span>
                            </div>
                          </div>

                          {/* Actions: Details Button */}
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onShowDetails(tenant)}
                              className="border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs h-8 px-3"
                            >
                              Details
                            </Button>
                          </div>
                        </div>
                      ))}

                      {/* Render Pending Add-on Requests for this tenant (excluding already unlocked modules) */}
                      {((tenant.pendingModuleRequests && tenant.pendingModuleRequests.length > 0)
                        ? tenant.pendingModuleRequests.filter(r => !(tenant.unlockedModules || []).includes(r.moduleId))
                        : (tenant.lastPaymentRequestedModule && !(tenant.unlockedModules || []).includes(tenant.lastPaymentRequestedModule))
                          ? [{ moduleId: tenant.lastPaymentRequestedModule, moduleName: tenant.lastPaymentRequestedModule, price: tenant.lastPaymentRequestedModule === 'budget-mo' ? 50 : 99 }]
                          : []
                      ).map((req: any) => (
                        <div key={req.moduleId} className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-amber-500/10 border-2 border-amber-400 rounded-xl items-center my-2 shadow-sm">
                          <div className="flex flex-col">
                            <span className="font-black text-amber-900 flex items-center gap-1.5 text-sm uppercase">
                              <Layers className="h-4 w-4 text-amber-600 animate-pulse" />
                              {req.moduleName || req.moduleId}
                              <Badge className="bg-amber-500 text-white text-[9px] uppercase tracking-wider font-black ml-1">
                                Requested Add-on
                              </Badge>
                            </span>
                            <span className="text-[10px] text-amber-700 font-bold mt-0.5">Payment Submitted · Pending Verification</span>
                          </div>

                          <div className="flex items-center">
                            <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-300 text-xs font-black">
                              ₱{req.price || (req.moduleId === 'budget-mo' ? 50 : 99)}/mo
                            </Badge>
                          </div>

                          <div className="flex items-center">
                            <span className="text-xs font-black text-amber-700 uppercase tracking-wider bg-amber-100/80 px-2.5 py-1 rounded-full border border-amber-300">
                              Status: PENDING
                            </span>
                          </div>

                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              disabled={updatingStatusFor === tenant.id}
                              onClick={async () => {
                                setUpdatingStatusFor(tenant.id);
                                try {
                                  if (approvePendingModuleRequest) {
                                    await approvePendingModuleRequest(tenant.id, req);
                                  } else if (toggleTenantModule) {
                                    await toggleTenantModule(tenant.id, tenant.unlockedModules, req.moduleId);
                                    const { doc, updateDoc, arrayRemove, deleteField } = await import('firebase/firestore');
                                    const { initializeFirebase } = await import('@/firebase');
                                    const { db } = initializeFirebase();
                                    await updateDoc(doc(db, 'tenants', tenant.id), {
                                      pendingModuleRequests: arrayRemove(req),
                                      lastPaymentRequestedModule: deleteField(),
                                      subscriptionStatus: 'active'
                                    });
                                  }
                                } catch (e: any) {
                                  alert('Approval failed: ' + e.message);
                                } finally {
                                  setUpdatingStatusFor(null);
                                }
                              }}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-md rounded-lg h-9 px-4 uppercase tracking-wider"
                            >
                              Approve & Unlock
                            </Button>
                          </div>
                        </div>
                      ))}
                    </React.Fragment>
                  );
                })}
                </div>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
