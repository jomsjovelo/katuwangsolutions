"use client";

import React, { useState, useEffect } from 'react';
import { 
  Wallet, TrendingUp, TrendingDown, PiggyBank, Target, 
  Plus, CalendarDays, Receipt, AlertCircle, ArrowRight, Settings, Trash2, Download
} from 'lucide-react';
import { useTenant } from '@/app/lib/tenant-context';
import { collection, onSnapshot, query, orderBy, doc, where } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useToast } from '@/hooks/use-toast';
import { 
  addBudgetTransaction, 
  addDebtRecord, 
  logDebtPayment, 
  editDebtRecord,
  deleteDebtRecord,
  addSavingsGoal,
  editSavingsGoal,
  deleteSavingsGoal,
  allocateToSavings,
  deleteBudgetTransaction,
  editBudgetTransaction,
  addBudgetEnvelope,
  deleteBudgetEnvelope,
  updateBudgetSettings,
  addAutoAllocationEnvelopes
} from '@/firebase/firestore/budget-actions';
import { BudgetTransaction, Debt, SavingsGoal, BudgetEnvelope } from '@/lib/schemas/budget';
import { Button } from '@/components/ui/button';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { IncomeModal } from './modals/income-modal';
import { ExpenseModal } from './modals/expense-modal';
import { DebtModal } from './modals/debt-modal';
import { PayDebtModal } from './modals/pay-debt-modal';
import { GoalModal } from './modals/goal-modal';
import { EnvelopeModal } from './modals/envelope-modal';
import { SettingsModal } from './modals/settings-modal';
import { WrapUpModal } from './modals/wrap-up-modal';
import { AllocationModal } from './modals/allocation-modal';
import { BillsModal } from './modals/bills-modal';
import { VerificationPrompt } from '@/components/common/verification-prompt';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type BudgetPersona = 'student' | 'worker' | 'freelancer' | 'business' | null;
export type CycleType = 'weekly' | '15-days' | 'monthly';

