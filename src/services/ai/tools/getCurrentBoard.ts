import type { AiToolDefinition } from './types';

// Tool de prueba de infraestructura (Fase 1, Hito 0). Cero valor de
// negocio a propósito — confirma la tubería completa (sesión server-side,
// auth.uid(), RPC, DTO) antes de construir cualquier tool real.
export const getCurrentBoardTool: AiToolDefinition<
  { board_id: string },
  { board_id: string; board_name: string; role: string }
> = {
  name: 'get_current_board',
  description:
    'Devuelve el nombre del board y el rol del usuario actual en ese board. Úsalo para confirmar a qué board/proyecto pertenece la conversación antes de responder preguntas sobre él.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      board_id: { type: 'string', description: 'UUID del board.' },
    },
    required: ['board_id'],
  },
  sideEffects: false,
  requiresConfirmation: false,
  execute: async (supabase, params) => {
    const { data, error } = await supabase
      .rpc('get_current_board', { p_board_id: params.board_id })
      .single();
    if (error) throw error;
    return data as { board_id: string; board_name: string; role: string };
  },
};
