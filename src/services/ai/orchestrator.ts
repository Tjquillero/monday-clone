import { GoogleGenAI } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getToolDefinition, listToolDeclarations } from './tools/registry';

// El Orchestrator es la ÚNICA pieza que habla con Gemini. El modelo nunca
// toca Supabase directamente — solo "pide" tools, y este código decide si
// ejecutarlas (whitelist) y con qué cliente (sesión real del usuario, nunca
// service role). Ver src/services/ai/tools/types.ts para el contrato de un
// tool.
//
// Regla dura: si el modelo pide un tool que no está en el registro, NO se
// ejecuta nada — se registra el intento (para saber qué tools construir
// después, a partir de uso real) y se le informa al modelo que no puede
// resolver esa consulta. El modelo nunca puede "improvisar" una respuesta
// sin pasar por una herramienta autorizada.

// gemini-1.5-flash fue retirado del catálogo de la API (confirmado contra
// GET /v1beta/models — ya no aparece); gemini-2.0-flash SÍ existe pero
// devuelve 429 con "limit: 0" en este plan (cuota cero, no agotada — nunca
// va a funcionar aquí, no solo "hoy"). gemini-flash-lite-latest es el único
// de los candidatos probados con cuota real disponible en la capa gratuita
// de este proyecto (verificado con una llamada real, no supuesto) — un
// fallback genuino cuando 3-flash-preview devuelve 429 por cuota diaria
// agotada (no un error de código).
const MODELS_TO_TRY = ['gemini-3-flash-preview', 'gemini-flash-lite-latest'];

const SYSTEM_INSTRUCTION_BASE =
  'Eres el copiloto de operaciones de Mantenix. SOLO puedes responder preguntas ' +
  'invocando las herramientas disponibles — nunca inventes cifras, fechas ni ' +
  'nombres. Si no hay una herramienta que resuelva la consulta del usuario, dilo ' +
  'explícitamente: no puedes ayudar con eso todavía. Nunca calcules nada por tu ' +
  'cuenta (por ejemplo, un total o un porcentaje) — si necesitas un cálculo, debe ' +
  'venir ya resuelto en la respuesta de una herramienta.';

export interface AiOrchestratorResult {
  text: string;
  toolsUsed: string[];
}

export async function runAiOrchestrator(args: {
  supabase: SupabaseClient;
  message: string;
  boardId: string | null;
}): Promise<AiOrchestratorResult> {
  const { supabase, message, boardId } = args;

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada.');

  const client = new GoogleGenAI({ apiKey });
  const toolDeclarations = listToolDeclarations();

  const systemInstruction =
    SYSTEM_INSTRUCTION_BASE +
    (boardId ? `\nEl board_id actual de esta conversación es: ${boardId}.` : '');

  const contents: any[] = [{ role: 'user', parts: [{ text: message }] }];
  const config = { systemInstruction, tools: [{ functionDeclarations: toolDeclarations }] };

  let response: any = null;
  let lastError: any = null;
  let usedModel = '';

  for (const model of MODELS_TO_TRY) {
    try {
      response = await client.models.generateContent({ model, contents, config });
      usedModel = model;
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (!response) {
    throw lastError instanceof Error ? lastError : new Error('No se pudo contactar a Gemini.');
  }

  const toolsUsed: string[] = [];
  let anyToolRejected = false;
  const functionCalls = response.functionCalls as Array<{ name: string; args?: Record<string, unknown> }> | undefined;

  if (functionCalls && functionCalls.length > 0) {
    // Reenviar el turno del modelo TAL CUAL lo devolvió (candidates[0].content),
    // no reconstruido a mano desde response.functionCalls — Gemini 3 adjunta un
    // thought_signature a cada parte de function call que debe viajar de vuelta
    // sin modificar, o el segundo turno falla con INVALID_ARGUMENT (confirmado
    // empíricamente, no documentado de forma obvia).
    const modelContent = response.candidates?.[0]?.content;
    contents.push(
      modelContent ?? { role: 'model', parts: functionCalls.map((call) => ({ functionCall: call })) }
    );

    const responseParts: any[] = [];

    for (const call of functionCalls) {
      const tool = getToolDefinition(call.name);
      const isWhitelisted = !!tool;
      let output: unknown;
      let errorMsg: string | null = null;

      if (!isWhitelisted) {
        errorMsg = `No existe una herramienta autorizada llamada "${call.name}".`;
      } else {
        try {
          output = await tool.execute(supabase, call.args || {});
        } catch (err: any) {
          errorMsg = err?.message || String(err);
        }
      }

      // Se registra SIEMPRE, esté o no en la whitelist — es la evidencia
      // para decidir qué tools construir después, pedidos por uso real.
      await supabase.rpc('log_ai_tool_call_attempt', {
        p_board_id: boardId,
        p_tool_name: call.name,
        p_is_whitelisted: isWhitelisted,
        p_arguments: call.args || {},
        p_error: errorMsg,
      });

      if (isWhitelisted && !errorMsg) toolsUsed.push(call.name);
      if (!isWhitelisted) anyToolRejected = true;

      responseParts.push({
        functionResponse: {
          name: call.name,
          response: errorMsg ? { error: errorMsg } : { output },
        },
      });
    }

    contents.push({ role: 'user', parts: responseParts });

    response = await client.models.generateContent({ model: usedModel, contents, config });
  }

  const text: string =
    response.candidates?.[0]?.content?.parts?.[0]?.text ||
    response.text ||
    // Fallback defensivo: en la práctica, tras recibir un functionResponse
    // de error (tool fuera de whitelist), el modelo a veces no genera texto
    // de seguimiento en el mismo turno (confirmado empíricamente) — el
    // usuario nunca debe ver una respuesta vacía en silencio.
    (anyToolRejected
      ? 'No puedo responder esa consulta porque no existe una herramienta autorizada para obtener esa información.'
      : 'No obtuve una respuesta del modelo. Intenta reformular la pregunta.');

  return { text, toolsUsed };
}
