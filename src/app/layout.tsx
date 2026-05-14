import type {Metadata} from 'next';
import './globals.css';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { AuthGuard } from '@/components/auth/auth-guard';

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
      <body className="font-body antialiased min-h-screen overflow-x-hidden">
        <FirebaseClientProvider>
          <AuthGuard>
            {children}
          </AuthGuard>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