export function BudgetMoDashboard({ activeTab = 'home', onTabChange }: { activeTab?: string, onTabChange?: (tab: string) => void }) {
  const { currentTenant } = useTenant();
  const db = useFirestore();
  const { toast } = useToast();

  const [transactions, setTransactions] = useState<BudgetTransaction[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [envelopes, setEnvelopes] = useState<BudgetEnvelope[]>([]);
  const [masterBalance, setMasterBalance] = useState(0);

  // New states
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showDebtModal, setShowDebtModal] = useState(false);
  const [showPayDebtModal, setShowPayDebtModal] = useState<Debt | null>(null);
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [debtToDelete, setDebtToDelete] = useState<Debt | null>(null);
  
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [goalToDelete, setGoalToDelete] = useState<SavingsGoal | null>(null);
  const [showEnvelopeModal, setShowEnvelopeModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showBillsModal, setShowBillsModal] = useState(false);
  const [showAllocationPrompt, setShowAllocationPrompt] = useState<{amount: number} | null>(null);
  const [showWrapUpModal, setShowWrapUpModal] = useState(false);
  const [showHealthScoreInfo, setShowHealthScoreInfo] = useState(false);
  const [wrapUpSavingsAmount, setWrapUpSavingsAmount] = useState(0);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingTx, setEditingTx] = useState<BudgetTransaction | null>(null);

  const [txToDelete, setTxToDelete] = useState<BudgetTransaction | null>(null);
  const [envToDelete, setEnvToDelete] = useState<BudgetEnvelope | null>(null);

  // Transaction History States
  const [searchTerm, setSearchTerm] = useState('');
  const [txDateFilter, setTxDateFilter] = useState<'all' | 'today' | '7days' | '15days' | '30days'>('all');
  const [txLimit, setTxLimit] = useState(20);

  // Insights Date Filter States
  const [insightsRange, setInsightsRange] = useState<'cycle' | 'today' | 'last7' | 'last15' | 'last30' | 'custom'>('cycle');
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [customEndDate, setCustomEndDate] = useState(() => {
    const d = new Date();
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return end.toISOString().split('T')[0];
  });

  // Custom Category States
  const [incomeCategory, setIncomeCategory] = useState('Salary');
  const [expenseCategory, setExpenseCategory] = useState('Transportation / Pamasahe');

  // Settings & Personas
  const [persona, setPersona] = useState<BudgetPersona>('worker'); // temporary default before effect
  const [cycleType, setCycleType] = useState<CycleType>('monthly');
  const [paydayCycle, setPaydayCycle] = useState(15);
  const [secondPaydayCycle, setSecondPaydayCycle] = useState(30);
  const [isInitializing, setIsInitializing] = useState(true);

  // Safely wrap localStorage
  const safeGetStorage = (key: string) => {
    try { return localStorage.getItem(key); } catch { return null; }
  };
  const safeSetStorage = (key: string, value: string) => {
    try { localStorage.setItem(key, value); } catch {}
  };

  const { cycleStart, nextCycleStart, daysRemaining, fetchMinDate, previousCycleStart } = React.useMemo(() => {
    const now = new Date();
    let cStart = new Date(now.getFullYear(), now.getMonth(), paydayCycle);
    let nStart = new Date(now.getFullYear(), now.getMonth() + 1, paydayCycle);
    let dRemaining = 1;

    if (cycleType === 'weekly') {
      const dayOfWeek = now.getDay();
      const diff = (dayOfWeek >= paydayCycle) ? (dayOfWeek - paydayCycle) : (7 - (paydayCycle - dayOfWeek));
      cStart = new Date(now);
      cStart.setDate(now.getDate() - diff);
      cStart.setHours(0,0,0,0);
      
      nStart = new Date(cStart);
      nStart.setDate(nStart.getDate() + 7);
      
      dRemaining = 7 - diff;
      if (dRemaining === 0) dRemaining = 7;
    } else if (cycleType === '15-days') {
      const firstDay = Math.min(paydayCycle, secondPaydayCycle || 30);
      const secondDay = Math.max(paydayCycle, secondPaydayCycle || 30);
      const currentDay = now.getDate();
      
      if (currentDay < firstDay) {
        // Previous month's second cycle
        const prevMonthLastDay = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
        const prevSecondDay = Math.min(secondDay, prevMonthLastDay);
        cStart = new Date(now.getFullYear(), now.getMonth() - 1, prevSecondDay);
        nStart = new Date(now.getFullYear(), now.getMonth(), firstDay);
      } else if (currentDay >= firstDay && currentDay < secondDay) {
        // First cycle
        cStart = new Date(now.getFullYear(), now.getMonth(), firstDay);
        nStart = new Date(now.getFullYear(), now.getMonth(), secondDay);
      } else {
        // Second cycle
        const currentMonthLastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const actualSecondDay = Math.min(secondDay, currentMonthLastDay);
        cStart = new Date(now.getFullYear(), now.getMonth(), actualSecondDay);
        nStart = new Date(now.getFullYear(), now.getMonth() + 1, firstDay);
      }
      
      const todayAtMidnight = new Date(now);
      todayAtMidnight.setHours(0,0,0,0);
      dRemaining = Math.max(1, Math.round((nStart.getTime() - todayAtMidnight.getTime()) / (1000 * 60 * 60 * 24)));
    } else {
      if (now.getDate() < paydayCycle) {
        cStart = new Date(now.getFullYear(), now.getMonth() - 1, paydayCycle);
        nStart = new Date(now.getFullYear(), now.getMonth(), paydayCycle);
      }
      const currentDay = now.getDate();
      const currentMonthDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      if (currentDay < paydayCycle) {
        dRemaining = paydayCycle - currentDay;
      } else {
        dRemaining = (currentMonthDays - currentDay) + paydayCycle;
      }
    }

    const prevStart = new Date(cStart);
    if (cycleType === 'weekly') {
      prevStart.setDate(prevStart.getDate() - 7);
    } else if (cycleType === '15-days') {
      prevStart.setDate(prevStart.getDate() - 31);
    } else {
      prevStart.setMonth(prevStart.getMonth() - 1);
    }

    let fMinDate = new Date(prevStart);
    if (insightsRange === 'last30') {
      const d30 = new Date(); d30.setDate(d30.getDate() - 30); d30.setHours(0,0,0,0);
      if (d30 < fMinDate) fMinDate = d30;
    } else if (insightsRange === 'custom' && customStartDate) {
      const customStart = new Date(customStartDate); customStart.setHours(0,0,0,0);
      if (customStart < fMinDate) fMinDate = customStart;
    }
    
    // For "all time", we can safely fetch everything since year 2000
    if (txDateFilter === 'all') {
       fMinDate = new Date(2000, 0, 1); 
    }

    return { cycleStart: cStart, nextCycleStart: nStart, daysRemaining: dRemaining, fetchMinDate: fMinDate, previousCycleStart: prevStart };
  }, [cycleType, paydayCycle, secondPaydayCycle, insightsRange, customStartDate, txDateFilter]);

  useEffect(() => {
    if (!currentTenant?.id || !db) return;

    const unsubSettings = onSnapshot(doc(db, 'tenants', currentTenant.id, 'settings', 'budget'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.persona) setPersona(data.persona as BudgetPersona);
        if (data.cycleType) setCycleType(data.cycleType as CycleType);
        if (data.paydayCycle) setPaydayCycle(Number(data.paydayCycle));
        if (data.secondPaydayCycle) setSecondPaydayCycle(Number(data.secondPaydayCycle));
        // Default to worker/universal settings
        setPersona('worker');
        setCycleType(safeGetStorage('budgetSenseCycleType') as CycleType || 'monthly');
        setPaydayCycle(Number(safeGetStorage('budgetSensePayday') || 15));
        setSecondPaydayCycle(Number(safeGetStorage('budgetSenseSecondPayday') || 30));
      }
      setIsInitializing(false);
    });

    const masterUnsub = onSnapshot(doc(db, 'tenants', currentTenant.id, 'accounts', 'master-cash'), (docSnap: any) => {
      if (docSnap.exists()) {
        setMasterBalance(docSnap.data().balance || 0);
      }
    });

    const txUnsub = onSnapshot(
      query(
        collection(db, 'tenants', currentTenant.id, 'budget_transactions'), 
        where('createdAt', '>=', fetchMinDate),
        orderBy('createdAt', 'desc')
      ), 
      (snap) => {
        setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() }) as BudgetTransaction));
      }
    );

    const debtUnsub = onSnapshot(query(collection(db, 'tenants', currentTenant.id, 'budget_debts'), orderBy('createdAt', 'desc')), (snap) => {
      setDebts(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Debt));
    });

    const goalUnsub = onSnapshot(query(collection(db, 'tenants', currentTenant.id, 'budget_goals'), orderBy('createdAt', 'desc')), (snap) => {
      setGoals(snap.docs.map(d => ({ id: d.id, ...d.data() }) as SavingsGoal));
    });

    const envUnsub = onSnapshot(query(collection(db, 'tenants', currentTenant.id, 'budget_envelopes'), orderBy('createdAt', 'desc')), (snap) => {
      setEnvelopes(snap.docs.map(d => ({ id: d.id, ...d.data() }) as BudgetEnvelope));
    });

    return () => { unsubSettings(); masterUnsub(); txUnsub(); debtUnsub(); goalUnsub(); envUnsub(); };
  }, [currentTenant?.id, db, fetchMinDate.getTime()]);

  const cycleTransactions = transactions.filter(t => {
    if (!t.createdAt) return true;
    const tDate = t.createdAt.toDate ? t.createdAt.toDate() : new Date(t.createdAt);
    return tDate >= cycleStart;
  });

  // Derived metrics isolated to Current Cycle
  const totalIncome = cycleTransactions.filter(t => t.type === 'income').reduce((acc, t) => acc + (t.amountCentavos || 0), 0) / 100;
  const totalExpense = cycleTransactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + (t.amountCentavos || 0), 0) / 100;

  // Universal Split Ratios (50/30/20 Rule)
  const splitRatios = { needs: 0.5, wants: 0.3, savings: 0.2 };
  const splitLabels = { needs: 'Needs (50%)', wants: 'Wants (30%)', savings: 'Savings (20%)' };

  
  // Insights Data Separation
  const insightsTransactions = transactions.filter(t => {
    if (!t.createdAt) return true;
    const tDate = t.createdAt.toDate ? t.createdAt.toDate() : new Date(t.createdAt);
    
    if (insightsRange === 'cycle') {
      return tDate >= cycleStart;
    } else if (insightsRange === 'today') {
      const today = new Date();
      today.setHours(0,0,0,0);
      return tDate >= today;
    } else if (insightsRange === 'last7') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      d.setHours(0,0,0,0);
      return tDate >= d;
    } else if (insightsRange === 'last15') {
      const d = new Date();
      d.setDate(d.getDate() - 15);
      d.setHours(0,0,0,0);
      return tDate >= d;
    } else if (insightsRange === 'last30') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      d.setHours(0,0,0,0);
      return tDate >= d;
    } else if (insightsRange === 'custom') {
      const s = new Date(customStartDate);
      s.setHours(0,0,0,0);
      const e = new Date(customEndDate);
      e.setHours(23,59,59,999);
      return tDate >= s && tDate <= e;
    }
    return true;
  });

  const insightsIncome = insightsTransactions.filter(t => t.type === 'income').reduce((acc, t) => acc + (t.amountCentavos || 0), 0) / 100;
  const insightsExpense = insightsTransactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + (t.amountCentavos || 0), 0) / 100;

  // Smart Safe to Spend Calculation


  const urgentDebtCentavos = debts
    .filter(d => d.status === 'active')
    .filter(d => {
      if (d.isRecurring) {
        // If paid this cycle, don't deduct it again
        const paidThisCycle = cycleTransactions.some(t => 
          t.type === 'expense' && 
          t.category === `Payment: ${d.creditorName}`
        );
        return !paidThisCycle;
      }
      if (!d.dueDate) return true; // No due date = pay ASAP
      const due = new Date(d.dueDate);
      return due < nextCycleStart;
    })
    .reduce((acc, d) => acc + (d.remainingAmountCentavos || 0), 0);

  const availableCashAfterDebtsCentavos = Math.max(0, masterBalance - urgentDebtCentavos);
  const safeToSpend = availableCashAfterDebtsCentavos / 100 / daysRemaining;

  // Pacing Speedometer Math
  const daysElapsedInCycle = Math.max(1, Math.ceil((new Date().getTime() - cycleStart.getTime()) / (1000 * 3600 * 24)));
  const totalDaysInCycle = Math.max(1, daysRemaining + daysElapsedInCycle - 1); 

  const totalBudgetForCycle = (availableCashAfterDebtsCentavos / 100) + totalExpense;
  const idealDailySpend = totalBudgetForCycle / totalDaysInCycle;
  const actualDailySpend = totalExpense / daysElapsedInCycle;

  let pacingMessage = 'Perfect pace! Keep this up.';
  let pacingColor = 'bg-emerald-500';
  let pacingBg = 'bg-emerald-100';
  let pacingText = 'text-emerald-700';
  
  if (actualDailySpend > idealDailySpend * 1.2) {
    pacingMessage = 'Whoa! You are spending faster than recommended.';
    pacingColor = 'bg-rose-500';
    pacingBg = 'bg-rose-100';
    pacingText = 'text-rose-700';
  } else if (actualDailySpend > idealDailySpend) {
    pacingMessage = 'Careful, you are spending slightly above budget.';
    pacingColor = 'bg-amber-500';
    pacingBg = 'bg-amber-100';
    pacingText = 'text-amber-700';
  } else if (actualDailySpend < idealDailySpend * 0.5 && totalExpense > 0) {
    pacingMessage = 'Amazing! You are saving extremely well.';
    pacingColor = 'bg-indigo-500';
    pacingBg = 'bg-indigo-100';
    pacingText = 'text-indigo-700';
  }
  
  const pacingPercentage = Math.min(100, (actualDailySpend / (idealDailySpend || 1)) * 50);

  // Universal Financial Health Score (3 Clean Metrics: Savings Rate, Spending Pace, Debt Status)
  let healthScore = 200; // Base score
  const healthBreakdown: { label: string; desc: string; points: number; isNegative: boolean }[] = [];
  const addPoints = (label: string, desc: string, points: number) => {
    healthScore += points;
    healthBreakdown.push({ label, desc, points, isNegative: points < 0 });
  };
  
  const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0;
  
  // 1. Savings Rate Metric (Max +350 pts)
  if (savingsRate >= 30) addPoints('Savings Rate (>30%)', 'Outstanding savings discipline.', 350);
  else if (savingsRate >= 20) addPoints('Savings Rate (>20%)', 'Hit the golden 20% savings rule.', 250);
  else if (savingsRate >= 10) addPoints('Savings Rate (>10%)', 'Good savings progress this cycle.', 150);
  else if (savingsRate > 0) addPoints('Savings Rate (>0%)', 'Kept cash flow positive.', 75);
  else if (totalExpense > 0 && totalIncome === 0) addPoints('Uncovered Spending', 'Expenses logged with zero income this cycle.', -100);

  // 2. Spending Pace Metric (Max +350 pts)
  if (pacingColor === 'bg-indigo-500') addPoints('Spending Pace (Under Budget)', 'Spending significantly slower than daily budget.', 350);
  else if (pacingColor === 'bg-emerald-500') addPoints('Spending Pace (On Track)', 'Daily spending is balanced and on budget.', 250);
  else if (pacingColor === 'bg-amber-500') addPoints('Spending Pace (Slightly Fast)', 'Spending slightly above recommended daily pace.', 100);
  else if (pacingColor === 'bg-rose-500') addPoints('Spending Pace (Overspending)', 'Spending faster than recommended daily pace.', -150);

  // 3. Debt Status Metric (Max +300 pts)
  if (urgentDebtCentavos === 0) addPoints('Debt Status (Zero Urgent Debts)', 'No pending or overdue debt payments.', 300);
  else if (urgentDebtCentavos <= masterBalance) addPoints('Debt Status (Covered)', 'Urgent debts exist but master balance covers them.', 150);
  else addPoints('Debt Status (Overdue / Uncovered)', 'Urgent debts exceed available cash balance.', -200);

  healthScore = Math.max(0, Math.min(1000, healthScore));

  let healthMessage = 'Good standing.';
  if (healthScore >= 900) healthMessage = 'Financial Master!';
  else if (healthScore >= 750) healthMessage = 'Excellent habits.';
  else if (healthScore >= 500) healthMessage = 'On the right track.';
  else healthMessage = 'Needs attention.';

  // Friendly Bill Prediction (previousCycleStart handled securely above)
  const previousCycleTransactions = transactions.filter(t => {
    if (!t.createdAt) return false;
    const tDate = t.createdAt.toDate ? t.createdAt.toDate() : new Date(t.createdAt);
    return tDate >= previousCycleStart && tDate < cycleStart;
  });

  const expectedBills = ['Rent', 'Utilities', 'Internet', 'Electricity', 'Water', 'Insurance'];
  const missingBills = expectedBills.filter(bill => {
    const paidLastMonth = previousCycleTransactions.some(t => t.type === 'expense' && t.category.toLowerCase().includes(bill.toLowerCase()));
    const paidThisMonth = cycleTransactions.some(t => t.type === 'expense' && t.category.toLowerCase().includes(bill.toLowerCase()));
    return paidLastMonth && !paidThisMonth;
  });

  // Savings Projection Rate (Safeguarded against negative travel)
  const monthlySavingsRateCentavos = Math.max(0, cycleTransactions
    .filter(t => t.type === 'expense' && t.category === 'Savings Transfer')
    .reduce((acc, t) => acc + (t.amountCentavos || 0), 0));


  const formatMoney = (centavos: number) => `₱${(centavos / 100).toLocaleString(undefined, {minimumFractionDigits: 2})}`;
  const formatPesos = (pesos: number) => `₱${pesos.toLocaleString(undefined, {minimumFractionDigits: 2})}`;

  const cycleText = cycleType === 'weekly' 
    ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][paydayCycle]
    : `the ${paydayCycle}${[1, 21, 31].includes(paydayCycle) ? 'st' : [2, 22].includes(paydayCycle) ? 'nd' : [3, 23].includes(paydayCycle) ? 'rd' : 'th'}`;
  
  const exportCsvStatement = () => {
    if (!transactions.length) {
      toast({ title: 'No Data', description: 'No transactions found to export.' });
      return;
    }
    const headers = ['ID,Type,Amount (PHP),Category,Note,Date'];
    const rows = transactions.map(t => {
      const dateStr = t.createdAt ? (t.createdAt.toDate ? t.createdAt.toDate().toISOString() : new Date(t.createdAt).toISOString()) : '';
      return `"${t.id}","${t.type}",${(t.amountCentavos / 100).toFixed(2)},"${t.category || ''}","${(t.note || '').replace(/"/g, '""')}","${dateStr}"`;
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `BudgetMo_Statement_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: 'Statement Exported', description: 'CSV file downloaded successfully.' });
  };

  const handleConfirmAllocation = async (needsCentavos: number, wantsCentavos: number, savingsCentavos: number) => {
    if (!currentTenant?.id) return;
    await addAutoAllocationEnvelopes(currentTenant.id, needsCentavos, wantsCentavos, savingsCentavos);
    toast({ title: 'Salary Auto-Split Complete! 🎉', description: '50/30/20 budget envelopes created & updated.' });
  };

  const resetTerm = 'Payday';
  const allowanceTerm = 'Safe to Spend Today';

  const theme = {
    bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-600', textDark: 'text-emerald-700', textDarker: 'text-emerald-800', hoverBg: 'hover:bg-emerald-100', bgDarker: 'bg-emerald-100/50'
  };

  const handleIncomeSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentTenant?.id) return;
    
    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get('amount')) * 100;
    const category = formData.get('category') as string;
    const note = formData.get('note') as string;
    const date = formData.get('date') as string || undefined;

    try {
      setIsSubmitting(true);
      await addBudgetTransaction(currentTenant.id, 'income', amount, category, note, date);
      toast({ title: 'Income Logged', description: 'Your balance has been updated.' });
      setShowIncomeModal(false);

      if (category === 'Salary' || amount >= 500000) { // If it's salary or > 5000 pesos
        setShowAllocationPrompt({ amount });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExpenseSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentTenant?.id) return;
    
    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get('amount')) * 100;
    const category = formData.get('category') as string;
    const note = formData.get('note') as string;
    const date = formData.get('date') as string || undefined;

    if (masterBalance < amount) {
      toast({ title: 'Insufficient Funds', description: 'Expense exceeds available cash.', variant: 'destructive' });
      return;
    }

    try {
      setIsSubmitting(true);
      await addBudgetTransaction(currentTenant.id, 'expense', amount, category, note, date);
      toast({ title: 'Expense Logged', description: 'Your balance has been updated.' });
      setShowExpenseModal(false);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentTenant?.id || !editingTx?.id) return;
    
    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get('amount')) * 100;
    const category = formData.get('category') as string;
    const note = formData.get('note') as string;
    const date = formData.get('date') as string || undefined;

    try {
      setIsSubmitting(true);
      await editBudgetTransaction(currentTenant.id, editingTx.id, { amountCentavos: amount, category, note, date });
      toast({ title: 'Transaction Updated', description: 'Your balance has been adjusted.' });
      setEditingTx(null);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTx = async () => {
    if (!currentTenant?.id || !txToDelete?.id) return;
    try {
      setIsSubmitting(true);
      await deleteBudgetTransaction(currentTenant.id, txToDelete.id);
      toast({ title: 'Transaction Deleted', description: 'Your balance has been restored.' });
      setEditingTx(null);
      setTxToDelete(null);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (isInitializing || transactions.length === 0) return;
    
    const wrapUpKey = `budgetSenseWrapUp_${previousCycleStart.toISOString()}`;
    const hasWrappedUp = safeGetStorage(wrapUpKey);
    
    if (!hasWrappedUp) {
      const prevTx = transactions.filter(t => {
        if (!t.createdAt) return false;
        const tDate = t.createdAt.toDate ? t.createdAt.toDate() : new Date(t.createdAt);
        return tDate >= previousCycleStart && tDate < cycleStart;
      });

      if (prevTx.length > 0) {
        const prevIncome = prevTx.filter(t => t.type === 'income').reduce((acc, t) => acc + (t.amountCentavos || 0), 0) / 100;
        const prevExpense = prevTx.filter(t => t.type === 'expense').reduce((acc, t) => acc + (t.amountCentavos || 0), 0) / 100;
        
        const prevSavings = prevIncome - prevExpense;
        if (prevSavings > 0) {
          setWrapUpSavingsAmount(prevSavings);
          setShowWrapUpModal(true);
        } else {
          safeSetStorage(wrapUpKey, 'true');
        }
      } else {
        safeSetStorage(wrapUpKey, 'true');
      }
    }
  }, [transactions.length, previousCycleStart.toISOString(), cycleStart.toISOString(), isInitializing]);

  if (isInitializing) return null;

  return (
    <div className="h-full bg-slate-50 flex flex-col pb-24 overflow-y-auto">
      


      {/* HEADER BANNER - FOR DASHBOARD AND BENTA (WHICH ACTS AS INCOME LOG) */}
      {(activeTab === 'home' || activeTab === 'benta') && (
        <div className="bg-primary pt-6 pb-20 px-5 relative overflow-hidden">
          {/* Background decorations */}
          <div className="absolute -right-10 -top-10 bg-white/10 w-40 h-40 rounded-full blur-2xl" />
          <div className="absolute right-0 bottom-0 opacity-10">
            <Wallet className="w-48 h-48 -mr-12 -mb-12" />
          </div>

          <div className="relative z-10">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-2xl font-black text-white uppercase tracking-tighter">Budget Mo</h1>
                <p className="text-primary-foreground/80 text-xs">Clear cash flow, smart savings.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 rounded-xl" onClick={() => setShowSettingsModal(true)}>
                  <Settings className="h-5 w-5" />
                </Button>
                <div className="h-10 w-10 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-md border border-white/20 shadow-inner">
                  <Wallet className="h-5 w-5 text-white" />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-primary-foreground/80 text-[10px] font-black tracking-widest uppercase mb-1">Available Cash</p>
                <div className="text-4xl font-black text-white tracking-tighter">
                  {formatMoney(masterBalance)}
                </div>
              </div>

              {activeTab === 'home' && (
                <div className="flex gap-3">
                  <Button 
                    onClick={() => setShowIncomeModal(true)}
                    className="flex-1 bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-md rounded-xl font-bold active:scale-95 transition-all"
                  >
                    + Income
                  </Button>
                  <Button 
                    onClick={() => setShowExpenseModal(true)}
                    className="flex-1 bg-black/20 hover:bg-black/30 text-white border-0 backdrop-blur-md rounded-xl font-bold active:scale-95 transition-all"
                  >
                    - Expense
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DASHBOARD TAB (HOME) */}
      {activeTab === 'home' && (
        <div className="-mt-14 px-4 space-y-6 relative z-10">
          {/* Health Score */}
          <div onClick={() => setShowHealthScoreInfo(true)} className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-5 border border-slate-700 shadow-md relative overflow-hidden flex items-center justify-between cursor-pointer active:scale-[0.98] transition-transform">
            <div className="absolute right-0 top-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 blur-xl" />
            <div className="relative z-10">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                <Target className="h-3 w-3" /> Financial Health
              </h3>
              <p className="text-3xl font-black text-white tracking-tighter">{healthScore} <span className="text-sm text-slate-500 font-medium">/ 1000</span></p>
              <p className="text-xs text-emerald-400 font-bold mt-1">{healthMessage}</p>
            </div>
            <div className="relative z-10 h-16 w-16">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <PieChart>
                  <Pie
                    data={[
                      { value: healthScore },
                      { value: 1000 - healthScore }
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={20}
                    outerRadius={30}
                    startAngle={90}
                    endAngle={-270}
                    dataKey="value"
                    stroke="none"
                  >
                    <Cell fill={healthScore >= 750 ? '#10b981' : healthScore >= 500 ? '#f59e0b' : '#f43f5e'} />
                    <Cell fill="#334155" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Safe to Spend Today */}
          <div className={`${theme.bg} rounded-2xl p-5 border ${theme.border} shadow-sm relative overflow-hidden`}>
            <div className={`absolute right-0 top-0 w-24 h-24 ${theme.bgDarker} rounded-bl-full -mr-4 -mt-4`} />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2">
                <div className={`flex items-center gap-2 ${theme.text}`}>
                  <CalendarDays className="h-4 w-4" />
                  <h3 className="text-[10px] font-black uppercase tracking-widest">{allowanceTerm}</h3>
                </div>
              </div>
              <p className={`text-3xl font-black ${theme.textDark} tracking-tighter`}>{formatPesos(safeToSpend)}</p>
              <p className={`text-xs ${theme.text} opacity-80 mt-1 mb-3`}>Based on {daysRemaining} days left until your {resetTerm.toLowerCase()} ({cycleText}).</p>
              
              {/* Pacing Speedometer */}
              {totalBudgetForCycle > 0 && (
                <div className={`mt-4 pt-3 border-t ${theme.border} border-dashed space-y-1.5`}>
                  <div className="flex justify-between items-center">
                    <p className={`text-[10px] font-black uppercase tracking-widest ${theme.textDark}`}>Pacing</p>
                    <p className={`text-[10px] font-bold ${pacingText}`}>{pacingMessage}</p>
                  </div>
                  <div className={`h-2 w-full rounded-full ${pacingBg} overflow-hidden`}>
                    <div className={`h-full ${pacingColor} transition-all duration-1000 rounded-full`} style={{ width: `${pacingPercentage}%` }} />
                  </div>
                </div>
              )}
              {urgentDebtCentavos > 0 && (
                <div className={`bg-white/50 rounded-xl p-2.5 text-[10px] font-bold ${theme.textDarker} flex items-center gap-2`}>
                  <AlertCircle className="h-3 w-3 text-rose-500 shrink-0" />
                  <span>Smart Math: Deducted {formatMoney(urgentDebtCentavos)} of upcoming debts/bills before next payday! 🛡️</span>
                </div>
              )}
            </div>
          </div>

          {/* Upcoming Bills & Subscriptions Card */}
          <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[10px] font-black text-amber-800 uppercase tracking-widest flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5 text-amber-600" />
                Upcoming Bills & Subscriptions
              </h3>
              <Button
                onClick={() => setShowBillsModal(true)}
                size="sm"
                variant="ghost"
                className="h-6 text-[10px] font-bold text-amber-700 hover:bg-amber-100/60 rounded-lg px-2"
              >
                + Add Bill
              </Button>
            </div>
            
            {debts.filter(d => d.isRecurring).length === 0 ? (
              <p className="text-xs text-amber-700/80 font-medium">No recurring bills added yet. Add Meralco, Rent, Internet, etc.</p>
            ) : (
              <div className="space-y-2">
                {debts.filter(d => d.isRecurring).map(bill => (
                  <div key={bill.id} className="bg-white/80 p-2.5 rounded-xl border border-amber-200/50 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-xs text-slate-800">{bill.creditorName}</p>
                      <p className="text-[10px] text-slate-500 font-medium">{bill.dueDate ? `Due ${bill.dueDate}` : 'Monthly recurring'}</p>
                    </div>
                    <span className="font-black text-xs text-amber-800">{formatMoney(bill.totalAmountCentavos)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Smart Split (50/30/20) */}
          {totalIncome > 0 && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 shadow-sm animate-in slide-in-from-bottom-2">
              <h3 className="text-[10px] font-black text-indigo-800 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Target className="h-4 w-4" />
                Smart Split Guide
              </h3>
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[10px] font-bold text-indigo-600/80">{splitLabels.needs}</p>
                  <p className="font-black text-indigo-900">{formatPesos(totalIncome * splitRatios.needs)}</p>
                </div>
                {splitRatios.wants > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-indigo-600/80">{splitLabels.wants}</p>
                    <p className="font-black text-indigo-900">{formatPesos(totalIncome * splitRatios.wants)}</p>
                  </div>
                )}
                <div className="text-right">
                  <p className="text-[10px] font-bold text-indigo-600/80">{splitLabels.savings}</p>
                  <p className="font-black text-indigo-900">{formatPesos(totalIncome * splitRatios.savings)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Category Envelopes */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-black text-slate-800 flex items-center gap-2">
                <Wallet className="h-5 w-5 text-violet-500" />
                Category Budgets
              </h3>
              <Button variant="ghost" size="sm" className="h-8 text-violet-600 font-bold hover:bg-violet-50 rounded-xl" onClick={() => setShowEnvelopeModal(true)}>
                + Add
              </Button>
            </div>
            
            {envelopes.length === 0 ? (
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-center">
                <p className="text-xs text-slate-400 font-medium mb-1">No category budgets set.</p>
                <p className="text-[10px] text-slate-400">Set strict limits for categories like "Food" or "Shopping".</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {envelopes.map(env => {
                  const spent = cycleTransactions
                    .filter(t => t.type === 'expense' && t.category.toLowerCase() === env.category.toLowerCase())
                    .reduce((acc, t) => acc + (t.amountCentavos || 0), 0);
                  const limit = env.limitCentavos;
                  const remaining = Math.max(0, limit - spent);
                  const percent = Math.min(100, (spent / limit) * 100);
                  const isOver = spent > limit;
                  const envColor = isOver ? 'bg-rose-500' : percent > 80 ? 'bg-amber-500' : 'bg-violet-500';
                  const envBg = isOver ? 'bg-rose-100' : percent > 80 ? 'bg-amber-100' : 'bg-violet-100';
                  
                  return (
                    <div key={env.id} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm relative overflow-hidden group">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-500 rounded-full shrink-0" 
                        onClick={() => setEnvToDelete(env)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <div className="flex justify-between items-end mb-2 pr-4">
                        <div>
                          <p className="text-xs font-bold text-slate-600 mb-1">{env.category}</p>
                          <p className="font-black text-slate-800 tracking-tighter">{formatPesos(remaining / 100)} <span className="text-[10px] font-medium text-slate-400 tracking-normal">left of {formatPesos(limit / 100)}</span></p>
                        </div>
                      </div>
                      <div className={`h-1.5 w-full rounded-full ${envBg} overflow-hidden`}>
                        <div className={`h-full ${envColor} transition-all duration-1000 rounded-full`} style={{ width: `${percent}%` }} />
                      </div>
                      {isOver && <p className="text-[10px] font-bold text-rose-500 mt-2">Budget exceeded by {formatPesos((spent - limit) / 100)}!</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Friendly Bill Reminder */}
          {missingBills.length > 0 && (
            <div className="bg-sky-50 border border-sky-100 rounded-2xl p-4 flex gap-3 shadow-sm">
              <div className="bg-sky-100 text-sky-500 rounded-xl h-10 w-10 flex items-center justify-center shrink-0">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs font-black text-sky-800 uppercase tracking-widest mb-1">Friendly Reminder 💙</h4>
                <p className="text-xs text-sky-700/80 font-medium leading-relaxed">It looks like you haven't logged your {missingBills.join(', ')} payment yet this cycle. No rush, just keeping an eye out for you!</p>
              </div>
            </div>
          )}

          {/* Transaction History Filter Logic */}
          {(() => {
            let filteredTransactions = [...transactions];
            
            // 1. Date Filter
            if (txDateFilter !== 'all') {
              const nowTime = new Date().getTime();
              let msToSubtract = 0;
              if (txDateFilter === 'today') msToSubtract = 24 * 60 * 60 * 1000;
              else if (txDateFilter === '7days') msToSubtract = 7 * 24 * 60 * 60 * 1000;
              else if (txDateFilter === '15days') msToSubtract = 15 * 24 * 60 * 60 * 1000;
              else if (txDateFilter === '30days') msToSubtract = 30 * 24 * 60 * 60 * 1000;
              
              const cutoffTime = nowTime - msToSubtract;
              
              filteredTransactions = filteredTransactions.filter(tx => {
                if (!tx.createdAt) return false;
                const txDate = tx.createdAt.toDate ? tx.createdAt.toDate() : new Date(tx.createdAt);
                if (txDateFilter === 'today') {
                  // Today means same day, not just 24h ago
                  const todayStr = new Date().toDateString();
                  return txDate.toDateString() === todayStr;
                }
                return txDate.getTime() >= cutoffTime;
              });
            }

            // 2. Search Filter
            if (searchTerm.trim() !== '') {
              const q = searchTerm.toLowerCase();
              filteredTransactions = filteredTransactions.filter(tx => 
                tx.category.toLowerCase().includes(q) || 
                (tx.note && tx.note.toLowerCase().includes(q))
              );
            }

            const visibleTransactions = filteredTransactions.slice(0, txLimit);

            return (
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm min-h-[400px]">
                <div className="flex flex-col gap-4 mb-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Transaction History</h3>
                    <Button 
                      onClick={exportCsvStatement} 
                      size="sm" 
                      variant="outline" 
                      className="h-7 text-[11px] font-bold gap-1 rounded-lg text-slate-700 border-slate-200 hover:bg-slate-50"
                    >
                      <Download className="h-3 w-3" /> Export CSV
                    </Button>
                  </div>
                  
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-4 w-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <input 
                        type="text" 
                        placeholder="Search logs..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-primary transition-colors text-slate-700"
                      />
                    </div>
                    <select
                      value={txDateFilter}
                      onChange={(e) => setTxDateFilter(e.target.value as any)}
                      className="w-[110px] text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 outline-none focus:border-primary transition-colors"
                    >
                      <option value="all">All Time</option>
                      <option value="today">Today</option>
                      <option value="7days">Last 7 Days</option>
                      <option value="15days">Last 15 Days</option>
                      <option value="30days">Last 30 Days</option>
                    </select>
                  </div>
                </div>
                
                {filteredTransactions.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-slate-400 text-sm">
                    <Receipt className="h-12 w-12 text-slate-200 mb-3" />
                    {transactions.length === 0 ? "No transactions logged yet." : "No matching transactions found."}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {visibleTransactions.map(tx => (
                      <div key={tx.id} onClick={() => setEditingTx(tx)} className="flex justify-between items-center p-3 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer">
                        <div className="flex items-center gap-3">
                          <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                            tx.type === 'income' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                          }`}>
                            {tx.type === 'income' ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                          </div>
                          <div>
                            <p className="font-bold text-sm text-slate-800">{tx.category}</p>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{tx.note || 'No Note'}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`font-black tracking-tight ${tx.type === 'income' ? 'text-emerald-600' : 'text-slate-800'}`}>
                            {tx.type === 'income' ? '+' : '-'}{formatMoney(tx.amountCentavos)}
                          </p>
                          <p className="text-[10px] text-slate-400 font-medium">
                            {tx.createdAt?.toDate ? new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' }).format(tx.createdAt.toDate()) : 'Just now'}
                          </p>
                        </div>
                      </div>
                    ))}

                    {filteredTransactions.length > visibleTransactions.length && (
                      <div className="pt-4 flex justify-center">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => setTxLimit(prev => prev + 20)}
                          className="h-8 text-xs font-bold text-primary border-primary hover:bg-primary/5 rounded-full px-6"
                        >
                          Load More
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}



      {/* SAVINGS TAB (STOCK) */}
      {activeTab === 'stock' && (
        <div className="px-4 py-6 space-y-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Savings & Debts</h1>
            <PiggyBank className="h-6 w-6 text-primary" />
          </div>

          {/* Debt Manager */}
          <div className="bg-rose-50/50 rounded-2xl border border-rose-100 overflow-hidden">
            <div className="p-4 border-b border-rose-100 flex justify-between items-center bg-white">
              <h3 className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Personal Debts (Utang)</h3>
              <Button size="sm" variant="outline" className="h-7 text-xs text-rose-600 border-rose-200 hover:bg-rose-50" onClick={() => setShowDebtModal(true)}>
                + Add Debt
              </Button>
            </div>
            
            <div className="p-4">
              {debts.length === 0 ? (
                <div className="text-center text-sm text-slate-400 py-4">You have no active debts recorded. Nice!</div>
              ) : (
                <div className="space-y-3">
                  {debts.map(debt => (
                    <div key={debt.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h4 className="font-bold text-sm text-slate-800">{debt.creditorName}</h4>
                          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md mt-1 inline-block bg-rose-100 text-rose-700`}>
                            I Borrowed
                          </span>
                        </div>
                        <div className="flex gap-2 items-start">
                          <div className="text-right">
                            <p className="font-black text-lg text-slate-800">{formatMoney(debt.remainingAmountCentavos)}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Remaining</p>
                          </div>
                          <div className="flex flex-col gap-1 -mt-1 -mr-1">
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-400 hover:text-indigo-600" onClick={() => setEditingDebt(debt)}><Settings className="h-3 w-3" /></Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-400 hover:text-rose-600" onClick={() => setDebtToDelete(debt)}><Trash2 className="h-3 w-3" /></Button>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-rose-500 rounded-full transition-all"
                            style={{ width: `${Math.min(100, ((debt.totalAmountCentavos - debt.remainingAmountCentavos) / debt.totalAmountCentavos) * 100)}%` }}
                          />
                        </div>
                        <Button size="sm" variant="ghost" className="h-8 text-xs font-bold text-primary" onClick={() => setShowPayDebtModal(debt)}>
                          Pay
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Savings Goals */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-[10px] font-black text-primary uppercase tracking-widest">Savings Goals</h3>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs text-primary border-primary-100 hover:bg-primary-50" onClick={() => setShowGoalModal(true)}>
                  + Goal
                </Button>
                {goals.length > 0 && masterBalance > 0 && (
                  <Button size="sm" className="h-7 text-xs font-bold" onClick={() => setShowAllocationPrompt({amount: masterBalance})}>
                    Smart Allocate
                  </Button>
                )}
              </div>
            </div>
            
            <div className="p-4">
              {goals.length === 0 ? (
                <div className="text-center text-sm text-slate-400 py-4">No savings goals yet. Start dreaming!</div>
              ) : (
                <div className="space-y-4">
                  {goals.map(goal => {
                    const progress = Math.min(100, (goal.currentAmountCentavos / goal.targetAmountCentavos) * 100);
                    
                    let projectionText = "";
                    if (monthlySavingsRateCentavos > 0) {
                      const remainingCentavos = Math.max(0, goal.targetAmountCentavos - goal.currentAmountCentavos);
                      const monthsLeft = Math.ceil(remainingCentavos / monthlySavingsRateCentavos);
                      if (monthsLeft > 0) {
                        const targetDate = new Date();
                        targetDate.setMonth(targetDate.getMonth() + monthsLeft);
                        projectionText = `At your current rate, you could reach this by ${targetDate.toLocaleString('default', { month: 'short', year: 'numeric' })}! 🎯`;
                      } else {
                        projectionText = `Goal Reached! 🎉`;
                      }
                    } else {
                      projectionText = `Tip: Start allocating savings to see when you'll hit your goal!`;
                    }

                    return (
                      <div key={goal.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h4 className="font-bold text-sm text-slate-800">{goal.name}</h4>
                            <p className="text-xs text-slate-500 font-medium">{formatMoney(goal.currentAmountCentavos)} / {formatMoney(goal.targetAmountCentavos)}</p>
                          </div>
                          <div className="flex gap-2 items-start">
                            <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-black text-xs">
                              {Math.floor(progress)}%
                            </div>
                            <div className="flex flex-col gap-1 -mt-1 -mr-1">
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-400 hover:text-indigo-600" onClick={() => setEditingGoal(goal)}><Settings className="h-3 w-3" /></Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-400 hover:text-rose-600" onClick={() => setGoalToDelete(goal)}><Trash2 className="h-3 w-3" /></Button>
                            </div>
                          </div>
                        </div>
                        
                        <div className="w-full h-3 bg-slate-100 rounded-full mt-3 mb-2 overflow-hidden">
                          <div 
                            className="h-full bg-indigo-500 rounded-full transition-all duration-1000"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        
                        <p className="text-[10px] font-bold text-slate-400 mt-2">{projectionText}</p>
                        
                        {goal.currentAmountCentavos >= goal.targetAmountCentavos && (
                          <div className="absolute inset-0 bg-indigo-500/90 backdrop-blur-sm flex items-center justify-center text-white font-black tracking-widest uppercase">
                            Goal Reached! 🎉
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* INSIGHTS TAB (ULAT) */}
      {activeTab === 'ulat' && (
        <div className="px-4 py-6 space-y-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Insights</h1>
            <Target className="h-6 w-6 text-primary" />
          </div>

          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Date Range</h3>
              <select 
                value={insightsRange} 
                onChange={(e) => setInsightsRange(e.target.value as any)}
                className="text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2 outline-none focus:border-emerald-500"
              >
                <option value="cycle">Current Cycle</option>
                <option value="today">Today</option>
                <option value="last7">Last 7 Days</option>
                <option value="last15">Last 15 Days</option>
                <option value="last30">Last 30 Days</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>
            {insightsRange === 'custom' && (
              <div className="flex gap-2 animate-in slide-in-from-top-2">
                <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="flex-1 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2 outline-none focus:border-emerald-500" />
                <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="flex-1 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2 outline-none focus:border-emerald-500" />
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-widest mb-4">Cash Flow Overview</h3>
            
            <div className="flex items-center justify-between mb-6">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Income</p>
                <p className="text-xl font-black text-emerald-600">+{formatPesos(insightsIncome)}</p>
              </div>
              <div className="space-y-1 text-right">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Expenses</p>
                <p className="text-xl font-black text-rose-600">-{formatPesos(insightsExpense)}</p>
              </div>
            </div>

            <div className="w-full h-4 rounded-full overflow-hidden flex">
              <div 
                className="h-full bg-emerald-500 transition-all duration-1000" 
                style={{ width: `${insightsIncome === 0 && insightsExpense === 0 ? 50 : (insightsIncome / (insightsIncome + insightsExpense)) * 100}%` }}
              />
              <div 
                className="h-full bg-rose-500 transition-all duration-1000" 
                style={{ width: `${insightsIncome === 0 && insightsExpense === 0 ? 50 : (insightsExpense / (insightsIncome + insightsExpense)) * 100}%` }}
              />
            </div>
          </div>

          {/* Category Breakdown */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
              <PiggyBank className="h-4 w-4 text-rose-500" />
              Spending by Category
            </h3>
            
            {(() => {
              const expensesByCategory = insightsTransactions
                .filter(t => t.type === 'expense')
                .reduce((acc, t) => {
                  acc[t.category] = (acc[t.category] || 0) + (t.amountCentavos || 0);
                  return acc;
                }, {} as Record<string, number>);

              const categoryData = Object.entries(expensesByCategory)
                .map(([name, value]) => ({ name, value: value as number }))
                .sort((a, b) => b.value - a.value);

              const totalCategorized = categoryData.reduce((acc, curr) => acc + curr.value, 0);

              if (categoryData.length === 0) {
                return <p className="text-sm text-slate-400 text-center py-4">No expenses logged yet.</p>;
              }

              const COLORS = ['#f43f5e', '#f97316', '#eab308', '#6366f1', '#8b5cf6', '#d946ef', '#14b8a6', '#06b6d4'];

              return (
                <div className="space-y-4">
                  <div className="h-48 w-full -mt-2">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                      <PieChart>
                        <Pie
                          data={categoryData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={75}
                          paddingAngle={3}
                          dataKey="value"
                          stroke="none"
                        >
                          {categoryData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: number) => formatPesos(value / 100)}
                          contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)', padding: '12px' }}
                          itemStyle={{ color: '#1e293b', fontWeight: 'bold' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-2 gap-y-3 gap-x-2">
                    {categoryData.map((cat, i) => {
                      const percentage = totalCategorized > 0 ? (cat.value / totalCategorized) * 100 : 0;
                      return (
                        <div key={cat.name} className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold text-slate-700 truncate" title={cat.name}>{cat.name}</p>
                            <p className="text-[10px] text-slate-500 font-medium">{Math.round(percentage)}% - {formatPesos(cat.value / 100)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Savings Health */}
          <div className="bg-emerald-50 rounded-2xl p-5 border border-emerald-100 shadow-sm">
             <h3 className="text-[10px] font-black text-emerald-800 uppercase tracking-widest mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Savings Health
            </h3>
            {(() => {
               if (totalIncome === 0) return <p className="text-sm text-emerald-600/70">Log some income to see your savings rate!</p>;
               const savingsRate = ((totalIncome - totalExpense) / totalIncome) * 100;
               let message = "";
               if (savingsRate >= 20) message = "Excellent! You're saving a highly recommended 20%+ of your income.";
               else if (savingsRate > 0) message = "Good start! You're keeping your expenses below your income.";
               else message = "Warning: Your expenses currently exceed your logged income.";

               return (
                 <div>
                   <div className="flex items-end gap-2 mb-2">
                     <span className="text-3xl font-black text-emerald-700 tracking-tighter">{savingsRate.toFixed(1)}%</span>
                     <span className="text-xs font-bold text-emerald-600/70 mb-1.5 uppercase tracking-widest">Savings Rate</span>
                   </div>
                   <p className="text-xs text-emerald-700/80 font-medium leading-relaxed">{message}</p>
                 </div>
               )
            })()}
          </div>
        </div>
      )}

      {showAllocationPrompt && goals.length > 0 && (
        <div className="fixed inset-x-4 bottom-24 z-50 bg-gradient-to-r from-amber-400 to-amber-500 p-5 rounded-[24px] shadow-md text-white animate-in slide-in-from-top-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-black text-lg mb-1 flex items-center gap-2"><Target className="h-5 w-5"/> Smart Allocation</h3>
              <p className="text-sm font-medium mb-3">You just logged {formatMoney(showAllocationPrompt.amount)}. Want to save 20% ({formatMoney(showAllocationPrompt.amount * 0.2)}) straight to your "{goals[0].name}" goal?</p>
              <div className="flex gap-2">
                <Button size="sm" className="bg-white text-amber-600 font-black rounded-xl" onClick={async () => {
                  if(!currentTenant?.id || !goals[0]?.id) return;
                  await allocateToSavings(currentTenant.id, goals[0].id, showAllocationPrompt.amount * 0.2);
                  toast({title: 'Savings Boosted!', description: 'You successfully allocated 20% to your savings.'});
                  setShowAllocationPrompt(null);
                }}>Save {formatMoney(showAllocationPrompt.amount * 0.2)}</Button>
                <Button size="sm" variant="ghost" className="text-white hover:bg-black/10 rounded-xl" onClick={() => setShowAllocationPrompt(null)}>Skip for now</Button>
              </div>
            </div>
          </div>
        </div>
      )}


      <VerificationPrompt
        open={!!txToDelete}
        onOpenChange={(open) => !open && setTxToDelete(null)}
        title="Delete Transaction?"
        description="Are you sure you want to delete this transaction? This action will reverse its effect on your balance."
        onConfirm={handleDeleteTx}
        confirmText="Delete"
        destructive={true}
      />

      <VerificationPrompt
        open={!!envToDelete}
        onOpenChange={(open) => !open && setEnvToDelete(null)}
        title="Delete Envelope?"
        description={`Are you sure you want to delete the ${envToDelete?.category} envelope? This will NOT delete past transactions, but will remove the budget limit.`}
        onConfirm={async () => {
          if (currentTenant?.id && envToDelete?.id) {
            await (await import('@/firebase/firestore/budget-actions')).deleteBudgetEnvelope(currentTenant.id, envToDelete.id);
            setEnvToDelete(null);
          }
        }}
        confirmText="Delete"
        destructive={true}
        verificationString="DELETE"
      />

      {/* Basic HTML Modals for brevity in MVP */}
      <IncomeModal 
        isOpen={showIncomeModal} 
        onClose={() => setShowIncomeModal(false)} 
        tenantId={currentTenant?.id || ''} 
        persona={persona} 
        onAllocationPrompt={(data) => setShowAllocationPrompt(data)} 
      />

      <ExpenseModal 
        isOpen={showExpenseModal} 
        onClose={() => setShowExpenseModal(false)} 
        tenantId={currentTenant?.id || ''} 
        persona={persona} 
        envelopes={envelopes} 
        masterBalance={masterBalance} 
      />

      {editingTx && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <form onSubmit={handleEditSubmit} className="bg-white p-6 rounded-[32px] w-full max-w-sm shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-black text-xl">Edit Transaction</h3>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-rose-500 hover:bg-rose-50 rounded-full" onClick={() => setTxToDelete(editingTx)} disabled={isSubmitting}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <input required name="amount" type="number" step="0.01" defaultValue={(editingTx.amountCentavos / 100).toString()} placeholder="Amount (₱)" className={`w-full bg-slate-50 p-4 rounded-2xl mb-3 font-medium outline-none border border-slate-100 ${editingTx.type === 'income' ? 'focus:border-emerald-500' : 'focus:border-rose-500'}`} />
            <input required name="category" defaultValue={editingTx.category} placeholder="Category" className={`w-full bg-slate-50 p-4 rounded-2xl mb-3 font-medium outline-none border border-slate-100 ${editingTx.type === 'income' ? 'focus:border-emerald-500' : 'focus:border-rose-500'}`} />
            <input name="date" type="date" defaultValue={editingTx.createdAt?.toDate ? editingTx.createdAt.toDate().toISOString().split('T')[0] : ''} className={`w-full bg-slate-50 p-4 rounded-2xl mb-3 font-medium outline-none border border-slate-100 ${editingTx.type === 'income' ? 'focus:border-emerald-500' : 'focus:border-rose-500'} text-slate-500`} />
            <textarea required name="note" defaultValue={editingTx.note} placeholder="Note" className={`w-full bg-slate-50 p-4 rounded-2xl mb-4 font-medium outline-none border border-slate-100 ${editingTx.type === 'income' ? 'focus:border-emerald-500' : 'focus:border-rose-500'} h-24 resize-none`} />
            <div className="flex gap-2">
              <Button type="button" disabled={isSubmitting} variant="ghost" onClick={() => setEditingTx(null)} className="flex-1 rounded-xl">Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className={`flex-1 text-white rounded-xl font-bold ${editingTx.type === 'income' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-rose-500 hover:bg-rose-600'}`}>Update</Button>
            </div>
          </form>
        </div>
      )}

      <DebtModal 
        isOpen={showDebtModal} 
        onClose={() => setShowDebtModal(false)} 
        tenantId={currentTenant?.id || ''} 
      />

      <GoalModal 
        isOpen={showGoalModal} 
        onClose={() => setShowGoalModal(false)} 
        tenantId={currentTenant?.id || ''} 
        persona={persona} 
      />

      <EnvelopeModal 
        isOpen={showEnvelopeModal} 
        onClose={() => setShowEnvelopeModal(false)} 
        tenantId={currentTenant?.id || ''} 
      />

      <SettingsModal 
        isOpen={showSettingsModal} 
        onClose={() => setShowSettingsModal(false)} 
        persona={persona} 
        setPersona={setPersona} 
        cycleType={cycleType} 
        setCycleType={setCycleType} 
        paydayCycle={paydayCycle} 
        setPaydayCycle={setPaydayCycle} 
        secondPaydayCycle={secondPaydayCycle} 
        setSecondPaydayCycle={setSecondPaydayCycle} 
      />

      <WrapUpModal 
        isOpen={showWrapUpModal} 
        onClose={() => setShowWrapUpModal(false)} 
        tenantId={currentTenant?.id || ''} 
        goals={goals} 
        wrapUpSavingsAmount={wrapUpSavingsAmount} 
      />
      {showHealthScoreInfo && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-[32px] w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-300">
            <h3 className="font-black text-xl mb-2 flex items-center gap-2">
              <Target className="h-5 w-5 text-slate-800" /> Financial Health
            </h3>
            <p className="text-sm text-slate-500 mb-4">Your score is calculated based on your habits this cycle. Max score is 1000.</p>
            
            <div className="space-y-3 mb-6">
              <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div>
                  <div className="text-xs font-bold text-slate-600">Base Score</div>
                  <div className="text-[10px] text-slate-400">Starting score for everyone.</div>
                </div>
                <span className="text-sm font-black text-slate-800">500</span>
              </div>
              {healthBreakdown.map((item, i) => (
                <div key={i} className={`flex justify-between items-center p-3 rounded-xl border ${item.isNegative ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-100'}`}>
                  <div>
                    <div className={`text-xs font-bold ${item.isNegative ? 'text-rose-600' : 'text-slate-600'}`}>{item.label}</div>
                    <div className={`text-[10px] mt-0.5 ${item.isNegative ? 'text-rose-500/80' : 'text-slate-400'}`}>{item.desc}</div>
                  </div>
                  <span className={`text-sm font-black shrink-0 ml-2 ${item.isNegative ? 'text-rose-600' : 'text-emerald-600'}`}>{item.points > 0 ? `+${item.points}` : item.points}</span>
                </div>
              ))}
            </div>
            
            <Button className="w-full bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold" onClick={() => setShowHealthScoreInfo(false)}>
              Got it
            </Button>
          </div>
        </div>
      )}

      <PayDebtModal 
        debt={showPayDebtModal} 
        onClose={() => setShowPayDebtModal(null)} 
        tenantId={currentTenant?.id || ''} 
      />

      {editingDebt && (
        <Dialog open={!!editingDebt} onOpenChange={(open) => !open && setEditingDebt(null)}>
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle>Edit Debt Record</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-sm text-slate-500">Update creditor name.</p>
              <div className="space-y-2">
                <Label>Creditor Name</Label>
                <Input
                  type="text"
                  id="editDebtCreditorName"
                  defaultValue={editingDebt.creditorName}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingDebt(null)}>Cancel</Button>
              <Button 
                onClick={async () => {
                  const input = document.getElementById('editDebtCreditorName') as HTMLInputElement;
                  const val = input?.value;
                  if (!val || !currentTenant?.id || !editingDebt?.id) return;
                  setIsSubmitting(true);
                  try {
                    await editDebtRecord(currentTenant.id, editingDebt.id, { creditorName: val });
                    toast({ title: 'Debt Updated' });
                    setEditingDebt(null);
                  } catch (e: any) {
                    toast({ title: 'Error', description: e.message, variant: 'destructive' });
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                disabled={isSubmitting}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                Update
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {debtToDelete && (
        <VerificationPrompt
          title="Delete Debt Record?"
          description={`Are you sure you want to delete the debt for ${debtToDelete.creditorName}? This action cannot be undone.`}
          confirmText="Yes, Delete"
          open={true}
          onOpenChange={(open) => !open && setDebtToDelete(null)}
          onConfirm={async () => {
            setIsSubmitting(true);
            try {
              await deleteDebtRecord(currentTenant!.id, debtToDelete.id!);
              toast({ title: 'Debt Deleted' });
              setDebtToDelete(null);
            } catch (e: any) {
              toast({ title: 'Error', description: e.message, variant: 'destructive' });
            } finally {
              setIsSubmitting(false);
            }
          }}
        />
      )}

      {editingGoal && (
        <Dialog open={!!editingGoal} onOpenChange={(open) => !open && setEditingGoal(null)}>
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle>Edit Savings Goal</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-sm text-slate-500">Update goal name.</p>
              <div className="space-y-2">
                <Label>Goal Name</Label>
                <Input
                  type="text"
                  id="editGoalName"
                  defaultValue={editingGoal.name}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingGoal(null)}>Cancel</Button>
              <Button 
                onClick={async () => {
                  const input = document.getElementById('editGoalName') as HTMLInputElement;
                  const val = input?.value;
                  if (!val || !currentTenant?.id || !editingGoal?.id) return;
                  setIsSubmitting(true);
                  try {
                    await editSavingsGoal(currentTenant.id, editingGoal.id, { name: val });
                    toast({ title: 'Goal Updated' });
                    setEditingGoal(null);
                  } catch (e: any) {
                    toast({ title: 'Error', description: e.message, variant: 'destructive' });
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                disabled={isSubmitting}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                Update
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {goalToDelete && (
        <VerificationPrompt
          title="Delete Savings Goal?"
          description={`Are you sure you want to delete the goal "${goalToDelete.name}"? This will not deduct from your cash, only remove the goal.`}
          confirmText="Yes, Delete"
          open={true}
          onOpenChange={(open) => !open && setGoalToDelete(null)}
          onConfirm={async () => {
            setIsSubmitting(true);
            try {
              await deleteSavingsGoal(currentTenant!.id, goalToDelete.id!);
              toast({ title: 'Goal Deleted' });
              setGoalToDelete(null);
            } catch (e: any) {
              toast({ title: 'Error', description: e.message, variant: 'destructive' });
            } finally {
              setIsSubmitting(false);
            }
          }}
        />
      )}

      {/* Allocation Modal for Salary Auto-Split */}
      {showAllocationPrompt && (
        <AllocationModal
          isOpen={true}
          onClose={() => setShowAllocationPrompt(null)}
          incomeAmountCentavos={showAllocationPrompt.amount}
          onConfirmAllocation={handleConfirmAllocation}
        />
      )}

      {/* Bills Modal for Recurring Monthly Bills */}
      <BillsModal
        isOpen={showBillsModal}
        onClose={() => setShowBillsModal(false)}
        tenantId={currentTenant?.id || ''}
      />
    </div>
  );
}
