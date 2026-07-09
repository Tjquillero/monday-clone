'use client';

import { AuthProvider } from '@/contexts/AuthContext';
import { UIProvider } from '@/contexts/UIContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      // networkMode: 'always' — sin esto, React Query pausa queries y
      // mutations en cuanto detecta navigator.onLine === false y nunca llega
      // a invocar queryFn/mutationFn (se queda en fetchStatus 'paused' hasta
      // reconectar). Esta app depende de que cada queryFn/mutationFn corra
      // SIEMPRE y decida por sí mismo qué hacer offline (OfflineQueryBuilder
      // para el carril CRUD, isNetworkError + offlineDB.addCommand para el
      // carril de comandos de dominio) — el gate por defecto de React Query
      // competía con esa lógica y la dejaba sin ejecutar nunca mientras
      // realmente hacía falta (encontrado verificando el Incremento 2 de
      // docs/architecture/offline-certification-design.md).
      queries: {
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
        networkMode: 'always',
      },
      mutations: {
        networkMode: 'always',
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <UIProvider>
          <ProtectedRoute>
            {children}
          </ProtectedRoute>
        </UIProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
