'use client';

import React, { useState } from 'react';
import { ReferralRosterEntry } from '@/firebase/firestore/referral-monitoring-actions';
import { Store, ChevronDown, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ReferralRosterProps {
  roster: ReferralRosterEntry[];
  primaryColor: string;
}

const PAGE_SIZE = 20;

export function ReferralRoster({ roster, primaryColor }: ReferralRosterProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const visible = roster.slice(0, visibleCount);
  const hasMore = visibleCount < roster.length;

  if (roster.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-2">
        <Store className="h-9 w-9 opacity-30" />
        <p className="text-xs font-bold">Wala pang mga na-refer na tindahan.</p>
        <p className="text-[10px]">I-share ang iyong link para magsimulang kumita!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {visible.map((r, idx) => (
        <RosterRow key={r.tenantId || idx} entry={r} primaryColor={primaryColor} />
      ))}

      {hasMore && (
        <Button
          variant="outline"
          className="w-full h-10 text-[11px] font-bold uppercase tracking-widest border-slate-200 text-slate-500 hover:bg-slate-50 rounded-xl mt-1"
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
        >
          <ChevronDown className="h-3.5 w-3.5 mr-1.5" />
          Load More ({roster.length - visibleCount} remaining)
        </Button>
      )}
    </div>
  );
}

function RosterRow({ entry, primaryColor }: { entry: ReferralRosterEntry; primaryColor: string }) {
  const monthlyContribution = entry.isActive ? 10 : 0;

  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-slate-100 shadow-sm">
      {/* Status dot */}
      <div className="relative shrink-0">
        <div
          className="h-10 w-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: entry.isActive ? `${primaryColor}15` : '#f1f5f9' }}
        >
          <Store
            className="h-5 w-5"
            style={{ color: entry.isActive ? primaryColor : '#94a3b8' }}
          />
        </div>
        <span
          className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${
            entry.isActive ? 'bg-emerald-500' : 'bg-slate-300'
          }`}
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-slate-800 truncate">{entry.tenantName}</p>
        <p className="text-[10px] text-slate-400 font-medium mt-0.5">
          Joined {entry.joinedMonth}
          {' · '}
          <span className={entry.isActive ? 'text-emerald-600 font-bold' : 'text-slate-400'}>
            {entry.isActive ? 'Active' : 'Inactive'}
          </span>
        </p>
      </div>

      {/* Earnings */}
      <div className="text-right shrink-0">
        <p className="text-xs font-black text-emerald-600">
          ₱{entry.totalEarned.toFixed(2)}
        </p>
        <p className="text-[10px] font-medium text-slate-400 flex items-center justify-end gap-0.5">
          {entry.isActive ? (
            <><TrendingUp className="h-2.5 w-2.5 text-emerald-500" /> ₱{monthlyContribution}/mo</>
          ) : (
            <><TrendingDown className="h-2.5 w-2.5 text-slate-400" /> ₱0/mo</>
          )}
        </p>
      </div>
    </div>
  );
}
