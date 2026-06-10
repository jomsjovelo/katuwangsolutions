"use client"

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth, signOut } from 'firebase/auth';
import { initializeFirebase } from '@/firebase';
import { useAdminTenants } from '@/hooks/use-admin-tenants';
import { useTenantStore, PricingTier } from '@/store/use-tenant-store';
import { AdminAnnouncements } from '@/components/admin/admin-announcements';
import { AdminBillingLogs } from '@/components/admin/admin-billing-logs';
import { AdminManagement } from '@/components/admin/admin-management';
import { AdminSettings } from '@/components/admin/admin-settings';
import { AdminTenantDetails } from '@/components/admin/admin-tenant-details';
import { AdminActivity } from '@/components/admin/admin-activity';
import { AdminTickets } from '@/components/admin/admin-tickets';
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
  Search, 
  ShieldAlert, 
  Zap, 
  DollarSign, 
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
  LifeBuoy
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const COLORS = ['#06B6D4', '#F97316', '#8B5CF6', '#10B981', '#3B82F6', '#EC4899', '#EAB308'];

export default function AdminKillSwitch() {
  const { tenants, updateTenantStatus, updateTenantPricing, updateNextBillingDate, annihilateTenant } = useAdminTenants();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"tenants" | "announcements" | "billing" | "activity" | "support" | "admins" | "settings">("tenants");
  const [selectedTenant, setSelectedTenant] = useState<any | null>(null);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      const { auth } = initializeFirebase();
      await signOut(auth);
      router.push('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handlePurgeData = async (tenant: any) => {
    const confirmName = window.prompt(`NUCLEAR OPTION: You are about to permanently delete all data for ${tenant.name}.\n\nType "${tenant.name}" to confirm:`);
    if (confirmName === tenant.name) {
      try {
        await annihilateTenant(tenant.id);
        alert('Tenant and all subcollections permanently wiped.');
      } catch (e: any) {
        alert('Failed to purge: ' + e.message);
      }
    } else if (confirmName !== null) {
      alert("Verification failed. Data was not purged.");
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const filteredTenants = tenants.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase()) || 
                          t.id.toLowerCase().includes(search.toLowerCase()) ||
                          (t.ownerEmail && t.ownerEmail.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = filterStatus === 'all' || t.subscriptionStatus === filterStatus;
    return matchesSearch && matchesStatus;
  });

  // Analytics Calculations
  const totalRevenue = tenants.reduce((acc, t) => {
    if (t.subscriptionStatus !== 'active') return acc;
    if (t.pricingTier === 'promo_99') return acc + 99;
    if (t.pricingTier === 'standard_199') return acc + 199;
    if (t.pricingTier === 'enterprise') return acc + 499;
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

      {/* Internal Navigation Tabs */}
      <div className="flex items-center gap-2 mb-8 border-b border-secondary/50 pb-4 overflow-x-auto snap-x scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
        <Button 
          variant={activeTab === 'tenants' ? 'default' : 'ghost'} 
          className="font-bold shrink-0 snap-start"
          onClick={() => setActiveTab('tenants')}
        >
          <Layers className="h-4 w-4 mr-2" /> Tenants
        </Button>
        <Button 
          variant={activeTab === 'announcements' ? 'default' : 'ghost'} 
          className="font-bold shrink-0 snap-start"
          onClick={() => setActiveTab('announcements')}
        >
          <Megaphone className="h-4 w-4 mr-2" /> Announcements
        </Button>
        <Button 
          variant={activeTab === 'billing' ? 'default' : 'ghost'} 
          className="font-bold shrink-0 snap-start"
          onClick={() => setActiveTab('billing')}
        >
          <Receipt className="h-4 w-4 mr-2" /> Billing Logs
        </Button>
        <Button 
          variant={activeTab === 'activity' ? 'default' : 'ghost'} 
          className="font-bold shrink-0 snap-start"
          onClick={() => setActiveTab('activity')}
        >
          <ShieldAlert className="h-4 w-4 mr-2" /> Audit Logs
        </Button>
        <Button 
          variant={activeTab === 'support' ? 'default' : 'ghost'} 
          className="font-bold shrink-0 snap-start"
          onClick={() => setActiveTab('support')}
        >
          <LifeBuoy className="h-4 w-4 mr-2" /> Support
        </Button>
        <Button 
          variant={activeTab === 'admins' ? 'default' : 'ghost'} 
          className="font-bold shrink-0 snap-start"
          onClick={() => setActiveTab('admins')}
        >
          <Users className="h-4 w-4 mr-2" /> Manage Admins
        </Button>
        <Button 
          variant={activeTab === 'settings' ? 'default' : 'ghost'} 
          className="font-bold shrink-0 snap-start"
          onClick={() => setActiveTab('settings')}
        >
          <Settings className="h-4 w-4 mr-2" /> System Config
        </Button>
      </div>

      {activeTab === 'tenants' && (
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
                <span>Active subscriptions only</span>
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
              <ResponsiveContainer width="100%" height="100%">
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
                    <select
                      value={tenant.pricingTier}
                      onChange={(e) => updateTenantPricing(tenant.id, e.target.value as PricingTier)}
                      className={cn(
                        "text-xs font-bold p-1.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-primary w-fit cursor-pointer",
                        tenant.pricingTier === 'promo_99' ? "bg-amber-50 text-amber-700 border-amber-200" :
                        tenant.pricingTier === 'enterprise' ? "bg-purple-50 text-purple-700 border-purple-200" :
                        "bg-slate-50 text-slate-700 border-slate-200"
                      )}
                    >
                      <option value="promo_99">Promo ₱99</option>
                      <option value="standard_199">Standard ₱199</option>
                      <option value="enterprise">Enterprise ₱499</option>
                    </select>
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
                      onClick={() => handlePurgeData(tenant)}
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
      />
        </>
      )}

      {activeTab === 'announcements' && (
        <AdminAnnouncements />
      )}

      {activeTab === 'billing' && (
        <AdminBillingLogs />
      )}

      {activeTab === 'activity' && (
        <AdminActivity />
      )}

      {activeTab === 'support' && (
        <AdminTickets />
      )}

      {activeTab === 'admins' && (
        <AdminManagement />
      )}

      {activeTab === 'settings' && (
        <AdminSettings />
      )}

      {activeTab !== 'tenants' && activeTab !== 'announcements' && activeTab !== 'billing' && activeTab !== 'activity' && activeTab !== 'support' && activeTab !== 'admins' && activeTab !== 'settings' && (
        <div className="flex flex-col items-center justify-center py-24 text-center bg-card rounded-2xl border border-secondary/50 border-dashed">
          <Settings className="h-12 w-12 text-slate-300 mb-4 animate-spin-slow" />
          <h2 className="text-xl font-bold text-slate-700">Module Under Construction</h2>
          <p className="text-slate-500 max-w-sm mt-2">The {activeTab} functionality is currently being built into the Command Center.</p>
        </div>
      )}
    </div>
  );
}
