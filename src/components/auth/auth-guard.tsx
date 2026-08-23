'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUser } from '@/firebase/auth/use-user';
import { useTenantStore, Tenant } from '@/store/use-tenant-store';
import { doc, onSnapshot } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { initializeFirebase } from '@/firebase';
import { ShieldAlert, Loader2, AlertCircle, Copy, Check, ExternalLink } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { useFirestore } from '@/firebase/provider';
import { isValidActiveModuleId } from '@/lib/app-data';
import { useSecureCashierStore } from '@/store/use-secure-cashier-store';
import { fetchBentaBootstrap } from '@/lib/client/secure-benta-cashier-client';
import { selectAuthoritativeTenantId, validateAuthoritativeTenant, UserProfileAuthData } from '@/lib/auth/owner-tenant-authorization';
import { isMasterAdminClaim } from '@/lib/auth/admin-claim-resolver';

function isPublicPathname(pathname: string): boolean {
  if (!pathname || pathname === '/' || pathname === '/admin' || pathname === '/login' || pathname === '/auth' || pathname === '/auth/action' || pathname === '/__/auth/action') return true;

  const publicPrefixes = [
    '/rsvp', '/product', '/terms', '/onboarding',
    '/about', '/faq', '/modules', '/privacy'
  ];
  if (publicPrefixes.some(prefix => pathname.startsWith(prefix))) return true;

  const firstSegment = pathname.split('/')[1];
  if (firstSegment && isValidActiveModuleId(firstSegment)) return true;

  return false;
}

