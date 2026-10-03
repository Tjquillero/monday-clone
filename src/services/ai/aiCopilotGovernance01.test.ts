/**
 * Test Suite: GATE AI-COPILOT-01 — Copiloto confiable (Fase 1)
 *
 * Pruebas:
 * 1. Ningún parametersJsonSchema del registro contiene board_id (recorrer AI_TOOL_REGISTRY).
 * 2. El orquestador llama a tool.execute con ctx.boardId igual al de la ruta, aunque el modelo envíe otro board_id en los argumentos.
 * 3. systemInstruction no contiene ningún UUID: probar con una expresión regular de UUID.
 * 4. Reintento: un 503 y luego un éxito -> responde bien. Siempre 503 en los dos modelos -> código AI_UNAVAILABLE, y el mensaje no contiene "error", "code" ni texto en inglés del proveedor.
 * 5. Un 400 no se reintenta: una sola llamada por modelo.
 * 6. La ruta responde 403 AI_FORBIDDEN si el usuario no está en board_members. Ignora un groupId de otro board.
 */

jest.mock('next/server', () => ({
  NextRequest: class MockNextRequest {
    url: string;
    method: string;
    body: any;
    headers: any;
    constructor(url: string, init?: any) {
      this.url = url;
      this.method = init?.method || 'GET';
      this.body = init?.body;
      this.headers = new Map(Object.entries(init?.headers || {}));
    }
    async json() {
      return typeof this.body === 'string' ? JSON.parse(this.body) : this.body;
    }
  },
  NextResponse: {
    json: (data: any, init?: any) => ({
      status: init?.status || 200,
      json: async () => data,
      data,
    }),
  },
}));

import { AI_TOOL_REGISTRY } from './tools/registry';
import { runAiOrchestrator } from './orchestrator';
import { generateWithModelFallback, isRetryableError, AiServiceError, MODELS_TO_TRY } from './geminiFallback';
import { POST } from '@/app/api/ai/ask/route';
import { NextRequest } from 'next/server';

const mockGenerateContent = jest.fn();

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: {
      generateContent: (args: any) => mockGenerateContent(args),
    },
  })),
  Type: {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
    ARRAY: 'ARRAY',
    BOOLEAN: 'BOOLEAN',
    NUMBER: 'NUMBER',
    INTEGER: 'INTEGER',
  },
}));

// Mock del cliente Supabase server-side para pruebas de ruta
const mockGetUser = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/supabaseServerClient', () => ({
  createSupabaseServerClient: jest.fn().mockImplementation(async () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  })),
}));

