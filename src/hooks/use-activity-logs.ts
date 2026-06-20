'use client';
import { useMemo, useState, useEffect } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useTenant } from '@/app/lib/tenant-context';
import { useInventory } from '@/hooks/use-inventory';
import { startOfDay, subDays } from 'date-fns';
import { ShoppingCart, Package, AlertTriangle, FileText, Banknote } from 'lucide-react';

export type ActivityLog = {
  id: string;
  type: 'sale' | 'stock' | 'alert' | 'system';
  title: string;
  amount: number | null;
  time: string;
  icon: any;
  color: string;
  bg: string;
  timestamp: number; // For sorting
};

export function useActivityLogs() {
  const { currentTenant } = useTenant();
  const db = useFirestore();
  const { outOfStockItems, lowStockItems } = useInventory();

  const start = useMemo(() => Timestamp.fromDate(startOfDay(subDays(new Date(), 7))), []);
  const end = useMemo(() => Timestamp.fromDate(new Date()), []);

  const isTracker = currentTenant?.moduleType === '5-6-tracker';
  const collectionName = isTracker ? 'transactions' : 'sales';

  const logsQuery = useMemo(() => {
    return currentTenant && db
      ? query(
          collection(db, 'tenants', currentTenant.id, collectionName),
          where(isTracker ? 'timestamp' : 'createdAt', '>=', start),
          where(isTracker ? 'timestamp' : 'createdAt', '<=', end),
          orderBy(isTracker ? 'timestamp' : 'createdAt', 'desc')
        )
      : null;
  }, [currentTenant?.id, db, isTracker, start.seconds, end.seconds]);

  const { data: rawLogs, loading, error } = useCollection<any>(logsQuery as any);

  const logs = useMemo(() => {
    let activity: ActivityLog[] = [];

    // Map database logs to ActivityLog format
    if (rawLogs && rawLogs.length > 0) {
      activity = rawLogs.map((log: any) => {
        let timeLabel = 'Just now';
        const docTimestamp = isTracker ? log.timestamp : log.createdAt;
        const timeMs = docTimestamp?.toDate ? docTimestamp.toDate().getTime() : Date.now();
        
        if (docTimestamp && docTimestamp.toDate) {
          const diffMins = Math.floor((Date.now() - timeMs) / 60000);
          if (diffMins === 0) timeLabel = 'Just now';
          else if (diffMins < 60) timeLabel = `${diffMins} mins ago`;
          else if (diffMins < 1440) timeLabel = `${Math.floor(diffMins / 60)} hours ago`;
          else timeLabel = `${Math.floor(diffMins / 1440)} days ago`;
        }

        if (isTracker) {
          const isPayment = log.type === 'payment';
          return {
            id: log.id,
            type: isPayment ? 'sale' : 'stock',
            title: isPayment ? `Payment Received` : `Loan Disbursed`,
            amount: log.amount ? log.amount / 100 : 0,
            time: timeLabel,
            icon: isPayment ? Banknote : FileText,
            color: isPayment ? 'text-emerald-500' : 'text-blue-500',
            bg: isPayment ? 'bg-emerald-50' : 'bg-blue-50',
            timestamp: timeMs
          };
        } else {
          return {
            id: log.id,
            type: 'sale',
            title: `Sold: ${log.productName || 'Item'}`,
            amount: log.totalAmount ? log.totalAmount / 100 : 0,
            time: timeLabel,
            icon: ShoppingCart,
            color: 'text-emerald-500',
            bg: 'bg-emerald-50',
            timestamp: timeMs
          };
        }
      });
    }

    // Append inventory alerts if applicable
    if (outOfStockItems && outOfStockItems.length > 0) {
      outOfStockItems.forEach(item => {
        activity.push({
          id: `alert-out-${item.id}`,
          type: 'alert',
          title: `Ubos Na: ${item.name}`,
          amount: null,
          time: 'Urgent',
          icon: AlertTriangle,
          color: 'text-red-500',
          bg: 'bg-red-50',
          timestamp: Date.now() // Alerts are considered immediate
        });
      });
    }

    if (lowStockItems && lowStockItems.length > 0) {
      lowStockItems.forEach(item => {
        activity.push({
          id: `alert-low-${item.id}`,
          type: 'alert',
          title: `Paubos Na: ${item.name}`,
          amount: null,
          time: 'Check Stock',
          icon: AlertTriangle,
          color: 'text-amber-500',
          bg: 'bg-amber-50',
          timestamp: Date.now() - 1000 // Just slightly after urgent
        });
      });
    }

    // Sort combined array by timestamp descending
    activity.sort((a, b) => b.timestamp - a.timestamp);

    return activity;
  }, [rawLogs, outOfStockItems, lowStockItems, isTracker]);

  return { logs, loading, error };
}
