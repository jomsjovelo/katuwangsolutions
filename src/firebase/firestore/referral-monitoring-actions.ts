import {
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  DocumentSnapshot,
  Firestore,
} from 'firebase/firestore';

export interface ReferralHistoryEntry {
  id: string;
  referredTenantName: string;
  referredTenantId?: string;
  type: string; // 'signup' | 'renewal'
  amountEarned: number;
  creditedAt: { seconds: number; nanoseconds: number } | null;
}

export interface ReferralRosterEntry {
  tenantId: string;
  tenantName: string;
  moduleType?: string;
  joinedMonth: string; // "Jan 2025"
  lastCreditedAt: { seconds: number; nanoseconds: number } | null;
  totalEarned: number;
  isActive: boolean; // true if last credit was within 35 days
}

export interface MonthlyEarnings {
  month: string;   // "Jun 2025"
  key: string;     // "2025-06" — for sorting
  amount: number;
}

const PAGE_SIZE = 20;

/**
 * Fetch one page of raw referral history entries.
 * Returns entries + the last doc cursor for pagination.
 */
export async function fetchReferralHistoryPage(
  db: Firestore,
  uid: string,
  afterDoc?: DocumentSnapshot
): Promise<{ entries: ReferralHistoryEntry[]; lastDoc: DocumentSnapshot | null }> {
  const ref = collection(db, 'users', uid, 'referral_history');
  const constraints: any[] = [orderBy('creditedAt', 'desc'), limit(PAGE_SIZE)];
  if (afterDoc) constraints.push(startAfter(afterDoc));

  const snap = await getDocs(query(ref, ...constraints));
  const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ReferralHistoryEntry));
  const lastDoc = snap.docs.length === PAGE_SIZE ? snap.docs[snap.docs.length - 1] : null;
  return { entries, lastDoc };
}

/**
 * Fetch ALL referral history entries (client-side aggregation).
 * Safe for up to ~500 entries — for scale use a server-side summary doc.
 */
export async function fetchAllReferralHistory(
  db: Firestore,
  uid: string
): Promise<ReferralHistoryEntry[]> {
  const ref = collection(db, 'users', uid, 'referral_history');
  const q = query(ref, orderBy('creditedAt', 'desc'), limit(500));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ReferralHistoryEntry));
}

/**
 * Compute a privacy-safe "roster" of referred stores from raw history.
 * Groups by store, calculates total earned per store and active status.
 * NEVER exposes personal data — only business names and financial aggregates.
 */
export function buildReferralRoster(entries: ReferralHistoryEntry[]): ReferralRosterEntry[] {
  const now = Date.now();
  const ACTIVE_WINDOW_MS = 35 * 24 * 60 * 60 * 1000; // 35 days

  const map = new Map<string, ReferralRosterEntry>();

  for (const entry of entries) {
    const key = entry.referredTenantId || entry.referredTenantName;
    const creditedMs = entry.creditedAt?.seconds ? entry.creditedAt.seconds * 1000 : 0;

    if (!map.has(key)) {
      // Determine join month from the earliest entry for this tenant.
      // Since entries are ordered desc, we'll update it if we find an older one.
      const joinedDate = entry.creditedAt?.seconds
        ? new Date(entry.creditedAt.seconds * 1000)
        : new Date();
      map.set(key, {
        tenantId: entry.referredTenantId || key,
        tenantName: entry.referredTenantName || 'Unknown Store',
        joinedMonth: joinedDate.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }),
        lastCreditedAt: entry.creditedAt,
        totalEarned: entry.amountEarned,
        isActive: now - creditedMs < ACTIVE_WINDOW_MS,
      });
    } else {
      const existing = map.get(key)!;
      // Accumulate earnings
      existing.totalEarned += entry.amountEarned;
      // Track earliest join date (entries sorted desc, so last entry = earliest)
      const entryDate = entry.creditedAt?.seconds ? new Date(entry.creditedAt.seconds * 1000) : null;
      if (entryDate) {
        existing.joinedMonth = entryDate.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    // Active first, then by total earned descending
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return b.totalEarned - a.totalEarned;
  });
}

/**
 * Compute month-by-month earnings breakdown from raw history.
 * Returns sorted array from oldest to newest (for chart display).
 */
export function buildMonthlyEarnings(entries: ReferralHistoryEntry[]): MonthlyEarnings[] {
  const map = new Map<string, number>();

  for (const entry of entries) {
    if (!entry.creditedAt?.seconds) continue;
    const d = new Date(entry.creditedAt.seconds * 1000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    map.set(key, (map.get(key) || 0) + (entry.amountEarned || 0));
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, amount]) => {
      const [year, month] = key.split('-');
      const d = new Date(Number(year), Number(month) - 1, 1);
      return {
        key,
        month: d.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }),
        amount,
      };
    });
}

/**
 * Compute hero stats from entries + user profile.
 */
export function computeReferralStats(
  entries: ReferralHistoryEntry[],
  lifetimeEarnings: number,
  availableBalance: number
) {
  const roster = buildReferralRoster(entries);
  const activeReferrals = roster.filter((r) => r.isActive).length;
  const totalReferrals = roster.length;

  return {
    lifetimeEarnings,
    availableBalance,
    activeReferrals,
    totalReferrals,
    roster,
  };
}
