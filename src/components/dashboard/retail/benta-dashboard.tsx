"use client"

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { useTenant } from '@/app/lib/tenant-context';
import { useInventory } from '@/hooks/use-inventory';
import { useSyncStatus } from '@/hooks/use-sync-status';
import { useCart } from '@/hooks/use-cart';
import { processCheckout, processCreditCheckout, addProduct, deleteSale, CartItem } from '@/firebase/firestore/retail-actions';
import { submitSaleReversal, SaleReversalError, generateIdempotencyKey, validateReversalReason } from '@/lib/client/benta-sale-reversal-client';
import { executeBentaVoid } from '@/lib/client/benta-void-orchestration';
import { isBentaExactPoolCostedSale } from '@/lib/shared/benta-sale-mutation-guard';
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
import { useSecureCashierStore, shouldBlockCheckoutForCashierLock } from '@/store/use-secure-cashier-store';
import { fetchBentaBootstrap, checkoutBenta, CheckoutPaymentMethod } from '@/lib/client/secure-benta-cashier-client';
import { getJournalDB } from '@/lib/offline/journal-db';
import { CashierOfflineSyncCoordinator } from '@/lib/client/cashier-offline-sync-coordinator';
import { getCashierOfflineManager } from '@/lib/client/cashier-offline-manager';
import { CashierLockedOverlay } from './cashier-locked-overlay';
import { CashierWebAuthnDialog } from './cashier-webauthn-dialog';
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
  AlertTriangle,
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

import { computeLineFinancials, formatMinorToDecimal, parseDecimalToMinor } from '@/lib/shared/quantity-math';

const ProductCard = React.memo(({ product, theme, cartQty, addToCart, onSelectMeasured, disabled }: any) => {
  const isMeasured = product.quantityMode === 'measured';
  const outOfStock = isMeasured
    ? (product.stockQuantityMinor !== undefined ? product.stockQuantityMinor <= 0 : (product.currentStock <= 0))
    : product.currentStock <= 0;
  const isLowStock = isMeasured
    ? (product.stockQuantityMinor !== undefined ? product.stockQuantityMinor > 0 && product.stockQuantityMinor <= 5000 : false)
    : (product.currentStock > 0 && product.currentStock <= 5);

  const stockLabel = isMeasured
    ? `${formatMinorToDecimal(product.stockQuantityMinor ?? (product.currentStock * 1000), product.quantityScale || 3)} ${product.sellingUnit || product.unit || 'kg'}`
    : `${product.currentStock} ${product.unit || 'pcs'}`;

  const handleClick = () => {
    if (disabled || outOfStock) return;
    if (isMeasured) {
      if (onSelectMeasured) onSelectMeasured(product);
    } else {
      addToCart(product);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        "bg-white border-2 rounded-2xl p-4 flex flex-col items-center text-center transition-all cursor-pointer relative select-none tap-target",
        outOfStock
          ? "opacity-40 border-slate-100 grayscale cursor-not-allowed"
          : disabled
            ? "opacity-50 border-slate-200 cursor-not-allowed"
            : "border-slate-100 hover:border-slate-200 shadow-sm"
      )}
      style={(!outOfStock && !disabled && cartQty > 0) ? { borderColor: `${theme.primary}60` } : {}}
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
            {isMeasured && <span className="text-[9px] font-medium text-slate-400">/{product.sellingUnit || product.unit || 'kg'}</span>}
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
          {outOfStock ? 'Ubos' : isLowStock ? `Paubos: ${stockLabel}` : stockLabel}
        </Badge>
      </div>
    </div>
  );
});

ProductCard.displayName = 'ProductCard';

