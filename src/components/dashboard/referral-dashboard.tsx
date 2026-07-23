'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useUser } from '@/firebase/auth/use-user';
import { useFirestore } from '@/firebase/provider';
import { useTenant } from '@/app/lib/tenant-context';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  fetchAllReferralHistory,
  buildReferralRoster,
  buildMonthlyEarnings,
  type ReferralHistoryEntry,
  type MonthlyEarnings,
  type ReferralRosterEntry,
} from '@/firebase/firestore/referral-monitoring-actions';
import { getModuleTheme } from '@/lib/theme-utils';
import { ReferralRoster } from '@/components/dashboard/referral-roster';
import { WithdrawReferralSheet } from '@/components/common/withdraw-referral-sheet';
import { Button } from '@/components/ui/button';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  Wallet,
  Users,
  TrendingUp,
  Share2,
  Copy,
  CheckCircle2,
  Download,
  Link as LinkIcon,
  Loader2,
  Trophy,
  Star,
  Zap,
  Medal,
} from 'lucide-react';

// Milestone definitions
const MILESTONES = [
  { count: 10,   reward: '₱100/mo',    icon: Star,   color: '#94a3b8' },
  { count: 100,  reward: '₱1,000/mo',  icon: Zap,    color: '#f59e0b' },
  { count: 500,  reward: '₱5,000/mo',  icon: Medal,  color: '#10b981' },
  { count: 1000, reward: '₱10,000/mo', icon: Trophy, color: '#3b82f6' },
  { count: 5000, reward: '₱50,000/mo', icon: Trophy, color: '#8b5cf6' },
  { count: 10000,reward: '₱100,000/mo',icon: Trophy, color: '#f43f5e' },
];

