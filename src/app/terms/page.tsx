import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms & Conditions | Katuwang Solutions',
  description: 'Terms of Service and Privacy Policy for Katuwang Solutions.',
  alternates: {
    canonical: 'https://katuwangsolutions.com/terms',
  },
};

export default function TermsPage() {
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

      <main className="flex-1 max-w-4xl mx-auto w-full px-5 py-12 md:py-20 space-y-10">
        <div className="space-y-4">
          <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight">Terms & Conditions</h1>
          <p className="text-slate-500 font-medium">Last updated: August 2026</p>
          <p className="text-slate-600 leading-relaxed">
            These Terms explain the basic rules for using Katuwang Solutions. By creating an account or using the service, you agree to follow these Terms.
          </p>
        </div>

        <div className="prose prose-slate max-w-none space-y-8">
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">1. Your account</h2>
            <p className="text-slate-600 leading-relaxed">
              Provide accurate account information and keep your email address and password secure. You are responsible for activity performed through your account and for reviewing the access given to staff members or other users connected to your business.
            </p>
            <p className="text-slate-600 leading-relaxed">
              Contact us promptly if you believe someone has accessed your account without permission.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">2. Modules, subscriptions, and payment</h2>
            <p className="text-slate-600 leading-relaxed">
              Katuwang Solutions modules are subscribed to separately. One subscription does not unlock all modules.
            </p>
            <p className="text-slate-600 leading-relaxed">
              The current promotional price is ₱99 per month for each standard module, with a regular price of ₱199. Budget Mo is currently ₱50 per month, with a regular price of ₱100.
            </p>
            <p className="text-slate-600 leading-relaxed">
              Promotional pricing applies only while the approved promotion is active. It is not a lifetime or permanent price guarantee. The applicable price will be shown or confirmed before a new payment or manual renewal.
            </p>
            <p className="text-slate-600 leading-relaxed">
              Payments are currently made manually through GCash or Maya. The selected module is activated only after Katuwang Solutions verifies the payment. Sending a screenshot or payment message does not by itself confirm that payment has been verified.
            </p>
            <p className="text-slate-600 leading-relaxed">
              The current workflow does not automatically charge your payment method. Renewal requires a new manual payment and verification.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">3. Information entered into the service</h2>
            <p className="text-slate-600 leading-relaxed">
              You are responsible for the completeness and accuracy of the information entered through your account, including business, transaction, inventory, customer, employee, booking, budgeting, or other module records.
            </p>
            <p className="text-slate-600 leading-relaxed">
              Katuwang Solutions helps users record, organize, monitor, and review information. Users should review their records before relying on them for business, financial, tax, or other decisions.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">4. Acceptable use</h2>
            <p className="text-slate-600 leading-relaxed">
              Do not use Katuwang Solutions to break the law, access another account without permission, interfere with the service, submit fraudulent payment or referral information, impersonate another person, or harm other users or the platform.
            </p>
            <p className="text-slate-600 leading-relaxed">
              We may restrict access when reasonably necessary to protect accounts, users, the service, or its data while a suspected misuse or security concern is reviewed.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">5. Software-only service</h2>
            <p className="text-slate-600 leading-relaxed">
              Katuwang Solutions provides software. It does not supply phones, computers, printers, scanners, internet service, or other user-owned equipment.
            </p>
            <p className="text-slate-600 leading-relaxed">
              Records, previews, or documents produced by the service do not automatically replace invoices, permits, registrations, professional advice, or other requirements that may apply to a user or business.
            </p>
            <p className="text-slate-600 leading-relaxed">
              Katuwang Solutions does not claim to be approved or accredited by the BIR, NPC, DTI, or another government agency.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">6. Service availability</h2>
            <p className="text-slate-600 leading-relaxed">
              The service may sometimes be unavailable because of maintenance, internet problems, provider interruptions, technical issues, or other causes. We do not promise uninterrupted availability or a fixed response or restoration time.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">7. Support</h2>
            <p className="text-slate-600 leading-relaxed">
              For account or service concerns, email <a href="mailto:support@katuwangsolutions.com" className="text-blue-600 hover:underline">support@katuwangsolutions.com</a> or contact the official Katuwang Solutions Facebook Page. Response times may vary.
            </p>
          </section>
        </div>
      </main>

      <footer className="py-8 bg-slate-950">
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
