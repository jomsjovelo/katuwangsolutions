import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | Katuwang Solutions',
  description: 'How we handle, protect, and process your data at Katuwang Solutions.',
  alternates: {
    canonical: 'https://katuwangsolutions.com/privacy',
  },
};

export default function PrivacyPage() {
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
      <main className="flex-1 max-w-4xl mx-auto w-full px-5 py-12 md:py-20 space-y-10">
        <div className="space-y-4">
          <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight">Privacy Policy</h1>
          <p className="text-slate-500 font-medium">Last Updated: June 2026</p>
        </div>

        <div className="prose prose-slate max-w-none space-y-8">
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">1. Introduction</h2>
            <p className="text-slate-600 leading-relaxed">
              At Katuwang Solutions, we take your privacy seriously. This Privacy Policy explains how we collect, use, and protect your personal and business information. We align our data processing practices with the principles of the <strong>Data Privacy Act of 2012 (Republic Act No. 10173) of the Philippines</strong>.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">2. Data We Collect</h2>
            <p className="text-slate-600 leading-relaxed">
              When you use our services, we only collect the information necessary to provide and improve our app:
            </p>
            <ul className="list-disc pl-5 text-slate-600 space-y-2">
              <li><strong>Account Information:</strong> Name, email address, and profile picture.</li>
              <li><strong>Business Information:</strong> Business name, address, contact details, and industry type.</li>
              <li><strong>Transaction Data:</strong> Sales records, inventory levels, customer debts, and expenses inputted into the app.</li>
              <li><strong>Device Information:</strong> Browser type, operating system, and IP address for security logging and optimization.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">3. How We Store & Protect Your Data</h2>
            <p className="text-slate-600 leading-relaxed">
              Your data is securely stored using <strong>Google Firebase infrastructure</strong>. This means your information is encrypted both in transit (while syncing over the internet) and at rest (when saved in our databases). We implement strict access controls so only authorized systems can interact with your business data.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">4. Our "No Data Selling" Guarantee</h2>
            <p className="text-slate-600 leading-relaxed font-medium">
              We do not, and will never, sell your personal information or your business transaction data to third parties, advertising agencies, or data brokers.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">5. Data Retention & Activity Logs</h2>
            <p className="text-slate-600 leading-relaxed">
              To ensure the app remains fast and responsive on mobile devices, we only aggregate and display minor Activity Logs (e.g., individual stock edits, login events) for a rolling window of <strong>7 days</strong>. Activity older than 7 days is automatically hidden and overwritten. However, core data like completed sales (Benta) and inventory levels remain securely stored until you choose to delete them.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">6. Third-Party Service Providers</h2>
            <p className="text-slate-600 leading-relaxed">
              We may share limited data with trusted third-party providers purely for operational purposes (such as sending transactional emails or processing secure payments). These providers are legally bound to protect your data and are prohibited from using it for any other purpose.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">7. Your Rights to Data Deletion</h2>
            <p className="text-slate-600 leading-relaxed">
              You have the right to request a complete deletion of your account and all associated business data. To initiate a data deletion request, please email us at <a href="mailto:support@katuwangsolutions.com" className="text-blue-600 hover:underline">support@katuwangsolutions.com</a> using the email address registered to your account.
            </p>
          </section>

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
            <a href="mailto:support@katuwangsolutions.com" className="text-slate-500 hover:text-slate-300 transition-colors normal-case tracking-normal">
              support@katuwangsolutions.com
            </a>
            <br />
            &copy; {new Date().getFullYear()} All Rights Reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
