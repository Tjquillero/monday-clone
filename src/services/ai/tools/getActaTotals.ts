import type { AiToolDefinition } from './types';
import { getActaTotals, type ActaTotalsDto } from '../domainTools/actas';

export const getActaTotalsTool: AiToolDefinition<{ acta_id: string }, ActaTotalsDto> = {
  name: 'get_acta_totals',
  description:
    'Obtiene el resumen financiero oficial de un acta: subtotal, AIU (administración 20%, imprevistos 5%, utilidad 5%) y total a pagar. Usa esto para responder "¿cuánto vale esta acta?".',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      acta_id: { type: 'string', description: 'UUID del acta.' },
    },
    required: ['acta_id'],
  },
  sideEffects: false,
  requiresConfirmation: false,
  execute: (supabase, params) => getActaTotals(supabase, params.acta_id),
};