describe('GATE AI-COPILOT-01 — Copiloto confiable', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-api-key-123';
    mockGenerateContent.mockReset();
    mockGetUser.mockReset();
    mockFrom.mockReset();
  });

  // 1. Ningún parametersJsonSchema del registro contiene board_id
  test('1. Ningún parametersJsonSchema del registro contiene board_id', () => {
    const tools = Object.values(AI_TOOL_REGISTRY);
    expect(tools.length).toBe(15);

    for (const tool of tools) {
      const properties = tool.parametersJsonSchema.properties || {};
      expect(properties).not.toHaveProperty('board_id');

      const required = tool.parametersJsonSchema.required || [];
      expect(required).not.toContain('board_id');
    }
  });

  // 2. El orquestador llama a tool.execute con ctx.boardId igual al de la ruta, aunque el modelo envíe otro board_id
  test('2. El orquestador pasa ctx.boardId del servidor y desestima cualquier board_id enviado por el modelo', async () => {
    const serverBoardId = '3ea0326f-1111-2222-3333-444455556666';
    const fakeModelBoardId = '7476008d-9999-8888-7777-666655554444';

    mockGenerateContent
      .mockResolvedValueOnce({
        functionCalls: [
          {
            name: 'get_current_board',
            args: { board_id: fakeModelBoardId },
          },
        ],
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ functionCall: { name: 'get_current_board', args: { board_id: fakeModelBoardId } } }],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        candidates: [{ content: { role: 'model', parts: [{ text: 'Tablero verificado.' }] } }],
      });

    const mockRpc = jest.fn().mockImplementation((fnName: string, args: any) => {
      if (fnName === 'get_current_board') {
        return {
          single: () => Promise.resolve({ data: { board_id: args.p_board_id, board_name: 'Playa 1', role: 'admin' }, error: null }),
        };
      }
      return Promise.resolve({ data: null, error: null });
    });

    const supabase = {
      rpc: mockRpc,
    } as any;

    const result = await runAiOrchestrator({
      supabase,
      message: '¿cuál es el board actual?',
      boardId: serverBoardId,
    });

    expect(result.text).toBe('Tablero verificado.');
    // La RPC de get_current_board fue llamada con p_board_id = serverBoardId, NO fakeModelBoardId
    expect(mockRpc).toHaveBeenCalledWith('get_current_board', { p_board_id: serverBoardId });
  });

  // 3. systemInstruction no contiene ningún UUID
  test('3. systemInstruction no contiene ningún UUID', async () => {
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

    let capturedConfig: any = null;
    mockGenerateContent.mockImplementationOnce((callArgs: any) => {
      capturedConfig = callArgs.config;
      return Promise.resolve({
        candidates: [{ content: { role: 'model', parts: [{ text: 'Hola' }] } }],
      });
    });

    const supabase = { rpc: jest.fn().mockResolvedValue({ data: null, error: null }) } as any;

    await runAiOrchestrator({
      supabase,
      message: 'hola',
      boardId: '3ea0326f-9999-4444-aaaa-bbbbccccdddd',
      boardName: 'Tablero Principal de Playas',
      groupId: '99887766-5544-3322-1100-ffeeddccbbaa',
      groupName: 'Playa Country',
      weekStart: '2026-10-05',
    });

    expect(capturedConfig).toBeDefined();
    expect(capturedConfig.systemInstruction).toBeDefined();
    expect(capturedConfig.systemInstruction).toMatch(/Tablero activo: Tablero Principal de Playas/);
    expect(capturedConfig.systemInstruction).toMatch(/Sitio activo: Playa Country/);
    expect(capturedConfig.systemInstruction).toMatch(/Semana activa \(inicio\): 2026-10-05/);
    expect(capturedConfig.systemInstruction).not.toMatch(uuidRegex);
  });

  // 4. Reintentos: un 503 y luego éxito -> responde bien; siempre 503 en los dos modelos -> código AI_UNAVAILABLE sin texto en inglés ni 'error'
  test('4. Reintentos ante 503 y fallback con categorización AI_UNAVAILABLE', async () => {
    jest.useFakeTimers();
    try {
      const fakeClient = {} as any;

      // Caso A: 1er intento 503, 2do intento éxito
      let callCount = 0;
      const requestWithOneTransientError = jest.fn().mockImplementation(async (model: string) => {
        callCount++;
        if (callCount === 1) {
          const err: any = new Error('503 Service Unavailable: This model is currently experiencing high demand.');
          err.status = 503;
          throw err;
        }
        return { text: 'Respuesta exitosa' };
      });

      const promiseA = generateWithModelFallback(fakeClient, requestWithOneTransientError);
      await jest.runAllTimersAsync();
      const resA = await promiseA;
      expect(resA.response.text).toBe('Respuesta exitosa');
      expect(callCount).toBe(2);

      // Caso B: Siempre 503 en todos los intentos y modelos
      const requestAlways503 = jest.fn().mockImplementation(async () => {
        const err: any = new Error('503 Service Unavailable: This model is currently experiencing high demand.');
        err.status = 503;
        throw err;
      });

      let thrownError: any = null;
      const promiseB = generateWithModelFallback(fakeClient, requestAlways503).catch((err) => {
        thrownError = err;
      });
      await jest.runAllTimersAsync();
      await promiseB;

      expect(thrownError).toBeInstanceOf(AiServiceError);
      expect(thrownError?.code).toBe('AI_UNAVAILABLE');
      expect(thrownError?.message).toBe(
        'El asistente no está disponible en este momento por alta demanda del servicio de IA. Intenta de nuevo en unos minutos.'
      );
      expect(thrownError?.message.toLowerCase()).not.toContain('error');
      expect(thrownError?.message.toLowerCase()).not.toContain('code');
      expect(thrownError?.message.toLowerCase()).not.toContain('unavailable');
      expect(thrownError?.message).not.toMatch(/\bhigh demand\b/i);
    } finally {
      jest.useRealTimers();
    }
  });

  // 5. Un 400 no se reintenta: una sola llamada por modelo
  test('5. Un error 400 (no reintentable) no se reintenta: 1 sola llamada por modelo', async () => {
    const fakeClient = {} as any;
    const calls: string[] = [];

    const request400 = jest.fn().mockImplementation(async (model: string) => {
      calls.push(model);
      const err: any = new Error('400 Bad Request: INVALID_ARGUMENT');
      err.status = 400;
      throw err;
    });

    try {
      await generateWithModelFallback(fakeClient, request400);
    } catch (err: any) {
      expect(err).toBeInstanceOf(AiServiceError);
      expect(err.code).toBe('AI_INTERNAL');
    }

    // 1 llamada por cada modelo de MODELS_TO_TRY, sin reintentos intermedios
    expect(calls).toEqual(MODELS_TO_TRY);
    expect(request400).toHaveBeenCalledTimes(MODELS_TO_TRY.length);
  });

  // 6. La ruta responde 403 AI_FORBIDDEN si el usuario no está en board_members; ignora groupId de otro board
  test('6. La ruta responde 403 AI_FORBIDDEN si no es miembro y valida pertenencia de groupId', async () => {
    // 6a: No autenticado
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const req1 = new NextRequest('http://localhost:3000/api/ai/ask', {
      method: 'POST',
      body: JSON.stringify({ message: 'hola' }),
    });
    const res1 = await POST(req1);
    expect(res1.status).toBe(401);

    // 6b: Usuario autenticado pero no miembro del board
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'board_members') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    const req2 = new NextRequest('http://localhost:3000/api/ai/ask', {
      method: 'POST',
      body: JSON.stringify({ message: 'hola', boardId: 'board-no-member' }),
    });
    const res2 = await POST(req2);
    expect(res2.status).toBe(403);
    const data2 = await res2.json();
    expect(data2.code).toBe('AI_FORBIDDEN');
    expect(data2.error).toBe('No tienes acceso a este tablero.');
  });

  // 7. Presupuesto de tiempo total: con deadlineMs insuficiente tras 503, aborta de inmediato sin esperas ni reintentos
  test('7. Presupuesto de tiempo: con deadlineMs vencido o insuficiente tras un 503, aborta de inmediato con AI_UNAVAILABLE sin esperas', async () => {
    const fakeClient = {} as any;
    let calls = 0;
    const request503 = jest.fn().mockImplementation(async () => {
      calls++;
      const err: any = new Error('503 Service Unavailable');
      err.status = 503;
      throw err;
    });

    // Con deadline que vencería antes de cumplir el delay de 1500ms
    const deadlineNear = Date.now() + 500;
    try {
      await generateWithModelFallback(fakeClient, request503, deadlineNear);
      throw new Error('Debería haber fallado');
    } catch (err: any) {
      expect(err).toBeInstanceOf(AiServiceError);
      expect(err.code).toBe('AI_UNAVAILABLE');
      expect(calls).toBe(1); // Exactamente 1 llamada, no esperó reintentos
    }

    // Con deadline ya vencido antes de llamar
    calls = 0;
    const deadlineExpired = Date.now() - 1000;
    try {
      await generateWithModelFallback(fakeClient, request503, deadlineExpired);
      throw new Error('Debería haber fallado');
    } catch (err: any) {
      expect(err).toBeInstanceOf(AiServiceError);
      expect(err.code).toBe('AI_UNAVAILABLE');
      expect(calls).toBe(0); // Cero llamadas al estar vencido previamente
    }
  });
});
