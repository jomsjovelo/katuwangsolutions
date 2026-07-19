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
  getDoc,
  getDocs
} from 'firebase/firestore';
import { app } from '@/firebase/config';
import { sendStaffInvite, removeStaffMember, regenerateBusinessCode } from '@/firebase/firestore/staff-actions';
import { getModuleTheme, MODULE_THEMES, ModuleTheme } from '@/lib/theme-utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BrandLogo } from '@/components/ui/brand-logo';
import Image from 'next/image';
import { Badge } from "@/components/ui/badge";
import { useTenantStore } from '@/store/use-tenant-store';
import { WithdrawReferralSheet } from '@/components/common/withdraw-referral-sheet';
import { ReferralHistorySheet } from '@/components/dashboard/referral-history-sheet';
import { StaffShiftCard } from './staff-shift-card';
import { ManagerPinSetup } from './manager-pin-setup';
import { ActivityOrganizer } from './activity-organizer';
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
  RefreshCw,
  Activity,
  ArrowRight,
  Lock,
  Tag,
  Zap,
  Edit2
} from 'lucide-react';
import { EscPosBluetoothDriver } from '@/lib/hardware/print-driver';
import { HelpGuideDrawer } from '@/components/shell/help-guide-drawer';
import { SponsorDialog } from '@/components/dashboard/sponsor-dialog';

