'use client';

import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Award, Leaf, TrendingDown, Star } from 'lucide-react';

interface SupplierScorecardSheetProps {
  isOpen: boolean;
  onClose: () => void;
  wasteLogs: any[];
  batches: any[];
  themeColor?: string;
}

export function SupplierScorecardSheet({
  isOpen,
  onClose,
  wasteLogs = [],
  batches = [],
  themeColor = '#10B981'
}: SupplierScorecardSheetProps) {
  // Aggregate stats by supplier
  const supplierStats: Record<string, { totalBatches: number; totalLossCentavos: number; wasteCount: number }> = {};

  batches.forEach((b) => {
    const supp = b.supplier || 'Unknown Supplier';
    if (!supplierStats[supp]) {
      supplierStats[supp] = { totalBatches: 0, totalLossCentavos: 0, wasteCount: 0 };
    }
    supplierStats[supp].totalBatches += 1;
  });

  wasteLogs.forEach((w) => {
    // Check corresponding batch or fallback
    const matchedBatch = batches.find((b) => b.id === w.batchId);
    const supp = matchedBatch?.supplier || 'General Supplier';
    if (!supplierStats[supp]) {
      supplierStats[supp] = { totalBatches: 1, totalLossCentavos: 0, wasteCount: 0 };
    }
    supplierStats[supp].totalLossCentavos += w.totalLossCentavos || 0;
    supplierStats[supp].wasteCount += 1;
  });

  const supplierList = Object.entries(supplierStats).map(([name, stats]) => {
    const lossPesos = stats.totalLossCentavos / 100;
    // Calculate freshness rating (5 stars if zero loss, deducting based on waste ratio)
    const rating = Math.max(1, 5 - Math.min(4, Math.floor(lossPesos / 500)));
    return {
      name,
      ...stats,
      lossPesos,
      rating
    };
  }).sort((a, b) => b.rating - a.rating);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md bg-slate-50 p-6 overflow-y-auto">
        <SheetHeader className="text-left space-y-1 pb-4 border-b border-slate-200">
          <SheetTitle className="text-lg font-black text-slate-800 flex items-center gap-2">
            <Award className="h-5 w-5" style={{ color: themeColor }} />
            <span>Supplier Freshness Scorecard</span>
          </SheetTitle>
          <SheetDescription className="text-xs text-slate-500">
            Suriin ang kalidad at tapon ayon sa iyong mga supplier ng prutas, gulay, at karne.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          {supplierList.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 text-center text-slate-400 space-y-2 border border-slate-200">
              <Leaf className="h-8 w-8 mx-auto text-emerald-400" />
              <p className="text-xs font-bold">Wala pang na-record na Supplier Data.</p>
              <p className="text-[10px] text-slate-400">Mag-log ng deliveries sa Fresh Tally para makita ang scorecard.</p>
            </div>
          ) : (
            supplierList.map((supp, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-2"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-extrabold text-sm text-slate-800">{supp.name}</h4>
                    <p className="text-[10px] font-bold text-slate-400">
                      {supp.totalBatches} Deliveries logged
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 text-amber-500">
                    {Array.from({ length: supp.rating }).map((_, i) => (
                      <Star key={i} className="h-3.5 w-3.5 fill-amber-400" />
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                  <div className="bg-slate-50 p-2 rounded-xl">
                    <span className="text-[9px] font-black uppercase text-slate-400 block">Tapon / Waste</span>
                    <span className="font-extrabold text-slate-700">{supp.wasteCount} Incident(s)</span>
                  </div>
                  <div className="bg-red-50 p-2 rounded-xl">
                    <span className="text-[9px] font-black uppercase text-red-400 block">Total Halagang Nawala</span>
                    <span className="font-extrabold text-red-600">₱{supp.lossPesos.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
