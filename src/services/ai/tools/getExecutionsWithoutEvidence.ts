import type { AiToolDefinition } from './types';
import { getExecutionsWithoutEvidence, type ExecutionWithoutEvidenceDto } from '../domainTools/evidence';

export const getExecutionsWithoutEvidenceTool: AiToolDefinition<
  { board_id: string },
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
    properties: {
      board_id: { type: 'string', description: 'UUID del board.' },
    },
    required: ['board_id'],
  },
  sideEffects: false,
  requiresConfirmation: false,
  execute: (supabase, params) => getExecutionsWithoutEvidence(supabase, params.board_id),
};
