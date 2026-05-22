"use client"

import React, { useState } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { useCollection } from 'react-firebase-hooks/firestore';
import { collection, query, orderBy, getFirestore } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase/index';
import { addFoodOrder, updateFoodOrderStatus } from '@/firebase/firestore/food-actions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getModuleTheme, useDynamicThemeColor } from '@/lib/theme-utils';
import { 
  Coffee, 
  Utensils, 
  ChefHat, 
  CheckCircle2, 
  Plus, 
  Printer,
  Loader2,
  AlertCircle
} from "lucide-react";

export function FoodDashboard() {
  const { currentTenant } = useTenant();
  const db = getFirestore(initializeFirebase().app, 'katuwang');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dynamically resolve Katuwang industry theme based on active tenant's moduleType
  const theme = getModuleTheme(currentTenant?.moduleType);
  
  // Immersive dynamic status bar viewport tracking for PWA Android/iOS notch
  useDynamicThemeColor(theme);

  // Live stream of food orders
  const ordersQuery = currentTenant 
    ? query(
        collection(db, 'tenants', currentTenant.id, 'food_orders'),
        orderBy('createdAt', 'desc')
      )
    : null;

  const [ordersSnapshot, loading, hookError] = useCollection(ordersQuery as any);
  
  const orders = ordersSnapshot?.docs.map((doc: any) => ({
    id: doc.id,
    ...doc.data()
  })) || [];

  const pendingOrders = orders.filter((o: any) => o.status === 'pending');
  const preparingOrders = orders.filter((o: any) => o.status === 'preparing');

  const handleAddTestOrder = async () => {
    if (!currentTenant) return;
    try {
      setIsProcessing(true);
      setError(null);
      await addFoodOrder(
        currentTenant.id, 
        `Table ${Math.floor(Math.random() * 20) + 1}`, 
        [
          { menuItemId: 'test1', name: 'Iced Latte', quantity: 2, price: 15000, notes: 'Less ice' },
          { menuItemId: 'test2', name: 'Croissant', quantity: 1, price: 10000 }
        ],
        40000 // ₱400.00
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const moveOrder = async (id: string, newStatus: 'pending' | 'preparing' | 'served', amount?: number, tableNumber?: string) => {
    if (!currentTenant) return;
    try {
      setIsProcessing(true);
      setError(null);
      await updateFoodOrderStatus(currentTenant.id, id, newStatus, amount, tableNumber);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const isCafe = currentTenant?.moduleType === 'timpla-track';

  return (
    <div className="flex-1 flex flex-col bg-slate-50">
      <main className="p-4 space-y-6 pb-20">
        
        {/* Header Section styled dynamically to reflect Timpla, Bite or Handa branding */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div 
                className="p-2 rounded-xl transition-colors duration-300"
                style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
              >
                {isCafe ? <Coffee className="h-6 w-6" /> : <Utensils className="h-6 w-6" />}
              </div>
              <div>
                <h3 className="text-lg font-headline font-bold">POS & Kitchen</h3>
                <p className="text-xs text-muted-foreground font-medium">{theme.name} • {currentTenant?.name || 'Food Business'}</p>
              </div>
            </div>
            
            <Button 
              onClick={handleAddTestOrder} 
              disabled={isProcessing} 
              size="sm" 
              className="rounded-full shadow-md font-bold text-white border-none active:scale-95 transition-transform"
              style={{ backgroundColor: theme.primary }}
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />} 
              New Order
            </Button>
          </div>
        </section>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-xl border border-red-200 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Quick Stats styled dynamically */}
        <div className="grid grid-cols-2 gap-3">
          <Card 
            className="bg-white shadow-sm border transition-colors duration-300"
            style={{ borderColor: `${theme.primary}20` }}
          >
            <CardHeader className="p-3 pb-0">
              <CardDescription 
                className="text-[9px] font-black uppercase tracking-wider"
                style={{ color: theme.primary }}
              >
                Active Orders
              </CardDescription>
              <CardTitle className="text-xl font-black">{pendingOrders.length + preparingOrders.length}</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1 text-[9px] font-bold text-muted-foreground uppercase flex items-center gap-1">
              Requires Action
            </CardContent>
          </Card>
          <Card className="bg-white border-slate-200 shadow-sm">
            <CardHeader className="p-3 pb-0">
              <CardDescription className="text-[9px] font-black uppercase tracking-wider text-slate-500">Served Today</CardDescription>
              <CardTitle className="text-xl font-black">{orders.filter(o => o.status === 'served').length}</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1 text-[9px] font-bold text-muted-foreground uppercase flex items-center gap-1">
              Completed
            </CardContent>
          </Card>
        </div>

        {/* Kitchen Display System (KDS) */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <ChefHat className="h-5 w-5" style={{ color: theme.primary }} />
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">Kitchen Display (KDS)</h3>
          </div>

          <div className="grid gap-3">
            {/* New Tickets */}
            {loading && <div className="text-center py-4 text-xs text-slate-400">Loading KDS stream...</div>}
            
            {pendingOrders.map((order: any) => (
              <div 
                key={order.id} 
                className="bg-white border-2 rounded-xl overflow-hidden shadow-sm transition-all duration-300"
                style={{ borderColor: `${theme.primary}30` }}
              >
                <div 
                  className="px-3 py-2 border-b flex items-center justify-between"
                  style={{ backgroundColor: `${theme.primary}08` }}
                >
                  <div className="flex items-center gap-2">
                    <Badge 
                      className="font-black text-[10px] text-white border-transparent"
                      style={{ backgroundColor: theme.primary }}
                    >
                      NEW
                    </Badge>
                    <span className="font-bold text-sm text-slate-800">#{order.orderNumber}</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase">{order.tableNumber}</span>
                </div>
                <div className="p-3 space-y-2">
                  <ul className="space-y-1">
                    {order.items.map((item: any, i: any) => (
                      <li key={i} className="text-sm flex justify-between border-b border-slate-55 pb-1 last:border-0">
                        <span className="font-bold text-slate-700">{item.qty}x {item.name}</span>
                        {item.notes && <span className="text-[10px] text-red-500 italic block mt-0.5 font-bold">Note: {item.notes}</span>}
                      </li>
                    ))}
                  </ul>
                  <Button 
                    onClick={() => moveOrder(order.id, 'preparing')} 
                    disabled={isProcessing}
                    className="w-full h-10 mt-2 font-bold uppercase tracking-widest text-[10px] text-white border-none active:scale-95 transition-all"
                    style={{ 
                      backgroundColor: theme.primary, 
                      boxShadow: `0 4px 12px -2px ${theme.primary}30` 
                    }}
                  >
                    Start Preparing
                  </Button>
                </div>
              </div>
            ))}

            {/* Preparing Tickets */}
            {preparingOrders.map((order: any) => (
              <div key={order.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm opacity-90">
                <div className="bg-slate-100 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className="font-black text-[10px] bg-slate-500">PREPARING</Badge>
                    <span className="font-bold text-sm text-slate-800">#{order.orderNumber}</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase">{order.tableNumber}</span>
                </div>
                <div className="p-3 space-y-2">
                  <ul className="space-y-1">
                    {order.items.map((item: any, i: any) => (
                      <li key={i} className="text-sm flex justify-between">
                        <span className="font-medium text-slate-600">{item.qty}x {item.name}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" className="flex-1 h-10 font-bold uppercase tracking-widest text-[10px]">
                      <Printer className="h-3 w-3 mr-1" /> Print
                    </Button>
                    <Button 
                      onClick={() => moveOrder(order.id, 'served', order.totalAmount, order.tableNumber)} 
                      disabled={isProcessing}
                      className="flex-1 h-10 font-bold uppercase tracking-widest text-[10px] bg-emerald-500 hover:bg-emerald-600 text-white"
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Serve & Log Income
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            
            {!loading && pendingOrders.length === 0 && preparingOrders.length === 0 && (
              <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl text-slate-400">
                <Coffee className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-xs font-medium">No active orders</p>
              </div>
            )}
          </div>
        </section>

      </main>
    </div>
  );
}
