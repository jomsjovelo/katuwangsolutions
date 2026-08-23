"use client";

import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTenant } from '@/app/lib/tenant-context';
import { addProduct, updateProduct, deleteProduct } from '@/firebase/firestore/inventory-actions';
import { Loader2, Trash2, Save, PackagePlus, Camera, Barcode } from 'lucide-react';
import { getModuleTheme } from '@/lib/theme-utils';
import { BarcodeScannerModal } from '@/components/common/barcode-scanner-modal';

import { parseDecimalToMinor, formatMinorToDecimal, isMeasuredUnit } from '@/lib/shared/quantity-math';
import { normalizeBentaProfile } from '@/lib/app-data';

interface ProductManagerSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  productToEdit?: any | null; // null means create new
  initialBarcode?: string;
}

export function ProductManagerSheet({ 
  isOpen, 
  onOpenChange, 
  productToEdit,
  initialBarcode = ''
}: ProductManagerSheetProps) {
  const { currentTenant } = useTenant();
  const theme = getModuleTheme(currentTenant?.moduleType);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    barcode: '',
    sku: '',
    category: '',
    currentStock: '0',
    minStock: '5',
    costPrice: '',
    salePrice: '',
    unit: 'pcs',
    quantityMode: 'discrete' as 'discrete' | 'measured'
  });

  useEffect(() => {
    if (isOpen) {
      if (productToEdit) {
        const isMeasured = productToEdit.quantityMode === 'measured';
        const stockDisplay = isMeasured
          ? (productToEdit.stockQuantityMinor !== undefined ? formatMinorToDecimal(productToEdit.stockQuantityMinor, productToEdit.quantityScale || 3) : (productToEdit.currentStock || 0).toString())
          : (productToEdit.currentStock || 0).toString();
        const minStockDisplay = isMeasured
          ? (productToEdit.minStockMinor !== undefined ? formatMinorToDecimal(productToEdit.minStockMinor, productToEdit.quantityScale || 3) : (productToEdit.minStock || 0).toString())
          : (productToEdit.minStock || 0).toString();

        setFormData({
          name: productToEdit.name || '',
          barcode: productToEdit.barcode || productToEdit.sku || '',
          sku: productToEdit.sku || '',
          category: productToEdit.category || '',
          currentStock: stockDisplay,
          minStock: minStockDisplay,
          costPrice: productToEdit.costPrice ? (productToEdit.costPrice / 100).toString() : '',
          salePrice: productToEdit.salePrice ? (productToEdit.salePrice / 100).toString() : '',
          unit: productToEdit.sellingUnit || productToEdit.unit || 'pcs',
          quantityMode: isMeasured ? 'measured' : 'discrete'
        });
      } else {
        const normalizedProfile = normalizeBentaProfile(currentTenant?.businessProfile);
        const defaultUnit = normalizedProfile === 'fresh_goods' ? 'kg' : 'pcs';
        const defaultMode = isMeasuredUnit(defaultUnit) ? 'measured' : 'discrete';
        setFormData({
          name: '',
          barcode: initialBarcode || '',
          sku: initialBarcode || '',
          category: 'General',
          currentStock: '0',
          minStock: defaultMode === 'measured' ? '1' : '5',
          costPrice: '',
          salePrice: '',
          unit: defaultUnit,
          quantityMode: defaultMode
        });
      }
      setDeleteConfirm(false);
      setError(null);
    }
  }, [isOpen, productToEdit, initialBarcode, currentTenant?.businessProfile]);

  const handleUnitChange = (newUnit: string) => {
    const isMeasured = isMeasuredUnit(newUnit);
    setFormData(prev => ({
      ...prev,
      unit: newUnit,
      quantityMode: isMeasured ? 'measured' : 'discrete'
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant) return;
    
    try {
      setLoading(true);
      setError(null);

      const isMeasured = formData.quantityMode === 'measured' || isMeasuredUnit(formData.unit);

      let payload: any = {
        name: formData.name,
        barcode: formData.barcode.trim() || formData.sku.trim(),
        sku: formData.sku.trim() || formData.barcode.trim(),
        category: formData.category,
        costPrice: Math.round(parseFloat(formData.costPrice || '0') * 100),
        salePrice: Math.round(parseFloat(formData.salePrice || '0') * 100),
        unit: formData.unit,
        isActive: true
      };

      if (isMeasured) {
        const stockParsed = parseDecimalToMinor(formData.currentStock || '0', 3);
        const minStockParsed = parseDecimalToMinor(formData.minStock || '0', 3);
        if (!stockParsed.valid || !minStockParsed.valid) {
          throw new Error('Ilagay ang tamang dami, halimbawa 10.500.');
        }
        payload = {
          ...payload,
          quantityMode: 'measured',
          sellingUnit: formData.unit,
          quantityScale: 3,
          stockQuantityMinor: stockParsed.minor,
          minStockMinor: minStockParsed.minor,
          currentStock: Math.floor(stockParsed.minor / 1000),
          minStock: Math.floor(minStockParsed.minor / 1000)
        };
      } else {
        payload = {
          ...payload,
          quantityMode: 'discrete',
          currentStock: parseInt(formData.currentStock) || 0,
          minStock: parseInt(formData.minStock) || 0
        };
      }

      if (productToEdit) {
        await updateProduct(currentTenant.id, productToEdit.id, payload);
      } else {
        await addProduct(currentTenant.id, payload);
      }
      
      onOpenChange(false);
    } catch (e) {
      const err = e as Error & { code?: string };
      setError(err.message || 'May error sa pag-save ng produkto.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!currentTenant || !productToEdit) return;
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    
    try {
      setLoading(true);
      await deleteProduct(currentTenant.id, productToEdit.id);
      onOpenChange(false);
    } catch (e) {
      const err = e as Error & { code?: string };
      setError(err.message || 'May error sa pag-delete ng produkto.');
    } finally {
      setLoading(false);
    }
  };

  const isEditing = !!productToEdit;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh] sm:h-[85vh] rounded-t-3xl flex flex-col p-0">
        <SheetHeader className="px-6 py-4 border-b border-slate-100 text-left shrink-0">
          <SheetTitle className="text-2xl font-black text-slate-900 flex items-center gap-2">
            {isEditing ? 'Edit Product' : 'Add New Product'}
          </SheetTitle>
          <SheetDescription className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            {isEditing ? 'Pamamahala ng Paninda' : 'Magdagdag ng Paninda'}
          </SheetDescription>
        </SheetHeader>

        <div className="p-6 flex-1 overflow-y-auto">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-xs font-bold border border-red-100">
              {error}
            </div>
          )}

          <form id="product-form" onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Product Name</Label>
              <Input 
                required
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                placeholder="Hal. Kopiko Brown 27.5g"
                className="h-12 rounded-xl border-slate-200 focus:ring-slate-300 font-medium"
              />
            </div>

            {/* Barcode & SKU Field with Camera Scanner */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Barcode className="h-4 w-4 text-slate-600" />
                  <span>Barcode / SKU (Optional)</span>
                </Label>
                <Button
                  type="button"
                  onClick={() => setShowScanner(true)}
                  className="h-7 px-2.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold text-[11px] flex items-center gap-1 cursor-pointer border border-indigo-200"
                >
                  <Camera className="h-3.5 w-3.5" />
                  <span>Scan Barcode</span>
                </Button>
              </div>
              <div className="flex gap-2">
                <Input 
                  value={formData.barcode}
                  onChange={e => setFormData({...formData, barcode: e.target.value, sku: e.target.value})}
                  placeholder="I-scan ang barcode sa pakete o i-type rito..."
                  className="h-12 rounded-xl border-slate-200 font-mono text-xs font-bold tracking-wider"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Category</Label>
                <Input 
                  required
                  value={formData.category}
                  onChange={e => setFormData({...formData, category: e.target.value})}
                  placeholder="Hal. Beverage"
                  className="h-12 rounded-xl border-slate-200 focus:ring-slate-300"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Selling Unit</Label>
                <select
                  value={formData.unit}
                  onChange={e => handleUnitChange(e.target.value)}
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 font-semibold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  <optgroup label="Discrete (Per Piece / Pack)">
                    <option value="pcs">Piece (pcs)</option>
                    <option value="pack">Pack</option>
                    <option value="can">Can</option>
                    <option value="btl">Bottle (btl)</option>
                    <option value="box">Box</option>
                    <option value="sack">Sack</option>
                  </optgroup>
                  <optgroup label="Measured (By Weight / Length)">
                    <option value="kg">Kilogram (kg)</option>
                    <option value="g">Gram (g)</option>
                    <option value="m">Meter (m)</option>
                    <option value="ft">Foot (ft)</option>
                  </optgroup>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Cost Price (₱ / {formData.unit})
                </Label>
                <Input 
                  required
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.costPrice}
                  onChange={e => setFormData({...formData, costPrice: e.target.value})}
                  placeholder="Puhunan"
                  className="h-12 rounded-xl border-slate-200 focus:ring-slate-300"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Sale Price (₱ / {formData.unit})
                </Label>
                <Input 
                  required
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.salePrice}
                  onChange={e => setFormData({...formData, salePrice: e.target.value})}
                  placeholder="Benta"
                  className="h-12 rounded-xl border-slate-200 focus:ring-slate-300"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Current Stock ({formData.unit})
                </Label>
                <Input 
                  required
                  type="number"
                  step={formData.quantityMode === 'measured' ? "0.001" : "1"}
                  min="0"
                  value={formData.currentStock}
                  onChange={e => setFormData({...formData, currentStock: e.target.value})}
                  placeholder={formData.quantityMode === 'measured' ? "Hal. 10.500" : "0"}
                  className="h-12 rounded-xl border-slate-200 focus:ring-slate-300"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Min. Stock Alert ({formData.unit})
                </Label>
                <Input 
                  required
                  type="number"
                  step={formData.quantityMode === 'measured' ? "0.001" : "1"}
                  min="0"
                  value={formData.minStock}
                  onChange={e => setFormData({...formData, minStock: e.target.value})}
                  placeholder={formData.quantityMode === 'measured' ? "Hal. 1.000" : "5"}
                  className="h-12 rounded-xl border-slate-200 focus:ring-slate-300"
                />
              </div>
            </div>
          </form>
        </div>

        <div className="p-4 border-t border-slate-100 bg-white shrink-0 flex gap-3">
          {isEditing && (
            <Button 
              type="button" 
              variant={deleteConfirm ? "destructive" : "outline"}
              onClick={handleDelete}
              disabled={loading}
              className={`h-14 w-14 rounded-2xl shrink-0 ${deleteConfirm ? '' : 'text-red-500 hover:text-red-600 hover:bg-red-50 border-red-100'}`}
            >
              {loading && deleteConfirm ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
            </Button>
          )}
          <Button 
            form="product-form"
            type="submit" 
            disabled={loading}
            style={!loading ? { backgroundColor: theme.primary } : undefined}
            className="w-full h-14 rounded-2xl text-white font-bold shadow-xl active:scale-[0.98] transition-transform"
          >
            {loading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : isEditing ? (
              <><Save className="h-5 w-5 mr-2" /> Save Changes</>
            ) : (
              <><PackagePlus className="h-5 w-5 mr-2" /> Add Product</>
            )}
          </Button>
        </div>
      </SheetContent>

      {/* Embedded Barcode Scanner Camera Modal for Product Creation */}
      <BarcodeScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScanResult={(scannedCode) => {
          setFormData(prev => ({
            ...prev,
            barcode: scannedCode,
            sku: scannedCode
          }));
          setShowScanner(false);
        }}
      />
    </Sheet>
  );
}
