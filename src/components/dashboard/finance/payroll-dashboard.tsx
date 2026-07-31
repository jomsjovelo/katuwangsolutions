"use client"
import { usePinApproval } from '@/hooks/use-pin-approval';

import React, { useState } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { addEmployee, recordPayout, deleteEmployee } from '@/firebase/firestore/finance-actions';
import { useUser } from '@/firebase/auth/use-user';
import { doc, updateDoc, serverTimestamp, collection, query, orderBy, limit } from 'firebase/firestore';
import { useCollection } from 'react-firebase-hooks/firestore';
import { useFirestore } from '@/firebase/provider';
import { useShift } from '@/hooks/use-shift';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { getModuleTheme, useDynamicThemeColor } from '@/lib/theme-utils';
import { useToast } from '@/hooks/use-toast';
import { PayslipModal } from './payslip-modal';
import { 
  Users, 
  UserPlus,
  Banknote,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Wallet,
  Trash2,
  FileText,
  Gift,
  Clock
} from "lucide-react";

export function PayrollDashboard() {
  const { currentTenant } = useTenant();
  const db = useFirestore();
  const { toast } = useToast();
  const { requireApproval } = usePinApproval();
  
  const theme = getModuleTheme(currentTenant?.moduleType);
  useDynamicThemeColor(theme);
  
  const { user } = useUser();
  const { activeShift } = useShift();
  const isOwner = currentTenant?.ownerUid === user?.uid || (currentTenant as any)?.role === 'owner';

  // --- Employee List ---
  const empQuery = React.useMemo(() => {
    return currentTenant 
    ? query(collection(db, 'tenants', currentTenant.id, 'employees'), orderBy('createdAt', 'desc'), limit(300)) : null;
  }, [currentTenant?.id, db]);
  const [empSnapshot, loading, empError] = useCollection(empQuery as any);
  const employees = empSnapshot?.docs.map((d: any) => ({ id: d.id, ...d.data() })) || [];
  const activeEmployees = employees.filter((e: any) => e.isActive !== false);

  React.useEffect(() => {
    if (empError) {
      console.error("Employee listener error:", empError);
      toast({ title: 'Connection Error', description: 'Failed to sync employee data.', variant: 'destructive' });
    }
  }, [empError, toast]);

  // Estimated period total (gross, before deductions)
  const totalEstimatedPayroll = React.useMemo(() => {
    return activeEmployees.reduce((acc: number, e: any) => {
      const days = e.daysWorkedThisPeriod || 0;
      if (e.salaryType === 'daily') return acc + (e.baseSalary * days);
      // Monthly: prorate by actual days worked out of 26 standard working days/month
      // If no days tracked yet (0), show full monthly as the estimate
      if (days === 0) return acc + e.baseSalary;
      return acc + Math.round(e.baseSalary * (days / 26));
    }, 0);
  }, [activeEmployees]);

  // --- Add Employee Form ---
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPosition, setNewPosition] = useState('');
  const [newRate, setNewRate] = useState<number | ''>('');
  const [newSalaryType, setNewSalaryType] = useState<'daily' | 'monthly'>('daily');
  const [isAdding, setIsAdding] = useState(false);

  const handleAddEmployee = async () => {
    if (!currentTenant || !newName || !newRate || Number(newRate) <= 0 || isNaN(Number(newRate))) {
      toast({ title: 'Error', description: 'Please enter a valid rate greater than zero.', variant: 'destructive' });
      return;
    }
    setIsAdding(true);
    try {
      await addEmployee(currentTenant.id, {
        name: newName.trim(),
        position: newPosition.trim() || 'Staff',
        baseSalary: Math.round(Number(newRate) * 100), // pesos to centavos safely
        salaryType: newSalaryType,
        daysWorkedThisPeriod: 0,
        outstandingVale: 0,
        isActive: true,
      });
      setNewName('');
      setNewPosition('');
      setNewRate('');
      setShowAddForm(false);
      toast({ title: 'Employee Added!', description: `${newName} is now on the roster.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsAdding(false);
    }
  };

  // --- Per-Employee State (days worked, vale input, overtime, payslip) ---
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [daysInputs, setDaysInputs] = useState<Record<string, number | ''>>({});
  const [overtimeInputs, setOvertimeInputs] = useState<Record<string, number | ''>>({});
  const [commissionsInputs, setCommissionsInputs] = useState<Record<string, number | ''>>({});
  const [valeInputs, setValeInputs] = useState<Record<string, number | ''>>({});
  const [applyDeductionsInputs, setApplyDeductionsInputs] = useState<Record<string, boolean>>({});
  const [payingId, setPayingId] = useState<string | null>(null);
  const [selectedPayslipEmp, setSelectedPayslipEmp] = useState<any>(null);

  const handlePayNow = async (emp: any) => {
    if (!currentTenant) return;
    const days = Number(daysInputs[emp.id] ?? emp.daysWorkedThisPeriod ?? 0);
    const commissions = Number(commissionsInputs[emp.id] ?? 0);
    const overtime = Number(overtimeInputs[emp.id] ?? 0);
    const vale = Number(valeInputs[emp.id] ?? ((emp.outstandingVale ?? 0) / 100));
    const ratePerDay = emp.baseSalary; // in centavos
    const grossCentavos = emp.salaryType === 'daily' ? ratePerDay * days : ratePerDay;
    const hourlyRateCentavos = emp.salaryType === 'daily' ? (ratePerDay / 8) : ((ratePerDay / 26) / 8);
    const overtimeCentavos = Math.round(overtime * hourlyRateCentavos * 1.25);
    const commissionsCentavos = commissions * 100;
    const totalGrossCentavos = grossCentavos + commissionsCentavos + overtimeCentavos;
    
    // Compute Govt Deductions
    const applyDeductions = applyDeductionsInputs[emp.id] || false;
    let govtDeductionsCentavos = 0;
    if (applyDeductions) {
      const sss = Math.round(totalGrossCentavos * 0.045);
      const philHealth = Math.round(totalGrossCentavos * 0.02);
      const pagIbig = 100 * 100; // 100 pesos
      govtDeductionsCentavos = sss + philHealth + pagIbig;
    }

    const valeCentavos = vale * 100;
    const netCentavos = Math.max(0, totalGrossCentavos - valeCentavos - govtDeductionsCentavos);

    setPayingId(emp.id);
    try {
      await recordPayout(
        currentTenant.id,
        emp.id,
        emp.name,
        days,
        grossCentavos,
        commissionsCentavos,
        valeCentavos,
        govtDeductionsCentavos,
        netCentavos,
        user?.uid,
        user?.displayName || user?.email || 'Unknown',
        activeShift?.id
      );
      // Reset local inputs
      setDaysInputs(prev => ({ ...prev, [emp.id]: '' }));
      setCommissionsInputs(prev => ({ ...prev, [emp.id]: '' }));
      setValeInputs(prev => ({ ...prev, [emp.id]: '' }));
      setExpandedId(null);
      toast({ 
        title: `Sahod released! 💸`, 
        description: `${emp.name} received ₱${(netCentavos / 100).toLocaleString()} net.` 
      });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setPayingId(null);
    }
  };

  const EmployeeCard = ({ emp }: { emp: any }) => {
    const isExpanded = expandedId === emp.id;
    const days = Number(daysInputs[emp.id] ?? emp.daysWorkedThisPeriod ?? 0);
    const commissions = Number(commissionsInputs[emp.id] ?? 0);
    const vale = Number(valeInputs[emp.id] ?? ((emp.outstandingVale ?? 0) / 100));
    const rateDisplay = emp.baseSalary / 100;
    const grossPay = emp.salaryType === 'daily' ? rateDisplay * days : rateDisplay;
    const totalGrossPay = grossPay + commissions;
    
    const applyDeductions = applyDeductionsInputs[emp.id] || false;
    let govtDeductions = 0;
    if (applyDeductions) {
      govtDeductions = (totalGrossPay * 0.045) + (totalGrossPay * 0.02) + 100; // SSS + PHIC + HDMF
    }

    const netPay = Math.max(0, totalGrossPay - vale - govtDeductions);
    const isPaying = payingId === emp.id;

    return (
      <Card className="shadow-sm border-slate-200 bg-white overflow-hidden">
        {/* Header Row — always visible */}
        <div 
          className="p-3 flex items-center gap-3 cursor-pointer active:bg-slate-50 transition-colors"
          onClick={() => setExpandedId(isExpanded ? null : emp.id)}
        >
          <div 
            className="h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
            style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
          >
            {emp.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="text-sm font-bold text-slate-800 truncate">{emp.name}</h4>
              {((emp.outstandingVale || 0) / 100) > (rateDisplay * 0.5) && (
                <Badge variant="destructive" className="text-[8px] font-black uppercase px-1.5 py-0 bg-red-100 text-red-700 border-none">
                  ⚠️ High Vale
                </Badge>
              )}
            </div>
            <p className="text-[10px] text-slate-500 font-medium">
              {emp.position || 'Staff'} • ₱{rateDisplay.toLocaleString()}/{emp.salaryType === 'daily' ? 'day' : 'month'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {days > 0 && (
              <Badge variant="secondary" className="text-[10px] bg-blue-50 text-blue-600 border-blue-100">
                {days}d logged
              </Badge>
            )}
            {isOwner && (
              <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-red-500 rounded-full" onClick={async (e) => {
                e.stopPropagation();
                if (!currentTenant || !user) return;
    // Phase 2: Require Manager PIN for Deletions
    const approved = await requireApproval("Deleting a record requires Manager authorization.");
    if (!approved) return;

                if (!window.confirm("Sigurado ka bang gusto mong i-delete ang empleyadong ito?")) return;
                try {
                  await deleteEmployee(currentTenant.id, emp.id, user.uid, user.displayName || user.email || 'Unknown User');
                  toast({ title: 'Employee Deleted', description: 'Employee has been removed from the roster.' });
                } catch (err: any) {
                  toast({ title: 'Error', description: err.message, variant: 'destructive' });
                }
              }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </div>
        </div>

        {/* Expanded Payroll Panel */}
        {isExpanded && (
          <div className="border-t border-slate-100 p-3 space-y-3 bg-slate-50">
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <Label htmlFor={`days-${emp.id}`} className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  {emp.salaryType === 'daily' ? 'Days Worked' : 'Period'}
                </Label>
                {emp.salaryType === 'daily' ? (
                  <Input
                    id={`days-${emp.id}`}
                    name={`days-${emp.id}`}
                    type="number"
                    placeholder="0"
                    className="h-9 text-sm"
                    value={daysInputs[emp.id] ?? emp.daysWorkedThisPeriod ?? ''}
                    onChange={e => setDaysInputs(prev => ({ ...prev, [emp.id]: parseFloat(e.target.value) || '' }))}
                  />
                ) : (
                  <div className="h-9 flex items-center px-3 bg-white border border-slate-200 rounded-md text-sm text-slate-600">
                    Monthly Fixed
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor={`commissions-${emp.id}`} className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    Commissions (₱)
                  </Label>
                  <Input
                    id={`commissions-${emp.id}`}
                    name={`commissions-${emp.id}`}
                    type="number"
                    placeholder="0"
                    className="h-9 text-sm"
                    value={commissionsInputs[emp.id] ?? ''}
                    onChange={e => setCommissionsInputs(prev => ({ ...prev, [emp.id]: parseFloat(e.target.value) || '' }))}
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Label htmlFor={`vale-${emp.id}`} className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    Vale Deduction (₱)
                  </Label>
                  <Input
                    id={`vale-${emp.id}`}
                    name={`vale-${emp.id}`}
                    type="number"
                    placeholder="0"
                    className="h-9 text-sm text-red-600 font-bold"
                    value={valeInputs[emp.id] ?? ((emp.outstandingVale ?? 0) / 100)}
                    onChange={e => setValeInputs(prev => ({ ...prev, [emp.id]: parseFloat(e.target.value) || '' }))}
                  />
                </div>
              </div>
            </div>

            {/* Govt Deductions Toggle */}
            <div className="flex items-center gap-2 px-1">
              <Input 
                type="checkbox" 
                id={`deduct-${emp.id}`}
                checked={applyDeductionsInputs[emp.id] || false}
                onChange={(e) => setApplyDeductionsInputs(prev => ({ ...prev, [emp.id]: e.target.checked }))}
                className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4"
              />
              <Label htmlFor={`deduct-${emp.id}`} className="text-xs text-slate-600 font-medium cursor-pointer">
                Apply Govt Deductions (SSS, PhilHealth, Pag-IBIG)
              </Label>
            </div>

            {/* Live Computation */}
            <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-1.5">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Base Pay</span>
                <span className="font-semibold text-slate-700">₱{grossPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              {commissions > 0 && (
                <div className="flex justify-between text-xs text-emerald-600">
                  <span>Commissions</span>
                  <span className="font-semibold">+₱{commissions.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              <div className="flex justify-between text-xs text-slate-500 font-bold border-b border-slate-100 pb-1">
                <span>Gross Pay</span>
                <span className="font-semibold text-slate-700">₱{totalGrossPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              {applyDeductionsInputs[emp.id] && (
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Govt Deductions</span>
                  <span className="font-semibold text-rose-500">- ₱{govtDeductions.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              <div className="flex justify-between text-xs text-slate-500">
                <span>Vale Deduction</span>
                <span className="font-semibold text-rose-500">- ₱{vale.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="h-px bg-slate-100 my-1" />
              <div className="flex justify-between text-sm font-bold">
                <span className="text-slate-800">Net Pay</span>
                <span style={{ color: theme.primary }}>₱{netPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <Label htmlFor={`ot-${emp.id}`} className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Overtime (Hours)
                </Label>
                <Input
                  id={`ot-${emp.id}`}
                  name={`ot-${emp.id}`}
                  type="number"
                  placeholder="0"
                  className="h-9 text-sm"
                  value={overtimeInputs[emp.id] ?? ''}
                  onChange={e => setOvertimeInputs(prev => ({ ...prev, [emp.id]: parseFloat(e.target.value) || '' }))}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1 h-9 text-xs font-bold border-slate-300 text-slate-700 bg-white"
                onClick={() => setSelectedPayslipEmp({
                  ...emp,
                  daysWorked: days,
                  overtimeHours: Number(overtimeInputs[emp.id] || 0),
                  commissionsPesos: commissions,
                  valeDeductionPesos: vale,
                  applyStatutory: applyDeductions
                })}
              >
                <FileText className="h-3.5 w-3.5 mr-1.5 text-slate-500" /> View Payslip
              </Button>
              <Button
                className="flex-1 h-9 text-xs font-bold text-white"
                style={{ backgroundColor: theme.primary }}
                onClick={() => handlePayNow(emp)}
                disabled={isPaying || netPay <= 0}
              >
                {isPaying ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</>
                ) : (
                  <><Banknote className="h-4 w-4 mr-2" /> Pay ₱{netPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</>
                )}
              </Button>
            </div>
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-h-screen">
      <main className="p-4 space-y-4 pb-24">

        {/* Header */}
        <section className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded-xl"
              style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
            >
              <Wallet className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-headline font-bold">{currentTenant?.name || 'Payroll'}</h3>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">Sahod Flow</p>
            </div>
          </div>
          <Button
            size="sm"
            className="h-8 w-8 rounded-full p-0 text-white"
            style={{ backgroundColor: theme.primary }}
            onClick={() => setShowAddForm(!showAddForm)}
          >
            <UserPlus className="h-4 w-4" />
          </Button>
        </section>

        {/* Add Employee Form */}
        {showAddForm && (
          <Card className="shadow-sm bg-white border-l-4" style={{ borderLeftColor: theme.primary }}>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <UserPlus className="h-4 w-4" style={{ color: theme.primary }} /> Add New Employee
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="emp-name" className="text-xs">Full Name</Label>
                  <Input id="emp-name" name="empName" placeholder="e.g. Maria Santos" value={newName} onChange={e => setNewName(e.target.value)} />
                </div>
                <div className="flex-1 space-y-1">
                  <Label htmlFor="emp-position" className="text-xs">Position</Label>
                  <Input id="emp-position" name="empPosition" placeholder="e.g. Cashier" value={newPosition} onChange={e => setNewPosition(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="salary-type" className="text-xs">Pay Type</Label>
                  <select
                    id="salary-type"
                    name="salaryType"
                    className="w-full border-slate-200 rounded-md border p-2 text-sm h-9"
                    value={newSalaryType}
                    onChange={e => setNewSalaryType(e.target.value as 'daily' | 'monthly')}
                  >
                    <option value="daily">Daily Rate</option>
                    <option value="monthly">Monthly Fixed</option>
                  </select>
                </div>
                <div className="flex-1 space-y-1">
                  <Label htmlFor="emp-rate" className="text-xs">
                    {newSalaryType === 'daily' ? 'Daily Rate (₱)' : 'Monthly Rate (₱)'}
                  </Label>
                  <Input
                    id="emp-rate"
                    name="empRate"
                    type="number"
                    placeholder="e.g. 600"
                    value={newRate}
                    onChange={e => setNewRate(parseFloat(e.target.value) || '')}
                  />
                </div>
              </div>
              <Button
                className="w-full h-8 text-xs font-bold text-white"
                style={{ backgroundColor: theme.primary }}
                onClick={handleAddEmployee}
                disabled={isAdding || !newName || !newRate}
              >
                {isAdding ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                Add to Roster
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Summary Banner & 13th Month Accrual */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card className={cn("text-white border-none shadow-xl overflow-hidden bg-gradient-to-br", theme.primaryBg, theme.glowClass)}>
            <div className="absolute right-0 top-0 h-32 w-32 translate-x-8 -translate-y-8 rounded-full bg-white/5 blur-2xl" />
            <CardContent className="p-4 relative z-10">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/70">Est. Payroll This Period</p>
              <p className="text-3xl font-black font-headline tracking-tighter mt-1">
                ₱{(totalEstimatedPayroll / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </p>
              <Badge className="mt-2 bg-white/10 text-white border-none backdrop-blur-sm">
                <Users className="h-3 w-3 mr-1" /> {activeEmployees.length} Active Staff
              </Badge>
            </CardContent>
          </Card>

          <Card className="bg-amber-500/10 border border-amber-500/20 shadow-sm rounded-2xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">13th Month Pay Reserve</p>
                <Gift className="h-4 w-4 text-amber-600" />
              </div>
              <p className="text-2xl font-black font-headline text-amber-900 mt-1">
                ₱{Math.round((totalEstimatedPayroll / 100) / 12).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <p className="text-[10px] text-amber-700/80 font-medium mt-2">
              Monthly accrued liability reserve to prevent year-end cash crunch.
            </p>
          </Card>
        </div>

        {/* Employee Roster */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Staff Roster</h3>
            <span className="text-[10px] font-bold text-slate-400">Tap to log & pay</span>
          </div>

          {loading && <div className="text-center py-8 text-xs text-slate-400">Loading roster...</div>}

          {!loading && employees.length === 0 && (
            <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-2xl">
              <Users className="h-8 w-8 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-400">No employees yet</p>
              <p className="text-xs text-slate-400 mt-1">Tap the + button to add your first staff member.</p>
            </div>
          )}

          <div className="space-y-2">
            {employees.map((emp: any) => (
              <EmployeeCard key={emp.id} emp={emp} />
            ))}
          </div>
        </section>

      </main>

      {selectedPayslipEmp && (
        <PayslipModal
          isOpen={!!selectedPayslipEmp}
          onClose={() => setSelectedPayslipEmp(null)}
          employee={selectedPayslipEmp}
          daysWorked={selectedPayslipEmp.daysWorked || 0}
          overtimeHours={selectedPayslipEmp.overtimeHours || 0}
          commissionsPesos={selectedPayslipEmp.commissionsPesos || 0}
          valeDeductionPesos={selectedPayslipEmp.valeDeductionPesos || 0}
          applyStatutory={selectedPayslipEmp.applyStatutory || false}
          tenantName={currentTenant?.name || "Katuwang Store"}
          theme={theme}
        />
      )}

    </div>
  );
}
