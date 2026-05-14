import type {Metadata} from 'next';
import './globals.css';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { TenantProvider } from './lib/tenant-context';

export const metadata: Metadata = {
  title: 'Katuwang Solutions | Multi-Tenant SaaS',
  description: 'Industrial SaaS Framework for Filipino Businesses',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&family=Space+Grotesk:wght@700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased bg-zinc-100 flex justify-center min-h-screen overflow-x-hidden">
        <FirebaseClientProvider>
          <TenantProvider>
            <div className="w-full max-w-[430px] min-h-screen bg-background shadow-[0_0_50px_rgba(0,0,0,0.1)] border-x border-border/50 relative flex flex-col overflow-x-hidden mx-auto">
              {children}
            </div>
          </TenantProvider>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
