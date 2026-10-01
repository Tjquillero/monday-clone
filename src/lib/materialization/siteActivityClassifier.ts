/**
 * Módulo Canónico de Clasificación, Validación y Telemetría de Materialización (FREQ-OP-01 / D19)
 * Especificación: docs/gates/FREQ-OP-01_SPEC.md + Decisiones D1-D19
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { RoutineBaseTemplate } from '../routineScheduler';

export type SiteActivityAction =
  | 'MATERIALIZED'
  | 'NOT_SCHEDULED_NO_PERIODIC_FREQ'
  | 'NOT_SCHEDULED_NO_RENDIMIENTO'
  | 'SKIPPED_ZERO_QTY'
  | 'EXCLUDED_MISSING_OPERATIONAL_FREQ'
  | 'EXCLUDED_MISSING_RENDIMIENTO'
  | 'EXCLUDED_MISSING_STANDARD'
  | 'EXCLUDED_INVALID_CONTRACT';

export interface ActivityProcessingDetail {
  activity_key: string;
  action: SiteActivityAction;
  reason?: string;
  frequency_source: 'CRONOGRAMA' | 'POA' | 'NONE';
  planned_qty?: number;
  planned_frecuencia?: number | null;
  planned_rendimiento?: number | null;
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
  excluded_missing_operational_freq_count: number;
  excluded_missing_rendimiento_count: number;
  excluded_missing_standard_count: number;
  excluded_invalid_contract_count: number;
  is_partial: boolean;
  partial_reasons: string[];
  activities_detail: ActivityProcessingDetail[];
  detail_truncated?: boolean;
  template_source?: string;
  error?: {
    stage: 'pre_validation' | 'header' | 'sync' | 'post_verify' | 'exception' | 'plan_state_read' | 'identity_precheck';
    code?: string;
    message: string;
    details?: unknown;
  };
}

export interface ActivityClassificationContext {
  poaActivitiesMap: Map<string, { id: string; frecuencia: number | null }>;
  poaZoneQtyMap: Map<string, number>;
  operationalFreqMap: Map<string, { visits_per_month: number; source: 'CRONOGRAMA' | 'POA' }>;
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
 * Clasifica determinísticamente cada actividad del universo contractual del sitio (D19)
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
    operationalFreqMap = new Map(),
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
  let excludedMissingOperationalFreqCount = 0;
  let excludedMissingRendimientoCount = 0;
  let excludedMissingStandardCount = 0;
  let excludedInvalidContractCount = 0;

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
      excluded_missing_operational_freq_count: 0,
      excluded_missing_rendimiento_count: 0,
      excluded_missing_standard_count: 0,
      excluded_invalid_contract_count: 0,
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

  // Universo del sitio: Exclusivamente las actividades con presencia en poa_activity_zones para este sitio
  for (const [activityKey, rawZoneQty] of poaZoneQtyMap.entries()) {
    const matchedStd = standardsByKey.get(activityKey);
    const cantidad = typeof rawZoneQty === 'number' ? Math.max(0, rawZoneQty) : 0;
    const opFreq = operationalFreqMap.get(activityKey);
    const poaAct = poaActivitiesMap.get(activityKey);

    // 1. Cantidad 0 en la zona -> SKIPPED_ZERO_QTY
    if (cantidad <= 0) {
      skippedZeroQtyCount++;
      activitiesDetail.push({
        activity_key: activityKey,
        action: 'SKIPPED_ZERO_QTY',
        reason: 'Cantidad contratada es 0 en esta zona',
        frequency_source: opFreq ? opFreq.source : 'NONE',
        planned_qty: 0,
        planned_frecuencia: opFreq ? opFreq.visits_per_month : null,
      });
      continue;
    }

    // 2. Frecuencia NULL en POA y sin frecuencia operativa -> NOT_SCHEDULED_NO_PERIODIC_FREQ (Informativa, NO parcial)
    if (poaAct && (poaAct.frecuencia === null || poaAct.frecuencia === undefined) && !opFreq) {
      notScheduledNoFreqCount++;
      activitiesDetail.push({
        activity_key: activityKey,
        action: 'NOT_SCHEDULED_NO_PERIODIC_FREQ',
        reason: 'Actividad sin frecuencia periódica en POA ni frecuencia operativa configurada',
        frequency_source: 'NONE',
        planned_qty: cantidad,
        planned_frecuencia: null,
      });
      continue;
    }

    // 3. Frecuencia inválida (<= 0 o no numérica finita) en el POA -> EXCLUDED_INVALID_CONTRACT (PARCIAL)
    if (poaAct && poaAct.frecuencia !== null && poaAct.frecuencia !== undefined && (typeof poaAct.frecuencia !== 'number' || !Number.isFinite(poaAct.frecuencia) || poaAct.frecuencia <= 0)) {
      excludedInvalidContractCount++;
      const reason = `Frecuencia inválida en POA (${poaAct.frecuencia})`;
      partialReasons.push(`${activityKey}: ${reason}`);
      activitiesDetail.push({
        activity_key: activityKey,
        action: 'EXCLUDED_INVALID_CONTRACT',
        reason,
        frequency_source: 'POA',
        planned_qty: cantidad,
        planned_frecuencia: poaAct.frecuencia,
      });
      continue;
    }

    // 4. Estándar técnico faltante -> EXCLUDED_MISSING_STANDARD (PARCIAL)
    if (!matchedStd) {
      excludedMissingStandardCount++;
      const reason = 'No existe estándar en board_activity_standards';
      partialReasons.push(`${activityKey}: ${reason}`);
      activitiesDetail.push({
        activity_key: activityKey,
        action: 'EXCLUDED_MISSING_STANDARD',
        reason,
        frequency_source: opFreq ? opFreq.source : 'NONE',
        planned_qty: cantidad,
        planned_frecuencia: opFreq ? opFreq.visits_per_month : null,
      });
      continue;
    }

    // 5. Evaluación de frecuencia operativa (D19 / D20)
    const hasOpFreq = Boolean(opFreq && typeof opFreq.visits_per_month === 'number' && opFreq.visits_per_month > 0);

    if (!hasOpFreq) {
      if (matchedStd.requiere_rendimiento === false) {
        // requiere_rendimiento = false Y sin frecuencia operativa -> NOT_SCHEDULED_NO_RENDIMIENTO (Informativa, NO parcial)
        notScheduledNoRendimientoCount++;
        activitiesDetail.push({
          activity_key: activityKey,
          action: 'NOT_SCHEDULED_NO_RENDIMIENTO',
          reason: 'Estándar técnico marcado con requiere_rendimiento = false sin frecuencia operativa',
          frequency_source: 'NONE',
          planned_qty: cantidad,
          planned_frecuencia: null,
          planned_rendimiento: null,
        });
        continue;
      } else {
        // requiere_rendimiento != false Y sin frecuencia operativa -> EXCLUDED_MISSING_OPERATIONAL_FREQ (PARCIAL)
        excludedMissingOperationalFreqCount++;
        const reason = `Actividad ${activityKey} tiene cantidad y rendimiento pero no tiene frecuencia operativa configurada`;
        partialReasons.push(`${activityKey}: ${reason}`);
        activitiesDetail.push({
          activity_key: activityKey,
          action: 'EXCLUDED_MISSING_OPERATIONAL_FREQ',
          reason,
          frequency_source: 'NONE',
          planned_qty: cantidad,
          planned_frecuencia: null,
        });
        continue;
      }
    }

    // 6. Con frecuencia operativa: si requiere_rendimiento = false -> MATERIALIZED sin jornales (D20)
    if (matchedStd.requiere_rendimiento === false) {
      materializedCount++;
      templates.push({
        id: matchedStd.id,
        activity_key: matchedStd.activity_key,
        name: matchedStd.name,
        zone: matchedStd.category || 'Zona Verde',
        unit: matchedStd.unit,
        rendimiento: null as any,
        frecuencia: opFreq.visits_per_month,
        cantidad,
        priority: matchedStd.priority || 'must_execute',
      });

      activitiesDetail.push({
        activity_key: activityKey,
        action: 'MATERIALIZED',
        frequency_source: opFreq.source,
        planned_qty: cantidad,
        planned_frecuencia: opFreq.visits_per_month,
        planned_rendimiento: null,
      });
      continue;
    }

    // 7. requiere_rendimiento = true: validar rendimiento > 0
    const rend = Number(matchedStd.rendimiento);
    if (!Number.isFinite(rend) || rend <= 0) {
      excludedMissingRendimientoCount++;
      const reason = `Actividad sin rendimiento válido (> 0) en catálogo técnico: ${matchedStd.rendimiento}`;
      partialReasons.push(`${activityKey}: ${reason}`);
      activitiesDetail.push({
        activity_key: activityKey,
        action: 'EXCLUDED_MISSING_RENDIMIENTO',
        reason,
        frequency_source: opFreq.source,
        planned_qty: cantidad,
        planned_frecuencia: opFreq.visits_per_month,
        planned_rendimiento: rend,
      });
      continue;
    }

    // 8. Todo válido con rendimiento > 0 -> MATERIALIZED con jornales
    materializedCount++;
    templates.push({
      id: matchedStd.id,
      activity_key: matchedStd.activity_key,
      name: matchedStd.name,
      zone: matchedStd.category || 'Zona Verde',
      unit: matchedStd.unit,
      rendimiento: rend,
      frecuencia: opFreq.visits_per_month,
      cantidad,
      priority: matchedStd.priority || 'must_execute',
    });

    activitiesDetail.push({
      activity_key: activityKey,
      action: 'MATERIALIZED',
      frequency_source: opFreq.source,
      planned_qty: cantidad,
      planned_frecuencia: opFreq.visits_per_month,
      planned_rendimiento: rend,
    });
  }

  const isPartial =
    excludedMissingOperationalFreqCount > 0 ||
    excludedMissingRendimientoCount > 0 ||
    excludedMissingStandardCount > 0 ||
    excludedInvalidContractCount > 0;

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
    excluded_missing_operational_freq_count: excludedMissingOperationalFreqCount,
    excluded_missing_rendimiento_count: excludedMissingRendimientoCount,
    excluded_missing_standard_count: excludedMissingStandardCount,
    excluded_invalid_contract_count: excludedInvalidContractCount,
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
 * Persiste eventos en materialization_events vía log_materialization_event_rpc.
 * Aplica truncamiento defensivo en bytes si el payload supera 60.000 bytes.
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

    // Truncamiento defensivo progresivo basado en bytes UTF-8
    if (payloadBytes > 60000 && Array.isArray(sanitizedPayload.activities_detail)) {
      const details = [...sanitizedPayload.activities_detail];
      while (details.length > 0 && payloadBytes > 60000) {
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
