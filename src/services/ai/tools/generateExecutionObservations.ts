import type { AiToolDefinition } from './types';
import { generateExecutionObservations, type ExecutionObservationsResult } from '../generateExecutionObservations';

export const generateExecutionObservationsTool: AiToolDefinition<
  { execution_id: string; board_id: string },
  ExecutionObservationsResult
> = {
  name: 'generate_execution_observations',
  description:
    'Genera observaciones para ayudar al supervisor a revisar una jornada — NUNCA conclusiones ni ' +
    'decisiones. Reutiliza los demás tools de evidencia (fase antes/después, calidad visual, duplicados ' +
    'exactos y visuales) y arma una lista de observaciones trazables: falta evidencia de una fase, la ' +
    'evidencia es limitada, hay un posible duplicado. NUNCA dice que la ejecución es fraudulenta, que debe ' +
    'rechazarse, que la certificación es inválida, ni que el trabajo no se hizo — esas siguen siendo ' +
    'decisiones humanas del flujo de negocio. Usa esto para responder "¿qué debería revisar de esta ' +
    'jornada?" o "dame un resumen de observaciones de esta ejecución".',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      execution_id: { type: 'string', description: 'UUID de la ejecución (weekly_plan_item_executions).' },
      board_id: { type: 'string', description: 'UUID del board al que pertenece la ejecución.' },
    },
    required: ['execution_id', 'board_id'],
  },
  sideEffects: false,
  requiresConfirmation: false,
  execute: (supabase, params) => generateExecutionObservations(supabase, params.execution_id, params.board_id),
};
