"use client";

import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Receipt, Calendar, Store, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface BillingLog {
  id: string;
  tenantId: string;
  tenantName: string;
  pricingTier: string;
  amount: number;
  type: string;
  timestamp: any;
}

export function AdminBillingLogs() {
  const [logs, setLogs] = useState<BillingLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { db } = initializeFirebase();
    const q = query(collection(db, 'billing_logs'), orderBy('timestamp', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as BillingLog));
      setLogs(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const totalCollected = logs.reduce((acc, log) => acc + log.amount, 0);

  // Prepare chart data
  const revenueByDate = logs.reduce((acc, log) => {
    if (!log.timestamp) return acc;
    const date = new Date(log.timestamp.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    acc[date] = (acc[date] || 0) + log.amount;
    return acc;
  }, {} as Record<string, number>);

  const chartData = Object.keys(revenueByDate).map(date => ({
    date,
    revenue: revenueByDate[date]
  })).reverse();

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-xl border-none col-span-1">
          <CardHeader className="pb-2">
            <CardDescription className="text-white/70 font-bold uppercase tracking-widest text-[10px]">Total Revenue Logged</CardDescription>
            <CardTitle className="text-4xl font-black">₱{totalCollected.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-emerald-100 text-xs font-medium">
              <ArrowUpRight className="h-4 w-4" />
              <span>All time collections via approval</span>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-1 md:col-span-2 shadow-lg border-primary/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-slate-500">Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-[120px] p-0 px-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" hide />
                <YAxis hide />
                <RechartsTooltip 
                  formatter={(value: number) => [`₱${value.toLocaleString()}`, 'Revenue']}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#10B981" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-lg border-primary/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-black uppercase tracking-wider text-slate-800">
            <Receipt className="h-5 w-5 text-primary" /> Payment Ledger
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto min-w-full">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow>
                <TableHead className="font-bold text-xs uppercase tracking-widest py-4">Date</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-widest py-4">Tenant</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-widest py-4">Plan</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-widest py-4">Type</TableHead>
                <TableHead className="text-right font-bold text-xs uppercase tracking-widest py-4">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-slate-400 font-medium">
                    No billing logs found. Approve a tenant to generate a log.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map(log => (
                  <TableRow key={log.id} className="hover:bg-slate-50/50 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Calendar className="h-4 w-4 text-slate-400" />
                        {log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleDateString() : 'Just now'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Store className="h-4 w-4 text-primary" />
                        <span className="font-bold text-slate-800">{log.tenantName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn(
                        "font-bold uppercase tracking-wider text-[10px]",
                        log.pricingTier === 'promo_99' ? "text-amber-600 border-amber-200 bg-amber-50" : 
                        log.pricingTier === 'enterprise' ? "text-purple-600 border-purple-200 bg-purple-50" :
                        "text-slate-600 border-slate-200 bg-slate-50"
                      )}>
                        {log.pricingTier.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 font-bold tracking-widest text-[10px] uppercase">
                        {log.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-black text-slate-900">₱{log.amount.toLocaleString()}</span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
