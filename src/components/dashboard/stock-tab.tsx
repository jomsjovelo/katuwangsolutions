'use client';

import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { useInventory } from '@/hooks/use-inventory';
import { useTenant } from '@/app/lib/tenant-context';
import { getModuleTheme } from '@/lib/theme-utils';
import { useFirestore } from '@/firebase/provider';
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { doc, updateDoc, onSnapshot, increment } from 'firebase/firestore';
import { useUser } from '@/firebase/auth/use-user';
import { logInventoryAudit } from '@/firebase/firestore/inventory-actions';
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ProductManagerSheet } from './product-manager-sheet';
import { SupplierManagerSheet } from './suppliers/supplier-manager-sheet';
import { PurchaseOrderModal } from './suppliers/purchase-order-modal';
import { 
  subscribeTenantSuppliers, 
  subscribeTenantPurchaseOrders 
} from '@/firebase/firestore/supplier-actions';
import { SupplierProfile, PurchaseOrder } from '@/lib/schemas/supplier';
import { 
  Package, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Plus, 
  Loader2, 
  ShoppingBag,
  Pencil,
  PackagePlus,
  Truck,
  Building2,
  Phone,
  MapPin,
  Calendar,
  FileText,
  CreditCard,
  ShoppingBasket
} from 'lucide-react';

