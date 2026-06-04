import type { Metadata, Viewport } from 'next';
import './globals.css';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { AuthGuard } from '@/components/auth/auth-guard';
import { Toaster } from '@/components/ui/toaster';

export const metadata: Metadata = {
  title: 'Katuwang Solutions | Ang Katuwang ng Negosyo Mo',
  description: 'Sales, inventory, at utang tracking para sa mga tindahan, palengke, at services. Mura. Mabilis. Maaasahan.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Katuwang',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
    icon: '/icons/icon-192.png',
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'google': 'notranslate',
    'Content-Language': 'fil',
  },
};

export const viewport: Viewport = {
  themeColor: '#06B6D4',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fil" translate="no">
      <head>
         <meta name="google" content="notranslate" />
         <meta httpEquiv="Content-Language" content="fil" />
         <link rel="preconnect" href="https://fonts.googleapis.com" />
         <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
         <link
           href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&family=Space+Grotesk:wght@700&display=swap"
           rel="stylesheet"
         />
      </head>
      <body className="font-body antialiased min-h-screen overflow-x-hidden bg-white selection:bg-cyan-500/30" translate="no">
        <FirebaseClientProvider>
          <AuthGuard>
            <div className="w-full min-h-screen bg-white relative flex flex-col">
              {children}
            </div>
            <Toaster />
          </AuthGuard>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
