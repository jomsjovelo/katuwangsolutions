'use client';

import React, { useState, useEffect } from 'react';
import { useUser } from '@/firebase/auth/use-user';
import { getAuth, signOut } from 'firebase/auth';
import { useFirestore } from '@/firebase/provider';
import { useTenant } from '@/app/lib/tenant-context';
import { usePWAInstall } from '@/hooks/use-pwa-install';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  getFirestore,
  updateDoc,
  setDoc,
  getDoc
} from 'firebase/firestore';
import { app } from '@/firebase/config';
import { sendStaffInvite, removeStaffMember, regenerateBusinessCode } from '@/firebase/firestore/staff-actions';
import { getModuleTheme } from '@/lib/theme-utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTenantStore } from '@/store/use-tenant-store';
import { WithdrawReferralSheet } from '@/components/common/withdraw-referral-sheet';
import { ReferralHistorySheet } from '@/components/dashboard/referral-history-sheet';
import { 
  User, 
  Users, 
  UserPlus, 
  Mail, 
  Trash2, 
  Loader2, 
  LogOut, 
  CheckCircle,
  HelpCircle,
  Clock,
  ShieldCheck,
  Store,
  Printer,
  Bluetooth,
  ChevronRight,
  ArrowLeftRight,
  Download,
  Share,
  PlusSquare,
  Wallet,
  Upload,
  QrCode,
  X,
  Share2,
  Banknote,
  Link as LinkIcon,
  CheckCircle2,
  Copy,
  RefreshCw
} from 'lucide-react';
import { EscPosBluetoothDriver } from '@/lib/hardware/print-driver';
import { HelpGuideDrawer } from '@/components/shell/help-guide-drawer';
import { SponsorDialog } from '@/components/dashboard/sponsor-dialog';

