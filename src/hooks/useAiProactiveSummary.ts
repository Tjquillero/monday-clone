'use client';

import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { getDelayedWeeklyPlans } from '@/services/ai/domainTools/schedule';
import { getPendingBillableWork } from '@/services/ai/domainTools/actas';
import { buildProactiveSummaryMessage } from '@/services/ai/proactiveSummary';

// Sugerencia proactiva del copiloto: NO pasa por Gemini ni por el Tool
// Registry — no hay ninguna decisión de IA aquí, es la app avisando con un
// mensaje armado determinísticamente (buildProactiveSummaryMessage) a partir
// de las mismas DomainTools que ya usan las tools de Gemini (nunca duplica
// la consulta ni el cálculo). Las RPC subyacentes (get_delayed_weekly_plans,
// get_pending_billable_work) ya validan get_user_board_role() internamente
// — seguro invocarlas desde el cliente con el mismo supabase de sesión que
// usa el resto de la app.
//
// Exportada aparte del hook (en vez de quedar inline en queryFn) para poder
// probarla sin React Query — allSettled, no all: son 2 llamadas
// independientes, y un fallo transitorio de una no debe ocultar el aviso que
// la otra sí pudo calcular.
export async function fetchProactiveSummary(
  supabaseClient: SupabaseClient,
  boardId: string
): Promise<string | null> {
  const [delayedResult, pendingResult] = await Promise.allSettled([
    getDelayedWeeklyPlans(supabaseClient, boardId),
    getPendingBillableWork(supabaseClient, boardId),
  ]);

  const delayedPlanCount =
    delayedResult.status === 'fulfilled'
      ? new Set(delayedResult.value.map((d) => d.weeklyPlanId)).size
      : 0;
  const pending =
    pendingResult.status === 'fulfilled'
      ? pendingResult.value
      : { activities: 0, estimatedValue: 0, currency: '' };

  return buildProactiveSummaryMessage({
    delayedPlanCount,
    pendingActivities: pending.activities,
    estimatedValue: pending.estimatedValue,
    currency: pending.currency,
  });
}

export function useAiProactiveSummary(boardId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['ai-proactive-summary', boardId],
    queryFn: () => fetchProactiveSummary(supabase, boardId!),
    enabled: enabled && !!boardId,
    staleTime: 5 * 60 * 1000,
  });
}
