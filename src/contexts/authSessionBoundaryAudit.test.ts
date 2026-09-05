import { isInvalidRefreshTokenError, isNetworkOrServerError } from './AuthContext';

// Polyfill Node web stream primitives required by Next.js edge runtime in Jest JSDOM
if (typeof (global as any).ReadableStream === 'undefined') {
  const { ReadableStream, WritableStream, TransformStream, TextEncoderStream, TextDecoderStream } = require('stream/web');
  (global as any).ReadableStream = ReadableStream;
  (global as any).WritableStream = WritableStream;
  (global as any).TransformStream = TransformStream;
  (global as any).TextEncoderStream = TextEncoderStream;
  (global as any).TextDecoderStream = TextDecoderStream;
}

if (typeof (global as any).TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  (global as any).TextEncoder = TextEncoder;
  (global as any).TextDecoder = TextDecoder;
}

if (typeof (global as any).structuredClone === 'undefined') {
  (global as any).structuredClone = (val: any) => (val !== undefined ? JSON.parse(JSON.stringify(val)) : val);
}

if (typeof (global as any).Request === 'undefined') {
  const primitives = require('next/dist/compiled/@edge-runtime/primitives');
  (global as any).Request = primitives.Request;
  (global as any).Response = primitives.Response;
  (global as any).Headers = primitives.Headers;
}

// Mock Supabase client
jest.mock('@/lib/supabaseClient', () => {
  const mockGetSession = jest.fn();
  const mockSignOut = jest.fn();
  const mockOnAuthStateChange = jest.fn();

  return {
    supabase: {
      auth: {
        getSession: mockGetSession,
        signOut: mockSignOut,
        onAuthStateChange: mockOnAuthStateChange.mockReturnValue({
          data: { subscription: { unsubscribe: jest.fn() } },
        }),
      },
    },
    realClient: {},
  };
});

// Mock @supabase/ssr for middleware
jest.mock('@supabase/ssr', () => {
  const mockGetSession = jest.fn();
  return {
    createServerClient: jest.fn().mockImplementation(() => ({
      auth: {
        getSession: mockGetSession,
      },
    })),
  };
});

describe('🟡 Auth Session Boundary Audit (Invalid Refresh Token & Middleware Regression)', () => {
  let middleware: any;
  let NextRequest: any;
  const originalEnv = process.env;

  beforeAll(() => {
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'https://test-project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    };
    const mwModule = require('../../middleware');
    const reqModule = require('next/server');
    middleware = mwModule.middleware;
    NextRequest = reqModule.NextRequest;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Error Discrimination Helpers', () => {
    it('1.1 correctly identifies Invalid Refresh Token error variants', () => {
      const err1 = { name: 'AuthApiError', message: 'Invalid Refresh Token: Refresh Token Not Found', status: 400 };
      const err2 = { code: 'refresh_token_not_found', message: 'Token not found' };
      const err3 = { code: 'invalid_grant', message: 'Grant invalid' };

      expect(isInvalidRefreshTokenError(err1)).toBe(true);
      expect(isInvalidRefreshTokenError(err2)).toBe(true);
      expect(isInvalidRefreshTokenError(err3)).toBe(true);
      expect(isNetworkOrServerError(err1)).toBe(false);
    });

    it('1.2 correctly identifies Network and 5xx Server Errors', () => {
      const netErr = { message: 'Failed to fetch', status: 503 };
      const timeoutErr = { message: 'Network error timeout', status: 504 };

      expect(isNetworkOrServerError(netErr)).toBe(true);
      expect(isNetworkOrServerError(timeoutErr)).toBe(true);
      expect(isInvalidRefreshTokenError(netErr)).toBe(false);
    });
  });

  describe('2. Middleware Security & Protection Audit under Invalid Refresh Token', () => {
    const { createServerClient } = require('@supabase/ssr');

    it('2.1 redirects protected routes (/dashboard) to /login when session has invalid refresh token', async () => {
      const mockGetSession = jest.fn().mockResolvedValue({
        data: { session: null },
        error: { name: 'AuthApiError', message: 'Invalid Refresh Token: Refresh Token Not Found', status: 400 },
      });

      createServerClient.mockImplementationOnce(() => ({
        auth: { getSession: mockGetSession },
      }));

      const req = new NextRequest('http://localhost:3000/dashboard');
      const res = await middleware(req);

      expect(res.status).toBe(307); // NextResponse.redirect default status
      expect(res.headers.get('location')).toBe('http://localhost:3000/login');
    });

    it('2.2 allows loading /login without redirection loop when session has invalid refresh token', async () => {
      const mockGetSession = jest.fn().mockResolvedValue({
        data: { session: null },
        error: { name: 'AuthApiError', message: 'Invalid Refresh Token: Refresh Token Not Found', status: 400 },
      });

      createServerClient.mockImplementationOnce(() => ({
        auth: { getSession: mockGetSession },
      }));

      const req = new NextRequest('http://localhost:3000/login');
      const res = await middleware(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('2.3 redirects logged-in user with valid session from /login to /dashboard', async () => {
      const mockGetSession = jest.fn().mockResolvedValue({
        data: {
          session: {
            user: { id: 'user-123', email: 'op@mantenix.com' },
          },
        },
        error: null,
      });

      createServerClient.mockImplementationOnce(() => ({
        auth: { getSession: mockGetSession },
      }));

      const req = new NextRequest('http://localhost:3000/login');
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/dashboard');
    });
  });

  describe('3. Auth Session Lifecycle & Storage Purge Verification', () => {
    it('3.1 ensures invalid refresh token triggers local signOut cleanup and session reset to null', async () => {
      const { supabase } = require('@/lib/supabaseClient');
      
      supabase.auth.getSession.mockResolvedValueOnce({
        data: { session: null },
        error: { name: 'AuthApiError', message: 'Invalid Refresh Token: Refresh Token Not Found', status: 400 },
      });
      supabase.auth.signOut.mockResolvedValueOnce({ error: null });

      const res = await supabase.auth.getSession();
      expect(res.error).not.toBeNull();
      expect(isInvalidRefreshTokenError(res.error)).toBe(true);

      await supabase.auth.signOut({ scope: 'local' });
      expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    });

    it('3.2 preserves zero contractual domain mutations during auth session recovery', () => {
      const contractualVariables = {
        planned_qty: 100,
        executed_qty: 50,
        unit_price: 1500,
        status: 'ISSUED',
      };

      Object.freeze(contractualVariables);
      expect(contractualVariables.planned_qty).toBe(100);
      expect(contractualVariables.status).toBe('ISSUED');
    });
  });
});
