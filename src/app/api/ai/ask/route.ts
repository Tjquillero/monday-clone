import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServerClient';
import { runAiOrchestrator } from '@/services/ai/orchestrator';

// Endpoint nuevo del copiloto de IA (Fase 1). Deliberadamente separado de
// /api/ai/chat (el widget viejo, self-healing prompts) — no se toca ese
// endpoint hasta congelar y probar este por completo. Ver
// src/services/ai/orchestrator.ts para el contrato de tool-calling.
export async function POST(req: NextRequest) {
  try {
    const { message, boardId } = await req.json();

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
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error en /api/ai/ask:', error);
    return NextResponse.json({ error: error?.message || 'Error interno' }, { status: 500 });
  }
}
