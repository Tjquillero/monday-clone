// Tests de unidad e integración de Orchestrator (INCREMENTO A: Multi-turn Tool Orchestration)
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
  getToolDefinition: (name: string) => {
    if (name === 'slow_tool') {
      return {
        name: 'slow_tool',
        execute: async () => {
          await new Promise((resolve) => setTimeout(resolve, SLOW_TOOL_DELAY_MS));
          return { ok: true };
        },
      };
    }
    if (name === 'tool_a') {
      return {
        name: 'tool_a',
        execute: async (_supabase: any, args: any) => ({ resultA: true, ...args }),
      };
    }
    if (name === 'tool_b') {
      return {
        name: 'tool_b',
        execute: async (_supabase: any, args: any) => ({ resultB: true, ...args }),
      };
    }
    if (name === 'tool_c') {
      return {
        name: 'tool_c',
        execute: async (_supabase: any, args: any) => ({ resultC: true, ...args }),
      };
    }
    if (name === 'tool_d') {
      return {
        name: 'tool_d',
        execute: async (_supabase: any, args: any) => ({ resultD: true, ...args }),
      };
    }
    if (name === 'error_tool') {
      return {
        name: 'error_tool',
        execute: async () => {
          throw new Error('Database connection failed');
        },
      };
    }
    return undefined;
  },
  listToolDeclarations: () => [
    { name: 'slow_tool', description: '', parametersJsonSchema: {} },
    { name: 'tool_a', description: '', parametersJsonSchema: {} },
    { name: 'tool_b', description: '', parametersJsonSchema: {} },
    { name: 'tool_c', description: '', parametersJsonSchema: {} },
    { name: 'tool_d', description: '', parametersJsonSchema: {} },
    { name: 'error_tool', description: '', parametersJsonSchema: {} },
  ],
}));

import { runAiOrchestrator, extractCandidateText, MAX_TOOL_TURNS } from './orchestrator';

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

