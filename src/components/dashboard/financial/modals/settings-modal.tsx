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
        <h3 className="font-black text-xl mb-1 text-slate-800 tracking-tight">Budget Cycle Settings</h3>
        <p className="text-xs text-slate-500 mb-5 leading-relaxed">Customize your payday and budget reset cycle.</p>
        
        {/* Cycle Type Segmented Control */}
        <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-2">Cycle Type</label>
        <div className="bg-slate-100 p-1 rounded-2xl flex gap-1 mb-5">
          <button
            type="button"
            onClick={() => setCycleType('monthly')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${cycleType === 'monthly' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setCycleType('15-days')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${cycleType === '15-days' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            15 Days
          </button>
          <button
            type="button"
            onClick={() => setCycleType('weekly')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${cycleType === 'weekly' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Weekly
          </button>
        </div>

        {/* Reset Date Selection */}
        <div className="space-y-3 mb-6">
          <label className="block text-xs font-black uppercase tracking-wider text-slate-400">
            {cycleType === 'weekly' ? 'Reset Day of Week' : cycleType === '15-days' ? 'Payday Dates (1-31)' : 'Payday Date (1-31)'}
          </label>

          {cycleType === 'weekly' ? (
            <div className="grid grid-cols-4 gap-1.5">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => setPaydayCycle(idx)}
                  className={`py-2 rounded-xl text-xs font-bold border transition-all ${paydayCycle === idx ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                >
                  {day}
                </button>
              ))}
            </div>
          ) : cycleType === '15-days' ? (
            <div className="space-y-3">
              {/* Quick Presets for 15 Days */}
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => { setPaydayCycle(15); setSecondPaydayCycle(30); }}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${paydayCycle === 15 && secondPaydayCycle === 30 ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                >
                  15 & 30
                </button>
                <button
                  type="button"
                  onClick={() => { setPaydayCycle(1); setSecondPaydayCycle(16); }}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${paydayCycle === 1 && secondPaydayCycle === 16 ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                >
                  1 & 16
                </button>
                <button
                  type="button"
                  onClick={() => { setPaydayCycle(10); setSecondPaydayCycle(25); }}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${paydayCycle === 10 && secondPaydayCycle === 25 ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                >
                  10 & 25
                </button>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label htmlFor="first-payday-input" className="text-[9px] font-black uppercase text-slate-400 mb-1 block">1st Payday</label>
                  <input id="first-payday-input" name="paydayCycle" required type="number" min={1} max={31} value={paydayCycle} onChange={(e) => setPaydayCycle(Number(e.target.value))} className="w-full bg-slate-50 p-3 rounded-xl font-bold text-slate-800 outline-none border border-slate-200 focus:border-emerald-500 text-center" />
                </div>
                <div className="flex-1">
                  <label htmlFor="second-payday-input" className="text-[9px] font-black uppercase text-slate-400 mb-1 block">2nd Payday</label>
                  <input id="second-payday-input" name="secondPaydayCycle" required type="number" min={1} max={31} value={secondPaydayCycle} onChange={(e) => setSecondPaydayCycle(Number(e.target.value))} className="w-full bg-slate-50 p-3 rounded-xl font-bold text-slate-800 outline-none border border-slate-200 focus:border-emerald-500 text-center" />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Quick Presets for Monthly */}
              <div className="flex gap-1.5">
                {[15, 30, 1].map((date) => (
                  <button
                    key={date}
                    type="button"
                    onClick={() => setPaydayCycle(date)}
                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${paydayCycle === date ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                  >
                    Every {date}{date === 1 ? 'st' : 'th'}
                  </button>
                ))}
              </div>
              <label htmlFor="monthly-payday-input" className="sr-only">Payday Date</label>
              <input id="monthly-payday-input" name="paydayCycle" required type="number" min={1} max={31} value={paydayCycle} onChange={(e) => setPaydayCycle(Number(e.target.value))} className="w-full bg-slate-50 p-3 rounded-xl font-bold text-slate-800 outline-none border border-slate-200 focus:border-emerald-500 text-center" />
            </div>
          )}
        </div>
        
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1 rounded-xl font-bold text-slate-500">Cancel</Button>
          <Button type="submit" className="flex-1 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold">Save Settings</Button>
        </div>
      </form>
    </div>
  );
}
