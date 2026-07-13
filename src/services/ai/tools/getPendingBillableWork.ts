import type { AiToolDefinition } from './types';
import { getPendingBillableWork, type PendingBillableWorkDto } from '../domainTools/actas';

export const getPendingBillableWorkTool: AiToolDefinition<{ board_id: string }, PendingBillableWorkDto> = {
  name: 'get_pending_billable_work',
  description:
    'Obtiene un resumen de las actividades certificadas de un board que todavía no se han facturado: cuántas actividades, cuántas ejecuciones, y el valor estimado si se generara un acta hoy. Usa esto para responder "¿qué puedo facturar hoy?".',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      board_id: { type: 'string', description: 'UUID del board.' },
    },
    required: ['board_id'],
  },
  sideEffects: false,
  requiresConfirmation: false,
  execute: (supabase, params) => getPendingBillableWork(supabase, params.board_id),
};
