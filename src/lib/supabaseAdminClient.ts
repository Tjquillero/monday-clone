import { createClient } from '@supabase/supabase-js';

/**
 * Crea un cliente Supabase con SERVICE_ROLE_KEY.
 *
 * =============================================================================
 * CLASIFICACIÓN ARQUITECTÓNICA: SERVER-SIDE ONLY / PRIVILEGED
 * =============================================================================
 * Este cliente bypasea RLS y opera como service_role en PostgreSQL.
 *
 * REGLAS OBLIGATORIAS:
 *   1. SOLO puede instanciarse desde Route Handlers de Next.js (src/app/api/).
 *   2. NUNCA importar desde componentes React, hooks, o src/lib/supabaseClient.ts.
 *   3. La SERVICE_ROLE_KEY NUNCA debe enviarse al browser.
 *   4. Toda operación con este cliente debe estar precedida por verificación
 *      de autenticación y autorización usando createSupabaseServerClient().
 *
 * FLUJO OBLIGATORIO:
 *   browser → authenticated request
 *     → Route Handler: verifica sesión (createSupabaseServerClient)
 *     → Route Handler: verifica RBAC / contexto
 *     → Route Handler: llama servicio con createSupabaseAdminClient()
 *
 * PROHIBIDO:
 *   browser → createSupabaseAdminClient()  ← NUNCA
 * =============================================================================
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_ADMIN_CLIENT_INIT_ERROR: NEXT_PUBLIC_SUPABASE_URL y ' +
      'SUPABASE_SERVICE_ROLE_KEY son requeridos. ' +
      'Verificar variables de entorno server-side.'
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
