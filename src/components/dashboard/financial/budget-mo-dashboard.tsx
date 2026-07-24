"use client";

import React, { useState, useEffect } from 'react';
import { 
  Wallet, TrendingUp, TrendingDown, PiggyBank, Target, 
  Plus, CalendarDays, Receipt, AlertCircle, ArrowRight, Settings, Trash2, Download, Zap, Printer, Sparkles, Trophy
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
  addAutoAllocationEnvelopes,
  updateBudgetPresets,
  syncOfflineBudgetQueue
} from '@/firebase/firestore/budget-actions';
import { getQueuedTransactions } from '@/lib/offline-budget-queue';
import { BudgetTransaction, Debt, SavingsGoal, BudgetEnvelope, BudgetPreset } from '@/lib/schemas/budget';
import { Button } from '@/components/ui/button';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
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
import { PresetModal } from './modals/preset-modal';
import { DepositGoalModal } from './modals/deposit-goal-modal';
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
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [depositGoalModal, setDepositGoalModal] = useState<SavingsGoal | null>(null);
  const [debtFilter, setDebtFilter] = useState<'all' | 'i_owe' | 'owed_to_me'>('all');
  
  const [ipon52Week, setIpon52Week] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('budgetSense52WeekProgress');
      return saved ? parseInt(saved, 10) : 12;
    } catch {
      return 12;
    }
  });

  const [iponWeeklyAmount, setIponWeeklyAmount] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('budgetSense52WeekAmount');
      return saved ? parseInt(saved, 10) : 50;
    } catch {
      return 50;
    }
  });

  const [coffeeStreak, setCoffeeStreak] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('budgetSenseCoffeeStreak');
      return saved ? parseInt(saved, 10) : 18;
    } catch {
      return 18;
    }
  });

  const [habitDailyAmount, setHabitDailyAmount] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('budgetSenseHabitAmount');
      return saved ? parseInt(saved, 10) : 120;
    } catch {
      return 120;
    }
  });

  const [habitName, setHabitName] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('budgetSenseHabitName');
      return saved || '30-Day Coffee Limit';
    } catch {
      return '30-Day Coffee Limit';
    }
  });

  const [showCustomizeIponModal, setShowCustomizeIponModal] = useState<boolean>(false);
  const [txTypeFilter, setTxTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [showAuto503020Modal, setShowAuto503020Modal] = useState<boolean>(false);

  const [showAllocationPrompt, setShowAllocationPrompt] = useState<{amount: number} | null>(null);
  
  const [presets, setPresets] = useState<BudgetPreset[]>(() => {
    try {
      const saved = localStorage.getItem('budgetSensePresets');
      return saved ? JSON.parse(saved) : [
        { id: 'p1', icon: '🚌', title: 'Pamasahe', amountCentavos: 2000, category: 'Transportation', type: 'expense' },
        { id: 'p2', icon: '🍱', title: 'Lunch', amountCentavos: 8000, category: 'Food', type: 'expense' },
        { id: 'p3', icon: '☕', title: 'Kape', amountCentavos: 12000, category: 'Food', type: 'expense' },
        { id: 'p4', icon: '📱', title: 'Load', amountCentavos: 9900, category: 'Utilities', type: 'expense' },
      ];
    } catch {
      return [];
    }
  });
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

  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);

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
      } else {
        // Fallback to localStorage or defaults if no Firestore settings document exists yet
        setPersona((safeGetStorage('budgetSensePersona') as BudgetPersona) || 'worker');
        setCycleType((safeGetStorage('budgetSenseCycleType') as CycleType) || 'monthly');
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

    const presetsUnsub = onSnapshot(doc(db, 'tenants', currentTenant.id, 'settings', 'budget_presets'), (docSnap) => {
      if (docSnap.exists() && Array.isArray(docSnap.data().items)) {
        setPresets(docSnap.data().items);
      }
    });

    return () => { unsubSettings(); masterUnsub(); txUnsub(); debtUnsub(); goalUnsub(); envUnsub(); presetsUnsub(); };
  }, [currentTenant?.id, db, fetchMinDate.getTime()]);

  // Offline Queue Auto-Sync Engine
  useEffect(() => {
    if (!currentTenant?.id) return;

    const refreshQueueStatus = async () => {
      const items = await getQueuedTransactions(currentTenant.id);
      setOfflineQueueCount(items.length);
    };

    refreshQueueStatus();

    const handleOnline = async () => {
      setIsOffline(false);
      if (currentTenant?.id) {
        toast({ title: '📶 Network Restored', description: 'Syncing offline transactions...' });
        const synced = await syncOfflineBudgetQueue(currentTenant.id);
        if (synced > 0) {
          toast({ title: '🎉 Sync Complete', description: `Successfully synced ${synced} offline transaction(s)!` });
        }
        refreshQueueStatus();
      }
    };

    const handleOffline = () => {
      setIsOffline(true);
      toast({ title: '📶 Offline Mode Active', description: 'Transactions will be queued locally and auto-synced when back online.', variant: 'destructive' });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [currentTenant?.id, toast]);

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
  const safeToSpend = availableCashAfterDebtsCentavos / 100 / Math.max(1, daysRemaining);

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

  const printPdfStatement = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Budget Mo Statement - ${new Date().toISOString().split('T')[0]}</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; padding: 32px; color: #1e293b; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 24px; }
            .title { font-size: 24px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.5px; color: #0f172a; }
            .subtitle { font-size: 12px; color: #64748b; font-weight: 600; }
            .summary-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 32px; }
            .card { background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 12px; }
            .card-title { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
            .card-value { font-size: 20px; font-weight: 900; color: #0f172a; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th { text-align: left; font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b; padding: 10px; border-bottom: 2px solid #e2e8f0; }
            td { font-size: 12px; padding: 12px 10px; border-bottom: 1px solid #f1f5f9; }
            .income { color: #059669; font-weight: 700; }
            .expense { color: #dc2626; font-weight: 700; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="title">Budget Mo Statement</div>
              <div class="subtitle">Personal & MSME Financial Report • ${new Date().toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
            </div>
            <div style="font-size: 12px; font-weight: 800; color: #059669;">Katuwang Solutions</div>
          </div>

          <div class="summary-cards">
            <div class="card">
              <div class="card-title">Available Cash</div>
              <div class="card-value">₱${(masterBalance / 100).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
            </div>
            <div class="card">
              <div class="card-title">Cycle Income</div>
              <div class="card-value" style="color: #059669;">+₱${totalIncome.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
            </div>
            <div class="card">
              <div class="card-title">Cycle Expenses</div>
              <div class="card-value" style="color: #dc2626;">-₱${totalExpense.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
            </div>
          </div>

          <div style="font-size: 14px; font-weight: 800; margin-bottom: 8px;">Transaction Activity</div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Category</th>
                <th>Note</th>
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${transactions.map(t => `
                <tr>
                  <td>${t.createdAt?.toDate ? new Date(t.createdAt.toDate()).toLocaleDateString('en-PH') : 'Recent'}</td>
                  <td><span class="${t.type}">${t.type.toUpperCase()}</span></td>
                  <td><strong>${t.category}</strong></td>
                  <td>${t.note || '-'}</td>
                  <td style="text-align: right;" class="${t.type}">${t.type === 'income' ? '+' : '-'}₱${(t.amountCentavos / 100).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handleSavePresets = async (newPresets: BudgetPreset[]) => {
    setPresets(newPresets);
    try { localStorage.setItem('budgetSensePresets', JSON.stringify(newPresets)); } catch {}
    if (currentTenant?.id) {
      await updateBudgetPresets(currentTenant.id, newPresets);
    }
  };

  const handleQuickLogPreset = async (preset: BudgetPreset) => {
    if (!currentTenant?.id) return;
    if (masterBalance < preset.amountCentavos && preset.type === 'expense') {
      toast({ title: 'Insufficient Funds', description: 'Available cash is lower than preset amount.', variant: 'destructive' });
      return;
    }
    try {
      await addBudgetTransaction(currentTenant.id, preset.type, preset.amountCentavos, preset.category, `Quick Log: ${preset.title}`);
      toast({ title: `${preset.icon || '⚡'} Logged!`, description: `${preset.title} (₱${(preset.amountCentavos / 100).toLocaleString()}) recorded.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const uniqueCategories = Array.from(new Set(transactions.map(t => t.category).filter(Boolean)));
  const uniqueNotes = Array.from(new Set(transactions.map(t => t.note).filter(Boolean)));

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
      
      {/* Autocomplete Datalists for Smart Memory */}
      <datalist id="category-history-list">
        {uniqueCategories.map(cat => <option key={cat} value={cat} />)}
      </datalist>
      <datalist id="note-history-list">
        {uniqueNotes.map(note => <option key={note} value={note} />)}
      </datalist>

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
              <div className="flex items-center gap-2">
                {(isOffline || offlineQueueCount > 0) && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (currentTenant?.id && !isOffline) {
                        const synced = await syncOfflineBudgetQueue(currentTenant.id);
                        if (synced > 0) {
                          toast({ title: '🎉 Sync Complete', description: `Synced ${synced} transaction(s)!` });
                          const items = await getQueuedTransactions(currentTenant.id);
                          setOfflineQueueCount(items.length);
                        }
                      }
                    }}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-all ${
                      isOffline ? 'bg-amber-400 text-slate-900 animate-pulse' : 'bg-emerald-400 text-emerald-950 hover:bg-emerald-300'
                    }`}
                  >
                    <span>📶</span>
                    <span>{isOffline ? `Offline Queue (${offlineQueueCount})` : `Sync Queue (${offlineQueueCount})`}</span>
                  </button>
                )}
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
                <div className="space-y-3">
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

                  {/* 1-Tap Quick Presets Bar */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-black uppercase tracking-widest text-primary-foreground/80 flex items-center gap-1">
                        <Zap className="h-3 w-3 text-amber-300" /> 1-Tap Presets ({presets.length}/20)
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowPresetModal(true)}
                        className="text-[10px] font-bold text-white hover:underline opacity-90"
                      >
                        + Manage
                      </button>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                      {presets.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => handleQuickLogPreset(preset)}
                          className="bg-white/20 hover:bg-white/30 border border-white/20 backdrop-blur-md px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-sm transition-all active:scale-95 shrink-0 text-white"
                        >
                          <span className="text-sm">{preset.icon || '⚡'}</span>
                          <div className="text-left">
                            <p className="font-bold text-xs leading-tight">{preset.title}</p>
                            <p className="text-[10px] opacity-80 font-black">₱{(preset.amountCentavos / 100).toLocaleString()}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
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
              <PieChart width={64} height={64}>
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
                <span className="bg-emerald-200/80 text-emerald-900 font-bold text-[10px] px-2.5 py-0.5 rounded-full shadow-sm">
                  {persona === 'student' ? `🎓 Next Allowance in ${daysRemaining} Days` : `💼 Payday in ${daysRemaining} Days`}
                </span>
              </div>
              <p className={`text-3xl font-black ${theme.textDark} tracking-tighter`}>{formatPesos(safeToSpend)}</p>
              <p className={`text-xs ${theme.text} opacity-80 mt-1 mb-3`}>Based on {daysRemaining} days left until your {resetTerm.toLowerCase()} ({cycleText}).</p>
              
              {/* Daily Allowance Progress Meter */}
              {(() => {
                const todayStr = new Date().toDateString();
                const todayExpensesPesos = cycleTransactions
                  .filter(t => t.type === 'expense' && t.createdAt && (t.createdAt.toDate ? t.createdAt.toDate().toDateString() : new Date(t.createdAt).toDateString()) === todayStr)
                  .reduce((acc, t) => acc + (t.amountCentavos || 0), 0) / 100;
                const safeDailyLimit = safeToSpend > 0 ? safeToSpend : 1;
                const todayPercent = Math.min(100, (todayExpensesPesos / safeDailyLimit) * 100);

                return (
                  <div className="mt-3 pt-3 border-t border-emerald-200/60 space-y-1.5">
                    <div className="flex justify-between items-center text-[10px] font-bold text-slate-700">
                      <span className="flex items-center gap-1">⚡ Today's Spend Gauge</span>
                      <span className={todayExpensesPesos > safeToSpend ? 'text-rose-600 font-black' : 'text-emerald-800 font-black'}>
                        {formatPesos(todayExpensesPesos)} / {formatPesos(safeToSpend)} Limit
                      </span>
                    </div>
                    <div className="h-2 w-full bg-emerald-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${todayExpensesPesos > safeToSpend ? 'bg-rose-500' : 'bg-emerald-500'}`}
                        style={{ width: `${todayPercent}%` }}
                      />
                    </div>
                  </div>
                );
              })()}

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
                <div className={`bg-white/50 rounded-xl p-2.5 text-[10px] font-bold ${theme.textDarker} flex items-center gap-2 mt-3`}>
                  <AlertCircle className="h-3 w-3 text-rose-500 shrink-0" />
                  <span>Smart Math: Deducted {formatMoney(urgentDebtCentavos)} of upcoming debts/bills before next payday! 🛡️</span>
                </div>
              )}
            </div>
          </div>

          {/* Katuwang Advice */}
          {(() => {
            const dailyTips = [
              'Setting strict Envelope limits for top categories like "Food" or "Pamasahe" helps increase monthly savings by up to 25%!',
              'Reviewing subscriptions monthly ensures you only pay for services that bring active value to your routine.',
              'Allocating 20% of income directly to a Savings Goal on payday (Pay Yourself First) builds an emergency fund 2x faster.',
              'Tracking cash expenses immediately via 1-Tap Presets prevents small daily leaks from adding up silently.',
              'Planning meal prep or weekly grocery lists with preset budgets cuts food expense waste by up to ₱1,500 every cycle.'
            ];
            const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
            const currentDailyTip = dailyTips[dayOfYear % dailyTips.length];

            return (
              <div className="bg-gradient-to-r from-amber-500/10 via-emerald-500/10 to-indigo-500/10 border border-amber-200/60 rounded-2xl p-4 shadow-sm space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-900 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-amber-600 animate-pulse" /> Katuwang Advice
                  </span>
                  <span className="text-[9px] font-bold text-amber-700/80 uppercase tracking-wider">Daily Tip</span>
                </div>
                {actualDailySpend > idealDailySpend * 1.1 && daysRemaining > 3 ? (
                  <p className="text-xs text-slate-700 font-medium leading-relaxed">
                    ⚡ <strong className="text-amber-900">Spending Velocity Caution:</strong> You're spending ₱{(actualDailySpend - idealDailySpend).toFixed(0)}/day over your recommended pace. Lower daily spend to ₱{idealDailySpend.toFixed(0)}/day to stay safe until next {resetTerm.toLowerCase()}!
                  </p>
                ) : totalIncome > 0 && totalExpense / totalIncome < 0.7 ? (
                  <p className="text-xs text-slate-700 font-medium leading-relaxed">
                    🎉 <strong className="text-emerald-900">Excellent Savings Pace:</strong> You have saved {((1 - totalExpense / totalIncome) * 100).toFixed(0)}% of your income this cycle! Consider adding ₱{formatPesos((totalIncome - totalExpense) * 0.2)} to a Savings Goal.
                  </p>
                ) : (
                  <p className="text-xs text-slate-700 font-medium leading-relaxed">
                    💡 <strong className="text-indigo-900">Tip of the Day:</strong> {currentDailyTip}
                  </p>
                )}
              </div>
            );
          })()}

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
              <p className="text-xs text-amber-700/80 font-medium">No upcoming bills or subscriptions tracked yet. Add Meralco, Rent, Internet, etc.</p>
            ) : (
              <div className="space-y-2">
                {debts.filter(d => d.isRecurring).map(bill => {
                  const isVariable = bill.billType === 'variable';
                  return (
                    <div key={bill.id} className="bg-white/80 p-3 rounded-xl border border-amber-200/50 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-xs text-slate-800">{bill.creditorName}</p>
                          <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${isVariable ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' : 'bg-amber-100 text-amber-800 border border-amber-200'}`}>
                            {isVariable ? 'Est. Variable' : 'Fixed Amount'}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                          {bill.dueDate ? `Due ${bill.dueDate}` : 'Monthly recurring'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-xs text-amber-800">{formatMoney(bill.totalAmountCentavos)}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-slate-400 hover:text-indigo-600 rounded-full"
                          onClick={() => setEditingDebt(bill)}
                        >
                          <Settings className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
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
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 text-center space-y-3">
                <div>
                  <p className="text-xs text-slate-600 font-bold mb-1">No category budgets set yet.</p>
                  <p className="text-[10px] text-slate-400">Set envelope limits for Food, Transport, Utilities, and Shopping.</p>
                </div>
                <Button
                  onClick={() => setShowAuto503020Modal(true)}
                  disabled={isSubmitting}
                  className="bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs rounded-xl shadow-sm px-4 py-2"
                >
                  ⚡ Auto 50/30/20 Setup
                </Button>
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

            // 2. Type Filter (All, Income, Expense)
            if (txTypeFilter !== 'all') {
              filteredTransactions = filteredTransactions.filter(tx => tx.type === txTypeFilter);
            }

            // 3. Search Filter
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
                    <div className="flex gap-1.5">
                      <Button 
                        onClick={exportCsvStatement} 
                        size="sm" 
                        variant="outline" 
                        className="h-7 text-[11px] font-bold gap-1 rounded-lg text-slate-700 border-slate-200 hover:bg-slate-50"
                      >
                        <Download className="h-3 w-3" /> CSV
                      </Button>
                      <Button 
                        onClick={printPdfStatement} 
                        size="sm" 
                        variant="outline" 
                        className="h-7 text-[11px] font-bold gap-1 rounded-lg text-slate-700 border-slate-200 hover:bg-slate-50"
                      >
                        <Printer className="h-3 w-3" /> PDF
                      </Button>
                    </div>
                  </div>

                  {/* Transaction Type Filter Pills */}
                  <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setTxTypeFilter('all')}
                      className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-all ${txTypeFilter === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      All ({transactions.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTxTypeFilter('income')}
                      className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-all ${txTypeFilter === 'income' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      Income ({transactions.filter(t => t.type === 'income').length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTxTypeFilter('expense')}
                      className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-all ${txTypeFilter === 'expense' ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      Expenses ({transactions.filter(t => t.type === 'expense').length})
                    </button>
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
      {activeTab === 'stock' && (() => {
        const totalSavingsCentavos = goals.reduce((acc, g) => acc + (g.currentAmountCentavos || 0), 0);
        const totalDebtsCentavos = debts.filter(d => d.direction !== 'owed_to_me').reduce((acc, d) => acc + (d.remainingAmountCentavos || 0), 0);
        const totalReceivablesCentavos = debts.filter(d => d.direction === 'owed_to_me').reduce((acc, d) => acc + (d.remainingAmountCentavos || 0), 0);
        const netPositionCentavos = masterBalance + totalSavingsCentavos + totalReceivablesCentavos - totalDebtsCentavos;

        const filteredDebts = debts.filter(d => {
          if (debtFilter === 'i_owe') return d.direction !== 'owed_to_me';
          if (debtFilter === 'owed_to_me') return d.direction === 'owed_to_me';
          return true;
        });

        const week52SavingsPesos = (ipon52Week * (ipon52Week + 1) / 2) * iponWeeklyAmount;
        const coffeeSavingsPesos = coffeeStreak * habitDailyAmount;

        return (
          <div className="px-4 py-6 space-y-6">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Savings & Debts</h1>
              <PiggyBank className="h-6 w-6 text-primary" />
            </div>

            {/* Top Net Position Summary Banner */}
            <div className="bg-slate-900 text-white rounded-3xl p-5 shadow-xl border border-slate-800 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Net Position Impact</p>
                  <h2 className="text-2xl font-black tracking-tight text-white">{formatMoney(netPositionCentavos)}</h2>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase ${netPositionCentavos >= 0 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}`}>
                  {netPositionCentavos >= 0 ? '✓ Solid Position' : '⚠️ Debt Heavy'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800">
                <div className="bg-slate-800/60 p-2.5 rounded-2xl border border-slate-700/50">
                  <p className="text-[9px] font-black uppercase text-emerald-400">Total Savings</p>
                  <p className="font-bold text-sm text-white">{formatMoney(totalSavingsCentavos)}</p>
                </div>
                <div className="bg-slate-800/60 p-2.5 rounded-2xl border border-slate-700/50">
                  <p className="text-[9px] font-black uppercase text-rose-400">Total Debts (I Owe)</p>
                  <p className="font-bold text-sm text-white">{formatMoney(totalDebtsCentavos)}</p>
                </div>
                <div className="bg-slate-800/60 p-2.5 rounded-2xl border border-slate-700/50">
                  <p className="text-[9px] font-black uppercase text-amber-400">Receivables (Owed to Me)</p>
                  <p className="font-bold text-sm text-white">{formatMoney(totalReceivablesCentavos)}</p>
                </div>
              </div>
            </div>

            {/* Debt & Receivables Manager */}
            <div className="bg-rose-50/40 rounded-2xl border border-rose-100 overflow-hidden">
              <div className="p-4 border-b border-rose-100 bg-white flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Debts & Receivables</h3>
                    <p className="text-xs text-slate-500">Track money you owe vs money owed to you</p>
                  </div>
                  <Button size="sm" variant="outline" className="h-8 text-xs text-rose-600 border-rose-200 hover:bg-rose-50 font-bold rounded-xl" onClick={() => setShowDebtModal(true)}>
                    + Add Record
                  </Button>
                </div>

                {/* Filter Pills */}
                <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setDebtFilter('all')}
                    className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-all ${debtFilter === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    All ({debts.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDebtFilter('i_owe')}
                    className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-all ${debtFilter === 'i_owe' ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    I Owe ({debts.filter(d => d.direction !== 'owed_to_me').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDebtFilter('owed_to_me')}
                    className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-all ${debtFilter === 'owed_to_me' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    Owed to Me ({debts.filter(d => d.direction === 'owed_to_me').length})
                  </button>
                </div>
              </div>
              
              <div className="p-4">
                {filteredDebts.length === 0 ? (
                  <div className="text-center text-sm text-slate-400 py-4">No debt or receivable records in this view.</div>
                ) : (
                  <div className="space-y-3">
                    {filteredDebts.map(debt => {
                      const isOwedToMe = debt.direction === 'owed_to_me';
                      return (
                        <div key={debt.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <h4 className="font-bold text-sm text-slate-800">{debt.creditorName}</h4>
                              <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md mt-1 inline-block ${isOwedToMe ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700'}`}>
                                {isOwedToMe ? 'Owed to Me (Receivable)' : 'I Owe (Debt)'}
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
                                className={`h-full rounded-full transition-all ${isOwedToMe ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                style={{ width: `${Math.min(100, ((debt.totalAmountCentavos - debt.remainingAmountCentavos) / debt.totalAmountCentavos) * 100)}%` }}
                              />
                            </div>
                            <Button size="sm" variant="ghost" className={`h-8 text-xs font-bold ${isOwedToMe ? 'text-emerald-600 hover:bg-emerald-50' : 'text-rose-600 hover:bg-rose-50'}`} onClick={() => setShowPayDebtModal(debt)}>
                              {isOwedToMe ? 'Collect' : 'Pay'}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Interactive Ipon Challenge Gamification Streaks */}
            <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-5 text-white shadow-lg space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
                    <Trophy className="h-4 w-4 text-amber-300" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm tracking-tight uppercase">Ipon Challenge Streaks</h3>
                    <p className="text-[10px] opacity-80">Interactive gamified savings habits</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCustomizeIponModal(true)}
                    className="bg-white/20 hover:bg-white/30 text-white font-bold text-xs px-2.5 py-1 rounded-full flex items-center gap-1 transition-all"
                  >
                    <Settings className="h-3 w-3" /> Customize
                  </button>
                  <span className="bg-amber-400 text-slate-900 font-black text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider">🔥 Active</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* 52-Week Challenge */}
                <div className="bg-white/10 border border-white/15 rounded-2xl p-4 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-xs font-bold text-amber-200">52-Week ₱{iponWeeklyAmount} Challenge</p>
                      <span className="text-[10px] font-black text-amber-300 bg-black/20 px-2 py-0.5 rounded-full">Week {ipon52Week} / 52</span>
                    </div>
                    <p className="text-xl font-black text-white">₱{week52SavingsPesos.toLocaleString('en-US')} Saved 🐷</p>
                    <div className="w-full h-2 bg-white/20 rounded-full mt-2 overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full transition-all duration-300" style={{ width: `${(ipon52Week / 52) * 100}%` }} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const next = Math.min(52, ipon52Week + 1);
                        setIpon52Week(next);
                        localStorage.setItem('budgetSense52WeekProgress', next.toString());
                        toast({ title: `Week ${next} Checked Off!`, description: `Accumulated ₱${((next * (next + 1) / 2) * iponWeeklyAmount).toLocaleString()} saved.` });
                      }}
                      disabled={ipon52Week >= 52}
                      className="flex-1 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs rounded-xl active:scale-95 transition-all"
                    >
                      {ipon52Week >= 52 ? '🎉 Completed!' : `+ Check Off Week ${ipon52Week + 1}`}
                    </button>
                    {ipon52Week > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setIpon52Week(1);
                          localStorage.setItem('budgetSense52WeekProgress', '1');
                        }}
                        className="px-2.5 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>

                {/* 30-Day Habit Streak */}
                <div className="bg-white/10 border border-white/15 rounded-2xl p-4 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-xs font-bold text-indigo-200">{habitName}</p>
                      <span className="text-[10px] font-black text-indigo-300 bg-black/20 px-2 py-0.5 rounded-full">{coffeeStreak} Days</span>
                    </div>
                    <p className="text-xl font-black text-white">{coffeeStreak} Days Streak 🔥</p>
                    <p className="text-xs text-indigo-100 opacity-90 mt-1">Estimated ₱{coffeeSavingsPesos.toLocaleString('en-US')} Saved ☕</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const next = coffeeStreak + 1;
                        setCoffeeStreak(next);
                        localStorage.setItem('budgetSenseCoffeeStreak', next.toString());
                        toast({ title: '🔥 Streak Increased!', description: `You reached ${next} days streak!` });
                      }}
                      className="flex-1 py-2 bg-indigo-400 hover:bg-indigo-300 text-slate-950 font-black text-xs rounded-xl active:scale-95 transition-all"
                    >
                      +1 Day Streak
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Savings Goals */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-[10px] font-black text-primary uppercase tracking-widest">Savings Goals</h3>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-8 text-xs text-primary border-primary-100 hover:bg-primary-50 font-bold rounded-xl" onClick={() => setShowGoalModal(true)}>
                    + Goal
                  </Button>
                  {goals.length > 0 && masterBalance > 0 && (
                    <Button size="sm" className="h-8 text-xs font-bold rounded-xl" onClick={() => setShowAllocationPrompt({amount: masterBalance})}>
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
                            <div className="flex gap-2 items-center">
                              <Button
                                size="sm"
                                className="h-7 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-black text-xs rounded-xl border border-indigo-200"
                                onClick={() => setDepositGoalModal(goal)}
                              >
                                + Deposit
                              </Button>
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
        );
      })()}

      {/* INSIGHTS TAB (ULAT) */}
      {activeTab === 'ulat' && (() => {
        const netCashFlow = insightsIncome - insightsExpense;
        
        let rangeDays = 1;
        if (insightsRange === 'today') rangeDays = 1;
        else if (insightsRange === 'last7') rangeDays = 7;
        else if (insightsRange === 'last15') rangeDays = 15;
        else if (insightsRange === 'last30') rangeDays = 30;
        else rangeDays = Math.max(1, daysRemaining);

        const avgDailySpend = insightsExpense / rangeDays;

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
        const topCategoryName = categoryData.length > 0 ? categoryData[0].name : 'None yet';

        const COLORS = ['#f43f5e', '#f97316', '#eab308', '#6366f1', '#8b5cf6', '#d946ef', '#14b8a6', '#06b6d4'];

        return (
          <div className="px-4 py-6 space-y-6">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Insights</h1>
              <Target className="h-6 w-6 text-primary" />
            </div>

            {/* Date Range Selector */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
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

            {/* Top Key Metric Summary Cards */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Net Cash Flow</p>
                <p className={`font-black text-sm ${netCashFlow >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {netCashFlow >= 0 ? `+${formatPesos(netCashFlow)}` : formatPesos(netCashFlow)}
                </p>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Avg Daily Spend</p>
                <p className="font-black text-sm text-slate-800">{formatPesos(avgDailySpend)}/day</p>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Top Category</p>
                <p className="font-black text-sm text-slate-800 truncate" title={topCategoryName}>{topCategoryName}</p>
              </div>
            </div>

            {/* Cash Flow Overview Bar */}
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

              <div className="w-full h-4 rounded-full overflow-hidden flex bg-slate-100">
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

            {/* Spending by Category (Always-Visible PieChart) */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                <PiggyBank className="h-4 w-4 text-rose-500" />
                Spending by Category
              </h3>
              
              <div className="space-y-4">
                <div className="h-52 w-full -mt-2 relative flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                    <PieChart>
                      <Pie
                        data={categoryData.length > 0 ? categoryData : [{ name: 'No Expenses Recorded', value: 1 }]}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={categoryData.length > 0 ? 3 : 0}
                        dataKey="value"
                        stroke="none"
                      >
                        {categoryData.length > 0 ? (
                          categoryData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))
                        ) : (
                          <Cell fill="#e2e8f0" />
                        )}
                      </Pie>
                      {categoryData.length > 0 && (
                        <Tooltip 
                          formatter={(value: number) => formatPesos(value / 100)}
                          contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)', padding: '12px' }}
                          itemStyle={{ color: '#1e293b', fontWeight: 'bold' }}
                        />
                      )}
                    </PieChart>
                  </ResponsiveContainer>
                  
                  {categoryData.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">No Expenses Recorded</p>
                    </div>
                  )}
                </div>

                {categoryData.length > 0 ? (
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
                ) : (
                  <p className="text-xs text-slate-400 text-center font-medium">Log expense transactions to see automatic category percentage breakdown!</p>
                )}
              </div>
            </div>

            {/* Planned Budget vs Actual Variance Table */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
              <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                <Target className="h-4 w-4 text-violet-600" />
                Envelope Target vs Actual Variance
              </h3>

              {envelopes.length === 0 ? (
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-center space-y-3">
                  <p className="text-xs text-slate-500 font-medium">No category budgets set to compare variance.</p>
                  <Button
                    onClick={() => setShowAuto503020Modal(true)}
                    className="bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs rounded-xl shadow-sm px-4 py-2"
                  >
                    ⚡ Auto 50/30/20 Setup
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {envelopes.map(env => {
                    const spent = cycleTransactions
                      .filter(t => t.type === 'expense' && t.category.toLowerCase() === env.category.toLowerCase())
                      .reduce((acc, t) => acc + (t.amountCentavos || 0), 0);
                    const limit = env.limitCentavos;
                    const diff = limit - spent;
                    const isFavorable = diff >= 0;

                    return (
                      <div key={env.id} className="flex justify-between items-center bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs">
                        <div>
                          <p className="font-bold text-slate-800">{env.category}</p>
                          <p className="text-[10px] text-slate-400">Target: {formatPesos(limit / 100)} • Spent: {formatPesos(spent / 100)}</p>
                        </div>
                        <div className={`px-2.5 py-1 rounded-full text-[10px] font-black ${isFavorable ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                          {isFavorable ? `+${formatPesos(diff / 100)} Under` : `-${formatPesos(Math.abs(diff) / 100)} Over`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Savings Health */}
            <div className="bg-emerald-50 rounded-2xl p-5 border border-emerald-100 shadow-sm space-y-3">
              <h3 className="text-[10px] font-black text-emerald-800 uppercase tracking-widest flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Savings Health
              </h3>

              {(() => {
                const savingsRate = totalIncome > 0 ? Math.max(0, ((totalIncome - totalExpense) / totalIncome) * 100) : 0;
                let message = "";
                if (totalIncome === 0) message = "Log income or salary to calculate your real-time savings rate!";
                else if (savingsRate >= 20) message = "Excellent! You're saving a highly recommended 20%+ of your income.";
                else if (savingsRate > 0) message = "Good start! You're keeping your expenses below your income.";
                else message = "Warning: Your expenses currently exceed your logged income.";

                return (
                  <div>
                    <div className="flex items-end gap-2 mb-2">
                      <span className="text-3xl font-black text-emerald-700 tracking-tighter">{savingsRate.toFixed(1)}%</span>
                      <span className="text-xs font-bold text-emerald-600/70 mb-1.5 uppercase tracking-widest">Savings Rate</span>
                    </div>
                    <div className="w-full h-2 bg-emerald-100 rounded-full overflow-hidden mb-2">
                      <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, savingsRate)}%` }} />
                    </div>
                    <p className="text-xs text-emerald-700/80 font-medium leading-relaxed">{message}</p>
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })()}

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

      <DepositGoalModal
        isOpen={!!depositGoalModal}
        onClose={() => setDepositGoalModal(null)}
        tenantId={currentTenant?.id || ''}
        goal={depositGoalModal}
        masterBalance={masterBalance}
      />

      {showCustomizeIponModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowCustomizeIponModal(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const wAmt = parseFloat(fd.get('weeklyAmount') as string) || 50;
              const hAmt = parseFloat(fd.get('habitAmount') as string) || 120;
              const hName = (fd.get('habitName') as string) || '30-Day Coffee Limit';

              setIponWeeklyAmount(wAmt);
              setHabitDailyAmount(hAmt);
              setHabitName(hName);

              localStorage.setItem('budgetSense52WeekAmount', wAmt.toString());
              localStorage.setItem('budgetSenseHabitAmount', hAmt.toString());
              localStorage.setItem('budgetSenseHabitName', hName);

              toast({ title: 'Challenge Customized!', description: 'Your savings challenge goals have been updated.' });
              setShowCustomizeIponModal(false);
            }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white p-6 rounded-[32px] w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200 space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-100 text-indigo-700 rounded-xl flex items-center justify-center">
                <Trophy className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-black text-lg text-slate-800 tracking-tight">Customize Challenge</h3>
                <p className="text-xs text-slate-500">Set custom amounts for your savings habits</p>
              </div>
            </div>

            <div>
              <Label htmlFor="ipon-weekly-step" className="text-xs font-bold text-slate-700 mb-1 block">
                52-Week Base Weekly Step (₱)
              </Label>
              <Input
                id="ipon-weekly-step"
                name="weeklyAmount"
                type="number"
                step="5"
                min="5"
                required
                defaultValue={iponWeeklyAmount}
                className="bg-slate-50 border-slate-200 rounded-xl font-bold"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                At ₱{iponWeeklyAmount}/week step, Week 52 target = ₱{((52 * 53 / 2) * iponWeeklyAmount).toLocaleString()}.
              </p>
            </div>

            <div>
              <Label htmlFor="ipon-habit-name" className="text-xs font-bold text-slate-700 mb-1 block">
                Habit Challenge Name
              </Label>
              <Input
                id="ipon-habit-name"
                name="habitName"
                type="text"
                required
                defaultValue={habitName}
                className="bg-slate-50 border-slate-200 rounded-xl font-medium"
              />
            </div>

            <div>
              <Label htmlFor="ipon-habit-daily" className="text-xs font-bold text-slate-700 mb-1 block">
                Daily Habit Savings (₱/day)
              </Label>
              <Input
                id="ipon-habit-daily"
                name="habitAmount"
                type="number"
                step="5"
                min="1"
                required
                defaultValue={habitDailyAmount}
                className="bg-slate-50 border-slate-200 rounded-xl font-bold"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowCustomizeIponModal(false); }}
                className="flex-1 rounded-xl text-slate-500 font-bold"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold"
              >
                Save Goals
              </Button>
            </div>
          </form>
        </div>
      )}

      {showAuto503020Modal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowAuto503020Modal(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!currentTenant?.id) return;
              const fd = new FormData(e.currentTarget);
              const customIncome = parseFloat(fd.get('incomeBaseline') as string);
              const incomeToUse = customIncome > 0 ? customIncome : (totalIncome > 0 ? totalIncome : 25000);
              
              try {
                setIsSubmitting(true);
                const needsCentavos = Math.round(incomeToUse * 0.5 * 100);
                const wantsCentavos = Math.round(incomeToUse * 0.3 * 100);
                const savingsCentavos = Math.round(incomeToUse * 0.2 * 100);

                await addBudgetEnvelope(currentTenant.id, 'Food & Utilities (Needs)', needsCentavos);
                await addBudgetEnvelope(currentTenant.id, 'Shopping & Leisure (Wants)', wantsCentavos);
                await addBudgetEnvelope(currentTenant.id, 'Savings & Emergency', savingsCentavos);

                toast({
                  title: '⚡ 50/30/20 Envelopes Created!',
                  description: `Needs: ₱${(needsCentavos / 100).toLocaleString()}, Wants: ₱${(wantsCentavos / 100).toLocaleString()}, Savings: ₱${(savingsCentavos / 100).toLocaleString()}`
                });
                setShowAuto503020Modal(false);
              } catch (err: any) {
                toast({ title: 'Error', description: err.message, variant: 'destructive' });
              } finally {
                setIsSubmitting(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white p-6 rounded-[32px] w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200 space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-violet-100 text-violet-700 rounded-xl flex items-center justify-center">
                <Target className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-black text-lg text-slate-800 tracking-tight">Auto 50/30/20 Setup</h3>
                <p className="text-xs text-slate-500">Calculate category envelopes from your income</p>
              </div>
            </div>

            {totalIncome > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex justify-between items-center">
                <div>
                  <p className="text-[10px] font-black uppercase text-emerald-800 tracking-wider">Logged Cycle Income</p>
                  <p className="font-black text-base text-emerald-950">{formatPesos(totalIncome)}</p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (!currentTenant?.id) return;
                    try {
                      setIsSubmitting(true);
                      await addBudgetEnvelope(currentTenant.id, 'Food & Utilities (Needs)', Math.round(totalIncome * 0.5 * 100));
                      await addBudgetEnvelope(currentTenant.id, 'Shopping & Leisure (Wants)', Math.round(totalIncome * 0.3 * 100));
                      await addBudgetEnvelope(currentTenant.id, 'Savings & Emergency', Math.round(totalIncome * 0.2 * 100));
                      toast({ title: '⚡ 50/30/20 Setup Complete!', description: `Applied to logged ₱${totalIncome.toLocaleString()} income.` });
                      setShowAuto503020Modal(false);
                    } catch (e: any) {
                      toast({ title: 'Error', description: e.message, variant: 'destructive' });
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded-xl shadow-sm"
                >
                  Use Logged
                </button>
              </div>
            )}

            <div>
              <Label htmlFor="income-baseline" className="text-xs font-bold text-slate-700 mb-1.5 block">
                {persona === 'student' ? 'Weekly Allowance Baseline (₱)' : 'Monthly Income / Salary Target (₱)'}
              </Label>
              <Input
                id="income-baseline"
                name="incomeBaseline"
                type="number"
                step="100"
                placeholder={totalIncome > 0 ? totalIncome.toString() : (persona === 'student' ? '1500' : '25000')}
                className="bg-slate-50 border-slate-200 rounded-xl font-bold"
              />
            </div>

            {/* Quick Income Presets */}
            <div>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1.5">Quick Income Presets</p>
              <div className="grid grid-cols-2 gap-1.5">
                {(persona === 'student' || cycleType === 'weekly' ? [500, 1500, 3000, 5000] : [15000, 25000, 35000, 50000]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={async () => {
                      if (!currentTenant?.id) return;
                      try {
                        setIsSubmitting(true);
                        await addBudgetEnvelope(currentTenant.id, 'Food & Utilities (Needs)', Math.round(preset * 0.5 * 100));
                        await addBudgetEnvelope(currentTenant.id, 'Shopping & Leisure (Wants)', Math.round(preset * 0.3 * 100));
                        await addBudgetEnvelope(currentTenant.id, 'Savings & Emergency', Math.round(preset * 0.2 * 100));
                        toast({ title: '⚡ Envelopes Setup!', description: `Category budgets scaled for ₱${preset.toLocaleString()} baseline.` });
                        setShowAuto503020Modal(false);
                      } catch (e: any) {
                        toast({ title: 'Error', description: e.message, variant: 'destructive' });
                      } finally {
                        setIsSubmitting(false);
                      }
                    }}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs py-2 px-3 rounded-xl transition-all"
                  >
                    ₱{preset.toLocaleString()}{persona === 'student' ? '/wk' : '/mo'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowAuto503020Modal(false)}
                className="flex-1 rounded-xl text-slate-500 font-bold"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold"
              >
                {isSubmitting ? 'Saving...' : 'Apply 50/30/20'}
              </Button>
            </div>
          </form>
        </div>
      )}

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

      {/* Preset Modal for 1-Tap Shortcuts */}
      <PresetModal
        isOpen={showPresetModal}
        onClose={() => setShowPresetModal(false)}
        presets={presets}
        onSavePresets={handleSavePresets}
      />
    </div>
  );
}
