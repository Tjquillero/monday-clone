import { createBrowserClient } from '@supabase/ssr';
import { MockSupabaseClient } from './mockSupabase';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const isBrowser = typeof window !== 'undefined';

// Instantiate both clients once
export const realClient = supabaseUrl && supabaseAnonKey ? createBrowserClient(supabaseUrl, supabaseAnonKey) : null;
export const mockClient = new MockSupabaseClient();

// Dynamic proxy wrapper
export const supabase = new Proxy({}, {
  get(target, prop) {
    const useMock = !supabaseUrl || !supabaseAnonKey || 
                    (isBrowser && (
                      localStorage.getItem('use_mock_db') === 'true' || 
                      localStorage.getItem('sb_mock_session') !== null ||
                      document.cookie.includes('sb-mock-session')
                    ));
    
    const activeClient = useMock || !realClient ? mockClient : realClient;
    return (activeClient as any)[prop];
  }
}) as any;
