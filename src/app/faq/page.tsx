import React from 'react';
import Link from 'next/link';
import { ArrowLeft, HelpCircle } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FAQ | Katuwang Solutions',
  description: 'Frequently Asked Questions tungkol sa Katuwang Solutions.',
  alternates: {
    canonical: 'https://katuwangsolutions.com/faq',
  },
};

const faqs = [
  {
    q: 'Ano ang Katuwang Solutions?',
    a: 'Ang Katuwang Solutions ay isang mobile-first business management software ecosystem. Mayroon itong 18 modules para sa iba’t ibang negosyo at personal budgeting needs. Piliin lamang ang module na angkop sa iyong gagamitin.',
  },
  {
    q: 'Magkano ang subscription?',
    a: 'Ang kasalukuyang promo price ay ₱99/buwan bawat standard module, regular ₱199. Ang Budget Mo ay ₱50/buwan, regular ₱100. Magkahiwalay ang subscription at bayad ng bawat module. Ang promo ay hindi lifetime o permanent price guarantee.',
  },
  {
    q: 'Libre ba ang paggawa ng account?',
    a: 'Oo, maaaring gumawa ng account bago magbayad. Kailangan pa ring ma-verify ang payment bago ma-activate ang napiling module. Hindi ito free trial o libreng access sa lahat ng modules.',
  },
  {
    q: 'Paano magbayad?',
    a: 'GCash at Maya ang kasalukuyang manual payment options. Sundin ang payment instructions at ipadala ang hinihinging payment details o screenshot sa official verification channel.',
  },
  {
    q: 'Kailan maa-activate ang module?',
    a: 'Maa-activate lamang ang napiling module pagkatapos ma-verify ang payment. Ang pagpapadala ng screenshot ay hindi pa awtomatikong confirmation ng activation. Walang fixed activation-time promise sa kasalukuyan.',
  },
  {
    q: 'Automatic ba ang renewal o debit?',
    a: 'Hindi. Manual ang kasalukuyang renewal at walang automatic debit. Iko-confirm ang applicable module price bago ang bagong payment o renewal.',
  },
  {
    q: 'Kailangan ba ng internet at anong device ang puwedeng gamitin?',
    a: 'Gumamit ng supported web browser sa smartphone, tablet, o computer at reliable internet connection para sa normal na access. Maaaring mag-iba ang availability ng features depende sa module, device, browser, permissions, at connection. Hindi kami nangangako ng universal offline operation o compatibility sa lahat ng devices.',
  },
  {
    q: 'Paano makipag-ugnayan sa support?',
    a: 'Mag-email sa support@katuwangsolutions.com o mag-message sa official Katuwang Solutions Facebook Page. Maaaring mag-iba ang response time.',
  },
];

export default function FAQPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50 px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft className="h-5 w-5" />
          <span className="font-bold text-sm">Back</span>
        </Link>
        <BrandLogo showText={true} />
        <div className="w-10" />
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-5 py-12 md:py-20 space-y-12">
        <div className="text-center space-y-4">
          <div className="h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <HelpCircle className="h-8 w-8 text-blue-600" />
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight">
            Frequently Asked Questions
          </h1>
          <p className="text-lg text-slate-500 font-medium">
            Mga kasagutan sa mga karaniwang katanungan ng ating mga Katuwang.
          </p>
        </div>

        <div className="space-y-4" data-testid="faq-list">
          {faqs.map((faq, index) => (
            <div key={index} data-testid="faq-card" className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <h3 className="text-lg font-bold text-slate-900 mb-2 flex gap-3">
                <span className="text-primary opacity-50 shrink-0">Q.</span>
                <span>{faq.q}</span>
              </h3>
              <div className="text-slate-600 leading-relaxed flex gap-3">
                <span className="text-slate-300 font-bold shrink-0">A.</span>
                <p>{faq.a}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-primary/10 border border-primary/20 rounded-3xl p-8 text-center mt-12">
          <h3 className="text-xl font-bold text-slate-900 mb-2">May iba ka pa bang tanong?</h3>
          <p className="text-slate-600 mb-6">Mag-message lang sa aming Facebook page o mag-email sa amin.</p>
          <a href="mailto:support@katuwangsolutions.com" className="inline-block bg-primary text-white font-bold px-8 py-3 rounded-full hover:bg-primary/90 transition-colors">
            Contact Support
          </a>
        </div>
      </main>

      <footer className="py-8 bg-slate-950 mt-auto">
        <div className="text-center flex flex-col items-center gap-3">
          <div className="opacity-40">
            <BrandLogo theme="dark" />
          </div>
          <p className="text-slate-500 text-[9px] font-bold uppercase tracking-[0.35em] leading-loose">
            <span translate="no" className="notranslate">Katuwang Solutions</span><br />
            &copy; {new Date().getFullYear()} All Rights Reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
