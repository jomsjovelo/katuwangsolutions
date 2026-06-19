"use client"

import React, { useState } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { useCollection } from 'react-firebase-hooks/firestore';
import { collection, query, orderBy, doc, setDoc, serverTimestamp, limit } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { addFoodOrder, updateFoodOrderStatus } from '@/firebase/firestore/food-actions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from '@/lib/utils';
import { getModuleTheme, useDynamicThemeColor } from '@/lib/theme-utils';
import { useMenu } from '@/hooks/use-menu';
import { useIngredients } from '@/hooks/use-ingredients';
import { useToast } from '@/hooks/use-toast';
import { GCashQrModal } from '@/components/common/gcash-qr-modal';
import { ThermalReceiptPreview } from '@/components/common/thermal-receipt-preview';
import { 
  Coffee, 
  ChefHat, 
  CheckCircle2, 
  Plus, 
  Loader2,
  AlertCircle,
  ShoppingCart,
  Trash2,
  Beaker
} from "lucide-react";

export function TimplaDashboard() {
  const { currentTenant } = useTenant();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const theme = getModuleTheme(currentTenant?.moduleType);
  useDynamicThemeColor(theme);

  // Menu State
  const { menuItems, availableItems, loading: menuLoading, error: menuError } = useMenu();
  
  // Ingredients State
  const { activeIngredients, loading: ingredientsLoading, error: ingredientsError } = useIngredients();

  // Recipe Builder State
  const [showAddIngredient, setShowAddIngredient] = useState(false);
  const [newIngName, setNewIngName] = useState('');
  const [newIngUnit, setNewIngUnit] = useState('grams');
  const [newIngCostStr, setNewIngCostStr] = useState('');

  // Menu Builder State
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [newMenuName, setNewMenuName] = useState('');
  const [newMenuPrice, setNewMenuPrice] = useState('');
  const [newMenuRecipe, setNewMenuRecipe] = useState<{ingredientId: string, amount: number}[]>([]);
  const [selectedIngId, setSelectedIngId] = useState('');
  const [selectedIngAmount, setSelectedIngAmount] = useState('');

  // Cart State for POS
  const [cart, setCart] = useState<{ menuItemId: string; name: string; quantity: number; price: number; notes?: string }[]>([]);
  const [selectedTable, setSelectedTable] = useState('');

  // Loyalty Program
  const [customerPhone, setCustomerPhone] = useState('');
  const [pointsBalance, setPointsBalance] = useState(0);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [isFetchingPoints, setIsFetchingPoints] = useState(false);

  // Hardware & Digital Payments
  const [showGCashQr, setShowGCashQr] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [completedSale, setCompletedSale] = useState<{
    items: any[];
    total: number;
    paymentMethod: string;
    saleId?: string;
  } | null>(null);

  React.useEffect(() => {
    const fetchPoints = async () => {
      const cleanPhone = customerPhone.replace(/[^0-9+]/g, '');
      if (cleanPhone.length >= 10 && currentTenant) {
        setIsFetchingPoints(true);
        try {
          const { getCustomerPoints } = await import('@/firebase/firestore/loyalty-actions');
          const points = await getCustomerPoints(currentTenant.id, cleanPhone);
          setPointsBalance(points);
        } catch (e) {
          console.error("Failed to fetch points", e);
        } finally {
          setIsFetchingPoints(false);
        }
      } else {
        setPointsBalance(0);
        setIsRedeeming(false);
      }
    };
    
    const timer = setTimeout(fetchPoints, 500);
    return () => clearTimeout(timer);
  }, [customerPhone, currentTenant]);

  const ordersQuery = React.useMemo(() => {
    return currentTenant && db
    ? query(collection(db, 'tenants', currentTenant.id, 'food_orders'),
        orderBy('createdAt', 'desc'), limit(300)) : null;
  }, [currentTenant?.id, db]);

  const [ordersSnapshot, ordersLoading, ordersError] = useCollection(ordersQuery as any);
  
  const orders = ordersSnapshot?.docs.map((doc: any) => ({
    id: doc.id,
    ...doc.data()
  })) || [];

  React.useEffect(() => {
    if (ordersError) {
      console.error("Orders listener error:", ordersError);
      toast({ title: 'Connection Error', description: 'Failed to sync live orders.', variant: 'destructive' });
    }
    if (menuError) {
      console.error("Menu listener error:", menuError);
      toast({ title: 'Connection Error', description: 'Failed to sync menu items.', variant: 'destructive' });
    }
    if (ingredientsError) {
      console.error("Ingredients listener error:", ingredientsError);
      toast({ title: 'Connection Error', description: 'Failed to sync ingredients.', variant: 'destructive' });
    }
  }, [ordersError, menuError, ingredientsError, toast]);

  const pendingOrders = orders.filter((o: any) => o.status === 'pending');
  const preparingOrders = orders.filter((o: any) => o.status === 'preparing');

  // Add Raw Ingredient
  const handleAddIngredient = async () => {
    if (!currentTenant || !db || !newIngName || !newIngCostStr) return;
    setIsProcessing(true);
    try {
      const unitCost = parseInt(newIngCostStr); // centavos per unit
      const ingRef = doc(collection(db, 'tenants', currentTenant.id, 'ingredients'));
      await setDoc(ingRef, {
        tenantId: currentTenant.id,
        name: newIngName,
        unitOfMeasurement: newIngUnit,
        unitCost,
        currentStock: 0,
        isActive: true,
        createdAt: serverTimestamp(),
      });
      setNewIngName('');
      setNewIngCostStr('');
      setShowAddIngredient(false);
      toast({ title: 'Ingredient Added!', description: `${newIngName} added to raw materials.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Build Recipe Step
  const addIngredientToRecipe = () => {
    if (!selectedIngId || !selectedIngAmount) return;
    setNewMenuRecipe(prev => [...prev, { ingredientId: selectedIngId, amount: parseFloat(selectedIngAmount) }]);
    setSelectedIngId('');
    setSelectedIngAmount('');
  };

  // Add Menu Item with Recipe
  const handleAddMenuItem = async () => {
    if (!currentTenant || !db || !newMenuName || !newMenuPrice) return;
    setIsProcessing(true);
    try {
      const parsedPrice = parseFloat(newMenuPrice);
      if (isNaN(parsedPrice) || parsedPrice <= 0) {
        throw new Error("Ang presyo ay dapat valid na numero at higit sa zero.");
      }
      const price = Math.round(parsedPrice * 100); // Convert to centavos safely
      
      // Calculate cost per serving based on recipe
      let costPerServing = 0;
      for (const req of newMenuRecipe) {
        const ing = activeIngredients.find(i => i.id === req.ingredientId);
        if (ing) {
          costPerServing += (ing.unitCost * req.amount);
        }
      }

      const menuRef = doc(collection(db, 'tenants', currentTenant.id, 'menu_items'));
      await setDoc(menuRef, {
        tenantId: currentTenant.id,
        name: newMenuName,
        price,
        category: 'Drinks',
        isAvailable: true,
        imageColor: theme.primary,
        costPerServing,
        recipe: newMenuRecipe,
        createdAt: serverTimestamp(),
      });
      
      setNewMenuName('');
      setNewMenuPrice('');
      setNewMenuRecipe([]);
      setShowAddMenu(false);
      toast({ title: 'Item Added!', description: `${newMenuName} added with recipe tracking.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  // POS Add to Cart
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

  // POS Checkout
  const handleCheckout = async (paymentMethod: string = 'cash', gcashRef?: string) => {
    if (!currentTenant || cart.length === 0) return;
    try {
      setIsProcessing(true);
      setError(null);
      if (isRedeeming && customerPhone) {
        const { redeemPoints } = await import('@/firebase/firestore/loyalty-actions');
        await redeemPoints(currentTenant.id, customerPhone, 100);
      }
      
      const tableName = selectedTable.trim() || `Takeout ${new Date().getTime().toString().slice(-4)}`;
      const discount = isRedeeming ? 5000 : 0;
      const saleTotal = cartTotal - discount;
      
      const orderId = await addFoodOrder(
        currentTenant.id, 
        tableName,
        cart,
        discount,
        customerPhone || undefined,
        undefined, // referrerCode
        paymentMethod,
        gcashRef
      );

      setCompletedSale({
        items: cart,
        total: saleTotal,
        paymentMethod,
        saleId: orderId
      });
      setShowReceipt(true);

      setCart([]);
      setSelectedTable('');
      setCustomerPhone('');
      setIsRedeeming(false);
      toast({ title: 'Order Submitted!', description: 'Sent to the Barista.' });
    } catch (e: any) {
      setError(e.message);
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const moveOrder = async (order: any, newStatus: 'pending' | 'preparing' | 'served', amount?: number, tableNumber?: string) => {
    if (!currentTenant) return;
    try {
      setIsProcessing(true);
      setError(null);
      await updateFoodOrderStatus(currentTenant.id, order.id, newStatus, amount, tableNumber);
      if (newStatus === 'served' && order.customerPhone && amount && amount > 0) {
        try {
          const { awardPoints } = await import('@/firebase/firestore/loyalty-actions');
          await awardPoints(currentTenant.id, order.customerPhone, amount, order.referrerCode);
        } catch (e) {
          console.error("Failed to award points:", e);
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsProcessing(false);
    }
  };

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
              <Coffee className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-headline font-bold">{currentTenant?.name || 'Cafe'}</h3>
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
          <TabsList className="grid w-full grid-cols-3 mb-4 rounded-xl">
            <TabsTrigger value="pos" className="rounded-lg text-xs md:text-sm font-bold">POS</TabsTrigger>
            <TabsTrigger value="kds" className="rounded-lg text-xs md:text-sm font-bold">Barista</TabsTrigger>
            <TabsTrigger value="recipes" className="rounded-lg text-xs md:text-sm font-bold">Recipes</TabsTrigger>
          </TabsList>

          {/* POS TAB */}
          <TabsContent value="pos" className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
            {menuLoading ? (
              <div className="text-center py-8 text-sm text-slate-400">Loading menu...</div>
            ) : availableItems.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl text-slate-400">
                <Coffee className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-xs font-medium">Menu is empty. Add drinks in the Recipes tab.</p>
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
                      <div key={idx} className="p-3 bg-white space-y-2">
                        <div className="flex items-center justify-between">
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
                        <Input 
                          placeholder="Add note (e.g. Less ice)" 
                          className="h-7 text-[10px]" 
                          value={item.notes || ''} 
                          onChange={e => {
                            const newNotes = e.target.value;
                            setCart(prev => prev.map(i => i.menuItemId === item.menuItemId ? { ...i, notes: newNotes } : i));
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
                <div className="p-3 bg-white border-t border-slate-100 space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="table-name" className="text-xs text-slate-500 font-bold uppercase tracking-widest">Table Name / Number</Label>
                    <Input 
                      id="table-name"
                      name="tableName"
                      placeholder="e.g. Table 5, VIP A, or leave blank for Takeout" 
                      value={selectedTable} 
                      onChange={e => setSelectedTable(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                  
                  <div className="space-y-1 mt-2">
                    <Label htmlFor="customer-phone" className="text-xs">Customer Phone (For Points)</Label>
                    <Input id="customer-phone" placeholder="e.g. 09171234567" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="h-9" />
                    {customerPhone && pointsBalance >= 100 && cartTotal >= 5000 && (
                      <div className="flex items-center space-x-2 mt-2 bg-emerald-50 p-2 rounded-lg border border-emerald-100">
                        <Switch 
                          id="redeem-points-timpla" 
                          checked={isRedeeming}
                          onCheckedChange={setIsRedeeming}
                          className="data-[state=checked]:bg-emerald-500"
                        />
                        <Label htmlFor="redeem-points-timpla" className="text-xs font-bold text-emerald-800 cursor-pointer">
                          Redeem 100 pts for ₱50 Off
                        </Label>
                      </div>
                    )}
                  </div>
                  
                  {isRedeeming && (
                    <div className="flex justify-between items-center text-sm font-bold border-t pt-2 mt-2">
                      <span>Total after Discount:</span>
                      <span className="text-emerald-600">₱{((cartTotal - 5000) / 100).toLocaleString()}</span>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button 
                      className="flex-1 font-bold text-white shadow-md active:scale-95" 
                      style={{ backgroundColor: theme.primary }}
                      onClick={() => handleCheckout('cash')}
                      disabled={isProcessing}
                    >
                      {isProcessing ? "Processing..." : "Cash"}
                    </Button>
                    <Button 
                      className="flex-1 font-bold text-white shadow-md active:scale-95 bg-blue-500 hover:bg-blue-600" 
                      onClick={() => setShowGCashQr(true)}
                      disabled={isProcessing}
                    >
                      GCash
                    </Button>
                  </div>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* KITCHEN/BARISTA TAB */}
          <TabsContent value="kds" className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <ChefHat className="h-5 w-5" style={{ color: theme.primary }} />
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">Barista Queue</h3>
            </div>

            <div className="grid gap-3">
              {ordersLoading && <div className="text-center py-4 text-xs text-slate-400">Loading queue...</div>}
              
              {pendingOrders.map((order: any) => (
                <div key={order.id} className="bg-white border-2 rounded-xl overflow-hidden shadow-sm" style={{ borderColor: `${theme.primary}30` }}>
                  <div className="px-3 py-2 border-b flex items-center justify-between" style={{ backgroundColor: `${theme.primary}08` }}>
                    <div className="flex items-center gap-2">
                      <Badge className="font-black text-[10px] text-white border-transparent" style={{ backgroundColor: theme.primary }}>NEW</Badge>
                      <span className="font-bold text-sm text-slate-800">#{order.orderNumber}</span>
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    <ul className="space-y-1">
                      {order.items.map((item: any, i: any) => (
                        <li key={i} className="text-sm flex flex-col border-b border-slate-50 pb-1 last:border-0">
                          <div className="flex justify-between">
                            <span className="font-bold text-slate-700">{item.quantity}x {item.name}</span>
                          </div>
                          {item.notes && <span className="text-[10px] text-red-500 font-bold uppercase pl-4">Note: {item.notes}</span>}
                        </li>
                      ))}
                    </ul>
                    <Button 
                      onClick={() => moveOrder(order, 'preparing')} 
                      disabled={isProcessing}
                      className="w-full h-10 mt-2 font-bold uppercase tracking-widest text-[10px] text-white border-none active:scale-95"
                      style={{ backgroundColor: theme.primary, boxShadow: `0 4px 12px -2px ${theme.primary}30` }}
                    >
                      Make Drink
                    </Button>
                  </div>
                </div>
              ))}

              {preparingOrders.map((order: any) => (
                <div key={order.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm opacity-90">
                  <div className="bg-slate-100 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className="font-black text-[10px] bg-slate-500 text-white">MAKING</Badge>
                      <span className="font-bold text-sm text-slate-800">#{order.orderNumber}</span>
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    <ul className="space-y-1">
                      {order.items.map((item: any, i: any) => (
                        <li key={i} className="text-sm flex flex-col">
                          <div className="flex justify-between">
                            <span className="font-medium text-slate-600">{item.quantity}x {item.name}</span>
                          </div>
                          {item.notes && <span className="text-[10px] text-red-400 font-bold uppercase pl-4">Note: {item.notes}</span>}
                        </li>
                      ))}
                    </ul>
                    <Button 
                      onClick={() => moveOrder(order, 'served', order.totalAmount, order.tableNumber)} 
                      disabled={isProcessing}
                      className="w-full h-10 font-bold uppercase tracking-widest text-[10px] bg-emerald-500 hover:bg-emerald-600 text-white"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Mark Served
                    </Button>
                  </div>
                </div>
              ))}
              
              {!ordersLoading && pendingOrders.length === 0 && preparingOrders.length === 0 && (
                <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl text-slate-400">
                  <ChefHat className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p className="text-xs font-medium">No drinks in queue</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* RECIPES TAB */}
          <TabsContent value="recipes" className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <h3 className="font-black uppercase tracking-widest text-slate-500 text-xs flex items-center gap-1">
                <Beaker className="h-4 w-4" /> Ingredients
              </h3>
              <Button size="sm" variant="outline" className="h-8 text-xs font-bold rounded-full" onClick={() => setShowAddIngredient(!showAddIngredient)}>
                <Plus className="h-3 w-3 mr-1" /> Add Raw Material
              </Button>
            </div>

            {showAddIngredient && (
              <Card className="shadow-sm border-slate-200 bg-white">
                <CardContent className="p-4 space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="ing-name" className="text-xs">Ingredient Name</Label>
                    <Input id="ing-name" name="ingName" placeholder="e.g. Espresso Beans" value={newIngName} onChange={e => setNewIngName(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <Label htmlFor="ing-unit" className="text-xs">Unit (e.g. grams, pumps)</Label>
                      <Input id="ing-unit" name="ingUnit" placeholder="grams" value={newIngUnit} onChange={e => setNewIngUnit(e.target.value)} />
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label htmlFor="ing-cost" className="text-xs">Cost per unit (¢)</Label>
                      <Input id="ing-cost" name="ingCost" type="number" placeholder="50" value={newIngCostStr} onChange={e => setNewIngCostStr(e.target.value)} />
                      <p className="text-[9px] text-slate-400">Example: 50¢ per gram</p>
                    </div>
                  </div>
                  <Button 
                    className="w-full h-8 text-xs font-bold text-white bg-slate-800" 
                    onClick={handleAddIngredient}
                    disabled={isProcessing || !newIngName || !newIngCostStr}
                  >
                    Save Ingredient
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* List active ingredients */}
            {ingredientsLoading ? <p className="text-xs text-center text-slate-400">Loading...</p> : (
               <div className="flex flex-wrap gap-2">
                 {activeIngredients.map(ing => (
                   <Badge key={ing.id} variant="secondary" className="text-[10px] bg-slate-100 border-slate-200 text-slate-700">
                     {ing.name} ({ing.unitCost}¢/{ing.unitOfMeasurement})
                   </Badge>
                 ))}
               </div>
            )}

            <div className="flex justify-between items-center border-b border-slate-200 pb-2 mt-8">
              <h3 className="font-black uppercase tracking-widest text-slate-500 text-xs flex items-center gap-1">
                <Coffee className="h-4 w-4" /> Menu & Recipes
              </h3>
              <Button size="sm" variant="outline" className="h-8 text-xs font-bold rounded-full" onClick={() => setShowAddMenu(!showAddMenu)}>
                <Plus className="h-3 w-3 mr-1" /> Add Drink
              </Button>
            </div>

            {showAddMenu && (
              <Card className="shadow-sm border-slate-200 bg-white">
                <CardContent className="p-4 space-y-4">
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <Label htmlFor="menu-name" className="text-xs">Drink Name</Label>
                      <Input id="menu-name" name="menuName" placeholder="e.g. Iced Latte" value={newMenuName} onChange={e => setNewMenuName(e.target.value)} />
                    </div>
                    <div className="w-24 space-y-1">
                      <Label htmlFor="menu-price" className="text-xs">Price (₱)</Label>
                      <Input id="menu-price" name="menuPrice" type="number" placeholder="120" value={newMenuPrice} onChange={e => setNewMenuPrice(e.target.value)} />
                    </div>
                  </div>
                  
                  {/* Recipe Builder */}
                  <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <Label className="text-xs font-bold flex justify-between">
                      <span>Recipe Builder</span>
                      <span className="text-slate-500 font-normal">Optional</span>
                    </Label>
                    
                    <ul className="space-y-1 mb-2">
                      {newMenuRecipe.map((req, idx) => {
                        const ing = activeIngredients.find(i => i.id === req.ingredientId);
                        return (
                          <li key={idx} className="text-xs flex justify-between border-b border-slate-200 pb-1">
                            <span>{ing?.name}</span>
                            <span className="font-bold">{req.amount} {ing?.unitOfMeasurement}</span>
                          </li>
                        )
                      })}
                    </ul>

                    <div className="flex gap-2 items-end">
                      <div className="flex-1 space-y-1">
                        <select 
                          className="w-full border-slate-200 rounded-md border p-2 text-xs h-8"
                          value={selectedIngId}
                          onChange={(e) => setSelectedIngId(e.target.value)}
                        >
                          <option value="">Select Ingredient...</option>
                          {activeIngredients.map(ing => (
                            <option key={ing.id} value={ing.id}>{ing.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="w-16 space-y-1">
                        <Label htmlFor="recipe-qty" className="sr-only">Quantity</Label>
                        <Input 
                          id="recipe-qty"
                          name="recipeQty"
                          type="number" 
                          placeholder="Qty" 
                          className="h-8 text-xs" 
                          value={selectedIngAmount} 
                          onChange={(e) => setSelectedIngAmount(e.target.value)} 
                        />
                      </div>
                      <Button type="button" size="sm" variant="secondary" className="h-8" onClick={addIngredientToRecipe}>Add</Button>
                    </div>
                  </div>

                  <Button 
                    className="w-full h-8 text-xs font-bold text-white" 
                    style={{ backgroundColor: theme.primary }}
                    onClick={handleAddMenuItem}
                    disabled={isProcessing || !newMenuName || !newMenuPrice}
                  >
                    Save Drink to Menu
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* List Menu Items with computed margins */}
            <div className="space-y-2">
              {availableItems.map(item => (
                <div key={item.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-sm text-slate-800">{item.name}</h4>
                    <p className="text-xs text-slate-500">
                      Recipe: {item.recipe?.length ? `${item.recipe.length} ingredients` : 'No recipe'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-sm text-slate-800">₱{(item.price / 100).toLocaleString()}</p>
                    {item.costPerServing !== undefined && item.costPerServing > 0 && (
                      <p className="text-[10px] text-emerald-600 font-bold uppercase mt-0.5">
                        Cost: ₱{(item.costPerServing / 100).toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

          </TabsContent>
        </Tabs>

        <GCashQrModal
          open={showGCashQr}
          onClose={() => setShowGCashQr(false)}
          totalAmount={cartTotal - (isRedeeming ? 5000 : 0)}
          tenantName={currentTenant?.name || "Cafe"}
          paymentType="gcash"
          onPaymentVerified={async (paymentMethod, gcashRef) => {
            setShowGCashQr(false);
            await handleCheckout(paymentMethod, gcashRef);
          }}
          theme={theme}
        />
        
        <ThermalReceiptPreview
          open={showReceipt}
          onClose={() => setShowReceipt(false)}
          storeName={currentTenant?.name || "Cafe"}
          receiptType="ORDER TICKET"
          items={completedSale?.items || []}
          totalAmountPesos={(completedSale?.total || 0) / 100}
          paymentMethod={completedSale?.paymentMethod || "cash"}
          transactionId={completedSale?.saleId}
          theme={theme}
        />

      </main>
    </div>
  );
}
