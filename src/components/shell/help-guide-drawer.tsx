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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BookOpen, HelpCircle, Download, Share, PlusSquare, Gift, Smartphone, Info, Wallet, History, Users, WifiOff } from 'lucide-react';
import { getModuleTheme } from '@/lib/theme-utils';
import { useHaptic } from '@/hooks/use-haptic';
import { MODULE_GUIDES, DEFAULT_GUIDE } from '@/components/common/module-guide';
import { usePWAInstall } from '@/hooks/use-pwa-install';
import { useTenant } from '@/app/lib/tenant-context';

interface HelpGuideDrawerProps {
  activeModule?: string;
  isOpen?: boolean;
  onClose?: () => void;
  showFloatingButton?: boolean;
}

export function HelpGuideDrawer({ 
  activeModule, 
  isOpen: externalIsOpen, 
  onClose,
  showFloatingButton = true 
}: HelpGuideDrawerProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const { deferredPrompt, isInstalled, triggerInstall } = usePWAInstall();
  const haptic = useHaptic();
  const { currentTenant } = useTenant();

  const isControlled = externalIsOpen !== undefined;
  const isOpen = isControlled ? externalIsOpen : internalIsOpen;
  
  const handleOpenChange = (open: boolean) => {
    if (!open && onClose) onClose();
    if (!isControlled) setInternalIsOpen(open);
  };

  const moduleType = activeModule || currentTenant?.moduleType || 'benta-snap';
  const theme = getModuleTheme(moduleType);
  const guide = MODULE_GUIDES[moduleType] || DEFAULT_GUIDE;

  return (
    <>
      <Sheet open={isOpen} onOpenChange={handleOpenChange}>
        {showFloatingButton && !isControlled && (
          <SheetTrigger asChild>
            <Button
              onClick={() => haptic(10)}
              className="fixed bottom-20 right-4 h-14 w-14 rounded-full shadow-2xl flex items-center justify-center z-40 transition-transform active:scale-90"
              style={{ backgroundColor: theme.primary, color: 'white' }}
            >
              <HelpCircle className="h-6 w-6" />
            </Button>
          </SheetTrigger>
        )}

        <SheetContent className="sm:max-w-md w-full flex flex-col h-full bg-slate-50 p-0 overflow-hidden z-[60]">
          <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10 shrink-0">
            <div className="flex items-center gap-3">
              <SheetHeader className="text-left space-y-0">
                <SheetTitle className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                  <HelpCircle className="h-5 w-5" style={{ color: theme.primary }} />
                  Help & Support
                </SheetTitle>
                <SheetDescription className="sr-only">
                  Guide and documentation for the active module.
                </SheetDescription>
              </SheetHeader>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <BookOpen className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-widest">
                  {moduleType} Manual
                </span>
              </div>
              <h3 className="text-2xl font-black text-slate-800 leading-tight">
                {guide.tagline}
              </h3>
            </div>

            <div className="space-y-4">
              {guide.steps.map((step, idx) => (
                <div key={idx} className="flex items-start gap-4 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm transition-transform hover:scale-[1.02]">
                  <span 
                    className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-black text-white flex-shrink-0"
                    style={{ backgroundColor: theme.primary }}
                  >
                    {idx + 1}
                  </span>
                  <p className="text-sm text-slate-700 font-medium leading-relaxed pt-1">
                    {step}
                  </p>
                </div>
              ))}
            </div>
            
            {guide.example && (
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-4">
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Halimbawa ng Transaksyon</h4>
                
                <div className="space-y-3">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Sitwasyon</span>
                    <p className="text-sm font-semibold text-slate-700">{guide.example.scenario}</p>
                  </div>
                  <div className="border-t border-slate-200/50 pt-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Paano Gawin</span>
                    <p className="text-sm text-slate-600">{guide.example.action}</p>
                  </div>
                  <div className="border-t border-slate-200/50 pt-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Resulta</span>
                    <p className="text-sm font-medium" style={{ color: theme.primary }}>{guide.example.result}</p>
                  </div>
                </div>
              </div>
            )}
            {/* Offline Mode & Syncing */}
            <div className="flex items-center gap-2 mb-4 mt-8 border-b border-slate-100 pb-2">
              <span className="text-xl">⚙️</span>
              <h3 className="font-black text-slate-800 tracking-tight">System & Offline</h3>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 p-5 rounded-2xl flex items-start gap-3">
               <div className="bg-indigo-100 p-2.5 rounded-xl shrink-0 mt-0.5">
                 <WifiOff className="h-5 w-5 text-indigo-600" />
               </div>
               <div>
                 <h4 className="font-black text-sm text-indigo-900 tracking-tight leading-tight mb-1">Offline Mode & Syncing</h4>
                 <p className="text-[11px] text-indigo-800 font-medium leading-relaxed">
                   Pwede mong gamitin ang Katuwang App kahit <strong className="font-black">walang internet (Offline)</strong>! Patuloy kang makakapaglista ng benta o gastos. Ngunit, para mag-sync at ma-save ang iyong mga nilista sa system (at makita ng ibang staff), <strong className="font-black">kailangan mong kumonekta sa internet</strong>.
                 </p>
               </div>
            </div>
            
            {/* FAQ Section */}
            <div className="flex items-center gap-2 mb-4 mt-8 border-b border-slate-100 pb-2">
              <span className="text-xl">📋</span>
              <h3 className="font-black text-slate-800 tracking-tight">Frequently Asked Questions</h3>
            </div>
            
            <div className="space-y-3">
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl">
                <p className="text-xs font-bold text-slate-800 mb-1">Paano ko mapasasali ang aking Staff?</p>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Ibigay ang inyong 7-character <strong className="font-bold text-slate-800">Business Code</strong> sa inyong staff (makikita sa Profile Tab). Pagkatapos nilang mag-register gamit ang code na ito, kailangan mo silang i-<strong className="font-bold text-slate-800">Approve</strong> sa iyong Profile Tab bago sila makapasok sa system para masiguro ang seguridad ng inyong tindahan.
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl">
                <p className="text-xs font-bold text-slate-800 mb-1">Bakit hindi pa nag-a-activate ang account ko?</p>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Ang bawat account ay dumadaan sa manual verification para iwas-spam. Karaniwang tumatagal ito ng 1–3 business days. Makakatanggap ka ng email kapag active na!
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl">
                <p className="text-xs font-bold text-slate-800 mb-1">Nakalimutan ko ang password ko, paano mag-reset?</p>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Sa login screen, i-click ang "Nakalimutan ang password?". Ipadadala namin ang reset link sa iyong email address.
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl">
                <p className="text-xs font-bold text-slate-800 mb-1">Bakit may "Offline" indicator sa taas?</p>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Ibig sabihin nito ay walang internet connection ang iyong device. Naka-save ang benta mo sa phone, pero kailangan mong mag-connect ulit sa internet para ma-sync ito sa system.
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl">
                <p className="text-xs font-bold text-slate-800 mb-1">Pwede bang mag-transfer ng account sa ibang phone?</p>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Oo! Walang kailangang i-transfer. Mag-log in lang gamit ang inyong email at password sa kahit anong device (phone, tablet, o computer).
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl">
                <p className="text-xs font-bold text-slate-800 mb-1">Saan ko makikita ang aking mga benta noong nakaraang buwan?</p>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Pumunta sa "Ulat" o Reports tab. Doon mo makikita ang graph at listahan ng benta para sa iba't ibang buwan o linggo.
                </p>
              </div>
            </div>

            {/* Contact Support */}
            <div className="flex items-center gap-2 mb-4 mt-8 border-b border-slate-100 pb-2">
              <span className="text-xl">📞</span>
              <h3 className="font-black text-slate-800 tracking-tight">Contact Us</h3>
            </div>
            
            <div className="bg-blue-50 border border-blue-200 p-5 rounded-2xl space-y-4">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold text-blue-800 uppercase tracking-widest mb-0.5">Kailangan pa ng tulong?</p>
                  <p className="text-xs text-blue-700 font-medium leading-relaxed">
                    Nandito kami para tumulong! Mag-message sa amin gamit ang sumusunod:
                  </p>
                </div>
              </div>
              
              <div className="flex flex-col gap-2">
                <a href="mailto:support@katuwangsolutions.com" className="flex items-center gap-3 bg-white p-3 rounded-xl border border-blue-100 hover:border-blue-300 transition-colors">
                  <div className="bg-blue-100 p-2 rounded-lg">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Official Email</p>
                    <p className="text-sm font-semibold text-blue-900">support@katuwangsolutions.com</p>
                  </div>
                </a>
                
                <a href="https://facebook.com/katuwangsolutions" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 bg-white p-3 rounded-xl border border-blue-100 hover:border-blue-300 transition-colors">
                  <div className="bg-blue-100 p-2 rounded-lg">
                    <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Facebook Page</p>
                    <p className="text-sm font-semibold text-blue-900">Katuwang Solutions</p>
                  </div>
                </a>
              </div>
              <p className="text-[10px] text-blue-600/80 italic text-center pt-2">
                We aim to respond within 1–3 business days.
              </p>
            </div>

            {/* PWA Install Banner */}
            {!isInstalled && (
              <div className="bg-gradient-to-r from-emerald-500 to-emerald-400 p-5 rounded-2xl text-white flex flex-col gap-4 shadow-md shadow-emerald-500/20">
                <div className="flex items-center gap-3">
                  <div className="bg-white/20 p-2.5 rounded-xl backdrop-blur-sm">
                    <Smartphone className="h-6 w-6 text-white animate-pulse" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm tracking-tight leading-tight">I-Install ang Katuwang App!</h3>
                    <p className="text-[10px] text-emerald-50 font-medium mt-0.5">Gamitin kahit walang internet (Offline Mode).</p>
                  </div>
                </div>
                <Button 
                  onClick={() => {
                    if (deferredPrompt) {
                      triggerInstall();
                    } else {
                      setShowInstallGuide(true);
                    }
                  }}
                  className="w-full h-11 bg-white text-emerald-600 hover:bg-emerald-50 font-black tracking-widest uppercase text-xs rounded-xl shadow-sm active:scale-95 transition-transform"
                >
                  <Download className="h-4 w-4 mr-2" />
                  I-INSTALL NGAYON
                </Button>
              </div>
            )}

            {/* Referral Mechanics */}
            <div className="flex items-center gap-2 mb-4 mt-8 border-b border-slate-100 pb-2">
              <span className="text-xl">🎁</span>
              <h3 className="font-black text-slate-800 tracking-tight">Referral Program</h3>
            </div>
            <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl space-y-5">
               <div className="flex items-center gap-3 border-b border-amber-200/50 pb-4">
                 <div className="bg-amber-100 p-2.5 rounded-xl">
                   <Gift className="h-6 w-6 text-amber-600" />
                 </div>
                 <div>
                   <h4 className="font-black text-lg text-amber-900 tracking-tight leading-tight">Referral Program</h4>
                   <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest mt-0.5">Kumita ng ₱10 Paulit-ulit!</p>
                 </div>
               </div>
               
               <div className="space-y-4">
                 <div className="flex gap-3 items-start">
                   <Users className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                   <div>
                     <p className="text-xs font-bold text-amber-900 mb-0.5">Sino ang pwedeng kumita?</p>
                     <p className="text-[11px] text-amber-800 font-medium leading-relaxed">
                       Lahat! Kahit ikaw ay Store Owner o Staff, pwede kang mag-share ng iyong code at kumita.
                     </p>
                   </div>
                 </div>

                 <div className="flex gap-3 items-start">
                   <Share className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                   <div>
                     <p className="text-xs font-bold text-amber-900 mb-0.5">Paano kumita?</p>
                     <p className="text-[11px] text-amber-800 font-medium leading-relaxed">
                       Hanapin ang iyong 4-letter <strong className="font-black">Referral Code</strong> o Link sa <strong className="font-bold underline">Profile Tab</strong>. I-share ito sa ibang business owners. <strong className="font-bold text-red-600">TIP: I-invite na sila habang ₱99/mo Promo pa ang Katuwang para mas madali silang mapasali!</strong>
                     </p>
                   </div>
                 </div>

                 <div className="flex gap-3 items-start">
                   <Gift className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                   <div>
                     <p className="text-xs font-bold text-amber-900 mb-0.5">Ano ang kikitain ko?</p>
                     <p className="text-[11px] text-amber-800 font-medium leading-relaxed">
                       Makakakuha ka ng base amount na <strong className="font-black text-emerald-600">₱10.00</strong>, at dagdag na <strong className="font-black text-emerald-600">₱10.00</strong> para sa bawat karagdagang App Module na active sa kanilang store, tuwing sila ay mag-aactivate o mag-rerenew. Mas maraming gamit na apps ang invite mo, mas malaki ang kita mo! Direct referrals lang po ang may kita.
                     </p>
                   </div>
                 </div>

                 <div className="flex gap-3 items-start">
                   <History className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                   <div>
                     <p className="text-xs font-bold text-amber-900 mb-0.5">Saan makikita ang kita?</p>
                     <p className="text-[11px] text-amber-800 font-medium leading-relaxed">
                       Pumunta sa <strong className="font-bold">Profile Tab</strong> para makita ang iyong "Referral History" at total earnings.
                     </p>
                   </div>
                 </div>

                 <div className="flex gap-3 items-start">
                   <Wallet className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                   <div>
                     <p className="text-xs font-bold text-amber-900 mb-0.5">Paano i-withdraw (Cash Out)?</p>
                     <p className="text-[11px] text-amber-800 font-medium leading-relaxed">
                       Kapag umabot na ng <strong className="font-black text-emerald-600">₱200.00</strong> ang ipon mo, lalabas ang "Withdraw" button sa Profile Tab. Ipasok ang inyong GCash o Maya details. <strong className="font-bold text-amber-700">Paalala: Paki-double check po nang mabuti ang inyong Account Name at Number.</strong> Para sa inyong seguridad, hindi po namin maibabalik ang pera kung ito ay tuluyan nang naipadala sa ibang account dahil sa maling detalye.
                     </p>
                   </div>
                 </div>
               </div>
            </div>

          </div>
          
          <div className="p-4 bg-white border-t border-slate-200 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] shrink-0" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
             <Button 
               onClick={() => handleOpenChange(false)}
               className="w-full font-bold h-14 rounded-2xl text-white shadow-lg text-base"
               style={{ backgroundColor: theme.primary }}
             >
               Nakuha Ko Na! 👍
             </Button>
          </div>
        </SheetContent>
      </Sheet>
      
      {/* Manual Install Guide Dialog */}
      <Dialog open={showInstallGuide} onOpenChange={setShowInstallGuide}>
        <DialogContent className="sm:max-w-md rounded-[24px] z-[100]">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-slate-800">Paano I-install?</DialogTitle>
            <DialogDescription className="text-slate-500 font-medium">
              Dahil ikaw ay gumagamit ng iPhone o nasa Test Mode, hindi gumagana ang 1-click install. Sundin ang steps sa ibaba:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex gap-4 items-start bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div className="bg-white p-2 rounded-lg shadow-sm border border-slate-200 flex-shrink-0">
                <span className="font-black text-lg text-slate-800">1</span>
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-800">I-tap ang Browser Menu</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Sa Android (Chrome), i-tap ang <strong>3 tuldok (⋮)</strong> sa itaas. <br/>
                  Sa iPhone (Safari), i-tap ang <strong>Share icon (<Share className="h-3 w-3 inline"/>)</strong> sa ibaba.
                </p>
              </div>
            </div>
            <div className="flex gap-4 items-start bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div className="bg-white p-2 rounded-lg shadow-sm border border-slate-200 flex-shrink-0">
                <span className="font-black text-lg text-slate-800">2</span>
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-800">Piliin ang "Add to Home Screen"</h4>
                <p className="text-xs text-slate-500 mt-1">Hanapin ang <PlusSquare className="h-3 w-3 inline"/> <strong>Add to Home Screen</strong> o <strong>Install App</strong> sa menu at i-click ito.</p>
              </div>
            </div>
            <div className="flex gap-4 items-start bg-emerald-50 p-4 rounded-xl border border-emerald-100">
              <div className="bg-white p-2 rounded-lg shadow-sm border border-emerald-200 flex-shrink-0">
                <span className="font-black text-lg text-emerald-600">3</span>
              </div>
              <div>
                <h4 className="font-bold text-sm text-emerald-800">Tapos Na! 🎉</h4>
                <p className="text-xs text-emerald-600 mt-1">Makikita mo na ang Katuwang App sa home screen ng iyong phone. Pwede mo na itong gamitin parang totoong app!</p>
              </div>
            </div>
          </div>
          <Button onClick={() => setShowInstallGuide(false)} className="w-full h-12 rounded-xl font-bold bg-slate-800 text-white hover:bg-slate-700">
            Naiintindihan Ko
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
