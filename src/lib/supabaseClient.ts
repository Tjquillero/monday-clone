import { createBrowserClient } from '@supabase/ssr';
import { OfflineQueryBuilder } from './offlineDB';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const isBrowser = typeof window !== 'undefined';

// Dejar solo el cliente real
export const realClient = createBrowserClient(supabaseUrl, supabaseAnonKey);

// Proxy dinámico para interceptación offline
export const supabase = new Proxy({}, {
  get(target, prop) {
    const useOffline = isBrowser && !window.navigator.onLine;

    // Interceptar consultas de tablas cuando no hay señal
    if (useOffline && prop === 'from') {
      return (table: string) => new OfflineQueryBuilder(table);
    }

    return (realClient as any)[prop];
  }
}) as any;
