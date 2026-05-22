"use client"

// FIX S2-3: Static ES imports at module level replacing dynamic require() inside useEffect
import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { useTenant } from '@/app/lib/tenant-context';
import { useInventory } from '@/hooks/use-inventory';
import { useSyncStatus } from '@/hooks/use-sync-status';
import { useCart } from '@/hooks/use-cart';
import { processCheckout, addProduct, CartItem } from '@/firebase/firestore/retail-actions';
import { Card, CardContent } from "@/components/ui/card";
import { useUser } from '@/firebase/auth/use-user';
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getModuleTheme, useDynamicThemeColor } from '@/lib/theme-utils';
import { GCashQrModal } from './gcash-qr-modal';
import { BarcodeScannerModal } from './barcode-scanner-modal';
import { ThermalReceiptPreview } from './thermal-receipt-preview';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle,
  SheetDescription 
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { 
  ShoppingCart, 
  Package, 
  Plus, 
  Minus,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Search,
  Tag,
  Receipt,
  Trash2,
  Coins,
  Camera
} from "lucide-react";

import { KatuwangErrorBoundary } from '@/components/common/error-boundary';

export function BentaDashboard() {
  return (
    <KatuwangErrorBoundary>
      <BentaDashboardContent />
    </KatuwangErrorBoundary>
  );
}

