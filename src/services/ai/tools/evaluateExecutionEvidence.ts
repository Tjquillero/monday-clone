import type { AiToolDefinition } from './types';
import { evaluateExecutionEvidence, type EvidenceAssessment } from '../evaluateExecutionEvidence';

export const evaluateExecutionEvidenceTool: AiToolDefinition<{ execution_id: string }, EvidenceAssessment> = {
  name: 'evaluate_execution_evidence',
  description:
    'Describe qué muestran las fotos de evidencia de una jornada (ejecución) específica y qué tan útiles ' +
    'parecen como evidencia (claridad, cantidad, ángulos). NUNCA evalúa si el trabajo está bien ejecutado, ' +
    'si cumple el contrato, ni si debe aprobarse o certificarse — esas son decisiones humanas. Usa esto ' +
    'para responder "¿qué muestran las fotos de esta jornada?" o "¿la evidencia de esta ejecución parece ' +
    'suficiente?". Requiere el execution_id exacto (usa get_executions_without_evidence u otro tool para ' +
    'encontrarlo primero si no lo tienes).',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      execution_id: { type: 'string', description: 'UUID de la ejecución (weekly_plan_item_executions).' },
    },
    required: ['execution_id'],
  },
  sideEffects: false,
  requiresConfirmation: false,
  execute: (supabase, params) => evaluateExecutionEvidence(supabase, params.execution_id),
};
