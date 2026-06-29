"use client"

import React, { useState, useEffect, useReducer, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from "@/components/ui/label";
// FIX S2-3: Static ES imports replace dynamic require() calls inside useEffect
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { useTenant } from '@/app/lib/tenant-context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getModuleTheme, useDynamicThemeColor } from '@/lib/theme-utils';
import { DiscountInput } from '@/components/ui/discount-input';
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
  Zap,
  Search,
  History,
  Filter,
  CheckCheck,
  MapPin,
  Trash2,
  Edit3,
  Save,
  TrendingUp
} from "lucide-react";
import { 
  addBorrower, 
  editBorrower,
  recordLoan, 
  recordPayment,
  applyMissedDayPenalty,
  getBorrowerLedger,
  deleteCreditTransaction,
  editCreditTransaction,
  recordCapitalInjection,
  Borrower,
  CreditTransaction
} from '@/firebase/firestore/credit-actions';
import { useUser } from '@/firebase/auth/use-user';
import { useCreditStats } from '@/hooks/use-credit-stats';
import { playSuccessBeep } from '@/components/common/gcash-qr-modal';

import { playCashRegisterSwoosh } from '@/lib/hardware/audio-synthesizer';

// Synthesize a quick cash register sliding sound when a borrower pays
const playPaymentSound = () => playCashRegisterSwoosh()// Ensure borrower type is available


const BorrowerCard = React.memo(({ 
  borrower, theme, isSubmitting, handleApplyPenalty, handleQuickCollect, 
  setSelectedBorrower, setActiveDrawer, setPayAmount, openLedger,
  setEditName, setEditPhone, setEditArea, setEditLimit, setEditDailyDue
}: any) => {
  const outstandingPesos = (borrower.outstanding || 0) / 100;
  const limitPesos = (borrower.limit || 0) / 100;
  const dailyDuePesos = (borrower.dailyDue || 0) / 100;
  const isPaid = borrower.status === 'fully_paid';
  
  let isAutoOverdue = false;
  if (!isPaid) {
    const today = new Date();
    today.setHours(0,0,0,0);
    const compareDate = borrower.lastPaymentDate ? borrower.lastPaymentDate.toDate() : (borrower.createdAt?.toDate() || today);
    compareDate.setHours(0,0,0,0);
    
    const diffDays = Math.floor((today.getTime() - compareDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays >= 1) {
      isAutoOverdue = true;
    }
  }

  return (
    <div className="bg-white border border-slate-200/60 rounded-2xl p-4 flex flex-col gap-3.5 shadow-sm relative overflow-hidden group hover:border-slate-300 transition-colors">
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
              {isAutoOverdue && (
                <Badge className="text-[7px] font-black uppercase bg-amber-100 text-amber-700 border-none px-1.5 py-0.5 rounded-md flex items-center gap-0.5"><AlertCircle className="h-2 w-2" /> Overdue</Badge>
              )}
            </div>
            <div className="flex flex-col gap-0.5 mt-0.5">
              <div className="flex items-center gap-1 text-[9px] text-slate-400 font-bold">
                <Phone className="h-3 w-3 text-slate-300" />
                <span>{borrower.phone}</span>
              </div>
              {borrower.area && (
                <div className="flex items-center gap-1 text-[9px] text-slate-400 font-bold">
                  <MapPin className="h-3 w-3 text-slate-300" />
                  <span>{borrower.area}</span>
                </div>
              )}
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
      <div className="pl-1 pt-3 border-t border-slate-50 flex flex-col gap-2.5">
        {!isPaid && (
          <div className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1.5">
            <Coins className="h-3.5 w-3.5 text-slate-300" />
            {borrower.paymentSchedule === 'weekly' ? 'Lingguhang Target' :
              borrower.paymentSchedule === 'monthly' ? 'Buwanang Target' :
              borrower.paymentSchedule === 'custom' ? `Target bawat ${borrower.paymentIntervalDays} araw` : 
              'Target Ngayong Araw'}: <span className="font-extrabold text-slate-700">₱{dailyDuePesos}</span>
          </div>
        )}
        
        <div className="flex flex-wrap gap-1.5">
          {isPaid && (
            <Button 
              onClick={(e) => {
                e.stopPropagation();
                setSelectedBorrower(borrower);
                setActiveDrawer('record_loan');
              }}
              className="h-8 rounded-lg px-3 text-[9px] font-black text-white flex items-center gap-1 border-none cursor-pointer"
              style={{ backgroundColor: theme.primary }}
            >
              <Banknote className="h-3.5 w-3.5" />
              Pautangin Ulit
            </Button>
          )}

          {!isPaid && (
            <>
              <Button 
                variant="outline"
                onClick={(e) => { e.stopPropagation(); handleApplyPenalty(borrower); }}
                disabled={isSubmitting}
                className="h-8 rounded-lg px-2 text-[9px] font-black text-red-500 hover:text-red-700 flex items-center gap-1 border-red-200 cursor-pointer"
              >
                <Zap className="h-3 w-3" />
                Penalty
              </Button>
              <Button 
                variant="outline"
                onClick={(e) => { e.stopPropagation(); handleQuickCollect(borrower); }}
                disabled={isSubmitting}
                className="h-8 rounded-lg px-2 text-[9px] font-black text-slate-500 hover:text-slate-700 flex items-center gap-1 border-slate-200 cursor-pointer"
              >
                <CheckCheck className="h-3 w-3 text-emerald-500" />
                1-Tap
              </Button>
              <Button 
                onClick={(e) => {
                  e.stopPropagation();
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
            </>
          )}

          <Button 
            variant="outline"
            onClick={(e) => { e.stopPropagation(); openLedger(borrower); }}
            className="h-8 rounded-lg px-2 text-[9px] font-black text-slate-500 hover:text-slate-700 flex items-center gap-1 border-slate-200 cursor-pointer"
          >
            <History className="h-3.5 w-3.5 text-slate-400" />
            History
          </Button>
          
          <Button 
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedBorrower(borrower);
              setEditName(borrower.name);
              setEditPhone(borrower.phone);
              setEditArea(borrower.area || '');
              setEditLimit((borrower.limit / 100).toString());
              setEditDailyDue((borrower.dailyDue / 100).toString());
              setActiveDrawer('edit_borrower');
            }}
            className="h-8 rounded-lg px-2 text-[9px] font-black text-slate-500 hover:text-slate-700 flex items-center gap-1 border-slate-200 cursor-pointer"
          >
            <Edit3 className="h-3.5 w-3.5 text-slate-400" />
            Edit
          </Button>

          <Button 
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedBorrower(borrower);
              setActiveDrawer('sms_alert');
            }}
            className="h-8 rounded-lg w-8 p-0 flex items-center justify-center border-slate-200 cursor-pointer"
          >
            <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
          </Button>
        </div>
      </div>
    </div>
  );
});