const CartItemCard = React.memo(({ item, theme, products, removeFromCart, addToCart, onEditMeasured, isMobile = false, disabled = false }: any) => {
  const padClass = isMobile ? "p-3" : "p-2.5";
  const isMeasured = item.quantityMode === 'measured' || item.quantityMinor !== undefined;

  const lineSubtotalCentavos = isMeasured && typeof item.quantityMinor === 'number'
    ? computeLineFinancials(item.price, item.quantityMinor, item.quantityScale || 3)
    : item.price * item.quantity;

  const measuredLabel = isMeasured && typeof item.quantityMinor === 'number'
    ? `${formatMinorToDecimal(item.quantityMinor, item.quantityScale || 3)} ${item.sellingUnit || item.unit || 'kg'}`
    : `${item.quantity}`;

  return (
    <div className={`flex justify-between items-center bg-slate-50 ${padClass} rounded-xl border border-slate-100`}>
      <div className="flex-1 pr-2">
        <h4 className="font-extrabold text-xs text-slate-800 line-clamp-1">{item.name}</h4>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-[10px] text-slate-400 font-bold">
            ₱{(item.price / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            {isMeasured ? `/${item.sellingUnit || item.unit || 'kg'}` : ' each'}
          </p>
          <span className="text-[10px] font-black text-slate-700">
            = ₱{(lineSubtotalCentavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isMeasured ? (
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              className="min-h-[44px] min-w-[44px] px-3 text-xs font-black rounded-xl border-slate-200 bg-white hover:bg-slate-100 text-slate-700 flex items-center justify-center tap-target shadow-sm active:scale-95 transition-transform"
              onClick={() => {
                if (disabled || !onEditMeasured) return;
                const realProduct = products.find((p: any) => p.id === item.productId) || {
                  id: item.productId,
                  name: item.name,
                  salePrice: item.price,
                  sellingUnit: item.sellingUnit || item.unit || 'kg',
                  unit: item.unit || 'kg',
                  quantityScale: item.quantityScale || 3,
                  stockQuantityMinor: item.stockQuantityMinor
                };
                onEditMeasured(realProduct, item.quantityMinor);
              }}
              title="Baguhin ang timbang/dami"
            >
              {measuredLabel}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              className="h-11 w-11 min-h-[44px] min-w-[44px] p-0 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center tap-target"
              onClick={() => !disabled && removeFromCart(item.productId)}
              title="Alisin sa cart"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              className="h-11 w-11 min-h-[44px] min-w-[44px] p-0 rounded-xl hover:bg-slate-100 border-slate-200 flex items-center justify-center tap-target"
              onClick={() => !disabled && removeFromCart(item.productId)}
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <span className="font-extrabold text-xs w-6 text-center text-slate-800">{item.quantity}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              className="h-11 w-11 min-h-[44px] min-w-[44px] p-0 rounded-xl text-white border-transparent flex items-center justify-center tap-target"
              style={{ backgroundColor: theme.primary }}
              onClick={() => {
                if (disabled) return;
                const realProduct = products.find((p: any) => p.id === item.productId);
                if (realProduct) addToCart(realProduct);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
});

CartItemCard.displayName = 'CartItemCard';

function BentaDashboardContent() {
  const { user } = useUser();
  const isCashier = useSecureCashierStore(state => state.isCashierAuthenticated);
  const cashierBootstrap = useSecureCashierStore(state => state.bootstrap);
  const pendingCheckoutIntent = useSecureCashierStore(state => state.pendingCheckoutIntent);
  const hasPendingIntent = isCashier && !!pendingCheckoutIntent;

  const effectiveUid = user?.uid || (cashierBootstrap ? cashierBootstrap.staffAccountId : 'staff');
  const effectiveName = cashierBootstrap?.cashierDisplayName || user?.displayName || user?.email || 'Cashier';

  const [profile, setProfile] = useState<any>(null);
  const { currentTenant } = useTenant();
  const { isOnline, isSyncing, syncMessage } = useSyncStatus(currentTenant?.id);
  const { products: rawProducts, loading: inventoryLoading } = useInventory();
  const { cart, setCart, addToCart: baseAddToCart, updateCartItemQuantity, removeFromCart: baseRemoveFromCart, clearCart: baseClearCart, totalCentavos, cartItemCount } = useCart();

  const [measuredProductToEdit, setMeasuredProductToEdit] = useState<any | null>(null);
  const [measuredQuantityInput, setMeasuredQuantityInput] = useState<string>('1.000');
  const [showMeasuredModal, setShowMeasuredModal] = useState<boolean>(false);
  const [isEditingCartItem, setIsEditingCartItem] = useState<boolean>(false);

  const products = useMemo(() => {
    if (isCashier && cashierBootstrap?.products) {
      return cashierBootstrap.products.map(p => ({
        id: p.id,
        name: p.name,
        category: p.category,
        barcode: p.barcode,
        salePrice: p.salePrice,
        costPrice: p.salePrice,
        currentStock: p.currentStock,
        stockQuantityMinor: p.stockQuantityMinor,
        quantityMode: p.quantityMode || 'discrete',
        sellingUnit: p.sellingUnit || p.unit,
        quantityScale: p.quantityScale || 3,
        unit: p.unit,
        minStock: p.minStock || 5,
        module: 'benta-snap'
      }));
    }
    return rawProducts;
  }, [isCashier, cashierBootstrap, rawProducts]);

  const openMeasuredModal = useCallback((product: any, existingMinor?: number) => {
    setMeasuredProductToEdit(product);
    if (existingMinor !== undefined) {
      setIsEditingCartItem(true);
      setMeasuredQuantityInput(formatMinorToDecimal(existingMinor, product.quantityScale || 3));
    } else {
      setIsEditingCartItem(false);
      setMeasuredQuantityInput('1.000');
    }
    setShowMeasuredModal(true);
  }, []);

  const handleConfirmMeasuredQuantity = () => {
    if (!measuredProductToEdit) return;
    const scale = measuredProductToEdit.quantityScale || 3;
    const unit = measuredProductToEdit.sellingUnit || measuredProductToEdit.unit || 'kg';
    const parsed = parseDecimalToMinor(measuredQuantityInput || '1', scale);
    if (!parsed.valid || parsed.minor <= 0) {
      setError('Ilagay ang tamang dami, halimbawa 10.500.');
      return;
    }

    const availableMinor = measuredProductToEdit.stockQuantityMinor;
    if (availableMinor !== undefined && Number.isSafeInteger(availableMinor) && parsed.minor > availableMinor) {
      setError(`Hindi sapat ang stock para sa "${measuredProductToEdit.name}". (Available lang: ${formatMinorToDecimal(availableMinor, scale)} ${unit})`);
      return;
    }

    setError(null);
    if (isCashier) useSecureCashierStore.getState().resetCheckoutKey();

    if (isEditingCartItem) {
      const existing = cart.find(c => c.productId === measuredProductToEdit.id);
      if (existing) {
        updateCartItemQuantity(measuredProductToEdit.id, parsed.minor, 'measured');
      } else {
        baseAddToCart(measuredProductToEdit, {
          quantityMinor: parsed.minor,
          sellingUnit: unit,
          quantityScale: scale
        });
      }
    } else {
      baseAddToCart(measuredProductToEdit, {
        quantityMinor: parsed.minor,
        sellingUnit: unit,
        quantityScale: scale
      });
    }

    setShowMeasuredModal(false);
    setMeasuredProductToEdit(null);
    setIsEditingCartItem(false);
  };

  const addToCart = useCallback((product: any) => {
    if (hasPendingIntent) return;
    if (product.quantityMode === 'measured') {
      openMeasuredModal(product);
      return;
    }
    if (isCashier) useSecureCashierStore.getState().resetCheckoutKey();
    baseAddToCart(product);
  }, [hasPendingIntent, isCashier, baseAddToCart, openMeasuredModal]);

  const removeFromCart = useCallback((productId: string) => {
    if (hasPendingIntent) return;
    if (isCashier) useSecureCashierStore.getState().resetCheckoutKey();
    baseRemoveFromCart(productId);
  }, [hasPendingIntent, isCashier, baseRemoveFromCart]);

  const clearCart = useCallback(() => {
    if (hasPendingIntent) return;
    if (isCashier) useSecureCashierStore.getState().resetCheckoutKey();
    baseClearCart();
  }, [hasPendingIntent, isCashier, baseClearCart]);

  useEffect(() => {
    if (!user?.uid || isCashier) return;
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
  }, [user, isCashier]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showExpenseModal, setShowExpenseModal] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const categories = useMemo(() => {
    if (!products) return ['All'];
    const cats = Array.from(
      new Set(products.map((p: any) => p.category).filter(Boolean))
    ) as string[];
    return ['All', ...cats];
  }, [products]);

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

    const matchedProduct = products.find((p: any) => {
      const pBarcode = (p.barcode || '').trim().toLowerCase();
      const pSku = (p.sku || '').trim().toLowerCase();
      const pId = (p.id || '').trim().toLowerCase();
      const pBarcodeNoZero = pBarcode.replace(/^0+/, '');
      const pSkuNoZero = pSku.replace(/^0+/, '');

      return (
        pBarcode === cleanLower ||
        pSku === cleanLower ||
        pId === cleanLower ||
        (noLeadingZero !== '' && (pBarcodeNoZero === noLeadingZero || pSkuNoZero === noLeadingZero))
      );
    });

    if (matchedProduct) {
      if (matchedProduct.currentStock <= 0) {
        setError(`Ubos na ang stock ng "${matchedProduct.name}".`);
        return;
      }
      addToCart(matchedProduct);
      setSuccessMsg(`Naidagdag sa cart: ${matchedProduct.name}`);
      setTimeout(() => setSuccessMsg(null), 2500);
    } else {
      if (!isCashier) {
        setScannedNewBarcode(cleanCode);
        setShowAddProductModal(true);
      } else {
        setError(`Hindi natagpuan ang barcode "${cleanCode}".`);
      }
    }
  };

  const [tingiPrice, setTingiPrice] = useState('');
  const [tingiName, setTingiName] = useState('');
  const [showPalistaInput, setShowPalistaInput] = useState(false);
  const [palistaName, setPalistaName] = useState('');

  const [completedSale, setCompletedSale] = useState<{
    items: CartItem[];
    total: number;
    discountCentavos?: number;
    discountType?: 'percentage' | 'fixed';
    discountReason?: string;
    paymentMethod: string;
    saleId: string;
    pointsEarned?: number;
  } | null>(null);

  const [showVoidReasonDialog, setShowVoidReasonDialog] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidIdempotencyKey, setVoidIdempotencyKey] = useState<string>('');
  const [voidAttemptSaleId, setVoidAttemptSaleId] = useState<string | null>(null);
  const [voidAttemptSale, setVoidAttemptSale] = useState<Record<string, unknown> | null>(null);
  const [voidIsProtected, setVoidIsProtected] = useState<boolean>(false);

  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('fixed');
  const [discountValue, setDiscountValue] = useState<string>('');
  const [discountReason, setDiscountReason] = useState<string>('');

  const discountCentavos = useMemo(() => {
    if (isCashier) return 0;
    const parsedVal = parseFloat(discountValue);
    if (!parsedVal || parsedVal <= 0) return 0;
    if (discountType === 'fixed') {
      return Math.min(Math.round(parsedVal * 100), totalCentavos);
    } else {
      const pct = Math.min(Math.max(parsedVal, 0), 100);
      return Math.round((totalCentavos * pct) / 100);
    }
  }, [isCashier, discountType, discountValue, totalCentavos]);

  const finalTotalCentavos = Math.max(0, totalCentavos - discountCentavos);
  const finalTotalPesos = finalTotalCentavos / 100;

  const [cashTendered, setCashTendered] = useState<string>('');
  const [showCashModal, setShowCashModal] = useState<boolean>(false);

  const theme = getModuleTheme(currentTenant?.moduleType || 'benta-snap');
  useDynamicThemeColor(theme);

  const { activeShift } = useShift();
  const { requireApproval, isOwner } = usePinApproval();

  const handleAddTestProduct = async () => {
    if (!currentTenant?.id) return;
    try {
      setIsProcessing(true);
      setError(null);
      await addProduct(currentTenant.id, {
        name: `Kopiko Black 3-in-1 (${Date.now().toString().slice(-4)})`,
        category: 'Kape at Inumin',
        salePrice: 1500,
        costPrice: 1100,
        currentStock: 24,
        unit: 'pcs',
        minStock: 5,
        module: 'benta-snap'
      });
      setSuccessMsg("Mabilisang produkto naidagdag sa imbentaryo!");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e: any) {
      setError(e.message || "Pumalya ang pagdagdag ng test item.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVoidSale = async (saleId: string) => {
    if (!currentTenant?.id) return;
    if (!isOwner) {
      const isApproved = await requireApproval('Kumpirmahin ang pag-void ng sale.');
      if (!isApproved) {
        setError('Kailangan ang tamang Owner PIN upang mai-void ang transaksyon.');
        return;
      }
    }

    const { db } = initializeFirebase();
    const saleSnap = await getDoc(doc(db, 'tenants', currentTenant.id, 'sales', saleId));
    if (!saleSnap.exists()) {
      setError('Hindi mahanap ang sale.');
      return;
    }
    const saleData = saleSnap.data() as Record<string, unknown>;
    const isProtected = isBentaExactPoolCostedSale(saleData);

    const key = generateIdempotencyKey();
    setVoidAttemptSaleId(saleId);
    setVoidAttemptSale({ ...saleData, id: saleId });
    setVoidIdempotencyKey(key);
    setVoidReason('');
    setVoidIsProtected(isProtected);
    setShowVoidReasonDialog(true);
  };

  const confirmVoidWithReversal = async () => {
    if (!currentTenant?.id || !voidAttemptSaleId || !voidAttemptSale) return;

    const keyToUse = voidIdempotencyKey;
    const saleIdToUse = voidAttemptSaleId;
    const saleData = voidAttemptSale;

    try {
      setIsVoiding(true);
      setError(null);

      const result = await executeBentaVoid({
        tenantId: currentTenant.id,
        sale: saleData,
        reason: voidReason,
        uid: effectiveUid,
        userName: effectiveName,
        submitSaleReversal,
        deleteSale: async (tenantId, saleId, uid, userName) => {
          await deleteSale(tenantId, saleId, uid, userName);
        },
        idempotencyKey: keyToUse,
        onSuccess: () => {
          setShowReceipt(false);
          setSuccessMsg(`Na-void na ang transaksyon #${saleIdToUse.slice(0, 8)}.`);
          setTimeout(() => setSuccessMsg(null), 4000);
          setShowVoidReasonDialog(false);
          setVoidAttemptSaleId(null);
          setVoidAttemptSale(null);
          setVoidIdempotencyKey('');
          setVoidReason('');
          setVoidIsProtected(false);
        },
        lockRef: voidInFlightRef,
      });

      if (result.success) {
      } else if (result.error?.code === 'INVALID_REQUEST') {
        setShowVoidReasonDialog(false);
        setVoidAttemptSaleId(null);
        setVoidAttemptSale(null);
        setVoidIdempotencyKey('');
        setVoidReason('');
        setVoidIsProtected(false);
        setError(result.error.message);
      } else {
        setError(result.error?.message || 'Pumalya ang pag-void ng transaksyon.');
      }
    } catch (err) {
      setError('Pumalya ang pag-void ng transaksyon.');
    } finally {
      setIsVoiding(false);
    }
  };

  const cancelVoidReversal = () => {
    setShowVoidReasonDialog(false);
    setVoidAttemptSaleId(null);
    setVoidAttemptSale(null);
    setVoidIdempotencyKey('');
    setVoidReason('');
    setVoidIsProtected(false);
    setIsVoiding(false);
  };

  const handlePalistaCheckout = async () => {
    if (!currentTenant?.id || cart.length === 0) return;
    if (!palistaName.trim()) {
      setError("Ilagay ang pangalan ng uutang.");
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);

      const saleId = await processCreditCheckout(
        currentTenant.id,
        cart,
        finalTotalCentavos,
        palistaName.trim(),
        new Date(),
        discountCentavos,
        discountType,
        discountReason,
        effectiveUid,
        effectiveName,
        activeShift?.id
      );

      setCompletedSale({
        items: [...cart],
        total: finalTotalCentavos,
        discountCentavos,
        discountType,
        discountReason,
        paymentMethod: 'credit',
        saleId,
        pointsEarned: 0,
      });

      setCart([]);
      setShowMobileCart(false);
      setShowPalistaInput(false);
      setPalistaName('');
      setShowReceipt(true);
      setSuccessMsg("Nailista ang utang! Naitala sa Utang Tracker.");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (e: any) {
      setError(e.message || "Pumalya ang pagtatala ng utang.");
    } finally {
      setIsProcessing(false);
    }
  };

  const syncCoordinatorRef = React.useRef<CashierOfflineSyncCoordinator | null>(null);
  // Synchronous checkout submission lock: prevents duplicate financial commits
  // even if React state updates race. Set before any async work, released on
  // defined result (success or terminal error).
  const checkoutLockRef = React.useRef(false);
  const voidInFlightRef = React.useRef(false);

  useEffect(() => {
    const isHybridEnabled = process.env.NEXT_PUBLIC_BENTA_CASHIER_HYBRID_ENABLED === 'true';
    if (!isCashier || !user || isHybridEnabled) return;

    const coordinator = new CashierOfflineSyncCoordinator({
      getIdToken: async () => {
        try { return (await user.getIdToken()) || null; } catch { return null; }
      },
      onSyncComplete: (res) => {
        if (res.syncedCount > 0) {
          console.info(`[SYNC_COORDINATOR] Synced ${res.syncedCount} claims; remaining: ${res.remainingPending}`);
        }
      },
      onReceiptReconciled: (provNum, authNum) => {
        setCompletedSale(prev => {
          if (prev && prev.saleId === provNum) {
            return { ...prev, saleId: authNum };
          }
          return prev;
        });
      }
    });
    syncCoordinatorRef.current = coordinator;

    return () => {
      coordinator.destroy();
      syncCoordinatorRef.current = null;
    };
  }, [isCashier, user]);

  // Restore cached offline context on mount / offline reload (only for legacy offline mode)
  useEffect(() => {
    const isHybridEnabled = process.env.NEXT_PUBLIC_BENTA_CASHIER_HYBRID_ENABLED === 'true';
    if (isHybridEnabled) return;

    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (!useSecureCashierStore.getState().bootstrap || !isOnline) {
      getCashierOfflineManager().restoreOfflineContext(currentTenant?.id).then(res => {
        if (res.restored && res.bootstrap) {
          useSecureCashierStore.getState().setRestoredOfflineBootstrap(res.bootstrap);
          useSecureCashierStore.getState().setActiveShift(res.bootstrap.currentShift);
        }
      });
    }
  }, [currentTenant?.id]);

  // Lifecycle subscription to hybrid cashier shift intents (durable reload/reconnect recovery)
  useEffect(() => {
    const isHybridEnabled = process.env.NEXT_PUBLIC_BENTA_CASHIER_HYBRID_ENABLED === 'true';
    const activeShift = useSecureCashierStore.getState().activeShift;
    if (!isCashier || !isHybridEnabled || !currentTenant?.id || !user || !activeShift?.id) return;

    const staffAccountId = cashierBootstrap?.staffAccountId || user.uid;

    const finalizedSaleIdsRef = new Set<string>();
    const refreshingSaleIdsRef = new Set<string>();
    const MAX_REFRESH_RETRIES = 2;
    let effectDisposed = false;

    let unsubscribe: (() => void) | null = null;
    import('@/lib/client/hybrid-cash-checkout-manager').then(({ subscribeToCashierShiftIntents }) => {
      unsubscribe = subscribeToCashierShiftIntents({
        tenantId: currentTenant.id,
        staffAccountId,
        authUid: user.uid,
        shiftId: activeShift.id,
        getIdToken: () => user.getIdToken(),
        onReceiptUpdated: async (finalReceipt) => {
          const saleId = finalReceipt.saleId || finalReceipt.receiptNumber;
          // Deduplicate simultaneous receipt callbacks for the same sale.
          // The listener may surface the same finalized intent more than once.
          if (!saleId || finalizedSaleIdsRef.has(saleId)) return;

          useSecureCashierStore.getState().setLastReceipt(finalReceipt);
          setCompletedSale((prev) =>
            prev
              ? { ...prev, saleId }
              : null
          );

          // Skip if already refreshing this sale
          if (refreshingSaleIdsRef.has(saleId)) return;

          // Refresh authoritative restricted bootstrap inventory after
          // hybrid intent acceptance. The standard online checkout already
          // refreshes around lines 884-887; the durable-intent path returns
          // earlier and never refreshed bootstrap. Fetch authoritative
          // bootstrap data — never fabricate stock from receipt data.
          if (!user?.getIdToken) return;

          refreshingSaleIdsRef.add(saleId);
          try {
            let idToken: string;
            try {
              idToken = await user.getIdToken();
            } catch {
              // Cannot get token now; leave in-flight for a later callback to retry
              return;
            }

            let lastErr: any;
            for (let attempt = 0; attempt < MAX_REFRESH_RETRIES; attempt++) {
              if (effectDisposed) return;
              try {
                const tBootStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
                const freshBootstrap = await fetchBentaBootstrap(idToken);
                const tBootEnd = typeof performance !== 'undefined' ? performance.now() : Date.now();
                if (process.env.NODE_ENV !== 'production') {
                  console.info('[CASHIER_PERF_BOOTSTRAP_REFRESH]', {
                    saleId,
                    bootstrapRefreshMs: Number((tBootEnd - tBootStart).toFixed(2))
                  });
                }
                if (effectDisposed) return;
                useSecureCashierStore.getState().setBootstrap(freshBootstrap);
                finalizedSaleIdsRef.add(saleId);
                return;
              } catch (err: any) {
                lastErr = err;
              }
              // Bounded delay before retry — do not poll indefinitely
              if (attempt === 0 && !effectDisposed) {
                await new Promise((resolve) => setTimeout(resolve, 1500));
              }
            }

            // All retries exhausted — do NOT mark as reconciled so a later
            // receipt/reconnect callback can retry. Log for manual intervention.
            console.error('[HYBRID_BOOTSTRAP_REFRESH] Exhausted retries for sale', saleId, ':', lastErr?.message);
          } finally {
            refreshingSaleIdsRef.delete(saleId);
          }
        },
        onStatusChanged: (intentId, status, reason) => {
          if (status === 'needs_review' || status === 'rejected_tampered') {
            console.warn(`[HYBRID_INTENT_STATUS] Intent ${intentId} flagged as ${status}: ${reason || ''}`);
          }
        }
      });
    });

    return () => {
      effectDisposed = true;
      if (unsubscribe) unsubscribe();
    };
  }, [isCashier, currentTenant?.id, user, cashierBootstrap?.staffAccountId, useSecureCashierStore.getState().activeShift?.id]);

  const handleCheckout = async (paymentMethod: string, gcashRef?: string) => {
    if (!currentTenant?.id || cart.length === 0) return;

    const checkoutStartTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

    // Synchronous guard: prevents duplicate financial commits via double-click
    // or rapid re-invocation regardless of React async state timing.
    if (checkoutLockRef.current) {
      return;
    }

    // Validation guards (synchronous, before lock is set — early returns do not need to release)
    if (shouldBlockCheckoutForCashierLock(isCashier, useSecureCashierStore.getState().isLocalLocked)) {
      setError("Naka-lock ang Cashier POS. Paki-unlock muna ang device bago mag-benta.");
      return;
    }

    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

    if (!isOnline) {
      if (!isCashier) {
        setError("Offline ang device. Ang Owner mode ay nangangailangan ng internet.");
        return;
      }
      if (paymentMethod !== 'cash') {
        setError("Offline ang device. Ang GCash at Maya ay nangangailangan ng online connection.");
        return;
      }
    }

    if (isCashier) {
      const activeCashierShift = useSecureCashierStore.getState().activeShift;
      if (!activeCashierShift) {
        setError("Kailangan munang magbukas ng shift bago mag-checkout.");
        return;
      }
      if (isOnline && !user) {
        setError("Authentication required.");
        return;
      }

    // All guards passed — set the synchronous submission lock
    checkoutLockRef.current = true;

      const pendingIntent = useSecureCashierStore.getState().pendingCheckoutIntent;
      const idempotencyKey = pendingIntent ? pendingIntent.idempotencyKey : useSecureCashierStore.getState().getOrCreateCheckoutKey();
      const shiftId = pendingIntent ? pendingIntent.shiftId : activeCashierShift.id;
      const items = pendingIntent
        ? pendingIntent.items
        : cart.map(item => {
            if (item.quantityMode === 'measured') {
              return {
                productId: item.productId,
                quantityMode: 'measured' as const,
                quantityMinor: item.quantityMinor ?? 1000,
                quantityScale: item.quantityScale ?? 3,
                sellingUnit: item.sellingUnit || item.unit || 'kg'
              };
            }
            return {
              productId: item.productId,
              quantity: item.quantity,
              ...(item.quantityMode === 'discrete' ? { quantityMode: 'discrete' as const } : {})
            };
          });
      const effectivePaymentMethod = pendingIntent ? pendingIntent.paymentMethod : (paymentMethod as CheckoutPaymentMethod);
      const effectivePaymentReference = pendingIntent ? pendingIntent.paymentReference : (paymentMethod === 'gcash' || paymentMethod === 'maya' ? gcashRef : undefined);

      useSecureCashierStore.getState().setPendingCheckoutIntent({
        idempotencyKey,
        shiftId,
        items,
        paymentMethod: effectivePaymentMethod,
        paymentReference: effectivePaymentReference
      });

      // 1. Hybrid / Local Cash Execution Path
      const isHybridEnabled = process.env.NEXT_PUBLIC_BENTA_CASHIER_HYBRID_ENABLED === 'true';
      const { isFirestorePersistenceActive } = await import('@/firebase');
      const isPersistenceActive = isFirestorePersistenceActive();

      if (isHybridEnabled && effectivePaymentMethod === 'cash' && currentTenant?.id && user) {
        // If persistence is active, execute durable local checkout
        if (isPersistenceActive) {
          try {
            setIsProcessing(true);
            setError(null);

            const { submitHybridCashSale } = await import('@/lib/client/hybrid-cash-checkout-manager');
            const staffAccountId = cashierBootstrap?.staffAccountId || user.uid;

            const { provisionalReceipt } = await submitHybridCashSale({
              tenantId: currentTenant.id,
              staffAccountId,
              authUid: user.uid,
              shiftId,
              cashierDisplayName: effectiveName,
              catalogDigest: cashierBootstrap?.offlineAuthority?.snapshot?.catalogDigest || '',
              idempotencyKey,
              items: cart.map(item => {
                if (item.quantityMode === 'measured') {
                  return {
                    productId: item.productId,
                    name: item.name,
                    unit: item.unit || 'kg',
                    quantityMode: 'measured' as const,
                    quantityMinor: item.quantityMinor ?? 1000,
                    quantityScale: item.quantityScale ?? 3,
                    sellingUnit: item.sellingUnit || item.unit || 'kg',
                    salePriceCentavos: item.price
                  };
                }
                return {
                  productId: item.productId,
                  name: item.name,
                  unit: item.unit || 'pcs',
                  quantityMode: 'discrete' as const,
                  quantity: item.quantity,
                  salePriceCentavos: item.price
                };
              }),
              cashTenderedCentavos: totalCentavos
            });

            useSecureCashierStore.getState().clearPendingCheckoutIntent();
            useSecureCashierStore.getState().setLastReceipt(provisionalReceipt);

            setCompletedSale({
              items: provisionalReceipt.items.map((it: any) => ({
                productId: it.productId,
                name: it.name,
                price: it.unitPriceCentavos,
                quantity: it.quantity,
                quantityMode: it.quantityMode,
                quantityMinor: it.quantityMinor,
                quantityScale: it.quantityScale,
                sellingUnit: it.sellingUnit,
                unit: it.unit
              })),
              total: provisionalReceipt.totalCentavos,
              paymentMethod: 'cash',
              saleId: `${provisionalReceipt.receiptNumber} (PROVISIONAL)`,
              pointsEarned: 0
            });

            // Cart is cleared immediately after durable local Firestore submission succeeds
            setCart([]);
            setShowMobileCart(false);
            setShowReceipt(true);
            setSuccessMsg(`Benta Kumpleto! ${provisionalReceipt.receiptNumber}`);
            setTimeout(() => setSuccessMsg(null), 4000);

            const tUserVisible = typeof performance !== 'undefined' ? performance.now() - checkoutStartTime : 0;
            if (process.env.NODE_ENV !== 'production') {
              console.info('[CASHIER_PERF_CHECKOUT_USER_VISIBLE]', {
                mode: 'hybrid_cash',
                userVisibleCheckoutMs: Number(tUserVisible.toFixed(2))
              });
            }
            return;
          } catch (e: any) {
            console.error('[HYBRID_CHECKOUT_ERROR]', e);
            // Fail closed: retain cart and display error. DO NOT fall back to legacy queue.
            setError(e.message || "Hindi maitala ang benta sa database ng device. Paki-check ang storage permission.");
            return;
          } finally {
            setIsProcessing(false);
            checkoutLockRef.current = false;
          }
        } else if (!isOnline) {
          // Persistence unavailable and device offline -> fail closed, explain clearly
          setError("Hindi available ang durable storage (Private Browsing / Disabled Storage). Naka-disable ang offline benta sa device na ito.");
          return;
        }
        // If persistence unavailable BUT device is online -> proceed to online server authoritative path below
      }

      // 2. Online Standard Execution Path
      if (isOnline) {
        if (!user) {
          setError("Authentication required.");
          return;
        }

        try {
          setIsProcessing(true);
          setError(null);

          const tTokenStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
          const idToken = await user.getIdToken();
          const tTokenEnd = typeof performance !== 'undefined' ? performance.now() : Date.now();

          const tServerStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
          const receipt = await checkoutBenta(idToken, {
            idempotencyKey,
            shiftId,
            items,
            paymentMethod: effectivePaymentMethod,
            paymentReference: effectivePaymentReference
          });
          const tServerEnd = typeof performance !== 'undefined' ? performance.now() : Date.now();

          useSecureCashierStore.getState().clearPendingCheckoutIntent();
          useSecureCashierStore.getState().setLastReceipt(receipt);

          // Non-blocking background bootstrap refresh
          const tBootStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
          fetchBentaBootstrap(idToken)
            .then(freshBootstrap => {
              const tBootEnd = typeof performance !== 'undefined' ? performance.now() : Date.now();
              if (process.env.NODE_ENV !== 'production') {
                console.info('[CASHIER_PERF_BOOTSTRAP_REFRESH]', {
                  mode: 'standard_online',
                  bootstrapRefreshMs: Number((tBootEnd - tBootStart).toFixed(2))
                });
              }
              useSecureCashierStore.getState().setBootstrap(freshBootstrap);
            })
            .catch(refreshErr => console.warn('Post-checkout bootstrap refresh notice:', refreshErr?.message));

          setCompletedSale({
            items: receipt.items.map((it: any) => ({
              productId: it.productId,
              name: it.name,
              price: it.unitPriceCentavos,
              quantity: it.quantity,
              unit: it.unit
            })),
            total: receipt.totalCentavos,
            paymentMethod: receipt.paymentMethod,
            saleId: receipt.receiptNumber || receipt.saleId,
            pointsEarned: 0
          });

          setCart([]);
          setShowMobileCart(false);
          setShowReceipt(true);
          setSuccessMsg("Benta Kumpleto! Naitala sa server.");
          setTimeout(() => setSuccessMsg(null), 4000);

          const tUserVisible = typeof performance !== 'undefined' ? performance.now() - checkoutStartTime : 0;
          if (process.env.NODE_ENV !== 'production') {
            console.info('[CASHIER_PERF_CHECKOUT_USER_VISIBLE]', {
              mode: 'standard_online',
              tokenAcquisitionMs: Number((tTokenEnd - tTokenStart).toFixed(2)),
              serverCheckoutMs: Number((tServerEnd - tServerStart).toFixed(2)),
              userVisibleCheckoutMs: Number(tUserVisible.toFixed(2))
            });
          }
          return;
        } catch (e: any) {
          if (e?.status === 400 || e?.status === 422 || e?.category === 'invalid_payload') {
            useSecureCashierStore.getState().clearPendingCheckoutIntent();
            setError(e.message || "Hindi ma-proseso ang bayad. Paki-check ang mga detalye.");
            return;
          }
          // On network/service unavailability and Cash payment, fall through to offline manager!
          if (effectivePaymentMethod !== 'cash') {
            setError(e.message || "Hindi ma-proseso ang bayad. May nakabinbing transaksyon; pindutin ang Subukan Muli.");
            return;
          }
        } finally {
          setIsProcessing(false);
          checkoutLockRef.current = false;
        }
      }

      // 2. Strict Offline Cash Checkout Path via CashierOfflineManager
      if (effectivePaymentMethod === 'cash') {
        try {
          setIsProcessing(true);
          setError(null);

          const staffAccountId = useSecureCashierStore.getState().bootstrap?.staffAccountId || user?.uid || '';
          const offlineManager = getCashierOfflineManager();

          const provisionalReceipt = await offlineManager.executeOfflineCashCheckout({
            tenantId: currentTenant.id,
            staffAccountId,
            shiftId,
            cartItems: items,
            idempotencyKey
          });

          useSecureCashierStore.getState().clearPendingCheckoutIntent();

          // Show provisional receipt immediately
          setCompletedSale({
            items: provisionalReceipt.items.map((it) => ({
              productId: it.productId,
              name: it.name,
              price: it.unitPriceCentavos,
              quantity: it.quantity,
              unit: it.unit
            })),
            total: provisionalReceipt.totalCentavos,
            paymentMethod: 'cash',
            saleId: 'PENDING SYNC — PROVISIONAL RECEIPT',
            pointsEarned: 0
          });

          setCart([]);
          setShowMobileCart(false);
          setShowReceipt(true);
          setSuccessMsg(`Benta Kumpleto! Naitala nang offline (${provisionalReceipt.receiptNumber} — PENDING SYNC).`);
          setTimeout(() => setSuccessMsg(null), 4000);

          // Trigger background sync
          syncCoordinatorRef.current?.triggerSync();
        } catch (offlineErr: any) {
          setError(offlineErr.message || "Storage failed. Do not clear app data. Hindi maitala ang offline na benta sa database ng device.");
        } finally {
          setIsProcessing(false);
          checkoutLockRef.current = false;
        }
        return;
      }

      setError("Offline ang device. Ang non-cash payments ay nangangailangan ng online connection.");
      checkoutLockRef.current = false;
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);

      const saleId = await processCheckout(
        currentTenant.id,
        cart,
        finalTotalCentavos,
        paymentMethod,
        gcashRef,
        discountCentavos,
        discountType,
        discountReason,
        effectiveUid,
        effectiveName,
        activeShift?.id
      );

      setCompletedSale({
        items: [...cart],
        total: finalTotalCentavos,
        discountCentavos,
        discountType,
        discountReason,
        paymentMethod,
        saleId,
        pointsEarned: 0,
      });

      setCart([]);
      setShowMobileCart(false);
      setShowReceipt(true);
      setSuccessMsg("Benta Kumpleto! Naitala sa kasaysayan.");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (e: any) {
      setError(e.message || "Pumalya ang transaksyon. Pakisubukan muli.");
    } finally {
      setIsProcessing(false);
      checkoutLockRef.current = false;
    }
  };

  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filteredProducts = useMemo(() => {
    return products.filter((product: any) => {
      const query = (debouncedSearchQuery || '').trim().toLowerCase();
      const queryNoZero = query.replace(/^0+/, '');

      const name = (product.name || '').toLowerCase();
      const category = (product.category || '').toLowerCase();
      const sku = (product.sku || '').toLowerCase();
      const barcode = (product.barcode || '').toLowerCase();
      const id = (product.id || '').toLowerCase();

      const skuNoZero = sku.replace(/^0+/, '');
      const barcodeNoZero = barcode.replace(/^0+/, '');

      const matchesSearch = !query ||
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
            {!isCashier && (
              <>
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
              </>
            )}
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
                      onSelectMeasured={openMeasuredModal}
                      disabled={hasPendingIntent}
                    />
                  );
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
                  disabled={hasPendingIntent || isProcessing}
                  className={cn(
                    "text-[10px] font-bold text-red-500 hover:text-red-600 flex items-center gap-1 tap-target",
                    (hasPendingIntent || isProcessing) && "opacity-40 cursor-not-allowed"
                  )}
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
                        onEditMeasured={openMeasuredModal}
                        disabled={hasPendingIntent || isProcessing}
                      />
                    ))
                  )}
                </div>

                {/* Checkout pricing details block */}
                <div className="border-t border-slate-100 bg-slate-50/70 p-4 space-y-4">
                  {hasPendingIntent && (
                    <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-3.5 space-y-2 animate-in fade-in">
                      <div className="flex items-center gap-2 text-amber-900 font-black text-xs">
                        <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 animate-pulse" />
                        <span>Nakabinbing Transaksyon ({pendingCheckoutIntent.paymentMethod.toUpperCase()})</span>
                      </div>
                      <p className="text-[11px] font-semibold text-amber-800 leading-tight">
                        May nakabinbing bayad. Naka-lock ang cart upang maiwasan ang dobleng singil. Pindutin ang Subukan Muli.
                      </p>
                      <Button
                        onClick={() => handleCheckout(pendingCheckoutIntent.paymentMethod, pendingCheckoutIntent.paymentReference)}
                        disabled={isProcessing}
                        className="w-full h-11 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow-md flex items-center justify-center gap-1.5"
                      >
                        {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Subukan Muli ({pendingCheckoutIntent.paymentMethod.toUpperCase()})</>}
                      </Button>
                    </div>
                  )}

                  {cart.length > 0 && !isCashier && (
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
                      disabled={cart.length === 0 || isProcessing || hasPendingIntent}
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
                      disabled={cart.length === 0 || isProcessing || hasPendingIntent}
                      className="h-12 text-white font-bold shadow-md active:scale-95 transition-all rounded-xl gap-1.5 border-none px-0"
                      style={{ backgroundColor: '#007aff', boxShadow: '0 8px 16px -4px #007aff40' }}
                    >
                      {isProcessing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <><Receipt className="h-4 w-4" /> GCash</>
                      )}
                    </Button>
                    {isCashier ? (
                      <Button
                        onClick={() => setShowMayaQr(true)}
                        disabled={cart.length === 0 || isProcessing || hasPendingIntent}
                        className="h-12 text-white font-bold shadow-md active:scale-95 transition-all rounded-xl gap-1.5 border-none px-0"
                        style={{ backgroundColor: '#00a14b', boxShadow: '0 8px 16px -4px #00a14b40' }}
                      >
                        {isProcessing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <><Receipt className="h-4 w-4" /> Maya</>
                        )}
                      </Button>
                    ) : (
                      <Button
                        onClick={() => setShowPalistaInput(true)}
                        disabled={cart.length === 0 || isProcessing || hasPendingIntent}
                        className="h-12 bg-orange-500 hover:bg-orange-600 text-white font-bold shadow-md shadow-orange-500/20 active:scale-95 transition-transform rounded-xl gap-1.5 px-0"
                      >
                        {isProcessing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <><Tag className="h-4 w-4" /> Palista</>
                        )}
                      </Button>
                    )}
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
                Pindutin ang check-out para makumpleto ang benta.
              </SheetDescription>
            </div>

            <button
              onClick={clearCart}
              disabled={hasPendingIntent || isProcessing}
              className={cn(
                "text-xs font-bold text-red-500 hover:underline flex items-center gap-1 mr-6",
                (hasPendingIntent || isProcessing) && "opacity-40 cursor-not-allowed"
              )}
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
                onEditMeasured={openMeasuredModal}
                isMobile={true}
                disabled={hasPendingIntent || isProcessing}
              />
            ))}
          </div>

          {/* Bottom Total & Actions */}
          <div className="border-t border-slate-100 pt-4 mt-4 space-y-4">
            {hasPendingIntent && (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-3.5 space-y-2 animate-in fade-in">
                <div className="flex items-center gap-2 text-amber-900 font-black text-xs">
                  <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 animate-pulse" />
                  <span>Nakabinbing Transaksyon ({pendingCheckoutIntent.paymentMethod.toUpperCase()})</span>
                </div>
                <p className="text-[11px] font-semibold text-amber-800 leading-tight">
                  May nakabinbing bayad. Naka-lock ang cart upang maiwasan ang dobleng singil. Pindutin ang Subukan Muli.
                </p>
                <Button
                  onClick={() => {
                    setShowMobileCart(false);
                    handleCheckout(pendingCheckoutIntent.paymentMethod, pendingCheckoutIntent.paymentReference);
                  }}
                  disabled={isProcessing}
                  className="w-full h-11 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow-md flex items-center justify-center gap-1.5"
                >
                  {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Subukan Muli ({pendingCheckoutIntent.paymentMethod.toUpperCase()})</>}
                </Button>
              </div>
            )}

            {cart.length > 0 && !isCashier && (
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

            <div className={`grid ${isCashier ? 'grid-cols-3' : 'grid-cols-2'} gap-2 pb-safe`}>
              <Button
                onClick={() => { setShowMobileCart(false); setShowCashModal(true); }}
                disabled={cart.length === 0 || isProcessing || hasPendingIntent}
                className="h-12 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl gap-1.5 flex items-center justify-center text-xs"
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Coins className="h-4 w-4" /> Cash</>}
              </Button>
              <Button
                onClick={() => { setShowMobileCart(false); setShowGCashQr(true); }}
                disabled={cart.length === 0 || isProcessing || hasPendingIntent}
                className="h-12 text-white font-bold rounded-xl gap-1.5 flex items-center justify-center text-xs border-none cursor-pointer"
                style={{ backgroundColor: '#007aff', boxShadow: '0 8px 16px -4px #007aff40' }}
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Receipt className="h-4 w-4" /> GCash</>}
              </Button>
              {isCashier && (
                <Button
                  onClick={() => { setShowMobileCart(false); setShowMayaQr(true); }}
                  disabled={cart.length === 0 || isProcessing || hasPendingIntent}
                  className="h-12 text-white font-bold rounded-xl gap-1.5 flex items-center justify-center text-xs border-none cursor-pointer"
                  style={{ backgroundColor: '#00a14b', boxShadow: '0 8px 16px -4px #00a14b40' }}
                >
                  {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Receipt className="h-4 w-4" /> Maya</>}
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* GCash Payment Modal */}
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

      {/* Tingi / Custom Amount Modal */}
      {!isCashier && (
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
                    salePrice: Math.round(price * 100),
                    costPrice: Math.round(price * 100),
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
      )}

      {/* Cash Tendered / Sukli Modal */}
      {showCashModal && (
        <div role="dialog" aria-label="Cash Payment" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden border border-slate-100 shadow-2xl flex flex-col animate-in slide-in-from-bottom-8 duration-300">
            <div className="px-6 pt-6 pb-4 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
              <div className="font-headline font-black text-lg flex items-center gap-2 text-emerald-800">
                <Coins className="h-5 w-5 text-emerald-600" />
                Cash Payment
              </div>
            </div>
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
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-row gap-2">
              <Button variant="outline" onClick={() => { setShowCashModal(false); setCashTendered(''); }} className="rounded-xl h-12 flex-1 font-bold">
                Bumalik
              </Button>
              <Button
                onClick={() => {
                  if (isProcessing) return;
                  setShowCashModal(false);
                  setCashTendered('');
                  handleCheckout('cash');
                }}
                disabled={!cashTendered || isNaN(parseFloat(cashTendered)) || parseFloat(cashTendered) < finalTotalPesos || isProcessing}
                className="rounded-xl h-12 flex-1 font-bold text-white border-none shadow-md bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20"
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Tapusin ang Sale'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Palista / Store Credit Modal */}
      {!isCashier && (
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
                <div className="flex justify-between text-xs text-orange-600 font-bold">
                  <span>Kasama ang {cart.length} item(s)</span>
                  <span>Walang Interes</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="palistaName" className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                  Pangalan ng Customer
                </Label>
                <Input
                  id="palistaName"
                  placeholder="Hal. Aling Nena, Pareng Boy"
                  value={palistaName}
                  onChange={(e) => setPalistaName(e.target.value)}
                  className="h-12 rounded-xl text-base font-bold"
                />
              </div>

              <DialogFooter className="flex gap-2 pt-2">
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
      )}

      {/* Measured Quantity Dialog / Sheet */}
      <Dialog open={showMeasuredModal} onOpenChange={(open) => {
        setShowMeasuredModal(open);
        if (!open) {
          setMeasuredProductToEdit(null);
          setIsEditingCartItem(false);
        }
      }}>
        <DialogContent className="sm:max-w-md rounded-2xl p-0 overflow-hidden border-0">
          <div className="p-6 bg-slate-900 text-white relative">
            <DialogTitle className="text-xl font-black font-headline text-white flex items-center gap-2">
              <Calculator className="h-5 w-5 text-cyan-400" />
              {isEditingCartItem ? 'Baguhin ang Timbang / Dami' : 'Timbang / Dami'}
            </DialogTitle>
            <DialogDescription className="text-slate-300 mt-1 text-xs">
              {measuredProductToEdit?.name || 'Measured Product'} (₱{((measuredProductToEdit?.salePrice || 0) / 100).toFixed(2)} bawat {measuredProductToEdit?.sellingUnit || measuredProductToEdit?.unit || 'kg'})
            </DialogDescription>
          </div>

          <div className="p-6 space-y-5 bg-white">
            {/* Authoritative Available Stock display */}
            {(() => {
              const availableMinor = measuredProductToEdit?.stockQuantityMinor;
              const scale = measuredProductToEdit?.quantityScale || 3;
              const unit = measuredProductToEdit?.sellingUnit || measuredProductToEdit?.unit || 'kg';
              const isAvailableKnown = availableMinor !== undefined && Number.isSafeInteger(availableMinor);
              const availableStockDisplay = isAvailableKnown
                ? `${formatMinorToDecimal(availableMinor, scale)} ${unit}`
                : 'Hindi limitado';

              return (
                <div className="flex justify-between items-center bg-slate-50 px-3.5 py-2.5 rounded-xl border border-slate-100 text-xs">
                  <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Available Stock:</span>
                  <span className="font-black text-slate-800">{availableStockDisplay}</span>
                </div>
              );
            })()}

            <div className="space-y-2">
              <Label htmlFor="measured-quantity-input" className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                Dami / Timbang ({measuredProductToEdit?.sellingUnit || measuredProductToEdit?.unit || 'kg'})
              </Label>
              <Input
                id="measured-quantity-input"
                type="text"
                inputMode="decimal"
                value={measuredQuantityInput}
                onChange={(e) => setMeasuredQuantityInput(e.target.value)}
                placeholder="Hal. 1.250"
                className="h-14 text-2xl font-black text-slate-900 border-slate-200 focus:ring-2 focus:ring-cyan-500 focus:outline-none focus:border-cyan-500"
                autoFocus
              />
            </div>

            {/* Quick chips (minimum 44px touch targets) */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mabilisang Pindot:</span>
              <div className="grid grid-cols-4 gap-2">
                {['0.250', '0.500', '1.000', '2.000'].map((preset) => (
                  <Button
                    key={preset}
                    type="button"
                    variant="outline"
                    onClick={() => setMeasuredQuantityInput(preset)}
                    className="min-h-[44px] text-xs font-bold rounded-xl border-slate-200 hover:bg-cyan-50 hover:border-cyan-200 tap-target active:scale-95 transition-transform"
                  >
                    {preset} {measuredProductToEdit?.sellingUnit || measuredProductToEdit?.unit || 'kg'}
                  </Button>
                ))}
              </div>
            </div>

            {/* Calculated live formula & over-stock warning */}
            {(() => {
              const scale = measuredProductToEdit?.quantityScale || 3;
              const unit = measuredProductToEdit?.sellingUnit || measuredProductToEdit?.unit || 'kg';
              const parsed = parseDecimalToMinor(measuredQuantityInput || '0', scale);
              const availableMinor = measuredProductToEdit?.stockQuantityMinor;
              const isOverStock = parsed.valid && availableMinor !== undefined && Number.isSafeInteger(availableMinor) && parsed.minor > availableMinor;
              const calculatedCentavos = parsed.valid && parsed.minor > 0
                ? computeLineFinancials(measuredProductToEdit?.salePrice || 0, parsed.minor, scale)
                : 0;

              return (
                <div className="space-y-2">
                  <div className="bg-cyan-50/70 p-4 rounded-xl border border-cyan-100 flex justify-between items-center">
                    <div className="text-left">
                      <span className="text-[10px] font-bold text-cyan-800 uppercase tracking-wider block">Kabuuan para sa item na ito</span>
                      <span className="text-xs text-cyan-600 font-semibold">
                        {measuredQuantityInput || '0'} {unit} × ₱{((measuredProductToEdit?.salePrice || 0) / 100).toFixed(2)}
                      </span>
                    </div>
                    <span className="text-xl font-black text-cyan-950">
                      ₱{(calculatedCentavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  {isOverStock && (
                    <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-bold border border-red-200 flex items-center gap-1.5 animate-in fade-in">
                      <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                      <span>Hindi sapat ang stock (Available lang: {formatMinorToDecimal(availableMinor, scale)} {unit}).</span>
                    </div>
                  )}
                </div>
              );
            })()}

            <DialogFooter className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowMeasuredModal(false);
                  setMeasuredProductToEdit(null);
                  setIsEditingCartItem(false);
                }}
                className="h-12 min-h-[44px] rounded-xl font-bold flex-1"
              >
                Kanselahin
              </Button>
              <Button
                type="button"
                onClick={handleConfirmMeasuredQuantity}
                disabled={!measuredQuantityInput || parseFloat(measuredQuantityInput) <= 0}
                className="h-12 min-h-[44px] rounded-xl font-bold bg-cyan-600 hover:bg-cyan-700 text-white flex-1 shadow-md"
              >
                {isEditingCartItem ? 'I-save sa Cart' : 'Idagdag sa Cart'}
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
        onVoidSale={!isCashier && profile?.role !== 'staff' && completedSale?.saleId ? () => handleVoidSale(completedSale.saleId) : undefined}
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
      {!isCashier && (
        <ProductManagerSheet
          isOpen={showAddProductModal}
          onOpenChange={setShowAddProductModal}
          initialBarcode={scannedNewBarcode}
        />
      )}

      {/* Quick Expense Modal */}
      {!isCashier && (
        <QuickExpenseModal
          isOpen={showExpenseModal}
          onClose={() => setShowExpenseModal(false)}
          tenantId={currentTenant?.id || ''}
          moduleType="benta-snap"
          themeColor={theme.primary}
        />
      )}

      {/* Void Reason Dialog for Reversal */}
      <Dialog open={showVoidReasonDialog} onOpenChange={(open) => { if (!open) cancelVoidReversal(); }}>
        <DialogContent className="sm:max-w-md rounded-2xl p-0 overflow-hidden border-0">
          <div className="p-6 bg-rose-50 border-b border-rose-100">
            <DialogTitle className="text-lg font-black font-headline text-rose-800 flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-rose-600" />
              Dahilan ng Pag-Void
            </DialogTitle>
            <DialogDescription className="text-xs text-rose-600 mt-1">
              I-enter ang dahilan ng pag-void. Hindi ma-void kung walang dahilan.
            </DialogDescription>
          </div>
          <div className="p-6 space-y-4 bg-white">
            <div className="space-y-2">
              <Label htmlFor="void-reason" className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                Dahilan
              </Label>
              <Input
                id="void-reason"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Hal. Customer return, wrong item, etc."
                className="h-12 rounded-xl border-slate-200 focus:ring-2 focus:ring-rose-500 focus:outline-none"
                autoFocus
                maxLength={500}
              />
              <p className="text-[10px] text-slate-400 text-right">{voidReason.length}/500</p>
            </div>
            <DialogFooter className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={cancelVoidReversal}
                className="h-12 min-h-[44px] rounded-xl font-bold flex-1"
              >
                Kanselahin
              </Button>
              <Button
                type="button"
                onClick={confirmVoidWithReversal}
                disabled={voidReason.trim().length === 0 || isVoiding}
                className="h-12 min-h-[44px] rounded-xl font-bold bg-rose-600 hover:bg-rose-700 text-white flex-1 shadow-md"
              >
                {isVoiding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isVoiding ? 'Nai-void...' : 'Io-void ang Sale'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cashier Locked Overlay (WebAuthn Offline Unlock Gate) */}
      {isCashier && <CashierLockedOverlay />}

    </div>
  );
}
