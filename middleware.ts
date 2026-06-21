import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const mockSessionCookie = request.cookies.get('sb-mock-session')?.value;
  const isSignedOut = request.nextUrl.searchParams.has('signedout');
  let session = null;
  const defaultMockSession = {
    user: {
      id: 'mock-user-admin-default',
      email: 'admin@mantenix.com',
      user_metadata: { role: 'admin' }
    },
    expires_at: Math.floor(Date.now() / 1000) + 3600 * 24
  };

  if (mockSessionCookie) {
    try {
      session = JSON.parse(decodeURIComponent(mockSessionCookie));
    } catch (e) {
      console.error('Error parsing mock session cookie:', e);
    }
  } else if (!isSignedOut) {
    // Auto-login: assign session and set cookie
    session = defaultMockSession;
    response.cookies.set({
      name: 'sb-mock-session',
      value: encodeURIComponent(JSON.stringify(defaultMockSession)),
      path: '/',
      maxAge: 86400,
    });
  } else {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseAnonKey) {
      try {
        const supabase = createServerClient(
          supabaseUrl,
          supabaseAnonKey,
          {
            cookies: {
              get(name: string) {
                return request.cookies.get(name)?.value
              },
              set(name: string, value: string, options: CookieOptions) {
                request.cookies.set({
                  name,
                  value,
                  ...options,
                })
                response = NextResponse.next({
                  request: {
                    headers: request.headers,
                  },
                })
                response.cookies.set({
                  name,
                  value,
                  ...options,
                })
              },
              remove(name: string, options: CookieOptions) {
                request.cookies.set({
                  name,
                  value: '',
                  ...options,
                })
                response = NextResponse.next({
                  request: {
                    headers: request.headers,
                  },
                })
                response.cookies.set({
                  name,
                  value: '',
                  ...options,
                })
              },
            },
          }
        )
        const { data } = await supabase.auth.getSession();
        session = data?.session;
      } catch (e) {
        console.warn('Supabase getSession failed (offline mode):', e instanceof Error ? e.message : String(e));
      }
    }
  }

  const isProtectedRoute =
    request.nextUrl.pathname.startsWith('/dashboard') ||
    request.nextUrl.pathname.startsWith('/projects') ||
    request.nextUrl.pathname.startsWith('/my-work') ||
    request.nextUrl.pathname.startsWith('/okrs')

  if (isProtectedRoute && !session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if ((request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/') && session) {
    const redirectResponse = NextResponse.redirect(new URL('/dashboard', request.url))
    // Carry the cookie over in case it was just set
    if (!mockSessionCookie && !isSignedOut) {
      redirectResponse.cookies.set({
        name: 'sb-mock-session',
        value: encodeURIComponent(JSON.stringify(defaultMockSession)),
        path: '/',
        maxAge: 86400,
      });
    }
    return redirectResponse
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}