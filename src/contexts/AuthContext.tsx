'use client';

import { useEffect, useState, createContext, useContext } from 'react';
import { supabase } from '@/lib/supabaseClient';
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
        const res = await supabase.auth.getSession();
        
        if (active) {
          const initialSession = res.data?.session;
          setSession(initialSession);
          setUser(initialSession?.user ?? null);
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      if (!active) return;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Error during signOut:', err);
    } finally {
      setSession(null);
      setUser(null);
      setLoading(false);
    }
  };

  const isAdmin = (user?.user_metadata as any)?.role?.toLowerCase() === 'admin' || 
                  user?.email === 'admin@mantenix.com';

  return (
    <AuthContext.Provider value={{ user, session, loading, isAdmin, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
