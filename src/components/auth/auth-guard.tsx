'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUser } from '@/firebase/auth/use-user';
import { useTenantStore, Tenant } from '@/store/use-tenant-store';
import { doc, onSnapshot } from 'firebase/firestore';
import { getAuth, signOut } from 'firebase/auth';
import { app } from '@/firebase/config';
import { ShieldAlert, Loader2, AlertCircle, Copy, Check, ExternalLink } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { useFirestore } from '@/firebase/provider';
import Image from 'next/image';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const db = useFirestore();
  const { user, loading: authLoading } = useUser();
  const activeTenant = useTenantStore(state => state.activeTenant);
  const setActiveTenant = useTenantStore(state => state.setActiveTenant);
  const userProfile = useTenantStore(state => state.userProfile);
  const isLoading = useTenantStore(state => state.isLoading);
  const error = useTenantStore(state => state.error);
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [profileTenantId, setProfileTenantId] = useState<string | null>(null);
  const [maintenance, setMaintenance] = useState<{ mode: boolean; message: string } | null>(null);

  // Payment states for GCash/Maya
  const [gcashCopied, setGcashCopied] = useState(false);
  const [mayaCopied, setMayaCopied] = useState(false);
  const copyNumber = (type: 'gcash' | 'maya') => {
    navigator.clipboard.writeText('09951665423').catch(() => {});
    if (type === 'gcash') {
      setGcashCopied(true);
      setTimeout(() => setGcashCopied(false), 2500);
    } else {
      setMayaCopied(true);
      setTimeout(() => setMayaCopied(false), 2500);
    }
  };
  // Stable refs for store actions — prevents spurious effect re-runs
  const setLoadingRef = useRef(useTenantStore.getState().setLoading);
  const setErrorRef = useRef(useTenantStore.getState().setError);
  const setActiveTenantRef = useRef(useTenantStore.getState().setActiveTenant);

  // 0. Fetch System Config (Maintenance Mode)
  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(doc(db, 'system', 'config'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setMaintenance({ mode: data.maintenanceMode, message: data.maintenanceMessage });
      }
    }, (err) => {
      // Suppress harmless Firebase 400 Bad Request / Listen channel fallback errors from cluttering the console
      if (err.code !== 'permission-denied') {
        console.debug('Firebase system config listener network status:', err.message);
      }
    });
    return () => unsub();
  }, [db]);

  // 1. Auth Status & Admin Check — only re-runs when the logged-in user identity changes
  const userUid = user?.uid ?? null;
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      useTenantStore.getState().reset();
      setIsAdmin(null);
      setChecking(false);
      return;
    }

    // isAdmin already resolved — nothing more to do here
    if (isAdmin !== null) return;

    // We only reach here if user is logged in AND isAdmin is null (initial load or fresh login)
    user.getIdToken().then(() => {
      const adminRef = doc(db, 'admins', user.uid);
      import('firebase/firestore').then(({ getDoc }) => {
        getDoc(adminRef).then((snap) => {
          const isUserAdmin = snap.exists();
          setIsAdmin(isUserAdmin);
          if (isUserAdmin) {
            setChecking(false);
            setLoadingRef.current(false);
          }
        }).catch((err) => {
          console.error('Admin check error:', err);
          setIsAdmin(false);
        });
      });
    }).catch((err) => {
      console.error('Token fetch error:', err);
      setIsAdmin(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userUid, db, authLoading]);

  // 1b. Routing effect — runs on pathname changes (kept separate to avoid re-triggering admin check)
  useEffect(() => {
    if (authLoading || isAdmin === null) return;
    if (!user) {
      const isPublicPath = pathname === '/' || pathname === '/admin' || pathname.startsWith('/rsvp') || pathname.startsWith('/product') || pathname.startsWith('/terms') || pathname.startsWith('/onboarding') || pathname.startsWith('/about') || pathname.startsWith('/faq') || pathname.startsWith('/modules') || pathname.startsWith('/privacy');
      if (!isPublicPath) router.push('/');
      return;
    }
    if (isAdmin === true) {
      if (pathname !== '/admin' && pathname !== '/dashboard' && !pathname.startsWith('/module/')) {
        router.push('/admin');
      }
    } else if (isAdmin === false) {
      if (pathname === '/admin') router.push('/dashboard');
    }
  }, [user, isAdmin, pathname, router, authLoading]);

  // 2. Fetch User Profile to get Tenant ID — only re-attaches when user identity or admin status changes
  useEffect(() => {
    // Only fetch tenant if the user is authenticated and NOT an admin
    if (!userUid || isAdmin === true || isAdmin === null || !user) return;
    
    setLoadingRef.current(true);
    const userRef = doc(db, 'users', user.uid);
    
    const unsubscribeUser = onSnapshot(userRef, (userSnap) => {
      if (userSnap.exists()) {
        const userData = userSnap.data() as any;
        useTenantStore.getState().setUserProfile(userData);
        setProfileTenantId(userData.tenantId || null);

        const persistedTenant = useTenantStore.getState().activeTenant;
        // Verify that the persisted tenant actually belongs to the newly logged-in user
        const isAuthorizedForPersisted = persistedTenant && 
          (persistedTenant.ownerUid === user.uid || (persistedTenant.staffUids || []).includes(user.uid));

        if (userData.approvalStatus === 'pending_owner' || userData.approvalStatus === 'pending_admin' || userData.approvalStatus === 'pending') {
          // If staff is pending, we don't need to fetch tenant. Drop checking immediately.
          setChecking(false);
          setLoadingRef.current(false);
        } else if (persistedTenant && isAuthorizedForPersisted) {
          setTenantId(persistedTenant.id);
        } else if (userData.tenantId) {
          setTenantId(userData.tenantId);
        } else {
          setErrorRef.current('User is not associated with any business.');
          setChecking(false);
          setLoadingRef.current(false);
        }
      } else {
        setErrorRef.current('User profile not found.');
        setChecking(false);
        setLoadingRef.current(false);
      }
    }, (err) => {
      console.error('AuthGuard: User Profile Security/Network Error', err);
      setErrorRef.current('Connection interrupted while fetching user.');
      setChecking(false);
      setLoadingRef.current(false);
    });

    return () => unsubscribeUser();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userUid, isAdmin, db]);

  // 3. Fetch Tenant Data — only re-attaches when the tenantId changes
  useEffect(() => {
    if (!tenantId) return;
    
    setLoadingRef.current(true);
    const tenantRef = doc(db, 'tenants', tenantId);
    
    let unsubscribeTenant: (() => void) | undefined;
    let retryTimeout: NodeJS.Timeout;
    let retryCount = 0;
    const MAX_RETRIES = 5;

    const attachListener = () => {
      unsubscribeTenant = onSnapshot(tenantRef, (tenantSnap) => {
        if (tenantSnap.exists()) {
          const tenantData = { id: tenantSnap.id, ...tenantSnap.data() } as Tenant;
          setActiveTenantRef.current(tenantData);
          // Use latest pathname via the ref to avoid stale closure without adding pathname as dep
          if (window.location.pathname === '/') router.push('/dashboard');
        } else {
          setErrorRef.current('Business account not found or was deleted.');
        }
        setChecking(false);
        setLoadingRef.current(false);
      }, (err) => {
        const auth = getAuth(app);
        if (!auth.currentUser) {
          console.log('AuthGuard: Ignoring fetch error because user is signed out.');
          return;
        }

        console.error(`AuthGuard: Tenant Fetch Security/Network Error (Attempt ${retryCount + 1}/${MAX_RETRIES})`, err);
        if (retryCount < MAX_RETRIES) {
          retryCount++;
          retryTimeout = setTimeout(attachListener, 500 * Math.pow(2, retryCount - 1));
        } else {
          setErrorRef.current('Connection interrupted while fetching business data after multiple retries. Please refresh.');
          setChecking(false);
          setLoadingRef.current(false);
        }
      });
    };

    attachListener();

    return () => {
      if (unsubscribeTenant) unsubscribeTenant();
      clearTimeout(retryTimeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, db]);

  const isPublicRoute = pathname === '/' || pathname === '/admin' || pathname.startsWith('/rsvp') || pathname.startsWith('/product') || pathname.startsWith('/terms') || pathname.startsWith('/onboarding') || pathname.startsWith('/about') || pathname.startsWith('/faq') || pathname.startsWith('/modules') || pathname.startsWith('/privacy');
  const isOnboarding = pathname.startsWith('/onboarding');

  // 1. Initial Loading/Hydration State
  // Public routes (marketing pages, product pages, onboarding, etc.) must NOT block on authLoading.
  // They render immediately; auth state resolves in the background. Only authenticated routes
  // (/dashboard, /admin) need to block on authLoading to prevent flashing unauthorized content.
  // Note: onboarding is already excluded because creating an account logs the user in mid-flow.
  if (!isPublicRoute && (authLoading || checking || isLoading || (user && isAdmin === null))) {
    console.log('AuthGuard is blocking render:', { authLoading, isOnboarding, checking, isLoading, hasUser: !!user, isAdmin });
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

  // 2. Pending Activation & Suspended View
  const isOwnerPendingOrSuspended = activeTenant?.subscriptionStatus === 'pending' || activeTenant?.subscriptionStatus === 'suspended';
  const isStaffPendingOwner = (userProfile?.role === 'guest' || userProfile?.role === 'pending_staff' || userProfile?.role === 'staff') && userProfile?.approvalStatus === 'pending_owner';
  const isStaffPendingAdmin = (userProfile?.role === 'guest' || userProfile?.role === 'pending_staff' || userProfile?.role === 'staff') && userProfile?.approvalStatus === 'pending_admin';
  const isBudgetMo = activeTenant?.pricingTier === 'promo_50' || activeTenant?.moduleType === 'budget-mo';

  if ((isOwnerPendingOrSuspended || isStaffPendingOwner || isStaffPendingAdmin) && !isPublicRoute && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-8 text-center">
        <div className="p-6 bg-white rounded-[24px] shadow-2xl border border-amber-100 flex flex-col items-center w-full max-w-sm">
          <div className="p-4 bg-amber-50 rounded-full mb-4">
            <Loader2 className="h-12 w-12 text-amber-500 animate-spin" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            {activeTenant?.subscriptionStatus === 'suspended' ? 'Subscription Expired' : 'Pending Verification'}
          </h1>
          <p className="text-sm font-medium text-slate-600 mb-6 max-w-sm mx-auto leading-relaxed">
            {isStaffPendingOwner ? (
              <>Your account is waiting for <strong>Store Owner</strong> approval.</>
            ) : isStaffPendingAdmin ? (
              <>Your account is waiting for <strong>System Admin</strong> activation.</>
            ) : activeTenant?.subscriptionStatus === 'suspended' ? (
              <>Your subscription has expired. Please pay to restore access.</>
            ) : (
              <>Your business <strong>{activeTenant?.name}</strong> is waiting for payment verification.</>
            )}
          </p>

          {/* Payment Number Cards */}
          <div className="w-full space-y-3 mb-6">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 text-center">Send Payment To</p>
            <div className="grid grid-cols-2 gap-3">
              {/* GCash Card */}
              <div className="bg-blue-50 border-2 border-blue-100 rounded-2xl p-4 flex flex-col items-center text-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full bg-[#007DFE] flex items-center justify-center shrink-0">
                    <span className="text-white text-[8px] font-black">G</span>
                  </div>
                  <span className="text-sm font-black text-[#007DFE] uppercase tracking-wide">GCash</span>
                </div>
                <p className="text-sm font-black text-slate-900 tracking-widest leading-tight tabular-nums">0995 166 5423</p>
                <button
                  onClick={() => copyNumber('gcash')}
                  className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg w-full justify-center transition-all duration-200 active:scale-95 ${
                    gcashCopied ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-[#007DFE] text-white hover:bg-blue-700'
                  }`}
                >
                  {gcashCopied ? <><Check className="h-3 w-3" /> Copied!</> : <><Copy className="h-3 w-3" /> Copy Number</>}
                </button>
              </div>

              {/* Maya Card */}
              <div className="bg-green-50 border-2 border-green-100 rounded-2xl p-4 flex flex-col items-center text-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full bg-[#00A14B] flex items-center justify-center shrink-0">
                    <span className="text-white text-[8px] font-black">M</span>
                  </div>
                  <span className="text-sm font-black text-[#00A14B] uppercase tracking-wide">Maya</span>
                </div>
                <p className="text-sm font-black text-slate-900 tracking-widest leading-tight tabular-nums">0995 166 5423</p>
                <button
                  onClick={() => copyNumber('maya')}
                  className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg w-full justify-center transition-all duration-200 active:scale-95 ${
                    mayaCopied ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-[#00A14B] text-white hover:bg-green-700'
                  }`}
                >
                  {mayaCopied ? <><Check className="h-3 w-3" /> Copied!</> : <><Copy className="h-3 w-3" /> Copy Number</>}
                </button>
              </div>
            </div>
          </div>

          {/* Payment Instructions */}
          <div className="w-full bg-amber-50 border border-amber-100 rounded-xl p-4 text-left space-y-3 mb-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-1">How to Pay</p>
            <div className="space-y-2">
              {[
                'Open GCash or Maya → tap Send Money → paste the number above.',
                `Enter the exact amount: ${isBudgetMo ? '₱50.00' : '₱99.00'}.`,
                'Take a screenshot of your confirmation, then send it to us on Messenger below — your details will be pre-filled!'
              ].map((text, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="h-4 w-4 rounded-full bg-amber-500 text-white text-[8px] font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</div>
                  <p className="text-xs text-amber-900 font-medium leading-tight">{text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="w-full space-y-3">
            <a 
              href={`https://m.me/katuwangsolutions?text=${encodeURIComponent(`Bayad ko na po!\n\nPangalan: ${userProfile?.fullName || 'N/A'}\nEmail: ${user?.email || 'N/A'}\nNegosyo: ${activeTenant?.name || 'N/A'}\nHalaga: ${isBudgetMo ? '₱50.00' : '₱99.00'}\n\n(Screenshot attached below 👇)`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full h-12 rounded-xl text-white font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-lg"
              style={{ background: '#0099FF' }}
            >
              <ExternalLink className="h-5 w-5" />
              Send Receipt on Messenger
            </a>
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

  // 2.5 Pending Staff Approval View
  if (userProfile?.approvalStatus === 'pending' && !isPublicRoute && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-8 text-center">
        <div className="p-6 bg-white rounded-[24px] shadow-2xl border border-blue-100 flex flex-col items-center w-full max-w-sm">
          <div className="p-4 bg-blue-50 rounded-full mb-4">
            <Loader2 className="h-12 w-12 text-blue-500 animate-spin" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Waiting for Approval</h1>
          <p className="text-sm font-medium text-slate-600 mb-6 max-w-sm mx-auto leading-relaxed">
            Your staff account has been created successfully. Please ask your Store Owner to approve your account from their dashboard.
          </p>
          <div className="w-full space-y-3">
            <button 
              onClick={() => {
                const auth = getAuth(app);
                signOut(auth).then(() => {
                  router.push('/');
                });
              }}
              className="w-full bg-slate-100 text-slate-600 h-12 rounded-xl font-bold active:scale-[0.98] transition-transform hover:bg-slate-200"
            >
              Sign Out & Return
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
    (!user && pathname !== '/' && pathname !== '/admin' && !pathname.startsWith('/rsvp') && !pathname.startsWith('/product') && !pathname.startsWith('/onboarding') && !pathname.startsWith('/terms') && !pathname.startsWith('/about') && !pathname.startsWith('/faq') && !pathname.startsWith('/modules') && !pathname.startsWith('/privacy')) ||
    (user !== null && isAdmin === false && pathname === '/admin') ||
    (isAdmin === true && pathname !== '/admin' && pathname !== '/dashboard' && !pathname.startsWith('/module/'));

  if (isUnauthorized) {
    // console.log("AuthGuard: Unauthorized route, hiding content while redirecting. Path:", pathname);
    return (
      <div className="w-full min-h-screen bg-white">
        <div className="hidden">{children}</div>
      </div>
    );
  }

  return <>{children}</>;
}