export function ProfileTab() {
  const db = useFirestore();
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const { user } = useUser();
  const { currentTenant, setCurrentTenant, allTenants } = useTenant();
  const reset = useTenantStore(state => state.reset);
  const switchActiveModule = useTenantStore(state => state.switchActiveModule);
  const activeModuleOverride = useTenantStore(state => state.activeModuleOverride);
  const { deferredPrompt, isInstalled, triggerInstall, isIOS } = usePWAInstall();
  
  const [profile, setProfile] = useState<any>(null);
  const [activeStaff, setActiveStaff] = useState<any[]>([]);
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  const [pendingStaffApprovals, setPendingStaffApprovals] = useState<any[]>([]);
  
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [isRemovingId, setIsRemovingId] = useState<string | null>(null);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isSponsorOpen, setIsSponsorOpen] = useState(false);
  const [sponsorStaffName, setSponsorStaffName] = useState('');

  
  // New referral state
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [referralHistory, setReferralHistory] = useState<any[]>([]);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [isCopiedLink, setIsCopiedLink] = useState(false);

  // QR Upload state
  const [isUploadingQr, setIsUploadingQr] = useState(false);
  const [qrUploadError, setQrUploadError] = useState<string | null>(null);

  const [showOrganizer, setShowOrganizer] = useState(false);

  // Audit log state
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  const theme = getModuleTheme(currentTenant?.moduleType);
  const isOwner = profile?.role === 'owner';
  
  const isBudgetMo = currentTenant?.moduleType === 'budget-mo';
  const is56Tracker = currentTenant?.moduleType === '5-6-tracker';
  const isPOSModule = !isBudgetMo && !is56Tracker;

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
    
    const fetchHistory = async () => {
      const { query, collection, orderBy, limit, getDocs } = await import('firebase/firestore');
      const historyRef = collection(db, 'users', user.uid, 'referral_history');
      const q = query(historyRef, orderBy('creditedAt', 'desc'), limit(10));
      
      getDocs(q).then((snap) => {
        setReferralHistory(snap.docs.map(d => d.data()));
      }).catch((err) => {
        console.warn('ProfileTab: Referral history unavailable:', err.message);
      });
    };
    
    fetchHistory();
  }, [user, db]);

  // 2. Fetch Active Staff List (role == staff & tenantId == tenantId)
  // Only owners can manage staff — non-owners skip this subscription
  useEffect(() => {
    if (!user || !currentTenant || !profile || profile.role !== 'owner') return;

    const staffQuery = query(
      collection(db, 'users'),
      where('tenantId', '==', currentTenant.id),
      where('role', '==', 'staff'),
      where('enterpriseOwnerUid', '==', user.uid)
    );

    const unsubscribe = onSnapshot(staffQuery, (snapshot) => {
      const staffList = snapshot.docs.map(d => d.data());
      setActiveStaff(staffList);
    }, (err) => {
      console.warn('ProfileTab: Staff list unavailable:', err.message);
      setActiveStaff([]);
    });

    return () => unsubscribe();
  }, [currentTenant, profile?.role, user, db]);

  useEffect(() => {
    if (!user || !currentTenant || profile?.role !== 'owner') return;

    const pendingQuery = query(
      collection(db, 'users'),
      where('tenantId', '==', currentTenant.id),
      where('approvalStatus', '==', 'pending_owner'),
      where('enterpriseOwnerUid', '==', user.uid)
    );

    const unsubscribe = onSnapshot(pendingQuery, (snapshot) => {
      const pendingList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setPendingStaffApprovals(pendingList);
    }, (err) => {
      console.warn('ProfileTab: Pending staff list unavailable:', err.message);
      setPendingStaffApprovals([]);
    });

    return () => unsubscribe();
  }, [user, profile?.role, db, currentTenant]);

  // 3. Fetch Pending Invites List
  // Only owners can see invites — non-owners skip this subscription
  useEffect(() => {
    if (!currentTenant || !profile || profile.role !== 'owner') return;

    const invitesQuery = query(
      collection(db, 'invites'),
      where('tenantId', '==', currentTenant.id),
      where('status', '==', 'pending')
    );

    getDocs(invitesQuery).then((snapshot: any) => {
      const invitesList = snapshot.docs.map((d: any) => d.data());
      setPendingInvites(invitesList);
    }).catch((err: any) => {
      // Rule not yet deployed or user not an owner — fail silently
      console.warn('ProfileTab: Invites list unavailable:', err.message);
      setPendingInvites([]);
    });
  }, [currentTenant, profile?.role]);

  // 4. Fetch Audit Logs
  // Only owners can see audit logs — non-owners skip this subscription
  useEffect(() => {
    if (!currentTenant || !profile || profile.role !== 'owner') return;

    const fetchLogs = async () => {
      const { query, collection, orderBy, limit, getDocs } = await import('firebase/firestore');
      const auditQuery = query(
        collection(db, 'tenants', currentTenant.id, 'audit_log'),
        orderBy('createdAt', 'desc'),
        limit(20)
      );

      getDocs(auditQuery).then((snapshot) => {
        const logs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setAuditLogs(logs);
      }).catch((err) => {
        console.warn('ProfileTab: Audit log unavailable:', err.message);
        setAuditLogs([]);
      });
    };

    fetchLogs();
  }, [currentTenant, profile?.role, db]);

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

  const [showStaffPaymentModal, setShowStaffPaymentModal] = useState(false);
  const [staffToPayFor, setStaffToPayFor] = useState<any>(null);
  const [staffToApprove, setStaffToApprove] = useState<any>(null);
  const [approveLoading, setApproveLoading] = useState(false);

  const executeApprove = async (staffUid: string, tenantId: string, moduleType: string) => {
    setApproveLoading(true);
    try {
      const { approveStaff } = await import('@/firebase/firestore/staff-actions');
      await approveStaff(staffUid, tenantId, moduleType);
      setShowStaffPaymentModal(false);
      setStaffToPayFor(null);
      alert('Success! Staff is now waiting for Admin verification of your GCash receipt.');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setApproveLoading(false);
    }
  };

  const handleApproveStaff = async (staff: any) => {
    if (allTenants.length === 1) {
      setStaffToPayFor({ staff, tenantId: allTenants[0].id, moduleType: allTenants[0].moduleType || 'rental' });
      setShowStaffPaymentModal(true);
    } else {
      setStaffToApprove(staff);
    }
  };

  const handleRejectStaff = async (staff: any) => {
    if (confirm(`Are you sure you want to reject ${staff.fullName}? They will not be able to join.`)) {
      try {
        const { rejectStaff } = await import('@/firebase/firestore/staff-actions');
        await rejectStaff(staff.uid);
      } catch (e: any) {
        alert(e.message);
      }
    }
  };
  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-h-full relative">
      {showOrganizer && <ActivityOrganizer onClose={() => setShowOrganizer(false)} />}
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

        {/* Unlocked Modules Switcher */}
        {currentTenant && ((currentTenant.unlockedModules?.length ?? 0) > 0 || currentTenant.id === 'demo' || currentTenant.name.toLowerCase().includes('demo')) && (
          <Card className="bg-white border-slate-200 shadow-sm overflow-hidden rounded-[24px]">
            <CardHeader className="p-4 pb-2 flex flex-row items-center gap-2">
              <PlusSquare className="h-4 w-4" style={{ color: theme.primary }} />
              <CardTitle className="text-sm font-black text-slate-800">Switch Active Module</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {Object.entries(MODULE_THEMES).filter(([key]) => 
                  currentTenant.id === 'demo' || 
                  currentTenant.name.toLowerCase().includes('demo') || 
                  key === currentTenant.moduleType || 
                  currentTenant.unlockedModules?.includes(key)
                ).map(([key, modTheme]) => {
                  const themeObj = modTheme as ModuleTheme;
                  const isActiveModule = (activeModuleOverride || currentTenant.moduleType) === key;
                  return (
                    <button
                      key={key}
                      onClick={() => switchActiveModule(key)}
                      disabled={isActiveModule}
                      className="w-full flex items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-slate-50 disabled:cursor-default"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="h-9 w-9 rounded-xl flex items-center justify-center text-white shrink-0"
                          style={{ backgroundColor: isActiveModule ? themeObj.primary : '#94a3b8' }}
                        >
                          <Activity className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800 leading-tight">
                            {themeObj.name}
                          </p>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{themeObj.tagline}</p>
                        </div>
                      </div>
                      {isActiveModule ? (
                        <Badge className="text-[9px] font-black uppercase tracking-widest border-none shrink-0" style={{ backgroundColor: `${themeObj.primary}20`, color: themeObj.primary }}>
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
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">REFERRAL CODE</span>
                    <div className="flex items-center gap-2">
                      <div className="text-4xl font-black text-slate-800 tracking-[0.25em]">
                        {currentTenant?.businessCode || '----'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 mt-2">
                      <Lock className="h-3 w-3 text-slate-400" />
                      <span className="text-[10px] text-slate-400 font-medium">Code is locked — contact support to change</span>
                    </div>
                  </div>
                </div>

              </CardContent>
            </Card>

            {/* Active Staff List */}
            {isPOSModule && (
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
            )}

            {/* Pending Invites List */}
            {isPOSModule && pendingInvites.length > 0 && (
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

            {/* Pending Staff Approvals List */}
            {isPOSModule && (
              <Card className="bg-white border-blue-200 shadow-sm rounded-[24px] overflow-hidden">
                <CardHeader className="p-4 pb-3 bg-blue-50/50">
                  <CardTitle className="text-xs font-black uppercase tracking-widest text-blue-600 flex items-center gap-2">
                    <UserPlus className="h-4 w-4" /> Pending Approvals
                  </CardTitle>
                  <CardDescription className="text-[10px] text-blue-500 font-medium mt-1">
                    Mga staff na gumamit ng iyong code at naghihintay ng approval.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  {pendingStaffApprovals.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-xs border border-dashed border-blue-100 rounded-2xl">
                      <UserPlus className="h-7 w-7 mx-auto opacity-20 mb-1" />
                      Walang pending na staff approval.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {pendingStaffApprovals.map((staff, idx) => (
                        <div key={staff.uid || idx} className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-3 gap-3 first:pt-0 last:pb-0">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center font-black text-xs text-blue-600 uppercase">
                              {staff.fullName ? staff.fullName[0] : 'S'}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-800 flex items-center gap-2">
                                {staff.fullName || 'Unknown Staff'}
                              </p>
                              <p className="text-[10px] text-slate-400">{staff.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 self-end sm:self-auto">
                            <Button
                              onClick={() => handleApproveStaff(staff)}
                              className="h-8 text-[10px] font-bold uppercase tracking-widest bg-blue-600 text-white hover:bg-blue-700 shadow-sm rounded-lg"
                            >
                              Approve
                            </Button>
                            <Button
                              onClick={() => handleRejectStaff(staff)}
                              variant="outline"
                              className="h-8 text-[10px] font-bold uppercase tracking-widest text-red-600 border-red-200 hover:bg-red-50 rounded-lg"
                            >
                              Reject
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            
            {/* Activity Log (Owner Only) */}
            {!isBudgetMo && (
              <Card className="bg-white border-slate-200 shadow-sm rounded-[24px]">
                <CardHeader className="p-4 pb-2 border-b border-slate-50 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                    <Activity className="h-4 w-4" /> System Audit Log
                  </CardTitle>
                  <button 
                    onClick={() => setShowOrganizer(true)}
                    className="text-[10px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors"
                  >
                    View All Activity <ArrowRight className="h-3 w-3" />
                  </button>
                </CardHeader>
                <CardContent className="p-0">
                  {auditLogs.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-[10px] font-bold text-slate-400">Walang recent activities.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {auditLogs.map((log) => {
                        const date = log.createdAt?.toDate ? log.createdAt.toDate() : new Date();
                        
                        let icon = <Activity className="h-3.5 w-3.5 text-slate-400" />;
                        if (log.type === 'delete_transaction' || log.type === 'void_sale' || log.type === 'delete_record') {
                          icon = <Trash2 className="h-3.5 w-3.5 text-red-500" />;
                        } else if (log.type === 'edit_transaction' || log.type === 'price_override') {
                          icon = <Edit2 className="h-3.5 w-3.5 text-amber-500" />;
                        } else if (log.type === 'add_staff' || log.type === 'remove_staff') {
                          icon = <Users className="h-3.5 w-3.5 text-indigo-500" />;
                        } else if (log.type === 'apply_discount') {
                          icon = <Tag className="h-3.5 w-3.5 text-emerald-500" />;
                        } else if (log.type === 'payout_expense') {
                          icon = <Banknote className="h-3.5 w-3.5 text-rose-500" />;
                        } else if (log.type === 'status_change') {
                          icon = <Zap className="h-3.5 w-3.5 text-blue-500" />;
                        }

                        return (
                          <div key={log.id} className="p-4 flex gap-3 hover:bg-slate-50 transition-colors">
                            <div className="mt-0.5 flex-shrink-0">
                              {icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-slate-700 leading-tight">
                                {log.description}
                              </p>
                              <div className="flex flex-wrap items-center gap-2 mt-1 text-[9px] font-semibold text-slate-400">
                                <span className="truncate">{log.userName || 'Unknown'}</span>
                                <span>&bull;</span>
                                <span>{date.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                {log.meta?.shiftId && (
                                  <>
                                    <span>&bull;</span>
                                    <span className="text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full border border-blue-100">
                                      Shift {log.meta.shiftId.slice(-4)}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

        {/* Staff Payment Wall Dialog */}
        <Dialog open={showStaffPaymentModal} onOpenChange={setShowStaffPaymentModal}>
          <DialogContent className="sm:max-w-md rounded-[24px]">
            <DialogHeader>
              <DialogTitle className="text-xl font-black text-slate-800">Complete Staff Payment</DialogTitle>
              <DialogDescription className="text-slate-500 font-medium">
                Send <strong>₱99.00</strong> via GCash or Maya to activate this staff account.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex justify-between items-center">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Amount Due</p>
                  <p className="text-3xl font-black text-primary">₱99.00</p>
                  <p className="text-[10px] text-slate-500 font-medium mt-0.5">per month</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Staff</p>
                  <p className="text-sm font-bold text-slate-900">{staffToPayFor?.staff?.fullName || 'Unknown'}</p>
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">How to Activate</p>
                <div className="space-y-3">
                  <div className="flex gap-3 items-start">
                    <div className="h-6 w-6 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">1</div>
                    <p className="text-sm text-slate-700 font-medium leading-snug">Send ₱99.00 to our GCash via the Messenger link below.</p>
                  </div>
                  <div className="flex gap-3 items-start">
                    <div className="h-6 w-6 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">2</div>
                    <p className="text-sm text-slate-700 font-medium leading-snug">Take a screenshot of your payment confirmation.</p>
                  </div>
                  <div className="flex gap-3 items-start">
                    <div className="h-6 w-6 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">3</div>
                    <p className="text-sm text-slate-700 font-medium leading-snug">Send the screenshot to our Facebook Page and click "I've sent my payment" below.</p>
                  </div>
                </div>
              </div>
              <a
                href="https://m.me/KatuwangSolutions"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-12 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-md"
                style={{ background: '#0099FF' }}
              >
                Open Messenger
              </a>
              <Button
                onClick={() => staffToPayFor && executeApprove(staffToPayFor.staff.uid, staffToPayFor.tenantId, staffToPayFor.moduleType)}
                disabled={approveLoading}
                className="w-full h-12 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold"
              >
                {approveLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "I've sent my payment →"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <WithdrawReferralSheet 
          open={withdrawOpen} 
          onOpenChange={setWithdrawOpen} 
          availableBalance={profile?.availableBalance || 0}
          uid={user?.uid || ''}
          userFullName={profile?.fullName || ''}
          userEmail={user?.email || ''}
          tenantName={currentTenant?.name || ''}
          role={profile?.role || 'staff'}
        />
          </section>
        )}

        {/* Manager PIN Setup for Owners */}
        {isOwner && isPOSModule && (
          <ManagerPinSetup />
        )}

        {/* Budget Mo Only Sections */}
        {isOwner && isBudgetMo && (
          <>
            <Card className="bg-white border-slate-200 shadow-sm rounded-[24px]">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <Users className="h-4 w-4" /> Family Sync (Coming Soon)
                </CardTitle>
                <CardDescription className="text-[10px] text-slate-500 font-medium mt-1">
                  Link your partner's account to share and manage the same household budget.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <Button disabled variant="outline" className="w-full text-xs font-bold text-slate-400 rounded-xl">
                  Invite Partner
                </Button>
              </CardContent>
            </Card>

            <ManagerPinSetup 
              title="Security PIN"
              description="Set a 4-digit PIN. You will be required to enter this PIN to validate sensitive updates like deleting records."
            />
          </>
        )}

        {/* 5-6 Tracker Only Sections */}
        {isOwner && is56Tracker && (
          <>
            <Card className="bg-white border-slate-200 shadow-sm rounded-[24px]">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <Users className="h-4 w-4" /> Co-Admin Access (Coming Soon)
                </CardTitle>
                <CardDescription className="text-[10px] text-slate-500 font-medium mt-1">
                  Grant permission to a partner or secretary to help manage collections.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <Button disabled variant="outline" className="w-full text-xs font-bold text-slate-400 rounded-xl">
                  Invite Co-Admin
                </Button>
              </CardContent>
            </Card>

            <ManagerPinSetup 
              title="Admin Security PIN"
              description="Set a 4-digit PIN. You will be required to enter this PIN to validate sensitive updates like voiding debt records."
            />
          </>
        )}

        {/* Data Export (Budget Mo & 5-6 Tracker) */}
        {isOwner && (isBudgetMo || is56Tracker) && (
          <Card className="bg-white border-slate-200 shadow-sm rounded-[24px]">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <Download className="h-4 w-4" /> Data Export
              </CardTitle>
              <CardDescription className="text-[10px] text-slate-500 font-medium mt-1">
                Download a copy of your records in CSV or PDF format for offline backup.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-2 flex gap-3">
              <Button disabled variant="outline" className="flex-1 text-xs font-bold text-slate-400 rounded-xl bg-slate-50 border-slate-200">
                CSV Export
              </Button>
              <Button disabled variant="outline" className="flex-1 text-xs font-bold text-slate-400 rounded-xl bg-slate-50 border-slate-200">
                PDF Export
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Staff Dashboard Informational Banner */}
        {!isOwner && isPOSModule && (
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

        {/* Staff Shift Card */}
        {isPOSModule && (
          <StaffShiftCard />
        )}



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
              <Button
                onClick={() => setShowInstallGuide(true)}
                className="w-full h-12 rounded-xl text-white font-bold text-sm shadow-md active:scale-95 transition-all gap-2"
                style={{ backgroundColor: theme.primary }}
              >
                <Share className="h-4 w-4" />
                I-install sa Home Screen
              </Button>
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
                Sundin ang mga simpleng steps sa ibaba para ma-add ang Katuwang sa home screen ng iyong phone.
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
      
      <Dialog open={!!staffToApprove} onOpenChange={(open) => !open && setStaffToApprove(null)}>
        <DialogContent className="sm:max-w-md rounded-[24px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-slate-800">Saan I-aassign?</DialogTitle>
            <DialogDescription className="text-slate-500 font-medium mt-1">
              Pumili ng branch o module kung saan magiging staff si <strong className="text-slate-700">{staffToApprove?.fullName}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2 max-h-[300px] overflow-y-auto">
            {allTenants.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setStaffToPayFor({ staff: staffToApprove, tenantId: t.id, moduleType: t.moduleType || 'rental' });
                  setStaffToApprove(null);
                  setShowStaffPaymentModal(true);
                }}
                className="w-full flex flex-col items-start p-4 bg-slate-50 border border-slate-100 rounded-xl hover:bg-slate-100 hover:border-slate-300 transition-colors disabled:opacity-50 text-left"
              >
                <span className="font-bold text-slate-800">{t.name}</span>
                <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 mt-1">
                  {t.moduleType || 'Rental'}
                </span>
              </button>
            ))}
          </div>
          <Button 
            onClick={() => setStaffToApprove(null)} 
            disabled={approveLoading}
            variant="outline"
            className="w-full h-12 rounded-xl font-bold bg-white text-slate-600 border-slate-200"
          >
            Cancel
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={showStaffPaymentModal} onOpenChange={setShowStaffPaymentModal}>
        <DialogContent className="sm:max-w-md rounded-[24px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-slate-800">Activate Staff Account</DialogTitle>
            <DialogDescription className="text-slate-500 font-medium mt-1">
              Please pay <strong>₱99.00</strong> to activate <strong className="text-slate-700">{staffToPayFor?.staff?.fullName}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 flex flex-col items-center space-y-4">
            <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 text-sm text-amber-900 w-full font-medium">
              1. Scan the QR code below or send to GCash/Maya.<br/>
              2. Keep a screenshot of your receipt.<br/>
              3. Click the button below to notify our Admin.<br/>
              4. We will verify your payment and activate the staff.
            </div>
            <div className="relative w-48 h-48 bg-slate-50 rounded-xl overflow-hidden border border-slate-200">
              <Image 
                src="/images/gcash-qr.jpg" 
                alt="Katuwang Solutions QR Code" 
                fill 
                className="object-contain"
                unoptimized
              />
            </div>
            <p className="text-xs text-slate-500 font-bold">Manual Mobile No: 09951665423</p>
          </div>
          <Button 
            onClick={() => {
              if (staffToPayFor) {
                executeApprove(staffToPayFor.staff.uid, staffToPayFor.tenantId, staffToPayFor.moduleType);
              }
            }} 
            disabled={approveLoading}
            className="w-full h-12 rounded-xl font-bold bg-[#0099FF] text-white hover:bg-[#0099FF]/90"
          >
            {approveLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "I've sent my payment \u2192"}
          </Button>
        </DialogContent>
      </Dialog>

      <HelpGuideDrawer isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} showFloatingButton={false} />
      <SponsorDialog open={isSponsorOpen} onOpenChange={setIsSponsorOpen} staffName={sponsorStaffName} />
    </div>
  );
}
