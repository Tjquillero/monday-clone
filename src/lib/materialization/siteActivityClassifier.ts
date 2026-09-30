/**
 * Módulo Canónico de Clasificación, Validación y Telemetría de Materialización (R1-b0 + R1-c)
 * Especificación: docs/gates/R1-b0_R1-c_SPEC.md v4.2 + Decisiones D1-D11
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { RoutineBaseTemplate } from '../routineScheduler';

export type SiteActivityAction =
  | 'MATERIALIZED'
  | 'NOT_SCHEDULED_NO_PERIODIC_FREQ'
  | 'NOT_SCHEDULED_NO_RENDIMIENTO'
  | 'SKIPPED_ZERO_QTY'
  | 'EXCLUDED_MISSING_STANDARD'
  | 'EXCLUDED_INVALID_CONTRACT'
  | 'EXCLUDED_ZONE_FREQUENCY_PENDING';

/**
 * Transitoria (D12, 2026-09-29). Se elimina cuando FREQ-SITE-01 cargue la frecuencia por zona de POA V.10.
 */
export const ZONE_FREQUENCY_PENDING_KEYS = ['1.12', '1.13', '1.15'];

export interface ActivityProcessingDetail {
  activity_key: string;
  action: SiteActivityAction;
  reason?: string;
  frequency_source: 'POA' | 'NONE';
  planned_qty?: number;
  planned_frecuencia?: number | null;
  planned_rendimiento?: number;
}

export interface SiteMaterializationSummaryPayload {
  board_id: string;
  group_id: string | null;
  week_start: string;
  plan_id?: string | null;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  total_activities_evaluated: number;
  materialized_count: number;
  not_scheduled_no_freq_count: number;
  not_scheduled_no_rendimiento_count: number;
  skipped_zero_qty_count: number;
  excluded_missing_standard_count: number;
  excluded_invalid_contract_count: number;
  excluded_zone_frequency_pending_count: number;
  is_partial: boolean;
  partial_reasons: string[];
  activities_detail: ActivityProcessingDetail[];
  detail_truncated?: boolean;
  template_source?: string;
  error?: {
    stage: 'pre_validation' | 'header' | 'sync' | 'post_verify' | 'exception';
    code?: string;
    message: string;
    details?: unknown;
  };
}

export interface ActivityClassificationContext {
  poaActivitiesMap: Map<string, { id: string; frecuencia: number | null }>;
  poaZoneQtyMap: Map<string, number>;
  hasZoneScopeData: boolean;
  allBoardStandards: Array<{
    id: string;
    activity_key: string;
    name: string;
    category?: string;
    unit: string;
    rendimiento: number;
    requiere_rendimiento: boolean;
    priority?: string;
  }>;
}

export interface ClassificationResult {
  templates: RoutineBaseTemplate[];
  summary: SiteMaterializationSummaryPayload;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  isPartial: boolean;
}

/**
 * Valida formato estricto de fecha con round-trip UTC (YYYY-MM-DD)
 */
export function isValidISODateString(d: unknown): boolean {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  try {
    const dateObj = new Date(`${d}T00:00:00Z`);
    if (isNaN(dateObj.getTime())) return false;
    return dateObj.toISOString().slice(0, 10) === d;
  } catch {
    return false;
  }
}

/**
 * Clasifica determinísticamente cada actividad del universo contractual del sitio
 *
 * Invariantes:
 * - D11: Si no hay POA activo -> FAILED con código NO_ACTIVE_POA.
 * - B1: Con POA activo, la cantidad sale SOLO de poa_activity_zones del sitio. Prohibido usar resource_analysis.
 * - B2: El universo = filas de poa_activity_zones con zone_id = sitio. SKIPPED_ZERO_QTY solo si cantidad_contratada = 0.
 *       Una actividad sin fila para el sitio no es parte del universo y no aparece en el detalle.
 */
