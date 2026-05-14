import type {Metadata} from 'next';
import './globals.css';

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
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased bg-zinc-100 flex justify-center min-h-screen overflow-x-hidden">
        {/* Mobile-First Root Wrapper: Max-width 430px with device-mimic frame */}
        <div className="w-full max-w-[430px] min-h-screen bg-background shadow-[0_0_50px_rgba(0,0,0,0.1)] border-x border-border/50 relative flex flex-col overflow-x-hidden mx-auto">
          {children}
        </div>
      </body>
    </html>
  );
}
