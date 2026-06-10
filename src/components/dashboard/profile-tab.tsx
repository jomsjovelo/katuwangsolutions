'use client';

import React, { useState, useEffect } from 'react';
import { useUser } from '@/firebase/auth/use-user';
import { getAuth, signOut } from 'firebase/auth';
import { useFirestore } from '@/firebase/provider';
import { useTenant } from '@/app/lib/tenant-context';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  getFirestore 
} from 'firebase/firestore';
import { app } from '@/firebase/config';
import { sendStaffInvite, removeStaffMember } from '@/firebase/firestore/staff-actions';
import { getModuleTheme } from '@/lib/theme-utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTenantStore } from '@/store/use-tenant-store';
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
  Bluetooth
} from 'lucide-react';
import { EscPosBluetoothDriver } from '@/lib/hardware/print-driver';
import { SupportDrawer } from '@/components/dashboard/support-drawer';
import { SponsorDialog } from '@/components/dashboard/sponsor-dialog';

export function ProfileTab() {
  const db = useFirestore();
  const { user } = useUser();
  const { currentTenant } = useTenant();
  const { reset } = useTenantStore();
  
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

  const theme = getModuleTheme(currentTenant?.moduleType);

  // 1. Fetch Real-time User Profile
  useEffect(() => {
    if (!user) return;
    
    const userRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        setProfile(snap.data());
      }
    });

    return () => unsubscribe();
  }, [user]);

  // 2. Fetch Active Staff List (role == staff & tenantId == tenantId)
  useEffect(() => {
    if (!currentTenant) return;

    const staffQuery = query(
      collection(db, 'users'),
      where('tenantId', '==', currentTenant.id),
      where('role', '==', 'staff')
    );

    const unsubscribe = onSnapshot(staffQuery, (snapshot) => {
      const staffList = snapshot.docs.map(d => d.data());
      setActiveStaff(staffList);
    });

    return () => unsubscribe();
  }, [currentTenant]);

  // 3. Fetch Pending Invites List
  useEffect(() => {
    if (!currentTenant) return;

    const invitesQuery = query(
      collection(db, 'invites'),
      where('tenantId', '==', currentTenant.id),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(invitesQuery, (snapshot) => {
      const invitesList = snapshot.docs.map(d => d.data());
      setPendingInvites(invitesList);
    });

    return () => unsubscribe();
  }, [currentTenant]);

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

  const isOwner = profile?.role === 'owner';

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
                {profile?.role === 'owner' ? 'Store Owner' : 'Helper / Tindera'}
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

        {/* Staff Management Section (Owners Only) */}
        {isOwner && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <Users className="h-5 w-5" style={{ color: theme.primary }} />
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">Staff & Tindera</h3>
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
                    <div className="text-4xl font-black text-slate-800 tracking-[0.25em]">
                      {currentTenant?.businessCode || '----'}
                    </div>
                  </div>
                  {currentTenant?.businessCode && (
                    <div className="bg-slate-50 rounded-xl border border-slate-100 p-2 flex items-center justify-center shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img 
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://app.katuwangsolutions.com/?code=${currentTenant.businessCode}`} 
                        alt="QR Code"
                        className="w-20 h-20 rounded-lg"
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">O ipasa ang Direct Link:</p>
                  <div className="flex gap-2">
                    <Input 
                      readOnly 
                      value={`https://app.katuwangsolutions.com/?code=${currentTenant?.businessCode || ''}`}
                      className="rounded-xl border-slate-200 text-[10px] bg-slate-50 font-medium h-10"
                    />
                    <Button 
                      onClick={() => {
                        navigator.clipboard.writeText(`https://app.katuwangsolutions.com/?code=${currentTenant?.businessCode || ''}`);
                        alert('Link Copied!');
                      }}
                      variant="outline"
                      className="rounded-xl h-10 text-[10px] font-bold border-slate-200"
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Active Staff List */}
            <Card className="bg-white border-slate-200 shadow-sm rounded-[24px]">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">Mga Aktibong Tindera</CardTitle>
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
                              Sponsor
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

        {/* Referral Program Section */}
        <Card className="bg-white border-slate-200 shadow-sm rounded-[24px] overflow-hidden">
          <div className="h-1 bg-gradient-to-r" style={{ backgroundImage: `linear-gradient(to right, ${theme.primary}, ${theme.secondary})` }} />
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-black text-slate-800 flex items-center gap-2">
              <span className="text-xl">🎁</span> Referral Program
            </CardTitle>
            <CardDescription className="text-[11px] font-medium leading-relaxed mt-0.5">
              I-share ang inyong Referral Code. May ₱10.00 kang kikitain sa bawat tindahang mag-register at magbayad gamit ang code mo!
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="flex gap-4">
              <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 flex-1 flex flex-col items-center justify-center text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">Your Referral Code</span>
                <div className="text-3xl font-black text-slate-800 tracking-[0.2em]">
                  {profile?.referralCode || '----'}
                </div>
              </div>
              <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-4 flex-1 flex flex-col items-center justify-center text-center">
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-[0.2em] mb-1">Total Earnings</span>
                <div className="text-3xl font-black text-emerald-600">
                  ₱{(profile?.referralEarnings || 0).toFixed(2)}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Referral Link:</p>
              <div className="flex gap-2">
                <Input 
                  readOnly 
                  value={`https://app.katuwangsolutions.com/onboarding?ref=${profile?.referralCode || ''}`}
                  className="rounded-xl border-slate-200 text-[10px] bg-slate-50 font-medium h-10"
                />
                <Button 
                  onClick={() => {
                    navigator.clipboard.writeText(`https://app.katuwangsolutions.com/onboarding?ref=${profile?.referralCode || ''}`);
                    alert('Referral Link Copied!');
                  }}
                  variant="outline"
                  className="rounded-xl h-10 text-[10px] font-bold border-slate-200"
                >
                  Copy
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

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
      
      <SupportDrawer isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />
      <SponsorDialog open={isSponsorOpen} onOpenChange={setIsSponsorOpen} staffName={sponsorStaffName} />
    </div>
  );
}
