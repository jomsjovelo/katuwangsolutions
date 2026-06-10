"use client";

import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useTenant } from '@/app/lib/tenant-context';
import { useUser } from '@/firebase/auth/use-user';
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { LifeBuoy, Send, MessageSquare, Plus, ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getModuleTheme } from '@/lib/theme-utils';

export function SupportDrawer({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const { currentTenant } = useTenant();
  const { user } = useUser();
  const [tickets, setTickets] = useState<any[]>([]);
  const [view, setView] = useState<'list' | 'create' | 'chat'>('list');
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  
  // Create state
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Chat state
  const [replyText, setReplyText] = useState('');

  const theme = getModuleTheme(currentTenant?.moduleType);

  useEffect(() => {
    if (!currentTenant || !isOpen) return;
    
    const { db } = initializeFirebase();
    const q = query(
      collection(db, 'tenants', currentTenant.id, 'support_tickets')
    );
    
    const unsubscribe = onSnapshot(q, (snap) => {
      // Manual sort since we can't reliably sort locally without composite index yet
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a: any, b: any) => {
        const tA = a.updatedAt?.seconds || 0;
        const tB = b.updatedAt?.seconds || 0;
        return tB - tA;
      });
      setTickets(data);
      
      if (selectedTicket) {
        const updated = data.find(t => t.id === selectedTicket.id);
        if (updated) setSelectedTicket(updated);
      }
    });

    return () => unsubscribe();
  }, [currentTenant, isOpen, selectedTicket]);

  const handleCreateTicket = async () => {
    if (!currentTenant || !user || !subject.trim() || !description.trim()) return;
    
    setIsSubmitting(true);
    try {
      const { db } = initializeFirebase();
      await addDoc(collection(db, 'tenants', currentTenant.id, 'support_tickets'), {
        tenantId: currentTenant.id,
        tenantName: currentTenant.name,
        userEmail: user.email,
        subject,
        description,
        status: 'open',
        priority,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        responses: []
      });
      setView('list');
      setSubject('');
      setDescription('');
    } catch (err) {
      console.error(err);
      alert('Failed to create ticket.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-md w-full flex flex-col h-full bg-slate-50 p-0 overflow-hidden">
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            {view !== 'list' && (
              <Button variant="ghost" size="icon" className="h-8 w-8 -ml-2 rounded-full" onClick={() => { setView('list'); setSelectedTicket(null); }}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div>
              <h2 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                <LifeBuoy className="h-5 w-5" style={{ color: theme.primary }} />
                Support Center
              </h2>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {view === 'list' && (
            <div className="space-y-4">
              <Button 
                onClick={() => setView('create')}
                className="w-full font-bold shadow-md rounded-xl h-12"
                style={{ backgroundColor: theme.primary }}
              >
                <Plus className="mr-2 h-4 w-4" /> New Support Ticket
              </Button>
              
              <div className="space-y-3 mt-6">
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 pl-2">Your Tickets</h3>
                {tickets.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 font-medium bg-white rounded-2xl border border-dashed border-slate-200">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">No support tickets found.</p>
                  </div>
                ) : (
                  tickets.map(t => (
                    <div 
                      key={t.id} 
                      className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => { setSelectedTicket(t); setView('chat'); }}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold text-sm text-slate-800 line-clamp-1 pr-4">{t.subject}</h4>
                        <Badge className={cn("text-[8px] uppercase tracking-widest font-black shrink-0", 
                          t.status === 'open' ? 'bg-slate-100 text-slate-600' :
                          t.status === 'in_progress' ? 'bg-amber-100 text-amber-700' :
                          'bg-emerald-100 text-emerald-700'
                        )}>
                          {t.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-2">{t.description}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {view === 'create' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Subject</label>
                <Input 
                  placeholder="What do you need help with?" 
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className="rounded-xl border-slate-200"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Details</label>
                <Textarea 
                  placeholder="Please describe your issue in detail..." 
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="rounded-xl border-slate-200 min-h-[150px]"
                />
              </div>
              <Button 
                onClick={handleCreateTicket}
                disabled={isSubmitting || !subject.trim() || !description.trim()}
                className="w-full font-bold shadow-md rounded-xl h-12"
                style={{ backgroundColor: theme.primary }}
              >
                {isSubmitting ? 'Submitting...' : 'Submit Ticket'}
              </Button>
            </div>
          )}

          {view === 'chat' && selectedTicket && (
            <div className="flex flex-col h-full space-y-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-black text-slate-800">{selectedTicket.subject}</h4>
                </div>
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{selectedTicket.description}</p>
              </div>

              <div className="flex-1 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 pl-2">Responses</h3>
                {selectedTicket.responses?.map((r: any) => (
                  <div key={r.id} className={cn("p-4 rounded-2xl border text-sm shadow-sm", r.sender === 'admin' ? 'bg-primary/5 border-primary/20 mr-8' : 'bg-white border-slate-200 ml-8')}>
                    <div className="font-bold text-xs mb-1 flex items-center gap-1" style={{ color: r.sender === 'admin' ? theme.primary : '#64748b' }}>
                      {r.sender === 'admin' ? 'Katuwang Support' : 'You'}
                    </div>
                    <p className="text-slate-700 whitespace-pre-wrap">{r.message}</p>
                  </div>
                ))}
                {(!selectedTicket.responses || selectedTicket.responses.length === 0) && (
                  <p className="text-center text-xs text-slate-400 py-4">Waiting for support to respond...</p>
                )}
              </div>
              
              {/* Note: In a real app we'd add the reply logic here for the user to reply back */}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
