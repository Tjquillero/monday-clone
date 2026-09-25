import './globals.css';
import { Suspense } from 'react';
import { Providers } from '@/components/Providers';
import { Metadata } from 'next';
import AgentControlCenter from '@/components/AgentControlCenter';
import { Syne, Inter, JetBrains_Mono } from 'next/font/google';

const syne = Syne({ 
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-syne',
  display: 'swap',
});

const inter = Inter({ 
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({ 
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  title: 'Mantenix | Gestión Inteligente de Flujos de Trabajo',
  description: 'Plataforma operativa y contractual de mantenimiento de infraestructura en campo.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [
      { url: '/pwa/apple-touch-icon-180x180.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  openGraph: {
    title: 'Mantenix — Gestión Inteligente de Flujos de Trabajo',
    description: 'Control · Continuidad · Ejecución · Infraestructura',
    images: [
      {
        url: '/og-image-1200x630.png',
        width: 1200,
        height: 630,
        alt: 'Mantenix — Control de Infraestructura y Operación',
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html 
      lang="es" 
      suppressHydrationWarning 
      className={`${syne.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="font-sans antialiased text-slate-900 dark:text-slate-100">
        <Providers>
          {children}
          {/* AGENTE DE IA MANTENIX (GLOBAL) */}
          <Suspense fallback={null}>
            <AgentControlCenter />
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}