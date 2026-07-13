import type { AiToolDefinition } from './types';
import { compareBeforeAfterEvidence, type BeforeAfterAssessment } from '../compareBeforeAfterEvidence';

export const compareBeforeAfterEvidenceTool: AiToolDefinition<{ execution_id: string }, BeforeAfterAssessment> = {
  name: 'compare_before_after_evidence',
  description:
    'Compara las fotos "antes" y "después" de una jornada (ejecución) y describe qué cambios se observan ' +
    'y qué áreas se ven igual. NUNCA evalúa si la actividad fue ejecutada correctamente, si cumple el ' +
    'contrato, ni si debe aprobarse la certificación — esas son decisiones humanas. Si la ejecución no ' +
    'tiene fotos clasificadas en ambas fases, se niega explícitamente en vez de adivinar. Usa esto para ' +
    'responder "¿qué cambió entre el antes y el después de esta jornada?".',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      execution_id: { type: 'string', description: 'UUID de la ejecución (weekly_plan_item_executions).' },
    },
    required: ['execution_id'],
  },
  sideEffects: false,
  requiresConfirmation: false,
  execute: (supabase, params) => compareBeforeAfterEvidence(supabase, params.execution_id),
};