export function ReferralDashboard() {
  const db = useFirestore();
  const { user } = useUser();
  const { currentTenant } = useTenant();
  const theme = getModuleTheme(currentTenant?.moduleType);

  const [profile, setProfile] = useState<any>(null);
  const [entries, setEntries] = useState<ReferralHistoryEntry[]>([]);
  const [roster, setRoster] = useState<ReferralRosterEntry[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyEarnings[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isCaptionCopied, setIsCaptionCopied] = useState(false);
  const [activeView, setActiveView] = useState<'roster' | 'chart' | 'milestones'>('roster');

  // Subscribe to live profile (earnings balance updates in real time)
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists()) setProfile(snap.data());
    });
    return () => unsub();
  }, [user, db]);

  // Fetch all referral history for aggregation
  const loadHistory = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const data = await fetchAllReferralHistory(db, user.uid);
      setEntries(data);
      setRoster(buildReferralRoster(data));
      setMonthlyData(buildMonthlyEarnings(data));
    } catch (err) {
      console.error('Failed to load referral history:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user, db]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Derived stats
  const isDemo = profile?.email === 'demo@katuwangsolutions.com';

  const lifetimeEarnings = isDemo ? 1560 : (profile?.referralEarnings || 0);
  const availableBalance = isDemo ? 1560 : (profile?.availableBalance ?? lifetimeEarnings);
  const activeReferrals = isDemo ? 156 : roster.filter((r) => r.isActive).length;
  const totalReferrals = isDemo ? 156 : roster.length;
  const referralCode = profile?.referralCode || '';
  const referralLink = typeof window !== 'undefined'
    ? `${window.location.origin}/onboarding?ref=${referralCode}`
    : `https://katuwangsolutions.com/onboarding?ref=${referralCode}`;

  // Next milestone
  const nextMilestone = MILESTONES.find((m) => totalReferrals < m.count) || MILESTONES[MILESTONES.length - 1];
  const prevMilestone = MILESTONES[Math.max(0, MILESTONES.indexOf(nextMilestone) - 1)];
  const milestoneProgress = nextMilestone === prevMilestone
    ? 100
    : Math.min(100, ((totalReferrals - (prevMilestone?.count || 0)) / (nextMilestone.count - (prevMilestone?.count || 0))) * 100);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-h-full">
      {/* ── Hero Header ─────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden px-5 pt-6 pb-8"
        style={{ background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.secondary} 100%)` }}
      >
        {/* Decorative circles */}
        <div className="absolute -top-8 -right-8 h-40 w-40 rounded-full bg-white/10" />
        <div className="absolute -bottom-10 -left-6 h-32 w-32 rounded-full bg-white/10" />

        <p className="text-white/70 text-[10px] font-black uppercase tracking-[0.3em] mb-1 relative">
          Kita Ko · Referral Center
        </p>
        <h1 className="text-3xl font-black text-white leading-none relative">
          ₱{lifetimeEarnings.toFixed(2)}
          <span className="text-sm font-medium text-white/60 ml-2">lifetime</span>
        </h1>

        {/* Stat chips */}
        <div className="flex gap-2 mt-4 relative">
          <StatChip
            value={`₱${availableBalance.toFixed(2)}`}
            label="Available"
            highlight
          />
          <StatChip value={String(activeReferrals)} label="Active" />
          <StatChip value={String(totalReferrals)} label="Total Refs" />
        </div>

        {/* Withdraw button */}
        {availableBalance >= 200 ? (
          <button
            onClick={() => setWithdrawOpen(true)}
            className="mt-4 w-full bg-white rounded-xl h-11 text-sm font-black flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform relative"
            style={{ color: theme.primary }}
          >
            <Wallet className="h-4 w-4" />
            I-Withdraw ang ₱{availableBalance.toFixed(2)}
          </button>
        ) : (
          <div className="mt-4 bg-white/15 rounded-xl px-4 py-2.5 text-center relative">
            <p className="text-white/80 text-[11px] font-semibold">
              <span className="text-white font-black">₱{Math.max(0, 200 - availableBalance).toFixed(2)}</span>
              {' '}pa para maabot ang ₱200 minimum withdrawal
            </p>
          </div>
        )}
      </div>

      <main className="p-4 space-y-4 pb-24">

        {/* ── Referral Link Card ──────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <LinkIcon className="h-3.5 w-3.5" /> Ang Iyong Personal Link
          </p>
          <div className="flex gap-2">
            <div className="flex-1 bg-slate-50 rounded-xl border border-slate-200 px-3 py-2.5 text-[11px] font-bold text-indigo-700 truncate">
              {referralLink}
            </div>
            <button
              onClick={handleCopyLink}
              className={`shrink-0 h-10 w-10 rounded-xl flex items-center justify-center transition-all ${
                isCopied ? 'bg-emerald-500' : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {isCopied
                ? <CheckCircle2 className="h-4 w-4 text-white" />
                : <Copy className="h-4 w-4 text-white" />
              }
            </button>
          </div>
          {/* Share row */}
          <div className="flex gap-2">
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralLink)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 h-9 bg-[#1877F2] hover:bg-[#166FE5] text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share sa FB
            </a>
            <a
              href="/og-promo.jpg"
              download="katuwang-promo.jpg"
              className="flex-1 h-9 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Promo Image
            </a>
          </div>
        </div>

        {/* ── Social Mission Card ──────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 flex items-center justify-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-800">🚀 2-Step Social Mission</p>
          </div>

          {/* Step 1: Like & Follow */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold text-slate-700">1. Like &amp; Follow ang aming Facebook Page</p>
            <a
              href="https://www.facebook.com/katuwangsolutions"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full h-10 bg-[#1877F2] hover:bg-[#166FE5] text-white rounded-xl text-[11px] font-bold transition-colors active:scale-95"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              Like &amp; Follow sa Facebook
            </a>
          </div>

          {/* Step 2: Share viral caption */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold text-slate-700">2. I-share sa iyong Timeline</p>
            <p className="text-[9px] text-slate-500 leading-tight">I-copy ang caption na ito at i-post sa Facebook — kasama na ang iyong link at ang ₱99 Promo!</p>
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2">
              <p className="text-[10px] text-slate-600 leading-relaxed italic">
                "Gusto mo bang ma-automate ang negosyo mo?{' '}Gumamit ang Katuwang Solutions, sobrang dali na i-track ang daily sales, i-monitor ang revenue, at i-manage ang expenses at inventory mo!{' '}
                Naka-PROMO sila ngayon for only ₱99! Upgrade your business today.{' '}Mag register sa link:{' '}👉 {referralLink}"
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const caption = `Gusto mo bang ma-automate ang negosyo mo?\nGumamit ang Katuwang Solutions, sobrang dali na i-track ang daily sales, i-monitor ang revenue, at i-manage ang expenses at inventory mo!\n\nNaka-PROMO sila ngayon for only ₱99! Upgrade your business today.\n\nMag register sa link:\n👉 ${referralLink}`;
                    navigator.clipboard.writeText(caption);
                    setIsCaptionCopied(true);
                    setTimeout(() => setIsCaptionCopied(false), 2500);
                  }}
                  className={`flex-1 h-9 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
                    isCaptionCopied
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-800 hover:bg-slate-700 text-white'
                  }`}
                >
                  {isCaptionCopied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {isCaptionCopied ? 'Copied!' : 'Copy Caption'}
                </button>
                <a
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralLink)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center px-4 h-9 bg-[#1877F2] hover:bg-[#166FE5] text-white rounded-xl text-[10px] font-bold transition-colors active:scale-95"
                >
                  <Share2 className="h-3.5 w-3.5 mr-1.5" />
                  Share sa FB
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* ── Tab Switcher ─────────────────────────────────────────── */}
        <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
          {(['roster', 'chart', 'milestones'] as const).map((view) => (
            <button
              key={view}
              onClick={() => setActiveView(view)}
              className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                activeView === view
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {view === 'roster' ? '🏪 Tindahan' : view === 'chart' ? '📊 Chart' : '🏆 Levels'}
            </button>
          ))}
        </div>

        {/* ── Loading State ─────────────────────────────────────────── */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: theme.primary }} />
            <p className="text-[11px] font-black uppercase tracking-widest">Loading referral data...</p>
          </div>
        ) : (
          <>
            {/* ── ROSTER VIEW ─────────────────────────────────────── */}
            {activeView === 'roster' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    {totalReferrals} na-refer · {activeReferrals} active
                  </p>
                  <p className="text-[10px] font-bold text-slate-400">
                    ₱{(activeReferrals * 10).toFixed(0)}/mo
                  </p>
                </div>


                <ReferralRoster roster={roster} primaryColor={theme.primary} />
              </div>
            )}

            {/* ── CHART VIEW ──────────────────────────────────────── */}
            {activeView === 'chart' && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" style={{ color: theme.primary }} />
                  <p className="text-sm font-black text-slate-800">Monthly Earnings</p>
                </div>

                {monthlyData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-2">
                    <TrendingUp className="h-8 w-8 opacity-20" />
                    <p className="text-xs font-bold">Wala pang earnings history</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={200} minWidth={0} minHeight={0}>
                    <BarChart
                      data={monthlyData}
                      margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `₱${v}`}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: '1px solid #e2e8f0',
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                        formatter={(v: number) => [`₱${v.toFixed(2)}`, 'Earned']}
                      />
                      <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                        {monthlyData.map((entry, index) => (
                          <Cell
                            key={entry.key}
                            fill={index === monthlyData.length - 1 ? theme.primary : `${theme.primary}60`}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}

                {/* Monthly total summary */}
                {monthlyData.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                    <div className="text-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">This Month</p>
                      <p className="text-lg font-black text-slate-800">
                        ₱{(monthlyData[monthlyData.length - 1]?.amount || 0).toFixed(2)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Avg/Month</p>
                      <p className="text-lg font-black text-slate-800">
                        ₱{(monthlyData.reduce((s, m) => s + m.amount, 0) / monthlyData.length).toFixed(2)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── MILESTONES VIEW ──────────────────────────────────── */}
            {activeView === 'milestones' && (
              <div className="space-y-3">
                {/* Progress toward next milestone */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Next Level</p>
                      <p className="text-sm font-black text-slate-800 mt-0.5">
                        {nextMilestone.count.toLocaleString()} Referrals
                        <span className="text-emerald-600 ml-1.5">{nextMilestone.reward}</span>
                      </p>
                    </div>
                    <p className="text-[11px] font-bold text-slate-500">
                      {totalReferrals} / {nextMilestone.count.toLocaleString()}
                    </p>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${milestoneProgress}%`,
                        background: `linear-gradient(to right, ${theme.primary}, ${theme.secondary})`,
                      }}
                    />
                  </div>
                  <p className="text-[10px] font-bold text-slate-400">
                    {Math.max(0, nextMilestone.count - totalReferrals).toLocaleString()} more referrals to unlock
                  </p>
                </div>

                {/* All milestones */}
                <div className="grid grid-cols-2 gap-2">
                  {MILESTONES.map((m) => {
                    const Icon = m.icon;
                    const isUnlocked = totalReferrals >= m.count;
                    const isCurrent = nextMilestone.count === m.count;
                    return (
                      <div
                        key={m.count}
                        className={`rounded-2xl border p-3 flex flex-col items-center text-center gap-1.5 transition-all ${
                          isUnlocked
                            ? 'border-emerald-200 bg-emerald-50'
                            : isCurrent
                            ? 'border-amber-200 bg-amber-50'
                            : 'border-slate-100 bg-white opacity-60'
                        }`}
                      >
                        <div
                          className="h-10 w-10 rounded-xl flex items-center justify-center"
                          style={{ backgroundColor: `${m.color}15` }}
                        >
                          <Icon className="h-5 w-5" style={{ color: isUnlocked ? m.color : '#94a3b8' }} />
                        </div>
                        <p className="text-[10px] font-black uppercase text-slate-500">
                          {m.count.toLocaleString()} Refs
                        </p>
                        <p className={`text-sm font-black ${isUnlocked ? 'text-emerald-600' : isCurrent ? 'text-amber-600' : 'text-slate-400'}`}>
                          {m.reward}
                        </p>
                        {isUnlocked && (
                          <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
                            ✓ Unlocked
                          </span>
                        )}
                        {isCurrent && !isUnlocked && (
                          <span className="text-[9px] font-black uppercase tracking-widest text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                            Next Goal
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <WithdrawReferralSheet
        open={withdrawOpen}
        onOpenChange={setWithdrawOpen}
        availableBalance={availableBalance}
        userFullName={profile?.fullName || ''}
        userEmail={user?.email || ''}
        tenantName={currentTenant?.name || ''}
        role={profile?.role || 'staff'}
        uid={user?.uid || ''}
      />
    </div>
  );
}

// ── Helper sub-component ─────────────────────────────────────────────
function StatChip({ value, label, highlight = false }: { value: string; label: string; highlight?: boolean }) {
  return (
    <div className={`flex flex-col items-center px-3 py-1.5 rounded-xl ${highlight ? 'bg-white/25' : 'bg-white/15'}`}>
      <span className="text-white font-black text-sm leading-tight">{value}</span>
      <span className="text-white/60 text-[9px] font-bold uppercase tracking-wider">{label}</span>
    </div>
  );
}
