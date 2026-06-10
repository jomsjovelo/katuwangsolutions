"use client";

import React, { useState, useEffect } from 'react';
import { collectionGroup, onSnapshot, query, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { LifeBuoy, CheckCircle2, CircleDashed, Clock, Send, Shield, User } from "lucide-react";
import { getAuth } from 'firebase/auth';
import { cn } from '@/lib/utils';

interface Ticket {
  id: string;
  tenantId: string;
  tenantName: string;
  userEmail: string;
  subject: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  createdAt: any;
  updatedAt: any;
  responses?: TicketResponse[];
}

interface TicketResponse {
  id: string;
  sender: 'admin' | 'user';
  senderEmail: string;
  message: string;
  timestamp: any;
}

export function AdminTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [replyText, setReplyText] = useState("");
  const [isReplying, setIsReplying] = useState(false);

  useEffect(() => {
    const { db } = initializeFirebase();
    const q = query(collectionGroup(db, 'support_tickets'));
    
    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ticket))
        .sort((a, b) => {
          const tA = a.updatedAt?.seconds || 0;
          const tB = b.updatedAt?.seconds || 0;
          return tB - tA;
        });
      setTickets(data);
      
      // Update selected ticket if it's currently open
      if (selectedTicket) {
        const updated = data.find(t => t.id === selectedTicket.id);
        if (updated) setSelectedTicket(updated);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, [selectedTicket]);

  const handleSendReply = async () => {
    if (!selectedTicket || !replyText.trim()) return;
    
    setIsReplying(true);
    try {
      const { db } = initializeFirebase();
      const auth = getAuth();
      const adminEmail = auth.currentUser?.email || 'Admin';
      
      const newResponse: TicketResponse = {
        id: Math.random().toString(36).substring(2, 9),
        sender: 'admin',
        senderEmail: adminEmail,
        message: replyText,
        timestamp: new Date()
      };
      
      const ticketRef = doc(db, 'tenants', selectedTicket.tenantId, 'support_tickets', selectedTicket.id);
      
      const currentResponses = selectedTicket.responses || [];
      await updateDoc(ticketRef, {
        responses: [...currentResponses, newResponse],
        status: selectedTicket.status === 'open' ? 'in_progress' : selectedTicket.status,
        updatedAt: serverTimestamp()
      });
      
      setReplyText("");
    } catch (err) {
      console.error("Failed to send reply:", err);
      alert("Failed to send reply.");
    } finally {
      setIsReplying(false);
    }
  };

  const handleUpdateStatus = async (ticketId: string, tenantId: string, status: 'open' | 'in_progress' | 'resolved') => {
    try {
      const { db } = initializeFirebase();
      await updateDoc(doc(db, 'tenants', tenantId, 'support_tickets', ticketId), { 
        status,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'resolved': return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'in_progress': return <Clock className="h-4 w-4 text-amber-500" />;
      default: return <CircleDashed className="h-4 w-4 text-blue-500" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch(priority) {
      case 'urgent': return "bg-rose-100 text-rose-700 border-rose-200";
      case 'high': return "bg-orange-100 text-orange-700 border-orange-200";
      case 'medium': return "bg-amber-100 text-amber-700 border-amber-200";
      default: return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <Card className="shadow-lg border-primary/10">
        <CardHeader className="bg-slate-50/50 border-b">
          <CardTitle className="flex items-center gap-2 text-lg font-black uppercase tracking-wider text-slate-800">
            <LifeBuoy className="h-5 w-5 text-primary" /> Support Desk
          </CardTitle>
          <CardDescription>Manage and respond to tenant support tickets.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto min-w-full">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow>
                <TableHead className="font-bold text-xs uppercase tracking-widest py-4 pl-6">Tenant / Subject</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-widest py-4">Status</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-widest py-4">Priority</TableHead>
                <TableHead className="text-right font-bold text-xs uppercase tracking-widest py-4 pr-6">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-12 text-slate-400 font-medium animate-pulse">
                    Loading tickets...
                  </TableCell>
                </TableRow>
              ) : tickets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-12 text-slate-400 font-medium">
                    No support tickets found.
                  </TableCell>
                </TableRow>
              ) : (
                tickets.map(ticket => (
                  <TableRow 
                    key={ticket.id} 
                    className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                    onClick={() => setSelectedTicket(ticket)}
                  >
                    <TableCell className="pl-6">
                      <div className="font-bold text-sm text-slate-800">{ticket.subject}</div>
                      <div className="text-xs text-slate-500">{ticket.tenantName}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 font-medium text-xs uppercase tracking-wider">
                        {getStatusIcon(ticket.status)}
                        {ticket.status.replace('_', ' ')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("font-bold uppercase tracking-widest text-[10px]", getPriorityColor(ticket.priority))}>
                        {ticket.priority}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <span className="text-xs text-slate-500">
                        {ticket.updatedAt ? new Date(ticket.updatedAt.seconds ? ticket.updatedAt.seconds * 1000 : ticket.updatedAt).toLocaleDateString() : 'Just now'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      {/* Ticket Details Drawer */}
      <Sheet open={!!selectedTicket} onOpenChange={(open) => !open && setSelectedTicket(null)}>
        <SheetContent className="sm:max-w-lg w-full flex flex-col h-full">
          {selectedTicket && (
            <>
              <SheetHeader className="mb-4">
                <div className="flex items-start justify-between">
                  <div>
                    <SheetTitle className="text-xl font-black">{selectedTicket.subject}</SheetTitle>
                    <SheetDescription className="text-primary font-medium mt-1">
                      {selectedTicket.tenantName} ({selectedTicket.userEmail})
                    </SheetDescription>
                  </div>
                </div>
                
                <div className="flex gap-2 mt-4 pt-4 border-t">
                  <Badge variant="outline" className={cn("cursor-pointer", selectedTicket.status === 'open' ? 'bg-slate-100' : '')} onClick={() => handleUpdateStatus(selectedTicket.id, selectedTicket.tenantId, 'open')}>Open</Badge>
                  <Badge variant="outline" className={cn("cursor-pointer", selectedTicket.status === 'in_progress' ? 'bg-amber-100 text-amber-700' : '')} onClick={() => handleUpdateStatus(selectedTicket.id, selectedTicket.tenantId, 'in_progress')}>In Progress</Badge>
                  <Badge variant="outline" className={cn("cursor-pointer", selectedTicket.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' : '')} onClick={() => handleUpdateStatus(selectedTicket.id, selectedTicket.tenantId, 'resolved')}>Resolved</Badge>
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-2">
                {/* Original Message */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-2 mb-2 text-xs font-bold text-slate-500">
                    <User className="h-4 w-4" /> Tenant
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{selectedTicket.description}</p>
                </div>

                {/* Responses */}
                {selectedTicket.responses?.map((resp) => (
                  <div key={resp.id} className={cn("p-4 rounded-xl border", resp.sender === 'admin' ? 'bg-primary/5 border-primary/20 ml-8' : 'bg-slate-50 border-slate-100 mr-8')}>
                    <div className="flex items-center gap-2 mb-2 text-xs font-bold text-slate-500">
                      {resp.sender === 'admin' ? <Shield className="h-4 w-4 text-primary" /> : <User className="h-4 w-4" />}
                      {resp.senderEmail}
                    </div>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{resp.message}</p>
                  </div>
                ))}
              </div>

              {/* Reply Box */}
              <div className="pt-4 border-t mt-auto pb-4 md:pb-0">
                <Textarea 
                  placeholder="Type your response..." 
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  className="mb-2 min-h-[100px]"
                />
                <Button 
                  className="w-full font-bold h-12 rounded-xl" 
                  onClick={handleSendReply}
                  disabled={isReplying || !replyText.trim()}
                >
                  <Send className="h-4 w-4 mr-2" /> Send Reply
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
