import type { AiToolDefinition } from './types';
import { getExecutionSummary, type ExecutionSummaryDto } from '../domainTools/execution';

export const getExecutionSummaryTool: AiToolDefinition<Record<string, never>, ExecutionSummaryDto> = {
  name: 'get_execution_summary',
  description:
    'Obtiene cuántas jornadas ejecutadas de un board están reported (reportadas por el líder, pendientes de que el supervisor las verifique), verified (aprobadas) o rejected (observadas). Úsalo para responder "¿qué certificaciones faltan?" o "¿cuánto trabajo hay pendiente de verificar?".',
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
    return getExecutionSummary(supabase, ctx.boardId);
  },
};
