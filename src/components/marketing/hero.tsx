import React from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Handshake, ChevronRight, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface HeroProps {
  onEnterPortal: () => void;
  onAdminLogin: () => void;
}

export function Hero({ onEnterPortal, onAdminLogin }: HeroProps) {
  return (
    <>
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-border/10 flex justify-between items-center p-4 md:px-8 shadow-sm">
        <div className="flex items-center gap-2">
          <Handshake className="h-7 w-7 text-primary" strokeWidth={1.5} />
          <div className="flex flex-col">
            <span className="text-sm font-black tracking-[0.1em] text-primary uppercase leading-none">
              Katuwang
            </span>
            <span className="text-[9px] font-semibold uppercase tracking-[0.3em] text-slate-400 mt-0.5">
              Solutions
            </span>
          </div>
        </div>
        
        {/* Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-8">
          <a href="#products" className="text-[11px] font-bold text-slate-500 hover:text-primary uppercase tracking-[0.15em] transition-colors">Produkto</a>
          <a href="#about" className="text-[11px] font-bold text-slate-500 hover:text-primary uppercase tracking-[0.15em] transition-colors">Tungkol Sa Amin</a>
          <a href="#features" className="text-[11px] font-bold text-slate-500 hover:text-primary uppercase tracking-[0.15em] transition-colors">Benepisyo</a>
        </nav>

        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="sm" 
            className="hidden sm:flex text-[10px] font-bold h-9 px-4 rounded-xl text-slate-500 hover:bg-slate-100 uppercase tracking-widest transition-colors"
            onClick={onAdminLogin}
          >
            Admin
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="text-[11px] font-bold h-9 px-5 rounded-xl text-slate-800 border-slate-200 hover:bg-slate-50 hover:border-slate-300 uppercase tracking-widest transition-all"
            onClick={onEnterPortal}
          >
            Mag-Login
          </Button>
        </div>
      </header>

      <section className="px-6 pb-12 text-center flex flex-col items-center pt-16 md:pt-24 bg-gradient-to-b from-white to-slate-50/50">
        <div className="space-y-6 max-w-[400px] md:max-w-[700px] mb-10">
          <Badge variant="outline" className="rounded-full border-transparent bg-secondary/15 px-6 py-2 text-[10px] md:text-xs font-bold uppercase tracking-[0.15em] text-yellow-800 mx-auto inline-flex items-center gap-2">
            <Zap className="h-3 w-3 md:h-4 md:w-4 text-secondary" />
            Mura. Mabilis. Maaasahan.
          </Badge>
          
          <h1 className="text-[2.5rem] md:text-6xl font-black text-slate-900 leading-[1.1] tracking-tight">
            Ang <span className="text-primary">Katuwang</span> ng Negosyo Mo.
          </h1>
          <p className="text-slate-600 text-base md:text-xl leading-relaxed opacity-90 max-w-[550px] mx-auto font-medium">
            Upgrade your daily operations. Walang kahirap-hirap na sales, inventory, at utang tracking para sa mga tindahan, palengke, at services.
          </p>
        </div>

        <div className="w-full max-w-[320px] md:max-w-sm space-y-4 mb-16">
          <Button 
            className={cn(
              "w-full h-16 rounded-[20px] text-lg font-bold bg-primary text-white hover:bg-primary/95 hover:-translate-y-0.5 transition-all active:scale-[0.98] shadow-xl shadow-primary/25 flex items-center justify-between px-6 border-none"
            )}
            onClick={onEnterPortal}
          >
            <span className="tracking-tight">Magsimula Ngayon</span>
            <div className="flex items-center gap-3">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold line-through text-white/50">₱199</span>
                <span className="text-sm font-black text-secondary tracking-tight">₱99/mo</span>
              </div>
              <ChevronRight className="h-5 w-5 opacity-90" />
            </div>
          </Button>
          <p className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-bold">
            Walang setup fee. Cancel anytime.
          </p>
        </div>

        <div className="w-full max-w-2xl rounded-[32px] overflow-hidden shadow-2xl relative aspect-[16/10] bg-slate-100 border-8 border-white">
          <Image 
            src="/katuwang-partnership.png" 
            alt="Katuwang Partnership"
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent pointer-events-none flex flex-col justify-end p-8 md:p-10">
            <p className="text-white text-xs md:text-sm font-bold tracking-[0.3em] uppercase opacity-100 drop-shadow-md">
              Kasama mo sa bawat hakbang.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
