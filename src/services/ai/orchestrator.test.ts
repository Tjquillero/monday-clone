// Verifica que ToolCitation.durationMs mide de verdad el tiempo de
// ejecución del tool (no un valor fijo/simulado) — mockeando @google/genai
// por completo para no depender de una llamada real ni de la cuota diaria.

const mockGenerateContent = jest.fn();
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent },
  })),
}));

const SLOW_TOOL_DELAY_MS = 40;
jest.mock('./tools/registry', () => ({
  getToolDefinition: (name: string) =>
    name === 'slow_tool'
      ? {
          name: 'slow_tool',
          execute: async () => {
            await new Promise((resolve) => setTimeout(resolve, SLOW_TOOL_DELAY_MS));
            return { ok: true };
          },
        }
      : undefined,
  listToolDeclarations: () => [{ name: 'slow_tool', description: '', parametersJsonSchema: {} }],
}));

import { runAiOrchestrator, extractCandidateText } from './orchestrator';

describe('runAiOrchestrator — durationMs de las citas', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockGenerateContent.mockReset();
  });

  it('mide el tiempo real de ejecución del tool, no un valor fijo', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({
        functionCalls: [{ name: 'slow_tool', args: {} }],
        candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'slow_tool', args: {} } }] } }],
      })
      .mockResolvedValueOnce({
        candidates: [{ content: { role: 'model', parts: [{ text: 'Listo.' }] } }],
      });

    const supabase = { rpc: jest.fn().mockResolvedValue({ data: null, error: null }) } as any;

    const result = await runAiOrchestrator({
      supabase,
      message: 'usa slow_tool',
      boardId: null,
    });

    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].tool).toBe('slow_tool');
    expect(typeof result.citations[0].durationMs).toBe('number');
    // Margen generoso: el timer de Node no es exacto, pero debe reflejar
    // que realmente se esperó el setTimeout, no un cero ni un valor inventado.
    expect(result.citations[0].durationMs).toBeGreaterThanOrEqual(SLOW_TOOL_DELAY_MS - 15);
  });
});

describe('runAiOrchestrator — fallback de modelo en la segunda llamada', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockGenerateContent.mockReset();
  });

  // Reproduce el bug: la llamada que sigue a la ejecución del tool (la que
  // convierte el functionResponse en texto final) usaba client.models.generateContent
  // directo, sin pasar por generateWithModelFallback como la primera llamada.
  // Un 429 justo en esa segunda vuelta tumbaba todo el turno en vez de
  // reintentar con el modelo de respaldo.
  it('reintenta con el modelo de respaldo si la llamada posterior al tool falla con 429', async () => {
    mockGenerateContent
      // 1ª llamada (antes del tool): éxito directo con el modelo principal.
      .mockResolvedValueOnce({
        functionCalls: [{ name: 'slow_tool', args: {} }],
        candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'slow_tool', args: {} } }] } }],
      })
      // 2ª llamada (post-tool), intento con el modelo principal: falla.
      .mockRejectedValueOnce(new Error('429 quota exceeded'))
      // 2ª llamada, reintento con el modelo de respaldo: éxito.
      .mockResolvedValueOnce({
        candidates: [{ content: { role: 'model', parts: [{ text: 'Listo (con respaldo).' }] } }],
      });

    const supabase = { rpc: jest.fn().mockResolvedValue({ data: null, error: null }) } as any;

    const result = await runAiOrchestrator({
      supabase,
      message: 'usa slow_tool',
      boardId: null,
    });

    expect(mockGenerateContent).toHaveBeenCalledTimes(3);
    expect(result.text).toBe('Listo (con respaldo).');
  });
});

describe('extractCandidateText — extracción segura y filtrado de razonamiento (thoughts)', () => {
  it('extrae el texto final cuando parts[0] es un bloque de thought', () => {
    const response = {
      candidates: [
        {
          content: {
            role: 'model',
            parts: [
              { thought: true, text: 'Thinking: analyzing tools...' },
              { text: 'Respuesta final válida' },
            ],
          },
        },
      ],
    };

    expect(extractCandidateText(response)).toBe('Respuesta final válida');
  });

  it('devuelve cadena vacía si todas las partes son thought', () => {
    const response = {
      candidates: [
        {
          content: {
            role: 'model',
            parts: [
              { thought: true, text: 'Thinking 1...' },
              { thought: true, text: 'Thinking 2...' },
            ],
          },
        },
      ],
    };

    expect(extractCandidateText(response)).toBe('');
  });

  it('concatena múltiples partes de texto válidas preservando el orden', () => {
    const response = {
      candidates: [
        {
          content: {
            role: 'model',
            parts: [
              { text: 'Primer párrafo.' },
              { thought: true, text: 'Internal note' },
              { text: 'Segundo párrafo.' },
            ],
          },
        },
      ],
    };

    expect(extractCandidateText(response)).toBe('Primer párrafo.\n\nSegundo párrafo.');
  });

  it('prioriza response.text si existe y es string no vacío', () => {
    const response = {
      text: 'Respuesta top-level directa',
      candidates: [
        {
          content: {
            role: 'model',
            parts: [{ text: 'Texto en parts' }],
          },
        },
      ],
    };

    expect(extractCandidateText(response)).toBe('Respuesta top-level directa');
  });
});

describe('runAiOrchestrator — respuesta multi-part tras ejecución de tool', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockGenerateContent.mockReset();
  });

  it('procesa correctamente candidate con thought en parts[0] y texto en parts[1] post-tool', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({
        functionCalls: [{ name: 'slow_tool', args: {} }],
        candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'slow_tool', args: {} } }] } }],
      })
      .mockResolvedValueOnce({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                { thought: true, text: 'Analyzing tool output internally...' },
                { text: 'Recomendaciones calculadas exitosamente.' },
              ],
            },
          },
        ],
      });

    const supabase = { rpc: jest.fn().mockResolvedValue({ data: null, error: null }) } as any;

    const result = await runAiOrchestrator({
      supabase,
      message: 'ejecuta slow_tool y dame el resultado',
      boardId: 'test-board',
    });

    expect(result.citations).toHaveLength(1);
    expect(result.text).toBe('Recomendaciones calculadas exitosamente.');
  });
});
