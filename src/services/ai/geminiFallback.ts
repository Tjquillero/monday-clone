import type { GoogleGenAI } from '@google/genai';

export const MODELS_TO_TRY = ['gemini-3-flash-preview', 'gemini-flash-lite-latest'];

export type AiErrorCode = 'AI_UNAVAILABLE' | 'AI_CONFIG' | 'AI_FORBIDDEN' | 'AI_INTERNAL';

export class AiServiceError extends Error {
  code: AiErrorCode;
  originalError?: any;

  constructor(code: AiErrorCode, message: string, originalError?: any) {
    super(message);
    this.name = 'AiServiceError';
    this.code = code;
    this.originalError = originalError;
  }
}

export const AI_UNAVAILABLE_MESSAGE =
  'El asistente no está disponible en este momento por alta demanda del servicio de IA. Intenta de nuevo en unos minutos.';

export function isRetryableError(err: any): boolean {
  if (!err) return false;
  const status = err.status || err.statusCode || err.response?.status;
  const msg = (err.message || String(err)).toUpperCase();

  // 400 / INVALID_ARGUMENT no es reintentable
  if (status === 400 || msg.includes('400') || msg.includes('INVALID_ARGUMENT')) {
    return false;
  }

  // 401 / 403 / UNAUTHENTICATED / PERMISSION_DENIED no son reintentables
  if (status === 401 || status === 403 || msg.includes('UNAUTHENTICATED') || msg.includes('PERMISSION_DENIED')) {
    return false;
  }

  if (status === 429 || status === 500 || status === 503) {
    return true;
  }

  if (
    msg.includes('429') ||
    msg.includes('500') ||
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('HIGH DEMAND')
  ) {
    return true;
  }

  return false;
}

const RETRY_DELAYS_MS = [1500, 4000];

export async function generateWithModelFallback(
  client: GoogleGenAI,
  request: (model: string) => Promise<any>,
  deadlineMs?: number
): Promise<{ response: any; usedModel: string }> {
  let lastError: any = null;
  let allErrorsRetryable = true;

  for (const model of MODELS_TO_TRY) {
    const maxAttempts = 1 + RETRY_DELAYS_MS.length; // 1 inicial + 2 reintentos = 3

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Verificar si ya venció el plazo total
      if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
        throw new AiServiceError('AI_UNAVAILABLE', AI_UNAVAILABLE_MESSAGE, lastError);
      }

      try {
        const response = await request(model);
        return { response, usedModel: model };
      } catch (err: any) {
        lastError = err;
        const retryable = isRetryableError(err);
        if (!retryable) {
          allErrorsRetryable = false;
          break; // No reintentar este modelo si no es reintentable
        }

        // Si es reintentable y quedan intentos en este modelo, verificar plazo antes de esperar
        if (attempt < RETRY_DELAYS_MS.length) {
          const delay = RETRY_DELAYS_MS[attempt];
          if (deadlineMs !== undefined && Date.now() + delay >= deadlineMs) {
            throw new AiServiceError('AI_UNAVAILABLE', AI_UNAVAILABLE_MESSAGE, lastError);
          }
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
  }

  // Clasificar error final
  if (allErrorsRetryable && lastError) {
    throw new AiServiceError('AI_UNAVAILABLE', AI_UNAVAILABLE_MESSAGE, lastError);
  }

  if (lastError instanceof AiServiceError) {
    throw lastError;
  }

  throw new AiServiceError(
    'AI_INTERNAL',
    'Ocurrió un error inesperado al procesar tu consulta con el modelo de IA.',
    lastError
  );
}
