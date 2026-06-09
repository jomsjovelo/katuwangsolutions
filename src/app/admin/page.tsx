"use client"

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth, signOut } from 'firebase/auth';
import { initializeFirebase } from '@/firebase';
import { useAdminTenants } from '@/hooks/use-admin-tenants';
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
  Trash2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const COLORS = ['#06B6D4', '#F97316', '#8B5CF6', '#10B981', '#3B82F6', '#EC4899', '#EAB308'];

export default function AdminKillSwitch() {
  const { tenants, updateTenantStatus, updateTenantPricing, annihilateTenant } = useAdminTenants();
  const [search, setSearch] = useState("");
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

  const filteredTenants = tenants.filter(t => 
    t.name.toLowerCase().includes(search.toLowerCase()) || 
    t.id.toLowerCase().includes(search.toLowerCase())
  );

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
              God Mode Dashboard
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

        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input 
            placeholder="Search Tenant UID or Name..." 
            className="pl-12 bg-secondary/30 border-secondary h-12 rounded-xl focus:ring-primary"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </header>

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

      <div className="bg-card rounded-2xl border border-secondary/50 overflow-hidden shadow-2xl">
        <Table>
          <TableHeader className="bg-secondary/40">
            <TableRow className="border-secondary hover:bg-transparent">
              <TableHead className="font-bold text-xs uppercase tracking-widest py-6">Tenant Identity</TableHead>
              <TableHead className="font-bold text-xs uppercase tracking-widest py-6">Module Type</TableHead>
              <TableHead className="font-bold text-xs uppercase tracking-widest py-6">Pricing Tier</TableHead>
              <TableHead className="font-bold text-xs uppercase tracking-widest py-6">Status</TableHead>
              <TableHead className="text-right font-bold text-xs uppercase tracking-widest py-6">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTenants.map((tenant) => (
              <TableRow key={tenant.id} className="border-secondary/30 hover:bg-secondary/10 transition-colors">
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-bold text-lg">{tenant.name}</span>
                    <span className="text-muted-foreground font-mono text-xs">{tenant.id}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" />
                    <span className="font-medium">{tenant.moduleType}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Badge variant={tenant.pricingTier === 'promo_99' ? 'outline' : 'default'} className={tenant.pricingTier === 'promo_99' ? 'border-chart-2 text-chart-2' : ''}>
                      {tenant.pricingTier}
                    </Badge>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                      onClick={() => updateTenantPricing(tenant.id, tenant.pricingTier === 'promo_99' ? 'standard_199' : 'promo_99')}
                    >
                      <DollarSign className="h-4 w-4" />
                    </Button>
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
                  <div className="flex items-center justify-end gap-3">
                    {tenant.subscriptionStatus === 'pending' && (
                      <Button 
                        size="sm" 
                        onClick={() => updateTenantStatus(tenant.id, 'active')}
                        className="bg-amber-500 hover:bg-amber-600 text-white font-bold h-8 px-4"
                      >
                        Approve
                      </Button>
                    )}
                    <div className="flex items-center gap-2 border-l pl-3 ml-1 border-secondary/50">
                      <span className={cn("text-[10px] font-bold uppercase tracking-wider w-16 text-right", 
                        tenant.subscriptionStatus === 'suspended' ? "text-destructive" : 
                        tenant.subscriptionStatus === 'pending' ? "text-amber-500" : "text-chart-2"
                      )}>
                        {tenant.subscriptionStatus === 'suspended' ? "KILLED" : tenant.subscriptionStatus}
                      </span>
                      <Switch 
                        checked={tenant.subscriptionStatus === 'active'}
                        onCheckedChange={(checked) => updateTenantStatus(tenant.id, checked ? 'active' : 'suspended')}
                        className="data-[state=checked]:bg-chart-2"
                      />
                    </div>
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
  );
}
