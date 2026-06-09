"use client";

import React, { useState } from 'react';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetDescription,
  SheetTrigger
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { HelpCircle, Info, BookOpen } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getModuleTheme } from '@/lib/theme-utils';
import { useHaptic } from '@/hooks/use-haptic';

interface HelpGuideDrawerProps {
  activeModule: string;
}

export function HelpGuideDrawer({ activeModule }: HelpGuideDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const theme = getModuleTheme(activeModule);
  const haptic = useHaptic();

  const getGuideContent = () => {
    switch (activeModule) {
      case 'benta-snap':
      case 'build-stack':
      case 'bite-snap':
        return (
          <div className="space-y-6">
            <section>
              <h3 className="font-bold text-lg text-slate-900 mb-2">Paano Gamitin ang POS</h3>
              <p className="text-sm text-slate-600">
                Pindutin ang mga produkto para idagdag sa cart. Kung may barcode scanner ka, pwede mong i-scan ang mga item para mabilis!
              </p>
            </section>
            <section>
              <h3 className="font-bold text-lg text-slate-900 mb-2">Pagtangap ng Bayad</h3>
              <p className="text-sm text-slate-600">
                Pindutin ang "Checkout" at piliin kung Cash, GCash, o Utang (Palista). Kapag Palista, awtomatiko itong mapupunta sa 5-6 Tracker kung rehistrado ang customer.
              </p>
            </section>
          </div>
        );
      case 'hiram-snap':
        return (
          <div className="space-y-6">
            <section>
              <h3 className="font-bold text-lg text-slate-900 mb-2">Pagpapautang (5-6)</h3>
              <p className="text-sm text-slate-600">
                Ilista ang pangalan ng inutangan at ilagay ang halaga ng principal. Ang sistema na ang bahala mag-compute ng 20% interest at penalty kung late magbayad.
              </p>
            </section>
            <section>
              <h3 className="font-bold text-lg text-slate-900 mb-2">Pag-apply ng Penalty</h3>
              <p className="text-sm text-slate-600">
                Kung lagpas na sa due date, pindutin ang "Late Penalty" sa profile ng borrower para idagdag ang kaukulang multa.
              </p>
            </section>
          </div>
        );
      case 'ledger-flow':
      case 'sahod-flow':
        return (
          <div className="space-y-6">
            <section>
              <h3 className="font-bold text-lg text-slate-900 mb-2">Pag-track ng Pera</h3>
              <p className="text-sm text-slate-600">
                Lahat ng benta ay awtomatikong pumapasok dito. Kung may ilalabas kang pera para sa kuryente, tubig, o suweldo, i-record ito bilang "Expense" para laging balanse ang pera.
              </p>
            </section>
          </div>
        );
      default:
        return (
          <div className="space-y-6">
            <section>
              <h3 className="font-bold text-lg text-slate-900 mb-2">Pangkalahatang Gabay</h3>
              <p className="text-sm text-slate-600">
                Gamitin ang bottom navigation para magpalipat-lipat sa Home, Sales, at Reports. Lahat ng data mo ay naka-save ng ligtas at pribado sa iyong Katuwang account.
              </p>
            </section>
          </div>
        );
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          onClick={() => haptic(10)}
          className="fixed bottom-20 right-4 h-14 w-14 rounded-full shadow-2xl flex items-center justify-center z-40 transition-transform active:scale-90"
          style={{ backgroundColor: theme.primary, color: 'white' }}
        >
          <HelpCircle className="h-6 w-6" />
        </Button>
      </SheetTrigger>

      <SheetContent side="bottom" className="h-[75vh] sm:h-[80vh] rounded-t-3xl flex flex-col p-0 z-50">
        <SheetHeader className="px-6 py-5 border-b border-slate-100 text-left shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="h-5 w-5 text-slate-400" />
            <SheetTitle className="text-xl font-black uppercase tracking-tight text-slate-900">
              Tulong at Gabay
            </SheetTitle>
          </div>
          <SheetDescription className="text-xs font-bold uppercase tracking-widest text-slate-500">
            Katuwang Solutions Manual
          </SheetDescription>
        </SheetHeader>
        
        <ScrollArea className="flex-1 px-6 py-6 bg-slate-50/50">
          {getGuideContent()}
          
          <div className="mt-8 p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-800 leading-relaxed font-medium">
              Kailangan pa ng tulong? Mag-message lang sa aming Facebook Page o tawagan ang aming hotline.
            </p>
          </div>
        </ScrollArea>
        
        <div className="p-4 border-t border-slate-100 bg-white shrink-0" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
          <Button 
            onClick={() => setIsOpen(false)}
            className="w-full h-14 rounded-2xl text-base font-bold shadow-lg"
            style={{ backgroundColor: theme.primary, color: 'white' }}
          >
            Naiintindihan Ko
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
