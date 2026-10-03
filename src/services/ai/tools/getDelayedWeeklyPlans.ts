import type { AiToolDefinition } from './types';
import { getDelayedWeeklyPlans, type DelayedWeeklyPlanDto } from '../domainTools/schedule';

export const getDelayedWeeklyPlansTool: AiToolDefinition<Record<string, never>, DelayedWeeklyPlanDto[]> = {
  name: 'get_delayed_weekly_plans',
  description:
    'Obtiene los planes semanales de un board cuya semana ya terminó pero que todavía no llegaron a estado "closed" — el ciclo operativo de esa semana quedó atrasado. Una fila por actividad dentro de cada plan atrasado, con días de retraso. Úsalo para responder "¿qué está atrasado?" o "¿qué actividades están retrasadas?". No confundir con ejecuciones sin verificar (eso es otro tool) ni con saldo pendiente de facturar (otro tool distinto).',
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
    return getDelayedWeeklyPlans(supabase, ctx.boardId);
  },
};
