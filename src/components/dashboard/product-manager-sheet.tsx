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
import {
  parsePesoToCentavos,
  formatCentavosToPeso,
  computeSmartPricing,
  SmartPricingResult,
  normalizePesoInputForDisplay
} from '@/lib/shared/pricing-math';
import { Calculator, ChevronDown, ChevronUp, Sparkles, Check, ArrowRight } from 'lucide-react';

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

  // Smart Pricing State (Owner Only)
  const [isSmartPricingOpen, setIsSmartPricingOpen] = useState(false);
  const [smartPricingForm, setSmartPricingForm] = useState({
    purchaseQuantity: '1',
    purchaseUnit: 'pcs',
    supplierCost: '',
    deliveryFreight: '',
    otherAcquisitionCost: '',
    sellingUnit: 'pcs',
    totalSellableQuantity: '',
    sellingPrice: '',
    targetGrossMargin: '',
    isDifferentUnit: false,
    showOptionalCosts: false,
    showExplorePricing: false
  });
  const [initializeStockWithSellable, setInitializeStockWithSellable] = useState(true);

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

        const costStr = productToEdit.costPrice ? (productToEdit.costPrice / 100).toString() : '';
        const saleStr = productToEdit.salePrice ? (productToEdit.salePrice / 100).toString() : '';
        const unitStr = productToEdit.sellingUnit || productToEdit.unit || 'pcs';

        setFormData({
          name: productToEdit.name || '',
          barcode: productToEdit.barcode || productToEdit.sku || '',
          sku: productToEdit.sku || '',
          category: productToEdit.category || '',
          currentStock: stockDisplay,
          minStock: minStockDisplay,
          costPrice: costStr,
          salePrice: saleStr,
          unit: unitStr,
          quantityMode: isMeasured ? 'measured' : 'discrete'
        });

        setSmartPricingForm({
          purchaseQuantity: '1',
          purchaseUnit: unitStr,
          supplierCost: costStr,
          deliveryFreight: '',
          otherAcquisitionCost: '',
          sellingUnit: unitStr,
          totalSellableQuantity: '1',
          sellingPrice: saleStr,
          targetGrossMargin: '',
          isDifferentUnit: false,
          showOptionalCosts: false,
          showExplorePricing: false
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

        setSmartPricingForm({
          purchaseQuantity: '1',
          purchaseUnit: defaultUnit,
          supplierCost: '',
          deliveryFreight: '',
          otherAcquisitionCost: '',
          sellingUnit: defaultUnit,
          totalSellableQuantity: '1',
          sellingPrice: '',
          targetGrossMargin: '',
          isDifferentUnit: false,
          showOptionalCosts: false,
          showExplorePricing: false
        });
        setInitializeStockWithSellable(true);
      }
      setDeleteConfirm(false);
      setError(null);
      setIsSmartPricingOpen(false);
    }
  }, [isOpen, productToEdit, initialBarcode, currentTenant?.businessProfile]);

  const handleUnitChange = (newUnit: string) => {
    const isMeasured = isMeasuredUnit(newUnit);
    setFormData(prev => ({
      ...prev,
      unit: newUnit,
      quantityMode: isMeasured ? 'measured' : 'discrete'
    }));
    setSmartPricingForm(prev => ({
      ...prev,
      sellingUnit: newUnit,
      ...(prev.isDifferentUnit ? {} : { purchaseUnit: newUnit })
    }));
  };

  // Compute Smart Pricing in real time
  const smartPricingCalculation: SmartPricingResult | null = (() => {
    try {
      const suppCentavos = parsePesoToCentavos(smartPricingForm.supplierCost);
      if (!suppCentavos.valid || suppCentavos.centavos < 0) return null;

      const delCentavos = parsePesoToCentavos(smartPricingForm.deliveryFreight);
      const otherCentavos = parsePesoToCentavos(smartPricingForm.otherAcquisitionCost);
      if (!delCentavos.valid || !otherCentavos.valid) return null;

      const purchaseUnit = smartPricingForm.isDifferentUnit ? smartPricingForm.purchaseUnit : formData.unit;
      const sellingUnit = formData.unit;
      const isDiff = smartPricingForm.isDifferentUnit && (purchaseUnit.trim().toLowerCase() !== sellingUnit.trim().toLowerCase());

      const salePriceCent = parsePesoToCentavos(smartPricingForm.sellingPrice);
      const targetMargin = smartPricingForm.targetGrossMargin ? parseFloat(smartPricingForm.targetGrossMargin) : undefined;

      return computeSmartPricing({
        purchaseQuantity: smartPricingForm.purchaseQuantity,
        purchaseUnit: purchaseUnit,
        supplierCostCentavos: suppCentavos.centavos,
        deliveryFreightCentavos: delCentavos.centavos,
        otherAcquisitionCostCentavos: otherCentavos.centavos,
        sellingUnit: sellingUnit,
        sellableQuantity: isDiff ? smartPricingForm.totalSellableQuantity : undefined,
        sellingPriceCentavos: salePriceCent.valid ? salePriceCent.centavos : 0,
        targetGrossMarginPercent: (targetMargin !== undefined && !isNaN(targetMargin) && targetMargin >= 0 && targetMargin <= 95) ? targetMargin : undefined
      });
    } catch {
      return null;
    }
  })();

  // Specific validation diagnostics for helpful UI feedback
  const smartPricingValidation: { isValid: boolean; message: string | null } = (() => {
    const pQtyStr = smartPricingForm.purchaseQuantity?.trim() || '';
    const suppCostStr = smartPricingForm.supplierCost?.trim() || '';
    const purchaseUnit = smartPricingForm.isDifferentUnit ? smartPricingForm.purchaseUnit : formData.unit;
    const sellingUnit = formData.unit;
    const isPurchaseMeasured = isMeasuredUnit(purchaseUnit);
    const isSellingMeasured = isMeasuredUnit(sellingUnit);
    const isDiff = smartPricingForm.isDifferentUnit && (purchaseUnit.trim().toLowerCase() !== sellingUnit.trim().toLowerCase());

    if (!pQtyStr && !suppCostStr) {
      return { isValid: false, message: 'Enter purchase quantity and supplier cost to calculate Smart Pricing.' };
    }

    if (!pQtyStr) {
      return { isValid: false, message: 'Enter the purchase quantity to begin calculating.' };
    }

    if (isPurchaseMeasured) {
      const parsed = parseDecimalToMinor(pQtyStr, 3);
      if (!parsed.valid || parsed.minor <= 0) {
        return { isValid: false, message: 'Enter a valid measured purchase amount (e.g., 10.5 or 0.25 kg).' };
      }
    } else {
      if (!/^\d+$/.test(pQtyStr) || parseInt(pQtyStr, 10) <= 0) {
        return { isValid: false, message: 'Discrete purchase quantity must be a positive whole number (e.g., 10).' };
      }
    }

    if (!suppCostStr) {
      return { isValid: false, message: 'Enter the total supplier cost.' };
    }

    const suppCentavos = parsePesoToCentavos(suppCostStr);
    if (!suppCentavos.valid || suppCentavos.centavos < 0) {
      return { isValid: false, message: 'Enter a valid supplier cost in pesos (e.g., 150 or 150.50).' };
    }

    if (smartPricingForm.deliveryFreight?.trim()) {
      const del = parsePesoToCentavos(smartPricingForm.deliveryFreight);
      if (!del.valid || del.centavos < 0) {
        return { isValid: false, message: 'Delivery freight cost has an invalid format.' };
      }
    }

    if (smartPricingForm.otherAcquisitionCost?.trim()) {
      const other = parsePesoToCentavos(smartPricingForm.otherAcquisitionCost);
      if (!other.valid || other.centavos < 0) {
        return { isValid: false, message: 'Other acquisition cost has an invalid format.' };
      }
    }

    if (smartPricingForm.targetGrossMargin?.trim()) {
      const tm = parseFloat(smartPricingForm.targetGrossMargin);
      if (isNaN(tm) || tm < 0 || tm > 95) {
        return { isValid: false, message: 'Target gross margin must be between 0% and 95%.' };
      }
    }

    if (isDiff) {
      const sQtyStr = smartPricingForm.totalSellableQuantity?.trim() || '';
      if (!sQtyStr) {
        return { isValid: false, message: 'Total sellable quantity is required because the purchase and selling units are different.' };
      }

      if (isSellingMeasured) {
        const parsed = parseDecimalToMinor(sQtyStr, 3);
        if (!parsed.valid || parsed.minor <= 0) {
          return { isValid: false, message: 'Enter a valid measured Total Sellable Quantity (e.g., 50 or 12.5).' };
        }
      } else {
        if (!/^\d+$/.test(sQtyStr) || parseInt(sQtyStr, 10) <= 0) {
          return { isValid: false, message: 'Sellable discrete quantity must be a positive whole number (e.g., 50).' };
        }
      }
    }

    return { isValid: true, message: null };
  })();

  const selectPricingScenario = (scenarioPriceCentavos: number) => {
    const saleFormatted = (scenarioPriceCentavos / 100).toFixed(2);
    setSmartPricingForm(prev => ({
      ...prev,
      sellingPrice: saleFormatted
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant) return;
    
    try {
      setLoading(true);
      setError(null);

      const isSmartActive = isSmartPricingOpen && smartPricingCalculation !== null;
      const isMeasured = isMeasuredUnit(formData.unit);

      // Single Source of Truth: Cost & Sale Price derived from Smart Pricing if active
      const costCentavos = isSmartActive
        ? smartPricingCalculation.costPerSellingUnitCentavos
        : Math.round(parseFloat(formData.costPrice || '0') * 100);

      const saleCentavos = isSmartActive
        ? smartPricingCalculation.sellingPriceCentavos
        : Math.round(parseFloat(formData.salePrice || '0') * 100);

      let payload: any = {
        name: formData.name,
        barcode: formData.barcode.trim() || formData.sku.trim(),
        sku: formData.sku.trim() || formData.barcode.trim(),
        category: formData.category,
        costPrice: costCentavos,
        salePrice: saleCentavos,
        unit: formData.unit,
        isActive: true
      };

      if (isMeasured) {
        let stockMinor = 0;
        if (!productToEdit && isSmartActive && initializeStockWithSellable) {
          // New product + Smart Pricing auto-stock: exact measured minor units
          stockMinor = smartPricingCalculation.sellableSpec.minor ?? Math.round(smartPricingCalculation.sellableSpec.quantity * 1000);
        } else if (productToEdit && isSmartActive) {
          // Existing product: preserve existing stock without change
          stockMinor = productToEdit.stockQuantityMinor !== undefined
            ? productToEdit.stockQuantityMinor
            : (productToEdit.currentStock || 0) * 1000;
        } else {
          const stockParsed = parseDecimalToMinor(formData.currentStock || '0', 3);
          if (!stockParsed.valid) {
            throw new Error('Ilagay ang tamang dami ng stock (hal. 10.500).');
          }
          stockMinor = stockParsed.minor;
        }

        const minStockParsed = parseDecimalToMinor(formData.minStock || '0', 3);
        if (!minStockParsed.valid) {
          throw new Error('Ilagay ang tamang min. stock alert (hal. 1.000).');
        }

        payload = {
          ...payload,
          quantityMode: 'measured',
          sellingUnit: formData.unit,
          quantityScale: 3,
          stockQuantityMinor: stockMinor,
          minStockMinor: minStockParsed.minor,
          currentStock: Math.floor(stockMinor / 1000),
          minStock: Math.floor(minStockParsed.minor / 1000)
        };
      } else {
        let currentStockCount = 0;
        if (!productToEdit && isSmartActive && initializeStockWithSellable) {
          // New product + Smart Pricing auto-stock: exact discrete whole count
          currentStockCount = smartPricingCalculation.sellableSpec.quantity;
        } else if (productToEdit && isSmartActive) {
          // Existing product: preserve existing stock without change
          currentStockCount = productToEdit.currentStock || 0;
        } else {
          currentStockCount = parseInt(formData.currentStock, 10) || 0;
        }

        payload = {
          ...payload,
          quantityMode: 'discrete',
          currentStock: currentStockCount,
          minStock: parseInt(formData.minStock, 10) || 0
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
  const isSmartActive = isSmartPricingOpen && smartPricingCalculation !== null;

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
                  <optgroup label="Measured (By Weight / Volume / Length)">
                    <option value="kg">Kilogram (kg)</option>
                    <option value="g">Gram (g)</option>
                    <option value="l">Liter (l)</option>
                    <option value="ml">Milliliter (ml)</option>
                    <option value="m">Meter (m)</option>
                    <option value="ft">Foot (ft)</option>
                  </optgroup>
                </select>
              </div>
            </div>

            {/* Smart Pricing Calculator (Owner Only) */}
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/30 overflow-hidden transition-all">
              <button
                type="button"
                onClick={() => setIsSmartPricingOpen(!isSmartPricingOpen)}
                className="w-full px-4 py-3.5 min-h-[48px] flex items-center justify-between bg-indigo-50/60 hover:bg-indigo-50 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0">
                    <Calculator className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800">Smart Pricing</span>
                      <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                        Owner Only
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">Calculate landed cost, markup, margin & break-even</p>
                  </div>
                </div>
                {isSmartPricingOpen ? (
                  <ChevronUp className="h-4 w-4 text-slate-500 shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
                )}
              </button>

              {isSmartPricingOpen && (
                <div className="p-4 space-y-4 border-t border-indigo-100/80 bg-white/70">
                  {/* Purchase Quantity and Unit */}
                  <div className="space-y-2">
                    <div className={`grid gap-3 ${smartPricingForm.isDifferentUnit ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                          Purchase Quantity {smartPricingForm.isDifferentUnit ? `(${smartPricingForm.purchaseUnit})` : `(${formData.unit})`}
                        </Label>
                        <Input
                          type="number"
                          min="0.001"
                          step="any"
                          value={smartPricingForm.purchaseQuantity}
                          onChange={e => setSmartPricingForm({ ...smartPricingForm, purchaseQuantity: e.target.value })}
                          placeholder="10"
                          className="h-11 min-h-[44px] rounded-xl border-slate-200 text-xs font-semibold bg-white"
                        />
                      </div>
                      {smartPricingForm.isDifferentUnit && (
                        <div className="space-y-1">
                          <Label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Purchase Unit</Label>
                          <select
                            value={smartPricingForm.purchaseUnit}
                            onChange={e => setSmartPricingForm({ ...smartPricingForm, purchaseUnit: e.target.value })}
                            className="h-11 min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-2.5 font-semibold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
                          >
                            <optgroup label="Discrete">
                              <option value="pcs">Piece (pcs)</option>
                              <option value="pack">Pack</option>
                              <option value="can">Can</option>
                              <option value="btl">Bottle (btl)</option>
                              <option value="box">Box</option>
                              <option value="sack">Sack</option>
                            </optgroup>
                            <optgroup label="Measured">
                              <option value="kg">Kilogram (kg)</option>
                              <option value="g">Gram (g)</option>
                              <option value="l">Liter (l)</option>
                              <option value="ml">Milliliter (ml)</option>
                              <option value="m">Meter (m)</option>
                              <option value="ft">Foot (ft)</option>
                            </optgroup>
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Different Unit Disclosure Toggle */}
                    <div>
                      <label className="inline-flex items-center gap-2 min-h-[44px] px-1 py-1 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={smartPricingForm.isDifferentUnit}
                          onChange={e => setSmartPricingForm({
                            ...smartPricingForm,
                            isDifferentUnit: e.target.checked,
                            ...(!e.target.checked ? { purchaseUnit: formData.unit } : {})
                          })}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                        <span className="text-xs text-slate-600 font-medium">
                          Purchased in a different unit
                        </span>
                      </label>
                    </div>

                    {/* Total Sellable Quantity when units differ */}
                    {smartPricingForm.isDifferentUnit && smartPricingForm.purchaseUnit.trim().toLowerCase() !== formData.unit.trim().toLowerCase() && (
                      <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-1.5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                          <Label className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                            Total Sellable Quantity ({formData.unit})
                          </Label>
                          <span className="text-[10px] font-bold text-amber-800">
                            Required because the purchase and selling units are different.
                          </span>
                        </div>
                        <Input
                          type="number"
                          min="0.001"
                          step="any"
                          required
                          value={smartPricingForm.totalSellableQuantity}
                          onChange={e => setSmartPricingForm({ ...smartPricingForm, totalSellableQuantity: e.target.value })}
                          placeholder={`Hal. 50 ${formData.unit}`}
                          className="h-11 min-h-[44px] rounded-xl border-amber-300 bg-white text-xs font-bold"
                        />
                        <p className="text-[10px] text-amber-700">
                          Specify exact total count of {formData.unit} obtained from {smartPricingForm.purchaseQuantity} {smartPricingForm.purchaseUnit}.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Supplier Cost & Optional Costs Disclosure */}
                  <div className="space-y-2">
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Total Supplier Cost (₱)</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={smartPricingForm.supplierCost}
                          onChange={e => setSmartPricingForm({ ...smartPricingForm, supplierCost: e.target.value })}
                          onBlur={e => {
                            setSmartPricingForm(prev => ({
                              ...prev,
                              supplierCost: normalizePesoInputForDisplay(e.target.value)
                            }));
                          }}
                          placeholder="950.00"
                          className="h-11 min-h-[44px] rounded-xl border-slate-200 text-xs font-semibold bg-white"
                        />
                      </div>

                    {/* Optional Costs Toggle */}
                    <div>
                      <button
                        type="button"
                        onClick={() => setSmartPricingForm({ ...smartPricingForm, showOptionalCosts: !smartPricingForm.showOptionalCosts })}
                        className="min-h-[44px] inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
                      >
                        <span>Add delivery or other costs</span>
                        {smartPricingForm.showOptionalCosts ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>

                      {smartPricingForm.showOptionalCosts && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                          <div className="space-y-1">
                            <Label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Delivery / Freight (₱)</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={smartPricingForm.deliveryFreight}
                              onChange={e => setSmartPricingForm({ ...smartPricingForm, deliveryFreight: e.target.value })}
                              onBlur={e => {
                                setSmartPricingForm(prev => ({
                                  ...prev,
                                  deliveryFreight: normalizePesoInputForDisplay(e.target.value)
                                }));
                              }}
                              placeholder="0.00"
                              className="h-11 min-h-[44px] rounded-xl border-slate-200 text-xs font-semibold bg-white"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Other Acquisition Cost (₱)</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={smartPricingForm.otherAcquisitionCost}
                              onChange={e => setSmartPricingForm({ ...smartPricingForm, otherAcquisitionCost: e.target.value })}
                              onBlur={e => {
                                setSmartPricingForm(prev => ({
                                  ...prev,
                                  otherAcquisitionCost: normalizePesoInputForDisplay(e.target.value)
                                }));
                              }}
                              placeholder="0.00"
                              className="h-11 min-h-[44px] rounded-xl border-slate-200 text-xs font-semibold bg-white"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                    {/* Selling Price - Primary Price Input */}
                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                        Selling Price (₱ / {formData.unit})
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={smartPricingForm.sellingPrice}
                        onChange={e => setSmartPricingForm({ ...smartPricingForm, sellingPrice: e.target.value })}
                        onBlur={e => {
                          setSmartPricingForm(prev => ({
                            ...prev,
                            sellingPrice: normalizePesoInputForDisplay(e.target.value)
                          }));
                        }}
                        placeholder="115.00"
                        className="h-11 min-h-[44px] rounded-xl border-slate-200 text-xs font-semibold bg-white"
                      />
                    </div>

                  {/* Real-time Calculation Breakdown Card */}
                  {smartPricingCalculation ? (
                    <div className="p-3.5 bg-slate-900 text-white rounded-xl space-y-3 shadow-sm">
                      {/* Warning if below break-even / loss */}
                      {smartPricingCalculation.sellingPriceCentavos > 0 &&
                       (smartPricingCalculation.sellingPriceCentavos < smartPricingCalculation.breakEvenPriceCentavos || smartPricingCalculation.projectedGrossProfitCentavos < 0) && (
                        <div className="p-2.5 bg-rose-950/80 border border-rose-600 text-rose-200 text-xs font-medium rounded-lg flex items-center gap-2">
                          <span className="shrink-0 font-bold">⚠️</span>
                          <span>This price is below landed cost and would produce a projected loss.</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Financial Breakdown</span>
                        <span className="text-[10px] font-bold text-emerald-400">
                          {smartPricingCalculation.markupPercent >= 0 ? `+${smartPricingCalculation.markupPercent}% Markup` : `${smartPricingCalculation.markupPercent}% Markup`}
                        </span>
                      </div>

                      {/* Primary Prioritized Results */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-slate-800/90 p-2.5 rounded-lg border border-slate-700/60">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase">Cost / {formData.unit}</p>
                          <p className="text-sm font-black text-amber-300">₱{formatCentavosToPeso(smartPricingCalculation.costPerSellingUnitCentavos)}</p>
                        </div>
                        <div className="bg-slate-800/90 p-2.5 rounded-lg border border-slate-700/60">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase">Selling Price</p>
                          <p className="text-sm font-black text-white">₱{formatCentavosToPeso(smartPricingCalculation.sellingPriceCentavos)}</p>
                        </div>
                        <div className="bg-slate-800/90 p-2.5 rounded-lg border border-slate-700/60">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase">Projected Gross Profit</p>
                          <p className={`text-sm font-black ${smartPricingCalculation.projectedGrossProfitCentavos >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            ₱{formatCentavosToPeso(smartPricingCalculation.projectedGrossProfitCentavos)}
                          </p>
                        </div>
                        <div className="bg-slate-800/90 p-2.5 rounded-lg border border-slate-700/60">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase">Gross Margin</p>
                          <p className="text-sm font-black text-indigo-300">{smartPricingCalculation.grossMarginPercent}%</p>
                        </div>
                      </div>

                      {/* Secondary Metrics */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1">
                        <div className="bg-slate-800/50 p-2 rounded-lg">
                          <p className="text-[9px] font-semibold text-slate-400 uppercase">Landed Cost</p>
                          <p className="font-bold text-slate-200">₱{formatCentavosToPeso(smartPricingCalculation.totalLandedCostCentavos)}</p>
                        </div>
                        <div className="bg-slate-800/50 p-2 rounded-lg">
                          <p className="text-[9px] font-semibold text-slate-400 uppercase">Revenue</p>
                          <p className="font-bold text-slate-200">₱{formatCentavosToPeso(smartPricingCalculation.projectedRevenueCentavos)}</p>
                        </div>
                        <div className="bg-slate-800/50 p-2 rounded-lg">
                          <p className="text-[9px] font-semibold text-slate-400 uppercase">Markup</p>
                          <p className="font-bold text-slate-200">{smartPricingCalculation.markupPercent}%</p>
                        </div>
                        <div className="bg-slate-800/50 p-2 rounded-lg">
                          <p className="text-[9px] font-semibold text-slate-400 uppercase">Break-even</p>
                          <p className="font-bold text-slate-200">₱{formatCentavosToPeso(smartPricingCalculation.breakEvenPriceCentavos)}</p>
                        </div>
                      </div>

                      {/* Explore Pricing Disclosure */}
                      <div className="pt-2 border-t border-slate-800">
                        <button
                          type="button"
                          onClick={() => setSmartPricingForm({ ...smartPricingForm, showExplorePricing: !smartPricingForm.showExplorePricing })}
                          className="min-h-[44px] w-full flex items-center justify-between text-xs font-bold text-indigo-400 hover:text-indigo-300 cursor-pointer"
                        >
                          <span className="flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5" />
                            <span>Explore Pricing Scenarios</span>
                          </span>
                          {smartPricingForm.showExplorePricing ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>

                        {smartPricingForm.showExplorePricing && (
                          <div className="space-y-3 pt-2">
                            {/* Custom Target Margin Input */}
                            <div className="space-y-1">
                              <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                Custom Target Margin (%)
                              </Label>
                              <Input
                                type="number"
                                min="0"
                                max="95"
                                step="0.1"
                                value={smartPricingForm.targetGrossMargin}
                                onChange={e => setSmartPricingForm({ ...smartPricingForm, targetGrossMargin: e.target.value })}
                                placeholder="e.g. 25"
                                className="h-11 min-h-[44px] rounded-xl border-slate-700 bg-slate-800 text-white text-xs font-semibold placeholder:text-slate-500"
                              />
                            </div>

                            {/* Margin Scenario Buttons */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {smartPricingCalculation.marginScenarios.map(sc => (
                                <div key={sc.targetMarginPercent} className="bg-slate-800 p-2.5 rounded-lg flex items-center justify-between border border-slate-700 gap-2">
                                  <div className="min-w-0">
                                    <div className="text-[11px] font-bold text-white truncate">{sc.label}</div>
                                    <div className="text-[10px] text-slate-400">
                                      ₱{formatCentavosToPeso(sc.targetPriceCentavos)} / {formData.unit} (+₱{formatCentavosToPeso(sc.unitGrossProfitCentavos)} profit)
                                    </div>
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => selectPricingScenario(sc.targetPriceCentavos)}
                                    className="min-h-[44px] min-w-[96px] px-3 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white font-bold text-xs shrink-0 flex items-center justify-center cursor-pointer transition-colors shadow-sm"
                                  >
                                    Use ₱{formatCentavosToPeso(sc.targetPriceCentavos)}
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Stock Initialization Checkbox (New Products Only) */}
                      {!productToEdit ? (
                        <div className="pt-2 border-t border-slate-800">
                          <label htmlFor="initStockCheckbox" className="flex items-center gap-3 min-h-[44px] p-2 rounded-lg hover:bg-slate-800/60 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              id="initStockCheckbox"
                              checked={initializeStockWithSellable}
                              onChange={e => setInitializeStockWithSellable(e.target.checked)}
                              className="h-5 w-5 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                            <span className="text-xs text-slate-200 font-medium">
                              Use purchase quantity as starting stock ({smartPricingCalculation.sellableSpec.quantity} {formData.unit})
                            </span>
                          </label>
                        </div>
                      ) : (
                        <div className="pt-1 text-[10px] text-slate-400">
                          Note: Smart Pricing updates cost and selling price only. Existing stock remains unchanged.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-3.5 bg-slate-100 rounded-xl text-center text-xs text-slate-600 font-medium border border-slate-200/60">
                      {smartPricingValidation.message || 'Enter purchase quantity and supplier cost to calculate Smart Pricing.'}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Read-Only Values to Save Summary (Shown when Smart Pricing is active & valid) */}
            {isSmartActive && (
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Check className="h-4 w-4 text-emerald-600" />
                    Values to Save
                  </span>
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                    Auto-Derived
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="bg-white p-2 rounded-xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Cost Price</p>
                    <p className="font-extrabold text-slate-800">
                      ₱{formatCentavosToPeso(smartPricingCalculation.costPerSellingUnitCentavos)} / {formData.unit}
                    </p>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Sale Price</p>
                    <p className="font-extrabold text-indigo-600">
                      ₱{formatCentavosToPeso(smartPricingCalculation.sellingPriceCentavos)} / {formData.unit}
                    </p>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">{productToEdit ? 'Current Stock' : 'Starting Stock'}</p>
                    <p className="font-extrabold text-slate-800">
                      {!productToEdit && initializeStockWithSellable
                        ? `${smartPricingCalculation.sellableSpec.quantity} ${formData.unit}`
                        : `${formData.currentStock} ${formData.unit}${productToEdit ? ' (Unchanged)' : ''}`}
                    </p>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Low-Stock Alert</p>
                    <p className="font-extrabold text-slate-800">
                      {formData.minStock ? `${formData.minStock} ${formData.unit}` : 'Not set'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Legacy Cost & Sale Price inputs (Hidden when Smart Pricing is active & valid) */}
            {!isSmartActive && (
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
            )}

            {/* Stock Inputs: Current Stock & Min Stock Alert */}
            <div className={`grid gap-4 ${(!isSmartActive || (isSmartActive && (!initializeStockWithSellable || isEditing))) ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {/* Show Current Stock only when Smart Pricing auto-stock is NOT active */}
              {(!isSmartActive || (isSmartActive && (!initializeStockWithSellable || isEditing))) && (
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
              )}
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
