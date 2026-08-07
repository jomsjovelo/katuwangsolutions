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
    q: "Magkano ang Katuwang Solutions?",
    a: "Nagsisimula sa Promo ₱50/buwan (Budget Mo, regular ₱100/mo) at Promo ₱99/buwan (regular ₱199/mo) bawat module para sa iba pang standard business modules."
  },
  {
    q: "Paano mag-bayad?",
    a: "Tumatanggap kami ng payment via GCash o Maya gamit ang aming QR code. Walang auto-debit. Ikaw mismo ang magse-send ng bayad buwan-buwan at ima-verify ng aming Operations team bago ma-activate."
  },
  {
    q: "Kailangan ba ng internet?",
    a: "Naka-design ang Katuwang Solutions para sa web access at mobile operation. Mag-login lang sa iyong rehistradong account gamit ang smartphone o computer para sa pag-record ng iyong negosyo."
  },
  {
    q: "Ilang devices ang pwedeng gumamit?",
    a: "Pwede kang mag-login sa cellphone, tablet, o laptop gamit ang inyong rehistradong account."
  },
  {
    q: "Paano mag-add ng tindera/staff?",
    a: "Punta ka lang sa Settings → Staff Management. Ibigay ang iyong 'Business Code' sa iyong staff para makapag-register sila. Ikaw bilang owner ang mag-a-approve sa kanila bago sila makapasok."
  },
  {
    q: "Kailangan ba ng BIR accreditation kung gagamitin ko ito?",
    a: "Hindi po kailangan. Ang Katuwang Solutions ay isang business management at tracking software, at hindi isang pormal na POS Machine na nag-i-issue ng BIR-registered official receipts."
  },
  {
    q: "Pwede bang mag-print ng resibo?",
    a: "Oo! Compatible ang Katuwang Solutions sa karamihan ng mga Bluetooth Thermal Printers."
  },
  {
    q: "May refund ba kung hindi ko nagustuhan?",
    a: "Wala pong refund dahil sa digital subscription nature ng software. Ikaw mismo ang magsa-submit ng bayad buwan-buwan nang walang auto-debit."
  },
  {
    q: "Gaano ka-ligtas ang aking data?",
    a: "Ang iyong data ay naka-imbak sa Google Firebase infrastructure gamit ang standard security rules para sa ligtas na data access."
  },
  {
    q: "Paano kung masira o mawala ang cellphone ko?",
    a: "Mag-log in ka lang gamit ang iyong email at password sa bagong device para ma-access muli ang inyong rehistradong account."
  }
];

export default function FAQPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50 px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft className="h-5 w-5" />
          <span className="font-bold text-sm">Back</span>
        </Link>
        <BrandLogo showText={true} />
        <div className="w-10" />
      </header>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
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

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div key={index} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
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

        {/* Support CTA */}
        <div className="bg-primary/10 border border-primary/20 rounded-3xl p-8 text-center mt-12">
          <h3 className="text-xl font-bold text-slate-900 mb-2">May iba ka pa bang tanong?</h3>
          <p className="text-slate-600 mb-6">Mag-message lang sa aming Facebook page o mag-email sa amin.</p>
          <a href="mailto:support@katuwangsolutions.com" className="inline-block bg-primary text-white font-bold px-8 py-3 rounded-full hover:bg-primary/90 transition-colors">
            Contact Support
          </a>
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
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