describe('runAiOrchestrator — INCREMENTO A: Multi-turn Tool Orchestration', () => {
  const supabase = { rpc: jest.fn().mockResolvedValue({ data: null, error: null }) } as any;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockGenerateContent.mockReset();
    supabase.rpc.mockClear();
  });

  // 1. Texto inmediato sin tools
  it('1. responde inmediatamente si el modelo no solicita tools', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      candidates: [{ content: { role: 'model', parts: [{ text: 'Hola, ¿en qué puedo ayudarte?' }] } }],
    });

    const result = await runAiOrchestrator({
      supabase,
      message: 'hola',
      boardId: null,
    });

    expect(result.text).toBe('Hola, ¿en qué puedo ayudarte?');
    expect(result.citations).toEqual([]);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  // 2. Una tool -> texto
  it('2. ejecuta una sola tool y devuelve el texto final', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({
        functionCalls: [{ name: 'tool_a', args: { x: 1 } }],
        candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'tool_a', args: { x: 1 } } }] } }],
      })
      .mockResolvedValueOnce({
        candidates: [{ content: { role: 'model', parts: [{ text: 'Resultado de tool A procesado.' }] } }],
      });

    const result = await runAiOrchestrator({
      supabase,
      message: 'ejecuta A',
      boardId: 'b-1',
    });

    expect(result.text).toBe('Resultado de tool A procesado.');
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].tool).toBe('tool_a');
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  // 3. Tool A -> Tool B -> texto (2 turnos)
  it('3. ejecuta Tool A, luego Tool B en segundo turno y devuelve el texto final', async () => {
    mockGenerateContent
      // Turno 1
      .mockResolvedValueOnce({
        functionCalls: [{ name: 'tool_a', args: { query: 'summary' } }],
        candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'tool_a', args: { query: 'summary' } } }] } }],
      })
      // Turno 2
      .mockResolvedValueOnce({
        functionCalls: [{ name: 'tool_b', args: { detail: 'extra' } }],
        candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'tool_b', args: { detail: 'extra' } } }] } }],
      })
      // Turno 3 (Texto final)
      .mockResolvedValueOnce({
        candidates: [{ content: { role: 'model', parts: [{ text: 'Respuesta combinada A + B.' }] } }],
      });

    const result = await runAiOrchestrator({
      supabase,
      message: 'consulta compleja',
      boardId: 'b-1',
    });

    expect(result.text).toBe('Respuesta combinada A + B.');
    expect(result.citations).toHaveLength(2);
    expect(result.citations[0].tool).toBe('tool_a');
    expect(result.citations[1].tool).toBe('tool_b');
    expect(mockGenerateContent).toHaveBeenCalledTimes(3);
  });

  // 4. Cadena de 4 tools: A -> B -> C -> D -> texto (4 turnos)
  it('4. ejecuta una cadena de 4 tools consecutivas y entrega el texto final', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({
        functionCalls: [{ name: 'tool_a', args: { step: 1 } }],
        candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'tool_a', args: { step: 1 } } }] } }],
      })
      .mockResolvedValueOnce({
        functionCalls: [{ name: 'tool_b', args: { step: 2 } }],
        candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'tool_b', args: { step: 2 } } }] } }],
      })
      .mockResolvedValueOnce({
        functionCalls: [{ name: 'tool_c', args: { step: 3 } }],
        candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'tool_c', args: { step: 3 } } }] } }],
      })
      .mockResolvedValueOnce({
        functionCalls: [{ name: 'tool_d', args: { step: 4 } }],
        candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'tool_d', args: { step: 4 } } }] } }],
      })
      .mockResolvedValueOnce({
        candidates: [{ content: { role: 'model', parts: [{ text: 'Análisis completo de los 4 pasos.' }] } }],
      });

    const result = await runAiOrchestrator({
      supabase,
      message: 'ejecuta 4 pasos',
      boardId: 'b-1',
    });

    expect(result.text).toBe('Análisis completo de los 4 pasos.');
    expect(result.citations).toHaveLength(4);
    expect(result.citations.map((c) => c.tool)).toEqual(['tool_a', 'tool_b', 'tool_c', 'tool_d']);
    expect(mockGenerateContent).toHaveBeenCalledTimes(5);
  });

  // 5. Preservación de thought + thoughtSignature
  it('5. preserva candidates[0].content íntegro con thought_signature', async () => {
    const customThoughtContent = {
      role: 'model',
      parts: [
        {
          functionCall: { name: 'tool_a', args: {} },
          thoughtSignature: 'sig_abc_123',
        },
      ],
    };

    mockGenerateContent
      .mockResolvedValueOnce({
        functionCalls: [{ name: 'tool_a', args: {} }],
        candidates: [{ content: customThoughtContent }],
      })
      .mockResolvedValueOnce({
        candidates: [{ content: { role: 'model', parts: [{ text: 'Listo con thought preservado.' }] } }],
      });

    const result = await runAiOrchestrator({
      supabase,
      message: 'test thought',
      boardId: 'b-1',
    });

    expect(result.text).toBe('Listo con thought preservado.');
    // Verifica que contents enviado en la 2da llamada contiene exactamente customThoughtContent
    const secondCallContents = mockGenerateContent.mock.calls[1][0].contents;
    expect(secondCallContents).toContain(customThoughtContent);
  });

  // 6. Loop Guard: llamada idéntica repetida corta el bucle
  it('6. corta el loop si el modelo pide exactamente la misma tool con los mismos argumentos', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({
        functionCalls: [{ name: 'tool_a', args: { id: 1 } }],
        candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'tool_a', args: { id: 1 } } }] } }],
      })
      // Turno 2: Pide EXACTAMENTE la misma llamada que en Turno 1
      .mockResolvedValueOnce({
        functionCalls: [{ name: 'tool_a', args: { id: 1 } }],
        candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'tool_a', args: { id: 1 } } }] } }],
      });

    const result = await runAiOrchestrator({
      supabase,
      message: 'loop test',
      boardId: 'b-1',
    });

    // Se ejecutó en el primer turno, pero al repetirse en el segundo el loop guard corta
    expect(result.citations).toHaveLength(1);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  // 7. MAX_TOOL_TURNS = 4 alcanzado
  it('7. respeta el hard cap MAX_TOOL_TURNS = 4 y no ejecuta más de 4 turnos de tools', async () => {
    // 5 respuestas consecutivas con herramientas
    mockGenerateContent
      .mockResolvedValueOnce({
        functionCalls: [{ name: 'tool_a', args: { i: 1 } }],
        candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'tool_a', args: { i: 1 } } }] } }],
      })
      .mockResolvedValueOnce({
        functionCalls: [{ name: 'tool_b', args: { i: 2 } }],
        candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'tool_b', args: { i: 2 } } }] } }],
      })
      .mockResolvedValueOnce({
        functionCalls: [{ name: 'tool_c', args: { i: 3 } }],
        candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'tool_c', args: { i: 3 } } }] } }],
      })
      .mockResolvedValueOnce({
        functionCalls: [{ name: 'tool_d', args: { i: 4 } }],
        candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'tool_d', args: { i: 4 } } }] } }],
      })
      .mockResolvedValueOnce({
        functionCalls: [{ name: 'tool_a', args: { i: 5 } }],
        candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'tool_a', args: { i: 5 } } }] } }],
      });

    const result = await runAiOrchestrator({
      supabase,
      message: 'loop infinito de herramientas',
      boardId: 'b-1',
    });

    expect(MAX_TOOL_TURNS).toBe(4);
    // Solo se ejecutaron 4 turnos de tools
    expect(result.citations).toHaveLength(4);
    expect(mockGenerateContent).toHaveBeenCalledTimes(5);
    // Al no haber producido texto y agotarse los turnos, responde el fallback defensivo
    expect(result.text).toBe('No obtuve una respuesta del modelo. Intenta reformular la pregunta.');
  });

  // 8. Tool rechazada/no autorizada
  it('8. maneja tool no autorizada con fallback determinista y registra intento', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({
        functionCalls: [{ name: 'unauthorized_dangerous_tool', args: {} }],
        candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'unauthorized_dangerous_tool', args: {} } }] } }],
      })
      .mockResolvedValueOnce({
        candidates: [{ content: { role: 'model', parts: [] } }],
      });

    const result = await runAiOrchestrator({
      supabase,
      message: 'usa tool prohibida',
      boardId: 'b-1',
    });

    expect(result.citations).toHaveLength(0);
    expect(result.text).toBe('No puedo responder esa consulta porque no existe una herramienta autorizada para obtener esa información.');
    expect(supabase.rpc).toHaveBeenCalledWith('log_ai_tool_call_attempt', expect.objectContaining({
      p_tool_name: 'unauthorized_dangerous_tool',
      p_is_whitelisted: false,
    }));
  });

  // 9. Citations acumuladas de múltiples tools
  it('9. acumula citations con duración real en múltiples turnos', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({
        functionCalls: [{ name: 'tool_a', args: { x: 10 } }],
        candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'tool_a', args: { x: 10 } } }] } }],
      })
      .mockResolvedValueOnce({
        functionCalls: [{ name: 'tool_b', args: { y: 20 } }],
        candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'tool_b', args: { y: 20 } } }] } }],
      })
      .mockResolvedValueOnce({
        candidates: [{ content: { role: 'model', parts: [{ text: 'Final.' }] } }],
      });

    const result = await runAiOrchestrator({
      supabase,
      message: 'multi citations',
      boardId: 'b-1',
    });

    expect(result.citations).toHaveLength(2);
    expect(result.citations[0]).toMatchObject({ tool: 'tool_a', args: { x: 10 } });
    expect(result.citations[1]).toMatchObject({ tool: 'tool_b', args: { y: 20 } });
  });

  // 10. Error de una tool
  it('10. captura el error de una tool, lo registra y permite que Gemini maneje el error', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({
        functionCalls: [{ name: 'error_tool', args: {} }],
        candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'error_tool', args: {} } }] } }],
      })
      .mockResolvedValueOnce({
        candidates: [{ content: { role: 'model', parts: [{ text: 'La base de datos reportó un error al consultar.' }] } }],
      });

    const result = await runAiOrchestrator({
      supabase,
      message: 'ejecuta error_tool',
      boardId: 'b-1',
    });

    expect(result.text).toBe('La base de datos reportó un error al consultar.');
    expect(result.citations).toHaveLength(0); // Errores no se agregan a citations
    expect(supabase.rpc).toHaveBeenCalledWith('log_ai_tool_call_attempt', expect.objectContaining({
      p_tool_name: 'error_tool',
      p_is_whitelisted: true,
      p_error: 'Database connection failed',
    }));
  });

  // 11. Respuesta final multipart thought + text
  it('11. extrae texto de respuesta multipart que contiene thought y text', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({
        functionCalls: [{ name: 'tool_a', args: {} }],
        candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'tool_a', args: {} } }] } }],
      })
      .mockResolvedValueOnce({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                { thought: true, text: 'Internal chain-of-thought analysis...' },
                { text: 'Respuesta analizada con éxito.' },
              ],
            },
          },
        ],
      });

    const result = await runAiOrchestrator({
      supabase,
      message: 'test multipart',
      boardId: 'b-1',
    });

    expect(result.text).toBe('Respuesta analizada con éxito.');
  });

  // 12. Respuesta con functionCall sin texto en turno 2 continúa el loop
  it('12. continúa el loop cuando el turno intermedio tiene functionCall y no texto', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({
        functionCalls: [{ name: 'tool_a', args: {} }],
        candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'tool_a', args: {} } }] } }],
      })
      // Turno intermedio: solo functionCall, sin texto
      .mockResolvedValueOnce({
        functionCalls: [{ name: 'tool_b', args: {} }],
        candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'tool_b', args: {} } }] } }],
      })
      // Turno final: texto
      .mockResolvedValueOnce({
        candidates: [{ content: { role: 'model', parts: [{ text: 'Completado tras 2 herramientas.' }] } }],
      });

    const result = await runAiOrchestrator({
      supabase,
      message: 'test no premature fallback',
      boardId: 'b-1',
    });

    expect(result.text).toBe('Completado tras 2 herramientas.');
    expect(result.citations).toHaveLength(2);
  });
});
