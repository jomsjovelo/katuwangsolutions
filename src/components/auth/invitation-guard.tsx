'use client';

import React, { useState, useEffect } from 'react';
import { useUser } from '@/firebase/auth/use-user';
import { useFirestore } from '@/firebase/provider';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { acceptStaffInvite, rejectStaffInvite } from '@/firebase/firestore/staff-actions';
import { useTenantStore } from '@/store/use-tenant-store';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle,
  SheetDescription 
} from "@/components/ui/sheet";
import { Button } from '@/components/ui/button';
import { MailOpen, Loader2, Sparkles, X } from 'lucide-react';

export function InvitationGuard({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const db = useFirestore();
  const { setActiveTenant } = useTenantStore();

  const [pendingInvite, setPendingInvite] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!user || !user.email || !db) return;

    // Listen to real-time invites matching user email
    const invitesQuery = query(
      collection(db, 'invites'),
      where('email', '==', user.email.toLowerCase()),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(invitesQuery, (snapshot) => {
      if (!snapshot.empty) {
        // Get the first pending invitation
        const inviteDoc = snapshot.docs[0];
        setPendingInvite({ id: inviteDoc.id, ...inviteDoc.data() });
        setIsOpen(true);
      } else {
        setPendingInvite(null);
        setIsOpen(false);
      }
    });

    return () => unsubscribe();
  }, [user, db]);

  const handleAccept = async () => {
    if (!pendingInvite || !user) return;

    try {
      setIsProcessing(true);
      await acceptStaffInvite(pendingInvite.id, user.uid);
      
      // Clear localStorage cache to force AuthGuard reload
      localStorage.removeItem('katuwang-active-tenant');
      localStorage.removeItem('katuwang-user-profile');
      
      // Let AuthGuard onSnapshot pick up updates automatically
      setIsOpen(false);
      window.location.reload(); // Quick reload to sync all Zustand and Firebase listeners clean
    } catch (e: any) {
      console.error("Failed accepting invite:", e);
      alert(e.message || "May error sa pagtanggap ng invitation.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!pendingInvite) return;

    try {
      setIsProcessing(true);
      await rejectStaffInvite(pendingInvite.id);
      setIsOpen(false);
    } catch (e: any) {
      console.error("Failed rejecting invite:", e);
      alert("May error sa pagtanggi ng invitation.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      {children}

      <Sheet open={isOpen} onOpenChange={(open) => !isProcessing && setIsOpen(open)}>
        <SheetContent 
          side="bottom" 
          className="rounded-t-[32px] p-6 text-center border-t-2 border-slate-200"
          style={{ backgroundColor: '#051821', color: '#ffffff' }}
        >
          <SheetHeader className="flex flex-col items-center border-b border-white/10 pb-4 mb-4">
            <div className="h-12 w-12 rounded-full bg-teal-500/10 flex items-center justify-center mb-2 animate-bounce">
              <MailOpen className="h-6 w-6 text-teal-400" />
            </div>
            <SheetTitle className="font-headline font-black text-xl text-white">
              Invitation mula kay Ate o Kuya!
            </SheetTitle>
            <SheetDescription className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed mt-1">
              Ikaw po ay ini-invite na sumali sa **{pendingInvite?.tenantName}** bilang isang **Tindera / Staff member**.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 py-2">
            <p className="text-xs text-slate-300 max-w-sm mx-auto leading-relaxed">
              Kapag tinanggap mo ito, mapapamahalaan mo na ang kanilang bentahan, checkout, at stock gamit ang inyong device!
            </p>

            <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto pt-2">
              <Button 
                onClick={handleReject} 
                disabled={isProcessing}
                variant="outline" 
                className="h-12 rounded-xl font-bold uppercase tracking-widest text-[10px] text-slate-400 hover:text-white hover:bg-white/10 border-white/20"
              >
                Tanggihan
              </Button>
              <Button 
                onClick={handleAccept} 
                disabled={isProcessing}
                className="h-12 rounded-xl font-bold uppercase tracking-widest text-[10px] text-slate-900 bg-teal-400 hover:bg-teal-500 border-none"
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span className="flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> Tanggapin</span>
                )}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
