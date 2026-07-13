import type { GoogleGenAI } from '@google/genai';

// gemini-1.5-flash fue retirado del catálogo de la API (confirmado contra
// GET /v1beta/models — ya no aparece); gemini-2.0-flash SÍ existe pero
// devuelve 429 con "limit: 0" en este plan (cuota cero, no agotada — nunca
// va a funcionar aquí, no solo "hoy"). gemini-flash-lite-latest es el único
// de los candidatos probados con cuota real disponible en la capa gratuita
// de este proyecto (verificado con una llamada real, no supuesto) — un
// fallback genuino cuando 3-flash-preview devuelve 429 por cuota diaria
// agotada (no un error de código).
export const MODELS_TO_TRY = ['gemini-3-flash-preview', 'gemini-flash-lite-latest'];

export async function generateWithModelFallback(
  client: GoogleGenAI,
  request: (model: string) => Promise<any>
): Promise<{ response: any; usedModel: string }> {
  let lastError: any = null;
  for (const model of MODELS_TO_TRY) {
    try {
      const response = await request(model);
      return { response, usedModel: model };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('No se pudo contactar a Gemini.');
}