export function ProfileTab() {
  const db = useFirestore();
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const { user } = useUser();
  const { currentTenant, setCurrentTenant, allTenants } = useTenant();
  const { reset } = useTenantStore();
  const { deferredPrompt, isInstalled, triggerInstall, isIOS } = usePWAInstall();
  
  const [profile, setProfile] = useState<any>(null);
  const [activeStaff, setActiveStaff] = useState<any[]>([]);
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [isRemovingId, setIsRemovingId] = useState<string | null>(null);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isSponsorOpen, setIsSponsorOpen] = useState(false);
  const [sponsorStaffName, setSponsorStaffName] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);
  
  // New referral state
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [referralHistory, setReferralHistory] = useState<any[]>([]);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [isCopiedLink, setIsCopiedLink] = useState(false);

  // QR Upload state
  const [isUploadingQr, setIsUploadingQr] = useState(false);
  const [qrUploadError, setQrUploadError] = useState<string | null>(null);

  const theme = getModuleTheme(currentTenant?.moduleType);
  const isOwner = profile?.role === 'owner';

  // 1. Fetch Real-time User Profile
  useEffect(() => {
    if (!user) return;
    
    const userRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        setProfile(snap.data());
      }
    }, (err) => {
      // Suppress non-critical profile read errors
      console.warn('ProfileTab: Could not read user profile:', err.message);
    });

    return () => unsubscribe();
  }, [user]);

  // 1.5 Fetch Referral History
  useEffect(() => {
    if (!user) return;
    
    // We import orderBy and limit inside useEffect or at top of file, but we already have `query` etc.
    // Ensure we import them safely if missing from top level:
    const fetchHistory = async () => {
      const { query, collection, orderBy, limit, onSnapshot } = await import('firebase/firestore');
      const historyRef = collection(db, 'users', user.uid, 'referral_history');
      const q = query(historyRef, orderBy('creditedAt', 'desc'), limit(10));
      
      const unsubscribe = onSnapshot(q, (snap) => {
        setReferralHistory(snap.docs.map(d => d.data()));
      });
      return unsubscribe;
    };
    
    let unsub: (() => void) | undefined;
    fetchHistory().then(u => { unsub = u; });
    return () => { if (unsub) unsub(); };
  }, [user, db]);

  // 2. Fetch Active Staff List (role == staff & tenantId == tenantId)
  // Only owners can manage staff — non-owners skip this subscription
  useEffect(() => {
    if (!currentTenant || !profile || profile.role !== 'owner') return;

    const staffQuery = query(
      collection(db, 'users'),
      where('tenantId', '==', currentTenant.id),
      where('role', '==', 'staff')
    );

    const unsubscribe = onSnapshot(staffQuery, (snapshot) => {
      const staffList = snapshot.docs.map(d => d.data());
      setActiveStaff(staffList);
    }, (err) => {
      // Rule not yet deployed or user not an owner — fail silently
      console.warn('ProfileTab: Staff list unavailable:', err.message);
      setActiveStaff([]);
    });

    return () => unsubscribe();
  }, [currentTenant, profile?.role]);

  // 3. Fetch Pending Invites List
  // Only owners can see invites — non-owners skip this subscription
  useEffect(() => {
    if (!currentTenant || !profile || profile.role !== 'owner') return;

    const invitesQuery = query(
      collection(db, 'invites'),
      where('tenantId', '==', currentTenant.id),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(invitesQuery, (snapshot) => {
      const invitesList = snapshot.docs.map(d => d.data());
      setPendingInvites(invitesList);
    }, (err) => {
      // Rule not yet deployed or user not an owner — fail silently
      console.warn('ProfileTab: Invites list unavailable:', err.message);
      setPendingInvites([]);
    });

    return () => unsubscribe();
  }, [currentTenant, profile?.role]);

  // Patch for Demo Account (or any missing code)
  useEffect(() => {
    if (!user || !currentTenant || !isOwner) return;
    if (!currentTenant.businessCode || (profile && !profile.referralCode)) {
      const patchCode = async () => {
        try {
          const isDemo = currentTenant.id === 'demo' || currentTenant.name.toLowerCase().includes('demo');
          
          let codeToUse = 'DEMO123';
          if (!isDemo) {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let isUnique = false;
            let attempts = 0;
            while (!isUnique && attempts < 10) {
              codeToUse = Array.from({ length: 7 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
              const bSnap = await getDoc(doc(db, 'business_codes', codeToUse));
              const rSnap = await getDoc(doc(db, 'referral_codes', codeToUse));
              if (!bSnap.exists() && !rSnap.exists()) isUnique = true;
              attempts++;
            }
          }
          
          // Patch business code
          if (!currentTenant.businessCode) {
            await setDoc(doc(db, 'business_codes', codeToUse), { tenantId: currentTenant.id });
            await updateDoc(doc(db, 'tenants', currentTenant.id), { businessCode: codeToUse });
            setCurrentTenant({ ...currentTenant, businessCode: codeToUse });
          }

          // Patch referral code
          if (profile && !profile.referralCode) {
            await setDoc(doc(db, 'referral_codes', codeToUse), { uid: user.uid });
            await updateDoc(doc(db, 'users', user.uid), { referralCode: codeToUse });
            setProfile({ ...profile, referralCode: codeToUse });
          }

        } catch (e) {
          console.error("Failed to patch business/referral code:", e);
        }
      };
      patchCode();
    }
  }, [currentTenant, isOwner, db, setCurrentTenant, profile, user]);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant || !inviteEmail) return;

    try {
      setIsInviting(true);
      setInviteError(null);
      setInviteSuccess(null);

      await sendStaffInvite(
        currentTenant.id,
        currentTenant.name,
        currentTenant.moduleType,
        inviteEmail
      );

      setInviteSuccess(`Matagumpay na na-invite si ${inviteEmail}!`);
      setInviteEmail('');
      setTimeout(() => setInviteSuccess(null), 4000);
    } catch (e: any) {
      console.error(e);
      setInviteError(e.message || "May error sa pagpapadala ng invitation.");
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveStaff = async (staffUid: string) => {
    if (!currentTenant) return;
    if (!confirm("Sigurado ka ba na gusto mong tanggalin ang access ng helper na ito?")) return;

    try {
      setIsRemovingId(staffUid);
      await removeStaffMember(currentTenant.id, staffUid);
    } catch (e: any) {
      console.error(e);
      alert("May error sa pagtanggal ng staff.");
    } finally {
      setIsRemovingId(null);
    }
  };

  const handleInstallClick = () => {
    if (deferredPrompt) {
      triggerInstall();
    } else {
      setShowInstallGuide(true);
    }
  };

  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentTenant) return;
    
    setIsUploadingQr(true);
    setQrUploadError(null);
    
    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new window.Image();
        img.onload = async () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 300;
          const MAX_HEIGHT = 300;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error("Could not get canvas context");
          
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          
          const base64String = canvas.toDataURL('image/jpeg', 0.8);
          
          await updateDoc(doc(db, 'tenants', currentTenant.id), {
            gcashQrImageBase64: base64String,
            updatedAt: new Date()
          });
          
          setIsUploadingQr(false);
        };
        img.src = event.target?.result as string;
      };
      reader.onerror = () => {
        throw new Error("Failed to read file.");
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error(err);
      setQrUploadError(err.message || 'Error processing QR code.');
      setIsUploadingQr(false);
    }
  };

  const handleRemoveQr = async () => {
    if (!currentTenant) return;
    if (!confirm("Sigurado ka bang gusto mong alisin ang GCash QR Code na ito?")) return;
    
    setIsUploadingQr(true);
    try {
      await updateDoc(doc(db, 'tenants', currentTenant.id), {
        gcashQrImageBase64: null,
        updatedAt: new Date()
      });
    } catch (err: any) {
      console.error(err);
      setQrUploadError("Failed to remove QR code.");
    } finally {
      setIsUploadingQr(false);
    }
  };

  const handleSignOut = async () => {
    try {
      const auth = getAuth(app);
      await signOut(auth);
      reset();
      window.location.href = '/'; // Clear and route safely
    } catch (e) {
      console.error("Sign out error:", e);
    }
  };

  const [btStatus, setBtStatus] = useState<string>('Not Connected');
  const handleTestPrinter = async () => {
    try {
      setBtStatus('Connecting...');
      const driver = new EscPosBluetoothDriver();
      const connected = await driver.connect();
      if (connected) {
        setBtStatus('Connected & Printing Test...');
        const bytes = driver.formatReceipt(
          currentTenant?.name || "Katuwang Test",
          [{ name: "Test Item", price: 10000, quantity: 1, productId: "1" }],
          100.00,
          "TEST"
        );
        await driver.print(bytes);
        setBtStatus('Success!');
        setTimeout(() => setBtStatus('Not Connected'), 3000);
      }
    } catch (e: any) {
      setBtStatus(`Error: ${e.message}`);
    }
  };

  const handleRegenerateCode = async () => {
    if (!currentTenant || !currentTenant.businessCode) return;
    if (!confirm("Are you sure you want to regenerate the business code? The old code will no longer work for new staff invites.")) return;
    
    setIsRegenerating(true);
    try {
      const newCode = await regenerateBusinessCode(currentTenant.id, currentTenant.businessCode);
      setCurrentTenant({ ...currentTenant, businessCode: newCode });
    } catch (e: any) {
      alert(e.message || "Failed to regenerate code.");
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-h-full">
      <main className="p-4 space-y-6 pb-24">
        
        {/* User Card */}
        <Card className="bg-white border-slate-200 shadow-sm overflow-hidden rounded-[24px]">
          <div className="h-2 bg-gradient-to-r" style={{ backgroundImage: `linear-gradient(to right, ${theme.primary}, ${theme.secondary})` }} />
          <CardHeader className="p-5 flex flex-row items-center gap-4">
            <div 
              className="h-12 w-12 rounded-2xl flex items-center justify-center text-white"
              style={{ backgroundColor: theme.primary }}
            >
              <User className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-base font-black text-slate-800">{profile?.fullName || 'User Profile'}</CardTitle>
              <CardDescription className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-1 mt-0.5">
                <ShieldCheck className="h-3.5 w-3.5" style={{ color: theme.secondary }} />
                {profile?.role === 'owner' ? 'Store Owner' : 'Staff'}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-0 space-y-2.5 border-t border-slate-100 text-xs">
            <div className="flex justify-between">
              <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Email Address</span>
              <span className="font-semibold text-slate-700">{user?.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Active Store</span>
              <span className="font-semibold text-slate-700">{currentTenant?.name}</span>
            </div>
          </CardContent>
        </Card>

        {/* My Apps & Stores */}
        {allTenants.length > 0 && (
          <Card className="bg-white border-slate-200 shadow-sm overflow-hidden rounded-[24px]">
            <CardHeader className="p-4 pb-2 flex flex-row items-center gap-2">
              <ArrowLeftRight className="h-4 w-4" style={{ color: theme.primary }} />
              <CardTitle className="text-sm font-black text-slate-800">My Apps &amp; Stores</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {allTenants.map(t => {
                  const isActive = t.id === currentTenant?.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => !isActive && setCurrentTenant(t)}
                      disabled={isActive}
                      className="w-full flex items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-slate-50 disabled:cursor-default"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="h-9 w-9 rounded-xl flex items-center justify-center text-white shrink-0"
                          style={{ backgroundColor: isActive ? theme.primary : '#94a3b8' }}
                        >
                          <Store className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800 leading-tight">
                            {t.branchName ? `${t.name} — ${t.branchName}` : t.name}
                          </p>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{t.moduleType}</p>
                        </div>
                      </div>
                      {isActive ? (
                        <Badge className="text-[9px] font-black uppercase tracking-widest border-none shrink-0" style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}>
                          Active
                        </Badge>
                      ) : (
                        <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Printer Settings */}
        <Card className="bg-white border-slate-200 shadow-sm rounded-[24px]">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-black text-slate-800 flex items-center gap-2">
              <Printer className="h-4 w-4" style={{ color: theme.primary }} />
              Bluetooth Receipt Printer
            </CardTitle>
            <CardDescription className="text-[11px] font-medium leading-relaxed mt-0.5">
              I-connect ang inyong 58mm POS thermal printer para makapag-print ng resibo.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="flex flex-col gap-2">
              <Button 
                onClick={handleTestPrinter}
                variant="outline"
                className="w-full h-11 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border-slate-200"
              >
                <Bluetooth className="h-4 w-4 text-blue-500" />
                I-Pair at I-Test ang Printer
              </Button>
              <p className="text-[10px] text-slate-400 font-bold text-center">
                Status: <span className="text-slate-600">{btStatus}</span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Owner Only Sections */}
        {isOwner && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <QrCode className="h-5 w-5" style={{ color: theme.primary }} />
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">Settings & Payments</h3>
            </div>

            {/* Payment Settings Card */}
            <Card className="bg-white border-slate-200 shadow-sm rounded-[24px]">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <QrCode className="h-4 w-4" /> GCash / Maya QR Code
                </CardTitle>
                <CardDescription className="text-[10px]">
                  I-upload ang iyong GCash o Maya QR Ph code para awtomatiko itong lumabas sa cashier app tuwing Cashless Checkout.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                {currentTenant?.gcashQrImageBase64 ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="relative border-4 border-blue-500 rounded-2xl p-2 bg-white shadow-sm inline-block">
                      <img 
                        src={currentTenant.gcashQrImageBase64} 
                        alt="My GCash QR" 
                        className="w-32 h-32 object-contain rounded-xl"
                      />
                      {isUploadingQr && (
                        <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-xl">
                          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                        </div>
                      )}
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleRemoveQr}
                      disabled={isUploadingQr}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50 border-red-200 text-[10px] font-bold h-8 rounded-lg"
                    >
                      <X className="h-3 w-3 mr-1" /> Alisin ang QR Code
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-center w-full">
                      <label htmlFor="qr-upload" className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 border-dashed rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <Upload className="w-6 h-6 mb-2 text-slate-400" />
                          <p className="mb-1 text-[11px] font-bold text-slate-500 text-center px-4">
                            Pindutin para mag-upload ng QR Photo
                          </p>
                          <p className="text-[9px] text-slate-400">PNG, JPG (Max 5MB)</p>
                        </div>
                        <input 
                          id="qr-upload" 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={handleQrUpload}
                          disabled={isUploadingQr}
                        />
                      </label>
                    </div>
                    {isUploadingQr && <p className="text-[10px] font-bold text-blue-500 text-center animate-pulse">Ina-upload ang QR Code...</p>}
                    {qrUploadError && <p className="text-[10px] font-bold text-red-500 text-center">{qrUploadError}</p>}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        )}

        {/* Staff Management Section (Owners Only) */}
        {isOwner && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <Users className="h-5 w-5" style={{ color: theme.primary }} />
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">Staff</h3>
            </div>

            {/* Business Code & Invite section */}
            <Card className="bg-white border-slate-200 shadow-sm rounded-[24px] overflow-hidden">
              <div className="h-1 bg-gradient-to-r" style={{ backgroundImage: `linear-gradient(to right, ${theme.primary}, ${theme.secondary})` }} />
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-black text-slate-800 flex items-center gap-2">
                  <UserPlus className="h-4 w-4" style={{ color: theme.primary }} />
                  Katuwang Invite Code
                </CardTitle>
                <CardDescription className="text-[11px] font-medium leading-relaxed mt-0.5">
                  Ibigay ang code na ito sa inyong staff para makasali sila sa app bilang Team Member.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <div className="flex gap-4">
                  <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 flex-1 flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">Business Code</span>
                    <div className="flex items-center gap-2">
                      <div className="text-4xl font-black text-slate-800 tracking-[0.25em]">
                        {currentTenant?.businessCode || '----'}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleRegenerateCode}
                        disabled={isRegenerating || !currentTenant?.businessCode}
                        className="h-8 w-8 text-slate-400 hover:text-primary"
                        title="Regenerate Code"
                      >
                        {isRegenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  {currentTenant?.businessCode && (
                    <div className="bg-slate-50 rounded-xl border border-slate-100 p-2 flex items-center justify-center shrink-0">
                      <img 
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${currentTenant.businessCode}`} 
                        alt="QR Code"
                        className="w-20 h-20 rounded-lg"
                      />
                    </div>
                  )}
                </div>

              </CardContent>
            </Card>

            {/* Active Staff List */}
            <Card className="bg-white border-slate-200 shadow-sm rounded-[24px]">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">Mga Aktibong Staff</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-3">
                {activeStaff.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-xs border border-dashed border-slate-100 rounded-2xl">
                    <User className="h-7 w-7 mx-auto opacity-20 mb-1" />
                    Walang aktibong helper pa.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {activeStaff.map((staff, idx) => (
                      <div key={staff.uid || idx} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center font-black text-xs text-slate-500 uppercase">
                            {staff.fullName ? staff.fullName[0] : 'T'}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-800 flex items-center gap-2">
                              {staff.fullName || 'Team Member'}
                              {staff.subscriptionStatus === 'pending' && (
                                <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-none font-bold uppercase tracking-wider text-[8px] px-2 py-0 rounded-sm">Pending</Badge>
                              )}
                            </p>
                            <p className="text-[10px] text-slate-400">{staff.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {staff.subscriptionStatus === 'pending' && (
                            <Button
                              onClick={() => {
                                setSponsorStaffName(staff.fullName || staff.email);
                                setIsSponsorOpen(true);
                              }}
                              variant="outline"
                              className="h-8 text-[10px] font-bold uppercase tracking-widest bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                            >
                              Pay for Access
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={isRemovingId === staff.uid}
                            onClick={() => handleRemoveStaff(staff.uid)}
                            className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          >
                            {isRemovingId === staff.uid ? (
                              <Loader2 className="h-4 w-4 animate-spin text-red-500" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pending Invites List */}
            {pendingInvites.length > 0 && (
              <Card className="bg-white border-slate-200 shadow-sm rounded-[24px]">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">Mga Pending Invites</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-2">
                  <div className="divide-y divide-slate-100">
                    {pendingInvites.map((invite, idx) => (
                      <div key={invite.id || idx} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-amber-500" />
                          <span className="text-xs font-semibold text-slate-700 truncate max-w-[200px]">{invite.email}</span>
                        </div>
                        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-none font-bold uppercase tracking-wider text-[8px] px-2 py-0.5 rounded-full">
                          Pending
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            


          </section>
        )}

        {/* Staff Dashboard Informational Banner */}
        {!isOwner && (
          <Card className="bg-white border-slate-200 shadow-sm rounded-[24px] overflow-hidden">
            <div className="p-5 text-center space-y-4">
              <div className="h-12 w-12 rounded-full bg-emerald-50 mx-auto flex items-center justify-center">
                <Store className="h-6 w-6 text-emerald-500" />
              </div>
              <div className="space-y-1">
                <h4 className="font-headline font-black text-sm text-slate-800">Kasali ka bilang Staff!</h4>
                <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                  May access ka po na mag-checkout ng benta, magdagdag ng stock, at mag-lista ng transaksyon sa <strong>{currentTenant?.name}</strong>.
                </p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-[10px] text-slate-500 font-semibold leading-relaxed max-w-sm mx-auto">
                💡 Ang store admin at mga profit reports ay maaari lamang ma-access ng may-ari (Store Owner) ng tindahan. Salamat sa inyong sipag!
              </div>
            </div>
          </Card>
        )}

        {/* Referral Program Section - Gamified & Highly Enticing */}
        <Card className="bg-white border-slate-200 shadow-sm rounded-[24px] overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-600 px-6 py-5 text-white">
            <div className="flex justify-between items-start mb-2">
              <Badge className="bg-white/20 text-white hover:bg-white/30 border-none font-black uppercase tracking-widest text-[9px]">
                🚀 Passive Income
              </Badge>
              <div className="flex items-center gap-1.5 bg-white/20 px-2.5 py-1 rounded-full">
                <span className="text-xl">💸</span>
                <span className="font-black text-sm tracking-wider">₱{(profile?.referralEarnings || 0).toFixed(2)}</span>
              </div>
            </div>
            <h3 className="font-headline font-black text-lg leading-tight mb-1">
              Kumita ng ₱1,000 pataas linggo-linggo!
            </h3>
            <p className="text-emerald-50 text-xs font-medium max-w-sm leading-relaxed opacity-90">
              I-share lang ang iyong Katuwang Referral Link sa mga kaibigang may negosyo. Kikita ka ng ₱10.00 sa bawat referral, at kikita ka ULIT ng ₱10.00 <strong className="text-white bg-emerald-800/40 px-1 py-0.5 rounded">TUWING mag-rerenew</strong> sila ng subscription! Tunay na passive income na pwede mong i-withdraw via GCash.
            </p>
          </div>

          <CardContent className="p-5 space-y-5">
            
            {/* Gamified 3-Step Pipeline */}
            <div className="grid grid-cols-3 gap-2 px-1">
              <div className="flex flex-col items-center text-center">
                <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center mb-1.5 border border-emerald-100 shadow-sm">
                  <Share2 className="h-5 w-5 text-emerald-500" />
                </div>
                <span className="text-[9px] font-bold text-slate-500 uppercase">1. Share Link</span>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center mb-1.5 border border-blue-100 shadow-sm">
                  <UserPlus className="h-5 w-5 text-blue-500" />
                </div>
                <span className="text-[9px] font-bold text-slate-500 uppercase">2. They Setup</span>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center mb-1.5 border border-amber-100 shadow-sm relative">
                  <div className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                  </div>
                  <Banknote className="h-5 w-5 text-amber-500" />
                </div>
                <span className="text-[9px] font-bold text-amber-600 uppercase">3. You Earn!</span>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-3 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-3 opacity-5">
                <QrCode className="w-24 h-24" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                  <LinkIcon className="h-3.5 w-3.5" /> Ang Iyong Personal Link:
                </p>
                <div className="flex items-center gap-2">
                  <Input 
                    readOnly 
                    value={`${window.location.origin}/onboarding?ref=${profile?.referralCode || (user?.uid ? user.uid.substring(0, 4).toUpperCase() : '')}`}
                    className="rounded-xl border-slate-200 text-xs text-indigo-700 bg-white font-bold h-11 focus-visible:ring-0 cursor-text shadow-sm"
                  />
                  <Button 
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/onboarding?ref=${profile?.referralCode || (user?.uid ? user.uid.substring(0, 4).toUpperCase() : '')}`);
                      setIsCopiedLink(true);
                      setTimeout(() => setIsCopiedLink(false), 2000);
                    }}
                    className={`rounded-xl h-11 px-4 font-bold text-xs shadow-sm transition-all duration-300 ${
                      isCopiedLink 
                        ? 'bg-emerald-500 hover:bg-emerald-600 text-white' 
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                  >
                    {isCopiedLink ? <CheckCircle2 className="h-4 w-4 mr-1.5" /> : <Copy className="h-4 w-4 mr-1.5" />}
                    {isCopiedLink ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
              </div>
            </div>

            {/* Social Mission Section */}
            <div className="pt-4 border-t border-slate-100">
              <div className="bg-blue-50/50 rounded-xl border border-blue-100 overflow-hidden">
                <div className="bg-blue-100/50 px-3 py-2 border-b border-blue-100 flex items-center justify-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-800">🚀 2-Step Social Mission</p>
                </div>
                <div className="p-3 space-y-4">
                  {/* Step 1 */}
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-bold text-slate-700">1. Like & Follow our Page</p>
                    <a 
                      href="https://www.facebook.com/katuwangsolutions" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full h-10 bg-[#1877F2] hover:bg-[#166FE5] text-white rounded-lg text-xs font-bold transition-colors"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                      Like & Follow us on Facebook
                    </a>
                  </div>

                  {/* Step 2 */}
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-bold text-slate-700">2. Share to your Timeline</p>
                    <p className="text-[9px] text-slate-500 leading-tight">Copy this viral caption and post it to Facebook! It already includes your link and the ₱99 Promo.</p>
                    <div className="bg-white rounded-lg border border-slate-200 p-2.5 shadow-sm space-y-2">
                      <p className="text-[10px] text-slate-600 leading-relaxed italic">
                        "Gusto mo bang ma-automate ang negosyo mo?<br/>Gumamit ang Katuwang Solutions, sobrang dali na i-track ang daily sales, i-monitor ang revenue, at i-manage ang expenses at inventory mo!<br/><br/>Naka-PROMO sila ngayon for only ₱99! Upgrade your business today.<br/><br/>Mag register sa link:<br/>👉 https://katuwangsolutions.com/onboarding?ref={profile?.referralCode || (user?.uid ? user.uid.substring(0, 4).toUpperCase() : '')}"
                      </p>
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                          <Button 
                            onClick={() => {
                              const caption = `Gusto mo bang ma-automate ang negosyo mo?\nGumamit ang Katuwang Solutions, sobrang dali na i-track ang daily sales, i-monitor ang revenue, at i-manage ang expenses at inventory mo!\n\nNaka-PROMO sila ngayon for only ₱99! Upgrade your business today.\n\nMag register sa link:\n👉 https://katuwangsolutions.com/onboarding?ref=${profile?.referralCode || (user?.uid ? user.uid.substring(0, 4).toUpperCase() : '')}`;
                              navigator.clipboard.writeText(caption);
                              alert('Caption & Link Copied!');
                            }}
                            className="flex-1 h-8 text-[10px] font-bold bg-slate-800 text-white rounded-lg hover:bg-slate-700"
                          >
                            Copy Caption
                          </Button>
                          <a 
                            href={`https://www.facebook.com/sharer/sharer.php?u=https://katuwangsolutions.com/onboarding?ref=${profile?.referralCode || (user?.uid ? user.uid.substring(0, 4).toUpperCase() : '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center px-3 h-8 text-[10px] font-bold bg-[#1877F2] text-white rounded-lg hover:bg-[#166FE5]"
                          >
                            Share to FB
                          </a>
                        </div>
                        <a 
                          href="/og-promo.jpg" 
                          download="katuwang-promo.jpg" 
                          className="flex items-center justify-center w-full h-8 text-[10px] font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                        >
                          <Download className="w-3 h-3 mr-1.5" />
                          Download Promo Image
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <div className="bg-emerald-50/50 rounded-xl border border-emerald-100 p-3 space-y-3">
                <p className="text-[11px] font-bold text-emerald-800 text-center leading-tight">
                  Basta active ang mga tindahang na-refer mo, tuloy-tuloy ang kita mo buwan-buwan! 💸
                </p>
                
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-white rounded-lg border border-emerald-100 p-2 shadow-sm">
                    <p className="text-[10px] font-black uppercase text-slate-400">10 Referrals</p>
                    <p className="text-sm font-black text-emerald-600">₱100 <span className="text-[9px] text-slate-400">/mo</span></p>
                  </div>
                  <div className="bg-white rounded-lg border border-emerald-100 p-2 shadow-sm">
                    <p className="text-[10px] font-black uppercase text-slate-400">100 Referrals</p>
                    <p className="text-sm font-black text-emerald-600">₱1,000 <span className="text-[9px] text-slate-400">/mo</span></p>
                  </div>
                  <div className="bg-white rounded-lg border border-emerald-100 p-2 shadow-sm">
                    <p className="text-[10px] font-black uppercase text-slate-400">500 Referrals</p>
                    <p className="text-sm font-black text-emerald-600">₱5,000 <span className="text-[9px] text-slate-400">/mo</span></p>
                  </div>
                  <div className="bg-white rounded-lg border border-emerald-100 p-2 shadow-sm">
                    <p className="text-[10px] font-black uppercase text-slate-400">1K Referrals</p>
                    <p className="text-sm font-black text-emerald-600">₱10,000 <span className="text-[9px] text-slate-400">/mo</span></p>
                  </div>
                  <div className="bg-white rounded-lg border border-emerald-100 p-2 shadow-sm">
                    <p className="text-[10px] font-black uppercase text-slate-400">5K Referrals</p>
                    <p className="text-sm font-black text-emerald-600">₱50,000 <span className="text-[9px] text-slate-400">/mo</span></p>
                  </div>
                  <div className="bg-white rounded-lg border border-emerald-100 p-2 shadow-sm">
                    <p className="text-[10px] font-black uppercase text-slate-400">10K Referrals</p>
                    <p className="text-sm font-black text-emerald-600">₱100,000 <span className="text-[9px] text-slate-400">/mo</span></p>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">My Referral History</h4>
                {referralHistory.length > 3 && (
                  <button 
                    onClick={() => setShowAllHistory(true)}
                    className="text-[10px] font-bold text-emerald-600 hover:underline"
                  >
                    See All
                  </button>
                )}
              </div>
              
              {referralHistory.length === 0 ? (
                <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <p className="text-xs font-bold text-slate-400">No referrals yet</p>
                  <p className="text-[10px] text-slate-400 mt-1">Share your link to start earning!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {referralHistory.slice(0, 3).map((ref, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <div>
                        <p className="text-xs font-bold text-slate-800">{ref.referredTenantName}</p>
                        <p className="text-[10px] text-slate-500 capitalize">{ref.type} &bull; {ref.creditedAt?.seconds ? new Date(ref.creditedAt.seconds * 1000).toLocaleDateString() : 'Just now'}</p>
                      </div>
                      <div className="text-sm font-black text-emerald-600">
                        +₱{ref.amountEarned.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2">
              {(profile?.referralEarnings || 0) >= 200 ? (
                <Button 
                  onClick={() => setWithdrawOpen(true)}
                  className="w-full h-12 rounded-xl font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg"
                >
                  <Wallet className="mr-2 h-4 w-4" />
                  Withdraw Referral Bonus
                </Button>
              ) : (
                <div className="text-center bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <p className="text-xs font-bold text-slate-500">
                    <span className="text-emerald-600">₱{Math.max(0, 200 - (profile?.referralEarnings || 0)).toFixed(2)}</span> more to reach the ₱200 minimum withdrawal.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <WithdrawReferralSheet 
          open={withdrawOpen} 
          onOpenChange={setWithdrawOpen}
          availableBalance={profile?.referralEarnings || 0}
          userFullName={profile?.fullName || ''}
          userEmail={user?.email || ''}
          tenantName={currentTenant?.name || ''}
          role={profile?.role || 'staff'}
          uid={user?.uid || ''}
        />

        <ReferralHistorySheet
          open={showAllHistory}
          onOpenChange={setShowAllHistory}
          uid={user?.uid || ''}
          moduleType={currentTenant?.moduleType}
        />

        {/* Install App Card */}
        <Card className="bg-white border-slate-200 shadow-sm rounded-[24px] overflow-hidden">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-black text-slate-800 flex items-center gap-2">
              <Download className="h-4 w-4" style={{ color: theme.primary }} />
              I-install ang Katuwang App
            </CardTitle>
            <CardDescription className="text-[11px] font-medium leading-relaxed mt-0.5">
              Gamitin kahit walang internet! Mag-benta at mag-check ng stock nang mas mabilis sa phone mo.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            {isInstalled ? (
              <div className="bg-emerald-50 rounded-xl p-4 flex flex-col items-center justify-center text-center border border-emerald-100 gap-2">
                <CheckCircle className="h-6 w-6 text-emerald-500" />
                <p className="text-xs font-bold text-emerald-700">App Installed Na!</p>
                <p className="text-[10px] text-emerald-600 font-medium leading-tight">Hanapin ang Katuwang icon sa home screen ng iyong phone.</p>
              </div>
            ) : isIOS ? (
              <div className="bg-slate-50 rounded-xl p-4 flex flex-col items-center justify-center text-center gap-3 border border-slate-100">
                <p className="text-[11px] font-bold text-slate-600 flex items-center justify-center gap-1.5 flex-wrap">
                  Para ma-install sa iPhone, i-tap ang <Share className="h-4 w-4 text-blue-500 inline" /> sa ibaba at piliin ang:
                </p>
                <div className="bg-white border border-slate-200 rounded-lg px-4 py-2 flex items-center gap-2 shadow-sm">
                  <PlusSquare className="h-4 w-4 text-slate-700" />
                  <span className="text-xs font-bold text-slate-700">Add to Home Screen</span>
                </div>
              </div>
            ) : (
              <Button 
                onClick={handleInstallClick}
                className="w-full h-12 rounded-xl text-white font-bold text-sm shadow-md active:scale-95 transition-all gap-2"
                style={{ backgroundColor: theme.primary }}
              >
                <Download className="h-4 w-4" /> 
                I-install Ngayon
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Manual Install Guide Dialog */}
        <Dialog open={showInstallGuide} onOpenChange={setShowInstallGuide}>
          <DialogContent className="sm:max-w-md rounded-[24px]">
            <DialogHeader>
              <DialogTitle className="text-xl font-black text-slate-800">Paano I-install?</DialogTitle>
              <DialogDescription className="text-slate-500 font-medium">
                Dahil ikaw ay gumagamit ng iPhone o nasa Test Mode, hindi gumagana ang 1-click install. Sundin ang steps sa ibaba:
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="flex gap-4 items-start bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div className="bg-white p-2 rounded-lg shadow-sm border border-slate-200 flex-shrink-0">
                  <span className="font-black text-lg text-slate-800">1</span>
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-800">I-tap ang Browser Menu</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Sa Android (Chrome), i-tap ang <strong>3 tuldok (⋮)</strong> sa itaas. <br/>
                    Sa iPhone (Safari), i-tap ang <strong>Share icon (<Share className="h-3 w-3 inline"/>)</strong> sa ibaba.
                  </p>
                </div>
              </div>
              <div className="flex gap-4 items-start bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div className="bg-white p-2 rounded-lg shadow-sm border border-slate-200 flex-shrink-0">
                  <span className="font-black text-lg text-slate-800">2</span>
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-800">Piliin ang "Add to Home Screen"</h4>
                  <p className="text-xs text-slate-500 mt-1">Hanapin ang <PlusSquare className="h-3 w-3 inline"/> <strong>Add to Home Screen</strong> o <strong>Install App</strong> sa menu at i-click ito.</p>
                </div>
              </div>
              <div className="flex gap-4 items-start bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                <div className="bg-white p-2 rounded-lg shadow-sm border border-emerald-200 flex-shrink-0">
                  <span className="font-black text-lg text-emerald-600">3</span>
                </div>
                <div>
                  <h4 className="font-bold text-sm text-emerald-800">Tapos Na! 🎉</h4>
                  <p className="text-xs text-emerald-600 mt-1">Makikita mo na ang Katuwang App sa home screen ng iyong phone. Pwede mo na itong gamitin parang totoong app!</p>
                </div>
              </div>
            </div>
            <Button onClick={() => setShowInstallGuide(false)} className="w-full h-12 rounded-xl font-bold bg-slate-800 text-white hover:bg-slate-700">
              Naiintindihan Ko
            </Button>
          </DialogContent>
        </Dialog>

        {/* Support & Sign Out */}
        <div className="pt-2 space-y-3">
          <Button 
            onClick={() => setIsSupportOpen(true)}
            variant="outline"
            className="w-full h-12 rounded-xl font-bold uppercase tracking-widest text-[10px] border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            <HelpCircle className="h-4 w-4" /> Help & Support
          </Button>

          <Button 
            onClick={handleSignOut}
            variant="outline"
            className="w-full h-12 rounded-xl font-bold uppercase tracking-widest text-[10px] border-red-200 text-red-600 hover:bg-red-50 flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            <LogOut className="h-4 w-4" /> Mag-Sign Out
          </Button>
        </div>

      </main>
      
      <HelpGuideDrawer isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} showFloatingButton={false} />
      <SponsorDialog open={isSponsorOpen} onOpenChange={setIsSponsorOpen} staffName={sponsorStaffName} />
    </div>
  );
}
