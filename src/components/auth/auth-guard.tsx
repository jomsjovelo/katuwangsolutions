'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUser } from '@/firebase/auth/use-user';
import { useTenantStore, Tenant } from '@/store/use-tenant-store';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { app } from '@/firebase/config';
import { Handshake, ShieldAlert, Loader2 } from 'lucide-react';

const db = getFirestore(app);

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useUser();
  const { activeTenant, setActiveTenant, isLoading, setLoading, setError } = useTenantStore();
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      // Don't do anything if auth is still initializing
      if (authLoading) return;

      // Handle unauthenticated users
      if (!user) {
        // If they are trying to access a protected route (not landing page)
        if (pathname !== '/') {
          router.push('/');
        }
        setChecking(false);
        setLoading(false);
        return;
      }

      // Handle authenticated users: Fetch Tenant Data
      try {
        setLoading(true);
        // All business data is isolated under tenants/{uid}
        const tenantRef = doc(db, 'tenants', user.uid);
        const tenantSnap = await getDoc(tenantRef);

        if (tenantSnap.exists()) {
          const tenantData = { id: tenantSnap.id, ...tenantSnap.data() } as Tenant;
          setActiveTenant(tenantData);

          // Dynamic Module Routing
          if (pathname === '/') {
            // Transform module name to URL friendly path: "Benta Snap" -> "/benta-snap/dashboard"
            const modulePath = tenantData.moduleType.toLowerCase().replace(/\s+/g, '-');
            router.push(`/${modulePath}/dashboard`);
          }
        } else {
          // No tenant document exists for this user
          setError('Account configuration missing. Please contact Katuwang Support.');
        }
      } catch (err) {
        console.error('AuthGuard: Security/Network Error', err);
        setError('Connection interrupted. Please refresh the page.');
      } finally {
        setChecking(false);
        setLoading(false);
      }
    }

    checkAuth();
  }, [user, authLoading, pathname, router, setActiveTenant, setLoading, setError]);

  // 1. Initial Loading/Hydration State
  if (authLoading || checking || isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white">
        <div className="relative">
          <Handshake className="h-16 w-16 text-primary animate-pulse" />
          <div className="absolute -bottom-2 -right-2">
             <Loader2 className="h-6 w-6 animate-spin text-secondary" />
          </div>
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
          Initializing Ecosystem...
        </p>
      </div>
    );
  }

  // 2. Kill-Switch (Lockout) View
  if (activeTenant?.subscriptionStatus === 'suspended') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-8 text-center">
        <div className="p-6 bg-white rounded-[24px] shadow-2xl border border-red-100 flex flex-col items-center">
          <div className="p-4 bg-red-50 rounded-full mb-6">
            <ShieldAlert className="h-12 w-12 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Akses de-aktibado</h1>
          <p className="text-slate-500 text-sm mb-8 max-w-xs leading-relaxed">
            Ang iyong account ay kasalukuyang suspendido. Mangyaring makipag-ugnayan sa Katuwang Support para sa karagdagang impormasyon.
          </p>
          <div className="w-full space-y-3">
            <button 
              onClick={() => window.location.href = 'mailto:support@katuwangsolutions.com'}
              className="w-full bg-primary text-white h-12 rounded-xl font-bold shadow-lg hover:opacity-90 transition-opacity"
            >
              Contact Support
            </button>
            <button 
              onClick={() => router.push('/')}
              className="w-full bg-slate-100 text-slate-600 h-12 rounded-xl font-bold"
            >
              Go to Landing Page
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
