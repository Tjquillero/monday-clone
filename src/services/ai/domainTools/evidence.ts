import type { SupabaseClient } from '@supabase/supabase-js';

// DomainTools de evidencia fotográfica — v2.1 de Fase 5 (visión por
// computador). Ver src/services/ai/domainTools/actas.ts para la
// explicación general de esta capa (Tool Registry -> DomainTools -> RPC).

export interface ExecutionWithoutEvidenceDto {
  executionId: string;
  weeklyPlanId: string;
  activityKey: string;
  activityName: string;
  zoneName: string;
  executionDate: string;
  planStatus: string;
}

export async function getExecutionsWithoutEvidence(
  supabase: SupabaseClient,
  boardId: string
): Promise<ExecutionWithoutEvidenceDto[]> {
  const { data, error } = await supabase.rpc('get_executions_without_evidence', {
    p_board_id: boardId,
  });
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    execution_id: string;
    weekly_plan_id: string;
    activity_key: string;
    activity_name: string;
    zone_name: string;
    execution_date: string;
    plan_status: string;
  }>;

  return rows.map((row) => ({
    executionId: row.execution_id,
    weeklyPlanId: row.weekly_plan_id,
    activityKey: row.activity_key,
    activityName: row.activity_name,
    zoneName: row.zone_name,
    executionDate: row.execution_date,
    planStatus: row.plan_status,
  }));
}

export interface ExecutionAttachmentRef {
  fileUrl: string;
  fileName: string;
  fileType: string | null;
}

// Lookup autorizado de fotos de una ejecución — usado por
// evaluateExecutionEvidence.ts (v2.2). Separado de ese archivo a propósito:
// este es un wrapper de RPC puro, sin dependencia de @google/genai, para
// poder testear el resto de la capa sin pelear con Jest transformando el
// SDK de Gemini (mismo patrón que proactiveSummary.ts/explainImportErrorsPrompt.ts).
export async function getExecutionAttachments(
  supabase: SupabaseClient,
  executionId: string
): Promise<ExecutionAttachmentRef[]> {
  const { data, error } = await supabase.rpc('get_execution_attachments', {
    p_execution_id: executionId,
  });
  if (error) throw error;

  const rows = (data ?? []) as Array<{ file_url: string; file_name: string; file_type: string | null }>;
  return rows.map((row) => ({ fileUrl: row.file_url, fileName: row.file_name, fileType: row.file_type }));
}
