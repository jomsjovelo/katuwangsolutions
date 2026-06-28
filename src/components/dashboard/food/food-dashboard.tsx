"use client"

import React, { useState } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { useCollection } from 'react-firebase-hooks/firestore';
import { collection, query, orderBy, doc, setDoc, serverTimestamp, limit, where } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { addFoodOrder, updateFoodOrderStatus, deleteFoodOrder } from '@/firebase/firestore/food-actions';
import { setupTables, openTable, settleTable, resetTable } from '@/firebase/firestore/table-actions';
import { useUser } from '@/firebase/auth/use-user';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getModuleTheme, useDynamicThemeColor } from '@/lib/theme-utils';
import { GCashQrModal } from '@/components/common/gcash-qr-modal';
import { ThermalReceiptPreview } from '@/components/common/thermal-receipt-preview';
import { TableSetupModal } from './table-setup-modal';
import { TableGrid } from './table-grid';
import { RunningBillDrawer } from './running-bill-drawer';
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
  ShoppingCart,
  Trash2,
  Receipt,
  Coins,
  AlertCircle
} from "lucide-react";

const PendingOrderCard = React.memo(({ order, theme, isOwner, handleDeleteOrder, moveOrder, isProcessing }: any) => (
  <div 
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
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-slate-500 uppercase">{order.tableNumber}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 rounded-full" onClick={() => handleDeleteOrder(order.id)}>
          <Trash2 className="h-3 w-3" />
        </Button>
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
));

