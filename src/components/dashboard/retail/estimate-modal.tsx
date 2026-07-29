'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileText, Printer, CheckCircle } from 'lucide-react';
import { ThermalReceiptPreview } from '@/components/common/thermal-receipt-preview';

interface EstimateModalProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: any[];
  totalCentavos: number;
  tenantName: string;
  themeColor?: string;
}

export function EstimateModal({
  isOpen,
  onClose,
  cartItems,
  totalCentavos,
  tenantName,
  themeColor = '#6366F1'
}: EstimateModalProps) {
  const [contractorName, setContractorName] = useState('');
  const [projectSite, setProjectSite] = useState('');
  const [validDays, setValidDays] = useState('7');
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  const totalPesos = totalCentavos / 100;

  const estimateReceiptData = {
    saleId: `EST-${Math.floor(100000 + Math.random() * 900000)}`,
    items: cartItems.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      price: item.price
    })),
    totalCentavos: totalCentavos,
    paymentMethod: `ESTIMATE (Valid ${validDays} Days)`,
    createdAt: new Date(),
    contractor: contractorName || 'General Client',
    projectSite: projectSite || 'On-Site'
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg rounded-3xl p-6 bg-white border-slate-200">
        <DialogHeader className="text-left space-y-1">
          <DialogTitle className="text-lg font-black text-slate-800 flex items-center gap-2">
            <FileText className="h-5 w-5" style={{ color: themeColor }} />
            <span>Bumuo ng Presyo / Official Estimate</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Gumawa ng opisyal na quotation para sa kontraktor bago mag-checkout.
          </DialogDescription>
        </DialogHeader>

        {!showPrintPreview ? (
          <div className="space-y-4 my-2">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                Pangalan ng Kontraktor / Client
              </label>
              <Input
                type="text"
                value={contractorName}
                onChange={(e) => setContractorName(e.target.value)}
                placeholder="e.g. Engr. Mark / Master Builders"
                className="h-11 text-sm font-bold rounded-xl mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  Project Site / Lokasyon
                </label>
                <Input
                  type="text"
                  value={projectSite}
                  onChange={(e) => setProjectSite(e.target.value)}
                  placeholder="e.g. Phase 2 Block 5"
                  className="h-10 text-xs font-semibold rounded-xl mt-1"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  Validity Period (Days)
                </label>
                <Input
                  type="number"
                  value={validDays}
                  onChange={(e) => setValidDays(e.target.value)}
                  placeholder="7"
                  className="h-10 text-xs font-semibold rounded-xl mt-1"
                />
              </div>
            </div>

            {/* Cart Preview Table */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-2 max-h-40 overflow-y-auto">
              <p className="text-[10px] font-black uppercase text-slate-400">Mga Materyales ({cartItems.length} items):</p>
              {cartItems.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs font-semibold text-slate-700 border-b border-slate-100 pb-1">
                  <span>{item.quantity}x {item.name}</span>
                  <span className="font-black text-slate-900">₱{((item.price * item.quantity) / 100).toFixed(2)}</span>
                </div>
              ))}
              <div className="pt-1 flex justify-between items-center text-sm font-black text-slate-900">
                <span>Kabuuan:</span>
                <span className="text-indigo-600">₱{totalPesos.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose} className="rounded-xl h-10 px-4 font-bold text-xs">
                Isara
              </Button>
              <Button
                onClick={() => setShowPrintPreview(true)}
                className="rounded-xl h-10 px-5 font-black text-xs text-white shadow-md"
                style={{ backgroundColor: themeColor }}
              >
                <Printer className="h-4 w-4 mr-1.5" />
                I-Preview & Print Estimate
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-center gap-2 text-emerald-800 text-xs font-semibold">
              <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>Handa na ang Quotation / Estimate slip!</span>
            </div>

            <div className="border rounded-2xl p-2 bg-slate-50 max-h-[350px] overflow-y-auto">
              <ThermalReceiptPreview
                open={true}
                onClose={() => {}}
                storeName={tenantName}
                items={estimateReceiptData.items}
                totalAmountPesos={totalPesos}
                paymentMethod={estimateReceiptData.paymentMethod}
                transactionId={estimateReceiptData.saleId}
              />
            </div>

            <div className="flex justify-between items-center pt-2">
              <Button variant="outline" onClick={() => setShowPrintPreview(false)} className="rounded-xl h-10 text-xs font-bold">
                ← Edit Info
              </Button>
              <Button onClick={onClose} className="rounded-xl h-10 px-6 font-black text-xs bg-slate-900 text-white">
                Tapos Na
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