function BentaDashboardContent() {
  const { user } = useUser();
  const [profile, setProfile] = useState<any>(null);
  const { currentTenant } = useTenant();
  const { isOnline, isSyncing, syncMessage } = useSyncStatus(currentTenant?.id);
  const { products, loading: inventoryLoading } = useInventory();
  const { cart, setCart, addToCart, removeFromCart, clearCart, totalCentavos, totalPesos, cartItemCount } = useCart();

  // Load user profile in real-time using static imports (no more dynamic require)
  useEffect(() => {
    if (!user) return;
    const { db } = initializeFirebase();
    const userRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userRef, (snap: any) => {
      if (snap.exists()) {
        setProfile(snap.data());
      }
    });
    return () => unsubscribe();
  }, [user]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  // Search and Category filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [categories, setCategories] = useState<string[]>(['All']);
  
  // Sheet & Dialog controls
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showGCashQr, setShowGCashQr] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [completedSale, setCompletedSale] = useState<{
    items: CartItem[];
    total: number;
    paymentMethod: string;
    saleId?: string;
  } | null>(null);

  // Dynamically resolve Katuwang industry theme based on active tenant's moduleType
  const theme = getModuleTheme(currentTenant?.moduleType);
  
  // Immersive dynamic status bar viewport tracking for PWA Android/iOS notch
  useDynamicThemeColor(theme);

  // Dynamically compute unique categories from database products
  useEffect(() => {
    if (products && products.length > 0) {
      const cats = Array.from(new Set(products.map((p: any) => p.category || 'General'))) as string[];
      setCategories(['All', ...cats]);
    }
  }, [products]);

  // Quick "Add Fake Product" for testing purposes
  const handleAddTestProduct = async () => {
    if (!currentTenant) return;
    try {
      setIsProcessing(true);
      const testNames = [
        'Kopiko Brown Coffee', 'Sardinas (Ligo)', 'Lucky Me Pancit Canton', 
        'San Miguel Pale Pilsen', 'Safeguard White Soap', 'Datu Puti Toyo',
        'Beras (Sinandomeng)', 'SkyFlakes Crackers', 'Coca-Cola 1.5L'
      ];
      const categoriesList = ['Beverage', 'Canned Goods', 'Noodles', 'Alcohol', 'Hygiene', 'Condiments', 'Rice', 'Snacks'];
      const randomIndex = Math.floor(Math.random() * testNames.length);
      
      await addProduct(currentTenant.id, {
        name: testNames[randomIndex],
        category: categoriesList[randomIndex % categoriesList.length],
        currentStock: 50 + Math.floor(Math.random() * 50),
        minStock: 10,
        costPrice: 2000 + Math.floor(Math.random() * 2000), // in centavos
        salePrice: 3500 + Math.floor(Math.random() * 3000), // in centavos
        unit: 'pcs'
      });
      setSuccessMsg("Test product added directly to Firebase!");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCheckout = async (paymentMethod: string = 'cash', gcashRef?: string) => {
    if (!currentTenant || cart.length === 0) return;
    try {
      setIsProcessing(true);
      setError(null);
      
      // Execute safe atomic transaction in Firestore — returns real Firestore document ID
      const saleId = await processCheckout(currentTenant.id, cart, totalCentavos, paymentMethod, gcashRef);
      
      // Store transaction data for receipt representation with the REAL Firestore ID
      setCompletedSale({
        items: [...cart],
        total: totalCentavos,
        paymentMethod,
        saleId, // Always the real Firestore document ID — never Math.random()
      });
      
      setCart([]); // Clear cart
      setShowMobileCart(false);
      setShowReceipt(true); // Launch final receipt modal
      
      setSuccessMsg("Benta Kumpleto! Stock deducted automatically.");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Debounce search input to maintain responsive keystrokes
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 120);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Filter products based on category search and query using memoized selector
  const filteredProducts = React.useMemo(() => {
    return products.filter((product: any) => {
      const query = debouncedSearchQuery.toLowerCase();
      const matchesSearch = product.name.toLowerCase().includes(query) || 
                            (product.category && product.category.toLowerCase().includes(query));
      const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, debouncedSearchQuery, selectedCategory]);

  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-h-screen pb-24 lg:pb-6">
      <main className="p-4 space-y-4 max-w-7xl mx-auto w-full">
        
        {/* Dynamic Header Panel mapped to active module brand */}
        <section 
          className={cn(
            "bg-gradient-to-r rounded-[24px] p-5 text-white shadow-lg relative overflow-hidden transition-all duration-500",
            theme.primaryBg,
            theme.glowClass
          )}
        >
          <div className="absolute right-0 top-0 opacity-10 transform translate-x-6 -translate-y-6">
            <ShoppingCart className="h-48 w-48" />
          </div>
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="bg-white/20 text-white font-headline font-extrabold text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full shadow-sm backdrop-blur-sm">
                  {theme.name} Engine
                </span>
                
                {/* Real-time Connection & Firestore Offline Sync Status Indicators */}
                <div 
                  className={cn(
                    "flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-sm backdrop-blur-sm transition-all duration-300",
                    !isOnline 
                      ? "bg-amber-500/20 text-amber-200 border border-amber-500/30" 
                      : isSyncing 
                        ? "bg-indigo-500/20 text-indigo-200 border border-indigo-500/30 animate-pulse" 
                        : "bg-emerald-500/20 text-emerald-200 border border-emerald-500/30"
                  )}
                >
                  <span className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    !isOnline 
                      ? "bg-amber-400" 
                      : isSyncing 
                        ? "bg-indigo-400" 
                        : "bg-emerald-400"
                  )} />
                  {syncMessage}
                </div>
              </div>
              <h2 className="text-2xl font-black font-headline tracking-tight mt-1.5">POS Terminal</h2>
              <p className="text-xs text-white/90 font-medium">{theme.tagline}</p>
            </div>
            
            {/* FIX S2-6: Only show test button in development mode to prevent inventory pollution in production */}
            {process.env.NODE_ENV === 'development' && profile?.role !== 'staff' && (
              <div className="flex items-center gap-2">
                <Button 
                  onClick={handleAddTestProduct} 
                  disabled={isProcessing} 
                  size="sm" 
                  className={cn(
                    "rounded-xl font-bold border-none shadow-md active:scale-95 transition-transform duration-200",
                    theme.secondaryBg,
                    theme.secondaryText
                  )}
                  style={{ boxShadow: `0 8px 16px -4px ${theme.secondary}40` }}
                >
                  {isProcessing ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  ) : (
                    <Plus className="h-4 w-4 mr-1.5" />
                  )}
                  Magdagdag ng Item (Test)
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* Global Notifications */}
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-xl border border-red-200 text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-50 text-emerald-600 p-3 rounded-xl border border-emerald-200 text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            {successMsg}
          </div>
        )}

        {/* Search & Categories Pill Bar */}
        <section className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Maghanap ng produkto o kategorya..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-slate-300 placeholder:text-slate-400"
              />
            </div>
            <Button
              onClick={() => setShowScanner(true)}
              variant="outline"
              className="h-[46px] w-[46px] p-0 rounded-xl border-slate-200 hover:bg-slate-100 flex items-center justify-center cursor-pointer flex-shrink-0"
            >
              <Camera className="h-5 w-5 text-slate-500" />
            </Button>
          </div>

          {/* Horizontal Scrolling Categories */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
            {categories.map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border tap-target duration-150",
                    isSelected
                      ? "text-white shadow-md border-transparent"
                      : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
                  )}
                  style={isSelected ? { 
                    backgroundColor: theme.primary, 
                    borderColor: theme.primary,
                    boxShadow: `0 8px 16px -4px ${theme.primary}40`
                  } : {}}
                >
                  {cat === 'All' ? 'Lahat ng Kategorya' : cat}
                </button>
              );
            })}
          </div>
        </section>

        {/* Grid POS Terminal Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          
          {/* Left Grid: Products Panel */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Mga Produkto</span>
              <span className="text-[10px] font-bold text-slate-400">{filteredProducts.length} items found</span>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {inventoryLoading ? (
                <div className="col-span-full flex flex-col items-center justify-center py-20 bg-white border border-slate-100 rounded-2xl">
                  <Loader2 className="h-8 w-8 animate-spin text-slate-400" style={{ color: theme.primary }} />
                  <p className="text-xs text-slate-400 mt-2 font-bold">Kinukuha ang Inventory...</p>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="col-span-full text-center py-16 bg-white border border-slate-100 rounded-2xl">
                  <Package className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                  <h4 className="text-sm font-bold text-slate-800">Walang Nakitang Produkto</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                    Subukang baguhin ang iyong filter o magdagdag ng panibagong test item sa itaas!
                  </p>
                </div>
              ) : (
                filteredProducts.map((product: any) => {
                  const outOfStock = product.currentStock <= 0;
                  const cartItem = cart.find(item => item.productId === product.id);
                  const cartQty = cartItem ? cartItem.quantity : 0;
                  
                  return (
                    <div 
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className={cn(
                        "bg-white border-2 rounded-2xl p-4 flex flex-col items-center text-center transition-all cursor-pointer relative select-none tap-target",
                        outOfStock 
                          ? "opacity-40 border-slate-100 grayscale cursor-not-allowed" 
                          : "border-slate-100 hover:border-slate-200 shadow-sm"
                      )}
                      style={(!outOfStock && cartQty > 0) ? { borderColor: `${theme.primary}60` } : {}}
                    >
                      {/* Cart Quantity Indicator Badge with Dynamic Secondary Color */}
                      {cartQty > 0 && (
                        <span 
                          className="absolute top-2 right-2 text-[10px] font-black h-5 min-w-5 px-1.5 rounded-full flex items-center justify-center border-2 border-white animate-in scale-in"
                          style={{ backgroundColor: theme.secondary, color: theme.secondaryText }}
                        >
                          {cartQty}
                        </span>
                      )}

                      <div 
                        className={cn(
                          "h-12 w-12 rounded-2xl flex items-center justify-center mb-3 transition-colors duration-300"
                        )}
                        style={outOfStock ? { backgroundColor: '#f1f5f9', color: '#94a3b8' } : { 
                          backgroundColor: `${theme.primary}15`, 
                          color: theme.primary 
                        }}
                      >
                        <Package className="h-6 w-6" />
                      </div>
                      
                      <h4 className="font-extrabold text-xs text-slate-800 leading-tight mb-0.5 line-clamp-2 min-h-[2rem]">
                        {product.name}
                      </h4>
                      
                      <div className="flex items-center gap-1.5 mt-1 mb-3">
                        <Tag className="h-3 w-3 text-slate-400" />
                        <span className="text-[10px] font-black uppercase text-slate-400">
                          {product.category || 'General'}
                        </span>
                      </div>

                      <div className="w-full border-t border-slate-50 pt-2 flex items-center justify-between mt-auto">
                        <div className="text-left">
                          <p className="text-[9px] font-bold text-slate-400 leading-none">Presyo</p>
                          <span className="text-xs font-black text-slate-800">
                            ₱{(product.salePrice / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <Badge 
                          variant={outOfStock ? "secondary" : "default"} 
                          className={cn(
                            "text-[8px] font-black px-1.5 py-0.5 uppercase tracking-wide border-transparent", 
                            outOfStock ? "bg-slate-100 text-slate-500" : ""
                          )}
                          style={outOfStock ? {} : {
                            backgroundColor: `${theme.primary}15`,
                            color: theme.primary
                          }}
                        >
                          {outOfStock ? 'Ubos' : `${product.currentStock} ${product.unit}`}
                        </Badge>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Right Column: Desktop Cart Panel */}
          <div className="hidden lg:block space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Kasalukuyang Cart</span>
              {cart.length > 0 && (
                <button 
                  onClick={clearCart}
                  className="text-[10px] font-bold text-red-500 hover:text-red-600 flex items-center gap-1 tap-target"
                >
                  <Trash2 className="h-3 w-3" /> Burahin Lahat
                </button>
              )}
            </div>

            <Card className="bg-white border-slate-100 shadow-sm rounded-2xl overflow-hidden sticky top-4">
              <CardContent className="p-0">
                <div className="max-h-[350px] overflow-y-auto p-4 space-y-3">
                  {cart.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-20" />
                      <h4 className="text-xs font-extrabold text-slate-700">Walang Laman ang Cart</h4>
                      <p className="text-[10px] text-slate-400 mt-1 max-w-[200px] mx-auto leading-relaxed">
                        Pumili at mag-tap ng mga produkto sa kaliwa para ilagay sa listahan ng bibilhin.
                      </p>
                    </div>
                  ) : (
                    cart.map(item => (
                      <div key={item.productId} className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        <div className="flex-1 pr-2">
                          <h4 className="font-extrabold text-xs text-slate-800 line-clamp-1">{item.name}</h4>
                          <p className="text-[10px] text-slate-400 font-bold">₱{(item.price / 100).toLocaleString()} each</p>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-6 w-6 p-0 rounded-lg hover:bg-slate-100 border-slate-200" 
                            onClick={() => removeFromCart(item.productId)}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="font-extrabold text-xs w-4 text-center text-slate-800">{item.quantity}</span>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-6 w-6 p-0 rounded-lg text-white border-transparent" 
                            style={{ backgroundColor: theme.primary }}
                            onClick={() => {
                              // FIX S3-2: Look up real product to enforce stock limit instead of passing 9999
                              const realProduct = products.find((p: any) => p.id === item.productId);
                              if (realProduct) addToCart(realProduct);
                            }}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Checkout pricing details block */}
                <div className="border-t border-slate-100 bg-slate-50/70 p-4 space-y-4">
                  <div className="flex justify-between items-end">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Kabuuang Halaga</span>
                    <span className="text-3xl font-black font-headline tracking-tighter text-slate-900 leading-none">
                      ₱{totalPesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      onClick={() => handleCheckout('cash')} 
                      disabled={cart.length === 0 || isProcessing}
                      className="h-12 bg-emerald-500 hover:bg-emerald-600 text-white font-bold shadow-md shadow-emerald-500/20 active:scale-95 transition-transform rounded-xl gap-1.5"
                    >
                      {isProcessing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Coins className="h-4 w-4" /> Cash Benta
                        </>
                      )}
                    </Button>
                    {/* FIX S1-1: Desktop GCash button now opens QR modal to require confirmation — never calls handleCheckout directly */}
                    <Button 
                      onClick={() => setShowGCashQr(true)} 
                      disabled={cart.length === 0 || isProcessing}
                      className="h-12 text-white font-bold shadow-md active:scale-95 transition-all rounded-xl gap-1.5 border-none"
                      style={{ 
                        backgroundColor: theme.primary, 
                        boxShadow: `0 8px 16px -4px ${theme.primary}40` 
                      }}
                    >
                      {isProcessing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Receipt className="h-4 w-4" /> GCash Benta
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

        </div>
      </main>

      {/* Floating Bottom Bar (Mobile Only) */}
      <div className="lg:hidden fixed bottom-[72px] left-4 right-4 z-40 animate-in slide-in-from-bottom-6 duration-300">
        <div 
          onClick={() => cart.length > 0 && setShowMobileCart(true)}
          className={cn(
            "bg-gradient-to-r from-slate-900 to-slate-800 text-white px-5 py-4 rounded-[20px] shadow-2xl flex items-center justify-between cursor-pointer border border-slate-700/50 active:scale-98 transition-all duration-100"
          )}
          style={cart.length > 0 ? { 
            boxShadow: `0 20px 40px -10px ${theme.primary}50` 
          } : {}}
        >
          <div className="flex items-center gap-3">
            <div className="relative bg-white/10 p-2.5 rounded-xl border border-white/10">
              <ShoppingCart className="h-5 w-5" style={{ color: theme.secondary }} />
              {cartItemCount > 0 && (
                <span 
                  className="absolute -top-1.5 -right-1.5 text-slate-900 text-[9px] font-black h-4.5 w-4.5 rounded-full flex items-center justify-center border border-slate-900 scale-in animate-pulse"
                  style={{ backgroundColor: theme.secondary, color: theme.secondaryText }}
                >
                  {cartItemCount}
                </span>
              )}
            </div>
            <div>
              <p className="text-[9px] font-black uppercase text-slate-400 leading-none">Mga Item sa Cart</p>
              <h4 className="text-sm font-extrabold text-white mt-1">
                {cart.length === 0 ? "Walang Laman" : `${cart.length} unique products`}
              </h4>
            </div>
          </div>
          
          <div className="text-right">
            <p className="text-[9px] font-black uppercase text-slate-400 leading-none">Total</p>
            <h3 className="text-lg font-black tracking-tight mt-1" style={{ color: theme.secondary }}>
              ₱{totalPesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </h3>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Slide Sheet */}
      <Sheet open={showMobileCart} onOpenChange={setShowMobileCart}>
        <SheetContent side="bottom" className="rounded-t-[32px] p-6 max-h-[85vh] overflow-y-auto">
          <SheetHeader className="flex flex-row justify-between items-center border-b border-slate-100 pb-4 mb-4">
            <div>
              <SheetTitle className="font-extrabold text-base flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" style={{ color: theme.primary }} /> Suriin ang Cart
              </SheetTitle>
              <SheetDescription className="text-[10px] text-slate-400 mt-0.5">
                Pindutin ang check-out para makumpleto ang atomic sale.
              </SheetDescription>
            </div>
            
            <button 
              onClick={clearCart}
              className="text-xs font-bold text-red-500 hover:underline flex items-center gap-1 mr-6"
            >
              Burahin Lahat
            </button>
          </SheetHeader>

          {/* Cart Items List */}
          <div className="space-y-3 py-2 max-h-[40vh] overflow-y-auto">
            {cart.map(item => (
              <div key={item.productId} className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div className="flex-1 pr-2">
                  <h4 className="font-extrabold text-xs text-slate-800">{item.name}</h4>
                  <p className="text-[10px] text-slate-400 font-bold">
                    ₱{(item.price / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })} each
                  </p>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-7 w-7 p-0 rounded-lg hover:bg-slate-100 border-slate-200" 
                    onClick={() => removeFromCart(item.productId)}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="font-extrabold text-xs w-5 text-center text-slate-800">{item.quantity}</span>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-7 w-7 p-0 rounded-lg text-white border-transparent" 
                    style={{ backgroundColor: theme.primary }}
                    onClick={() => {
                      // FIX S3-2: Look up real product to enforce stock limit instead of passing 9999
                      const realProduct = products.find((p: any) => p.id === item.productId);
                      if (realProduct) addToCart(realProduct);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom Total & Actions */}
          <div className="border-t border-slate-100 pt-4 mt-4 space-y-4">
            <div className="flex justify-between items-end">
              <span className="text-xs font-black uppercase text-slate-500">Kabuuang Halaga</span>
              <span className="text-3xl font-black font-headline text-slate-900">
                ₱{totalPesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pb-safe">
              <Button 
                onClick={() => handleCheckout('cash')} 
                disabled={isProcessing}
                className="h-12 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl gap-1.5 flex items-center justify-center text-xs"
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Coins className="h-4 w-4" /> Cash Checkout</>}
              </Button>
              <Button 
                onClick={() => {
                  setShowMobileCart(false);
                  setShowGCashQr(true);
                }} 
                disabled={isProcessing}
                className="h-12 text-white font-bold rounded-xl gap-1.5 flex items-center justify-center text-xs border-none cursor-pointer"
                style={{ 
                  backgroundColor: theme.primary, 
                  boxShadow: `0 8px 16px -4px ${theme.primary}40` 
                }}
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Receipt className="h-4 w-4" /> GCash Checkout</>}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <GCashQrModal
        open={showGCashQr}
        onClose={() => setShowGCashQr(false)}
        totalAmount={totalCentavos}
        tenantName={currentTenant?.name || "Katuwang Store"}
        onPaymentVerified={async (paymentMethod, gcashRef) => {
          setShowGCashQr(false);
          // FIX S1-1 + S1-3: Pass gcashRef so it is stored in Firestore sale record for audit trail
          await handleCheckout(paymentMethod, gcashRef);
        }}
        theme={theme}
      />

      <BarcodeScannerModal
        open={showScanner}
        onClose={() => setShowScanner(false)}
        products={products}
        onProductScanned={(product) => {
          addToCart(product);
        }}
        theme={theme}
      />

      <ThermalReceiptPreview
        open={showReceipt}
        onClose={() => setShowReceipt(false)}
        storeName={currentTenant?.name || "Katuwang Store"}
        items={completedSale?.items || []}
        totalAmountPesos={(completedSale?.total || 0) / 100}
        paymentMethod={completedSale?.paymentMethod || "cash"}
        transactionId={completedSale?.saleId || 'PENDING'}
        theme={theme}
      />

    </div>
  );
}
