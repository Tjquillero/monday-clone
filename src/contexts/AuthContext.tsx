'use client';

import { useEffect, useState, createContext, useContext } from 'react';
import { supabase, realClient, mockClient } from '@/lib/supabaseClient';
import { User, Session } from '@supabase/supabase-js';

type AuthContextType = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  isAdmin: false,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const getInitialSession = async () => {
      try {
        const useMock = typeof window !== 'undefined' && (
          localStorage.getItem('use_mock_db') === 'true' || 
          localStorage.getItem('sb_mock_session') !== null ||
          document.cookie.includes('sb-mock-session')
        );

        const client = useMock || !realClient ? mockClient : realClient;
        const res = await client.auth.getSession();
        
        if (active) {
          const initialSession = res.data?.session;
          setSession(initialSession as any);
          setUser((initialSession?.user as any) ?? null);
        }
      } catch (err) {
        console.error('Error fetching initial session:', err);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    getInitialSession();

    // Listen to changes on BOTH clients to ensure sync
    const realAuthListener = realClient?.auth.onAuthStateChange((_event: any, session: any) => {
      if (!active) return;
      const useMock = typeof window !== 'undefined' && (
        localStorage.getItem('use_mock_db') === 'true' || 
        localStorage.getItem('sb_mock_session') !== null ||
        document.cookie.includes('sb-mock-session')
      );
      if (!useMock) {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    });

    const mockAuthListener = mockClient.auth.onAuthStateChange((_event: any, session: any) => {
      if (!active) return;
      const useMock = typeof window !== 'undefined' && (
        localStorage.getItem('use_mock_db') === 'true' || 
        localStorage.getItem('sb_mock_session') !== null ||
        document.cookie.includes('sb-mock-session')
      );
      if (useMock) {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      if (realAuthListener?.data?.subscription) {
        realAuthListener.data.subscription.unsubscribe();
      }
      if (mockAuthListener?.data?.subscription) {
        mockAuthListener.data.subscription.unsubscribe();
      }
    };
  }, []);

  const signOut = async () => {
    setLoading(true);
    try {
      if (realClient) {
        await realClient.auth.signOut();
      }
      await mockClient.auth.signOut();
    } catch (err) {
      console.error('Error during signOut:', err);
    } finally {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('sb_mock_session');
        localStorage.removeItem('use_mock_db');
        document.cookie = 'sb-mock-session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;';
      }
      setSession(null);
      setUser(null);
      setLoading(false);
    }
  };

  const isAdmin = (user?.user_metadata as any)?.role?.toLowerCase() === 'admin' || 
                  user?.email === 'admin@mantenix.com' || 
                  user?.email === 'tjho145@hotmail.com';

  return (
    <AuthContext.Provider value={{ user, session, loading, isAdmin, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
