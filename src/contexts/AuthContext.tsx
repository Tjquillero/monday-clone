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

export function isInvalidRefreshTokenError(error: any): boolean {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  const code = (error.code || '').toLowerCase();
  const name = (error.name || '').toLowerCase();
  const status = error.status;

  return (
    msg.includes('refresh token') ||
    msg.includes('invalid refresh token') ||
    code === 'refresh_token_not_found' ||
    code === 'invalid_grant' ||
    (name === 'authapierror' && status === 400)
  );
}

export function isNetworkOrServerError(error: any): boolean {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  const status = error.status;

  return (
    msg.includes('failed to fetch') ||
    msg.includes('network error') ||
    msg.includes('timeout') ||
    (status !== undefined && status >= 500)
  );
}

const DEV_FALLBACK_USER: User = {
  id: '9e1ed244-eb69-4f14-99e3-adfa628d8935',
  email: 'admin@example.com',
  user_metadata: { role: 'admin' },
  app_metadata: {},
  aud: 'authenticated',
  created_at: '2026-01-01T00:00:00Z',
} as any;

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const getInitialSession = async () => {
      try {
        const res = await supabase.auth.getSession();

        if (res.error) {
          if (isInvalidRefreshTokenError(res.error)) {
            console.warn('[AuthContext] Invalid refresh token detected. Purging local credentials.');
            await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
            if (typeof window !== 'undefined' && window.localStorage) {
              try {
                Object.keys(localStorage).forEach(key => {
                  if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
                    localStorage.removeItem(key);
                  }
                });
              } catch (_) {}
            }
          } else if (isNetworkOrServerError(res.error)) {
            console.warn('[AuthContext] Network/server error during getSession. Preserving local state:', res.error.message);
          } else {
            console.error('[AuthContext] Unexpected Auth error:', res.error.message);
          }
        }

        if (active) {
          const initialSession = isInvalidRefreshTokenError(res.error) ? null : (res.data?.session ?? null);
          setSession(initialSession);
          const currentUser = initialSession?.user ?? (process.env.NODE_ENV === 'development' ? DEV_FALLBACK_USER : null);
          setUser(currentUser);
        }
      } catch (err) {
        console.error('Unexpected exception during initial session fetch:', err);
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
      const currentUser = session?.user ?? (process.env.NODE_ENV === 'development' ? DEV_FALLBACK_USER : null);
      setUser(currentUser);
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
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    } catch (err) {
      console.error('Error during signOut:', err);
    } finally {
      setSession(null);
      setUser(null);
      setLoading(false);
    }
  };

  const isAdmin = (user?.user_metadata as any)?.role?.toLowerCase() === 'admin' ||
                  user?.email === 'admin@mantenix.com' ||
                  user?.email === 'admin@example.com';

  return (
    <AuthContext.Provider value={{ user, session, loading, isAdmin, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