type FormState = {
  editNote: string;
  editName: string;
  editPhone: string;
  editArea: string;
  editLimit: string;
  editDailyDue: string;
  newName: string;
  newPhone: string;
  newArea: string;
  loanPrincipal: string;
  loanInterest: string;
  interestMode: '20' | '10' | 'custom';
  loanSchedule: 'daily' | 'weekly' | 'monthly' | 'custom';
  loanIntervalDays: string;
  loanDailyDue: string;
  loanTermDays: string;
  loanDateStr: string;
  payAmount: string;
  discountType: 'percentage' | 'fixed';
  discountValue: string;
  collectTodayMode: boolean;
  capitalAmount: string;
  capitalNote: string;
};

const initialFormState: FormState = {
  editNote: '',
  editName: '',
  editPhone: '',
  editArea: '',
  editLimit: '',
  editDailyDue: '',
  newName: '',
  newPhone: '',
  newArea: '',
  loanPrincipal: '',
  loanInterest: '',
  interestMode: '20',
  loanSchedule: 'daily',
  loanIntervalDays: '3',
  loanDailyDue: '100',
  loanTermDays: '24',
  loanDateStr: '',
  payAmount: '',
  discountType: 'percentage',
  discountValue: '',
  collectTodayMode: false,
  capitalAmount: '',
  capitalNote: ''
};

type FormAction = 
  | { type: 'SET_FIELD'; field: keyof FormState; value: any }
  | { type: 'RESET_FORM' }
  | { type: 'POPULATE_EDIT'; payload: Partial<FormState> };

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'RESET_FORM':
      return { ...initialFormState, loanDateStr: new Date().toISOString().split('T')[0] };
    case 'POPULATE_EDIT':
      return { ...state, ...action.payload };
    default:
      return state;
  }
}

