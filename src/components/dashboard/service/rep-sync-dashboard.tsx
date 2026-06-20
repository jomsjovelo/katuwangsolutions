"use client"

import React, { useState, useEffect, useRef } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { doc, collection, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { registerGymMember, renewGymMember, deleteServiceOrder } from '@/firebase/firestore/service-actions';
import { useUser } from '@/firebase/auth/use-user';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getModuleTheme, useDynamicThemeColor } from '@/lib/theme-utils';
import { useGymMemberships } from '@/hooks/use-gym';
import { useToast } from '@/hooks/use-toast';
import { 
  Dumbbell, 
  Plus, 
  UserCircle2,
  CalendarHeart,
  Clock,
  LogOut,
  RefreshCw,
  X,
  ScanLine,
  Trash2
} from "lucide-react";

const PLAN_PRICES: Record<string, number> = {
  'Daily Drop-in': 100,
  '1-Month Plan': 1000,
  '3-Month Plan': 2500,
  'Promo': 800,
};

export function RepSyncDashboard() {
  const { currentTenant } = useTenant();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scannerMessage, setScannerMessage] = useState<string | null>(null);
  const scannerRef = useRef<any>(null);

  const theme = getModuleTheme(currentTenant?.moduleType);
  useDynamicThemeColor(theme);
  
  const { user } = useUser();
  const isOwner = currentTenant?.ownerId === user?.uid || currentTenant?.role === 'owner';

  // Gym State
  const { members, activeMembers, expiredMembers, recentCheckIns, loading } = useGymMemberships();

  // Create Form
  const [showAddForm, setShowAddForm] = useState(false);
  const [memberName, setMemberName] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  const [planType, setPlanType] = useState('Daily Drop-in');
  const [amountOverride, setAmountOverride] = useState<number | ''>('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [gcashRef, setGcashRef] = useState('');

  const suggestedPrice = PLAN_PRICES[planType] || 0;
  const finalPrice = typeof amountOverride === 'number' ? amountOverride : suggestedPrice;

  const handleRegister = async () => {
    if (!currentTenant || !db || !memberName) return;
    setIsProcessing(true);
    try {
      const isDaily = planType === 'Daily Drop-in';
      const finalPriceCentavos = Math.round(finalPrice * 100);
      
      await registerGymMember(
        currentTenant.id,
        memberName,
        planType,
        finalPriceCentavos,
        isDaily,
        memberPhone || undefined,
        undefined, // referrerCode
        paymentMethod,
        gcashRef
      );
      
      setMemberName('');
      setMemberPhone('');
      setPlanType('Daily Drop-in');
      setAmountOverride('');
      setPaymentMethod('cash');
      setGcashRef('');
      setShowAddForm(false);
      toast({ title: 'Success!', description: `${memberName} has been registered and checked in.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCheckIn = async (id: string, memberName?: string) => {
    if (!currentTenant || !db) return;
    try {
      const memberRef = doc(db, 'tenants', currentTenant.id, 'gym_memberships', id);
      await updateDoc(memberRef, { 
        lastCheckIn: serverTimestamp(),
        updatedAt: serverTimestamp() 
      });
      toast({ title: 'Checked In ✅', description: `${memberName || 'Member'} has been logged for today.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleDeleteMember = async (memberId: string) => {
    if (!currentTenant || !user) return;
    if (!window.confirm("Sigurado ka bang gusto mong i-delete o i-void ang member na ito? Ibabalik nito ang bayad kung applicable.")) return;
    try {
      await deleteServiceOrder(currentTenant.id, 'gym_memberships', memberId, user.uid, user.displayName || user.email || 'Unknown User');
      toast({ title: 'Member Deleted', description: 'Member has been successfully reversed.' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  // QR Code Scanner using html5-qrcode
  const startScanner = async () => {
    setShowScanner(true);
    setScannerMessage(null);
    setTimeout(async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        const html5QrCode = new Html5Qrcode('gym-qr-reader');
        scannerRef.current = html5QrCode;
        await html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 200, height: 200 } },
          async (decodedText: string) => {
            // decodedText is the member's Firestore doc ID
            await html5QrCode.stop();
            setShowScanner(false);
            const member = members.find((m: any) => m.id === decodedText);
            if (!member) {
              toast({ title: 'Unknown Member', description: 'QR code not recognized.', variant: 'destructive' });
              return;
            }
            if (member.status === 'Expired') {
              toast({ title: `⚠️ Expired Membership`, description: `${member.memberName}'s membership has expired. Please renew.`, variant: 'destructive' });
              return;
            }
            await handleCheckIn(member.id!, member.memberName);
          },
          () => {}
        );
      } catch (e: any) {
        toast({ title: 'Scanner Error', description: e.message, variant: 'destructive' });
        setShowScanner(false);
      }
    }, 300);
  };

  const stopScanner = async () => {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop();
        scannerRef.current = null;
      }
    } catch (_) {}
    setShowScanner(false);
  };

  const handleRenew = async (member: any, plan: string, payMethod: string = 'cash', refNo?: string) => {
    if (!currentTenant || !db) return;
    try {
      const finalPriceCentavos = Math.round((PLAN_PRICES[plan] || 1000) * 100);
      
      await renewGymMember(
        currentTenant.id,
        member.id,
        member.memberName,
        plan,
        finalPriceCentavos,
        payMethod,
        refNo
      );
      toast({ title: 'Renewed', description: `Membership renewed to ${plan}.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const RenewalActions = ({ member }: { member: any }) => {
    const [plan, setPlan] = useState('1-Month Plan');
    const [payMethod, setPayMethod] = useState('cash');
    const [ref, setRef] = useState('');
    const [open, setOpen] = useState(false);

    if (!open) {
      return (
        <Button size="sm" className="w-full h-7 text-[10px] bg-rose-500 hover:bg-rose-600 text-white" onClick={() => setOpen(true)}>
          <RefreshCw className="h-3 w-3 mr-1" /> Renew Membership
        </Button>
      );
    }

    return (
      <div className="w-full space-y-2 bg-slate-50 p-2 rounded-md border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        <select className="w-full border-slate-200 rounded-md border p-1 text-[10px] h-6 bg-white" value={plan} onChange={(e) => setPlan(e.target.value)}>
          {Object.keys(PLAN_PRICES).map(type => (
            <option key={type} value={type}>{type} (₱{PLAN_PRICES[type]})</option>
          ))}
        </select>
        <div className="flex gap-1">
          <select className="flex-1 border-slate-200 rounded-md border p-1 text-[10px] h-6 bg-white" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="gcash">GCash</option>
            <option value="maya">Maya</option>
          </select>
          {payMethod !== 'cash' && (
            <Input className="flex-1 h-6 text-[10px] px-1 bg-white" placeholder="Ref No." value={ref} onChange={(e) => setRef(e.target.value)} />
          )}
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="flex-1 h-6 text-[10px] bg-white" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" className="flex-1 h-6 text-[10px] bg-rose-500 hover:bg-rose-600 text-white" onClick={() => {
            handleRenew(member, plan, payMethod, ref);
            setOpen(false);
          }}>
            Pay ₱{PLAN_PRICES[plan]}
          </Button>
        </div>
      </div>
    );
  };

  const MemberCard = ({ member, actions }: { member: any, actions: React.ReactNode }) => {
    const isExpired = member.status === 'Expired';
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(member.id)}`;
    const [showQr, setShowQr] = useState(false);
    return (
      <Card className="shadow-sm border-slate-200 mb-3 hover:shadow-md transition-shadow">
        <CardContent className="p-3">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                <UserCircle2 className="h-4 w-4 text-slate-500" />
                {member.memberName}
              </h4>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-600 border-slate-200">
                  {member.planType}
                </Badge>
                {isExpired && (
                  <Badge variant="destructive" className="text-[10px]">Expired</Badge>
                )}
              </div>
            </div>
            <div className="flex gap-1">
              {isOwner && (
                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-lg shrink-0" onClick={() => handleDeleteMember(member.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <button onClick={() => setShowQr(!showQr)} className="h-7 w-7 rounded-lg bg-slate-100 flex items-center justify-center cursor-pointer border-none" title="Show QR Code">
                <QrCode className="h-4 w-4 text-slate-500" />
              </button>
            </div>
          </div>
          {showQr && (
            <div className="flex justify-center py-2 animate-in fade-in duration-200">
              <img src={qrUrl} alt="Member QR" className="rounded-xl border border-slate-200" width={120} height={120} />
            </div>
          )}
          <div className="flex gap-2 mt-3">
            {actions}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-h-screen">
      <main className="p-4 space-y-4 pb-24">
        
        <section className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div 
              className="p-2 rounded-xl transition-colors duration-300"
              style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
            >
              <Dumbbell className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-headline font-bold">{currentTenant?.name || 'Gym & Fitness'}</h3>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">{theme.name}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-8 rounded-xl px-3 gap-1 font-bold" variant="outline" onClick={startScanner}>
              <ScanLine className="h-3.5 w-3.5" /> Scan Member
            </Button>
            <Button size="sm" className="h-8 w-8 rounded-full p-0" onClick={() => setShowAddForm(!showAddForm)} style={{ backgroundColor: theme.primary }}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </section>

        {/* QR Scanner Modal */}
        {showScanner && (
          <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4">
            <div className="bg-white rounded-3xl overflow-hidden w-full max-w-sm shadow-2xl">
              <div className="flex justify-between items-center p-4 border-b">
                <h3 className="font-black text-sm">Scan Member QR Code</h3>
                <button onClick={stopScanner} className="h-8 w-8 bg-slate-100 rounded-full flex items-center justify-center border-none cursor-pointer">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div id="gym-qr-reader" className="w-full" />
              <p className="text-center text-xs text-slate-400 p-3 font-medium">Point camera at member's QR code to log attendance.</p>
            </div>
          </div>
        )}

        {showAddForm && (
          <Card className="shadow-sm border-slate-200 bg-white border-l-4" style={{ borderLeftColor: theme.primary }}>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2"><Dumbbell className="h-4 w-4 text-slate-500" /> New Registration</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3 pt-0">
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Member Name</Label>
                  <Input placeholder="e.g. John Doe" value={memberName} onChange={e => setMemberName(e.target.value)} />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Plan</Label>
                  <select 
                    className="w-full border-slate-200 rounded-md border p-2 text-sm h-9"
                    value={planType}
                    onChange={(e) => setPlanType(e.target.value)}
                  >
                    {Object.keys(PLAN_PRICES).map(type => (
                      <option key={type} value={type}>{type} (₱{PLAN_PRICES[type]})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Custom Amount Paid (₱)</Label>
                <Input type="number" placeholder={`Suggested: ₱${suggestedPrice}`} value={amountOverride} onChange={e => setAmountOverride(parseFloat(e.target.value) || '')} />
              </div>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Payment Method</Label>
                  <select 
                    className="w-full border-slate-200 rounded-md border p-2 text-sm h-9"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  >
                    <option value="cash">Cash</option>
                    <option value="gcash">GCash</option>
                    <option value="maya">Maya</option>
                  </select>
                </div>
                {paymentMethod !== 'cash' && (
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Ref No.</Label>
                    <Input placeholder="Optional reference" value={gcashRef} onChange={e => setGcashRef(e.target.value)} />
                  </div>
                )}
              </div>
              <Button 
                className="w-full h-8 text-xs font-bold text-white" 
                style={{ backgroundColor: theme.primary }}
                onClick={handleRegister}
                disabled={isProcessing || !memberName}
              >
                Register & Check-in
              </Button>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="text-center py-8 text-sm text-slate-400">Loading gym floor...</div>
        ) : (
          <div className="flex flex-col md:flex-row gap-4 overflow-x-auto pb-4">
            
            {/* Recent Check-ins Column */}
            <div className="flex-1 min-w-[280px]">
              <div className="flex items-center gap-2 mb-3 px-1">
                <Clock className="h-4 w-4 text-amber-500" />
                <h4 className="font-bold text-sm text-slate-700">Checked In Today</h4>
                <Badge variant="secondary" className="bg-white ml-auto">{recentCheckIns.length}</Badge>
              </div>
              <div className="space-y-2">
                {recentCheckIns.map(member => (
                  <MemberCard key={member.id} member={member} actions={
                    <Button disabled size="sm" className="w-full h-7 text-[10px] bg-slate-100 text-slate-400 hover:bg-slate-100">
                      Inside Gym
                    </Button>
                  } />
                ))}
              </div>
            </div>

            {/* Active Members Column */}
            <div className="flex-1 min-w-[280px]">
              <div className="flex items-center gap-2 mb-3 px-1">
                <CalendarHeart className="h-4 w-4 text-emerald-500" />
                <h4 className="font-bold text-sm text-slate-700">Active Monthly</h4>
                <Badge variant="secondary" className="bg-white ml-auto">{activeMembers.length}</Badge>
              </div>
              <div className="space-y-2">
                {activeMembers.map(member => (
                  <MemberCard key={member.id} member={member} actions={
                    <Button size="sm" className="w-full h-7 text-[10px] bg-emerald-500 hover:bg-emerald-600 text-white" onClick={() => handleCheckIn(member.id!, member.memberName)}>
                      <Plus className="h-3 w-3 mr-1" /> Log Attendance
                    </Button>
                  } />
                ))}
              </div>
            </div>

            {/* Expired / Needs Renewal Column */}
            <div className="flex-1 min-w-[280px]">
              <div className="flex items-center gap-2 mb-3 px-1">
                <LogOut className="h-4 w-4 text-rose-500" />
                <h4 className="font-bold text-sm text-slate-700">Needs Renewal</h4>
                <Badge variant="secondary" className="bg-white ml-auto">{expiredMembers.length}</Badge>
              </div>
              <div className="space-y-2">
                {expiredMembers.map(member => (
                  <MemberCard key={member.id} member={member} actions={<RenewalActions member={member} />} />
                ))}
              </div>
            </div>

          </div>
        )}

      </main>
    </div>
  );
}
