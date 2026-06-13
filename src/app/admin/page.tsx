"use client"

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth, signOut } from 'firebase/auth';
import { initializeFirebase } from '@/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAdminTenants } from '@/hooks/use-admin-tenants';
import { useTenantStore, PricingTier } from '@/store/use-tenant-store';
import { useUser } from '@/firebase/auth/use-user';
import { loginUser } from '@/firebase/firestore/staff-actions';
import { FirebaseError } from 'firebase/app';
import { BrandLogo } from '@/components/ui/brand-logo';
import { AdminAnnouncements } from '@/components/admin/admin-announcements';
import { AdminBillingLogs } from '@/components/admin/admin-billing-logs';
import { AdminManagement } from '@/components/admin/admin-management';
import { AdminSettings } from '@/components/admin/admin-settings';
import { AdminTenantDetails } from '@/components/admin/admin-tenant-details';
import { AdminTickets } from '@/components/admin/admin-tickets';
import { AdminPnL } from '@/components/admin/admin-pnl';
import { AdminWithdrawals } from '@/components/admin/admin-withdrawals';
import { cn } from "@/lib/utils";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { 
  Search, 
  ShieldAlert, 
  Zap, 
  Power,
  BarChart3,
  Layers,
  PieChart as PieChartIcon,
  Trash2,
  Mail,
  Calendar,
  Megaphone,
  Receipt,
  Settings,
  Users,
  LifeBuoy,
  TrendingUp,
  AlertCircle,
  Loader2,
  Wallet
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const COLORS = ['#06B6D4', '#F97316', '#8B5CF6', '#10B981', '#3B82F6', '#EC4899', '#EAB308'];

interface SystemConfig {
  promoPrice?: number;
  standardPrice?: number;
  enterprisePrice?: number;
}

export default function AdminKillSwitch() {
  const { user, loading: authLoading } = useUser();
  const { tenants, loading, error, updateTenantStatus, updateTenantPricing, updateNextBillingDate, processTenantRenewal, toggleTenantModule, annihilateTenant } = useAdminTenants();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"tenants" | "pnl" | "announcements" | "billing" | "activity" | "support" | "admins" | "settings" | "withdrawals">("tenants");
  const [selectedTenant, setSelectedTenant] = useState<any | null>(null);
  const [mounted, setMounted] = useState(false);
  const [systemConfig, setSystemConfig] = useState<SystemConfig>({ promoPrice: 99, standardPrice: 199, enterprisePrice: 499 });

  // Admin Login States
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminLoginLoading, setAdminLoginLoading] = useState(false);
  const [adminAuthError, setAdminAuthError] = useState<string | null>(null);

  // Purge confirmation dialog state
  const [purgeDialogTenant, setPurgeDialogTenant] = useState<any | null>(null);
  const [purgeConfirmInput, setPurgeConfirmInput] = useState('');
  const [isPurging, setIsPurging] = useState(false);

  // Per-row pricing update state
  const [updatingPricingFor, setUpdatingPricingFor] = useState<string | null>(null);

  const router = useRouter();

  // Load system config to get live pricing for MRR calculation
  useEffect(() => {
    const { db } = initializeFirebase();
    const unsub = onSnapshot(doc(db, 'system', 'config'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setSystemConfig({
          promoPrice: data.promoPrice ?? 99,
          standardPrice: data.standardPrice ?? 199,
          enterprisePrice: data.enterprisePrice ?? 499,
        });
      }
    });
    return () => unsub();
  }, []);

  const handleSignOut = async () => {
    try {
      const { auth } = initializeFirebase();
      await signOut(auth);
      router.push('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Replaced window.prompt/alert with a Dialog
  const handlePurgeConfirm = async () => {
    if (!purgeDialogTenant || purgeConfirmInput !== purgeDialogTenant.name) return;
    setIsPurging(true);
    try {
      await annihilateTenant(purgeDialogTenant.id);
      setPurgeDialogTenant(null);
      setPurgeConfirmInput('');
    } catch (e: any) {
      alert('Failed to purge: ' + e.message);
    } finally {
      setIsPurging(false);
    }
  };

  const handlePricingChange = async (tenantId: string, tier: PricingTier) => {
    setUpdatingPricingFor(tenantId);
    try {
      await updateTenantPricing(tenantId, tier);
    } catch (e) {
      console.error(e);
    } finally {
      setUpdatingPricingFor(null);
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || authLoading) return null;

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl flex flex-col items-center">
          <BrandLogo theme="dark" showText={false} className="mb-6 !h-16 !w-16" />
          <h1 className="text-2xl font-black text-white uppercase tracking-widest mb-1">Command Center</h1>
          <p className="text-slate-400 text-sm mb-8 font-medium">System Owner Authentication</p>
          
          {adminAuthError && (
            <div className="w-full bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl mb-6 text-sm text-center font-medium">
              {adminAuthError}
            </div>
          )}

          <form className="w-full space-y-4" onSubmit={async (e) => {
            e.preventDefault();
            setAdminLoginLoading(true);
            setAdminAuthError(null);
            try {
              await loginUser(adminEmail, adminPassword);
              // Router will automatically refresh since AuthGuard handles routing logic
            } catch (error: any) {
              if (error instanceof FirebaseError && error.code === 'auth/invalid-credential') {
                setAdminAuthError('Invalid system credentials.');
              } else {
                setAdminAuthError(error.message || 'Authentication failed.');
              }
              setAdminLoginLoading(false);
            }
          }}>
            <Input 
              type="email" 
              placeholder="Admin Email" 
              value={adminEmail} 
              onChange={e => setAdminEmail(e.target.value)}
              className="bg-slate-950 border-slate-800 text-white h-12 rounded-xl focus:ring-cyan-500 focus:border-cyan-500"
              required 
            />
            <Input 
              type="password" 
              placeholder="••••••••" 
              value={adminPassword} 
              onChange={e => setAdminPassword(e.target.value)}
              className="bg-slate-950 border-slate-800 text-white h-12 rounded-xl focus:ring-cyan-500 focus:border-cyan-500"
              required 
            />
            <Button 
              type="submit" 
              className="w-full h-12 mt-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold tracking-widest uppercase rounded-xl transition-all"
              disabled={adminLoginLoading}
            >
              {adminLoginLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Enter Command Center'}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  const filteredTenants = tenants.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase()) || 
                          t.id.toLowerCase().includes(search.toLowerCase()) ||
                          (t.ownerEmail && t.ownerEmail.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = filterStatus === 'all' || t.subscriptionStatus === filterStatus;
    return matchesSearch && matchesStatus;
  });

  // MRR: reads from live system config, not hardcoded values
  const totalRevenue = tenants.reduce((acc, t) => {
    if (t.subscriptionStatus !== 'active') return acc;
    if (t.pricingTier === 'promo_99') return acc + (systemConfig.promoPrice ?? 99);
    if (t.pricingTier === 'standard_199') return acc + (systemConfig.standardPrice ?? 199);
    if (t.pricingTier === 'enterprise') return acc + (systemConfig.enterprisePrice ?? 499);
    return acc;
  }, 0);

  const moduleDistribution = tenants.reduce((acc, t) => {
    const mod = t.moduleType || 'Unknown';
    acc[mod] = (acc[mod] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const pieData = Object.keys(moduleDistribution).map((key) => ({
    name: key,
    value: moduleDistribution[key]
  })).sort((a, b) => b.value - a.value);

  const NAV_TABS = [
    { key: 'tenants', label: 'Tenants', icon: Layers },
    { key: 'pnl', label: 'P&L', icon: TrendingUp },
    { key: 'announcements', label: 'Announcements', icon: Megaphone },
    { key: 'billing', label: 'Billing Logs', icon: Receipt },
    { key: 'support', label: 'Support', icon: LifeBuoy },
    { key: 'withdrawals', label: 'Withdrawals', icon: Wallet },
    { key: 'admins', label: 'Manage Admins', icon: Users },
    { key: 'settings', label: 'System Config', icon: Settings },
  ] as const;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary rounded-lg shadow-lg shadow-primary/20">
              <ShieldAlert className="text-white h-6 w-6" />
            </div>
            <h1 className="text-4xl font-headline font-black tracking-tighter uppercase">
              Katuwang Command Center
            </h1>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground max-w-md">
              Master control and deep analytics for the Katuwang Ecosystem.
            </p>
            <Button variant="outline" size="sm" onClick={handleSignOut} className="w-fit border-destructive text-destructive hover:bg-destructive hover:text-white">
              <Power className="mr-2 h-4 w-4" /> Sign Out
            </Button>
          </div>
        </div>

        <div className="relative w-full md:w-96 mt-4 md:mt-0">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input 
            placeholder="Search Tenant UID or Name..." 
            className="pl-12 bg-secondary/30 border-secondary h-12 rounded-xl focus:ring-primary w-full text-base sm:text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 mb-8 border-b border-secondary/50 pb-4 overflow-x-auto snap-x scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
        {NAV_TABS.map(({ key, label, icon: Icon }) => (
          <Button
            key={key}
            variant={activeTab === key ? 'default' : 'ghost'}
            className="font-bold shrink-0 snap-start"
            onClick={() => setActiveTab(key)}
          >
            <Icon className="h-4 w-4 mr-2" /> {label}
          </Button>
        ))}
      </div>

      {/* ── TENANTS TAB ──────────────────────────────────────────────────── */}
      {activeTab === 'tenants' && (
        <>
          {/* Error State */}
          {error && (
            <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/30 text-destructive p-4 rounded-xl mb-6 text-sm font-medium">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span>Failed to load tenants: {error}. Please check your Firestore permissions.</span>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          {!loading && !error && (
            <>
              {/* Analytics Row */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-12">
                <div className="md:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="bg-gradient-to-br from-indigo-600 to-purple-600 text-white border-none shadow-xl">
                    <CardHeader className="pb-2">
                      <CardDescription className="font-bold uppercase tracking-widest text-[10px] text-white/70">MRR (Monthly Recurring Revenue)</CardDescription>
                      <CardTitle className="text-4xl font-headline font-black">₱{totalRevenue.toLocaleString()}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                        <Zap className="h-4 w-4" />
                        <span>Based on live tier pricing</span>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card className="bg-white border-secondary/50 shadow-md">
                    <CardHeader className="pb-2">
                      <CardDescription className="font-bold uppercase tracking-widest text-[10px] text-slate-400">Total Active Tenants</CardDescription>
                      <CardTitle className="text-4xl font-headline font-black text-slate-800">{tenants.filter(t => t.subscriptionStatus === 'active').length}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2 text-primary font-bold text-sm">
                        <BarChart3 className="h-4 w-4" />
                        <span>Across all modules</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="md:col-span-4 h-full">
                  <Card className="bg-white border-secondary/50 shadow-md h-full">
                    <CardHeader className="pb-0">
                      <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-500">
                        <PieChartIcon className="h-4 w-4" /> Module Popularity
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="h-[200px] w-full p-0">
                      <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={40}
                            outerRadius={70}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {pieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(val: number) => [val + ' tenants', 'Count']} />
                          <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '10px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Status Filters */}
              <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
                {['all', 'pending', 'active', 'suspended'].map((status) => (
                  <button
                    key={status}
                    onClick={() => setFilterStatus(status)}
                    className={cn(
                      "px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-colors whitespace-nowrap shrink-0 snap-start",
                      filterStatus === status 
                        ? "bg-primary text-primary-foreground shadow-md" 
                        : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                    )}
                  >
                    {status} ({status === 'all' ? tenants.length : tenants.filter(t => t.subscriptionStatus === status).length})
                  </button>
                ))}
              </div>

              {/* Tenants Table */}
              <div className="bg-card rounded-2xl border border-secondary/50 shadow-2xl overflow-hidden">
                <div className="overflow-x-auto min-w-full">
                  <Table>
                    <TableHeader className="bg-secondary/40">
                      <TableRow className="border-secondary hover:bg-transparent">
                        <TableHead className="font-bold text-xs uppercase tracking-widest py-6">Tenant Identity</TableHead>
                        <TableHead className="font-bold text-xs uppercase tracking-widest py-6">Module & Pricing</TableHead>
                        <TableHead className="font-bold text-xs uppercase tracking-widest py-6">Status</TableHead>
                        <TableHead className="text-right font-bold text-xs uppercase tracking-widest py-6">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTenants.map((tenant) => (
                        <TableRow key={tenant.id} className="border-secondary/30 hover:bg-secondary/10 transition-colors">
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <span className="font-bold text-lg">{tenant.name}</span>
                              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                                <span className="font-mono">{tenant.id}</span>
                                <span>&bull;</span>
                                <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {tenant.ownerEmail || 'No Email'}</span>
                              </div>
                              {tenant.createdAt && (
                                <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                  <Calendar className="h-3 w-3" />
                                  <span>Created: {new Date(typeof tenant.createdAt === 'object' && tenant.createdAt !== null && 'seconds' in tenant.createdAt ? (tenant.createdAt as any).seconds * 1000 : tenant.createdAt as any).toLocaleDateString()}</span>
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-2">
                                <Layers className="h-4 w-4 text-primary" />
                                <span className="font-bold text-sm uppercase tracking-wider">{tenant.moduleType}</span>
                              </div>
                              <div className="relative">
                                {updatingPricingFor === tenant.id && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-lg z-10">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                                  </div>
                                )}
                                <select
                                  value={tenant.pricingTier}
                                  onChange={(e) => handlePricingChange(tenant.id, e.target.value as PricingTier)}
                                  disabled={updatingPricingFor === tenant.id}
                                  className={cn(
                                    "text-xs font-bold p-1.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-primary w-fit cursor-pointer",
                                    tenant.pricingTier === 'promo_99' ? "bg-amber-50 text-amber-700 border-amber-200" :
                                    tenant.pricingTier === 'enterprise' ? "bg-purple-50 text-purple-700 border-purple-200" :
                                    "bg-slate-50 text-slate-700 border-slate-200"
                                  )}
                                >
                                  <option value="promo_99">Promo ₱{systemConfig.promoPrice ?? 99}</option>
                                  <option value="standard_199">Standard ₱{systemConfig.standardPrice ?? 199}</option>
                                  <option value="enterprise">Enterprise ₱{systemConfig.enterprisePrice ?? 499}</option>
                                </select>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              className={cn(
                                "font-bold px-3 py-1",
                                tenant.subscriptionStatus === 'active' ? "bg-chart-2/20 text-chart-2 border-chart-2/40" : 
                                tenant.subscriptionStatus === 'pending' ? "bg-amber-100 text-amber-700 border-amber-200" :
                                "bg-destructive/20 text-destructive border-destructive/40"
                              )}
                            >
                              {tenant.subscriptionStatus.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {tenant.subscriptionStatus === 'pending' && (
                                <Button 
                                  size="sm" 
                                  onClick={() => updateTenantStatus(tenant, 'active')}
                                  className="bg-amber-500 hover:bg-amber-600 text-white font-bold h-8 px-4"
                                >
                                  Approve
                                </Button>
                              )}
                              <div className="flex items-center gap-2 border-l pl-3 ml-1 border-secondary/50">
                                <span className={cn("text-[10px] font-bold uppercase tracking-wider w-16 text-right hidden sm:block", 
                                  tenant.subscriptionStatus === 'suspended' ? "text-destructive" : 
                                  tenant.subscriptionStatus === 'pending' ? "text-amber-500" : "text-chart-2"
                                )}>
                                  {tenant.subscriptionStatus === 'suspended' ? "KILLED" : tenant.subscriptionStatus}
                                </span>
                                <Switch 
                                  checked={tenant.subscriptionStatus === 'active'}
                                  onCheckedChange={(checked) => updateTenantStatus(tenant, checked ? 'active' : 'suspended')}
                                  className="data-[state=checked]:bg-chart-2"
                                />
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedTenant(tenant)}
                                className="ml-2 bg-secondary/30 hover:bg-primary/10 hover:text-primary font-bold text-xs"
                              >
                                Details
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setPurgeDialogTenant(tenant);
                                  setPurgeConfirmInput('');
                                }}
                                className="h-8 w-8 text-destructive hover:bg-destructive hover:text-white ml-2 transition-colors"
                                title="Purge Tenant Data"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
              
              <AdminTenantDetails 
                tenant={selectedTenant}
                isOpen={!!selectedTenant}
                onClose={() => setSelectedTenant(null)}
                updateNextBillingDate={updateNextBillingDate}
                processTenantRenewal={processTenantRenewal}
                toggleTenantModule={toggleTenantModule}
              />
            </>
          )}
        </>
      )}

      {/* ── P&L TAB ──────────────────────────────────────────────────────── */}
      {activeTab === 'pnl' && <AdminPnL />}

      {/* ── OTHER TABS ───────────────────────────────────────────────────── */}
      {activeTab === 'announcements' && <AdminAnnouncements />}
      {activeTab === 'billing' && <AdminBillingLogs />}
      {activeTab === 'support' && <AdminTickets />}
      {activeTab === 'withdrawals' && <AdminWithdrawals />}
      {activeTab === 'admins' && <AdminManagement />}
      {activeTab === 'settings' && <AdminSettings />}

      {/* ── PURGE CONFIRMATION DIALOG ─────────────────────────────────────── */}
      <Dialog open={!!purgeDialogTenant} onOpenChange={(open) => !open && setPurgeDialogTenant(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive font-black uppercase tracking-tight text-xl flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Nuclear Option
            </DialogTitle>
            <DialogDescription className="pt-2">
              You are about to permanently and irreversibly delete <strong className="text-slate-800">{purgeDialogTenant?.name}</strong> and all their data — orders, transactions, inventory, accounts, staff, and more.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm font-bold text-slate-700">
              Type <code className="bg-destructive/10 text-destructive px-1.5 py-0.5 rounded font-mono text-sm">{purgeDialogTenant?.name}</code> to confirm:
            </p>
            <Input
              value={purgeConfirmInput}
              onChange={(e) => setPurgeConfirmInput(e.target.value)}
              placeholder={purgeDialogTenant?.name}
              className="font-mono border-destructive/30 focus:ring-destructive"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPurgeDialogTenant(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handlePurgeConfirm}
              disabled={purgeConfirmInput !== purgeDialogTenant?.name || isPurging}
              className="font-bold"
            >
              {isPurging ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              {isPurging ? 'Purging...' : 'Permanently Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
