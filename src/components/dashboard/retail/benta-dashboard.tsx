"use client"

// FIX S2-3: Static ES imports at module level replacing dynamic require() inside useEffect
import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { useTenant } from '@/app/lib/tenant-context';
import { useInventory } from '@/hooks/use-inventory';
import { useSyncStatus } from '@/hooks/use-sync-status';
import { useCart } from '@/hooks/use-cart';
import { processCheckout, processCreditCheckout, addProduct, deleteSale, CartItem } from '@/firebase/firestore/retail-actions';
import { usePinApproval } from '@/hooks/use-pin-approval';
import { useShift } from '@/hooks/use-shift';
import { Card, CardContent } from "@/components/ui/card";
import { useUser } from '@/firebase/auth/use-user';
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from '@/lib/utils';
import { getModuleTheme, useDynamicThemeColor } from '@/lib/theme-utils';
import { GCashQrModal } from '@/components/common/gcash-qr-modal';
import { BarcodeScannerModal } from '@/components/common/barcode-scanner-modal';
import { ProductManagerSheet } from '@/components/dashboard/product-manager-sheet';
import { QuickExpenseModal } from '@/components/common/quick-expense-modal';
import { DiscountInput } from '@/components/ui/discount-input';
import { ThermalReceiptPreview } from '@/components/common/thermal-receipt-preview';
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
  Camera,
  Calculator,
  PackagePlus
} from "lucide-react";

import { KatuwangErrorBoundary } from '@/components/common/error-boundary';

export function BentaDashboard() {
  return (
    <KatuwangErrorBoundary>
      <BentaDashboardContent />
    </KatuwangErrorBoundary>
  );
}

const ProductCard = React.memo(({ product, cartQty, theme, addToCart }: any) => {
  const outOfStock = product.currentStock <= 0;
  const isLowStock = !outOfStock && product.currentStock <= product.minStock;

  return (
    <div 
      onClick={() => addToCart(product)}
      className={cn(
        "bg-white border-2 rounded-2xl p-4 flex flex-col items-center text-center transition-all cursor-pointer relative select-none tap-target",
        outOfStock 
          ? "opacity-40 border-slate-100 grayscale cursor-not-allowed" 
          : "border-slate-100 hover:border-slate-200 shadow-sm"
      )}
      style={(!outOfStock && cartQty > 0) ? { borderColor: `${theme.primary}60` } : {}}
    >
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
            outOfStock ? "bg-slate-100 text-slate-500" : isLowStock ? "bg-amber-100 text-amber-700" : ""
          )}
          style={(outOfStock || isLowStock) ? {} : {
            backgroundColor: `${theme.primary}15`,
            color: theme.primary
          }}
        >
          {outOfStock ? 'Ubos' : isLowStock ? `Paubos: ${product.currentStock}` : `${product.currentStock} ${product.unit}`}
        </Badge>
      </div>
    </div>
  );
});

const CartItemCard = React.memo(({ item, theme, products, removeFromCart, addToCart, isMobile = false }: any) => {
  const btnSize = isMobile ? "h-7 w-7" : "h-6 w-6";
  const iconSize = isMobile ? "h-3.5 w-3.5" : "h-3 w-3";
  const padClass = isMobile ? "p-3" : "p-2.5";
  
  return (
    <div className={`flex justify-between items-center bg-slate-50 ${padClass} rounded-xl border border-slate-100`}>
      <div className="flex-1 pr-2">
        <h4 className="font-extrabold text-xs text-slate-800 line-clamp-1">{item.name}</h4>
        <p className="text-[10px] text-slate-400 font-bold">₱{(item.price / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })} each</p>
      </div>
      
      <div className="flex items-center gap-2">
        <Button 
          variant="outline" 
          size="sm" 
          className={`${btnSize} p-0 rounded-lg hover:bg-slate-100 border-slate-200`}
          onClick={() => removeFromCart(item.productId)}
        >
          <Minus className={iconSize} />
        </Button>
        <span className="font-extrabold text-xs w-5 text-center text-slate-800">{item.quantity}</span>
        <Button 
          variant="outline" 
          size="sm" 
          className={`${btnSize} p-0 rounded-lg text-white border-transparent`}
          style={{ backgroundColor: theme.primary }}
          onClick={() => {
            const realProduct = products.find((p: any) => p.id === item.productId);
            if (realProduct) addToCart(realProduct);
          }}
        >
          <Plus className={iconSize} />
        </Button>
      </div>
    </div>
  );
});

