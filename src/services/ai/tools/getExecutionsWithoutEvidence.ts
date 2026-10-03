import type { AiToolDefinition } from './types';
import { getExecutionsWithoutEvidence, type ExecutionWithoutEvidenceDto } from '../domainTools/evidence';

export const getExecutionsWithoutEvidenceTool: AiToolDefinition<
  Record<string, never>,
  ExecutionWithoutEvidenceDto[]
> = {
  name: 'get_executions_without_evidence',
  description:
    'Obtiene las jornadas (ejecuciones) verificadas de un board que NO tienen ninguna foto de evidencia ' +
    'subida. Es la misma condición que ya bloquea confirmar un plan semanal (Gate de evidencia) — este ' +
    'tool solo informa, no bloquea nada. Usa esto para responder "¿qué jornadas no tienen evidencia?" o ' +
    '"¿falta evidencia fotográfica en algún lado?". No evalúa la calidad de las fotos existentes — solo su ' +
    'ausencia total.',
  parametersJsonSchema: {
    type: 'object',
    properties: {},
  },
  sideEffects: false,
  requiresConfirmation: false,
  execute: (supabase, _params, ctx) => {
    if (!ctx.boardId) {
      throw new Error('Abre un tablero para hacer esta consulta.');
    }
    return getExecutionsWithoutEvidence(supabase, ctx.boardId);
  },
};
