import React from 'react';
import { appGroups } from '@/lib/app-data';
import { notFound } from 'next/navigation';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Metadata } from 'next';

type Props = {
  params: Promise<{ id: string }>
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolvedParams = await params;
  let foundApp: any = null;
  appGroups.forEach(g => {
    const app = g.apps.find(a => a.id === resolvedParams.id);
    if (app) foundApp = app;
  });

  if (!foundApp) return { title: 'Product Not Found | Katuwang Solutions' };

  return {
    title: `${foundApp.name} POS & Management System | Katuwang Solutions`,
    description: foundApp.tagline,
    keywords: `${foundApp.name}, POS, Philippines MSME, ${foundApp.tagline.split(' ').slice(0,3).join(',')}`,
    openGraph: {
      title: `${foundApp.name} by Katuwang Solutions`,
      description: foundApp.tagline,
      type: 'website',
    }
  };
}

export default async function ProductPage({ params }: Props) {
  const resolvedParams = await params;
  let foundApp: any = null;
  let foundGroup: any = null;

  appGroups.forEach(g => {
    const app = g.apps.find(a => a.id === resolvedParams.id);
    if (app) {
      foundApp = app;
      foundGroup = g;
    }
  });

  if (!foundApp) {
    notFound();
  }

  const Icon = foundApp.icon;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft className="h-5 w-5" />
          <span className="font-bold text-sm">Back</span>
        </Link>
        <BrandLogo showText={true} />
        <div className="w-10"></div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full p-6 md:p-12">
        <div className="flex items-center gap-4 mb-6">
          <div 
            className="h-16 w-16 rounded-2xl flex items-center justify-center text-white shadow-lg"
            style={{ backgroundColor: foundGroup.accentColor }}
          >
            <Icon className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-4xl font-headline font-black text-slate-900 tracking-tight">{foundApp.name}</h1>
            <p className="text-sm font-bold uppercase tracking-widest text-slate-500 mt-1">{foundGroup.label} Module</p>
          </div>
        </div>

        <p className="text-xl md:text-2xl text-slate-700 font-medium leading-relaxed mb-10 max-w-2xl">
          "{foundApp.tagline}"
        </p>

        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-xl mb-12">
          <h2 className="text-2xl font-black text-slate-900 mb-6">Key Features</h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {foundApp.features?.map((feature: string, idx: number) => (
              <li key={idx} className="flex items-start gap-3">
                <CheckCircle2 className="h-6 w-6 shrink-0 mt-0.5" style={{ color: foundGroup.accentColor }} />
                <span className="text-slate-700 font-medium text-lg">{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="text-center">
          <Link href="/">
            <Button 
              size="lg" 
              className="h-14 px-10 text-lg font-bold text-white shadow-xl hover:scale-105 transition-transform"
              style={{ backgroundColor: foundGroup.accentColor }}
            >
              Get Started with {foundApp.name}
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
