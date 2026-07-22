import React from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { BudgetPersona, CycleType } from '../budget-mo-dashboard';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  persona: BudgetPersona;
  setPersona: (persona: BudgetPersona) => void;
  cycleType: CycleType;
  setCycleType: (cycleType: CycleType) => void;
  paydayCycle: number;
  setPaydayCycle: (cycle: number) => void;
  secondPaydayCycle: number;
  setSecondPaydayCycle: (cycle: number) => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  persona,
  setPersona,
  cycleType,
  setCycleType,
  paydayCycle,
  setPaydayCycle,
  secondPaydayCycle,
  setSecondPaydayCycle,
}: SettingsModalProps) {
  const { toast } = useToast();

  const safeSetStorage = (key: string, value: string) => {
    try { localStorage.setItem(key, value); } catch {}
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
      <form onSubmit={(e) => {
          e.preventDefault();
          safeSetStorage('budgetSensePersona', persona || 'worker');
          safeSetStorage('budgetSenseCycleType', cycleType);
          safeSetStorage('budgetSensePayday', paydayCycle.toString());
          safeSetStorage('budgetSenseSecondPayday', secondPaydayCycle.toString());
          toast({title: 'Settings Saved', description: 'Your persona and cycle have been updated.'});
          onClose();
      }} className="bg-white p-6 rounded-[32px] w-full max-w-sm shadow-2xl">
        <h3 className="font-black text-xl mb-1">Budget Settings</h3>
        <p className="text-xs text-slate-500 mb-4">Set your preferences to improve your budgeting experience.</p>
        
        <label className="block text-sm font-bold text-slate-800 mb-2">Your Profile</label>
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button type="button" onClick={() => { setPersona('student'); setCycleType('weekly'); }} className={`p-2 rounded-xl border text-center transition-all flex flex-col items-center justify-center ${persona === 'student' ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}>
            <div className="text-xl mb-1">🎓</div>
            <div className="text-[10px]">Student</div>
          </button>
          <button type="button" onClick={() => { setPersona('worker'); setCycleType('15-days'); }} className={`p-2 rounded-xl border text-center transition-all flex flex-col items-center justify-center ${persona === 'worker' ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}>
            <div className="text-xl mb-1">💼</div>
            <div className="text-[10px]">Worker</div>
          </button>
          <button type="button" onClick={() => { setPersona('freelancer'); setCycleType('monthly'); }} className={`p-2 rounded-xl border text-center transition-all flex flex-col items-center justify-center ${persona === 'freelancer' ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}>
            <div className="text-xl mb-1">💻</div>
            <div className="text-[10px]">Freelance</div>
          </button>
          <button type="button" onClick={() => { setPersona('business'); setCycleType('monthly'); }} className={`p-2 rounded-xl border text-center transition-all flex flex-col items-center justify-center ${persona === 'business' ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}>
            <div className="text-xl mb-1">🏢</div>
            <div className="text-[10px]">Business</div>
          </button>
        </div>

        <label className="block text-sm font-bold text-slate-800 mb-2">Cycle Type</label>
        <select value={cycleType} onChange={(e) => setCycleType(e.target.value as CycleType)} className="w-full bg-slate-50 p-4 rounded-2xl mb-4 font-medium outline-none border border-slate-100 focus:border-emerald-500">
          <option value="monthly">Monthly</option>
          <option value="15-days">15 Days</option>
          <option value="weekly">Weekly</option>
        </select>

        <label className="block text-sm font-bold text-slate-800 mb-1">
          {persona === 'student' ? 'Allowance Reset Day' : 
            persona === 'worker' ? (cycleType === '15-days' ? 'Salary Days (1-31)' : 'Payday Date (1-31)') :
            persona === 'freelancer' ? 'Monthly Tracking Start Date' :
            persona === 'business' ? 'Accounting Cycle Start (1-31)' :
            cycleType === 'weekly' ? 'Reset Day' : cycleType === '15-days' ? 'Reset Dates (1-31)' : 'Reset Date (1-31)'}
        </label>
        <p className="text-[10px] text-slate-500 mb-3 leading-relaxed">
          {persona === 'student' ? 'Track your weekly allowance and school expenses.' :
            persona === 'worker' ? 'Track your salary and regular bills.' :
            persona === 'freelancer' ? 'Manage irregular income and monthly project budgets.' :
            persona === 'business' ? 'Track operational expenses and revenue cycles.' : ''}
        </p>
        {cycleType === 'weekly' ? (
          <select value={paydayCycle} onChange={(e) => setPaydayCycle(Number(e.target.value))} className="w-full bg-slate-50 p-4 rounded-2xl mb-6 font-medium outline-none border border-slate-100 focus:border-emerald-500">
            <option value={0}>Sunday</option>
            <option value={1}>Monday</option>
            <option value={2}>Tuesday</option>
            <option value={3}>Wednesday</option>
            <option value={4}>Thursday</option>
            <option value={5}>Friday</option>
            <option value={6}>Saturday</option>
          </select>
        ) : cycleType === '15-days' ? (
          <div className="flex gap-2 mb-6">
            <div className="flex-1">
              <span className="text-[9px] font-black uppercase text-slate-400 mb-1 block">1st</span>
              <input required type="number" min={1} max={31} value={paydayCycle} onChange={(e) => setPaydayCycle(Number(e.target.value))} className="w-full bg-slate-50 p-4 rounded-2xl font-medium outline-none border border-slate-100 focus:border-emerald-500" />
            </div>
            <div className="flex-1">
              <span className="text-[9px] font-black uppercase text-slate-400 mb-1 block">2nd</span>
              <input required type="number" min={1} max={31} value={secondPaydayCycle} onChange={(e) => setSecondPaydayCycle(Number(e.target.value))} className="w-full bg-slate-50 p-4 rounded-2xl font-medium outline-none border border-slate-100 focus:border-emerald-500" />
            </div>
          </div>
        ) : (
          <input required type="number" min={1} max={31} value={paydayCycle} onChange={(e) => setPaydayCycle(Number(e.target.value))} className="w-full bg-slate-50 p-4 rounded-2xl mb-6 font-medium outline-none border border-slate-100 focus:border-emerald-500" />
        )}
        
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1 rounded-xl">Cancel</Button>
          <Button type="submit" className="flex-1 bg-black hover:bg-slate-800 text-white rounded-xl font-bold">Save</Button>
        </div>
      </form>
    </div>
  );
}