// Purge any stale legacy localStorage on module execution
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    window.localStorage.removeItem('katuwang-staff-session-storage');
  } catch {
    // Ignore storage access error
  }
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const db = useFirestore();
  const { user, loading: authLoading } = useUser();
  const activeTenant = useTenantStore(state => state.activeTenant);
  const userProfile = useTenantStore(state => state.userProfile);
  const isLoading = useTenantStore(state => state.isLoading);
  const error = useTenantStore(state => state.error);
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isCashierUser, setIsCashierUser] = useState<boolean>(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [, setProfileTenantId] = useState<string | null>(null);
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
      if (err.code !== 'permission-denied') {
        console.debug('Firebase system config listener network status:', err.message);
      }
    });
    return () => unsub();
  }, [db]);

  // 1. Auth Status & Role Resolution
  const userUid = user?.uid ?? null;
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      useTenantStore.getState().reset();
      useSecureCashierStore.getState().clearCashierSession();
      setIsAdmin(null);
      setIsCashierUser(false);
      setChecking(false);
      return;
    }

    user.getIdTokenResult().then(async (tokenResult) => {
      const claims = tokenResult.claims || {};

      // A. Secure Cashier Identity via Firebase Token Claims
      if (claims.role === 'cashier') {
        setIsCashierUser(true);
        setIsAdmin(false);
        try {
          const idToken = await user.getIdToken();
          const bootstrap = await fetchBentaBootstrap(idToken);
          useSecureCashierStore.getState().setBootstrap(bootstrap);

          useTenantStore.getState().setActiveTenant({
            id: bootstrap.tenantId,
            name: bootstrap.tenantDisplayName,
            moduleType: bootstrap.moduleId,
            ownerUid: 'staff_authenticated',
            staffUids: [bootstrap.staffAccountId],
            pricingTier: 'standard_100',
            subscriptionStatus: 'active',
            createdAt: new Date().toISOString()
          });

          setChecking(false);
          setLoadingRef.current(false);
        } catch (err: any) {
          console.warn('AuthGuard: Cashier bootstrap validation failed, signing out:', err?.message);
          useSecureCashierStore.getState().clearCashierSession();
          const { auth } = initializeFirebase();
          await signOut(auth);
          router.push('/');
        }
        return;
      }

      // B. Normal Account (Owner / Staff / Member / Admin)
      setIsCashierUser(false);
      useSecureCashierStore.getState().clearCashierSession();
      const isClaimAdmin = isMasterAdminClaim(claims);
      setIsAdmin(isClaimAdmin);
      if (isClaimAdmin) {
        setChecking(false);
        setLoadingRef.current(false);
        return;
      }

      // Signed token claims (cryptographically signed by Firebase Auth server):
      const tokenTenantId = typeof claims.tenantId === 'string' && claims.tenantId.trim().length > 0 ? claims.tenantId : undefined;
      const tokenRole = typeof claims.role === 'string' ? claims.role : undefined;

      if (tokenTenantId) {
        const tokenAuthoritativeProfile: UserProfileAuthData = {
          tenantId: tokenTenantId,
          tenantIds: [tokenTenantId],
          role: tokenRole || 'owner'
        };
        const persistedTenantId = useTenantStore.getState().activeTenant?.id;
        const resolution = selectAuthoritativeTenantId(tokenAuthoritativeProfile, persistedTenantId);
        if (resolution.selectedTenantId) {
          setTenantId(resolution.selectedTenantId);
        }
      }
    }).catch((err) => {
      console.error('Token fetch error:', err);
      setIsAdmin(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userUid, db, authLoading]);

  // 1b. Routing effect — runs on pathname changes
  useEffect(() => {
    if (authLoading || checking) return;

    if (!user) {
      const isPublicPath = isPublicPathname(pathname);
      if (!isPublicPath) router.push('/');
      return;
    }

    if (isCashierUser) {
      if (pathname === '/admin') {
        router.push('/dashboard');
      }
      return;
    }

    if (isAdmin === null) return;
    if (isAdmin === true) {
      if (pathname !== '/admin' && pathname !== '/dashboard' && !pathname.startsWith('/module/')) {
        router.push('/admin');
      }
    } else if (isAdmin === false) {
      if (pathname === '/admin') router.push('/dashboard');
    }
  }, [user, isAdmin, isCashierUser, pathname, router, authLoading, checking]);

  // 2. Fetch User Profile to get Authoritative Tenant ID — for non-Cashier, non-Admin users
  useEffect(() => {
    if (!userUid || isAdmin === true || isAdmin === null || isCashierUser || !user) return;

    const userRef = doc(db, 'users', user.uid);

    const unsubscribeUser = onSnapshot(userRef, (userSnap) => {
      if (userSnap.exists()) {
        const userData = userSnap.data() as UserProfileAuthData;
        useTenantStore.getState().setUserProfile(userData as any);
        setProfileTenantId(userData.tenantId || null);

        if (userData.approvalStatus === 'pending_owner' || userData.approvalStatus === 'pending_admin' || userData.approvalStatus === 'pending') {
          setChecking(false);
          setLoadingRef.current(false);
          return;
        }

        const persistedTenantId = useTenantStore.getState().activeTenant?.id;
        const resolution = selectAuthoritativeTenantId(userData, persistedTenantId);

        if (resolution.selectedTenantId) {
          setTenantId(resolution.selectedTenantId);
        } else {
          setErrorRef.current(resolution.error || 'User is not associated with any business.');
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
  }, [userUid, isAdmin, isCashierUser, db]);

  // 3. Fetch Tenant Data — for non-Cashier, non-Admin users
  useEffect(() => {
    if (!tenantId || isCashierUser) return;

    const tenantRef = doc(db, 'tenants', tenantId);

    let unsubscribeTenant: (() => void) | undefined;
    let retryTimeout: NodeJS.Timeout;
    let retryCount = 0;
    const MAX_RETRIES = 5;

    const attachListener = () => {
      unsubscribeTenant = onSnapshot(tenantRef, (tenantSnap) => {
        if (tenantSnap.exists()) {
          const authoritativeTenantData = { id: tenantSnap.id, ...tenantSnap.data() } as Tenant;

          // Authoritative validation strictly on the verified Firestore document snapshot:
          const validation = validateAuthoritativeTenant(user?.uid || '', authoritativeTenantData);

          if (validation.isAuthorized) {
            setActiveTenantRef.current(authoritativeTenantData);
            if (window.location.pathname === '/') router.push('/dashboard');
          } else {
            // Forged or unauthorized tenant: fail closed
            useTenantStore.getState().reset();
            setErrorRef.current(validation.error || 'Unauthorized tenant access.');
          }
        } else {
          useTenantStore.getState().reset();
          setErrorRef.current('Business account not found or was deleted.');
        }
        setChecking(false);
        setLoadingRef.current(false);
      }, (err) => {
        const { auth } = initializeFirebase();
        if (!auth.currentUser) return;

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
  }, [tenantId, isCashierUser, db]);

  const isPublicRoute = isPublicPathname(pathname);

  // 1. Initial Loading/Hydration State
  if (!isPublicRoute && !error && (authLoading || checking || (user && isAdmin === null && !isCashierUser))) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white">
        <div className="relative flex flex-col items-center gap-6">
          <BrandLogo showText={false} className="[&>div]:h-20 [&>div]:w-20 [&>div]:sm:h-24 [&>div]:sm:w-24 animate-pulse" />
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
              Initializing Ecosystem...
            </p>
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
                const { auth } = initializeFirebase();
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

  // 2. Pending Activation & Suspended View (Owners/Members)
  const isOwnerPendingOrSuspended = !isCashierUser && (activeTenant?.subscriptionStatus === 'pending' || activeTenant?.subscriptionStatus === 'suspended');
  const isStaffPendingOwner = !isCashierUser && (userProfile?.role === 'guest' || userProfile?.role === 'pending_staff' || userProfile?.role === 'staff') && userProfile?.approvalStatus === 'pending_owner';
  const isStaffPendingAdmin = !isCashierUser && (userProfile?.role === 'guest' || userProfile?.role === 'pending_staff' || userProfile?.role === 'staff') && userProfile?.approvalStatus === 'pending_admin';
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

          <div className="w-full space-y-3 mb-6">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 text-center">Send Payment To</p>
            <div className="grid grid-cols-2 gap-3">
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
                const { auth } = initializeFirebase();
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
                const { auth } = initializeFirebase();
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

  // 4. Strict Routing Render Locks
  const isUnauthorized =
    (!user && !isPublicRoute) ||
    (user !== null && isAdmin === false && !isCashierUser && pathname === '/admin') ||
    (user !== null && isCashierUser && pathname === '/admin') ||
    (isAdmin === true && pathname !== '/admin' && pathname !== '/dashboard' && !pathname.startsWith('/module/'));

  if (isUnauthorized) {
    return (
      <div className="w-full min-h-screen bg-white">
        <div className="hidden">{children}</div>
      </div>
    );
  }

  return <>{children}</>;
}
