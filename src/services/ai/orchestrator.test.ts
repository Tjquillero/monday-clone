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

import { runAiOrchestrator } from './orchestrator';

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
