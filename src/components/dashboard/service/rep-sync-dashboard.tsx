"use client"

import React, { useState } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { doc, collection, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { registerGymMember, renewGymMember } from '@/firebase/firestore/service-actions';
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
  RefreshCw
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

  const theme = getModuleTheme(currentTenant?.moduleType);
  useDynamicThemeColor(theme);

  // Gym State
  const { members, activeMembers, expiredMembers, recentCheckIns, loading } = useGymMemberships();

  // Create Form
  const [showAddForm, setShowAddForm] = useState(false);
  const [memberName, setMemberName] = useState('');
  const [planType, setPlanType] = useState('Daily Drop-in');
  const [amountOverride, setAmountOverride] = useState<number | ''>('');

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
        isDaily
      );
      
      setMemberName('');
      setPlanType('Daily Drop-in');
      setAmountOverride('');
      setShowAddForm(false);
      toast({ title: 'Success!', description: `${memberName} has been registered and checked in.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCheckIn = async (id: string) => {
    if (!currentTenant || !db) return;
    try {
      const memberRef = doc(db, 'tenants', currentTenant.id, 'gym_memberships', id);
      await updateDoc(memberRef, { 
        lastCheckIn: serverTimestamp(),
        updatedAt: serverTimestamp() 
      });
      toast({ title: 'Checked In', description: `Member has been logged for today.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleRenew = async (member: any, plan: string) => {
    if (!currentTenant || !db) return;
    try {
      const finalPriceCentavos = Math.round((PLAN_PRICES[plan] || 1000) * 100);
      
      await renewGymMember(
        currentTenant.id,
        member.id,
        member.memberName,
        plan,
        finalPriceCentavos
      );
      toast({ title: 'Renewed', description: `Membership renewed to ${plan}.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const MemberCard = ({ member, actions }: { member: any, actions: React.ReactNode }) => {
    const isExpired = member.status === 'Expired';
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
          </div>
          
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
          <Button size="sm" className="h-8 w-8 rounded-full p-0" onClick={() => setShowAddForm(!showAddForm)} style={{ backgroundColor: theme.primary }}>
            <Plus className="h-4 w-4" />
          </Button>
        </section>

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
                    <Button size="sm" className="w-full h-7 text-[10px] bg-emerald-500 hover:bg-emerald-600 text-white" onClick={() => handleCheckIn(member.id!)}>
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
                  <MemberCard key={member.id} member={member} actions={
                    <Button size="sm" className="w-full h-7 text-[10px] bg-rose-500 hover:bg-rose-600 text-white" onClick={() => handleRenew(member, '1-Month Plan')}>
                      <RefreshCw className="h-3 w-3 mr-1" /> Renew 1-Month (₱1000)
                    </Button>
                  } />
                ))}
              </div>
            </div>

          </div>
        )}

      </main>
    </div>
  );
}
