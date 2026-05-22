'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUser } from '@/firebase/auth/use-user';
import { useTenantStore, Tenant } from '@/store/use-tenant-store';
import { doc, onSnapshot, getFirestore } from 'firebase/firestore';
import { app } from '@/firebase/config';
import { Handshake, ShieldAlert, Loader2, AlertCircle } from 'lucide-react';

const db = getFirestore(app, 'katuwang');

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useUser();
  const { activeTenant, setActiveTenant, isLoading, setLoading, error, setError } = useTenantStore();
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);

  // 1. Auth Status & Admin Check
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      if (pathname !== '/') router.push('/');
      setChecking(false);
      setLoading(false);
      return;
    }

    // Check Admin status using Firestore
    const adminRef = doc(db, 'admins', user.uid);
    // getDoc instead of onSnapshot for admin check to save reads, assuming admin status rarely changes during a session
    import('firebase/firestore').then(({ getDoc }) => {
      getDoc(adminRef).then((snap) => {
        const isUserAdmin = snap.exists();
        setIsAdmin(isUserAdmin);
        
        if (isUserAdmin && pathname !== '/admin') {
          router.push('/admin');
          setChecking(false);
          setLoading(false);
        } else if (!isUserAdmin && pathname === '/admin') {
          router.push('/dashboard');
        }
      }).catch((err) => {
        console.error('Admin check error:', err);
        setIsAdmin(false);
        if (pathname === '/admin') router.push('/dashboard');
      });
    });

  }, [user, authLoading, pathname, router, setLoading]);

  // 2. Fetch User Profile to get Tenant ID
  useEffect(() => {
    // Only fetch tenant if the user is authenticated and NOT an admin
    if (!user || isAdmin === true || isAdmin === null) return;
    
    setLoading(true);
    const userRef = doc(db, 'users', user.uid);
    
    const unsubscribeUser = onSnapshot(userRef, (userSnap) => {
      if (userSnap.exists()) {
        const userData = userSnap.data();
        if (userData.tenantId) {
          setTenantId(userData.tenantId);
        } else {
          setError('User is not associated with any business.');
          setChecking(false);
          setLoading(false);
        }
      } else {
        setError('User profile not found.');
        setChecking(false);
        setLoading(false);
      }
    }, (err) => {
      console.error('AuthGuard: Security/Network Error', err);
      setError('Connection interrupted.');
      setChecking(false);
      setLoading(false);
    });

    return () => unsubscribeUser();
  }, [user, isAdmin, setError, setLoading]);

  // 3. Fetch Tenant Data
  useEffect(() => {
    if (!tenantId) return;

    const tenantRef = doc(db, 'tenants', tenantId);
    const unsubscribeTenant = onSnapshot(tenantRef, (tenantSnap) => {
      if (tenantSnap.exists()) {
        const tenantData = { id: tenantSnap.id, ...tenantSnap.data() } as Tenant;
        setActiveTenant(tenantData);
        setError(null);
      } else {
        setError('Tenant configuration missing.');
      }
      setChecking(false);
      setLoading(false);
    });

    return () => unsubscribeTenant();
  }, [tenantId, setActiveTenant, setError, setLoading]);

  // 1. Initial Loading/Hydration State
  if (authLoading || checking || isLoading || (user && isAdmin === null)) {
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

  // 2. Pending Activation View
  if (activeTenant?.subscriptionStatus === 'pending') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-8 text-center">
        <div className="p-6 bg-white rounded-[24px] shadow-2xl border border-amber-100 flex flex-col items-center">
          <div className="p-4 bg-amber-50 rounded-full mb-6">
            <Loader2 className="h-12 w-12 text-amber-500 animate-spin" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Pending Verification</h1>
          <p className="text-slate-500 text-sm mb-8 max-w-xs leading-relaxed">
            Your account for <strong>{activeTenant.name}</strong> is waiting for payment verification. Activation typically takes less than 24 hours.
          </p>
          <div className="w-full space-y-3">
            <button 
              onClick={() => window.open('https://m.me/katuwangsolutions', '_blank')}
              className="w-full bg-amber-500 text-white h-12 rounded-xl font-bold shadow-lg hover:opacity-90 transition-opacity"
            >
              Check via Messenger
            </button>
            <button 
              onClick={() => router.push('/')}
              className="w-full bg-slate-100 text-slate-600 h-12 rounded-xl font-bold"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Kill-Switch (Lockout) View
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

  // 3. Error / Missing Configuration View
  if (error && !activeTenant && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-8 text-center">
        <div className="p-6 bg-white rounded-[24px] shadow-2xl border border-slate-100 flex flex-col items-center">
          <div className="p-4 bg-slate-50 rounded-full mb-6">
            <AlertCircle className="h-12 w-12 text-slate-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Configuration Missing</h1>
          <p className="text-slate-500 text-sm mb-8 max-w-xs leading-relaxed">
            {error}
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
              Return Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 4. Strict Routing Render Locks (Prevents FOUC)
  if (!user && pathname !== '/') return null;
  if (isAdmin === false && pathname === '/admin') return null;
  if (isAdmin === true && pathname !== '/admin') return null;

  return <>{children}</>;
}
