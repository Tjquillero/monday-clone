import type { AiToolDefinition } from './types';
import { getBoardSummary, type BoardSummaryDto } from '../domainTools/board';

export const getBoardSummaryTool: AiToolDefinition<Record<string, never>, BoardSummaryDto> = {
  name: 'get_board_summary',
  description:
    'Obtiene una visión general del board: versión activa del POA, valor contratado, valor certificado, porcentaje de avance del contrato, cantidad de actas en borrador/emitidas, y el saldo facturable pendiente. Úsalo como punto de partida para preguntas generales como "¿cómo va el contrato?" o "hazme un resumen".',
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
    return getBoardSummary(supabase, ctx.boardId);
  },
};