export function classifySiteActivities(
  boardId: string,
  groupId: string | null,
  weekStartStr: string,
  context: ActivityClassificationContext
): ClassificationResult {
  const {
    poaActivitiesMap,
    poaZoneQtyMap,
    allBoardStandards,
  } = context;

  const standardsByKey = new Map<string, (typeof allBoardStandards)[0]>();
  for (const std of allBoardStandards) {
    standardsByKey.set(std.activity_key, std);
  }

  const templates: RoutineBaseTemplate[] = [];
  const activitiesDetail: ActivityProcessingDetail[] = [];
  const partialReasons: string[] = [];

  let materializedCount = 0;
  let notScheduledNoFreqCount = 0;
  let notScheduledNoRendimientoCount = 0;
  let skippedZeroQtyCount = 0;
  let excludedMissingStandardCount = 0;
  let excludedInvalidContractCount = 0;
  let excludedZoneFrequencyPendingCount = 0;

  const hasPoa = poaActivitiesMap.size > 0;

  // Decisión D11: Tablero sin POA activo -> FALLAR CERRADO (NO_ACTIVE_POA)
  if (!hasPoa) {
    const errorPayload: SiteMaterializationSummaryPayload = {
      board_id: boardId,
      group_id: groupId,
      week_start: weekStartStr,
      status: 'FAILED',
      total_activities_evaluated: 0,
      materialized_count: 0,
      not_scheduled_no_freq_count: 0,
      not_scheduled_no_rendimiento_count: 0,
      skipped_zero_qty_count: 0,
      excluded_missing_standard_count: 0,
      excluded_invalid_contract_count: 0,
      excluded_zone_frequency_pending_count: 0,
      is_partial: false,
      partial_reasons: [],
      activities_detail: [],
      error: {
        stage: 'pre_validation',
        code: 'NO_ACTIVE_POA',
        message: 'El tablero no cuenta con versión de POA activa',
      },
    };

    return {
      templates: [],
      summary: errorPayload,
      status: 'FAILED',
      isPartial: false,
    };
  }

  // Universo del sitio (B2): Exclusivamente las actividades con presencia en poa_activity_zones para este sitio
  for (const [activityKey, rawZoneQty] of poaZoneQtyMap.entries()) {
    const poaInfo = poaActivitiesMap.get(activityKey);
    const matchedStd = standardsByKey.get(activityKey);
    const cantidad = typeof rawZoneQty === 'number' ? Math.max(0, rawZoneQty) : 0;
    const rawFreq = poaInfo ? poaInfo.frecuencia : null;

    // Regla D3 / B2: Cantidad 0 en la zona
    if (cantidad <= 0) {
      skippedZeroQtyCount++;
      activitiesDetail.push({
        activity_key: activityKey,
        action: 'SKIPPED_ZERO_QTY',
        reason: 'Cantidad contratada es 0 en esta zona',
        frequency_source: typeof rawFreq === 'number' && Number.isFinite(rawFreq) && rawFreq > 0 ? 'POA' : 'NONE',
        planned_qty: 0,
        planned_frecuencia: rawFreq,
      });
      continue;
    }

    // Regla D12: Actividades con frecuencia contractual en POA V.10 por zona pero pendiente de carga (FREQ-SITE-01) -> PARCIAL
    if ((rawFreq === null || rawFreq === undefined) && ZONE_FREQUENCY_PENDING_KEYS.includes(activityKey)) {
      excludedZoneFrequencyPendingCount++;
      const reason = 'Frecuencia por zona pendiente de carga (POA V.10, FREQ-SITE-01)';
      partialReasons.push(`${activityKey}: ${reason}`);
      activitiesDetail.push({
        activity_key: activityKey,
        action: 'EXCLUDED_ZONE_FREQUENCY_PENDING',
        reason,
        frequency_source: 'NONE',
        planned_qty: cantidad,
        planned_frecuencia: null,
      });
      continue;
    }

    // Regla D2: Frecuencia NULL -> NOT_SCHEDULED_NO_PERIODIC_FREQ (Informativa, NO parcial)
    if (rawFreq === null || rawFreq === undefined) {
      notScheduledNoFreqCount++;
      activitiesDetail.push({
        activity_key: activityKey,
        action: 'NOT_SCHEDULED_NO_PERIODIC_FREQ',
        reason: 'Frecuencia es NULL en el POA (actividad contratada sin programación periódica)',
        frequency_source: 'NONE',
        planned_qty: cantidad,
        planned_frecuencia: null,
      });
      continue;
    }

    // Regla D2: Frecuencia no finita o <= 0 -> EXCLUDED_INVALID_CONTRACT (A2, PARCIAL)
    if (!Number.isFinite(rawFreq) || rawFreq <= 0) {
      excludedInvalidContractCount++;
      const reason = `Frecuencia inválida en POA: ${rawFreq}`;
      partialReasons.push(`${activityKey}: ${reason}`);
      activitiesDetail.push({
        activity_key: activityKey,
        action: 'EXCLUDED_INVALID_CONTRACT',
        reason,
        frequency_source: 'NONE',
        planned_qty: cantidad,
        planned_frecuencia: rawFreq,
      });
      continue;
    }

    // Estándar técnico inexistente -> EXCLUDED_MISSING_STANDARD (A2, PARCIAL)
    if (!matchedStd) {
      excludedMissingStandardCount++;
      const reason = 'No existe estándar en board_activity_standards';
      partialReasons.push(`${activityKey}: ${reason}`);
      activitiesDetail.push({
        activity_key: activityKey,
        action: 'EXCLUDED_MISSING_STANDARD',
        reason,
        frequency_source: 'POA',
        planned_qty: cantidad,
        planned_frecuencia: rawFreq,
      });
      continue;
    }

    // Estándar con requiere_rendimiento = false -> NOT_SCHEDULED_NO_RENDIMIENTO (Informativa, NO parcial)
    if (matchedStd.requiere_rendimiento === false) {
      notScheduledNoRendimientoCount++;
      activitiesDetail.push({
        activity_key: activityKey,
        action: 'NOT_SCHEDULED_NO_RENDIMIENTO',
        reason: 'Estándar técnico marcado con requiere_rendimiento = false',
        frequency_source: 'POA',
        planned_qty: cantidad,
        planned_frecuencia: rawFreq,
        planned_rendimiento: matchedStd.rendimiento,
      });
      continue;
    }

    // Rendimiento inválido <= 0 -> EXCLUDED_INVALID_CONTRACT (A2, PARCIAL)
    const rend = Number(matchedStd.rendimiento);
    if (!Number.isFinite(rend) || rend <= 0) {
      excludedInvalidContractCount++;
      const reason = `Rendimiento inválido en catálogo técnico: ${matchedStd.rendimiento}`;
      partialReasons.push(`${activityKey}: ${reason}`);
      activitiesDetail.push({
        activity_key: activityKey,
        action: 'EXCLUDED_INVALID_CONTRACT',
        reason,
        frequency_source: 'POA',
        planned_qty: cantidad,
        planned_frecuencia: rawFreq,
        planned_rendimiento: rend,
      });
      continue;
    }

    // Todo válido -> MATERIALIZED
    materializedCount++;
    templates.push({
      id: matchedStd.id,
      activity_key: matchedStd.activity_key,
      name: matchedStd.name,
      zone: matchedStd.category || 'Zona Verde',
      unit: matchedStd.unit,
      rendimiento: rend,
      frecuencia: rawFreq,
      cantidad,
    });

    activitiesDetail.push({
      activity_key: activityKey,
      action: 'MATERIALIZED',
      frequency_source: 'POA',
      planned_qty: cantidad,
      planned_frecuencia: rawFreq,
      planned_rendimiento: rend,
    });
  }

  const isPartial = excludedMissingStandardCount > 0 || excludedInvalidContractCount > 0 || excludedZoneFrequencyPendingCount > 0;
  const totalEvaluated = activitiesDetail.length;
  const status: 'SUCCESS' | 'PARTIAL' | 'FAILED' = isPartial ? 'PARTIAL' : 'SUCCESS';

  const summary: SiteMaterializationSummaryPayload = {
    board_id: boardId,
    group_id: groupId,
    week_start: weekStartStr,
    status,
    total_activities_evaluated: totalEvaluated,
    materialized_count: materializedCount,
    not_scheduled_no_freq_count: notScheduledNoFreqCount,
    not_scheduled_no_rendimiento_count: notScheduledNoRendimientoCount,
    skipped_zero_qty_count: skippedZeroQtyCount,
    excluded_missing_standard_count: excludedMissingStandardCount,
    excluded_invalid_contract_count: excludedInvalidContractCount,
    excluded_zone_frequency_pending_count: excludedZoneFrequencyPendingCount,
    is_partial: isPartial,
    partial_reasons: partialReasons,
    activities_detail: activitiesDetail,
  };

  return {
    templates,
    summary,
    status,
    isPartial,
  };
}

