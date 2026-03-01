'use client';

import { AuthProvider } from '@/contexts/AuthContext';
import { UIProvider } from '@/contexts/UIContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
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
