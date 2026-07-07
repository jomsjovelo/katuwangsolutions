import React from 'react';
import Link from 'next/link';
import { ArrowLeft, HelpCircle } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FAQ | Katuwang Solutions',
  description: 'Frequently Asked Questions tungkol sa Katuwang Solutions.',
};

const faqs = [
  {
    q: "Magkano ang Katuwang Solutions?",
    a: "₱99 lang per month (para sa iisang module) kung mag-aavail ka sa ating promotional rate. At ang maganda pa, locked-in na ang presyong ito habang active ang iyong subscription!"
  },
  {
    q: "Paano mag-bayad?",
    a: "Tumatanggap kami ng payment via GCash o Maya gamit ang aming QR code. Walang auto-debit, kaya safe ang inyong bank accounts. Ikaw mismo ang magse-send ng bayad buwan-buwan."
  },
  {
    q: "Kailangan ba palaging may internet?",
    a: "May offline mode ang aming POS/Benta module! Pwede kang mag-record ng benta kahit mawalan ng internet. Mag-o-auto sync ito sa aming cloud servers kapag bumalik na ang signal mo."
  },
  {
    q: "Ilang devices ang pwedeng gumamit?",
    a: "Unlimited! Pwede kang mag-login sa cellphone, tablet, at laptop nang sabay-sabay gamit ang iisang account nang walang extra bayad."
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
    a: "Wala pong refund. Ngunit, mayroon kaming ibinibigay na libreng trial period para masubukan mo muna nang buo ang system bago ka mag-desisyon na mag-subscribe."
  },
  {
    q: "Gaano ka-ligtas ang aking data?",
    a: "Ang iyong data ay naka-imbak sa Google Firebase servers. Gumagamit kami ng world-class security at encryption para matiyak na ikaw lang ang may access sa iyong negosyo."
  },
  {
    q: "Paano kung masira o mawala ang cellphone ko?",
    a: "Huwag mag-alala! Dahil cloud-based ang Katuwang, mag-log in ka lang gamit ang iyong email at password sa bagong cellphone, at makikita mo ulit ang lahat ng data mo."
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
