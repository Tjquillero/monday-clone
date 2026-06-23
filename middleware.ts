import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const isOfflineMode = !supabaseUrl || !supabaseAnonKey
  const isProduction = process.env.NODE_ENV === 'production'
  const allowDemo = process.env.NEXT_PUBLIC_ALLOW_DEMO === 'true' || !isProduction

  let session = null

  const mockSessionCookie = request.cookies.get('sb-mock-session')?.value

  // --- Rama 1: Modo offline/dev (con cookie de sesión simulada existente) ---
  if (allowDemo && mockSessionCookie) {
    try {
      session = JSON.parse(decodeURIComponent(mockSessionCookie))
    } catch (e) {
      console.error('[middleware] Error parsing mock session cookie:', e)
    }
  }

  // --- Rama 2: Supabase real (producción o desarrollo con BD real) ---
  if (!session && !isOfflineMode) {
    try {
      const supabase = createServerClient(supabaseUrl!, supabaseAnonKey!, {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            request.cookies.set({ name, value, ...options })
            response = NextResponse.next({ request: { headers: request.headers } })
            response.cookies.set({ name, value, ...options })
          },
          remove(name: string, options: CookieOptions) {
            request.cookies.set({ name, value: '', ...options })
            response = NextResponse.next({ request: { headers: request.headers } })
            response.cookies.set({ name, value: '', ...options })
          },
        },
      })
      const { data } = await supabase.auth.getSession()
      session = data?.session ?? null
    } catch (e) {
      console.warn('[middleware] Supabase getSession failed:', e instanceof Error ? e.message : String(e))
    }
  }

  // --- Protección de rutas ---
  const isProtectedRoute =
    request.nextUrl.pathname.startsWith('/dashboard') ||
    request.nextUrl.pathname.startsWith('/projects') ||
    request.nextUrl.pathname.startsWith('/my-work') ||
    request.nextUrl.pathname.startsWith('/okrs') ||
    request.nextUrl.pathname.startsWith('/dashboards')

  if (isProtectedRoute && !session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if ((request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/') && session) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}