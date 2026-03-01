'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const isPublicPath = pathname === '/' || pathname === '/login';
    
    if (!loading && !user && !isPublicPath) {
      router.push('/login');
    }
    
    if (!loading && user && pathname === '/login') {
      router.push('/dashboard');
    }
  }, [user, loading, router, pathname]);

  if (loading && pathname !== '/' && pathname !== '/login') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
