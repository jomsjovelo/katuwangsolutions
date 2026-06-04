"use client"

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import { getModuleTheme } from '@/lib/theme-utils';

interface AiAdvisorProps {
  tenantName: string;
  moduleType: string;
  products: any[];
  sales: any[];
  dailyTotalPesos: number;
}

export function AiAdvisorCard({ tenantName, moduleType, products, sales, dailyTotalPesos }: AiAdvisorProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const theme = getModuleTheme(moduleType);

  const fetchAdvice = async () => {
    setLoading(true);
    setError(null);
    try {
      const lowStockItems = products.filter(p => p.currentStock <= p.minStock && p.currentStock > 0);
      const outOfStockItems = products.filter(p => p.currentStock === 0);

      const payload = {
        tenantName,
        moduleType,
        products: products.map(p => ({
          name: p.name,
          category: p.category || 'General',
          currentStock: p.currentStock || 0,
          minStock: p.minStock || 0,
          salePrice: p.salePrice || 0,
          unit: p.unit || 'pcs'
        })),
        sales: sales.map(s => ({
          totalAmount: s.totalAmount || 0,
          paymentMethod: s.paymentMethod || 'cash'
        })),
        lowStockItems: lowStockItems.map(p => ({
          name: p.name,
          currentStock: p.currentStock,
          minStock: p.minStock,
          salePrice: p.salePrice,
          unit: p.unit || 'pcs'
        })),
        outOfStockItems: outOfStockItems.map(p => ({
          name: p.name,
          currentStock: 0,
          minStock: p.minStock,
          salePrice: p.salePrice,
          unit: p.unit || 'pcs'
        })),
        dailyTotalPesos
      };

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to fetch AI advice");
      }

      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Only fetch automatically if there's enough meaningful data, else wait for manual trigger
    if (sales.length > 0 || products.length > 0) {
      // Small delay to ensure DB hooks have fully populated
      const timer = setTimeout(() => {
        fetchAdvice();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [sales.length, products.length]);

  if (!data && !loading && !error) {
    return (
      <Card className="shadow-sm border-slate-200 bg-gradient-to-br from-indigo-50 to-purple-50 overflow-hidden relative">
        <div className="absolute right-0 top-0 p-4 opacity-10">
          <Sparkles className="w-24 h-24" />
        </div>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-white rounded-xl shadow-sm text-indigo-500">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-headline font-black text-slate-800 text-lg">Katuwang AI Co-Pilot</h3>
              <p className="text-sm text-slate-600 mt-1 mb-4">
                Pindutin para makakuha ng libreng pagsusuri at payo sa iyong negosyo ngayon.
              </p>
              <Button onClick={fetchAdvice} style={{ backgroundColor: theme.primary }} className="text-white font-bold h-9">
                Humingi ng Payo
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-md border-transparent bg-gradient-to-br from-indigo-600 via-purple-600 to-fuchsia-600 overflow-hidden relative text-white">
      {/* Decorative background */}
      <div className="absolute right-0 top-0 p-4 opacity-10 mix-blend-overlay">
        <Sparkles className="w-32 h-32" />
      </div>
      <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-white opacity-5 rounded-full blur-3xl"></div>
      
      <CardHeader className="p-5 pb-2 flex flex-row items-center justify-between relative z-10">
        <CardTitle className="flex items-center gap-2 text-lg font-headline font-black">
          <Sparkles className="h-5 w-5 text-yellow-300" /> Katuwang AI Co-Pilot
        </CardTitle>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={fetchAdvice} 
          disabled={loading}
          className="text-white/80 hover:text-white hover:bg-white/20 h-7 text-[10px] uppercase font-bold tracking-widest"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcwIcon />}
        </Button>
      </CardHeader>

      <CardContent className="p-5 pt-0 space-y-4 relative z-10">
        {loading ? (
          <div className="py-8 flex flex-col items-center justify-center text-white/70 space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-yellow-300" />
            <p className="text-xs font-bold uppercase tracking-widest animate-pulse">Sinusuri ang iyong data...</p>
          </div>
        ) : error ? (
          <div className="bg-red-500/20 border border-red-400/50 p-4 rounded-xl flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-200 shrink-0 mt-0.5" />
            <div className="text-sm text-red-100">
              <p className="font-bold mb-1">May error sa pagkuha ng payo.</p>
              <p className="text-xs opacity-80">{error}</p>
            </div>
          </div>
        ) : data ? (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Advice Paragraph */}
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20 shadow-inner">
              <p className="text-sm leading-relaxed font-medium text-white/90">
                "{data.advice}"
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Key Alerts */}
              {data.keyAlerts && data.keyAlerts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-yellow-300 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> Mga Babala
                  </p>
                  <ul className="space-y-2">
                    {data.keyAlerts.map((alert: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-2 text-xs bg-black/20 p-2.5 rounded-lg border border-white/5">
                        <span className="text-yellow-400 mt-0.5">•</span>
                        <span className="text-white/80 leading-tight">{alert}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Action Steps */}
              {data.actionSteps && data.actionSteps.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Mga Hakbang
                  </p>
                  <ul className="space-y-2">
                    {data.actionSteps.map((step: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-2 text-xs bg-black/20 p-2.5 rounded-lg border border-white/5">
                        <ArrowRight className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />
                        <span className="text-white/80 leading-tight">{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RotateCcwIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  )
}
