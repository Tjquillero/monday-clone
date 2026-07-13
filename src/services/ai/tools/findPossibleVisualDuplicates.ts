import type { AiToolDefinition } from './types';
import { findPossibleVisualDuplicates, type VisualDuplicateAssessment } from '../findPossibleVisualDuplicates';

export const findPossibleVisualDuplicatesTool: AiToolDefinition<{ execution_id: string }, VisualDuplicateAssessment> = {
  name: 'find_possible_visual_duplicates',
  description:
    'Compara las fotos de evidencia de una ejecución (que ya NO son duplicados exactos — eso se descarta ' +
    'antes con un hash) y señala pares que PARECEN la misma escena o el mismo punto de vista, con ' +
    'diferencias mínimas. NUNCA dice cuál foto es correcta, cuál eliminar, ni afirma fraude o mala ' +
    'certificación — solo describe similitud visual, la decisión sigue siendo humana. Si hay más de 12 ' +
    'fotos distintas o menos de 2, se niega explícitamente. Usa esto para responder "¿alguna foto parece ' +
    'repetida en esta jornada?".',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      execution_id: { type: 'string', description: 'UUID de la ejecución (weekly_plan_item_executions).' },
    },
    required: ['execution_id'],
  },
  sideEffects: false,
  requiresConfirmation: false,
  execute: (supabase, params) => findPossibleVisualDuplicates(supabase, params.execution_id),
};
