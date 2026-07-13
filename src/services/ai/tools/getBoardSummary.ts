import type { AiToolDefinition } from './types';
import { getBoardSummary, type BoardSummaryDto } from '../domainTools/board';

export const getBoardSummaryTool: AiToolDefinition<{ board_id: string }, BoardSummaryDto> = {
  name: 'get_board_summary',
  description:
    'Obtiene una visión general del board: versión activa del POA, valor contratado, valor certificado, porcentaje de avance del contrato, cantidad de actas en borrador/emitidas, y el saldo facturable pendiente. Úsalo como punto de partida para preguntas generales como "¿cómo va el contrato?" o "hazme un resumen".',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      board_id: { type: 'string', description: 'UUID del board.' },
    },
    required: ['board_id'],
  },
  sideEffects: false,
  requiresConfirmation: false,
  execute: (supabase, params) => getBoardSummary(supabase, params.board_id),
};
