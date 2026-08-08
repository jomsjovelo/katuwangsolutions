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
          <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight">Privacy Policy</h1>
          <p className="text-slate-500 font-medium">Last updated: August 2026</p>
          <p className="text-slate-600 leading-relaxed">
            This Privacy Policy explains the basic information Katuwang Solutions handles, why it is used, and how users can contact us about privacy or deletion requests.
          </p>
        </div>

        <div className="prose prose-slate max-w-none space-y-8">
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">1. Information we handle</h2>
            <p className="text-slate-600 leading-relaxed">Depending on how you use Katuwang Solutions, we may handle:</p>
            <ul className="list-disc pl-5 text-slate-600 space-y-2">
              <li>account information, such as your full name and email address;</li>
              <li>business information, such as your business name and selected module;</li>
              <li>records you choose to enter into a module, such as sales, expenses, inventory, customer credit, employee, booking, service, budgeting, or similar records;</li>
              <li>payment-verification and support information that you send to us, including messages or screenshots sent through Facebook Messenger or email; and</li>
              <li>basic technical and website-interaction information processed by the services used to operate the website and app.</li>
            </ul>
            <p className="text-slate-600 leading-relaxed">
              Some module records may contain information about customers, employees, borrowers, guests, members, or other people. Account owners should enter only information reasonably needed for their legitimate business or personal use.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">2. Why we use this information</h2>
            <p className="text-slate-600 leading-relaxed">We use information to:</p>
            <ul className="list-disc pl-5 text-slate-600 space-y-2">
              <li>create, verify, and maintain accounts;</li>
              <li>provide the selected modules and save user-entered records;</li>
              <li>verify manual payments and activate subscriptions;</li>
              <li>send verification or password-reset messages;</li>
              <li>respond to support, privacy, and deletion requests;</li>
              <li>protect accounts and investigate suspected misuse; and</li>
              <li>understand basic website activity and registration performance when measurement tools are enabled.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">3. Services we use</h2>
            <p className="text-slate-600 leading-relaxed">
              Katuwang Solutions currently uses Google Firebase services, including Firebase Authentication and Cloud Firestore, for account access and application data.
            </p>
            <p className="text-slate-600 leading-relaxed">
              The current service also uses Gmail-based email delivery for account verification and password-reset messages. Facebook Messenger is used when users send payment proof or support messages through the official Katuwang Solutions page.
            </p>
            <p className="text-slate-600 leading-relaxed">
              Meta Pixel is enabled on the website. It sends <code>PageView</code> for page visits; <code>ViewContent</code> with the selected module&apos;s ID, name, category, and product content type on public module pages; <code>InitiateCheckout</code> with the selected module&apos;s ID, name, and product content type when module onboarding opens; and <code>CompleteRegistration</code> with the selected module&apos;s ID, name, and product content type after account registration succeeds. These application event parameters do not include the account holder&apos;s name, email, business records, or payment screenshot. Meta may process other browser, device, network, cookie, or similar information under Meta&apos;s own terms, settings, and privacy practices.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">4. Basic security practices</h2>
            <p className="text-slate-600 leading-relaxed">
              We use account authentication and access rules intended to limit access to application data. Administrative access should be limited to people who need it to operate or support the service.
            </p>
            <p className="text-slate-600 leading-relaxed">
              No website, cloud service, device, or internet transmission can be guaranteed completely secure. Keep your email account and Katuwang password secure, and contact us if you suspect unauthorized access.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">5. Sharing and selling information</h2>
            <p className="text-slate-600 leading-relaxed">
              Katuwang Solutions does not sell personal information or business records as part of its current business model.
            </p>
            <p className="text-slate-600 leading-relaxed">
              Information may be processed by the services identified above when needed to operate accounts, store records, send account emails, verify payments, provide support, or measure website activity. We may also disclose information when required to respond to a valid legal request or protect users and the service.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">6. Retention and deletion requests</h2>
            <p className="text-slate-600 leading-relaxed">
              We keep information while it is reasonably needed to operate accounts, provide the service, maintain security, and handle support or payment concerns.
            </p>
            <p className="text-slate-600 leading-relaxed">
              To request account or data deletion, email <a href="mailto:support@katuwangsolutions.com" className="text-blue-600 hover:underline">support@katuwangsolutions.com</a> using the email address registered to the account. We may ask for information needed to verify the requester and account before acting on the request.
            </p>
            <p className="text-slate-600 leading-relaxed">
              We will review the request and explain what data can be deleted from the active service. We do not promise immediate or unconditional deletion of every record because some information may still be needed temporarily for security, payment verification, dispute handling, technical backups, or other legitimate operational requirements.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">7. Contact</h2>
            <p className="text-slate-600 leading-relaxed">
              For privacy questions, correction requests, or deletion requests, email <a href="mailto:support@katuwangsolutions.com" className="text-blue-600 hover:underline">support@katuwangsolutions.com</a>.
            </p>
          </section>
        </div>
      </main>

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
