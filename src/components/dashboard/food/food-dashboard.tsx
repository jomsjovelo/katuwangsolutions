"use client"

import React, { useState } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { useCollection } from 'react-firebase-hooks/firestore';
import { collection, query, orderBy, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { addFoodOrder, updateFoodOrderStatus } from '@/firebase/firestore/food-actions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from '@/lib/utils';
import { getModuleTheme, useDynamicThemeColor } from '@/lib/theme-utils';
import { useMenu } from '@/hooks/use-menu';
import { useToast } from '@/hooks/use-toast';
import { 
  Coffee, 
  Utensils, 
  ChefHat, 
  CheckCircle2, 
  Plus, 
  Printer,
  Loader2,
  AlertCircle,
  ShoppingCart,
  Trash2
} from "lucide-react";

export function FoodDashboard() {
  const { currentTenant } = useTenant();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Menu State
  const { menuItems, availableItems, loading: menuLoading } = useMenu();
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [newMenuName, setNewMenuName] = useState('');
  const [newMenuPrice, setNewMenuPrice] = useState('');

  // Cart State for POS
  const [cart, setCart] = useState<{ menuItemId: string; name: string; quantity: number; price: number; notes?: string }[]>([]);

  const theme = getModuleTheme(currentTenant?.moduleType);
  useDynamicThemeColor(theme);

  const ordersQuery = currentTenant && db
    ? query(
        collection(db, 'tenants', currentTenant.id, 'food_orders'),
        orderBy('createdAt', 'desc')
      )
    : null;

  const [ordersSnapshot, ordersLoading, hookError] = useCollection(ordersQuery as any);
  
  const orders = ordersSnapshot?.docs.map((doc: any) => ({
    id: doc.id,
    ...doc.data()
  })) || [];

  const pendingOrders = orders.filter((o: any) => o.status === 'pending');
  const preparingOrders = orders.filter((o: any) => o.status === 'preparing');

  // Add Item to Menu
  const handleAddMenuItem = async () => {
    if (!currentTenant || !db || !newMenuName || !newMenuPrice) return;
    setIsProcessing(true);
    try {
      const parsedPrice = parseFloat(newMenuPrice);
      if (isNaN(parsedPrice) || parsedPrice <= 0) {
        throw new Error("Ang presyo ay dapat valid na numero at higit sa zero.");
      }
      const price = Math.round(parsedPrice * 100); // Convert to centavos safely
      const menuRef = doc(collection(db, 'tenants', currentTenant.id, 'menu_items'));
      await setDoc(menuRef, {
        tenantId: currentTenant.id,
        name: newMenuName,
        price,
        category: 'General',
        isAvailable: true,
        imageColor: theme.primary,
        createdAt: serverTimestamp(),
      });
      setNewMenuName('');
      setNewMenuPrice('');
      setShowAddMenu(false);
      toast({ title: 'Item Added!', description: `${newMenuName} is now on the menu.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Add to Cart (POS)
  const addToCart = (item: any) => {
    setCart(prev => {
      const existing = prev.find(i => i.menuItemId === item.id);
      if (existing) {
        return prev.map(i => i.menuItemId === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { menuItemId: item.id, name: item.name, quantity: 1, price: item.price }];
    });
  };

  const removeFromCart = (menuItemId: string) => {
    setCart(prev => prev.filter(i => i.menuItemId !== menuItemId));
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handleCheckout = async () => {
    if (!currentTenant || cart.length === 0) return;
    try {
      setIsProcessing(true);
      setError(null);
      await addFoodOrder(
        currentTenant.id, 
        `Takeout ${new Date().getTime().toString().slice(-4)}`, // Time-based order identifier
        cart,
        cartTotal
      );
      setCart([]);
      toast({ title: 'Order Submitted!', description: 'Sent to the kitchen.' });
    } catch (e: any) {
      setError(e.message);
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
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
    <div className="flex-1 flex flex-col bg-slate-50 min-h-screen">
      <main className="p-4 space-y-4 pb-24">
        
        {/* Header Section */}
        <section className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div 
              className="p-2 rounded-xl transition-colors duration-300"
              style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
            >
              {isCafe ? <Coffee className="h-6 w-6" /> : <Utensils className="h-6 w-6" />}
            </div>
            <div>
              <h3 className="text-lg font-headline font-bold">{currentTenant?.name || 'Food Business'}</h3>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">{theme.name}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground font-black uppercase tracking-widest">Served Today</p>
            <p className="text-2xl font-black text-slate-800">{orders.filter(o => o.status === 'served').length}</p>
          </div>
        </section>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-xl border border-red-200 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <Tabs defaultValue="pos" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4 rounded-xl">
            <TabsTrigger value="pos" className="rounded-lg font-bold">POS (Take Order)</TabsTrigger>
            <TabsTrigger value="kds" className="rounded-lg font-bold">KDS (Kitchen)</TabsTrigger>
          </TabsList>

          {/* POS TAB */}
          <TabsContent value="pos" className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex justify-between items-center">
              <h3 className="font-black uppercase tracking-widest text-slate-500 text-xs">Menu Items</h3>
              <Button size="sm" variant="outline" className="h-8 text-xs font-bold rounded-full" onClick={() => setShowAddMenu(!showAddMenu)}>
                <Plus className="h-3 w-3 mr-1" /> Add Menu Item
              </Button>
            </div>

            {showAddMenu && (
              <Card className="shadow-sm border-slate-200 bg-white">
                <CardContent className="p-4 space-y-3">
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Item Name</Label>
                      <Input placeholder="e.g. Pork Adobo" value={newMenuName} onChange={e => setNewMenuName(e.target.value)} />
                    </div>
                    <div className="w-24 space-y-1">
                      <Label className="text-xs">Price (₱)</Label>
                      <Input type="number" placeholder="60" value={newMenuPrice} onChange={e => setNewMenuPrice(e.target.value)} />
                    </div>
                  </div>
                  <Button 
                    className="w-full h-8 text-xs font-bold text-white" 
                    style={{ backgroundColor: theme.primary }}
                    onClick={handleAddMenuItem}
                    disabled={isProcessing || !newMenuName || !newMenuPrice}
                  >
                    Save Item
                  </Button>
                </CardContent>
              </Card>
            )}

            {menuLoading ? (
              <div className="text-center py-8 text-sm text-slate-400">Loading menu...</div>
            ) : availableItems.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl text-slate-400">
                <Utensils className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-xs font-medium">Menu is empty. Add an item above.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {availableItems.map(item => (
                  <Button
                    key={item.id}
                    variant="outline"
                    className="h-24 flex flex-col items-center justify-center gap-1 border-slate-200 shadow-sm active:scale-95 transition-transform"
                    onClick={() => addToCart(item)}
                  >
                    <span className="font-bold text-sm truncate w-full text-center px-1">{item.name}</span>
                    <span className="text-xs font-black" style={{ color: theme.primary }}>₱{(item.price / 100).toLocaleString()}</span>
                  </Button>
                ))}
              </div>
            )}

            {/* Cart View */}
            {cart.length > 0 && (
              <Card className="fixed bottom-20 left-4 right-4 shadow-xl border-slate-200 z-50">
                <CardHeader className="p-3 bg-slate-50 border-b border-slate-100 flex flex-row items-center justify-between pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4" /> Current Order
                  </CardTitle>
                  <span className="font-black text-lg">₱{(cartTotal / 100).toLocaleString()}</span>
                </CardHeader>
                <CardContent className="p-0 max-h-40 overflow-y-auto">
                  <div className="divide-y divide-slate-100">
                    {cart.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-white">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">{item.quantity}x</span>
                          <span className="text-sm text-slate-700">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-sm">₱{((item.price * item.quantity) / 100).toLocaleString()}</span>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 rounded-full" onClick={() => removeFromCart(item.menuItemId)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
                <div className="p-3 bg-white border-t border-slate-100">
                  <Button 
                    className="w-full font-bold text-white shadow-md active:scale-95" 
                    style={{ backgroundColor: theme.primary }}
                    onClick={handleCheckout}
                    disabled={isProcessing}
                  >
                    {isProcessing ? "Processing..." : "Checkout & Send to Kitchen"}
                  </Button>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* KITCHEN TAB (Existing KDS) */}
          <TabsContent value="kds" className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <ChefHat className="h-5 w-5" style={{ color: theme.primary }} />
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">Kitchen Display</h3>
            </div>

            <div className="grid gap-3">
              {ordersLoading && <div className="text-center py-4 text-xs text-slate-400">Loading KDS stream...</div>}
              
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
                        <li key={i} className="text-sm flex justify-between border-b border-slate-50 pb-1 last:border-0">
                          <span className="font-bold text-slate-700">{item.quantity}x {item.name}</span>
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

              {preparingOrders.map((order: any) => (
                <div key={order.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm opacity-90">
                  <div className="bg-slate-100 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className="font-black text-[10px] bg-slate-500 text-white hover:bg-slate-500">PREPARING</Badge>
                      <span className="font-bold text-sm text-slate-800">#{order.orderNumber}</span>
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase">{order.tableNumber}</span>
                  </div>
                  <div className="p-3 space-y-2">
                    <ul className="space-y-1">
                      {order.items.map((item: any, i: any) => (
                        <li key={i} className="text-sm flex justify-between">
                          <span className="font-medium text-slate-600">{item.quantity}x {item.name}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="flex gap-2 pt-2">
                      <Button 
                        onClick={() => moveOrder(order.id, 'served', order.totalAmount, order.tableNumber)} 
                        disabled={isProcessing}
                        className="w-full h-10 font-bold uppercase tracking-widest text-[10px] bg-emerald-500 hover:bg-emerald-600 text-white"
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Mark Served
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              
              {!ordersLoading && pendingOrders.length === 0 && preparingOrders.length === 0 && (
                <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl text-slate-400">
                  <ChefHat className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p className="text-xs font-medium">No active orders in kitchen</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

      </main>
    </div>
  );
}