export function FiveSixDashboard() {
  const { currentTenant } = useTenant();
  const theme = getModuleTheme(currentTenant?.moduleType);
  useDynamicThemeColor(theme);

  // Firestore real-time state listeners
  const [borrowers, setBorrowers] = useState<Borrower[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDrawer, setActiveDrawer] = useState<'none' | 'add_borrower' | 'record_loan' | 'record_payment' | 'sms_alert' | 'view_ledger' | 'add_capital' | 'edit_borrower'>('none');
  const [selectedBorrower, setSelectedBorrower] = useState<Borrower | null>(null);

  // Credit Stats
  const { totalCapitalPesos, cashOnHandPesos, totalOutstandingPesos, generatedRevenuePesos, loading: statsLoading } = useCreditStats();

  // Feature States
  const [searchQuery, setSearchQuery] = useState('');
  const [ledgerHistory, setLedgerHistory] = useState<CreditTransaction[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [editingTx, setEditingTx] = useState<CreditTransaction | null>(null);
  
  const { user } = useUser();

  // Notification overlays
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Fields Managed by Reducer
  const [formState, dispatchForm] = useReducer(formReducer, initialFormState);
  const {
    editNote, editName, editPhone, editArea, editLimit, editDailyDue,
    newName, newPhone, newArea,
    loanPrincipal, loanInterest, interestMode, loanSchedule, loanIntervalDays, loanDailyDue, loanTermDays, loanDateStr,
    payAmount, discountType, discountValue, collectTodayMode,
    capitalAmount, capitalNote
  } = formState;

  // Setters for backward compatibility (reduces refactoring churn)
  const setField = useCallback((field: keyof FormState, value: any) => dispatchForm({ type: 'SET_FIELD', field, value }), []);
  const setDiscountType = useCallback((val: 'percentage'|'fixed') => setField('discountType', val), [setField]);
  const setDiscountValue = useCallback((val: string) => setField('discountValue', val), [setField]);
  const setEditNote = useCallback((val: string) => setField('editNote', val), [setField]);
  const setEditName = useCallback((val: string) => setField('editName', val), [setField]);
  const setEditPhone = useCallback((val: string) => setField('editPhone', val), [setField]);
  const setEditArea = useCallback((val: string) => setField('editArea', val), [setField]);
  const setEditLimit = useCallback((val: string) => setField('editLimit', val), [setField]);
  const setEditDailyDue = useCallback((val: string) => setField('editDailyDue', val), [setField]);
  const setNewName = useCallback((val: string) => setField('newName', val), [setField]);
  const setNewPhone = useCallback((val: string) => setField('newPhone', val), [setField]);
  const setNewArea = useCallback((val: string) => setField('newArea', val), [setField]);
  const setLoanPrincipal = useCallback((val: string) => setField('loanPrincipal', val), [setField]);
  const setLoanInterest = useCallback((val: string) => setField('loanInterest', val), [setField]);
  const setInterestMode = useCallback((val: any) => setField('interestMode', val), [setField]);
  const setLoanSchedule = useCallback((val: any) => setField('loanSchedule', val), [setField]);
  const setLoanIntervalDays = useCallback((val: string) => setField('loanIntervalDays', val), [setField]);
  const setLoanDailyDue = useCallback((val: string) => setField('loanDailyDue', val), [setField]);
  const setLoanTermDays = useCallback((val: string) => setField('loanTermDays', val), [setField]);
  const setLoanDateStr = useCallback((val: string) => setField('loanDateStr', val), [setField]);
  const setPayAmount = useCallback((val: string) => setField('payAmount', val), [setField]);
  const setCollectTodayMode = useCallback((val: boolean) => setField('collectTodayMode', val), [setField]);
  const setCapitalAmount = useCallback((val: string) => setField('capitalAmount', val), [setField]);
  const setCapitalNote = useCallback((val: string) => setField('capitalNote', val), [setField]);

  const handleDeleteTx = async (tx: CreditTransaction) => {
    if (!currentTenant || !selectedBorrower || !user) return;
    if (!window.confirm("Kumpirmahin: Sigurado ka bang gusto mong burahin ang transaksyong ito? Maibabalik ang dating balanse ng utang.")) return;
    
    try {
      setIsSubmitting(true);
      await deleteCreditTransaction(
        currentTenant.id, 
        selectedBorrower.id, 
        tx.id,
        user.uid,
        user.displayName || user.email || 'Unknown User'
      );
      setSuccessMsg('Nabura ang transaksyon at naibalik ang balanse.');
      
      // Refresh ledger
      const updatedLedger = await getBorrowerLedger(currentTenant.id, selectedBorrower.id);
      setLedgerHistory(updatedLedger);
      
      // Re-fetch borrower data to update UI (will happen automatically via listener, but just in case)
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Hindi mabura ang transaksyon.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (txId: string) => {
    if (!currentTenant || !selectedBorrower || !user || !editingTx) return;
    try {
      setIsSubmitting(true);
      await editCreditTransaction(
        currentTenant.id,
        selectedBorrower.id,
        txId,
        { note: editNote },
        user.uid,
        user.displayName || user.email || 'Unknown User'
      );
      setSuccessMsg('Na-update ang detalye ng transaksyon.');
      setEditingTx(null);
      setEditNote('');
      
      // Refresh ledger
      const updatedLedger = await getBorrowerLedger(currentTenant.id, selectedBorrower.id);
      setLedgerHistory(updatedLedger);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Hindi ma-update ang transaksyon.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditBorrowerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant || !selectedBorrower) return;
    if (!editName || !editPhone) {
      setErrorMsg("Kailangan ang pangalan at mobile number.");
      return;
    }
    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      await editBorrower(currentTenant.id, selectedBorrower.id, {
        name: editName,
        phone: editPhone,
        area: editArea,
        limitPesos: parseFloat(editLimit),
        dailyDuePesos: parseFloat(editDailyDue)
      });
      setSuccessMsg(`Na-update ang detalye ni ${editName}.`);
      setActiveDrawer('none');
    } catch (e: any) {
      setErrorMsg(e.message || "Hindi ma-update ang borrower.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Real-time Firestore binding
  useEffect(() => {
    if (!currentTenant?.id) return;
    setLoading(true);

    const { db } = initializeFirebase();

    const borrowersRef = collection(db, 'tenants', currentTenant.id, 'borrowers');
    const q = query(borrowersRef, orderBy('createdAt', 'desc'), limit(300));

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
  }, [currentTenant?.id]);

  // Aggregate metrics
  const { activeDebtors, totalCollectiblesTodayPesos, filteredBorrowers } = React.useMemo(() => {
    const activeDebtors = borrowers.filter(b => b.status === 'active');
    // Use Math.min to prevent inflated daily expected collections
    const totalCollectiblesTodayPesos = activeDebtors.reduce((acc, curr) => acc + Math.min(curr.outstanding || 0, curr.dailyDue || 0), 0) / 100;

    // Filter borrowers by search query and mode
    let filteredBorrowers = borrowers.filter(b => 
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (b.area && b.area.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    if (collectTodayMode) {
      filteredBorrowers = filteredBorrowers.filter(b => b.status === 'active');
      // Sort by daily due descending for easier high-value collection first
      filteredBorrowers.sort((a, b) => b.dailyDue - a.dailyDue);
    }

    return { activeDebtors, totalCollectiblesTodayPesos, filteredBorrowers };
  }, [borrowers, searchQuery, collectTodayMode]);

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

      const principalParsed = parseFloat(loanPrincipal);
      const interestParsed = parseFloat(loanInterest);
      const termParsed = parseFloat(loanTermDays);

      if (isNaN(principalParsed) || principalParsed <= 0) throw new Error("Ang Halaga ng Pautang ay dapat valid at higit sa zero.");
      if (isNaN(interestParsed) || interestParsed < 0) throw new Error("Ang Interes ay dapat valid.");
      if (isNaN(termParsed) || termParsed <= 0) throw new Error("Ang Termino ay dapat valid.");

      const limitParsed = principalParsed;
      const dailyDueParsed = Math.ceil((principalParsed + interestParsed) / termParsed);

      const newBorrowerId = await addBorrower(
        currentTenant.id,
        newName,
        phoneClean,
        limitParsed,
        dailyDueParsed,
        newArea
      );

      const intervalParsed = loanSchedule === 'custom' && loanIntervalDays ? parseInt(loanIntervalDays) : undefined;
      const isToday = loanDateStr === new Date().toISOString().split('T')[0];
      const parsedDate = (!isToday && loanDateStr) ? new Date(`${loanDateStr}T12:00:00`) : undefined;

      await recordLoan(
        currentTenant.id,
        newBorrowerId,
        principalParsed,
        interestParsed,
        dailyDueParsed,
        termParsed,
        loanSchedule,
        intervalParsed,
        parsedDate
      );

      try { playSuccessBeep(); } catch (err) { /* ignore autoplay blocks */ }
      setSuccessMsg("Bagong borrower naidagdag sa database!");
      setTimeout(() => setSuccessMsg(null), 3000);
      
      // Reset
      setNewName('');
      setNewPhone('');
      setLoanPrincipal('');
      setLoanInterest('');
      setInterestMode('20');
      setLoanSchedule('daily');
      setLoanDateStr(new Date().toISOString().split('T')[0]);
    } catch (e) {
      const err = e as Error & { code?: string };
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
      const termParsed = loanTermDays ? parseInt(loanTermDays) : undefined;

      if (isNaN(principalParsed) || principalParsed <= 0 || isNaN(interestParsed) || interestParsed < 0 || isNaN(dailyDueParsed) || dailyDueParsed <= 0) {
        throw new Error("Paki-check ang mga halaga. Siguraduhing valid ang mga inilagay na numero.");
      }

      const intervalParsed = loanSchedule === 'custom' && loanIntervalDays ? parseInt(loanIntervalDays) : undefined;
      const isToday = loanDateStr === new Date().toISOString().split('T')[0];
      const parsedDate = (!isToday && loanDateStr) ? new Date(`${loanDateStr}T12:00:00`) : undefined;

      await recordLoan(
        currentTenant.id,
        selectedBorrower.id,
        principalParsed,
        interestParsed,
        dailyDueParsed,
        termParsed,
        loanSchedule,
        intervalParsed,
        parsedDate
      );

      try { playSuccessBeep(); } catch (err) { /* ignore autoplay blocks */ }
      setSuccessMsg(`Pautang naitala para kay ${selectedBorrower.name}!`);
      setTimeout(() => setSuccessMsg(null), 3000);
      setActiveDrawer('none');
    } catch (e) {
      const err = e as Error & { code?: string };
      setErrorMsg(err.message || "Failed to record loan transaction.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Add Capital Submit
  const handleAddCapital = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant || !user) return;

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const capParsed = parseFloat(capitalAmount);
      if (isNaN(capParsed) || capParsed <= 0) {
        throw new Error("Ang halaga ng puhunan ay dapat higit sa zero at valid na numero.");
      }

      await recordCapitalInjection(
        currentTenant.id,
        capParsed,
        capitalNote,
        user.uid,
        user.displayName || user.email || 'Unknown User'
      );

      try { playSuccessBeep(); } catch (err) { /* ignore autoplay blocks */ }
      setSuccessMsg(`₱${capParsed.toLocaleString()} Puhunan naidagdag sa Master Cash!`);
      setTimeout(() => setSuccessMsg(null), 3000);
      setActiveDrawer('none');
      setCapitalAmount('10000');
      setCapitalNote('Additional Capital');
    } catch (e) {
      const err = e as Error & { code?: string };
      setErrorMsg(err.message || "Failed to record capital.");
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

      const parsedDiscount = parseFloat(discountValue) || 0;
      let discountCentavos = 0;
      if (discountType === 'percentage') {
        discountCentavos = Math.round((payParsed * 100 * parsedDiscount) / 100);
      } else {
        discountCentavos = Math.round(parsedDiscount * 100);
      }

      await recordPayment(
        currentTenant.id,
        selectedBorrower.id,
        payParsed,
        discountCentavos,
        discountType
      );

      try { playPaymentSound(); } catch (err) { /* ignore autoplay blocks */ }
      setSuccessMsg(`Bayad na ₱${payAmount} natanggap mula kay ${selectedBorrower.name}!`);
      setTimeout(() => setSuccessMsg(null), 3000);
      setActiveDrawer('none');
    } catch (e) {
      const err = e as Error & { code?: string };
      setErrorMsg(err.message || "Failed to record payment transaction.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickCollect = async (borrower: Borrower) => {
    if (!currentTenant) return;
    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      const amount = (borrower.dailyDue || 0) / 100;
      if (amount <= 0) throw new Error("Arawang singil ay 0.");
      
      await recordPayment(currentTenant.id, borrower.id, amount);
      
      try { playPaymentSound(); } catch (err) { /* ignore autoplay blocks */ }
      setSuccessMsg(`1-Tap Bayad na ₱${amount} kay ${borrower.name}!`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e) {
      const err = e as Error & { code?: string };
      setErrorMsg(err.message || "Failed to process 1-Tap payment.");
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
      try { playPaymentSound(); } catch (err) { /* ignore autoplay blocks */ }
      setSuccessMsg(`Penalty nailapat kay ${borrower.name}! (+5% ng daily due)`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e) {
      const err = e as Error & { code?: string };
      setErrorMsg(err.message || 'Failed to apply penalty.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openLedger = async (borrower: Borrower) => {
    if (!currentTenant) return;
    setSelectedBorrower(borrower);
    setActiveDrawer('view_ledger');
    setLoadingLedger(true);
    try {
      const history = await getBorrowerLedger(currentTenant.id, borrower.id);
      setLedgerHistory(history);
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to load ledger history.');
    } finally {
      setLoadingLedger(false);
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
        <div className="fixed top-4 inset-x-4 z-[100] bg-slate-900/95 text-white py-3 px-4 rounded-2xl border border-slate-700/50 text-xs font-bold flex items-center gap-2 shadow-2xl animate-in slide-in-from-top-4 duration-200">
          <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 flex-shrink-0 animate-bounce" />
          <span className="truncate">{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="fixed top-4 inset-x-4 z-[100] bg-red-50 text-red-700 py-3 px-4 rounded-2xl border border-red-200 text-xs font-bold flex items-center gap-2 shadow-2xl animate-in slide-in-from-top-4 duration-200">
          <AlertCircle className="h-4.5 w-4.5 text-red-500 flex-shrink-0" />
          <span className="truncate">{errorMsg}</span>
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card 
            className="shadow-none border border-slate-200/60 rounded-[28px] overflow-hidden transition-colors"
            style={{ backgroundColor: `${theme.primary}08` }}
          >
            <CardHeader className="p-4 pb-0">
              <CardDescription className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                Puhunan (Capital)
              </CardDescription>
              <CardTitle className="text-xl font-headline font-black text-slate-800 mt-1">
                ₱{totalCapitalPesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-1.5 text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1.5 border-t border-slate-100 bg-white/40 mt-3">
              <Wallet className="h-3.5 w-3.5" style={{ color: theme.primary }} /> 
              Total Injected Capital
            </CardContent>
          </Card>

          <Card 
            className="shadow-none border border-slate-200/60 rounded-[28px] overflow-hidden transition-colors bg-white"
          >
            <CardHeader className="p-4 pb-0">
              <CardDescription className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                Cash on Hand
              </CardDescription>
              <CardTitle className="text-xl font-headline font-black text-slate-800 mt-1">
                ₱{cashOnHandPesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-1.5 text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1.5 border-t border-slate-100 bg-slate-50 mt-3">
              <Banknote className="h-3.5 w-3.5 text-emerald-500" /> 
              Available to Lend
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
              Capital + Interest Book
            </CardContent>
          </Card>

          <Card 
            className="shadow-none border border-emerald-200/60 rounded-[28px] overflow-hidden transition-colors bg-emerald-50/30"
          >
            <CardHeader className="p-4 pb-0">
              <CardDescription className="text-[9px] font-black uppercase tracking-wider text-emerald-600">
                Generated Revenue
              </CardDescription>
              <CardTitle className="text-xl font-headline font-black text-emerald-700 mt-1">
                ₱{generatedRevenuePesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-1.5 text-[9px] font-bold text-emerald-600 uppercase flex items-center gap-1.5 border-t border-emerald-100 bg-white/40 mt-3">
              <TrendingUp className="h-3.5 w-3.5" /> 
              Realized Profit
            </CardContent>
          </Card>
        </div>


        {/* Main Borrowers Roster Section */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-headline font-black text-slate-800">Listahan ng mga Pautang</h3>
            <div className="flex items-center gap-2">
              <Button 
                onClick={() => setCollectTodayMode(!collectTodayMode)}
                className={cn(
                  "text-[10px] font-bold flex items-center gap-1 cursor-pointer rounded-xl px-2.5 py-1.5 h-auto border-none transition-colors",
                  collectTodayMode ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                )}
              >
                <Filter className="h-3.5 w-3.5" /> {collectTodayMode ? "All Borrowers" : "Collect Today"}
              </Button>
              <Button 
                onClick={() => setActiveDrawer('add_borrower')}
                className="text-[10px] font-bold flex items-center gap-1 cursor-pointer bg-slate-200/80 hover:bg-slate-200 text-slate-600 rounded-xl px-2.5 py-1.5 h-auto border-none transition-colors"
              >
                <UserPlus className="h-3.5 w-3.5" /> Debtor
              </Button>
              <Button 
                onClick={() => setActiveDrawer('add_capital')}
                className="text-[10px] font-bold flex items-center gap-1 cursor-pointer bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-xl px-2.5 py-1.5 h-auto border-none transition-colors"
              >
                <Banknote className="h-3.5 w-3.5" /> Capital
              </Button>
            </div>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <Input 
              id="five-six-search"
              name="fiveSixSearch"
              placeholder="Hanapin ang pangalan ng umutang..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 bg-white border-slate-200 rounded-xl text-xs"
            />
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white border border-slate-100 rounded-3xl">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" style={{ color: theme.primary }} />
              <p className="text-xs text-slate-400 mt-2 font-bold uppercase tracking-wider">Syncing Credit Registry...</p>
            </div>
          ) : filteredBorrowers.length === 0 ? (
            <div className="text-center py-16 bg-white border border-slate-200/60 rounded-3xl px-6">
              <Users className="h-10 w-10 mx-auto mb-3 text-slate-300" />
              <h4 className="text-sm font-black text-slate-800">Walang Nakita</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-normal">
                {searchQuery ? "Subukang ibahin ang pangalan na hinahanap." : "I-tap ang Add Debtor sa itaas para mag-setup ng bagong profile sa pautang ledger!"}
              </p>
            </div>
          ) : (
            <div className="grid gap-2.5">
              {filteredBorrowers.map((borrower) => (
                <BorrowerCard
                  key={borrower.id}
                  borrower={borrower}
                  theme={theme}
                  isSubmitting={isSubmitting}
                  handleApplyPenalty={handleApplyPenalty}
                  handleQuickCollect={handleQuickCollect}
                  setSelectedBorrower={setSelectedBorrower}
                  setActiveDrawer={setActiveDrawer}
                  setPayAmount={setPayAmount}
                  openLedger={openLedger}
                  setEditName={setEditName}
                  setEditPhone={setEditPhone}
                  setEditArea={setEditArea}
                  setEditLimit={setEditLimit}
                  setEditDailyDue={setEditDailyDue}
                />
              ))}
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
                  {activeDrawer === 'view_ledger' && <History className="h-4.5 w-4.5" />}
                  {activeDrawer === 'add_capital' && <Banknote className="h-4.5 w-4.5" />}
                  {activeDrawer === 'edit_borrower' && <Edit3 className="h-4.5 w-4.5" />}
                </div>
                <h4 className="font-headline font-black text-xs uppercase tracking-widest text-slate-800">
                  {activeDrawer === 'add_borrower' && "Setup Credit Borrower"}
                  {activeDrawer === 'record_loan' && "Mag-disburse ng Pautang"}
                  {activeDrawer === 'record_payment' && "Mag-rehistro ng Bayad"}
                  {activeDrawer === 'sms_alert' && "SMS Billing Assistant"}
                  {activeDrawer === 'view_ledger' && "Transaction Ledger"}
                  {activeDrawer === 'add_capital' && "Magdagdag ng Puhunan"}
                  {activeDrawer === 'edit_borrower' && "I-edit ang Detalye"}
                </h4>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => {
                  setActiveDrawer('none');
                  setLoanDateStr(new Date().toISOString().split('T')[0]);
                }} 
                className="h-8 w-8 rounded-full hover:bg-slate-200/60 cursor-pointer"
              >
                <X className="h-4 w-4 text-slate-400" />
              </Button>
            </div>

            {/* Drawer Content */}
            <div className="p-6 overflow-y-auto flex-1 pb-24">
              
              {/* 1. Add Borrower Form */}
              {activeDrawer === 'add_borrower' && (
                <form id="add-borrower-form" onSubmit={handleAddBorrower} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Pangalan ng Borrower</label>
                    <Input 
                      id="add-borrower-name"
                      name="newName"
                      type="text" 
                      required
                      placeholder="Hal. Maria Santos"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-300 text-slate-800 placeholder:text-slate-400"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Cellphone Number</label>
                      <Input 
                        id="add-borrower-phone"
                        name="newPhone"
                        type="text" 
                        required
                        placeholder="Hal. 09123456789"
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-300 text-slate-800 placeholder:text-slate-400"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Area / Route (Lugar)</label>
                      <Input 
                        id="add-borrower-area"
                        name="newArea"
                        type="text" 
                        placeholder="Hal. Brgy. Sta Cruz"
                        value={newArea}
                        onChange={(e) => setNewArea(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-300 text-slate-800 placeholder:text-slate-400"
                      />
                    </div>
                  </div>

                  <div className="space-y-4 pb-2 mt-4 border-t border-slate-100 pt-4">
                    {/* Date Picker Section */}
                    <div className="space-y-1.5 pb-2 border-b border-slate-100">
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Petsa ng Utang</label>
                      <Input
                        type="date"
                        value={loanDateStr}
                        onChange={(e) => setLoanDateStr(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-300"
                      />
                    </div>

                        {/* Principal & Interest */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Halaga ng Pautang (₱)</label>
                            <Input 
                              id="initial-loan-principal"
                              name="initialLoanPrincipal"
                              type="number" 
                              value={loanPrincipal}
                              onChange={(e) => {
                                setLoanPrincipal(e.target.value);
                                const amt = parseFloat(e.target.value) || 0;
                                if (interestMode === '20') {
                                  setLoanInterest((amt * 0.2).toFixed(0));
                                } else if (interestMode === '10') {
                                  setLoanInterest((amt * 0.1).toFixed(0));
                                }
                              }}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-300 text-slate-800"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Patubong Interes (₱)</label>
                            <Input 
                              id="initial-loan-interest"
                              name="initialLoanInterest"
                              type="number" 
                              readOnly={interestMode !== 'custom'}
                              value={loanInterest}
                              onChange={(e) => {
                                if (interestMode === 'custom') {
                                  setLoanInterest(e.target.value);
                                }
                              }}
                              className={cn(
                                "w-full border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-300 text-slate-800 transition-colors",
                                interestMode !== 'custom' ? "bg-slate-100 text-slate-500" : "bg-slate-50"
                              )}
                            />
                          </div>
                        </div>

                        {/* Interest Mode Buttons */}
                        <div className="space-y-2 pb-2">
                          <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Piliin ang Interes</label>
                          <div className="flex bg-slate-100/50 p-1 rounded-xl">
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => {
                                setInterestMode('20');
                                const amt = parseFloat(loanPrincipal) || 0;
                                setLoanInterest((amt * 0.2).toFixed(0));
                              }}
                              className={cn(
                                "flex-1 h-8 rounded-lg text-xs font-bold transition-all border-none cursor-pointer",
                                interestMode === '20' ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                              )}
                            >
                              20% (Standard)
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => {
                                setInterestMode('10');
                                const amt = parseFloat(loanPrincipal) || 0;
                                setLoanInterest((amt * 0.1).toFixed(0));
                              }}
                              className={cn(
                                "flex-1 h-8 rounded-lg text-xs font-bold transition-all border-none cursor-pointer",
                                interestMode === '10' ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                              )}
                            >
                              10%
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => setInterestMode('custom')}
                              className={cn(
                                "flex-1 h-8 rounded-lg text-xs font-bold transition-all border-none cursor-pointer",
                                interestMode === 'custom' ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                              )}
                            >
                              Custom
                            </Button>
                          </div>
                        </div>

                        {/* Schedule & Terms */}
                        <div className="space-y-2 pb-2">
                          <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Iskedyul ng Bayad</label>
                          <div className="flex bg-slate-100/50 p-1 rounded-xl">
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => setLoanSchedule('daily')}
                              className={cn(
                                "flex-1 h-8 rounded-lg text-xs font-bold transition-all border-none cursor-pointer",
                                loanSchedule === 'daily' ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                              )}
                            >
                              Araw-araw
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => setLoanSchedule('weekly')}
                              className={cn(
                                "flex-1 h-8 rounded-lg text-xs font-bold transition-all border-none cursor-pointer",
                                loanSchedule === 'weekly' ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                              )}
                            >
                              Lingguhan
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => setLoanSchedule('monthly')}
                              className={cn(
                                "flex-1 h-8 rounded-lg text-xs font-bold transition-all border-none cursor-pointer",
                                loanSchedule === 'monthly' ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                              )}
                            >
                              Buwanan
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => setLoanSchedule('custom')}
                              className={cn(
                                "flex-1 h-8 rounded-lg text-[10px] font-bold transition-all border-none cursor-pointer",
                                loanSchedule === 'custom' ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                              )}
                            >
                              Custom
                            </Button>
                          </div>
                        </div>

                        {loanSchedule === 'custom' && (
                          <div className="space-y-1.5 pb-2">
                            <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Ilang araw bago maningil?</label>
                            <Input 
                              id="initial-loan-interval-days"
                              name="loanIntervalDays"
                              type="number" 
                              placeholder="Hal. 3 (Tuwing ikatlong araw)"
                              value={loanIntervalDays}
                              onChange={(e) => setLoanIntervalDays(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-300 text-slate-800"
                            />
                          </div>
                        )}

                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Termino (Days)</label>
                          <Input 
                            id="initial-loan-term"
                            name="loanTermDays"
                            type="number" 
                            value={loanTermDays}
                            onChange={(e) => setLoanTermDays(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-300 text-slate-800"
                          />
                        </div>
                  </div>

                  <div className="pt-4 pb-2">
                    <Button 
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full h-12 text-white font-black rounded-2xl flex items-center justify-center text-xs border-none cursor-pointer"
                      style={{ backgroundColor: theme.primary }}
                    >
                      {isSubmitting ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : "I-save ang Borrower"}
                    </Button>
                  </div>
                </form>
              )}

              {/* 2. Record Loan Form */}
              {activeDrawer === 'record_loan' && (
                <form id="record-loan-form" onSubmit={handleRecordLoan} className="space-y-4">
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

                  <div className="space-y-2 pb-2">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Piliin ang Interes</label>
                    <div className="flex bg-slate-100/50 p-1 rounded-xl">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setInterestMode('20');
                          const amt = parseFloat(loanPrincipal) || 0;
                          setLoanInterest((amt * 0.2).toFixed(0));
                        }}
                        className={cn(
                          "flex-1 h-8 rounded-lg text-xs font-bold transition-all border-none cursor-pointer",
                          interestMode === '20' ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                        )}
                      >
                        20% (Standard)
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setInterestMode('10');
                          const amt = parseFloat(loanPrincipal) || 0;
                          setLoanInterest((amt * 0.1).toFixed(0));
                        }}
                        className={cn(
                          "flex-1 h-8 rounded-lg text-xs font-bold transition-all border-none cursor-pointer",
                          interestMode === '10' ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                        )}
                      >
                        10%
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setInterestMode('custom')}
                        className={cn(
                          "flex-1 h-8 rounded-lg text-xs font-bold transition-all border-none cursor-pointer",
                          interestMode === 'custom' ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                        )}
                      >
                        Custom Amount
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5 pb-2 border-b border-slate-100">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Petsa ng Utang</label>
                    <Input
                      type="date"
                      value={loanDateStr}
                      onChange={(e) => setLoanDateStr(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-300"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Halaga ng Pautang (₱)</label>
                      <Input 
                        id="loan-principal"
                        name="loanPrincipal"
                        type="number" 
                        required
                        value={loanPrincipal}
                        onChange={(e) => {
                          setLoanPrincipal(e.target.value);
                          const amt = parseFloat(e.target.value) || 0;
                          if (interestMode === '20') {
                            setLoanInterest((amt * 0.2).toFixed(0));
                          } else if (interestMode === '10') {
                            setLoanInterest((amt * 0.1).toFixed(0));
                          }
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-300 text-slate-800"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Patubong Interes (₱)</label>
                      <Input 
                        id="loan-interest"
                        name="loanInterest"
                        type="number" 
                        required
                        readOnly={interestMode !== 'custom'}
                        value={loanInterest}
                        onChange={(e) => {
                          if (interestMode === 'custom') {
                            setLoanInterest(e.target.value);
                          }
                        }}
                        className={cn(
                          "w-full border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-300 text-slate-800 transition-colors",
                          interestMode !== 'custom' ? "bg-slate-100 text-slate-500" : "bg-slate-50"
                        )}
                      />
                    </div>
                  </div>

                  <div className="space-y-2 pb-2">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Iskedyul ng Bayad</label>
                    <div className="flex bg-slate-100/50 p-1 rounded-xl">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setLoanSchedule('daily')}
                        className={cn(
                          "flex-1 h-8 rounded-lg text-xs font-bold transition-all border-none cursor-pointer",
                          loanSchedule === 'daily' ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                        )}
                      >
                        Araw-araw
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setLoanSchedule('weekly')}
                        className={cn(
                          "flex-1 h-8 rounded-lg text-xs font-bold transition-all border-none cursor-pointer",
                          loanSchedule === 'weekly' ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                        )}
                      >
                        Lingguhan
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setLoanSchedule('monthly')}
                        className={cn(
                          "flex-1 h-8 rounded-lg text-xs font-bold transition-all border-none cursor-pointer",
                          loanSchedule === 'monthly' ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                        )}
                      >
                        Buwanan
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setLoanSchedule('custom')}
                        className={cn(
                          "flex-1 h-8 rounded-lg text-[10px] font-bold transition-all border-none cursor-pointer",
                          loanSchedule === 'custom' ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                        )}
                      >
                        Custom
                      </Button>
                    </div>
                  </div>

                  {loanSchedule === 'custom' && (
                    <div className="space-y-1.5 pb-2">
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Ilang araw bago maningil?</label>
                      <Input 
                        id="loan-interval-days"
                        name="loanIntervalDays"
                        type="number" 
                        required
                        value={loanIntervalDays}
                        onChange={(e) => setLoanIntervalDays(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-300 text-slate-800"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                        {loanSchedule === 'daily' && "Arawang Singil (₱)"}
                        {loanSchedule === 'weekly' && "Bayad bawat Linggo (₱)"}
                        {loanSchedule === 'monthly' && "Bayad bawat Buwan (₱)"}
                        {loanSchedule === 'custom' && "Halagang Sisingilin (₱)"}
                      </label>
                      <Input 
                        id="loan-daily-due"
                        name="loanDailyDue"
                        type="number" 
                        required
                        value={loanDailyDue}
                        onChange={(e) => setLoanDailyDue(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-300 text-slate-800"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Termino (Days)</label>
                      <Input 
                        id="loan-term-days"
                        name="loanTermDays"
                        type="number" 
                        placeholder="Optional"
                        value={loanTermDays}
                        onChange={(e) => setLoanTermDays(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-300 text-slate-800"
                      />
                    </div>
                  </div>
                  <div className="pt-4 pb-2">
                    <Button 
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full h-12 text-white font-black rounded-2xl flex items-center justify-center text-xs border-none cursor-pointer"
                      style={{ backgroundColor: theme.primary }}
                    >
                      {isSubmitting ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : "I-disburse ang Pautang"}
                    </Button>
                  </div>
                </form>
              )}

              {/* 3. Receive Payment Form */}
              {activeDrawer === 'record_payment' && selectedBorrower && (
                <form id="record-payment-form" onSubmit={handleRecordPayment} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 font-bold">Magbabayad</label>
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex justify-between items-center text-xs">
                      <span className="font-extrabold text-slate-700">{selectedBorrower.name}</span>
                      <span className="font-black text-slate-400">Utang: ₱{(selectedBorrower.outstanding / 100).toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Halaga ng Bayad (₱)</label>
                    <Input 
                      id="payment-amount"
                      name="payAmount"
                      type="number" 
                      required
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-300 text-slate-800"
                    />
                  </div>

                  <DiscountInput 
                    discountType={discountType}
                    discountValue={discountValue}
                    onTypeChange={setDiscountType}
                    onValueChange={setDiscountValue}
                    subtotal={(parseFloat(payAmount) || 0) * 100}
                  />

                  <div className="pt-4 pb-2">
                    <Button 
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full h-12 text-white font-black rounded-2xl flex items-center justify-center text-xs border-none cursor-pointer"
                      style={{ backgroundColor: theme.secondary }}
                    >
                      {isSubmitting ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : "I-rehistro ang Bayad"}
                    </Button>
                  </div>
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

              {/* 5. Transaction Ledger View */}
              {activeDrawer === 'view_ledger' && selectedBorrower && (
                <div className="space-y-3">
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex justify-between items-center text-xs">
                    <span className="font-extrabold text-slate-700">{selectedBorrower.name}</span>
                    <span className="font-black" style={{ color: theme.primary }}>Utang: ₱{(selectedBorrower.outstanding / 100).toFixed(2)}</span>
                  </div>

                  {loadingLedger ? (
                    <div className="flex flex-col items-center justify-center py-10">
                      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                      <span className="text-[10px] font-bold text-slate-400 mt-2 uppercase">Loading Ledger...</span>
                    </div>
                  ) : ledgerHistory.length === 0 ? (
                    <div className="text-center py-10 bg-white border border-slate-100 rounded-2xl">
                      <History className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                      <span className="text-xs font-bold text-slate-500">Walang record ng transaksyon.</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {ledgerHistory.map((tx) => {
                        const amountPesos = (tx.amount / 100).toFixed(2);
                        const isPayment = tx.type === 'payment';
                        const isPenalty = tx.type === 'penalty';
                        
                        return (
                          <div key={tx.id} className="flex flex-col p-3 rounded-xl border border-slate-100 bg-white text-xs gap-2">
                            {editingTx?.id === tx.id ? (
                              <div className="flex flex-col gap-2">
                                <Input 
                                  value={editNote} 
                                  onChange={(e) => setEditNote(e.target.value)} 
                                  placeholder="Magdagdag o mag-edit ng note"
                                  className="h-8 text-xs bg-slate-50 border-slate-200"
                                />
                                <div className="flex justify-end gap-2">
                                  <Button 
                                    size="sm" 
                                    variant="ghost" 
                                    onClick={() => setEditingTx(null)}
                                    className="h-7 text-[10px] px-2 text-slate-500"
                                  >
                                    Cancel
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    onClick={() => handleEditSubmit(tx.id)}
                                    disabled={isSubmitting}
                                    className="h-7 text-[10px] px-2 bg-blue-600 hover:bg-blue-700 text-white"
                                  >
                                    <Save className="w-3 h-3 mr-1" /> Save
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex justify-between items-center">
                                  <div className="flex flex-col">
                                    <span className={cn(
                                      "font-black uppercase text-[10px] tracking-wider",
                                      isPayment ? "text-emerald-600" : isPenalty ? "text-red-500" : "text-blue-600"
                                    )}>
                                      {isPayment ? "Bayad" : isPenalty ? "Penalty" : "Pautang"}
                                    </span>
                                    <span className="text-slate-400 font-medium text-[9px] mt-0.5">
                                      {tx.timestamp?.toDate().toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    {tx.note && <span className="text-slate-500 text-[10px] mt-1">{tx.note}</span>}
                                  </div>
                                  <div className={cn(
                                    "font-headline font-black text-sm",
                                    isPayment ? "text-emerald-600" : "text-slate-700"
                                  )}>
                                    {isPayment ? "-" : "+"}₱{amountPesos}
                                  </div>
                                </div>
                                <div className="flex justify-end gap-1 mt-1 border-t border-slate-50 pt-2">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                    onClick={() => {
                                      setEditingTx(tx);
                                      setEditNote(tx.note || '');
                                    }}
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                    onClick={() => handleDeleteTx(tx)}
                                    disabled={isSubmitting}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* 6. Add Capital Form */}
              {activeDrawer === 'add_capital' && (
                <form id="add-capital-form" onSubmit={handleAddCapital} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Halaga ng Puhunan (₱)</label>
                    <Input 
                      id="add-capital-amount"
                      name="capitalAmount"
                      type="number" 
                      required
                      value={capitalAmount}
                      onChange={(e) => setCapitalAmount(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-emerald-300 text-slate-800"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Tala (Note)</label>
                    <Input 
                      id="add-capital-note"
                      name="capitalNote"
                      type="text" 
                      placeholder="Hal. Additional Capital"
                      value={capitalNote}
                      onChange={(e) => setCapitalNote(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-emerald-300 text-slate-800 placeholder:text-slate-400"
                    />
                  </div>

                  <div className="pt-2">
                    <Button 
                      type="submit" 
                      disabled={isSubmitting}
                      className="w-full h-12 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-sm transition-colors shadow-lg shadow-emerald-500/20"
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                      ) : (
                        "Idagdag sa Puhunan"
                      )}
                    </Button>
                  </div>
                </form>
              )}

              {/* 7. Edit Borrower Form */}
              {activeDrawer === 'edit_borrower' && selectedBorrower && (
                <form id="edit-borrower-form" onSubmit={handleEditBorrowerSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Pangalan</label>
                    <Input 
                      required
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-300 text-slate-800"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Mobile Number</label>
                    <Input 
                      required
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-300 text-slate-800"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Lugar / Area</label>
                    <Input 
                      value={editArea}
                      onChange={(e) => setEditArea(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-300 text-slate-800"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Credit Limit (₱)</label>
                    <Input 
                      type="number"
                      required
                      value={editLimit}
                      onChange={(e) => setEditLimit(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-300 text-slate-800"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Arawang Singil Target (₱)</label>
                    <Input 
                      type="number"
                      required
                      value={editDailyDue}
                      onChange={(e) => setEditDailyDue(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-300 text-slate-800"
                    />
                  </div>
                  <div className="pt-2">
                    <Button 
                      type="submit" 
                      disabled={isSubmitting}
                      className="w-full h-12 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-sm transition-colors shadow-lg"
                      style={{ backgroundColor: theme.primary }}
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                      ) : (
                        "I-save ang Pagbabago"
                      )}
                    </Button>
                  </div>
                </form>
              )}

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
