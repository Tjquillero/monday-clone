import './globals.css';
import { Providers } from '@/components/Providers';
import { Metadata } from 'next';

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
    <html lang="es" suppressHydrationWarning>
      <body className="font-sans">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}