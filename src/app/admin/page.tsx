"use client"

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth, signOut } from 'firebase/auth';
import { initializeFirebase } from '@/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAdminTenants } from '@/hooks/use-admin-tenants';
import { useAdminStats } from '@/hooks/use-admin-stats';
import { useVerifiedAdminAccess } from '@/hooks/use-verified-admin-access';
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
import { AdminOwnerRow, OwnerGroup, getLifecycleState } from '@/components/admin/admin-owner-row';
import { AdminStaffApprovals } from '@/components/admin/admin-staff-approvals';
import { AdminStaffDirectory } from '@/components/admin/admin-staff-directory';
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
  Wallet,
  ChevronLeft,
  ChevronRight,
  Database,
  UserCheck
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
  const adminAccess = useVerifiedAdminAccess(user, authLoading);
  const adminDataEnabled = adminAccess === 'allowed';
  const { tenants, loading, error, fetchTenants, searchTenants, hasNextPage, hasPrevPage, updateTenantStatus, updateModuleStatus, updateTenantPricing, updateModulePricingTier, updateNextBillingDate, processTenantRenewal, toggleTenantModule, approvePendingModuleRequest, annihilateTenant, pendingCount } = useAdminTenants(adminDataEnabled);
  const { stats, loading: statsLoading } = useAdminStats(adminDataEnabled);
  
  const [search, setSearch] = useState("");
  const [showPendingOnly, setShowPendingOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'expiring' | 'expired' | 'pending' | 'active'>('all');
  const [activeTab, setActiveTab] = useState<"dashboard" | "directory" | "staff_directory" | "pnl" | "announcements" | "billing" | "activity" | "support" | "admins" | "settings" | "withdrawals" | "staff">("dashboard");
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

  const groupedTenants = React.useMemo(() => {
    const groups: Record<string, OwnerGroup> = {};
    const filteredTenants = showPendingOnly ? tenants.filter(t => t.subscriptionStatus === 'pending') : tenants;
    
    filteredTenants.forEach(t => {
      const groupId = t.ownerEmail || t.ownerUid || t.id;
      if (!groups[groupId]) {
        groups[groupId] = {
          id: groupId,
          ownerEmail: t.ownerEmail || 'Unknown Email',
          primaryBusinessName: t.name,
          tenants: []
        };
      }
      groups[groupId].tenants.push(t);
    });
    return Object.values(groups);
  }, [tenants, showPendingOnly]);

  const filteredGroupedTenants = React.useMemo(() => {
    return groupedTenants.filter(group => {
      if (statusFilter === 'all' && !showPendingOnly) return true;
      if (showPendingOnly) {
        return group.tenants.some(t => t.subscriptionStatus === 'pending' || (t.pendingModuleRequests && t.pendingModuleRequests.length > 0));
      }
      
      return group.tenants.some(t => {
        const primaryState = getLifecycleState(t.nextBillingDate, t.subscriptionStatus, t.createdAt).state;
        
        if (statusFilter === 'expired') {
          if (primaryState === 'EXPIRED') return true;
          return (t.unlockedModules || []).some(mod => getLifecycleState(t.nextBillingDate, t.moduleStatuses?.[mod] || 'active', t.createdAt).state === 'EXPIRED');
        }
        if (statusFilter === 'expiring') {
          if (primaryState === 'DUE_TODAY' || primaryState === 'EXPIRING_SOON') return true;
          return (t.unlockedModules || []).some(mod => {
            const st = getLifecycleState(t.nextBillingDate, t.moduleStatuses?.[mod] || 'active', t.createdAt).state;
            return st === 'DUE_TODAY' || st === 'EXPIRING_SOON';
          });
        }
        if (statusFilter === 'pending') {
          return t.subscriptionStatus === 'pending' || (t.pendingModuleRequests && t.pendingModuleRequests.length > 0);
        }
        if (statusFilter === 'active') {
          return t.subscriptionStatus === 'active';
        }
        return true;
      });
    });
  }, [groupedTenants, statusFilter, showPendingOnly]);

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
            } catch (e) {
      const error = e as Error & { code?: string };
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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    searchTenants(search);
  };

  const totalRevenue = stats?.mrr || 0;
  const activeCount = stats?.activeTenants || 0;

  const pieData = [
    { name: 'Promo', value: stats?.promoCount || 0 },
    { name: 'Standard', value: stats?.standardCount || 0 },
    { name: 'Enterprise', value: stats?.enterpriseCount || 0 },
    { name: 'Free of Charge', value: stats?.focCount || 0 },
  ].filter(d => d.value > 0);

  const NAV_TABS = [
    { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { key: 'directory', label: 'Tenant Directory', icon: Database },
    { key: 'staff_directory', label: 'Staff Directory', icon: Users },
    { key: 'staff', label: 'Staff Approvals', icon: UserCheck },
    { key: 'pnl', label: 'P&L', icon: TrendingUp },
    { key: 'announcements', label: 'Announcements', icon: Megaphone },
    { key: 'billing', label: 'Billing Logs', icon: Receipt },
    { key: 'support', label: 'Support', icon: LifeBuoy },
    { key: 'withdrawals', label: 'Withdrawals', icon: Wallet },
    { key: 'admins', label: 'Manage Admins', icon: ShieldAlert },
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
          <form onSubmit={handleSearch}>
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input 
              placeholder="Search Email or Business Name..." 
              className="pl-12 bg-secondary/30 border-secondary h-12 rounded-xl focus:ring-primary w-full text-base sm:text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 mb-8 border-b border-secondary/50 pb-4 overflow-x-auto snap-x scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
        {NAV_TABS.map(({ key, label, icon: Icon }) => (
          <Button
            key={key}
            variant={activeTab === key ? 'default' : 'ghost'}
            className="font-bold shrink-0 snap-start"
            onClick={() => setActiveTab(key as any)}
          >
            <Icon className="h-4 w-4 mr-2" /> {label}
          </Button>
        ))}
      </div>

      {/* ── STAFF DIRECTORY TAB ────────────────────────────────────────────── */}
      {activeTab === 'staff_directory' && (
        <div className="mb-6">
          <AdminStaffDirectory />
        </div>
      )}

      {/* ── DASHBOARD TAB ──────────────────────────────────────────────────── */}
      {activeTab === 'dashboard' && (
        <>
          {/* Error State */}
          {error && (
            <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/30 text-destructive p-4 rounded-xl mb-6 text-sm font-medium">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span>Failed to load system stats: {error}. Please check your Firestore permissions.</span>
            </div>
          )}

          {/* Loading State */}
          {statsLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          {!statsLoading && !error && (
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
                      <CardTitle className="text-4xl font-headline font-black text-slate-800">{activeCount}</CardTitle>
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
            </>
          )}
        </>
      )}

      {/* ── DIRECTORY TAB ──────────────────────────────────────────────────── */}
      {activeTab === 'directory' && (
        <>
          {error && (
            <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/30 text-destructive p-4 rounded-xl mb-6 text-sm font-medium">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span>Failed to load tenants: {error}.</span>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          {!loading && !error && (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <Button
                  size="sm"
                  variant={statusFilter === 'all' ? 'default' : 'outline'}
                  onClick={() => setStatusFilter('all')}
                  className="font-bold text-xs rounded-xl"
                >
                  All ({groupedTenants.length})
                </Button>
                <Button
                  size="sm"
                  variant={statusFilter === 'expiring' ? 'default' : 'outline'}
                  onClick={() => setStatusFilter('expiring')}
                  className={cn(
                    "font-bold text-xs rounded-xl",
                    statusFilter === 'expiring' ? "bg-amber-500 hover:bg-amber-600 text-white" : "border-amber-300 text-amber-800 hover:bg-amber-50"
                  )}
                >
                  ⚠️ Expiring Soon / Due Today
                </Button>
                <Button
                  size="sm"
                  variant={statusFilter === 'expired' ? 'default' : 'outline'}
                  onClick={() => setStatusFilter('expired')}
                  className={cn(
                    "font-bold text-xs rounded-xl",
                    statusFilter === 'expired' ? "bg-rose-600 hover:bg-rose-700 text-white" : "border-rose-300 text-rose-800 hover:bg-rose-50"
                  )}
                >
                  🚨 Expired / Overdue
                </Button>
                <Button
                  size="sm"
                  variant={statusFilter === 'pending' ? 'default' : 'outline'}
                  onClick={() => setStatusFilter('pending')}
                  className={cn(
                    "font-bold text-xs rounded-xl",
                    statusFilter === 'pending' ? "bg-amber-600 text-white" : "border-amber-300 text-amber-800 hover:bg-amber-50"
                  )}
                >
                  ⏳ Pending Requests ({pendingCount})
                </Button>
                <Button
                  size="sm"
                  variant={statusFilter === 'active' ? 'default' : 'outline'}
                  onClick={() => setStatusFilter('active')}
                  className={cn(
                    "font-bold text-xs rounded-xl",
                    statusFilter === 'active' ? "bg-emerald-600 text-white" : "border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                  )}
                >
                  ✅ Active
                </Button>
              </div>

              <div className="bg-card rounded-2xl border border-secondary/50 shadow-2xl overflow-hidden mb-6">
                <div className="overflow-x-auto min-w-full">
                  <Table>
                    <TableHeader className="bg-secondary/40">
                      <TableRow className="border-secondary hover:bg-transparent">
                        <TableHead className="font-bold text-xs uppercase tracking-widest py-6">Owner Identity</TableHead>
                        <TableHead className="font-bold text-xs uppercase tracking-widest py-6 hidden md:table-cell">Subscribed Modules</TableHead>
                        <TableHead className="font-bold text-xs uppercase tracking-widest py-6 hidden md:table-cell">Overall Status</TableHead>
                        <TableHead className="text-right font-bold text-xs uppercase tracking-widest py-6">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredGroupedTenants.map((group) => (
                        <AdminOwnerRow 
                          key={group.id} 
                          group={group} 
                          updatingPricingFor={updatingPricingFor}
                          onUpdatePricing={handlePricingChange}
                          onUpdateModulePricing={updateModulePricingTier}
                          onUpdateStatus={updateTenantStatus}
                          onUpdateModuleStatus={updateModuleStatus}
                          onShowDetails={setSelectedTenant}
                          onPurge={(t) => { setPurgeDialogTenant(t); setPurgeConfirmInput(''); }}
                          toggleTenantModule={toggleTenantModule}
                          approvePendingModuleRequest={approvePendingModuleRequest}
                          onUpdateNextBillingDate={updateNextBillingDate}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
              
              <div className="flex items-center gap-4 mb-6">
                <Switch 
                  checked={showPendingOnly} 
                  onCheckedChange={setShowPendingOnly} 
                  id="pending-filter"
                />
                <label htmlFor="pending-filter" className="text-sm font-bold text-slate-700 cursor-pointer flex items-center gap-2">
                  Show Pending Only
                  {pendingCount > 0 && (
                    <Badge variant="destructive" className="ml-1 px-1.5 py-0 rounded-full text-[10px]">
                      {pendingCount}
                    </Badge>
                  )}
                </label>
              </div>

              <div className="flex items-center justify-between mb-12">
                <Button 
                  variant="outline" 
                  disabled={!hasPrevPage} 
                  onClick={() => fetchTenants('prev')}
                  className="font-bold"
                >
                  <ChevronLeft className="w-4 h-4 mr-2" /> Previous Page
                </Button>
                <div className="text-sm font-bold text-muted-foreground tracking-widest uppercase">
                  Showing {tenants.length} tenants
                </div>
                <Button 
                  variant="outline" 
                  disabled={!hasNextPage || tenants.length < 50} 
                  onClick={() => fetchTenants('next')}
                  className="font-bold"
                >
                  Next Page <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </div>

              <AdminTenantDetails 
                tenant={selectedTenant}
                isOpen={!!selectedTenant}
                onClose={() => setSelectedTenant(null)}
                updateNextBillingDate={updateNextBillingDate}
                processTenantRenewal={processTenantRenewal}
                toggleTenantModule={toggleTenantModule}
                onUpdateStatus={updateTenantStatus}
              />
            </>
          )}
        </>
      )}

      {/* ── P&L TAB ──────────────────────────────────────────────────────── */}
      {activeTab === 'pnl' && <AdminPnL />}

      {activeTab === 'staff' && <AdminStaffApprovals />}
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
