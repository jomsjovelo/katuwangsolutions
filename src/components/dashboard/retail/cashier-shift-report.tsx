"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  BarChart2,
  Coins,
  Receipt,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Loader2,
  TrendingUp,
  ShieldCheck,
  Calendar,
  Wallet,
  ArrowDownRight,
  Info
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSecureCashierStore } from '@/store/use-secure-cashier-store';
import { initializeFirebase } from '@/firebase';
import {
  subscribeToCashierShiftIntents,
  CashierPendingIntentRecord
} from '@/lib/client/hybrid-cash-checkout-manager';
import { CashierShiftReportResponse } from '@/lib/server/benta-cashier-shift-report';

export function CashierShiftReport() {
  const bootstrap = useSecureCashierStore((state) => state.bootstrap);
  const [reportData, setReportData] = useState<CashierShiftReportResponse | null>(null);
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingIntents, setPendingIntents] = useState<CashierPendingIntentRecord[]>([]);

  const activeShiftId = bootstrap?.currentShift?.id;

  // Load report data from server
  const loadReport = async (shiftId?: string) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      setIsLoading(true);
      setError(null);

      const { auth } = initializeFirebase();
      if (!auth.currentUser) {
        throw new Error('Not authenticated.');
      }

      const idToken = await auth.currentUser.getIdToken();
      const url = shiftId
        ? `/api/cashier/benta-shift-report?shiftId=${encodeURIComponent(shiftId)}`
        : '/api/cashier/benta-shift-report';

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${idToken}` },
        signal: controller.signal
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to load shift report.');
      }

      const data: CashierShiftReportResponse = await res.json();
      setReportData(data);
      if (!selectedShiftId && data.currentReport) {
        setSelectedShiftId(data.currentReport.shiftId);
      }
    } catch (err: any) {
      console.error('Failed to load shift report:', err);
      if (err?.name === 'AbortError') {
        setError('Request timed out. Paki-check ang internet koneksyon at subukan muli.');
      } else {
        setError(err?.message || 'Hindi ma-load ang shift report. Paki-check ang koneksyon.');
      }
    } finally {
      clearTimeout(timeoutId);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReport(selectedShiftId || undefined);
  }, [selectedShiftId]);

  // Subscribe to local B-Hybrid pending intents for real-time offline visibility
  useEffect(() => {
    if (!bootstrap?.tenantId || !bootstrap?.staffAccountId) return;
    const targetShift = selectedShiftId || activeShiftId;
    if (!targetShift) return;

    const { auth } = initializeFirebase();
    const authUid = auth.currentUser?.uid || '';
    if (!authUid) return;

    const unsubscribe = subscribeToCashierShiftIntents({
      tenantId: bootstrap.tenantId,
      shiftId: targetShift,
      authUid,
      staffAccountId: bootstrap.staffAccountId,
      onIntentsSnapshot: (intents) => {
        setPendingIntents(intents);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [bootstrap?.tenantId, bootstrap?.staffAccountId, selectedShiftId, activeShiftId]);

  const report = reportData?.currentReport;

  // Compute pending provisional totals
  const pendingSummary = useMemo(() => {
    const activePending = pendingIntents.filter((i) => i.status === 'pending');
    const totalCentavos = activePending.reduce((sum, i) => sum + i.totalCentavos, 0);
    return {
      count: activePending.length,
      totalPesos: totalCentavos / 100
    };
  }, [pendingIntents]);

  const formatPesos = (centavos: number) => {
    return `₱${(centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-h-screen pb-28">
      <main className="p-4 space-y-4 max-w-4xl mx-auto w-full">
        {/* Header Banner */}
        <section className="bg-gradient-to-r from-slate-900 to-indigo-950 rounded-[28px] p-6 text-white shadow-xl relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
            <div>
              <h2 className="text-2xl font-black tracking-tight">Shift Report</h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Sales summary for <span className="font-bold text-white">{report?.cashierDisplayName || bootstrap?.cashierDisplayName || 'Cashier'}</span>
              </p>
            </div>

            <Button
              onClick={() => loadReport(selectedShiftId || undefined)}
              disabled={isLoading}
              size="sm"
              variant="outline"
              className="bg-white/10 hover:bg-white/20 text-white border-white/20 rounded-xl font-bold text-xs gap-1.5 h-10 self-start md:self-auto"
            >
              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
          </div>
        </section>

        {/* Shift Selector */}
        {reportData?.historicalShifts && reportData.historicalShifts.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-xs font-bold text-slate-500 shrink-0">Select Shift:</span>
            {reportData.historicalShifts.map((h) => {
              const isCurrent = h.shiftId === activeShiftId;
              const isSelected = h.shiftId === (selectedShiftId || report?.shiftId);
              return (
                <button
                  key={h.shiftId}
                  onClick={() => setSelectedShiftId(h.shiftId)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all border",
                    isSelected
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  )}
                >
                  {isCurrent ? 'Current Shift (Open)' : `Shift ${h.shiftId.slice(-6)}`}
                  <span className="ml-1.5 text-[10px] opacity-75">
                    ({h.status.toUpperCase()})
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* 1. Loading State Card */}
        {isLoading && !report && (
          <Card className="rounded-2xl border-slate-200 shadow-sm bg-white p-8 text-center">
            <Loader2 className="h-8 w-8 text-indigo-600 animate-spin mx-auto mb-3" />
            <h3 className="text-sm font-black text-slate-800">Kinukuha ang Shift Report...</h3>
            <p className="text-xs text-slate-500 mt-1">Sinisigurado ang opisyal na talaan ng benta.</p>
          </Card>
        )}

        {/* 2. Error State Card with Retry */}
        {error && (
          <Card className="rounded-2xl border-red-200 shadow-sm bg-red-50/70 p-5">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-red-100 rounded-xl text-red-600 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h4 className="text-xs font-black text-red-900 uppercase tracking-wider">Hindi Ma-load ang Report</h4>
                <p className="text-xs text-red-700 font-medium mt-0.5">{error}</p>
                <div className="mt-3">
                  <Button
                    onClick={() => loadReport(selectedShiftId || undefined)}
                    size="sm"
                    className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl h-8 px-3 gap-1.5"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Subukan Muli (Retry)
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* 3. Empty / No Active Shift State Card */}
        {!isLoading && !error && !report && (
          <Card className="rounded-2xl border-slate-200 shadow-sm bg-white p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-3">
              <Clock className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-black text-slate-800">Walang Aktibong Shift</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Kailangan munang mag-open ng shift sa POS bago makita ang opisyal na sales summary.
            </p>
          </Card>
        )}

        {/* 4. Offline Pending Summary Card (Always visible when pending offline sales exist) */}
        {pendingSummary.count > 0 && !report && (
          <Card className="rounded-2xl border-amber-200 shadow-sm bg-amber-50/80 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-amber-900 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-amber-600" />
                Offline Activity ({pendingSummary.count} nakabinbing benta)
              </span>
              <span className="text-sm font-black text-amber-900">
                ₱{pendingSummary.totalPesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <p className="text-[10px] text-amber-700 mt-1 font-medium">
              May mga benta na naka-save sa device na ito. Awtomatikong mag-s-sync at magpapakita sa authoritative report kapag may internet.
            </p>
          </Card>
        )}

        {/* 5. Authoritative Shift Details & Metrics */}
        {report && (
          <div className="space-y-4">
            {/* Shift Status Card (Duplicate Total Sales removed from header) */}
            <Card className="rounded-2xl border-slate-100 shadow-sm bg-white overflow-hidden">
              <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "h-10 w-10 rounded-xl flex items-center justify-center font-bold",
                    report.status === 'open' ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"
                  )}>
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-black text-slate-900">Shift #{report.shiftId.slice(-8)}</h3>
                      <span className={cn(
                        "text-[9px] font-black uppercase px-2 py-0.5 rounded-full",
                        report.status === 'open' ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-600"
                      )}>
                        {report.status === 'open' ? 'OPEN / ACTIVE' : 'CLOSED'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Opened: {new Date(report.openedAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                      {report.closedAt && ` • Closed: ${new Date(report.closedAt).toLocaleString('en-PH', { timeStyle: 'short' })}`}
                    </p>
                  </div>
                </div>
              </CardContent>

              {/* Main Financial Metrics Grid */}
              <CardContent className="p-5 grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                    <span>Total Sales</span>
                    <BarChart2 className="h-3.5 w-3.5 text-indigo-500" />
                  </div>
                  <div className="text-lg font-black text-slate-900 mt-1">
                    {formatPesos(report.totalGrossSalesCentavos)}
                  </div>
                  <span className="text-[10px] text-slate-400 font-semibold">{report.saleCount} {report.saleCount === 1 ? 'sale' : 'sales'}</span>
                </div>

                <div className={cn(
                  "p-3.5 rounded-xl border",
                  report.profitComplete ? "bg-emerald-50/60 border-emerald-100" : "bg-slate-50 border-slate-100"
                )}>
                  <div className={cn(
                    "flex items-center justify-between text-[10px] font-bold uppercase tracking-wider",
                    report.profitComplete ? "text-emerald-700" : "text-slate-500"
                  )}>
                    <span>Gross Profit</span>
                    <TrendingUp className={cn("h-3.5 w-3.5", report.profitComplete ? "text-emerald-600" : "text-slate-400")} />
                  </div>
                  <div className={cn(
                    "text-lg font-black mt-1",
                    report.profitComplete ? "text-emerald-800" : "text-slate-500 text-sm"
                  )}>
                    {report.profitComplete && report.aggregateGrossProfitCentavos !== null
                      ? formatPesos(report.aggregateGrossProfitCentavos)
                      : 'Unavailable'}
                  </div>
                  <span className={cn("text-[10px] font-semibold", report.profitComplete ? "text-emerald-600" : "text-slate-400")}>
                    {report.profitComplete ? 'Sales minus product cost' : 'Cost data missing'}
                  </span>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                    <span>Starting Cash</span>
                    <Wallet className="h-3.5 w-3.5 text-amber-500" />
                  </div>
                  <div className="text-lg font-black text-slate-900 mt-1">
                    {formatPesos(report.startingCashCentavos)}
                  </div>
                  <span className="text-[10px] text-slate-400 font-semibold">Cash in drawer before sales</span>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                    <span>Expected Cash Drawer</span>
                    <Coins className="h-3.5 w-3.5 text-emerald-500" />
                  </div>
                  <div className="text-lg font-black text-slate-900 mt-1">
                    {formatPesos(report.expectedEndingCashCentavos)}
                  </div>
                  <span className="text-[10px] text-slate-400 font-semibold">
                    {formatPesos(report.startingCashCentavos)} starting cash + {formatPesos(report.cashSalesCentavos)} cash sales = {formatPesos(report.expectedEndingCashCentavos)}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Payment Method Breakdown */}
            <Card className="rounded-2xl border-slate-100 shadow-sm bg-white">
              <CardContent className="p-5 space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <Receipt className="h-3.5 w-3.5 text-indigo-500" /> Payment Breakdown
                </h4>

                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-center">
                    <div className="text-[10px] font-black uppercase text-emerald-700">Cash</div>
                    <div className="text-sm font-black text-emerald-900 mt-0.5">
                      {formatPesos(report.cashSalesCentavos)}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-center">
                    <div className="text-[10px] font-black uppercase text-blue-700">GCash</div>
                    <div className="text-sm font-black text-blue-900 mt-0.5">
                      {formatPesos(report.gcashSalesCentavos)}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-teal-50 border border-teal-100 text-center">
                    <div className="text-[10px] font-black uppercase text-teal-700">Maya</div>
                    <div className="text-sm font-black text-teal-900 mt-0.5">
                      {formatPesos(report.mayaSalesCentavos)}
                    </div>
                  </div>
                </div>

                {report.discountTotalCentavos > 0 && (
                  <div className="flex justify-between items-center text-xs font-bold text-amber-700 bg-amber-50 p-2.5 rounded-xl border border-amber-100">
                    <span>Discounts Given:</span>
                    <span>-{formatPesos(report.discountTotalCentavos)}</span>
                  </div>
                )}

                {report.varianceCentavos !== null && (
                  <div className={cn(
                    "flex justify-between items-center text-xs font-bold p-2.5 rounded-xl border",
                    report.varianceCentavos === 0
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : "bg-red-50 text-red-800 border-red-200"
                  )}>
                    <span>Drawer Variance (Over/Short):</span>
                    <span>{report.varianceCentavos > 0 ? `+${formatPesos(report.varianceCentavos)}` : formatPesos(report.varianceCentavos)}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Sync Status Section */}
            <Card className="rounded-2xl border-slate-100 shadow-sm bg-white overflow-hidden">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-amber-500" /> Sync Status
                  </h4>
                  <span className={cn(
                    "text-[9px] font-black uppercase px-2 py-0.5 rounded-full border",
                    pendingSummary.count > 0
                      ? "bg-amber-50 text-amber-700 border-amber-200 animate-pulse"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200"
                  )}>
                    {pendingSummary.count > 0 ? `${pendingSummary.count} Pending` : 'SYNCED'}
                  </span>
                </div>

                {pendingSummary.count > 0 ? (
                  <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-900">
                        Some sales are waiting to sync ({pendingSummary.count})
                      </span>
                      <span className="text-sm font-black text-amber-900">
                        ₱{pendingSummary.totalPesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <p className="text-[10px] text-amber-700 flex items-start gap-1 font-medium">
                      <Info className="h-3 w-3 shrink-0 mt-0.5" />
                      These sales were recorded on this device and will automatically sync when connected to the internet.
                    </p>
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto mb-1" />
                    <p className="text-xs font-bold text-slate-700">All sales are synced.</p>
                    <p className="text-[10px] text-slate-400">No sales waiting to sync.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
