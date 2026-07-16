'use client';

import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { RegisterSheet, useRegisterSheet } from '@/components/marketing/register-sheet';

const PROBLEMS = [
  {
    id: 'kita',
    emoji: '📊',
    challenge: 'Hindi ko alam ang tunay kong kita',
    solution: 'Ledger Flow awtomatikong nagtatala ng lahat ng pumasok at lumabas na pera.',
    module: 'Ledger Flow',
    moduleId: 'ledger-flow',
    color: '#6366F1',
  },
  {
    id: 'utang',
    emoji: '📒',
    challenge: 'Nalilimutan ang utang ng suki',
    solution: '5-6 Tracker at Benta Snap ay may built-in na Utang Tracker para sa bawat suki.',
    module: '5-6 Tracker',
    moduleId: '5-6-tracker',
    color: '#10B981',
  },
  {
    id: 'stock',
    emoji: '📦',
    challenge: 'Laging out of stock ang mga produkto',
    solution: 'Benta Snap at Fresh Tally awtomatikong nagbabawas ng stock sa bawat benta.',
    module: 'Benta Snap',
    moduleId: 'benta-snap',
    color: '#06B6D4',
  },
  {
    id: 'inventory',
    emoji: '🏗️',
    challenge: 'Magulo ang inventory ng hardware',
    solution: 'Build Stack ay espesyal na dinisenyo para sa hardware store at construction supply.',
    module: 'Build Stack',
    moduleId: 'build-stack',
    color: '#475569',
  },
  {
    id: 'delivery',
    emoji: '🚛',
    challenge: 'Mahirap mag-monitor ng deliveries',
    solution: 'Biyahe Sync ay nagtatala ng bawat biyahe, gastos, at kita ng iyong trucking.',
    module: 'Biyahe Sync',
    moduleId: 'biyahe-sync',
    color: '#3B82F6',
  },
  {
    id: 'records',
    emoji: '🗂️',
    challenge: 'Hindi organize ang records ng negosyo',
    solution: 'Ledger Flow ang central na sistema para sa lahat ng financial records ng negosyo mo.',
    module: 'Ledger Flow',
    moduleId: 'ledger-flow',
    color: '#6366F1',
  },
];

export function ProblemFirst() {
  const [selected, setSelected] = useState<string | null>(null);
  const { open, openSheet, closeSheet } = useRegisterSheet();

  const selectedProblem = PROBLEMS.find(p => p.id === selected);

  return (
    <>
      <section className="py-14 px-5 bg-white border-t border-slate-100">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Hanapin ang Solusyon</p>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-tight">
              Alin dito ang{' '}
              <span className="text-primary">challenge</span>
              <br />sa negosyo mo?
            </h2>
            <p className="text-slate-500 text-sm">I-tap ang pinaka-malapit sa iyong sitwasyon at ipapakita namin ang solusyon.</p>
          </div>

          {/* Problem cards */}
          <div className="grid grid-cols-1 gap-2.5 mb-6">
            {PROBLEMS.map(({ id, emoji, challenge, color }) => {
              const isSelected = selected === id;
              return (
                <button
                  key={id}
                  onClick={() => setSelected(isSelected ? null : id)}
                  className="flex items-center gap-3.5 p-4 rounded-2xl border text-left transition-all active:scale-[0.99] duration-150 w-full"
                  style={isSelected
                    ? { backgroundColor: `${color}10`, borderColor: color }
                    : { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }
                  }
                >
                  <span className="text-2xl flex-shrink-0">{emoji}</span>
                  <span
                    className="font-bold text-sm leading-snug"
                    style={{ color: isSelected ? color : '#1e293b' }}
                  >
                    {challenge}
                  </span>
                  <div
                    className="ml-auto h-5 w-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all"
                    style={isSelected
                      ? { backgroundColor: color, borderColor: color }
                      : { borderColor: '#cbd5e1' }
                    }
                  >
                    {isSelected && <div className="h-2 w-2 rounded-full bg-white" />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Solution banner */}
          {selectedProblem && (
            <div
              className="rounded-2xl p-5 space-y-3 animate-in slide-in-from-bottom-2 duration-300"
              style={{ backgroundColor: `${selectedProblem.color}10`, borderWidth: 1, borderColor: `${selectedProblem.color}25` }}
            >
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: selectedProblem.color }}>
                  Solusyon para sa iyo
                </p>
                <p className="font-black text-slate-900 text-base">{selectedProblem.module}</p>
                <p className="text-sm text-slate-600 leading-relaxed">{selectedProblem.solution}</p>
              </div>
              <button
                onClick={openSheet}
                className="w-full h-12 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                style={{ backgroundColor: selectedProblem.color }}
              >
                Subukan ang {selectedProblem.module}
                <ChevronRight className="h-4 w-4" />
              </button>
              <p className="text-[10px] text-center font-medium" style={{ color: selectedProblem.color }}>
                ₱99 / buwan · No auto-renew · Works Offline
              </p>
            </div>
          )}
        </div>
      </section>

      <RegisterSheet open={open} onClose={closeSheet} />
    </>
  );
}
