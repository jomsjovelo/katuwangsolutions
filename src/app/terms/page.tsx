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
      <main className="flex-1 max-w-4xl mx-auto w-full px-5 py-12 md:py-20 space-y-10">
        <div className="space-y-4">
          <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight">Terms & Conditions</h1>
          <p className="text-slate-500 font-medium">Last Updated: June 2026</p>
        </div>

        <div className="prose prose-slate max-w-none space-y-8">
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">1. Acceptance of Terms</h2>
            <p className="text-slate-600 leading-relaxed">
              By accessing and using Katuwang Solutions ("Service", "App", "We", "Us"), you agree to be bound by these Terms and Conditions. If you do not agree with any part of these terms, you must not use our service. Our services are specifically designed for Micro, Small, and Medium Enterprises (MSMEs) operating in the Philippines. You must be at least 18 years old to create a business account.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">2. Account Security & Access</h2>
            <p className="text-slate-600 leading-relaxed">
              <strong>Account Ownership:</strong> You are responsible for maintaining the confidentiality of your login credentials. 
              <br /><br />
              <strong>Email Access Requirement:</strong> Katuwang Solutions uses email verification for account recovery and password resets. You are strictly responsible for maintaining access to the email address associated with your Katuwang account. If you lose access to your email address or forget its password, resulting in an inability to reset your Katuwang password, Katuwang Solutions is not responsible for the lost access to your account or any resulting business interruption. For security reasons, we cannot manually bypass email verification.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">3. Subscription and Billing</h2>
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
            <h2 className="text-xl font-bold text-slate-900">4. Offline Mode & Data Syncing</h2>
            <p className="text-slate-600 leading-relaxed">
              <strong>Local Data Storage:</strong> Katuwang Solutions features an offline mode where certain transactions (such as Benta/Sales) are stored locally on your device's browser cache when an internet connection is unavailable.
              <br /><br />
              <strong>Device Failure Liability:</strong> This local data is only backed up to our cloud servers once a stable internet connection is restored. If your device is lost, stolen, damaged, or if its browser cache is cleared <em>before</em> the local data successfully syncs to the cloud, that data is permanently lost. Katuwang Solutions is not liable for any unsynced data loss.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">5. Data Accuracy & Financial Liability</h2>
            <p className="text-slate-600 leading-relaxed">
              <strong>User Input Dependency:</strong> All financial reports (Ulat), inventory counts (Stock), and lending records generated by the app rely entirely on the accuracy of the data inputted by the user.
              <br /><br />
              <strong>No Tax or Legal Advice:</strong> The system is a recording tool designed to assist your business. It is not a substitute for a licensed accountant or legal counsel. We are not liable for tax miscalculations, BIR audit discrepancies, or financial losses resulting from user input errors or misunderstanding of the reports.
              <br /><br />
              <strong>Lending Module Disclaimer:</strong> Katuwang Solutions is solely a software provider. We are not a lending institution or a collection agency. We hold no responsibility if your customers or borrowers fail to repay their debts or loans recorded within the app.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">6. Staff Accounts & Management Liability</h2>
            <p className="text-slate-600 leading-relaxed">
              <strong>Owner Responsibility:</strong> The business owner (Tenant Admin) is strictly responsible for all actions taken by authorized Staff accounts. Katuwang Solutions is not liable for any accidental data deletion, unauthorized discounts, theft, or misconduct perpetrated by your staff members using the app.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">7. Hardware & Network Dependencies</h2>
            <p className="text-slate-600 leading-relaxed">
              <strong>Software Only:</strong> Katuwang Solutions provides software as a service. We do not provide, nor are we responsible for the malfunction of user-owned hardware, including but not limited to smartphones, tablets, thermal Bluetooth printers, barcode scanners, or local internet connections.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">8. App Marketplace & Modules</h2>
            <p className="text-slate-600 leading-relaxed">
              Katuwang Solutions offers an ecosystem of modules (e.g., Sari-Sari, Food & Bev, Salon, Farm, Rental, Lending). 
              You may request access to additional modules through the App Marketplace inside your dashboard. 
              Activation of additional modules requires manual verification and payment of the corresponding subscription fee.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">9. Referral Program</h2>
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
            <h2 className="text-xl font-bold text-slate-900">10. Limitation of Liability & Indemnification</h2>
            <p className="text-slate-600 leading-relaxed">
              To the maximum extent permitted by applicable law, Katuwang Solutions shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses, resulting from (a) your access to or use of or inability to access or use the service; (b) any conduct or content of any third party on the service; or (c) unauthorized access, use, or alteration of your transmissions or content.
              <br /><br />
              You agree to defend, indemnify, and hold harmless Katuwang Solutions from and against any claims, liabilities, damages, judgments, awards, losses, costs, expenses, or fees resulting from your violation of these Terms or your use of the Service.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">11. Modifications to Terms</h2>
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