export function StockTab() {
  const db = useFirestore();
  const { user } = useUser();
  const { currentTenant } = useTenant();
  const { products, lowStockItems, outOfStockItems, loading } = useInventory();
  
  const [profile, setProfile] = useState<any>(null);
  const [isUpdatingId, setIsUpdatingId] = useState<string | null>(null);
  const [inputAmounts, setInputAmounts] = useState<Record<string, string>>({});
  const [isAuditMode, setIsAuditMode] = useState(false);
  
  // Sub-Navigation Tab State inside StockTab
  const [subTab, setSubTab] = useState<'items' | 'suppliers' | 'orders'>('items');

  // Supplier & PO States
  const [suppliers, setSuppliers] = useState<SupplierProfile[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(true);

  // Modals & Sheets
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<any>(null);
  
  const [isSupplierSheetOpen, setIsSupplierSheetOpen] = useState(false);
  const [supplierToEdit, setSupplierToEdit] = useState<SupplierProfile | null>(null);
  const [isPoModalOpen, setIsPoModalOpen] = useState(false);

  const theme = getModuleTheme(currentTenant?.moduleType);

  // Load user profile
  useEffect(() => {
    if (!user) return;
    const userRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userRef, (snap: any) => {
      if (snap.exists()) {
        setProfile(snap.data());
      }
    });
    return () => unsubscribe();
  }, [user]);

  // Subscribe to Suppliers & Purchase Orders
  useEffect(() => {
    if (!currentTenant) return;
    
    setLoadingSuppliers(true);
    setLoadingOrders(true);

    const unsubSuppliers = subscribeTenantSuppliers(
      currentTenant.id,
      (list) => {
        setSuppliers(list);
        setLoadingSuppliers(false);
      },
      () => setLoadingSuppliers(false)
    );

    const unsubOrders = subscribeTenantPurchaseOrders(
      currentTenant.id,
      (list) => {
        setPurchaseOrders(list);
        setLoadingOrders(false);
      },
      () => setLoadingOrders(false)
    );

    return () => {
      unsubSuppliers();
      unsubOrders();
    };
  }, [currentTenant]);

  const handleAction = async (product: any) => {
    if (!currentTenant) return;
    const amount = parseInt(inputAmounts[product.id] || '');
    if (isNaN(amount) || amount < 0) return;
    
    try {
      setIsUpdatingId(product.id);
      
      if (isAuditMode) {
        await logInventoryAudit(
          currentTenant.id,
          user?.uid || 'unknown',
          product.id,
          product.currentStock,
          amount,
          "Routine Physical Audit"
        );
      } else {
        const productRef = doc(db, 'tenants', currentTenant.id, 'products', product.id);
        await updateDoc(productRef, {
          currentStock: increment(amount),
          updatedAt: new Date()
        });
      }
      setInputAmounts(prev => ({...prev, [product.id]: ''}));
    } catch (e) {
      console.error(e);
      alert("May error sa pag-update ng stock.");
    } finally {
      setIsUpdatingId(null);
    }
  };

  const isStaff = profile?.role === 'staff';

  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-h-full">
      <main className="p-4 space-y-5 pb-24 animate-in fade-in duration-300">
        
        {/* Inventory Valuation Header (Owner Only) */}
        {!isStaff && (
          <Card className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border-none text-white p-4 shadow-md rounded-[24px]">
            <span className="text-[9px] font-black uppercase tracking-widest text-cyan-400 block mb-1">
              📦 Inventory Asset Valuation & Profit Potential
            </span>
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div>
                <span className="text-[8px] font-bold text-slate-400 uppercase block">Puhunan sa Stock (Cost)</span>
                <span className="text-sm sm:text-base font-black text-white">
                  ₱{products.reduce((acc, p) => acc + ((p.currentStock || 0) * (p.costPrice || 0) / 100), 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className="text-[8px] font-bold text-slate-400 uppercase block">Halaga kapag Nabenta</span>
                <span className="text-sm sm:text-base font-black text-emerald-400">
                  ₱{products.reduce((acc, p) => acc + ((p.currentStock || 0) * (p.salePrice || 0) / 100), 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className="text-[8px] font-bold text-slate-400 uppercase block">Inaasahang Tubo</span>
                <span className="text-sm sm:text-base font-black text-cyan-300">
                  ₱{Math.max(0, products.reduce((acc, p) => acc + ((p.currentStock || 0) * ((p.salePrice || 0) - (p.costPrice || 0)) / 100), 0)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </Card>
        )}

        {/* 3-Sub-Tab Switcher inside StockTab (No Main Nav Tabs Added) */}
        <div className="bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSubTab('items')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
              subTab === 'items' 
                ? 'bg-slate-900 text-white shadow-sm' 
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Package className="h-4 w-4" />
            <span>Paninda ({products.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('suppliers')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
              subTab === 'suppliers' 
                ? 'bg-slate-900 text-white shadow-sm' 
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Truck className="h-4 w-4" />
            <span>Suppliers ({suppliers.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('orders')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
              subTab === 'orders' 
                ? 'bg-slate-900 text-white shadow-sm' 
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <ShoppingBasket className="h-4 w-4" />
            <span>POs ({purchaseOrders.length})</span>
          </button>
        </div>

        {/* SUB-TAB 1: PRODUCTS / ITEMS LIST */}
        {subTab === 'items' && (
          <div className="space-y-4">
            {/* Header Summary */}
            <div className="grid grid-cols-3 gap-2.5">
              <Card className="bg-white border-slate-200 p-3 shadow-sm rounded-2xl text-center">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">Total Items</span>
                <span className="text-lg font-black text-slate-800">{products.length}</span>
              </Card>
              <Card className="bg-white border-slate-200 p-3 shadow-sm rounded-2xl text-center">
                <span className="text-[8px] font-black text-amber-500 uppercase tracking-widest block">Low Stock</span>
                <span className="text-lg font-black text-amber-600">{lowStockItems.length}</span>
              </Card>
              <Card className="bg-white border-slate-200 p-3 shadow-sm rounded-2xl text-center">
                <span className="text-[8px] font-black text-red-500 uppercase tracking-widest block">Out of Stock</span>
                <span className="text-lg font-black text-red-600">{outOfStockItems.length}</span>
              </Card>
            </div>

            {/* Stock List Card */}
            <Card className="bg-white border-slate-200 shadow-sm rounded-[24px] overflow-hidden">
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between border-b border-slate-100">
                <div>
                  <CardTitle className="text-sm font-black text-slate-800 flex items-center gap-2">
                    <Package className="h-4.5 w-4.5" style={{ color: theme.primary }} />
                    Inventory Grid
                  </CardTitle>
                  <CardDescription className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                    Pamamahala ng mga Paninda
                  </CardDescription>
                </div>
                {!isStaff && (
                  <div className="flex items-center gap-2 text-xs">
                    <Button 
                      onClick={() => setIsPoModalOpen(true)}
                      size="sm"
                      className="h-8 rounded-lg text-[10px] font-bold gap-1 bg-cyan-600 text-white hover:bg-cyan-700"
                    >
                      <ShoppingBasket className="h-3.5 w-3.5" /> Restock PO
                    </Button>
                    <Button 
                      onClick={() => { setProductToEdit(null); setIsManagerOpen(true); }}
                      size="sm"
                      className="h-8 rounded-lg text-[10px] font-bold gap-1 bg-slate-900 text-white hover:bg-slate-800"
                    >
                      <PackagePlus className="h-3.5 w-3.5" /> Add Product
                    </Button>
                    <div className="flex items-center gap-1.5 border-l border-slate-200 pl-2">
                      <Switch checked={isAuditMode} onCheckedChange={setIsAuditMode} id="audit-mode" />
                      <Label htmlFor="audit-mode" className="text-[10px] font-bold text-slate-600 cursor-pointer uppercase tracking-wider">
                        Audit
                      </Label>
                    </div>
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="text-center py-10 space-y-2">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400 mx-auto" />
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Loading stock...</p>
                  </div>
                ) : products.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-xs space-y-2">
                    <ShoppingBag className="h-8 w-8 mx-auto opacity-10" />
                    <p className="font-semibold">Walang nahanap na mga produkto.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {products.map((product) => {
                      const isOut = product.currentStock === 0;
                      const isLow = !isOut && product.currentStock <= product.minStock;
                      
                      return (
                        <div key={product.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                          <div className="space-y-1 pr-4 min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-slate-800 truncate max-w-[150px]">{product.name}</span>
                              {!isStaff && (
                                <button 
                                  onClick={() => { setProductToEdit(product); setIsManagerOpen(true); }}
                                  className="text-slate-400 hover:text-slate-800 transition-colors p-1"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              )}
                              {isOut ? (
                                <Badge className="bg-red-50 text-red-600 border-none font-bold text-[8px] px-1.5 py-0.5 rounded-md uppercase tracking-wider">Ubos na</Badge>
                              ) : isLow ? (
                                <Badge className="bg-amber-50 text-amber-600 border-none font-bold text-[8px] px-1.5 py-0.5 rounded-md uppercase tracking-wider">Paubos na</Badge>
                              ) : (
                                <Badge className="bg-emerald-50 text-emerald-600 border-none font-bold text-[8px] px-1.5 py-0.5 rounded-md uppercase tracking-wider">Ok</Badge>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-3 text-[10px] text-slate-400 font-medium">
                              <span>Stock: <strong className="text-slate-600">{product.currentStock} {product.unit}</strong> / {product.minStock} {product.unit}</span>
                              <span>·</span>
                              <span>Benta: <strong className="text-slate-600">₱{(product.salePrice / 100).toFixed(2)}</strong></span>
                              
                              {!isStaff && (
                                <>
                                  <span>·</span>
                                  <span className="flex items-center gap-0.5 bg-slate-100 px-1 py-0.5 rounded text-slate-500">
                                    Puhunan: ₱{(product.costPrice / 100).toFixed(2)}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <Input 
                              type="number"
                              placeholder={isAuditMode ? "Actual Qty" : "+ Qty"}
                              className="w-16 h-8 text-[10px] px-2 rounded-lg border border-slate-200 text-center focus:outline-none focus:ring-1 focus:ring-slate-300"
                              value={inputAmounts[product.id || ''] || ''}
                              onChange={(e) => setInputAmounts({...inputAmounts, [product.id || '']: e.target.value})}
                            />
                            <Button
                              variant={isAuditMode ? "destructive" : "ghost"}
                              size="sm"
                              disabled={isUpdatingId === product.id || !inputAmounts[product.id || '']}
                              onClick={() => handleAction(product)}
                              className={isAuditMode ? "h-8 rounded-lg text-[10px] font-bold gap-1" : "h-8 rounded-lg text-[10px] font-bold gap-1 text-slate-500 hover:text-white hover:bg-slate-900 border border-slate-200 transition-colors"}
                            >
                              {isUpdatingId === product.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : isAuditMode ? (
                                <><AlertTriangle className="h-3 w-3" /> Audit</>
                              ) : (
                                <><Plus className="h-3 w-3" /> Add</>
                              )}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* SUB-TAB 2: SUPPLIER DIRECTORY */}
        {subTab === 'suppliers' && (
          <Card className="bg-white border-slate-200 shadow-sm rounded-[24px] overflow-hidden">
            <CardHeader className="p-4 pb-3 flex flex-row items-center justify-between border-b border-slate-100">
              <div>
                <CardTitle className="text-sm font-black text-slate-800 flex items-center gap-2">
                  <Truck className="h-4.5 w-4.5 text-cyan-600" />
                  Supplier Directory & Suki Vendors
                </CardTitle>
                <CardDescription className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                  Talaan ng mga Pinagbibilhan ng Paninda
                </CardDescription>
              </div>
              {!isStaff && (
                <Button 
                  onClick={() => { setSupplierToEdit(null); setIsSupplierSheetOpen(true); }}
                  size="sm"
                  className="h-8 rounded-lg text-[10px] font-bold gap-1 bg-cyan-600 text-white hover:bg-cyan-700"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Supplier
                </Button>
              )}
            </CardHeader>

            <CardContent className="p-4">
              {loadingSuppliers ? (
                <div className="text-center py-10 space-y-2">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400 mx-auto" />
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Loading suppliers...</p>
                </div>
              ) : suppliers.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs space-y-3">
                  <Building2 className="h-10 w-10 mx-auto opacity-20 text-slate-400" />
                  <p className="font-bold text-slate-700 text-sm">Wala pang nakarehistrong supplier.</p>
                  <p className="text-slate-500 max-w-xs mx-auto">
                    I-click ang <strong>"Add Supplier"</strong> para irehistro ang iyong mga suki vendor at distributor.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {suppliers.map((supp) => (
                    <div key={supp.id} className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:shadow-md transition-all space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="text-xs font-black text-slate-900">{supp.name}</h4>
                          {supp.contactPerson && (
                            <span className="text-[10px] font-semibold text-slate-500 block">Contact: {supp.contactPerson}</span>
                          )}
                        </div>
                        {!isStaff && (
                          <button 
                            onClick={() => { setSupplierToEdit(supp); setIsSupplierSheetOpen(true); }}
                            className="text-slate-400 hover:text-slate-800 p-1"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="space-y-1 text-[11px] text-slate-600 font-medium pt-1 border-t border-slate-100">
                        {supp.phone && (
                          <div className="flex items-center gap-1.5">
                            <Phone className="h-3 w-3 text-slate-400" />
                            <span>{supp.phone}</span>
                          </div>
                        )}
                        {supp.address && (
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-3 w-3 text-slate-400" />
                            <span className="truncate">{supp.address}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 pt-1">
                          <CreditCard className="h-3 w-3 text-slate-400" />
                          <Badge className="bg-cyan-50 text-cyan-800 border-none font-bold text-[9px]">
                            Terms: {supp.paymentTerms === 'cash' ? 'Cash Only' : `${supp.paymentTerms.replace('credit_', '')}-Day Credit`}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* SUB-TAB 3: PURCHASE ORDERS HISTORY */}
        {subTab === 'orders' && (
          <Card className="bg-white border-slate-200 shadow-sm rounded-[24px] overflow-hidden">
            <CardHeader className="p-4 pb-3 flex flex-row items-center justify-between border-b border-slate-100">
              <div>
                <CardTitle className="text-sm font-black text-slate-800 flex items-center gap-2">
                  <ShoppingBasket className="h-4.5 w-4.5 text-cyan-600" />
                  Purchase Orders & Delivery History
                </CardTitle>
                <CardDescription className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                  Talaan ng mga Restock Deliveries
                </CardDescription>
              </div>
              {!isStaff && (
                <Button 
                  onClick={() => setIsPoModalOpen(true)}
                  size="sm"
                  className="h-8 rounded-lg text-[10px] font-bold gap-1 bg-cyan-600 text-white hover:bg-cyan-700"
                >
                  <Plus className="h-3.5 w-3.5" /> Create PO
                </Button>
              )}
            </CardHeader>

            <CardContent className="p-4">
              {loadingOrders ? (
                <div className="text-center py-10 space-y-2">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400 mx-auto" />
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Loading purchase orders...</p>
                </div>
              ) : purchaseOrders.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs space-y-3">
                  <ShoppingBag className="h-10 w-10 mx-auto opacity-20 text-slate-400" />
                  <p className="font-bold text-slate-700 text-sm">Wala pang Purchase Orders.</p>
                  <p className="text-slate-500 max-w-xs mx-auto">
                    I-click ang <strong>"Create PO"</strong> para mag-log ng bagong delivery ng paninda mula sa supplier.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {purchaseOrders.map((po) => (
                    <div key={po.id} className="p-3.5 rounded-2xl border border-slate-200 bg-white hover:shadow-sm transition-all space-y-2">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-900">{po.poNumber}</span>
                            <Badge className={po.paymentStatus === 'paid' ? 'bg-emerald-50 text-emerald-700 text-[9px]' : 'bg-amber-50 text-amber-700 text-[9px]'}>
                              {po.paymentStatus === 'paid' ? 'Paid' : 'Supplier Credit (Utang)'}
                            </Badge>
                          </div>
                          <span className="text-[10px] font-bold text-slate-500 block mt-0.5">
                            Supplier: <strong>{po.supplierName}</strong>
                          </span>
                        </div>

                        <span className="text-sm font-black text-slate-900">
                          ₱{(po.totalAmountCentavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-600 font-medium pt-2 border-t border-slate-100 flex flex-wrap justify-between gap-2">
                        <span>Items Restocked: <strong>{po.items?.length || 0} paninda</strong></span>
                        {po.createdByName && (
                          <span className="text-[10px] text-slate-400">Logged by: {po.createdByName}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>

      {/* Sheets & Dialog Modals */}
      <ProductManagerSheet 
        isOpen={isManagerOpen} 
        onOpenChange={setIsManagerOpen} 
        productToEdit={productToEdit} 
      />

      <SupplierManagerSheet
        isOpen={isSupplierSheetOpen}
        onClose={() => setIsSupplierSheetOpen(false)}
        supplierToEdit={supplierToEdit}
      />

      <PurchaseOrderModal
        isOpen={isPoModalOpen}
        onClose={() => setIsPoModalOpen(false)}
        suppliers={suppliers}
      />
    </div>
  );
}
