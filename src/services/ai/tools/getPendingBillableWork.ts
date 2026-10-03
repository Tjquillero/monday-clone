import type { AiToolDefinition } from './types';
import { getPendingBillableWork, type PendingBillableWorkDto } from '../domainTools/actas';

export const getPendingBillableWorkTool: AiToolDefinition<Record<string, never>, PendingBillableWorkDto> = {
  name: 'get_pending_billable_work',
  description:
    'Obtiene un resumen de las actividades certificadas de un board que todavía no se han facturado: cuántas actividades, cuántas ejecuciones, y el valor estimado si se generara un acta hoy. Usa esto para responder "¿qué puedo facturar hoy?".',
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
    return getPendingBillableWork(supabase, ctx.boardId);
  },
};
