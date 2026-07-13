import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Único cliente Supabase con sesión de usuario real para Route Handlers.
// Sin esto, cualquier código server-side (como el orquestador de IA) que
// llame a supabaseClient.ts (el cliente de navegador) no tiene sesión —
// auth.uid() resuelve NULL dentro de las RPC, y cualquier chequeo de
// membresía falla en silencio. Este cliente reenvía las cookies de la
// petición entrante, así que auth.uid() en el servidor coincide con el
// usuario que hizo login en el navegador.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Solo puede fallar si se llama desde un Server Component en vez
            // de un Route Handler — no aplica aquí (siempre se usa dentro de
            // src/app/api/**/route.ts), pero se deja como salvaguarda.
          }
        },
      },
    }
  );
}
