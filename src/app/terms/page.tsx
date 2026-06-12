import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms & Conditions | Katuwang Solutions',
  description: 'Terms of Service and Privacy Policy for Katuwang Solutions.',
};

export default function TermsPage() {
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
      <main className="flex-1 max-w-3xl mx-auto w-full px-5 py-12 md:py-20 space-y-10">
        <div className="space-y-4">
          <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight">Terms & Conditions</h1>
          <p className="text-slate-500 font-medium">Last Updated: June 2026</p>
        </div>

        <div className="prose prose-slate max-w-none space-y-8">
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">1. Acceptance of Terms</h2>
            <p className="text-slate-600 leading-relaxed">
              By accessing and using Katuwang Solutions ("Service", "App", "We", "Us"), you agree to be bound by these Terms and Conditions. If you do not agree with any part of these terms, you must not use our service. Our services are specifically designed for Micro, Small, and Medium Enterprises (MSMEs) operating in the Philippines.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">2. Subscription and Billing</h2>
            <p className="text-slate-600 leading-relaxed">
              <strong>Pricing:</strong> The standard rate for a single Katuwang module is ₱199.00 per month (Philippine Peso). <br />
              <strong>Promotional Rates & Grandfather Clause:</strong> We may occasionally offer promotional rates (e.g., ₱99.00 per month). If you subscribe during a promotional period, you lock in that discounted rate for the lifetime of your continuous subscription. However, if your subscription lapses or expires, you will be subject to the standard ₱199.00 rate upon reactivation.<br />
              <strong>No Auto-Renew:</strong> We do not automatically charge your payment method at the end of your billing cycle. You must manually renew your subscription to continue accessing the module. <br />
              <strong>Cancellation:</strong> You may cancel your use of the service at any time. Because there is no auto-renew, simply allowing your subscription to expire acts as cancellation.
            </p>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mt-4">
              <strong className="text-red-800 block mb-1">Strict No Refunds Policy</strong>
              <p className="text-red-700 text-sm">
                All payments made for subscriptions and module unlocks are final and non-refundable. We do not provide refunds or credits for any partial-month membership periods or unused software features. Please ensure you fully intend to use the module before making a payment.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">3. App Marketplace & Modules</h2>
            <p className="text-slate-600 leading-relaxed">
              Katuwang Solutions offers an ecosystem of modules (e.g., Inventory, Retail POS, Food & Bev, Farm, Rental). 
              You may request access to additional modules through the App Marketplace inside your dashboard. 
              Activation of additional modules requires manual verification and payment of the corresponding subscription fee.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">4. Referral Program</h2>
            <p className="text-slate-600 leading-relaxed">
              We offer a single-tier affiliate Referral Program allowing users to earn commission by inviting other businesses to use Katuwang Solutions.
              <br /><br />
              <strong>Earnings Structure:</strong> Referrers earn a base commission of ₱10.00 upon a successful activation or renewal by a referred user. An additional ₱10.00 is awarded for every extra App Module the referred user has active.
              <br />
              <strong>Withdrawals:</strong> Earnings can be withdrawn to a GCash or Maya account once the minimum threshold of ₱200.00 is reached.
              <br />
              <strong>Fraud & Abuse:</strong> Katuwang Solutions strictly monitors the referral system. We reserve the right to permanently suspend accounts, forfeit referral balances, and reject withdrawal requests if we detect any fraudulent activities, self-referrals, or abuse of the referral program.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">5. Data Privacy and Security</h2>
            <p className="text-slate-600 leading-relaxed">
              We respect your business data. Katuwang Solutions acts as a data processor for your store's inventory, sales, and employee data. 
              <br /><br />
              <strong>Data Ownership:</strong> You retain full ownership of all data you input into the system. <br />
              <strong>Data Protection:</strong> We employ industry-standard encryption to protect your data. However, you are responsible for keeping your login credentials secure. <br />
              <strong>Data Usage:</strong> We do not sell your business data, customer lists, or financial records to third parties. We may use anonymized, aggregated data to improve our services and algorithms.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">6. Service Availability</h2>
            <p className="text-slate-600 leading-relaxed">
              While we strive for a 99.9% uptime, Katuwang Solutions is provided "as is" and "as available". We do not guarantee that the service will be uninterrupted or error-free. We reserve the right to temporarily suspend the service for maintenance or updates.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">7. User Conduct</h2>
            <p className="text-slate-600 leading-relaxed">
              You agree not to use the Service for any unlawful purpose or in any way that could damage, disable, or impair our servers or networks. You are solely responsible for compliance with all local laws and regulations (including BIR tax regulations) pertaining to your business operations. Katuwang Solutions is a tool to assist your business, but does not replace professional legal or accounting advice.
            </p>
          </section>
          
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">8. Modifications to Terms</h2>
            <p className="text-slate-600 leading-relaxed">
              We reserve the right to modify these terms at any time. We will notify users of any significant changes via email or an in-app announcement. Continued use of the service after such changes constitutes acceptance of the new terms.
            </p>
          </section>
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="py-8 bg-slate-950">
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
