"use client"

import React, { useState, useEffect } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { useInventory } from '@/hooks/use-inventory';
import { useCart } from '@/hooks/use-cart';
import { useProjects } from '@/hooks/use-projects';
import { processBatchDispatch } from '@/firebase/firestore/build-stack-actions';
import { processCheckout, addProduct } from '@/firebase/firestore/retail-actions';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { GCashQrModal } from '@/components/common/gcash-qr-modal';
import { ThermalReceiptPreview } from '@/components/common/thermal-receipt-preview';
import { EstimateModal } from '@/components/dashboard/retail/estimate-modal';
import { QuickExpenseModal } from '@/components/common/quick-expense-modal';
import { DiscountInput } from '@/components/ui/discount-input';
import { BarcodeScannerModal } from '@/components/common/barcode-scanner-modal';
import { ProductManagerSheet } from '@/components/dashboard/product-manager-sheet';
import { cn } from '@/lib/utils';
import { getModuleTheme } from '@/lib/theme-utils';
import { useToast } from '@/hooks/use-toast';
import { 
  Package, Plus, Minus, Loader2, Search, Tag, ShoppingCart, Send, Coins, Receipt, FileText, Camera, PackagePlus
} from "lucide-react";
import { KatuwangErrorBoundary } from '@/components/common/error-boundary';

