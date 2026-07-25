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
  onShowDetails: (tenant: AdminTenant) => void;
  onPurge: (tenant: AdminTenant) => void;
  toggleTenantModule?: (tenantId: string, currentModules: string[] | undefined, moduleId: string) => Promise<void>;
  approvePendingModuleRequest?: (tenantId: string, requestItem: { moduleId: string; price?: number }) => Promise<void>;
}

export function AdminOwnerRow({
  group,
  updatingPricingFor,
  onUpdatePricing,
  onUpdateModulePricing,
  onUpdateStatus,
  onShowDetails,
  onPurge,
  toggleTenantModule,
  approvePendingModuleRequest
}: AdminOwnerRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [updatingStatusFor, setUpdatingStatusFor] = useState<string | null>(null);

  const activeCount = group.tenants.filter(t => t.subscriptionStatus === 'active').length;
  const pendingCount = group.tenants.filter(t => t.subscriptionStatus === 'pending').length;
  const suspendedCount = group.tenants.filter(t => t.subscriptionStatus === 'suspended').length;
  const pendingRequestCount = group.tenants.reduce((acc, t) => {
    const reqs = t.pendingModuleRequests?.length 
      ? t.pendingModuleRequests.length 
      : (t.lastPaymentRequestedModule && !(t.unlockedModules || []).includes(t.lastPaymentRequestedModule)) ? 1 : 0;
    return acc + reqs;
  }, 0);

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
            {activeCount > 0 && <span className="text-emerald-600">{activeCount} Active</span>}
            {pendingCount > 0 && <span className="text-amber-600">{pendingCount} Pending Approval</span>}
            {pendingRequestCount > 0 && (
              <span className="text-amber-600 font-bold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full inline-block text-[10px] uppercase tracking-wider">
                ⚠️ {pendingRequestCount} Add-on Request{pendingRequestCount > 1 ? 's' : ''}
              </span>
            )}
            {suspendedCount > 0 && <span className="text-destructive">{suspendedCount} Suspended</span>}
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
                <div className="hidden md:grid grid-cols-4 bg-slate-50 border-b border-secondary text-xs uppercase text-slate-500 font-bold tracking-wider p-4">
                  <div>Module ID</div>
                  <div>Pricing Tier</div>
                  <div>Status</div>
                  <div className="text-right">Actions</div>
                </div>
                
                {/* Responsive Body */}
                <div className="divide-y divide-secondary">
                  {group.tenants.map(tenant => (
                    <React.Fragment key={tenant.id}>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-4 p-4 hover:bg-slate-50/50 items-center">
                        
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
                            <span className="md:hidden text-[10px] font-bold text-slate-400 uppercase tracking-wider w-24">Pricing:</span>
                            <div className="relative inline-block w-full md:w-40 flex-1">
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
                          
                          {/* Status */}
                          <div className="flex items-center justify-between md:justify-start">
                            <span className="md:hidden text-[10px] font-bold text-slate-400 uppercase tracking-wider w-24">Status:</span>
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
                                tenant.subscriptionStatus === 'pending' ? "text-amber-600" : "text-destructive"
                              )}>
                                {tenant.subscriptionStatus}
                              </span>
                            </div>
                          </div>
                          
                          {/* Actions */}
                          <div className="flex items-center justify-end gap-2 border-t border-secondary/50 md:border-t-0 pt-3 md:pt-0 mt-2 md:mt-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onShowDetails(tenant)}
                              className="bg-primary/10 text-primary hover:bg-primary hover:text-white font-bold text-xs"
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

                          <div className="flex items-center">
                            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                              ● ACTIVE
                            </span>
                          </div>

                          <div className="flex items-center justify-end gap-2">
                            {toggleTenantModule && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={updatingStatusFor === tenant.id}
                                onClick={async () => {
                                  if (confirm(`Remove unlocked add-on module ${mod}?`)) {
                                    setUpdatingStatusFor(tenant.id);
                                    try {
                                      await toggleTenantModule(tenant.id, tenant.unlockedModules, mod);
                                    } catch (e: any) {
                                      alert('Failed to remove module: ' + e.message);
                                    } finally {
                                      setUpdatingStatusFor(null);
                                    }
                                  }
                                }}
                                className="border-destructive/30 text-destructive hover:bg-destructive hover:text-white font-bold text-xs h-8 px-3"
                              >
                                Remove Add-on
                              </Button>
                            )}
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
                  ))}
                </div>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
