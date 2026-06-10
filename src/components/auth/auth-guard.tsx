'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUser } from '@/firebase/auth/use-user';
import { useTenantStore, Tenant } from '@/store/use-tenant-store';
import { doc, onSnapshot, getFirestore } from 'firebase/firestore';
import { getAuth, signOut } from 'firebase/auth';
import { app } from '@/firebase/config';
import { ShieldAlert, Loader2, AlertCircle } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { useFirestore } from '@/firebase/provider';
import Image from 'next/image';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const db = useFirestore();
  const { user, loading: authLoading } = useUser();
  const { activeTenant, setActiveTenant, userProfile, isLoading, setLoading, error, setError } = useTenantStore();
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [maintenance, setMaintenance] = useState<{ mode: boolean; message: string } | null>(null);

  // 0. Fetch System Config (Maintenance Mode)
  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(doc(db, 'system', 'config'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setMaintenance({ mode: data.maintenanceMode, message: data.maintenanceMessage });
      }
    });
    return () => unsub();
  }, [db]);

  // 1. Auth Status & Admin Check
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setIsAdmin(false);
      if (pathname !== '/' && !pathname.startsWith('/rsvp') && !pathname.startsWith('/product') && !pathname.startsWith('/terms') && !pathname.startsWith('/onboarding')) router.push('/');
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
        
        if (isUserAdmin) {
          if (pathname !== '/admin' && pathname !== '/dashboard' && !pathname.startsWith('/module/')) {
            router.push('/admin');
          }
          setChecking(false);
          setLoading(false);
        } else {
          if (pathname === '/admin') {
            router.push('/dashboard');
          }
          // Non-admins continue to tenant fetch effects
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
        const userData = userSnap.data() as any;
        useTenantStore.getState().setUserProfile(userData);

        const persistedTenant = useTenantStore.getState().activeTenant;
        if (persistedTenant) {
          setTenantId(persistedTenant.id);
        } else if (userData.tenantId) {
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
      console.error('AuthGuard: User Profile Security/Network Error', err);
      setError('Connection interrupted while fetching user.');
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
    }, (err) => {
      console.error('AuthGuard: Tenant Fetch Security/Network Error', err);
      setError('Connection interrupted while fetching tenant.');
      setChecking(false);
      setLoading(false);
    });

    return () => unsubscribeTenant();
  }, [tenantId, setActiveTenant, setError, setLoading]);

  // 1. Initial Loading/Hydration State
  if (authLoading || checking || isLoading || (user && isAdmin === null)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white">
        <div className="relative flex flex-col items-center gap-6">
          {/* Official brand logo, animate-pulse for loading feel */}
          <BrandLogo showText={false} className="[&>div]:h-20 [&>div]:w-20 [&>div]:sm:h-24 [&>div]:sm:w-24 animate-pulse" />
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
              Initializing Ecosystem...
            </p>
            {/* Branded loading bar */}
            <div className="w-32 h-0.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-[#00BFFF] rounded-full animate-[loading_1.5s_ease-in-out_infinite]"
                style={{ animation: 'loading 1.5s ease-in-out infinite' }} />
            </div>
          </div>
        </div>
        <style>{`
          @keyframes loading {
            0% { width: 0%; margin-left: 0%; }
            50% { width: 60%; margin-left: 20%; }
            100% { width: 0%; margin-left: 100%; }
          }
        `}</style>
      </div>
    );
  }

  // Helper to check if current route is public
  const isPublicRoute = pathname === '/' || pathname.startsWith('/rsvp') || pathname.startsWith('/product') || pathname.startsWith('/terms') || pathname.startsWith('/onboarding');

  // 1.5 Maintenance Mode View
  if (maintenance?.mode && !isAdmin && !isPublicRoute) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-8 text-center">
        <div className="p-8 bg-white rounded-[24px] shadow-2xl border border-amber-100 flex flex-col items-center max-w-sm w-full">
          <div className="p-4 bg-amber-50 rounded-full mb-6">
            <ShieldAlert className="h-12 w-12 text-amber-500" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tight">System Maintenance</h1>
          <p className="text-slate-500 text-sm mb-8 leading-relaxed font-medium">
            {maintenance.message || "We are currently undergoing scheduled maintenance to upgrade our systems. We will be back shortly."}
          </p>
          <div className="w-full">
            <button 
              onClick={() => {
                const auth = getAuth(app);
                signOut(auth).then(() => {
                  router.push('/');
                });
              }}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 h-12 rounded-xl font-bold transition-colors"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Pending Activation View
  const isOwnerPending = activeTenant?.subscriptionStatus === 'pending';
  const isStaffPending = userProfile?.role === 'staff' && userProfile?.subscriptionStatus === 'pending';

  if ((isOwnerPending || isStaffPending) && !isPublicRoute && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-8 text-center">
        <div className="p-6 bg-white rounded-[24px] shadow-2xl border border-amber-100 flex flex-col items-center w-full max-w-sm">
          <div className="p-4 bg-amber-50 rounded-full mb-4">
            <Loader2 className="h-12 w-12 text-amber-500 animate-spin" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Pending Verification</h1>
          <p className="text-slate-500 text-sm mb-6 leading-relaxed">
            {isStaffPending ? (
              <>Your account for <strong>{activeTenant?.name}</strong> is waiting for verification. Pay ₱99 below, OR wait for your Business Owner to sponsor your account.</>
            ) : (
              <>Your business <strong>{activeTenant?.name}</strong> is waiting for payment verification.</>
            )}
          </p>

          <div className="bg-white border-2 border-slate-100 rounded-2xl p-4 flex flex-col items-center text-center space-y-4 shadow-sm w-full mb-6">
            <div className="space-y-1">
              <p className="text-sm font-bold text-slate-900 uppercase tracking-widest">Scan to Pay</p>
              <p className="text-xs text-slate-500 font-medium">Use this QR code for both GCash and Maya</p>
            </div>
            
            <div className="relative w-40 h-40 bg-slate-50 rounded-xl overflow-hidden border border-slate-100 p-2 shadow-inner">
              <Image 
                src="/images/gcash-qr.jpg" 
                alt="Katuwang Solutions QR Code" 
                fill 
                className="object-contain"
                priority
                unoptimized
              />
            </div>
            <a href="/images/gcash-qr.jpg" download="Katuwang-QR-Code.jpg" className="text-xs font-bold text-primary hover:underline">
              Download QR Code
            </a>
          </div>

          {/* Payment Instructions */}
          <div className="w-full bg-amber-50 border border-amber-100 rounded-xl p-4 text-left space-y-3 mb-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-1">How to Confirm Payment</p>
            <div className="space-y-2">
              {[
                'Scan or download the QR code above, then upload it in your GCash or Maya app.',
                'Input the exact amount: ₱99.00.',
                'Take a screenshot of your payment confirmation.',
                'Send the screenshot AND your registered email address to our Facebook Page via Messenger.',
                'We will send you a message once your account is activated.',
              ].map((text, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="h-4 w-4 rounded-full bg-amber-500 text-white text-[8px] font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</div>
                  <p className="text-xs text-amber-900 font-medium leading-tight">{text}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-amber-900 font-medium mt-3 text-center border-t border-amber-200/50 pt-2">
              Manual Mobile No: <strong className="text-sm text-amber-800 tracking-wider ml-1">09951665423</strong>
            </p>
          </div>

          <div className="w-full space-y-3">
            <button 
              onClick={() => window.open('https://m.me/KatuwangSolutions', '_blank')}
              className="w-full h-12 rounded-xl text-white font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-lg"
              style={{ background: '#0099FF' }}
            >
              Send Receipt on Messenger
            </button>
            <button 
              onClick={() => {
                const auth = getAuth(app);
                signOut(auth).then(() => {
                  router.push('/');
                });
              }}
              className="w-full bg-slate-100 text-slate-600 h-12 rounded-xl font-bold active:scale-[0.98] transition-transform"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Kill-Switch (Lockout) View
  if (activeTenant?.subscriptionStatus === 'suspended' && !isPublicRoute && !isAdmin) {
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
              onClick={() => {
                const auth = getAuth(app);
                signOut(auth).then(() => {
                  router.push('/');
                });
              }}
              className="w-full bg-slate-100 text-slate-600 h-12 rounded-xl font-bold"
            >
              Sign Out & Return Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Error / Missing Configuration View
  if (error && !activeTenant && !isAdmin && !isPublicRoute) {
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
              onClick={() => {
                const auth = getAuth(app);
                signOut(auth).then(() => {
                  router.push('/');
                });
              }}
              className="w-full bg-slate-100 text-slate-600 h-12 rounded-xl font-bold"
            >
              Sign Out & Return Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 4. Strict Routing Render Locks (Prevents FOUC)
  const isUnauthorized = 
    (!user && pathname !== '/' && !pathname.startsWith('/rsvp') && !pathname.startsWith('/product') && !pathname.startsWith('/onboarding') && !pathname.startsWith('/terms')) ||
    (isAdmin === false && pathname === '/admin') ||
    (isAdmin === true && pathname !== '/admin' && pathname !== '/dashboard' && !pathname.startsWith('/module/'));

  if (isUnauthorized) {
    console.log("AuthGuard: Unauthorized route, hiding content while redirecting. Path:", pathname);
    return (
      <div className="w-full min-h-screen bg-white">
        <div className="hidden">{children}</div>
      </div>
    );
  }

  return <>{children}</>;
}
