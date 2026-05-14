"use client"

import React, { useState } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { SnapDate } from '@/components/snap-date';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Box, 
  TrendingUp, 
  AlertTriangle, 
  Package, 
  UserPlus,
  ShoppingCart,
  Menu,
  ChevronRight,
  LogOut,
  CreditCard
} from "lucide-react";
import { Button } from '@/components/ui/button';

export default function TenantDashboard() {
  const { currentTenant, setCurrentTenant, allTenants } = useTenant();
  const [selectedDate, setSelectedDate] = useState(new Date());

  // If no tenant is selected, show a selector (simulating Dynamic Module Router)
  if (!currentTenant) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-headline font-black uppercase tracking-tighter">Choose Module</h1>
            <p className="text-muted-foreground">Select a business profile to enter the Katuwang Environment.</p>
          </div>
          <div className="grid gap-4">
            {allTenants.map(t => (
              <Button 
                key={t.id} 
                variant="outline" 
                className="h-20 flex justify-between items-center group hover:border-primary px-6 rounded-2xl"
                onClick={() => setCurrentTenant(t)}
              >
                <div className="text-left">
                  <div className="font-bold text-lg">{t.name}</div>
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-widest">{t.moduleType}</div>
                </div>
                <ChevronRight className="h-6 w-6 group-hover:text-primary transition-colors" />
              </Button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Hardened Billing Gateway check
  if (currentTenant.subscriptionStatus === 'suspended') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="w-full max-w-lg bg-card border-destructive overflow-hidden">
          <div className="bg-destructive p-4 flex items-center justify-center">
            <AlertTriangle className="text-white h-12 w-12" />
          </div>
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-headline font-black uppercase">Access Restricted</CardTitle>
            <CardDescription className="text-lg">Your subscription for <strong>{currentTenant.name}</strong> is currently suspended.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-secondary/30 p-4 rounded-xl space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold uppercase">Pricing Tier</span>
                <Badge variant="outline" className="border-primary text-primary">{currentTenant.pricingTier}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold uppercase">Required Payment</span>
                <span className="font-headline font-bold text-2xl text-primary">₱{currentTenant.pricingTier === 'promo_99' ? '99.00' : '199.00'}</span>
              </div>
            </div>
            <Button className="w-full h-14 rounded-2xl font-bold text-lg gap-2">
              <CreditCard className="h-5 w-5" />
              Renew via GCash / PayMaya
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setCurrentTenant(null)}>
              Switch Account
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Mock Universal Inventory Engine Data
  const inventoryItems = [
    { name: "Premium Flour 25kg", stock: 12, min: 20 },
    { name: "Sugar Refined 50kg", stock: 5, min: 10 },
    { name: "Cooking Oil 5L", stock: 45, min: 15 },
    { name: "Yeast Packet", stock: 2, min: 10 },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Dynamic Header */}
      <header className="sticky top-0 z-50 bg-secondary/80 backdrop-blur-md border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary rounded-lg">
            <Box className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="font-headline font-bold leading-tight">{currentTenant.name}</h2>
            <p className="text-[10px] font-black uppercase tracking-widest text-primary">{currentTenant.moduleType}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="touch-target-48 rounded-xl" onClick={() => setCurrentTenant(null)}>
            <LogOut className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="touch-target-48 rounded-xl md:hidden">
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-8 space-y-8 max-w-7xl mx-auto w-full pb-24 md:pb-8">
        {/* Katuwang SnapDate for Mobile Reports */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-headline font-bold">Quick Tally</h3>
            <Badge variant="secondary" className="px-3 py-1 font-bold">LIVE</Badge>
          </div>
          <SnapDate date={selectedDate} onSelect={setSelectedDate} />
        </section>

        {/* Sales Snapshot */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="p-4 pb-0">
              <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-primary">Daily Sales</CardDescription>
              <CardTitle className="text-2xl font-black">₱4,200</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <div className="flex items-center gap-1 text-[10px] font-bold text-chart-2">
                <TrendingUp className="h-3 w-3" />
                <span>+12%</span>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-secondary/20 border-border">
            <CardHeader className="p-4 pb-0">
              <CardDescription className="text-[10px] font-bold uppercase tracking-widest">Orders</CardDescription>
              <CardTitle className="text-2xl font-black">24</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2 text-[10px] font-medium text-muted-foreground">
              Average ₱175.00
            </CardContent>
          </Card>
          <Card className="bg-secondary/20 border-border">
            <CardHeader className="p-4 pb-0">
              <CardDescription className="text-[10px] font-bold uppercase tracking-widest">Customers</CardDescription>
              <CardTitle className="text-2xl font-black">18</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2 text-[10px] font-medium text-muted-foreground">
              4 New Today
            </CardContent>
          </Card>
          <Card className="bg-destructive/5 border-destructive/20">
            <CardHeader className="p-4 pb-0">
              <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-destructive">Shortage</CardDescription>
              <CardTitle className="text-2xl font-black text-destructive">3 Items</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <div className="flex items-center gap-1 text-[10px] font-bold text-destructive">
                <AlertTriangle className="h-3 w-3" />
                <span>Restock Required</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Universal Inventory Engine: Low Stock Alerts */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-headline font-bold">Inventory Shield</h3>
            <Button variant="link" className="text-primary font-bold">View All</Button>
          </div>
          <div className="grid gap-3">
            {inventoryItems.map((item, idx) => {
              const isLow = item.stock < item.min;
              return (
                <div key={idx} className="bg-card border rounded-2xl p-4 flex items-center justify-between group hover:border-primary transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={cn("p-3 rounded-xl", isLow ? "bg-destructive/10 text-destructive" : "bg-chart-2/10 text-chart-2")}>
                      <Package className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-bold">{item.name}</h4>
                      <p className="text-xs text-muted-foreground">Min stock target: {item.min}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={cn("text-lg font-headline font-black", isLow ? "text-destructive" : "text-foreground")}>
                      {item.stock}
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-widest opacity-50">Available</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Mobile Navigation Bar (Floating Action) */}
        <div className="fixed bottom-6 left-6 right-6 flex items-center justify-between bg-secondary/90 backdrop-blur-xl border border-primary/20 p-2 rounded-3xl shadow-2xl md:hidden">
          <Button variant="ghost" size="icon" className="touch-target-48 rounded-2xl text-primary">
            <Box className="h-6 w-6" />
          </Button>
          <Button variant="ghost" size="icon" className="touch-target-48 rounded-2xl">
            <ShoppingCart className="h-6 w-6" />
          </Button>
          <div className="bg-primary p-4 rounded-2xl -mt-12 shadow-xl shadow-primary/30 active:scale-95 transition-transform cursor-pointer">
            <UserPlus className="h-6 w-6 text-white" />
          </div>
          <Button variant="ghost" size="icon" className="touch-target-48 rounded-2xl">
            <TrendingUp className="h-6 w-6" />
          </Button>
          <Button variant="ghost" size="icon" className="touch-target-48 rounded-2xl">
            <Box className="h-6 w-6" />
          </Button>
        </div>
      </main>
    </div>
  );
}