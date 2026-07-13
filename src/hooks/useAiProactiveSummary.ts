'use client';

import { useQuery } from '@tanstack/react-query';
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
export function useAiProactiveSummary(boardId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['ai-proactive-summary', boardId],
    queryFn: async () => {
      const [delayed, pending] = await Promise.all([
        getDelayedWeeklyPlans(supabase, boardId!),
        getPendingBillableWork(supabase, boardId!),
      ]);
      const delayedPlanCount = new Set(delayed.map((d) => d.weeklyPlanId)).size;
      return buildProactiveSummaryMessage({
        delayedPlanCount,
        pendingActivities: pending.activities,
        estimatedValue: pending.estimatedValue,
        currency: pending.currency,
      });
    },
    enabled: enabled && !!boardId,
    staleTime: 5 * 60 * 1000,
  });
}
