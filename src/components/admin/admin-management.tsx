"use client";

import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { initializeFirebase } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users, Shield, ShieldAlert, Trash2, UserPlus, Key } from "lucide-react";

interface AdminUser {
  id: string;
  role: 'superadmin' | 'support';
  email: string;
  addedAt: any;
}

export function AdminManagement() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUid, setNewUid] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'superadmin' | 'support'>('support');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const { db } = initializeFirebase();
    const unsubscribe = onSnapshot(collection(db, 'admins'), (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AdminUser));
      setAdmins(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUid.trim() || !newEmail.trim()) return;

    setIsSubmitting(true);
    try {
      const { db } = initializeFirebase();
      await setDoc(doc(db, 'admins', newUid), {
        role: newRole,
        email: newEmail,
        addedAt: new Date()
      });

      const auth = getAuth();
      if (auth.currentUser) {
        await addDoc(collection(db, 'admin_logs'), {
          adminUid: auth.currentUser.uid,
          adminEmail: auth.currentUser.email || 'Unknown',
          action: 'ADD_ADMIN',
          details: `Granted ${newRole} access to ${newEmail} (${newUid})`,
          targetId: newUid,
          timestamp: serverTimestamp()
        });
      }

      setNewUid('');
      setNewEmail('');
      setNewRole('support');
    } catch (error: any) {
      console.error(error);
      alert(error.message || 'Failed to add admin. You must be a Superadmin to do this.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveAdmin = async (id: string) => {
    if (!confirm('Are you sure you want to revoke admin access for this user?')) return;
    
    try {
      const { db } = initializeFirebase();
      await deleteDoc(doc(db, 'admins', id));

      const auth = getAuth();
      if (auth.currentUser) {
        await addDoc(collection(db, 'admin_logs'), {
          adminUid: auth.currentUser.uid,
          adminEmail: auth.currentUser.email || 'Unknown',
          action: 'REMOVE_ADMIN',
          details: `Revoked admin access for UID ${id}`,
          targetId: id,
          timestamp: serverTimestamp()
        });
      }
    } catch (error: any) {
      console.error(error);
      alert(error.message || 'Failed to remove admin. You must be a Superadmin to do this.');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in zoom-in-95 duration-300">
      <div className="lg:col-span-4 space-y-6">
        <Card className="shadow-xl border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl font-black text-slate-800 uppercase tracking-tight">
              <UserPlus className="h-5 w-5 text-primary" /> Invite Admin
            </CardTitle>
            <CardDescription>Grant dashboard access to staff.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddAdmin} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Firebase UID</label>
                <Input 
                  placeholder="e.g. Ea3mAvcT..." 
                  value={newUid}
                  onChange={e => setNewUid(e.target.value)}
                  required
                />
                <p className="text-[10px] text-slate-400">Find this in Firebase Auth console.</p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Email Address</label>
                <Input 
                  type="email"
                  placeholder="staff@example.com" 
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Role</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewRole('support')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all flex flex-col items-center gap-1 ${
                      newRole === 'support' 
                        ? "bg-blue-100 border-blue-300 text-blue-800"
                        : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    <Shield className="h-4 w-4" /> Support
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewRole('superadmin')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all flex flex-col items-center gap-1 ${
                      newRole === 'superadmin' 
                        ? "bg-purple-100 border-purple-300 text-purple-800"
                        : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    <ShieldAlert className="h-4 w-4" /> Superadmin
                  </button>
                </div>
              </div>
              <Button 
                type="submit" 
                className="w-full font-bold shadow-lg"
                disabled={isSubmitting || !newUid || !newEmail}
              >
                <Key className="mr-2 h-4 w-4" /> Grant Access
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-8">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-black uppercase tracking-wider text-slate-800">
              <Users className="h-5 w-5 text-primary" /> Active Administrators
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto min-w-full">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead className="font-bold text-xs uppercase tracking-widest py-4 pl-6">Admin Identity</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-widest py-4">Role / Permissions</TableHead>
                  <TableHead className="text-right font-bold text-xs uppercase tracking-widest py-4 pr-6">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.map(admin => (
                  <TableRow key={admin.id}>
                    <TableCell className="pl-6">
                      <div className="font-bold text-sm text-slate-800">{admin.email || 'Unknown Email'}</div>
                      <div className="text-[10px] font-mono text-slate-400">{admin.id}</div>
                    </TableCell>
                    <TableCell>
                      {admin.role === 'superadmin' || !admin.role ? (
                        <Badge className="bg-purple-100 text-purple-700 border-purple-200 font-bold tracking-widest text-[10px] uppercase">
                          <ShieldAlert className="h-3 w-3 mr-1 inline" /> Superadmin
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50 font-bold tracking-widest text-[10px] uppercase">
                          <Shield className="h-3 w-3 mr-1 inline" /> Support Agent
                        </Badge>
                      )}
                      {(!admin.role || admin.role === 'superadmin') && (
                        <p className="text-[10px] text-slate-500 mt-1 max-w-[200px] leading-tight">Can delete data, manage pricing, and add other admins.</p>
                      )}
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handleRemoveAdmin(admin.id)}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        title="Revoke Access"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
