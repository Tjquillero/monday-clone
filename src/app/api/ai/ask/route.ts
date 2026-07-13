import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServerClient';
import { runAiOrchestrator } from '@/services/ai/orchestrator';
import type { ConversationState } from '@/services/ai/conversationState';

// Endpoint del copiloto de IA. El servidor no guarda estado de conversación
// propio — `history` es el ConversationState opaco que el cliente reenvía
// tal cual (ver src/services/ai/conversationState.ts) y `result.history` es
// lo que el cliente debe guardar para la próxima pregunta.
export async function POST(req: NextRequest) {
  try {
    const { message, boardId, history } = await req.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message es requerido' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const result = await runAiOrchestrator({
      supabase,
      message,
      boardId: typeof boardId === 'string' ? boardId : null,
      history: history && Array.isArray(history.contents) ? (history as ConversationState) : undefined,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error en /api/ai/ask:', error);
    return NextResponse.json({ error: error?.message || 'Error interno' }, { status: 500 });
  }
}
