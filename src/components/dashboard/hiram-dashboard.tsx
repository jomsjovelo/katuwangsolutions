"use client"

import React, { useState, useEffect } from 'react';
// FIX S2-3: Static ES imports replace dynamic require() calls inside useEffect
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { useTenant } from '@/app/lib/tenant-context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getModuleTheme, useDynamicThemeColor } from '@/lib/theme-utils';
import { 
  Users, 
  Banknote, 
  ArrowDownToLine, 
  ArrowUpFromLine, 
  UserPlus,
  Wallet,
  MessageSquare,
  Copy,
  CheckCircle2,
  X,
  Phone,
  Coins,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Zap
} from "lucide-react";
import { 
  addBorrower, 
  recordLoan, 
  recordPayment,
  applyMissedDayPenalty,
  Borrower 
} from '@/firebase/firestore/credit-actions';
import { playSuccessBeep } from './retail/gcash-qr-modal';

import { playCashRegisterSwoosh } from '@/lib/hardware/audio-synthesizer';

// Synthesize a quick cash register sliding sound when a borrower pays
const playPaymentSound = () => playCashRegisterSwoosh();

export function HiramDashboard() {
  const { currentTenant } = useTenant();
  const theme = getModuleTheme(currentTenant?.moduleType);
  useDynamicThemeColor(theme);

  // Firestore real-time state listeners
  const [borrowers, setBorrowers] = useState<Borrower[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDrawer, setActiveDrawer] = useState<'none' | 'add_borrower' | 'record_loan' | 'record_payment' | 'sms_alert'>('none');
  const [selectedBorrower, setSelectedBorrower] = useState<Borrower | null>(null);

  // Notification overlays
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Fields
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newLimit, setNewLimit] = useState('5000');
  const [newDailyDue, setNewDailyDue] = useState('100');

  const [loanPrincipal, setLoanPrincipal] = useState('2000');
  const [loanInterest, setLoanInterest] = useState('400'); // 5-6 default interest (20%)
  const [loanDailyDue, setLoanDailyDue] = useState('100');

  const [payAmount, setPayAmount] = useState('500');

  // Real-time Firestore binding
  useEffect(() => {
    if (!currentTenant) return;
    setLoading(true);

    const { db } = initializeFirebase();

    const borrowersRef = collection(db, 'tenants', currentTenant.id, 'borrowers');
    const q = query(borrowersRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot: any) => {
      const roster: Borrower[] = [];
      snapshot.forEach((doc: any) => {
        roster.push({
          id: doc.id,
          ...doc.data()
        } as Borrower);
      });
      setBorrowers(roster);
      setLoading(false);
    }, (err: any) => {
      console.error("Error loading borrowers", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentTenant]);

  // Aggregate metrics
  const activeDebtors = borrowers.filter(b => b.status === 'active');
  const totalOutstandingPesos = borrowers.reduce((acc, curr) => acc + (curr.outstanding || 0), 0) / 100;
  const totalCollectiblesTodayPesos = activeDebtors.reduce((acc, curr) => acc + (curr.dailyDue || 0), 0) / 100;

  // Add Borrower Submit
  const handleAddBorrower = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant || !newName || !newPhone) return;

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      
      const phoneClean = newPhone.trim();
      if (!phoneClean.startsWith('09') && !phoneClean.startsWith('+63')) {
        throw new Error("Mangyaring maglagay ng valid na PH mobile number (ex. 09123456789).");
      }

      const limitParsed = parseFloat(newLimit);
      const dailyDueParsed = parseFloat(newDailyDue);
      if (isNaN(limitParsed) || limitParsed <= 0 || isNaN(dailyDueParsed) || dailyDueParsed <= 0) {
        throw new Error("Paki-check ang limit at target. Dapat ito ay valid na numero.");
      }

      await addBorrower(
        currentTenant.id,
        newName,
        phoneClean,
        limitParsed,
        dailyDueParsed
      );

      playSuccessBeep();
      setSuccessMsg("Bagong borrower naidagdag sa database!");
      setTimeout(() => setSuccessMsg(null), 3000);
      
      // Reset
      setNewName('');
      setNewPhone('');
      setActiveDrawer('none');
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to add borrower.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Record Loan Submit
  const handleRecordLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant || !selectedBorrower) return;

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const principalParsed = parseFloat(loanPrincipal);
      const interestParsed = parseFloat(loanInterest);
      const dailyDueParsed = parseFloat(loanDailyDue);

      if (isNaN(principalParsed) || principalParsed <= 0 || isNaN(interestParsed) || interestParsed < 0 || isNaN(dailyDueParsed) || dailyDueParsed <= 0) {
        throw new Error("Paki-check ang mga halaga. Siguraduhing valid ang mga inilagay na numero.");
      }

      await recordLoan(
        currentTenant.id,
        selectedBorrower.id,
        principalParsed,
        interestParsed,
        dailyDueParsed
      );

      playSuccessBeep();
      setSuccessMsg(`Pautang naitala para kay ${selectedBorrower.name}!`);
      setTimeout(() => setSuccessMsg(null), 3000);
      setActiveDrawer('none');
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to record loan transaction.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Record Payment Submit
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant || !selectedBorrower) return;

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const payParsed = parseFloat(payAmount);
      if (isNaN(payParsed) || payParsed <= 0) {
        throw new Error("Ang halaga ng ibabayad ay dapat higit sa zero at valid na numero.");
      }

      await recordPayment(
        currentTenant.id,
        selectedBorrower.id,
        payParsed
      );

      playPaymentSound();
      setSuccessMsg(`Bayad na ₱${payAmount} natanggap mula kay ${selectedBorrower.name}!`);
      setTimeout(() => setSuccessMsg(null), 3000);
      setActiveDrawer('none');
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to record payment transaction.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Apply Missed Day Penalty
  const handleApplyPenalty = async (borrower: Borrower) => {
    if (!currentTenant) return;
    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      await applyMissedDayPenalty(currentTenant.id, borrower.id);
      playPaymentSound();
      setSuccessMsg(`Penalty nailapat kay ${borrower.name}! (+5% ng daily due)`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to apply penalty.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Dynamic Tagalog SMS message generator
  const getSmsMessage = (borrower: Borrower) => {
    const outstandingPesos = (borrower.outstanding || 0) / 100;
    const dailyDuePesos = (borrower.dailyDue || 0) / 100;
    return `Magandang araw po, ${borrower.name}! Paalala lang po mula sa ${currentTenant?.name || "aming tindahan"} na ang inyong outstanding na lista ay ₱${outstandingPesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}. Ang inyong target na arawang singil ay ₱${dailyDuePesos.toLocaleString('en-PH')}. Maraming salamat po!`;
  };

  const handleSendSms = (borrower: Borrower) => {
    const message = getSmsMessage(borrower);
    const link = `sms:${borrower.phone}?body=${encodeURIComponent(message)}`;
    window.open(link, '_blank');
  };

  const handleCopySms = (borrower: Borrower) => {
    const message = getSmsMessage(borrower);
    navigator.clipboard.writeText(message);
    setSuccessMsg("SMS paalala nakopya na sa clipboard!");
    setTimeout(() => setSuccessMsg(null), 2500);
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-h-screen">
      
      {/* Toast Alerts */}
      {successMsg && (
        <div className="fixed top-4 inset-x-4 z-50 bg-slate-900/95 text-white py-3 px-4 rounded-2xl border border-slate-700/50 text-xs font-bold flex items-center gap-2 shadow-2xl animate-in slide-in-from-top-4 duration-200">
          <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 flex-shrink-0 animate-bounce" />
          <span className="truncate">{successMsg}</span>
        </div>
      )}

      <main className="p-4 space-y-5 pb-24">
        
        {/* Header Title Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-headline font-black tracking-tight text-slate-800">5-6 Tracker</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                {theme.name} • Micro-Credit Ledger
              </p>
            </div>
            <Badge 
              className="text-[9px] font-black uppercase border-transparent px-3 py-1 rounded-full shadow-sm"
              style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}
            >
              Live Sync
            </Badge>
          </div>
        </section>

        {/* Real-time Collections & Credit Statistics */}
        <div className="grid grid-cols-2 gap-3">
          <Card 
            className="shadow-none border border-slate-200/60 rounded-[28px] overflow-hidden transition-colors"
            style={{ backgroundColor: `${theme.primary}08` }}
          >
            <CardHeader className="p-4 pb-0">
              <CardDescription className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                Target na Singilin Ngayon
              </CardDescription>
              <CardTitle className="text-xl font-headline font-black text-slate-800 mt-1">
                ₱{totalCollectiblesTodayPesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-1.5 text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1.5 border-t border-slate-100 bg-white/40 mt-3">
              <ArrowDownToLine className="h-3.5 w-3.5" style={{ color: theme.primary }} /> 
              May {activeDebtors.length} aktibong utang
            </CardContent>
          </Card>
          
          <Card 
            className="shadow-none border border-slate-200/60 rounded-[28px] overflow-hidden transition-colors"
            style={{ backgroundColor: `${theme.secondary}08` }}
          >
            <CardHeader className="p-4 pb-0">
              <CardDescription className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                Kabuuang Pautang
              </CardDescription>
              <CardTitle className="text-xl font-headline font-black text-slate-800 mt-1">
                ₱{totalOutstandingPesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-1.5 text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1.5 border-t border-slate-100 bg-white/40 mt-3">
              <ArrowUpFromLine className="h-3.5 w-3.5" style={{ color: theme.secondary }} /> 
              Capital + interest book
            </CardContent>
          </Card>
        </div>

        {/* Ledger Action Triggers */}
        <div className="grid grid-cols-2 gap-3">
          <Button 
            onClick={() => {
              if (borrowers.length === 0) {
                setErrorMsg("Mangyaring mag-add muna ng borrower bago mag-pautang.");
                setTimeout(() => setErrorMsg(null), 3000);
                return;
              }
              setSelectedBorrower(borrowers[0]);
              setActiveDrawer('record_loan');
            }}
            className="h-14 rounded-2xl text-white font-black flex items-center justify-center gap-2 text-xs border-none cursor-pointer"
            style={{ 
              backgroundColor: theme.primary, 
              boxShadow: `0 8px 16px -4px ${theme.primary}30` 
            }}
          >
            <Banknote className="h-4.5 w-4.5" /> Bagong Pautang
          </Button>
          
          <Button 
            onClick={() => {
              if (activeDebtors.length === 0) {
                setErrorMsg("Walang aktibong pautang na sisingilin.");
                setTimeout(() => setErrorMsg(null), 3000);
                return;
              }
              setSelectedBorrower(activeDebtors[0]);
              setActiveDrawer('record_payment');
            }}
            className="h-14 rounded-2xl text-white font-black flex items-center justify-center gap-2 text-xs border-none cursor-pointer"
            style={{ 
              backgroundColor: theme.secondary, 
              boxShadow: `0 8px 16px -4px ${theme.secondary}30` 
            }}
          >
            <Wallet className="h-4.5 w-4.5" /> Tanggap na Bayad
          </Button>
        </div>

        {/* Main Borrowers Roster Section */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-headline font-black text-slate-800">Listahan ng mga Pautang</h3>
            <Button 
              onClick={() => setActiveDrawer('add_borrower')}
              className="text-xs font-bold flex items-center gap-1 cursor-pointer bg-slate-200/80 hover:bg-slate-200 text-slate-600 rounded-xl px-3 py-1.5 h-auto border-none"
            >
              <UserPlus className="h-4 w-4" /> Add Debtor
            </Button>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white border border-slate-100 rounded-3xl">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" style={{ color: theme.primary }} />
              <p className="text-xs text-slate-400 mt-2 font-bold uppercase tracking-wider">Syncing Credit Registry...</p>
            </div>
          ) : borrowers.length === 0 ? (
            <div className="text-center py-16 bg-white border border-slate-200/60 rounded-3xl px-6">
              <Users className="h-10 w-10 mx-auto mb-3 text-slate-300" />
              <h4 className="text-sm font-black text-slate-800">Walang Nakatalang Borrower</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-normal">
                I-tap ang Add Debtor sa itaas para mag-setup ng bagong profile sa pautang ledger!
              </p>
            </div>
          ) : (
            <div className="grid gap-2.5">
              {borrowers.map((borrower) => {
                const outstandingPesos = (borrower.outstanding || 0) / 100;
                const limitPesos = (borrower.limit || 0) / 100;
                const dailyDuePesos = (borrower.dailyDue || 0) / 100;
                const isPaid = borrower.status === 'fully_paid';

                return (
                  <div 
                    key={borrower.id} 
                    className="bg-white border border-slate-200/60 rounded-2xl p-4 flex flex-col gap-3.5 shadow-sm relative overflow-hidden group hover:border-slate-300 transition-colors"
                  >
                    {/* Status side indicators */}
                    <div 
                      className="absolute left-0 top-0 bottom-0 w-1.5"
                      style={{ backgroundColor: isPaid ? '#10b981' : theme.primary }}
                    />
                    
                    <div className="flex items-center justify-between pl-1">
                      <div className="flex items-center gap-3">
                        <div 
                          className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ 
                            backgroundColor: isPaid ? '#ecfdf5' : `${theme.primary}15`, 
                            color: isPaid ? '#10b981' : theme.primary 
                          }}
                        >
                          <Users className="h-4.5 w-4.5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-black text-slate-800">{borrower.name}</h4>
                            {isPaid ? (
                              <Badge className="text-[7px] font-black uppercase bg-emerald-50 text-emerald-700 border-none px-1.5 py-0.5 rounded-md">Fully Paid</Badge>
                            ) : (
                              <Badge className="text-[7px] font-black uppercase bg-red-50 text-red-700 border-none px-1.5 py-0.5 rounded-md">May Utang</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-[9px] text-slate-400 font-bold mt-0.5">
                            <Phone className="h-3 w-3 text-slate-300" />
                            <span>{borrower.phone}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right Balances display */}
                      <div className="text-right">
                        <div 
                          className="text-base font-headline font-black"
                          style={{ color: isPaid ? '#10b981' : theme.primary }}
                        >
                          ₱{outstandingPesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </div>
                        <div className="text-[8px] font-black text-slate-400 uppercase tracking-wide">
                          Limit: ₱{limitPesos.toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {/* Missed days indicator */}
                    {!isPaid && (borrower.missedDays || 0) > 0 && (
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-50 border border-red-100 text-[9px] font-black text-red-600">
                        <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                        {borrower.missedDays} araw na hindi nagbayad • Penalty: +₱{((borrower.totalPenalty || 0) / 100).toFixed(0)}
                      </div>
                    )}

                    {/* Action controls row */}
                    {!isPaid && (
                      <div className="pl-1 pt-3 border-t border-slate-50 flex items-center justify-between gap-2.5">
                        <div className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1.5">
                          <Coins className="h-3.5 w-3.5 text-slate-300" />
                          Target Ngayong Araw: <span className="font-extrabold text-slate-700">₱{dailyDuePesos}</span>
                        </div>
                        
                        <div className="flex gap-1.5">
                          <Button 
                             variant="outline"
                             onClick={() => handleApplyPenalty(borrower)}
                             disabled={isSubmitting}
                             className="h-8 rounded-lg px-2 text-[9px] font-black text-red-500 hover:text-red-700 flex items-center gap-1 border-red-200 cursor-pointer"
                           >
                             <Zap className="h-3 w-3" />
                             Penalty
                           </Button>
                          <Button 
                            variant="outline"
                            onClick={() => {
                              setSelectedBorrower(borrower);
                              setActiveDrawer('sms_alert');
                            }}
                            className="h-8 rounded-lg px-2 text-[9px] font-black text-slate-500 hover:text-slate-700 flex items-center gap-1 border-slate-200 cursor-pointer"
                          >
                            <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
                            Remind
                          </Button>
                          
                          <Button 
                            onClick={() => {
                              setSelectedBorrower(borrower);
                              setPayAmount(dailyDuePesos.toString());
                              setActiveDrawer('record_payment');
                            }}
                            className="h-8 rounded-lg px-3 text-[9px] font-black text-white flex items-center gap-1 border-none cursor-pointer"
                            style={{ backgroundColor: theme.secondary }}
                          >
                            <Wallet className="h-3.5 w-3.5" />
                            Singilin
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* DRAWER VIEWPORTS */}
      {activeDrawer !== 'none' && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-t-[32px] overflow-hidden border-t border-slate-200 shadow-2xl flex flex-col max-h-[85vh] animate-in slide-in-from-bottom duration-300">
            
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div 
                  className="h-8 w-8 rounded-xl flex items-center justify-center text-white"
                  style={{ backgroundColor: theme.primary }}
                >
                  {activeDrawer === 'add_borrower' && <UserPlus className="h-4.5 w-4.5" />}
                  {activeDrawer === 'record_loan' && <Banknote className="h-4.5 w-4.5" />}
                  {activeDrawer === 'record_payment' && <Wallet className="h-4.5 w-4.5" />}
                  {activeDrawer === 'sms_alert' && <MessageSquare className="h-4.5 w-4.5" />}
                </div>
                <h4 className="font-headline font-black text-xs uppercase tracking-widest text-slate-800">
                  {activeDrawer === 'add_borrower' && "Setup Credit Borrower"}
                  {activeDrawer === 'record_loan' && "Mag-disburse ng Pautang"}
                  {activeDrawer === 'record_payment' && "Mag-rehistro ng Bayad"}
                  {activeDrawer === 'sms_alert' && "SMS Billing Assistant"}
                </h4>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setActiveDrawer('none')} 
                className="h-8 w-8 rounded-full hover:bg-slate-200/60 cursor-pointer"
              >
                <X className="h-4 w-4 text-slate-400" />
              </Button>
            </div>

            {/* Error notifications */}
            {errorMsg && (
              <div className="bg-red-50 text-red-700 p-3 text-[10px] font-bold flex items-center gap-1.5 border-b border-red-100 flex-shrink-0 animate-in shake">
                <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Drawer Content */}
            <div className="p-6 overflow-y-auto flex-1 pb-safe">
              
              {/* 1. Add Borrower Form */}
              {activeDrawer === 'add_borrower' && (
                <form onSubmit={handleAddBorrower} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Pangalan ng Borrower</label>
                    <input 
                      type="text" 
                      required
                      placeholder="Hal. Maria Santos"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-300 text-slate-800 placeholder:text-slate-400"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Cellphone Number</label>
                    <input 
                      type="text" 
                      required
                      placeholder="Hal. 09123456789"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-300 text-slate-800 placeholder:text-slate-400"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Credit Limit (₱)</label>
                      <input 
                        type="number" 
                        required
                        value={newLimit}
                        onChange={(e) => setNewLimit(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-300 text-slate-800"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Daily Target (₱)</label>
                      <input 
                        type="number" 
                        required
                        value={newDailyDue}
                        onChange={(e) => setNewDailyDue(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-300 text-slate-800"
                      />
                    </div>
                  </div>

                  <Button 
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-11 text-white font-bold rounded-xl flex items-center justify-center text-xs border-none mt-2 cursor-pointer"
                    style={{ backgroundColor: theme.primary }}
                  >
                    {isSubmitting ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : "I-save ang Borrower"}
                  </Button>
                </form>
              )}

              {/* 2. Record Loan Form */}
              {activeDrawer === 'record_loan' && (
                <form onSubmit={handleRecordLoan} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Piliin ang Borrower</label>
                    <select 
                      value={selectedBorrower?.id || ''}
                      onChange={(e) => {
                        const match = borrowers.find(b => b.id === e.target.value);
                        if (match) setSelectedBorrower(match);
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-300 text-slate-800"
                    >
                      {borrowers.map(b => (
                        <option key={b.id} value={b.id}>{b.name} (Bal: ₱{((b.outstanding || 0)/100).toFixed(0)})</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Halaga ng Pautang (₱)</label>
                      <input 
                        type="number" 
                        required
                        value={loanPrincipal}
                        onChange={(e) => {
                          setLoanPrincipal(e.target.value);
                          // Autocalculate 20% interest for 5-6 loan mock standard
                          const amt = parseFloat(e.target.value) || 0;
                          setLoanInterest((amt * 0.2).toFixed(0));
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-300 text-slate-800"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Patubong Interes (₱)</label>
                      <input 
                        type="number" 
                        required
                        value={loanInterest}
                        onChange={(e) => setLoanInterest(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-300 text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Arawang Singil (₱)</label>
                    <input 
                      type="number" 
                      required
                      value={loanDailyDue}
                      onChange={(e) => setLoanDailyDue(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-300 text-slate-800"
                    />
                  </div>

                  <Button 
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-11 text-white font-bold rounded-xl flex items-center justify-center text-xs border-none mt-2 cursor-pointer"
                    style={{ backgroundColor: theme.primary }}
                  >
                    {isSubmitting ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : "I-disburse ang Pautang"}
                  </Button>
                </form>
              )}

              {/* 3. Receive Payment Form */}
              {activeDrawer === 'record_payment' && selectedBorrower && (
                <form onSubmit={handleRecordPayment} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 font-bold">Magbabayad</label>
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex justify-between items-center text-xs">
                      <span className="font-extrabold text-slate-700">{selectedBorrower.name}</span>
                      <span className="font-black text-slate-400">Utang: ₱{(selectedBorrower.outstanding / 100).toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Halaga ng Bayad (₱)</label>
                    <input 
                      type="number" 
                      required
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-300 text-slate-800"
                    />
                  </div>

                  <Button 
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-11 text-white font-bold rounded-xl flex items-center justify-center text-xs border-none mt-2 cursor-pointer"
                    style={{ backgroundColor: theme.secondary }}
                  >
                    {isSubmitting ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : "I-rehistro ang Bayad"}
                  </Button>
                </form>
              )}

              {/* 4. SMS Alerts Share Modal */}
              {activeDrawer === 'sms_alert' && selectedBorrower && (
                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">SMS Reminders Roster</span>
                    <div className="bg-slate-900 border border-slate-800 text-slate-200 p-4 rounded-2xl font-mono text-[10px] leading-relaxed relative">
                      {getSmsMessage(selectedBorrower)}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Button 
                      variant="outline"
                      onClick={() => handleCopySms(selectedBorrower)}
                      className="h-11 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 border-slate-200 text-slate-600 cursor-pointer"
                    >
                      <Copy className="h-4 w-4" /> Copy Text
                    </Button>
                    <Button 
                      onClick={() => handleSendSms(selectedBorrower)}
                      className="h-11 rounded-xl text-xs font-black text-white flex items-center justify-center gap-1.5 border-none cursor-pointer"
                      style={{ backgroundColor: theme.primary }}
                    >
                      <Phone className="h-4 w-4" /> Send Alert
                    </Button>
                  </div>
                </div>
              )}

            </div>

          </div>
        </div>
      )}

    </div>
  );
}
