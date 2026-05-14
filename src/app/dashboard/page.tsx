"use client"

import React, { useState, useEffect } from 'react';
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
import { cn } from '@/lib/utils';

export default function TenantDashboard() {
  const { currentTenant, setCurrentTenant, allTenants } = useTenant();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setSelectedDate(new Date());
  }, []);

  if (!mounted) {
    return (
      <div className="flex-1 bg-background min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!currentTenant) {
    return (
      <div className="flex-1 flex flex-col p-6 bg-background">
        <div className="my-auto space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-headline font-black uppercase tracking-tighter">Choose Module</h1>
            <p className="text-muted-foreground text-sm">Select a business profile to enter the Katuwang Environment.</p>
          </div>
          <div className="grid gap-4">
            {allTenants.map((t, index) => (
              <Button 
                key={t.id} 
                variant="outline" 
                className={cn(
                  "h-20 flex justify-between items-center group hover:border-primary px-6 rounded-2xl w-full transition-all active:scale-95",
                  index % 2 === 0 ? "antigravity-float" : "antigravity-float-slow"
                )}
                style={{ animationDelay: `${index * 0.2}s` }}
                onClick={() => setCurrentTenant(t)}
              >
                <div className="text-left">
                  <div className="font-bold text-lg">{t.name}</div>
                  <div className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">{t.moduleType}</div>
                </div>
                <ChevronRight className="h-6 w-6 group-hover:text-primary transition-colors" />
              </Button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (currentTenant.subscriptionStatus === 'suspended') {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <Card className="w-full bg-card border-destructive overflow-hidden shadow-2xl antigravity-float">
          <div className="bg-destructive p-4 flex items-center justify-center">
            <AlertTriangle className="text-white h-12 w-12" />
          </div>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-headline font-black uppercase">Access Restricted</CardTitle>
            <CardDescription className="text-sm">Your subscription for <strong>{currentTenant.name}</strong> is currently suspended.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-secondary/30 p-4 rounded-xl space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-wider">Pricing Tier</span>
                <Badge variant="outline" className="border-primary text-primary">{currentTenant.pricingTier}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-wider">Required Payment</span>
                <span className="font-headline font-bold text-xl text-primary">₱{currentTenant.pricingTier === 'promo_99' ? '99.00' : '199.00'}</span>
              </div>
            </div>
            <Button className="w-full h-14 rounded-2xl font-bold text-lg gap-2 active:scale-95 transition-transform joy-glow">
              <CreditCard className="h-5 w-5" />
              Renew Access
            </Button>
            <Button variant="ghost" className="w-full text-xs font-bold" onClick={() => setCurrentTenant(null)}>
              SWITCH ACCOUNT
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const inventoryItems = [
    { name: "Premium Flour 25kg", stock: 12, min: 20 },
    { name: "Sugar Refined 50kg", stock: 5, min: 10 },
    { name: "Cooking Oil 5L", stock: 45, min: 15 },
  ];

  return (
    <div className="flex-1 flex flex-col bg-background pb-24">
      <header className="sticky top-0 z-50 bg-secondary/80 backdrop-blur-md border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary rounded-lg shadow-lg shadow-primary/20">
            <Box className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="font-headline font-bold text-sm leading-tight">{currentTenant.name}</h2>
            <p className="text-[9px] font-black uppercase tracking-widest text-primary">{currentTenant.moduleType}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl" onClick={() => setCurrentTenant(null)}>
            <LogOut className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl">
            <Menu className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="p-4 space-y-6">
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-headline font-bold">Quick Tally</h3>
            <Badge className="bg-chart-2/20 text-chart-2 border-chart-2/40 text-[9px] font-black uppercase">Live</Badge>
          </div>
          {selectedDate && <SnapDate date={selectedDate} onSelect={setSelectedDate} />}
        </section>

        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-primary/5 border-primary/20 shadow-none antigravity-float">
            <CardHeader className="p-3 pb-0">
              <CardDescription className="text-[9px] font-black uppercase tracking-wider text-primary">Sales</CardDescription>
              <CardTitle className="text-xl font-black">₱4.2k</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1">
              <div className="flex items-center gap-1 text-[9px] font-bold text-chart-2">
                <TrendingUp className="h-3 w-3" />
                <span>+12%</span>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-secondary/20 border-border shadow-none antigravity-float-slow">
            <CardHeader className="p-3 pb-0">
              <CardDescription className="text-[9px] font-black uppercase tracking-wider">Orders</CardDescription>
              <CardTitle className="text-xl font-black">24</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1 text-[9px] font-bold text-muted-foreground uppercase">
              Avg ₱175
            </CardContent>
          </Card>
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-headline font-bold">Inventory</h3>
            <Button variant="link" className="text-primary font-bold text-xs p-0">View All</Button>
          </div>
          <div className="grid gap-2">
            {inventoryItems.map((item, idx) => {
              const isLow = item.stock < item.min;
              return (
                <div key={idx} className="bg-card border rounded-xl p-3 flex items-center justify-between group active:scale-95 transition-transform">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-lg", isLow ? "bg-destructive/10 text-destructive" : "bg-chart-2/10 text-chart-2")}>
                      <Package className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold">{item.name}</h4>
                      <p className="text-[10px] text-muted-foreground">Min target: {item.min}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={cn("text-base font-headline font-black", isLow ? "text-destructive" : "text-foreground")}>
                      {item.stock}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-48px)] max-w-[382px] flex items-center justify-between bg-secondary/90 backdrop-blur-xl border border-primary/20 p-2 rounded-3xl shadow-2xl z-50">
          <Button variant="ghost" size="icon" className="h-12 w-12 rounded-2xl text-primary">
            <Box className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-12 w-12 rounded-2xl">
            <ShoppingCart className="h-5 w-5" />
          </Button>
          <div className="bg-primary p-4 rounded-2xl -mt-12 shadow-xl shadow-primary/30 active:scale-95 transition-transform cursor-pointer antigravity-float-fast">
            <UserPlus className="h-6 w-6 text-white" />
          </div>
          <Button variant="ghost" size="icon" className="h-12 w-12 rounded-2xl">
            <TrendingUp className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-12 w-12 rounded-2xl">
            <CreditCard className="h-5 w-5" />
          </Button>
        </div>
      </main>
    </div>
  );
}
