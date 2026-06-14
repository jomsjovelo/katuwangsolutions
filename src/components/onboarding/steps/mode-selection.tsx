import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Store, Users, ArrowRight, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface ModeSelectionStepProps {
  onSelectStartBusiness: () => void;
}

export function ModeSelectionStep({ onSelectStartBusiness }: ModeSelectionStepProps) {
  const router = useRouter();
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [businessCode, setBusinessCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (businessCode.length !== 7) return;
    setIsJoining(true);
    // Redirect to login modal with the business code pre-filled
    router.push(`/?code=${businessCode.toUpperCase()}`);
  };

  if (showJoinForm) {
    return (
      <div className="flex flex-col items-center justify-center p-6 h-full text-center max-w-md mx-auto fade-in slide-in-from-bottom-4 animate-in duration-300">
        <div className="h-16 w-16 bg-primary/10 text-primary rounded-[20px] flex items-center justify-center mb-6 shadow-sm border border-primary/20">
          <Users className="h-8 w-8" />
        </div>
        
        <h2 className="text-3xl font-black font-headline uppercase tracking-tight text-slate-800 mb-2">
          Sali sa Team
        </h2>
        <p className="text-sm font-medium text-slate-500 mb-8 max-w-[280px]">
          I-type ang 7-character Business Code na binigay ng inyong Store Owner.
        </p>

        <form onSubmit={handleJoin} className="w-full space-y-6">
          <Input
            value={businessCode}
            onChange={(e) => setBusinessCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 7).toUpperCase())}
            placeholder="A4X9BQ2"
            className="h-20 text-center text-4xl font-black tracking-[0.5em] uppercase rounded-2xl bg-white border-2 border-slate-200 focus-visible:border-primary focus-visible:ring-primary shadow-sm"
            autoFocus
          />
          
          <div className="space-y-3">
            <Button 
              type="submit"
              disabled={businessCode.length !== 7 || isJoining}
              className="w-full h-14 rounded-xl font-bold uppercase tracking-widest text-sm shadow-lg hover:shadow-xl transition-all joy-glow active:scale-95 flex items-center justify-center gap-2"
            >
              {isJoining ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Mag-patuloy'}
              {!isJoining && <ArrowRight className="h-5 w-5" />}
            </Button>
            
            <Button
              type="button"
              variant="ghost"
              disabled={isJoining}
              onClick={() => setShowJoinForm(false)}
              className="w-full h-12 rounded-xl font-bold text-slate-400 hover:text-slate-600 uppercase tracking-widest text-xs"
            >
              Bumalik
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-6 h-full text-center max-w-md mx-auto space-y-6 fade-in animate-in duration-300">
      <div className="space-y-2 mb-4">
        <h2 className="text-3xl font-black font-headline uppercase tracking-tight text-slate-800">
          Ano ang gusto mong gawin?
        </h2>
        <p className="text-sm font-medium text-slate-500 max-w-[280px] mx-auto">
          Pumili kung ikaw ba ay mag-uumpisa ng sariling negosyo o sasali sa existing na tindahan.
        </p>
      </div>

      <button
        onClick={onSelectStartBusiness}
        className="w-full bg-white p-6 rounded-[24px] border-2 border-slate-100 hover:border-primary shadow-sm hover:shadow-md transition-all active:scale-95 group text-left relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
          <Store className="w-24 h-24" />
        </div>
        <div className="flex items-center gap-4 relative">
          <div className="h-12 w-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center shrink-0">
            <Store className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-black uppercase tracking-widest text-slate-800 text-sm mb-1">Magsimula ng Negosyo</h3>
            <p className="text-xs font-medium text-slate-500 leading-relaxed">Gagawa ako ng account para sa aking bagong tindahan.</p>
          </div>
        </div>
      </button>

      <button
        onClick={() => setShowJoinForm(true)}
        className="w-full bg-white p-6 rounded-[24px] border-2 border-slate-100 hover:border-teal-500 shadow-sm hover:shadow-md transition-all active:scale-95 group text-left relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
          <Users className="w-24 h-24" />
        </div>
        <div className="flex items-center gap-4 relative">
          <div className="h-12 w-12 bg-teal-500/10 text-teal-600 rounded-xl flex items-center justify-center shrink-0">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-black uppercase tracking-widest text-slate-800 text-sm mb-1">Sali sa Existing Team</h3>
            <p className="text-xs font-medium text-slate-500 leading-relaxed">May ibinigay na code sa akin ang aking Store Owner.</p>
          </div>
        </div>
      </button>
    </div>
  );
}
