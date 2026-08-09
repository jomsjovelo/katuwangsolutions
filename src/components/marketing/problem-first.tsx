'use client';

import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { RegisterSheet, useRegisterSheet } from '@/components/marketing/register-sheet';
import { trackModuleDiscovery } from '@/lib/conversion-events';

const PROBLEMS = [
  {
    id: 'kita',
    emoji: '📊',
    challenge: 'Hindi ko alam ang tunay kong kita',
    solution: 'Ledger Flow para sa pag-record at pag-review ng income at expense records.',
    module: 'Ledger Flow',
    moduleId: 'ledger-flow',
    color: '#6366F1',
  },
  {
    id: 'utang',
    emoji: '📒',
    challenge: 'Nalilimutan ang utang ng suki',
    solution: '5-6 Tracker para sa loan, balance, collection, at credit-limit records.',
    module: '5-6 Tracker',
    moduleId: '5-6-tracker',
    color: '#10B981',
  },
  {
    id: 'stock',
    emoji: '📦',
    challenge: 'Laging out of stock ang mga produkto',
    solution: 'Benta Snap para sa sales recording, inventory monitoring, at customer credit tracking.',
    module: 'Benta Snap',
    moduleId: 'benta-snap',
    color: '#06B6D4',
  },
  {
    id: 'inventory',
    emoji: '🏗️',
    challenge: 'Magulo ang inventory ng hardware',
    solution: 'Build Stack para sa hardware sales, inventory, at customer credit records.',
    module: 'Build Stack',
    moduleId: 'build-stack',
    color: '#475569',
  },
  {
    id: 'delivery',
    emoji: '🚛',
    challenge: 'Mahirap mag-monitor ng deliveries',
    solution: 'Biyahe Sync para sa trips, customer charges, fuel, tolls, expenses, at income records.',
    module: 'Biyahe Sync',
    moduleId: 'biyahe-sync',
    color: '#3B82F6',
  },
  {
    id: 'records',
    emoji: '🗂️',
    challenge: 'Hindi organize ang records ng negosyo',
    solution: 'Ledger Flow para sa pag-record at pag-review ng income at expense records.',
    module: 'Ledger Flow',
    moduleId: 'ledger-flow',
    color: '#6366F1',
  },
  {
    id: 'hospitality',
    emoji: '🏨',
    challenge: 'Magulo ang monitoring ng available rooms at guest check-ins',
    solution: 'Tsek-In para sa room status, guest stays, at checkout billing workflow.',
    module: 'Tsek-In',
    moduleId: 'tsek-in',
    color: '#D97706',
  },
  {
    id: 'budget',
    emoji: '💸',
    challenge: 'Saan napupunta ang pera at budget ko?',
    solution: 'Budget Mo para sa budgets, transactions, debts, at savings records.',
    module: 'Budget Mo',
    moduleId: 'budget-mo',
    color: '#8B5CF6',
  },
];

export function ProblemFirst() {
  const [selected, setSelected] = useState<string | null>(null);
  const { open, openSheet, closeSheet, initialAppId } = useRegisterSheet();

  const selectedProblem = PROBLEMS.find(p => p.id === selected);

  const handleSelect = (id: string) => {
    if (selected === id) {
      setSelected(null);
    } else {
      setSelected(id);
      const prob = PROBLEMS.find(p => p.id === id);
      if (prob) {
        trackModuleDiscovery(prob.moduleId, 'problem_finder');
      }
    }
  };

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
            <p className="text-slate-500 text-sm">I-tap ang pinaka-malapit sa iyong sitwasyon at ipapakita namin ang module na nakatalaga sa napiling concern.</p>
          </div>

          {/* Problem cards */}
          <div className="grid grid-cols-1 gap-2.5 mb-6">
            {PROBLEMS.map(({ id, emoji, challenge, color }) => {
              const isSelected = selected === id;
              return (
                <button
                  key={id}
                  onClick={() => handleSelect(id)}
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
              <div className="flex gap-2">
                <button
                  onClick={() => openSheet(selectedProblem.moduleId)}
                  className="flex-1 h-12 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                  style={{ backgroundColor: selectedProblem.color }}
                >
                  Mag-register para sa {selectedProblem.module}
                  <ChevronRight className="h-4 w-4" />
                </button>
                <a
                  href={`/${selectedProblem.moduleId}`}
                  className="w-24 flex-shrink-0 h-12 rounded-xl font-bold text-xs flex items-center justify-center gap-1 active:scale-95 transition-all"
                  style={{ color: selectedProblem.color, backgroundColor: `${selectedProblem.color}15` }}
                >
                  Learn More
                </a>
              </div>
              <p className="text-xs text-slate-600 mt-1 text-center font-medium">
                {selectedProblem.moduleId === 'budget-mo' ? (
                  <span>Promo <strong className="text-primary">₱50/mo</strong> (regular ₱100/mo) bawat module · Manual ang renewal; walang automatic debit sa kasalukuyang workflow.</span>
                ) : (
                  <span>Promo <strong className="text-primary">₱99/mo</strong> (regular ₱199/mo) bawat module · Manual ang renewal; walang automatic debit sa kasalukuyang workflow.</span>
                )}
              </p>
            </div>
          )}
        </div>
      </section>

      <RegisterSheet open={open} onClose={closeSheet} initialAppId={initialAppId || selectedProblem?.moduleId} ctaSource="problem_finder" />
    </>
  );
}
