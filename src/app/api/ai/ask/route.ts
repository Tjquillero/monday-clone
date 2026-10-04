import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServerClient';
import { runAiOrchestrator } from '@/services/ai/orchestrator';
import type { ConversationState } from '@/services/ai/conversationState';
import { AiServiceError } from '@/services/ai/geminiFallback';

export const maxDuration = 60;

// Endpoint del copiloto de IA. El servidor no guarda estado de conversación
// propio — `history` es el ConversationState opaco que el cliente reenvía
// tal cual (ver src/services/ai/conversationState.ts) y `result.history` es
// lo que el cliente debe guardar para la próxima pregunta.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { message, boardId, groupId, weekStart, history } = body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'message es requerido' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    let validatedBoardId: string | null = null;
    let boardName: string | null = null;

    if (boardId && typeof boardId === 'string' && boardId.trim()) {
      validatedBoardId = boardId.trim();

      // Validar membresía en el board
      const { data: membership, error: memberError } = await supabase
        .from('board_members')
        .select('id')
        .eq('board_id', validatedBoardId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (memberError || !membership) {
        return NextResponse.json(
          { error: 'No tienes acceso a este tablero.', code: 'AI_FORBIDDEN' },
          { status: 403 }
        );
      }

      // Obtener nombre del board para contexto legible
      const { data: boardData } = await supabase
        .from('boards')
        .select('name')
        .eq('id', validatedBoardId)
        .maybeSingle();

      if (boardData?.name) {
        boardName = boardData.name;
      }
    }

    let validatedGroupId: string | null = null;
    let groupName: string | null = null;

    if (groupId && typeof groupId === 'string' && validatedBoardId) {
      const { data: groupData } = await supabase
        .from('groups')
        .select('id, title')
        .eq('id', groupId.trim())
        .eq('board_id', validatedBoardId)
        .maybeSingle();

      if (groupData) {
        validatedGroupId = groupData.id;
        groupName = groupData.title;
      }
    }

    let validatedWeekStart: string | null = null;
    if (weekStart && typeof weekStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(weekStart.trim())) {
      validatedWeekStart = weekStart.trim();
    }

    const todayBogota = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());

    const result = await runAiOrchestrator({
      supabase,
      message: message.trim(),
      boardId: validatedBoardId,
      groupId: validatedGroupId,
      weekStart: validatedWeekStart,
      todayBogota,
      boardName,
      groupName,
      history: history && Array.isArray(history.contents) ? (history as ConversationState) : undefined,
    });

    return NextResponse.json({
      ...result,
      context: {
        boardName: boardName ?? null,
        groupName: groupName ?? null,
        weekStart: validatedWeekStart ?? null,
        todayBogota,
      },
    });
  } catch (error: any) {
    console.error('Error en /api/ai/ask:', error);

    if (error instanceof AiServiceError) {
      if (error.code === 'AI_UNAVAILABLE') {
        return NextResponse.json(
          { error: error.message, code: 'AI_UNAVAILABLE' },
          { status: 503 }
        );
      }
      if (error.code === 'AI_CONFIG') {
        return NextResponse.json(
          { error: 'El servicio de IA no está configurado correctamente.', code: 'AI_CONFIG' },
          { status: 500 }
        );
      }
      if (error.code === 'AI_FORBIDDEN') {
        return NextResponse.json(
          { error: 'No tienes acceso a este tablero.', code: 'AI_FORBIDDEN' },
          { status: 403 }
        );
      }
    }

    // Default error
    return NextResponse.json(
      { error: 'Ocurrió un error inesperado al procesar tu consulta.', code: 'AI_INTERNAL' },
      { status: 500 }
    );
  }
}
