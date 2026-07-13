import './globals.css';
import { Suspense } from 'react';
import { Providers } from '@/components/Providers';
import { Metadata } from 'next';
import AgentControlCenter from '@/components/AgentControlCenter';
import { Sora, JetBrains_Mono } from 'next/font/google';

const sora = Sora({ 
  subsets: ['latin'],
  variable: '--font-sora',
});

const jetbrainsMono = JetBrains_Mono({ 
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Mantenix | Gestión Inteligente de Flujos de Trabajo',
  description: 'La plataforma operativa que permite a los equipos crear aplicaciones de flujo de trabajo personalizadas en minutos.',
  icons: {
    icon: [
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning className={`${sora.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans antialiased">
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