const PreparingOrderCard = React.memo(({ order, isOwner, handleDeleteOrder, moveOrder, isProcessing }: any) => (
  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm opacity-90">
    <div className="bg-slate-100 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Badge className="font-black text-[10px] bg-slate-500 text-white hover:bg-slate-500">PREPARING</Badge>
        <span className="font-bold text-sm text-slate-800">#{order.orderNumber}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-slate-500 uppercase">{order.tableNumber}</span>
        {isOwner && (
          <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 rounded-full" onClick={() => handleDeleteOrder(order.id)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
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
));

export function FoodDashboard() {
  const { currentTenant } = useTenant();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState("pos");
  
  // Table Management State
  const [showTableSetup, setShowTableSetup] = useState(false);
  const [selectedTableObject, setSelectedTableObject] = useState<any | null>(null);
  const [showStartTable, setShowStartTable] = useState(false);
  const [guestCountInput, setGuestCountInput] = useState('');
  const [activeTableIdForOrder, setActiveTableIdForOrder] = useState<string | null>(null);
  
  const { user } = useUser();
  const isOwner = currentTenant?.ownerUid === user?.uid || (currentTenant as any)?.role === 'owner'; // Use profile rule if needed, fallback to owner check

  // Menu State
  const { menuItems, availableItems, loading: menuLoading, error: menuError } = useMenu();
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [newMenuName, setNewMenuName] = useState('');
  const [newMenuPrice, setNewMenuPrice] = useState('');

  // Cart State for POS
  const [cart, setCart] = useState<{ menuItemId: string; name: string; quantity: number; price: number; notes?: string }[]>([]);
  const [selectedTable, setSelectedTable] = useState('');
  
  const [showGCashQr, setShowGCashQr] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [completedSale, setCompletedSale] = useState<{
    items: any[];
    total: number;
    paymentMethod: string;
    saleId?: string;
  } | null>(null);

  const theme = getModuleTheme(currentTenant?.moduleType);
  useDynamicThemeColor(theme);

  const ordersQuery = React.useMemo(() => {
    return currentTenant && db
    ? query(collection(db, 'tenants', currentTenant.id, 'food_orders'),
        where('status', 'in', ['pending', 'preparing']),
        orderBy('createdAt', 'desc')) : null;
  }, [currentTenant?.id, db]);

  const [ordersSnapshot, ordersLoading, ordersError] = useCollection(ordersQuery as any);
  
  const orders = ordersSnapshot?.docs.map((doc: any) => ({
    id: doc.id,
    ...doc.data()
  })) || [];

  const tablesQuery = React.useMemo(() => {
    return currentTenant && db
      ? query(collection(db, 'tenants', currentTenant.id, 'tables'), orderBy('createdAt', 'asc'))
      : null;
  }, [currentTenant?.id, db]);

  const [tablesSnapshot] = useCollection(tablesQuery as any);
  const tables = tablesSnapshot?.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })) || [];

  React.useEffect(() => {
    if (ordersError) {
      console.error("Orders listener error:", ordersError);
      toast({ title: 'Connection Error', description: 'Failed to sync live orders.', variant: 'destructive' });
    }
    if (menuError) {
      console.error("Menu listener error:", menuError);
      toast({ title: 'Connection Error', description: 'Failed to sync menu items.', variant: 'destructive' });
    }
  }, [ordersError, menuError, toast]);

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

  const handleCheckout = async (paymentMethod: string = 'cash', gcashRef?: string) => {
    if (!currentTenant || cart.length === 0) return;
    try {
      setIsProcessing(true);
      setError(null);
      
      const isTableOrder = !!activeTableIdForOrder;
      const targetTable = tables.find((t: any) => t.id === activeTableIdForOrder);
      const tableName = isTableOrder ? targetTable?.name : (selectedTable.trim() || `Takeout ${new Date().getTime().toString().slice(-4)}`);
      
      const orderId = await addFoodOrder(
        currentTenant.id, 
        tableName || 'Unknown',
        cart,
        0, // discount
        undefined, // phone
        undefined, // referrer
        paymentMethod,
        gcashRef,
        activeTableIdForOrder || undefined
      );
      
      if (!isTableOrder) {
        // Complete sale info only for non-table orders (table orders settle later)
        setCompletedSale({
          items: [...cart],
          total: cartTotal,
          paymentMethod,
          saleId: orderId
        });
        setShowReceipt(true);
      } else {
        toast({ title: 'Added to Table', description: `Items added to ${tableName}.` });
        setActiveTab("tables"); // Go back to tables view
      }
      
      setCart([]);
      setSelectedTable('');
      setActiveTableIdForOrder(null);
    } catch (e: any) {
      setError(e.message);
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!currentTenant || !user) return;
    if (!window.confirm("Sigurado ka bang gusto mong i-delete/void ang order na ito?")) return;
    try {
      setIsVoiding(true);
      setError(null);
      await deleteFoodOrder(currentTenant.id, orderId, user.uid, user.displayName || user.email || 'Unknown User');
      
      if (completedSale?.saleId === orderId) {
        setShowReceipt(false);
        setCompletedSale(null);
      }
      toast({ title: 'Order Deleted', description: 'Order was successfully deleted.' });
    } catch (e: any) {
      setError(e.message);
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsVoiding(false);
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

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4 rounded-xl">
            <TabsTrigger value="tables" className="rounded-lg font-bold">Tables</TabsTrigger>
            <TabsTrigger value="pos" className="rounded-lg font-bold">POS (Take Order)</TabsTrigger>
            <TabsTrigger value="kds" className="rounded-lg font-bold">KDS (Kitchen)</TabsTrigger>
          </TabsList>

          {/* TABLES TAB */}
          <TabsContent value="tables" className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex justify-between items-center">
              <h3 className="font-black uppercase tracking-widest text-slate-500 text-xs">Dine-In Tables</h3>
              <Button size="sm" onClick={() => setShowTableSetup(true)} className="font-bold rounded-full">
                {tables.length === 0 ? "Setup Tables" : "+ Add Tables"}
              </Button>
            </div>
            
            <TableGrid 
              tables={tables} 
              theme={theme} 
              onTableClick={(table) => {
                if (table.status === 'available') {
                  setSelectedTableObject(table);
                  setShowStartTable(true);
                } else {
                  setSelectedTableObject(table);
                }
              }}
              onRename={async (table) => {
                const newName = window.prompt("Enter new name for table:", table.name);
                if (newName && newName.trim() !== table.name) {
                  const { renameTable } = await import('@/firebase/firestore/table-actions');
                  if (currentTenant) await renameTable(currentTenant.id, table.id, newName);
                }
              }}
              onDelete={async (table) => {
                if (window.confirm(`Are you sure you want to delete ${table.name}?`)) {
                  const { deleteTable } = await import('@/firebase/firestore/table-actions');
                  if (currentTenant) {
                    try {
                      await deleteTable(currentTenant.id, table.id);
                    } catch (e: any) {
                      toast({ title: "Error", description: e.message, variant: "destructive" });
                    }
                  }
                }
              }}
            />
          </TabsContent>

          {/* POS TAB */}
          <TabsContent value="pos" className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
            {activeTableIdForOrder && (
              <div className="bg-orange-100 border border-orange-300 p-3 rounded-xl flex justify-between items-center text-orange-800 font-bold text-sm mb-4">
                <span>Currently adding to: {tables.find((t: any) => t.id === activeTableIdForOrder)?.name}</span>
                <Button variant="ghost" size="sm" className="h-6 text-xs text-orange-600 hover:bg-orange-200" onClick={() => setActiveTableIdForOrder(null)}>Cancel</Button>
              </div>
            )}
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
                      <Label htmlFor="menu-name" className="text-xs">Item Name</Label>
                      <Input id="menu-name" name="menuName" placeholder="e.g. Pork Adobo" value={newMenuName} onChange={e => setNewMenuName(e.target.value)} />
                    </div>
                    <div className="w-24 space-y-1">
                      <Label htmlFor="menu-price" className="text-xs">Price (₱)</Label>
                      <Input id="menu-price" name="menuPrice" type="number" placeholder="60" value={newMenuPrice} onChange={e => setNewMenuPrice(e.target.value)} />
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
                <div className="p-3 bg-white">
                  {/* Custom Table / Name Input (Only if not using table grid) */}
                  {!activeTableIdForOrder && (
                    <div className="space-y-1">
                      <Label htmlFor="table-name" className="text-xs text-slate-500 font-bold uppercase tracking-widest">Table Name / Number</Label>
                      <Input 
                        id="table-name"
                        name="tableName"
                        placeholder="e.g. Takeout or Delivery" 
                        value={selectedTable} 
                        onChange={e => setSelectedTable(e.target.value)}
                      />
                    </div>
                  )}
                  <div className="flex gap-2 mt-3">
                    <Button 
                      className="h-12 flex-1 font-bold text-white shadow-md active:scale-95 border-none" 
                      style={{ backgroundColor: theme.primary }}
                      onClick={() => handleCheckout('cash')}
                      disabled={isProcessing}
                    >
                      {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Coins className="h-4 w-4 mr-1" /> Cash</>}
                    </Button>
                    <Button 
                      className="h-12 flex-1 font-bold text-white shadow-md active:scale-95 border-none" 
                      style={{ backgroundColor: '#007aff' }}
                      onClick={() => setShowGCashQr(true)}
                      disabled={isProcessing}
                    >
                      {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Receipt className="h-4 w-4 mr-1" /> GCash</>}
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            <GCashQrModal
              open={showGCashQr}
              onClose={() => setShowGCashQr(false)}
              totalAmount={cartTotal}
              tenantName={currentTenant?.name || "Katuwang Store"}
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
              storeName={currentTenant?.name || "Katuwang Food"}
              receiptType="KITCHEN ORDER SLIP / INVOICE"
              items={completedSale?.items || []}
              totalAmountPesos={(completedSale?.total || 0) / 100}
              paymentMethod={completedSale?.paymentMethod || "cash"}
              transactionId={completedSale?.saleId}
              theme={theme}
              onVoidSale={completedSale?.saleId ? () => handleDeleteOrder(completedSale.saleId!) : undefined}
              isVoiding={isVoiding}
            />
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
                <PendingOrderCard 
                  key={order.id} 
                  order={order}
                  theme={theme}
                  isOwner={isOwner}
                  handleDeleteOrder={handleDeleteOrder}
                  moveOrder={moveOrder}
                  isProcessing={isProcessing}
                />
              ))}

              {preparingOrders.map((order: any) => (
                <PreparingOrderCard 
                  key={order.id} 
                  order={order}
                  isOwner={isOwner}
                  handleDeleteOrder={handleDeleteOrder}
                  moveOrder={moveOrder}
                  isProcessing={isProcessing}
                />
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
      <TableSetupModal 
        open={showTableSetup} 
        onClose={() => setShowTableSetup(false)} 
        theme={theme}
        onSetup={async (names) => {
          if (currentTenant) await setupTables(currentTenant.id, names);
        }} 
      />

      <RunningBillDrawer 
        open={!!selectedTableObject && selectedTableObject.status !== 'available'}
        onClose={() => setSelectedTableObject(null)}
        table={selectedTableObject}
        orders={orders.filter((o: any) => selectedTableObject?.currentOrderIds?.includes(o.id))}
        theme={theme}
        tenantName={currentTenant?.name || "Katuwang Food"}
        onAddItems={() => {
          setActiveTableIdForOrder(selectedTableObject.id);
          setActiveTab("pos");
          setSelectedTableObject(null);
        }}
        onSettle={async (paymentMethod, gcashRef) => {
          if (!currentTenant || !selectedTableObject) return;
          const result = await settleTable(currentTenant.id, selectedTableObject.id, paymentMethod, gcashRef);
          setCompletedSale({
            items: result.items,
            total: result.total,
            paymentMethod,
            saleId: `table-${selectedTableObject.id}`
          });
          setShowReceipt(true);
        }}
        onReset={async () => {
          if (!currentTenant || !selectedTableObject) return;
          await resetTable(currentTenant.id, selectedTableObject.id);
        }}
      />
      
      {/* Quick Start Table Dialog */}
      {showStartTable && selectedTableObject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-lg font-black">Start {selectedTableObject.name}</h3>
            <div className="space-y-2">
              <Label>Number of Guests</Label>
              <Input type="number" value={guestCountInput} onChange={e => setGuestCountInput(e.target.value)} placeholder="e.g. 2" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowStartTable(false)}>Cancel</Button>
              <Button 
                style={{ backgroundColor: theme.primary }} 
                onClick={async () => {
                  if (currentTenant) {
                    await openTable(currentTenant.id, selectedTableObject.id, Number(guestCountInput) || 1);
                    setActiveTableIdForOrder(selectedTableObject.id);
                    setShowStartTable(false);
                    setGuestCountInput('');
                    setActiveTab("pos");
                  }
                }}
              >
                Open & Order
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
