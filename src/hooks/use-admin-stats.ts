import { useState, useEffect, useCallback } from 'react';
import { initializeFirebase } from '@/firebase';
import type { CommandCenterStats } from '@/lib/server/command-center-stats';

export type SystemStats = CommandCenterStats;

function isSystemStats(value: unknown): value is SystemStats {
  if (!value || typeof value !== 'object') return false;
  const stats = value as Record<string, unknown>;
  const keys: Array<keyof SystemStats> = [
    'totalTenants',
    'activeTenants',
    'suspendedTenants',
    'pendingTenants',
    'mrr',
    'promoCount',
    'standardCount',
    'enterpriseCount',
    'focCount',
  ];
  return Object.keys(stats).length === keys.length && keys.every((key) => (
    typeof stats[key] === 'number' && Number.isFinite(stats[key]) && stats[key] >= 0
  ));
}

export function useAdminStats(enabled: boolean = true) {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const { auth } = initializeFirebase();
      const user = auth.currentUser;
      if (!user) throw new Error('Administrator authentication is required.');

      const token = await user.getIdToken();
      const response = await fetch('/api/admin/stats', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok || !isSystemStats(payload)) {
        throw new Error(response.status === 403
          ? 'Your administrator role cannot view system statistics.'
          : 'System statistics are temporarily unavailable.');
      }

      setStats(payload);
      setError(null);
    } catch (cause) {
      setStats(null);
      setError(cause instanceof Error ? cause.message : 'System statistics are temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStats(null);
      setError(null);
      setLoading(false);
      return;
    }
    void fetchStats();
  }, [enabled, fetchStats]);

  return { stats, loading, error, refreshStats: fetchStats };
}
