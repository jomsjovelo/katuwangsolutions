'use client';

import React, { useState, useMemo } from 'react';
import { useActivityLogs } from '@/hooks/use-activity-logs';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ArrowLeft, Filter, Activity, AlertTriangle, ShoppingCart, Package } from 'lucide-react';
import { isToday, isYesterday } from 'date-fns';

export function ActivityOrganizer({ onClose }: { onClose: () => void }) {
  const { logs, loading } = useActivityLogs();
  const [filter, setFilter] = useState<'all' | 'sale' | 'alert' | 'stock'>('all');

  const filteredLogs = useMemo(() => {
    if (filter === 'all') return logs;
    return logs.filter(log => log.type === filter);
  }, [logs, filter]);

  const groupedLogs = useMemo(() => {
    const groups: { label: string; items: typeof logs }[] = [
      { label: 'Today', items: [] },
      { label: 'Yesterday', items: [] },
      { label: 'Older (Last 7 Days)', items: [] }
    ];

    filteredLogs.forEach(log => {
      const d = new Date(log.timestamp);
      if (isToday(d)) {
        groups[0].items.push(log);
      } else if (isYesterday(d)) {
        groups[1].items.push(log);
      } else {
        groups[2].items.push(log);
      }
    });

    return groups.filter(g => g.items.length > 0);
  }, [filteredLogs]);

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className="bg-white px-4 py-4 border-b border-slate-100 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button 
          onClick={onClose}
          className="p-2 -ml-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-lg font-black text-slate-900 leading-tight">Activity Log</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Last 7 Days</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white px-4 py-3 border-b border-slate-100 flex gap-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setFilter('all')}
          className={cn(
            "px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors",
            filter === 'all' ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          )}
        >
          All Activity
        </button>
        <button
          onClick={() => setFilter('sale')}
          className={cn(
            "px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1.5",
            filter === 'sale' ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-600"
          )}
        >
          <ShoppingCart className="h-3 w-3" /> Sales
        </button>
        <button
          onClick={() => setFilter('alert')}
          className={cn(
            "px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1.5",
            filter === 'alert' ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600 hover:bg-amber-50 hover:text-amber-600"
          )}
        >
          <AlertTriangle className="h-3 w-3" /> Alerts
        </button>
        <button
          onClick={() => setFilter('stock')}
          className={cn(
            "px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1.5",
            filter === 'stock' ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600"
          )}
        >
          <Package className="h-3 w-3" /> Inventory
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <Activity className="h-8 w-8 animate-pulse mb-3" />
            <p className="text-xs font-bold">Loading activity...</p>
          </div>
        ) : groupedLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <Filter className="h-8 w-8 mb-3 opacity-50" />
            <h4 className="text-sm font-bold text-slate-600">No activity found</h4>
            <p className="text-[10px] text-slate-400 mt-1 text-center max-w-[200px]">
              Try changing your filters or check back later. We only show data from the last 7 days.
            </p>
          </div>
        ) : (
          groupedLogs.map((group, gIdx) => (
            <section key={gIdx}>
              <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 px-1">
                {group.label}
              </h3>
              <Card className="rounded-[24px] border-slate-100 shadow-sm overflow-hidden">
                <div className="divide-y divide-slate-100">
                  {group.items.map((activity) => (
                    <div key={activity.id} className="p-4 flex items-center gap-4 hover:bg-slate-50/50 transition-colors">
                      <div className={cn("p-3 rounded-full flex-shrink-0", activity.bg, activity.color)}>
                        <activity.icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-extrabold text-slate-900 truncate">{activity.title}</p>
                        <p className="text-[10px] font-black uppercase text-slate-400 mt-0.5">{activity.time}</p>
                      </div>
                      {activity.amount !== null && activity.amount > 0 && (
                        <div className="text-right flex-shrink-0">
                          <span className="text-sm font-black text-emerald-600">
                            +₱{activity.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
