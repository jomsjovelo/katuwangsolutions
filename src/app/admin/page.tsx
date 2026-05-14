"use client"

import React, { useState } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
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
  Layers
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function AdminKillSwitch() {
  const { allTenants, updateTenantStatus, updateTenantPricing } = useTenant();
  const [search, setSearch] = useState("");

  const filteredTenants = allTenants.filter(t => 
    t.name.toLowerCase().includes(search.toLowerCase()) || 
    t.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary rounded-lg shadow-lg shadow-primary/20">
              <ShieldAlert className="text-white h-6 w-6" />
            </div>
            <h1 className="text-4xl font-headline font-black tracking-tighter uppercase">
              Owner Control Panel
            </h1>
          </div>
          <p className="text-muted-foreground max-w-md">
            Master control for the Katuwang Isolation Shield. Manage tenant status, subscriptions, and global pricing tiers.
          </p>
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <Card className="bg-secondary/20 border-secondary">
          <CardHeader className="pb-2">
            <CardDescription className="font-bold uppercase tracking-widest text-[10px]">Total Revenue (EST)</CardDescription>
            <CardTitle className="text-3xl font-headline font-black">₱14,289.00</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-primary font-bold text-sm">
              <Zap className="h-4 w-4" />
              <span>+12% from last month</span>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-secondary/20 border-secondary">
          <CardHeader className="pb-2">
            <CardDescription className="font-bold uppercase tracking-widest text-[10px]">Active Tenants</CardDescription>
            <CardTitle className="text-3xl font-headline font-black">{allTenants.filter(t => t.subscriptionStatus === 'active').length}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-chart-2 font-bold text-sm">
              <BarChart3 className="h-4 w-4" />
              <span>94% Uptime Health</span>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-secondary/20 border-secondary">
          <CardHeader className="pb-2">
            <CardDescription className="font-bold uppercase tracking-widest text-[10px]">Suspended</CardDescription>
            <CardTitle className="text-3xl font-headline font-black text-destructive">{allTenants.filter(t => t.subscriptionStatus === 'suspended').length}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-muted-foreground font-bold text-sm">
              <Power className="h-4 w-4" />
              <span>Requires Manual Audit</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="bg-card rounded-2xl border border-secondary/50 overflow-hidden shadow-2xl">
        <Table>
          <TableHeader className="bg-secondary/40">
            <TableRow className="border-secondary hover:bg-transparent">
              <TableHead className="font-bold text-xs uppercase tracking-widest py-6">Tenant Identity</TableHead>
              <TableHead className="font-bold text-xs uppercase tracking-widest py-6">Module Type</TableHead>
              <TableHead className="font-bold text-xs uppercase tracking-widest py-6">Pricing Tier</TableHead>
              <TableHead className="font-bold text-xs uppercase tracking-widest py-6">Status</TableHead>
              <TableHead className="text-right font-bold text-xs uppercase tracking-widest py-6">Kill Switch</TableHead>
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
                      tenant.subscriptionStatus === 'active' ? "bg-chart-2/20 text-chart-2 border-chart-2/40" : "bg-destructive/20 text-destructive border-destructive/40"
                    )}
                  >
                    {tenant.subscriptionStatus.toUpperCase()}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-4">
                    <span className={cn("text-xs font-bold", tenant.subscriptionStatus === 'suspended' ? "text-destructive" : "text-chart-2")}>
                      {tenant.subscriptionStatus === 'suspended' ? "KILLED" : "ACTIVE"}
                    </span>
                    <Switch 
                      checked={tenant.subscriptionStatus === 'active'}
                      onCheckedChange={(checked) => updateTenantStatus(tenant.id, checked ? 'active' : 'suspended')}
                      className="data-[state=checked]:bg-chart-2"
                    />
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