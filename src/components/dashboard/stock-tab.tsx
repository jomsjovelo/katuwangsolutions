'use client';

import React, { useState, useEffect } from 'react';
import { useInventory } from '@/hooks/use-inventory';
import { useTenant } from '@/app/lib/tenant-context';
import { getModuleTheme } from '@/lib/theme-utils';
import { useFirestore } from '@/firebase/provider';
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { doc, getFirestore, updateDoc, onSnapshot, increment } from 'firebase/firestore';
import { app } from '@/firebase/config';
import { useUser } from '@/firebase/auth/use-user';
import { 
  Package, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Plus, 
  Loader2, 
  Eye, 
  EyeOff,
  ShoppingBag
} from 'lucide-react';

export function StockTab() {
  const db = useFirestore();
  const { user } = useUser();
  const { currentTenant } = useTenant();
  const { products, lowStockItems, outOfStockItems, loading } = useInventory();
  
  const [profile, setProfile] = useState<any>(null);
  const [isUpdatingId, setIsUpdatingId] = useState<string | null>(null);
  const [restockAmounts, setRestockAmounts] = useState<Record<string, string>>({});

  const theme = getModuleTheme(currentTenant?.moduleType);

  // Load user profile to verify role
  // FIX S2-3: Using statically imported doc/onSnapshot (imported at top of file)
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

  const handleCustomRestock = async (productId: string) => {
    if (!currentTenant) return;
    const amount = parseInt(restockAmounts[productId] || '0');
    if (isNaN(amount) || amount <= 0) return;
    
    try {
      setIsUpdatingId(productId);
      const productRef = doc(db, 'tenants', currentTenant.id, 'products', productId);
      await updateDoc(productRef, {
        currentStock: increment(amount),
        updatedAt: new Date()
      });
      // Clear input after success
      setRestockAmounts(prev => ({...prev, [productId]: ''}));
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
      <main className="p-4 space-y-6 pb-24 animate-in fade-in duration-300">
        
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
                      <div className="space-y-1 pr-4 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-slate-800 truncate max-w-[150px]">{product.name}</span>
                          {isOut ? (
                            <Badge className="bg-red-50 text-red-600 hover:bg-red-50 border-none font-bold text-[8px] px-1.5 py-0.5 rounded-md uppercase tracking-wider">Ubos na</Badge>
                          ) : isLow ? (
                            <Badge className="bg-amber-50 text-amber-600 hover:bg-amber-50 border-none font-bold text-[8px] px-1.5 py-0.5 rounded-md uppercase tracking-wider">Paubos na</Badge>
                          ) : (
                            <Badge className="bg-emerald-50 text-emerald-600 hover:bg-emerald-50 border-none font-bold text-[8px] px-1.5 py-0.5 rounded-md uppercase tracking-wider">Ok</Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-3 text-[10px] text-slate-400 font-medium">
                          <span>Stock: <strong className="text-slate-600">{product.currentStock} {product.unit}</strong> / {product.minStock} {product.unit}</span>
                          <span>·</span>
                          <span>Benta: <strong className="text-slate-600">₱{(product.salePrice / 100).toFixed(2)}</strong></span>
                          
                          {/* Cost Price: Strictly Hide if Helper (Tindera) logged in */}
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

                      {/* Stock Restock Input & Button */}
                      <div className="flex items-center gap-1.5">
                        <input 
                          type="number"
                          placeholder="+ Qty"
                          className="w-16 h-8 text-[10px] px-2 rounded-lg border border-slate-200 text-center focus:outline-none focus:ring-1 focus:ring-slate-300"
                          value={restockAmounts[product.id || ''] || ''}
                          onChange={(e) => setRestockAmounts({...restockAmounts, [product.id || '']: e.target.value})}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isUpdatingId === product.id || !restockAmounts[product.id || '']}
                          onClick={() => handleCustomRestock(product.id || '')}
                          className="h-8 rounded-lg text-[10px] font-bold gap-1 text-slate-500 hover:text-white hover:bg-slate-900 border border-slate-200 transition-colors"
                        >
                          {isUpdatingId === product.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
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
      </main>
    </div>
  );
}
