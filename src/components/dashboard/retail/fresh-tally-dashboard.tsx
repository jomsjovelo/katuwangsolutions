"use client"
import { usePinApproval } from '@/hooks/use-pin-approval';

import React, { useState } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { doc, collection, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getModuleTheme } from '@/lib/theme-utils';
import { useToast } from '@/hooks/use-toast';
import { 
  Leaf, 
  Plus, 
  ShoppingCart,
  Truck,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  TrendingDown
} from "lucide-react";

// Simplified dummy data for the dashboard UI since we don't have fresh-tally specific hooks yet
const dummyInventory = [
  { id: '1', batch: 'B-1001', item: 'Mangoes (Carabao)', supplier: 'Farm Coop', qty: 50, unit: 'kg', expiry: new Date(Date.now() + 86400000 * 2), status: 'sell-first' },
  { id: '2', batch: 'B-1002', item: 'Tomatoes', supplier: 'Baguio Farms', qty: 20, unit: 'kg', expiry: new Date(Date.now() + 86400000 * 5), status: 'fresh' },
  { id: '3', batch: 'B-1003', item: 'Cabbage', supplier: 'Baguio Farms', qty: 15, unit: 'kg', expiry: new Date(Date.now() + 86400000 * 7), status: 'fresh' },
];

export function FreshTallyDashboard() {
  const { currentTenant } = useTenant();
  const db = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const { requireApproval } = usePinApproval();

  const [activeTab, setActiveTab] = useState<'inventory' | 'suppliers' | 'waste'>('inventory');

  const themeColors = getModuleTheme('fresh-tally');

  const handleLogWaste = async (item: any) => {
    const approved = await requireApproval(`Log spoiled inventory for ${item.item}?`);
    if (!approved) return;
    toast({ title: "Waste Logged", description: "Spoiled items removed from inventory." });
  };

  const handleSell = (item: any) => {
    toast({ title: "Item Sold", description: `Deducted from batch ${item.batch}.` });
  };

  return (
    <div className="flex-1 bg-slate-50 min-h-screen pb-24">
      {/* Header */}
      <div className={`${themeColors.primaryBg} bg-gradient-to-br px-4 pt-12 pb-6 rounded-b-3xl shadow-sm text-white sticky top-0 z-40`}>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-black tracking-tight drop-shadow-sm flex items-center gap-2">
              <Leaf className="h-6 w-6" />
              Fresh Tally
            </h1>
            <p className="text-white/90 text-xs font-medium mt-1">Produce & Perishables</p>
          </div>
          <Button variant="secondary" size="icon" className="rounded-full shadow-md bg-white text-emerald-600 hover:bg-emerald-50">
            <Plus className="h-5 w-5" />
          </Button>
        </div>

        {/* Action Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          <Button 
            variant={activeTab === 'inventory' ? 'secondary' : 'ghost'} 
            className={`rounded-full text-xs font-bold px-4 ${activeTab === 'inventory' ? 'bg-white text-emerald-700 shadow-sm' : 'text-white hover:bg-white/20'}`}
            onClick={() => setActiveTab('inventory')}
          >
            <ShoppingCart className="w-4 h-4 mr-2" /> Produce
          </Button>
          <Button 
            variant={activeTab === 'suppliers' ? 'secondary' : 'ghost'} 
            className={`rounded-full text-xs font-bold px-4 ${activeTab === 'suppliers' ? 'bg-white text-emerald-700 shadow-sm' : 'text-white hover:bg-white/20'}`}
            onClick={() => setActiveTab('suppliers')}
          >
            <Truck className="w-4 h-4 mr-2" /> Deliveries
          </Button>
          <Button 
            variant={activeTab === 'waste' ? 'secondary' : 'ghost'} 
            className={`rounded-full text-xs font-bold px-4 ${activeTab === 'waste' ? 'bg-white text-emerald-700 shadow-sm' : 'text-white hover:bg-white/20'}`}
            onClick={() => setActiveTab('waste')}
          >
            <TrendingDown className="w-4 h-4 mr-2" /> Waste Log
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Sell First Alert */}
        <Card className="border-amber-200 shadow-sm bg-amber-50">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h3 className="font-bold text-amber-900 text-sm">Sell First Alert!</h3>
              <p className="text-xs text-amber-700 mt-1">
                You have 1 batch of Mangoes expiring in 2 days. Consider running a discount today.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Inventory List */}
        <div className="space-y-3">
          <h2 className="font-bold text-slate-800 px-1">Active Batches</h2>
          {dummyInventory.map(item => (
            <Card key={item.id} className="shadow-sm border-slate-200">
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-slate-800 flex items-center gap-2">
                      {item.item}
                      {item.status === 'sell-first' && (
                        <Badge variant="destructive" className="text-[10px] uppercase">Sell First</Badge>
                      )}
                    </h4>
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                      <Truck className="h-3 w-3" /> {item.supplier} ({item.batch})
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-lg text-emerald-600">{item.qty} {item.unit}</span>
                  </div>
                </div>
                
                <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100">
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-xs h-9" onClick={() => handleSell(item)}>
                    <CheckCircle2 className="h-4 w-4 mr-2" /> Sell
                  </Button>
                  <Button variant="outline" className="flex-1 text-xs h-9 border-amber-200 text-amber-700 hover:bg-amber-50" onClick={() => handleLogWaste(item)}>
                    <Trash2 className="h-4 w-4 mr-2" /> Log Waste
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