export function BuildStackDashboard() {
  return (
    <KatuwangErrorBoundary>
      <BuildStackDashboardContent />
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
          {product.category || 'Materials'}
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

const CartItemCard = React.memo(({ item, theme, products, removeFromCart, addToCart }: any) => {
  return (
    <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
      <div className="flex-1 pr-2">
        <h4 className="font-extrabold text-xs text-slate-800 line-clamp-1">{item.name}</h4>
        <p className="text-[10px] text-slate-400 font-bold">₱{(item.price / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })} each</p>
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
            const realProduct = products.find((p: any) => p.id === item.productId);
            if (realProduct) addToCart(realProduct);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
});

function BuildStackDashboardContent() {
  const { currentTenant } = useTenant();
  const { products, loading: inventoryLoading } = useInventory();
  const { activeProjects, loading: projectsLoading } = useProjects();
  const { cart, addToCart, removeFromCart, clearCart, totalCentavos, totalPesos, cartItemCount } = useCart();
  const { toast } = useToast();

  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [categories, setCategories] = useState<string[]>(['All']);
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [showCashModal, setShowCashModal] = useState(false);
  const [cashTendered, setCashTendered] = useState('');
  const [showGCashQr, setShowGCashQr] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [completedSale, setCompletedSale] = useState<any>(null);
  const [showEstimateModal, setShowEstimateModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);

  // Barcode & Product Creation States
  const [showScanner, setShowScanner] = useState(false);
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [scannedNewBarcode, setScannedNewBarcode] = useState('');

  // Discount States
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState<string>('');
  const [discountReason, setDiscountReason] = useState<string>('');

  let discountCentavos = 0;
  if (discountValue && !isNaN(parseFloat(discountValue))) {
    if (discountType === 'fixed') {
      discountCentavos = Math.round(parseFloat(discountValue) * 100);
    } else {
      discountCentavos = Math.round(totalCentavos * (parseFloat(discountValue) / 100));
    }
  }
  const finalTotalCentavos = Math.max(0, totalCentavos - discountCentavos);
  const finalTotalPesos = finalTotalCentavos / 100;
  
  const theme = getModuleTheme('build-stack');

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
      toast({ title: 'Naidagdag sa basket!', description: match.name });
      setShowScanner(false);
    } else {
      setScannedNewBarcode(cleanCode);
      setShowScanner(false);
      setShowAddProductModal(true);
    }
  };

  useEffect(() => {
    if (products && products.length > 0) {
      const cats = Array.from(new Set(products.map((p: any) => p.category || 'Materials'))) as string[];
      setCategories(['All', ...cats]);
    }
  }, [products]);

  const filteredProducts = products.filter((p: any) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = p.name.toLowerCase().includes(q) ||
                          (p.category && p.category.toLowerCase().includes(q)) ||
                          (p.barcode && p.barcode.toLowerCase().includes(q)) ||
                          (p.sku && p.sku.toLowerCase().includes(q));
    const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleDispatch = async () => {
    if (cart.length === 0 || !currentTenant) return;
    if (!selectedProjectId) {
      toast({ title: "Error", description: "Pakipili kung anong proyekto ipadadala (Select a Project)", variant: "destructive" });
      return;
    }

    const project = activeProjects.find((p: any) => p.id === selectedProjectId);
    if (!project) return;

    setIsProcessing(true);
    try {
      await processBatchDispatch(currentTenant.id, selectedProjectId, project.name, cart);
      toast({ title: "Materials Dispatched!", description: `Successfully dispatched to ${project.name}.` });
      clearCart();
      setSelectedProjectId('');
      setDiscountValue('');
      setDiscountReason('');
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCheckout = async (paymentMethod: string, gcashRef?: string) => {
    if (cart.length === 0 || !currentTenant) return;
    
    setIsProcessing(true);
    try {
      const items = cart.map(c => ({
         productId: c.productId,
         name: c.name,
         quantity: c.quantity,
         price: c.price,
         subtotal: c.price * c.quantity
      }));
      const saleId = await processCheckout(
        currentTenant.id, 
        items, 
        finalTotalCentavos, 
        paymentMethod, 
        gcashRef, 
        discountCentavos, 
        discountType, 
        discountReason
      );
      toast({ title: "Sale Completed", description: "Hardware items sold directly." });
      setCompletedSale({ saleId, items, total: finalTotalCentavos, paymentMethod });
      clearCart();
      setCashTendered('');
      setDiscountValue('');
      setDiscountReason('');
      setShowReceipt(true);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };


  if (inventoryLoading || projectsLoading) {
    return <div className="p-6 text-center text-muted-foreground animate-pulse">Naglo-load ng materyales at proyekto...</div>;
  }

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden bg-slate-50">
      
      {/* LEFT PANEL - Product Grid */}
      <div className="flex-1 flex flex-col h-full overflow-hidden pb-24 md:pb-0">
        <div className="p-4 bg-white border-b border-slate-100 flex-shrink-0 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-headline font-black uppercase tracking-tighter" style={{ color: theme.primary }}>
              Build Stack
            </h1>
            <p className="text-xs text-slate-500 font-medium">Hardware & Construction POS</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowExpenseModal(true)}
              className="rounded-xl h-10 px-3 text-xs font-bold border-red-200 text-red-600 hover:bg-red-50 flex items-center gap-1.5"
            >
              <Receipt className="h-4 w-4" />
              <span>Gastos</span>
            </Button>
            
            {/* Camera Barcode Scanner Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowScanner(true)}
              className="rounded-xl h-10 px-3 text-xs font-bold border-slate-200 hover:bg-slate-100 flex items-center gap-1.5 cursor-pointer"
              title="Scan Barcode"
            >
              <Camera className="h-4 w-4 text-slate-600" />
              <span className="hidden sm:inline">Scan</span>
            </Button>

            {/* Add Product Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setScannedNewBarcode('');
                setShowAddProductModal(true);
              }}
              className="rounded-xl h-10 px-3 text-xs font-black border-slate-300 text-slate-700 bg-slate-100 hover:bg-slate-200 flex items-center gap-1.5 cursor-pointer"
              title="Magdagdag ng Bagong Produkto"
            >
              <PackagePlus className="h-4 w-4 text-slate-700" />
              <span>+ Add Item</span>
            </Button>

            <div className="relative w-48 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="Search materials..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-10 bg-slate-50 border-slate-200 rounded-xl"
              />
            </div>
          </div>
        </div>

        {/* Categories Pill Bar */}
        <div className="bg-white px-4 py-2 border-b border-slate-100 flex-shrink-0 flex items-center gap-2 overflow-x-auto no-scrollbar">
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
                style={isSelected ? { backgroundColor: theme.primary, borderColor: theme.primary } : {}}
              >
                {cat === 'All' ? 'All Categories' : cat}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filteredProducts.map((product: any) => {
              const cartItem = cart.find(c => c.productId === product.id);
              return (
                <ProductCard 
                  key={product.id} 
                  product={product} 
                  cartQty={cartItem?.quantity || 0}
                  theme={theme}
                  addToCart={addToCart}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* RIGHT PANEL - Cart & Actions (Desktop) */}
      <div className="hidden md:flex w-96 bg-white border-l border-slate-100 flex-col h-full shadow-xl z-10 flex-shrink-0">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-slate-700" />
            <h2 className="font-black text-slate-800">Dispatch Cart</h2>
            <Badge variant="secondary" className="ml-2 bg-slate-200">{cartItemCount}</Badge>
          </div>
          {cart.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearCart} className="text-red-500 hover:text-red-600 hover:bg-red-50">
              Clear
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
              <Package className="h-12 w-12 opacity-20" />
              <p className="text-sm font-bold">Pumili ng materyales na ipapadala</p>
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

        <div className="p-4 bg-white border-t border-slate-100 space-y-4">
          {cart.length > 0 && (
            <DiscountInput 
              discountType={discountType}
              discountValue={discountValue}
              discountReason={discountReason}
              onTypeChange={setDiscountType as any}
              onValueChange={setDiscountValue}
              onReasonChange={setDiscountReason}
            />
          )}

          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-500 font-bold uppercase tracking-widest text-xs">Total Bill</span>
            <span className="text-3xl font-black text-slate-800" style={{ color: theme.primary }}>
              ₱{finalTotalPesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </span>
          </div>
          
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Select Active Project:</span>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full h-12 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm font-bold outline-none focus:border-slate-400"
            >
              <option value="">-- Pumili ng Proyekto --</option>
              {activeProjects.map((proj: any) => (
                <option key={proj.id} value={proj.id}>{proj.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2 mb-4 mt-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Direct Sale (Benta):</span>
            <div className="grid grid-cols-2 gap-2">
              <Button 
                onClick={() => setShowCashModal(true)}
                disabled={cart.length === 0 || isProcessing}
                className="h-12 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl gap-1.5 flex items-center justify-center text-xs shadow-lg transition-transform active:scale-[0.98]"
              >
                <Coins className="h-4 w-4" /> Cash
              </Button>
              <Button 
                onClick={() => setShowGCashQr(true)}
                disabled={cart.length === 0 || isProcessing}
                className="h-12 text-white font-bold rounded-xl gap-1.5 flex items-center justify-center text-xs border-none cursor-pointer shadow-lg transition-transform active:scale-[0.98]"
                style={{ backgroundColor: '#007aff', boxShadow: '0 8px 16px -4px #007aff40' }}
              >
                <Receipt className="h-4 w-4" /> GCash
              </Button>

              <Button 
                onClick={() => setShowEstimateModal(true)}
                disabled={cart.length === 0}
                variant="outline"
                className="w-full h-11 rounded-xl text-xs font-black tracking-wide border-indigo-200 text-indigo-700 hover:bg-indigo-50"
              >
                <FileText className="mr-1.5 h-4 w-4 text-indigo-600" />
                Bumuo ng Presyo / Estimate
              </Button>
            </div>
          </div>

          <Button 
            className="w-full h-14 rounded-xl text-lg font-black tracking-wide shadow-lg transition-transform active:scale-[0.98]"
            style={{ backgroundColor: theme.primary, color: theme.primaryText }}
            disabled={cart.length === 0 || !selectedProjectId || isProcessing}
            onClick={handleDispatch}
          >
            {isProcessing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Send className="mr-2 h-5 w-5" />}
            DISPATCH TO PROJECT
          </Button>
        </div>
      </div>

      {/* Floating Bottom Bar (Mobile Only) */}
      <div className="md:hidden fixed bottom-[72px] left-4 right-4 z-40 animate-in slide-in-from-bottom-6 duration-300">
        <div 
          onClick={() => cart.length > 0 && setShowMobileCart(true)}
          className={cn(
            "bg-gradient-to-r from-slate-900 to-slate-800 text-white px-5 py-4 rounded-[20px] shadow-2xl flex items-center justify-between cursor-pointer border border-slate-700/50 active:scale-98 transition-all duration-100"
          )}
        >
          <div className="flex items-center gap-4">
            <div className="relative">
              <ShoppingCart className="h-6 w-6 text-slate-300" />
              {cartItemCount > 0 && (
                <span 
                  className="absolute -top-2 -right-2 h-5 min-w-5 px-1.5 flex items-center justify-center rounded-full text-[10px] font-black border-2 border-slate-800"
                  style={{ backgroundColor: theme.primary, color: theme.primaryText }}
                >
                  {cartItemCount}
                </span>
              )}
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mga Item sa Cart</span>
              <span className="text-sm font-black text-white leading-tight">
                {cart.length === 0 ? 'Walang Laman' : `${cart.length} Iba't ibang Materyales`}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Bill</span>
              <span className="text-lg font-black" style={{ color: theme.primary }}>
                ₱{finalTotalPesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Slide Sheet */}
      <Sheet open={showMobileCart} onOpenChange={setShowMobileCart}>
        <SheetContent side="bottom" className="rounded-t-[32px] p-6 max-h-[85vh] flex flex-col">
          <SheetHeader className="flex flex-row justify-between items-center border-b border-slate-100 pb-4 mb-4 flex-shrink-0">
            <div>
              <SheetTitle className="text-xl font-black font-headline text-slate-800">Dispatch Cart</SheetTitle>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1">{cartItemCount} items total</p>
            </div>
            {cart.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearCart} className="text-red-500 hover:text-red-600 hover:bg-red-50 rounded-xl h-10 px-4">
                Clear
              </Button>
            )}
          </SheetHeader>
          
          <div className="flex-1 overflow-y-auto space-y-3 pb-4">
            {cart.map((item: any) => (
              <CartItemCard 
                key={item.productId}
                item={item}
                theme={theme}
                products={products}
                removeFromCart={removeFromCart}
                addToCart={addToCart}
              />
            ))}
          </div>
          
          <div className="pt-4 border-t border-slate-100 flex-shrink-0 space-y-3">
            {cart.length > 0 && (
              <DiscountInput 
                discountType={discountType}
                discountValue={discountValue}
                discountReason={discountReason}
                onTypeChange={setDiscountType as any}
                onValueChange={setDiscountValue}
                onReasonChange={setDiscountReason}
              />
            )}

            <div className="flex items-center justify-between mb-4 px-1">
              <span className="text-slate-500 font-bold uppercase tracking-widest text-xs">Total Bill</span>
              <span className="text-3xl font-black text-slate-800" style={{ color: theme.primary }}>
                ₱{finalTotalPesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="space-y-2 mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Select Active Project:</span>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full h-12 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm font-bold outline-none focus:border-slate-400"
              >
                <option value="">-- Pumili ng Proyekto --</option>
                {activeProjects.map((proj: any) => (
                  <option key={proj.id} value={proj.id}>{proj.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2 mb-4 mt-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Direct Sale (Benta):</span>
              <div className="grid grid-cols-2 gap-2">
                <Button 
                  onClick={() => { setShowMobileCart(false); setShowCashModal(true); }}
                  disabled={cart.length === 0 || isProcessing}
                  className="h-12 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl gap-1.5 flex items-center justify-center text-xs shadow-lg"
                >
                  <Coins className="h-4 w-4" /> Cash
                </Button>
                <Button 
                  onClick={() => { setShowMobileCart(false); setShowGCashQr(true); }}
                  disabled={cart.length === 0 || isProcessing}
                  className="h-12 text-white font-bold rounded-xl gap-1.5 flex items-center justify-center text-xs border-none cursor-pointer shadow-lg"
                  style={{ backgroundColor: '#007aff', boxShadow: '0 8px 16px -4px #007aff40' }}
                >
                  <Receipt className="h-4 w-4" /> GCash
                </Button>
              </div>
            </div>

            <Button 
              onClick={() => {
                setShowMobileCart(false);
                handleDispatch();
              }} 
              disabled={cart.length === 0 || !selectedProjectId || isProcessing}
              className="w-full h-14 rounded-[16px] text-lg font-black shadow-lg"
              style={{ backgroundColor: theme.primary, color: theme.primaryText }}
            >
              {isProcessing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Send className="mr-2 h-5 w-5" />}
              DISPATCH TO PROJECT
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* GCash Modal */}
      <GCashQrModal
        open={showGCashQr}
        onClose={() => setShowGCashQr(false)}
        totalAmount={finalTotalCentavos}
        tenantName={currentTenant?.name || "Katuwang Store"}
        paymentType="gcash"
        onPaymentVerified={async (paymentMethod, gcashRef) => {
          setShowGCashQr(false);
          await handleCheckout(paymentMethod, gcashRef);
        }}
        theme={theme}
      />

      {/* Cash Modal */}
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

      {/* Thermal Receipt */}
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

      {/* Build Stack Estimate Quotation Modal */}
      <EstimateModal
        isOpen={showEstimateModal}
        onClose={() => setShowEstimateModal(false)}
        cartItems={cart}
        totalCentavos={finalTotalCentavos}
        tenantName={currentTenant?.name || 'Hardware Store'}
        themeColor={theme.primary}
      />

      {/* Quick Expense Modal */}
      <QuickExpenseModal
        isOpen={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        tenantId={currentTenant?.id || ''}
        moduleType="build-stack"
        themeColor={theme.primary}
      />

      {/* Barcode Scanner Modal */}
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
    </div>
  );
}
