'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/firebase/auth/use-user';

export function EmailVerificationBanner() {
  const { user, loading } = useUser();
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  // Temporarily hidden while verification link handling is updated
  return null;
}
