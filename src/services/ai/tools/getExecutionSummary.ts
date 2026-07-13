import type { AiToolDefinition } from './types';
import { getExecutionSummary, type ExecutionSummaryDto } from '../domainTools/execution';

export const getExecutionSummaryTool: AiToolDefinition<{ board_id: string }, ExecutionSummaryDto> = {
  name: 'get_execution_summary',
  description:
    'Obtiene cuántas jornadas ejecutadas de un board están reported (reportadas por el líder, pendientes de que el supervisor las verifique), verified (aprobadas) o rejected (observadas). Úsalo para responder "¿qué certificaciones faltan?" o "¿cuánto trabajo hay pendiente de verificar?".',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      board_id: { type: 'string', description: 'UUID del board.' },
    },
    required: ['board_id'],
  },
  sideEffects: false,
  requiresConfirmation: false,
  execute: (supabase, params) => getExecutionSummary(supabase, params.board_id),
};
