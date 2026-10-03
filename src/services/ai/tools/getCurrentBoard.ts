import type { AiToolDefinition } from './types';

// Tool de prueba de infraestructura (Fase 1, Hito 0). Cero valor de
// negocio a propósito — confirma la tubería completa (sesión server-side,
// auth.uid(), RPC, DTO) antes de construir cualquier tool real.
export const getCurrentBoardTool: AiToolDefinition<
  Record<string, never>,
  { board_id: string; board_name: string; role: string }
> = {
  name: 'get_current_board',
  description:
    'Devuelve el nombre del board y el rol del usuario actual en ese board. Úsalo para confirmar a qué board/proyecto pertenece la conversación antes de responder preguntas sobre él.',
  parametersJsonSchema: {
    type: 'object',
    properties: {},
  },
  sideEffects: false,
  requiresConfirmation: false,
  execute: async (supabase, _params, ctx) => {
    if (!ctx.boardId) {
      throw new Error('Abre un tablero para hacer esta consulta.');
    }
    const { data, error } = await supabase
      .rpc('get_current_board', { p_board_id: ctx.boardId })
      .single();
    if (error) throw error;
    return data as { board_id: string; board_name: string; role: string };
  },
};