function getUtf8ByteLength(str: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str).length;
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.byteLength(str, 'utf8');
  }
  return str.length;
}

/**
 * Persiste eventos P3 en materialization_events vía log_materialization_event_rpc.
 * Aplica truncamiento defensivo en bytes (M3) si el payload supera 60.000 bytes.
 */
export async function persistMaterializationEvent(
  supabase: SupabaseClient,
  boardId: string,
  groupId: string | null,
  weekStartStr: string,
  planId: string | null,
  eventType: 'SITE_MATERIALIZATION_SUMMARY' | 'SEQUENCE_IDENTITY_CONFLICT' | 'WEEKLY_PLAN_ITEMS_GATEWAY_DROPPED',
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED',
  payload: Record<string, any>
): Promise<void> {
  try {
    const sanitizedPayload = { ...payload };
    let payloadJson = JSON.stringify(sanitizedPayload);
    let payloadBytes = getUtf8ByteLength(payloadJson);

    // Truncamiento defensivo progresivo basado en bytes UTF-8 (M3)
    if (payloadBytes > 60000 && Array.isArray(sanitizedPayload.activities_detail)) {
      const details = [...sanitizedPayload.activities_detail];
      while (details.length > 0 && payloadBytes > 60000) {
        // Reducción progresiva
        const newLength = Math.max(0, Math.floor(details.length * 0.75));
        details.splice(newLength);
        sanitizedPayload.activities_detail = details;
        sanitizedPayload.detail_truncated = true;
        payloadJson = JSON.stringify(sanitizedPayload);
        payloadBytes = getUtf8ByteLength(payloadJson);
      }
    }

    const { error } = await supabase.rpc('log_materialization_event_rpc', {
      p_board_id: boardId,
      p_group_id: groupId,
      p_week_start: weekStartStr,
      p_plan_id: planId,
      p_event_type: eventType,
      p_status: status,
      p_payload: sanitizedPayload,
    });

    if (error) {
      console.error('[P3-Telemetria-Error] Error invocando log_materialization_event_rpc:', error.message);
    }
  } catch (err: any) {
    console.error('[P3-Telemetria-Error] Excepción persistiendo evento de materialización:', err?.message || err);
  }
}