function BentaDashboardContent() {
  const { user } = useUser();
  const [profile, setProfile] = useState<any>(null);
  const { currentTenant } = useTenant();
  const { isOnline, isSyncing, syncMessage } = useSyncStatus(currentTenant?.id);
  const { products, loading: inventoryLoading } = useInventory();
  const { cart, setCart, addToCart, removeFromCart, clearCart, totalCentavos, totalPesos, cartItemCount } = useCart();

  // Load user profile in real-time using static imports (no more dynamic require)
  useEffect(() => {
    if (!user?.uid) return;
    const { db } = initializeFirebase();
    const userRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userRef, (snap: any) => {
      if (snap.exists()) {
        setProfile(snap.data());
      }
    }, (error) => {
      console.warn('Profile onSnapshot error:', error.message);
    });
    return () => unsubscribe();
  }, [user]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  
  // Search and Category filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [categories, setCategories] = useState<string[]>(['All']);
  
  // Sheet & Dialog controls
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showGCashQr, setShowGCashQr] = useState(false);
  const [showMayaQr, setShowMayaQr] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showTingiModal, setShowTingiModal] = useState(false);
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [scannedNewBarcode, setScannedNewBarcode] = useState('');

  const handleScanResult = (scannedCode: string) => {
    const cleanCode = (scannedCode || '').trim();
    if (!cleanCode) return;
    const cleanLower = cleanCode.toLowerCase();
    const noLeadingZero = cleanCode.replace(/^0+/, '').toLowerCase();

    const match = (products || []).find((p: any) => {
      const pSku = (p.sku || '').trim().toLowerCase();
      const pBarcode = (p.barcode || '').trim().toLowerCase();
      const pId = (p.id || '').trim().toLowerCase();
      const pSkuNoZero = pSku.replace(/^0+/, '');
      const pBarcodeNoZero = pBarcode.replace(/^0+/, '');

      return (
        pSku === cleanLower ||
        pBarcode === cleanLower ||
        pId === cleanLower ||
        (noLeadingZero !== '' && (pSkuNoZero === noLeadingZero || pBarcodeNoZero === noLeadingZero))
      );
    });

    if (match) {
      addToCart(match);
      setSuccessMsg(`Naidagdag sa basket: ${match.name}`);
      setTimeout(() => setSuccessMsg(null), 3000);
      setShowScanner(false);
    } else {
      setScannedNewBarcode(cleanCode);
      setShowScanner(false);
      setShowAddProductModal(true);
    }
  };
  
  // Cash Tendered Modal
  const [showCashModal, setShowCashModal] = useState(false);
  const [cashTendered, setCashTendered] = useState('');
  
  // Tingi / Custom Item
  const [tingiPrice, setTingiPrice] = useState('');
  const [tingiName, setTingiName] = useState('');
  
  // Palista / Store Credit
  const [palistaName, setPalistaName] = useState('');
  const [showPalistaInput, setShowPalistaInput] = useState(false);

  const [completedSale, setCompletedSale] = useState<{
    items: CartItem[];
    total: number;
    discountCentavos?: number;
    discountType?: string;
    discountReason?: string;
    paymentMethod: string;
    saleId?: string;
    pointsEarned?: number;
  } | null>(null);

  const [discountType, setDiscountType] = useState<'percentage'|'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [discountReason, setDiscountReason] = useState('');

  // Dynamically resolve Katuwang industry theme based on active tenant's moduleType
  const theme = getModuleTheme(currentTenant?.moduleType);
  const { requireApproval } = usePinApproval();
  const { activeShift } = useShift();

  const parsedDiscount = parseFloat(discountValue) || 0;
  let discountCentavos = 0;
  if (discountType === 'percentage') {
    discountCentavos = Math.round((totalCentavos * parsedDiscount) / 100);
  } else {
    discountCentavos = Math.round(parsedDiscount * 100);
  }
  if (discountCentavos > totalCentavos) discountCentavos = totalCentavos;

  const finalTotalCentavos = Math.max(0, totalCentavos - discountCentavos);
  const finalTotalPesos = finalTotalCentavos / 100;
  
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
    if (!currentTenant || !user || cart.length === 0) return;
    try {
      setIsProcessing(true);
      setError(null);
      
      // Execute safe atomic transaction in Firestore — returns real Firestore document ID
      const saleId = await processCheckout(
        currentTenant.id, 
        cart, 
        finalTotalCentavos, 
        paymentMethod, 
        gcashRef, 
        discountCentavos, 
        discountType,
        discountReason,
        user.uid,
        user.displayName || user.email || 'Unknown',
        activeShift?.id
      );
      
      // Store transaction data for receipt representation with the REAL Firestore ID
      setCompletedSale({
        items: [...cart],
        total: finalTotalCentavos,
        discountCentavos,
        discountType,
        discountReason,
        paymentMethod,
        saleId, // Always the real Firestore document ID — never Math.random()
        pointsEarned: 0,
      });
      
      setCart([]);
      setShowMobileCart(false);
      setShowReceipt(true);
      
      setSuccessMsg(`Benta Kumpleto! Stock deducted automatically.`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVoidSale = async () => {
    if (!currentTenant || !completedSale?.saleId || !user) return;
    
    // Phase 2: Require Manager PIN for Voids
    const approved = await requireApproval("Voiding a sale requires Manager authorization.");
    if (!approved) return;

    if (!window.confirm("Sigurado ka bang gusto mong i-void ang sale na ito? Ang stock ng items ay babalik sa inventory.")) return;
    
    try {
      setIsVoiding(true);
      await deleteSale(
        currentTenant.id, 
        completedSale.saleId, 
        user.uid,
        user.displayName || user.email || 'Unknown User'
      );
      
      setShowReceipt(false);
      setCompletedSale(null);
      setSuccessMsg("Tagumpay na na-void ang sale. Bumalik ang stock sa inventory.");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsVoiding(false);
    }
  };

  const handlePalistaCheckout = async () => {
    if (!currentTenant || !user || cart.length === 0) return;
    if (!palistaName || palistaName.trim() === '') {
      setError("Ilagay ang pangalan ng Customer.");
      return;
    }
    try {
      setIsProcessing(true);
      setError(null);
      
      const palistaDate = new Date();
      const saleId = await processCreditCheckout(
        currentTenant.id, 
        cart, 
        finalTotalCentavos, 
        palistaName, 
        palistaDate, 
        discountCentavos, 
        discountType,
        discountReason,
        user.uid,
        user.displayName || user.email || 'Unknown',
        activeShift?.id
      );
      
      setCompletedSale({
        items: [...cart],
        total: finalTotalCentavos,
        discountCentavos,
        discountType,
        paymentMethod: 'palista',
        saleId,
        pointsEarned: 0,
      });
      
      setCart([]);
      setShowMobileCart(false);
      setShowPalistaInput(false);
      setPalistaName('');
      setShowReceipt(true);
      
      setSuccessMsg(`Pautang naitala para kay ${palistaName}!`);
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
    if (!debouncedSearchQuery || !debouncedSearchQuery.trim()) {
      return (products || []).filter((product: any) => selectedCategory === 'All' || product.category === selectedCategory);
    }

    const query = debouncedSearchQuery.trim().toLowerCase();
    const queryNoZero = query.replace(/^0+/, '');

    return (products || []).filter((product: any) => {
      const name = (product.name || '').toLowerCase();
      const category = (product.category || '').toLowerCase();
      const sku = (product.sku || '').trim().toLowerCase();
      const barcode = (product.barcode || '').trim().toLowerCase();
      const id = (product.id || '').trim().toLowerCase();
      const skuNoZero = sku.replace(/^0+/, '');
      const barcodeNoZero = barcode.replace(/^0+/, '');

      const matchesSearch =
        name.includes(query) ||
        category.includes(query) ||
        sku.includes(query) ||
        barcode.includes(query) ||
        id.includes(query) ||
        (queryNoZero !== '' && (skuNoZero.includes(queryNoZero) || barcodeNoZero.includes(queryNoZero)));

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
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
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
              <Input 
                id="benta-search"
                name="bentaSearch"
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
              title="Scan Barcode"
            >
              <Camera className="h-5 w-5 text-slate-500" />
            </Button>
            <Button
              onClick={() => {
                setScannedNewBarcode('');
                setShowAddProductModal(true);
              }}
              variant="outline"
              className="h-[46px] px-3 font-black text-xs rounded-xl border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 flex items-center justify-center gap-1 cursor-pointer flex-shrink-0"
              title="Magdagdag ng Bagong Produkto"
            >
              <PackagePlus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Item</span>
            </Button>
            <Button
              onClick={() => setShowTingiModal(true)}
              variant="outline"
              className="h-[46px] w-[46px] p-0 rounded-xl border-slate-200 hover:bg-slate-100 flex items-center justify-center cursor-pointer flex-shrink-0"
              title="Tingi / Custom Calculator"
            >
              <Calculator className="h-5 w-5 text-slate-500" />
            </Button>
            <Button
              onClick={() => setShowExpenseModal(true)}
              variant="outline"
              className="h-[46px] px-3 font-extrabold text-xs rounded-xl border-red-200 text-red-600 hover:bg-red-50 flex items-center justify-center gap-1 cursor-pointer flex-shrink-0"
              title="Mag-record ng Gastos"
            >
              <Receipt className="h-4 w-4" />
              <span>Gastos</span>
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
            
            <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
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
                  const cartItem = cart.find(item => item.productId === product.id);
                  const cartQty = cartItem ? cartItem.quantity : 0;
                  
                  return (
                    <ProductCard
                      key={product.id}
                      product={product}
                      cartQty={cartQty}
                      theme={theme}
                      addToCart={addToCart}
                    />
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
                      <CartItemCard
                        key={item.productId}
                        item={item}
                        theme={theme}
                        products={products}
                        removeFromCart={removeFromCart}
                        addToCart={addToCart}
                      />
                    ))
                  )}
                </div>

                {/* Checkout pricing details block */}
                <div className="border-t border-slate-100 bg-slate-50/70 p-4 space-y-4">
                  {cart.length > 0 && (
                    <DiscountInput 
                      discountType={discountType}
                      discountValue={discountValue}
                      discountReason={discountReason}
                      onTypeChange={setDiscountType}
                      onValueChange={setDiscountValue}
                      onReasonChange={setDiscountReason}
                      subtotal={totalCentavos}
                    />
                  )}
                  
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between items-end">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Kabuuang Halaga</span>
                      <span className="text-3xl font-black font-headline tracking-tighter text-slate-900 leading-none">
                        ₱{finalTotalPesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <Button 
                      onClick={() => setShowCashModal(true)} 
                      disabled={cart.length === 0 || isProcessing}
                      className="h-12 bg-emerald-500 hover:bg-emerald-600 text-white font-bold shadow-md shadow-emerald-500/20 active:scale-95 transition-transform rounded-xl gap-1.5 px-0"
                    >
                      {isProcessing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <><Coins className="h-4 w-4" /> Cash</>
                      )}
                    </Button>
                    <Button 
                      onClick={() => setShowGCashQr(true)} 
                      disabled={cart.length === 0 || isProcessing}
                      className="h-12 text-white font-bold shadow-md active:scale-95 transition-all rounded-xl gap-1.5 border-none px-0"
                      style={{ backgroundColor: '#007aff', boxShadow: '0 8px 16px -4px #007aff40' }}
                    >
                      {isProcessing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <><Receipt className="h-4 w-4" /> GCash</>
                      )}
                    </Button>
                    <Button 
                      onClick={() => setShowPalistaInput(true)} 
                      disabled={cart.length === 0 || isProcessing}
                      className="h-12 bg-orange-500 hover:bg-orange-600 text-white font-bold shadow-md shadow-orange-500/20 active:scale-95 transition-transform rounded-xl gap-1.5 px-0"
                    >
                      {isProcessing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <><Tag className="h-4 w-4" /> Palista</>
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
              ₱{finalTotalPesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
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
              <CartItemCard
                key={item.productId}
                item={item}
                theme={theme}
                products={products}
                removeFromCart={removeFromCart}
                addToCart={addToCart}
                isMobile={true}
              />
            ))}
          </div>

          {/* Bottom Total & Actions */}
          <div className="border-t border-slate-100 pt-4 mt-4 space-y-4">
            
            {cart.length > 0 && (
              <DiscountInput 
                discountType={discountType}
                discountValue={discountValue}
                discountReason={discountReason}
                onTypeChange={setDiscountType}
                onValueChange={setDiscountValue}
                onReasonChange={setDiscountReason}
                subtotal={totalCentavos}
              />
            )}

            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-end">
                <span className="text-xs font-black uppercase text-slate-500">Kabuuang Halaga</span>
                <span className="text-3xl font-black font-headline text-slate-900">
                  ₱{finalTotalPesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pb-safe">
              <Button 
                onClick={() => setShowCashModal(true)} 
                disabled={isProcessing}
                className="h-12 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl gap-1.5 flex items-center justify-center text-xs"
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Coins className="h-4 w-4" /> Cash</>}
              </Button>
              <Button 
                onClick={() => { setShowMobileCart(false); setShowGCashQr(true); }} 
                disabled={isProcessing}
                className="h-12 text-white font-bold rounded-xl gap-1.5 flex items-center justify-center text-xs border-none cursor-pointer"
                style={{ backgroundColor: '#007aff', boxShadow: '0 8px 16px -4px #007aff40' }}
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Receipt className="h-4 w-4" /> GCash</>}
              </Button>
            </div>
            {/* Mobile Palista */}
            {false && (
              <>              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <GCashQrModal
        open={showGCashQr}
        onClose={() => setShowGCashQr(false)}
        totalAmount={totalCentavos}
        tenantName={currentTenant?.name || "Katuwang Store"}
        paymentType="gcash"
        onPaymentVerified={async (paymentMethod, gcashRef) => {
          setShowGCashQr(false);
          await handleCheckout(paymentMethod, gcashRef);
        }}
        theme={theme}
      />

      {/* Maya Payment Modal */}
      <GCashQrModal
        open={showMayaQr}
        onClose={() => setShowMayaQr(false)}
        totalAmount={totalCentavos}
        tenantName={currentTenant?.name || "Katuwang Store"}
        paymentType="maya"
        onPaymentVerified={async (paymentMethod, ref) => {
          setShowMayaQr(false);
          await handleCheckout(paymentMethod, ref);
        }}
        theme={theme}
      />

      <BarcodeScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScanResult={(scannedSku) => setSearchQuery(scannedSku)}
        themeColor={theme.primary}
      />

      {/* Tingi / Custom Amount Modal */}
      <Dialog open={showTingiModal} onOpenChange={setShowTingiModal}>
        <DialogContent className="rounded-[24px] p-0 overflow-hidden sm:max-w-[400px]">
          <DialogHeader className="px-6 pt-6 pb-4 bg-slate-50 border-b border-slate-100">
            <DialogTitle className="font-headline font-black text-lg flex items-center gap-2 text-slate-800">
              <Calculator className="h-5 w-5" style={{ color: theme.primary }} />
              Custom Amount (Tingi)
            </DialogTitle>
            <DialogDescription className="text-xs font-medium text-slate-500">
              Ilagay ang presyo para sa item na wala sa imbentaryo.
            </DialogDescription>
          </DialogHeader>
          <div className="p-6 space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Pangalan (Optional)</Label>
              <Input 
                id="tingi-name"
                name="tingiName"
                value={tingiName}
                onChange={e => setTingiName(e.target.value)}
                placeholder="e.g. ₱5 Load, Yelo"
                className="h-11 bg-slate-50 border-slate-200 text-sm font-bold"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Presyo (₱)</Label>
              <Input 
                id="tingi-price"
                name="tingiPrice"
                type="number"
                value={tingiPrice}
                onChange={e => setTingiPrice(e.target.value)}
                placeholder="0.00"
                className="h-14 text-2xl font-black placeholder:text-slate-300 border-slate-200 bg-white"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-row gap-2">
            <Button variant="outline" onClick={() => setShowTingiModal(false)} className="rounded-xl h-12 flex-1 font-bold">
              Kanselahin
            </Button>
            <Button 
              onClick={() => {
                const price = parseFloat(tingiPrice);
                if (!isNaN(price) && price > 0) {
                  addToCart({
                    id: `misc-${Date.now()}`,
                    name: tingiName || 'Tingi / Misc',
                    salePrice: Math.round(price * 100), // Convert to centavos
                    costPrice: Math.round(price * 100), // No profit margin calculated for misc
                    currentStock: 999,
                    unit: 'pcs',
                    category: 'Miscellaneous'
                  });
                  setShowTingiModal(false);
                  setTingiPrice('');
                  setTingiName('');
                }
              }} 
              disabled={!tingiPrice || isNaN(parseFloat(tingiPrice)) || parseFloat(tingiPrice) <= 0}
              className="rounded-xl h-12 flex-1 font-bold text-white border-none shadow-md"
              style={{ backgroundColor: theme.primary, boxShadow: `0 8px 16px -4px ${theme.primary}40` }}
            >
              Idagdag sa Cart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cash Tendered / Sukli Modal */}
      <Dialog open={showCashModal} onOpenChange={(open) => { setShowCashModal(open); if (!open) setCashTendered(''); }}>
        <DialogContent className="rounded-[24px] p-0 overflow-hidden sm:max-w-[400px]">
          <DialogHeader className="px-6 pt-6 pb-4 bg-emerald-50 border-b border-emerald-100">
            <DialogTitle className="font-headline font-black text-lg flex items-center gap-2 text-emerald-800">
              <Coins className="h-5 w-5 text-emerald-600" />
              Cash Payment
            </DialogTitle>
          </DialogHeader>
          <div className="p-6 space-y-4">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex justify-between items-center">
              <span className="font-bold text-slate-500 uppercase text-xs">Total Amount</span>
              <span className="font-black text-2xl" style={{ color: theme.primary }}>₱{finalTotalPesos.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">Pera na Ibinayad (Tendered)</Label>
              <Input 
                id="cash-tendered"
                name="cashTendered"
                type="number"
                value={cashTendered}
                onChange={e => setCashTendered(e.target.value)}
                placeholder="0.00"
                className="h-14 text-2xl font-black border-emerald-200 bg-white text-emerald-700 placeholder:text-emerald-200"
                autoFocus
              />
            </div>
            
            <div className="grid grid-cols-4 gap-2">
              <Button variant="outline" onClick={() => setCashTendered(finalTotalPesos.toString())} className="h-10 text-[10px] font-bold rounded-xl border-slate-200 text-slate-600">Exact</Button>
              <Button variant="outline" onClick={() => setCashTendered('100')} className="h-10 text-[10px] font-bold rounded-xl border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100">₱100</Button>
              <Button variant="outline" onClick={() => setCashTendered('500')} className="h-10 text-[10px] font-bold rounded-xl border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100">₱500</Button>
              <Button variant="outline" onClick={() => setCashTendered('1000')} className="h-10 text-[10px] font-bold rounded-xl border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100">₱1000</Button>
            </div>

            {parseFloat(cashTendered) >= finalTotalPesos && (
              <div className="flex justify-between items-center p-4 rounded-xl border border-emerald-200 bg-emerald-50 animate-in fade-in zoom-in duration-200">
                <span className="text-xs font-black uppercase tracking-widest text-emerald-700">Sukli (Change)</span>
                <span className="text-2xl font-black text-emerald-700">₱{(parseFloat(cashTendered) - finalTotalPesos).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
          </div>
          <DialogFooter className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-row gap-2">
            <Button variant="outline" onClick={() => setShowCashModal(false)} className="rounded-xl h-12 flex-1 font-bold">
              Bumalik
            </Button>
            <Button 
              onClick={() => {
                setShowCashModal(false);
                handleCheckout('cash');
              }} 
              disabled={!cashTendered || isNaN(parseFloat(cashTendered)) || parseFloat(cashTendered) < finalTotalPesos || isProcessing}
              className="rounded-xl h-12 flex-1 font-bold text-white border-none shadow-md bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Tapusin ang Sale'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPalistaInput} onOpenChange={setShowPalistaInput}>
        <DialogContent className="sm:max-w-md rounded-2xl p-0 overflow-hidden border-0">
          <div className="p-6 bg-gradient-to-br from-orange-500 to-orange-600 text-white relative">
            <div className="absolute right-0 top-0 opacity-10 transform translate-x-4 -translate-y-4">
              <Tag className="h-24 w-24" />
            </div>
            <DialogTitle className="text-2xl font-black font-headline relative z-10 flex items-center gap-2">
              Palista / Utang
            </DialogTitle>
            <DialogDescription className="text-orange-100 mt-1 relative z-10">
              Ilagay ang pangalan ng uutang. Ito ay mapupunta sa Credit Tracker.
            </DialogDescription>
          </div>
          
          <div className="p-6 space-y-4 bg-white">
            <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-bold text-orange-800">Halaga ng Utang:</span>
                <span className="text-xl font-black text-orange-900">₱{finalTotalPesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="palistaName" className="font-bold text-slate-700">Pangalan ng Customer</Label>
              <Input
                id="palistaName"
                value={palistaName}
                onChange={(e) => setPalistaName(e.target.value)}
                placeholder="Hal. Juan Dela Cruz"
                className="h-12 rounded-xl border-slate-200"
                autoFocus
              />
            </div>

            <DialogFooter className="mt-4 gap-2">
              <Button variant="outline" onClick={() => setShowPalistaInput(false)} className="h-12 rounded-xl font-bold flex-1">
                Kanselahin
              </Button>
              <Button 
                onClick={handlePalistaCheckout}
                disabled={!palistaName.trim() || isProcessing} 
                className="h-12 rounded-xl font-bold bg-orange-500 hover:bg-orange-600 text-white flex-1"
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ilista ang Utang"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ThermalReceiptPreview
        open={showReceipt}
        onClose={() => setShowReceipt(false)}
        storeName={currentTenant?.name || "Katuwang Store"}
        items={completedSale?.items || []}
        subtotalAmountPesos={((completedSale?.total || 0) + (completedSale?.discountCentavos || 0)) / 100}
        discountAmountPesos={(completedSale?.discountCentavos || 0) / 100}
        discountType={completedSale?.discountType}
        discountReason={completedSale?.discountReason}
        totalAmountPesos={(completedSale?.total || 0) / 100}
        paymentMethod={completedSale?.paymentMethod || "cash"}
        transactionId={completedSale?.saleId || 'PENDING'}
        onVoidSale={profile?.role !== 'staff' && completedSale?.saleId ? handleVoidSale : undefined}
        isVoiding={isVoiding}
        theme={theme}
        pointsEarned={completedSale?.pointsEarned}
      />

      {/* Camera Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScanResult={handleScanResult}
        themeColor={theme.primary}
      />

      {/* Product Creation / Manager Sheet (Supports Pre-filled Scanned Barcodes) */}
      <ProductManagerSheet
        isOpen={showAddProductModal}
        onOpenChange={setShowAddProductModal}
        initialBarcode={scannedNewBarcode}
      />

      {/* Quick Expense Modal */}
      <QuickExpenseModal
        isOpen={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        tenantId={currentTenant?.id || ''}
        moduleType="benta-snap"
        themeColor={theme.primary}
      />

    </div>
  );
}
