/**
 * Service: Materialización y Persistencia de Ocurrencias del Cronograma (`weekly_plan_items`)
 * Baseline: 2386465 + ADR-0007..ADR-0012 + Módulo 2 & 3 (CLOSED & CERTIFIED)
 * Gobernanza R1-b0 + R1-c: docs/gates/R1-b0_R1-c_SPEC.md v4.2 + Decisiones D1-D11
 *
 * Conecta la superficie de UI (/my-work) con los motores F3.1 y la RPC Gateway de Seguridad en PostgreSQL.
 * Es un gatillo determinístico, idóneo e idempotente que materializa y persiste filas reales en PostgreSQL.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  generateRoutineScheduleForWeek,
  RoutineBaseTemplate,
} from './routineScheduler';
import { SyncWeeklyPlanResult } from './weeklyPlanService';
import { calculateContractWeek } from './weeklyPlanner';
import {
  classifySiteActivities,
  isValidISODateString,
  persistMaterializationEvent,
} from './materialization/siteActivityClassifier';

export interface MaterializeWeeklyPlanOptions {
  customNonWorkingDays?: string[];
  forceUpdate?: boolean;
}

function toISOStringDate(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getMondayDate(d: Date | string): Date {
  const dt = typeof d === 'string' ? new Date(d) : new Date(d);
  const day = dt.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate() + diff));
}

/**
 * Garantiza que las ocurrencias reales del cronograma para una semana y sitio específicos
 * estén materializadas y persistidas en PostgreSQL (`weekly_plans` y `weekly_plan_items`).
 */
export async function ensureWeeklyPlanMaterialized(
  supabase: SupabaseClient,
  boardId: string,
  groupId: string | null | undefined,
  weekInput: Date | string,
  options: MaterializeWeeklyPlanOptions = {}
): Promise<SyncWeeklyPlanResult> {
  const mondayDate = getMondayDate(weekInput);
  const weekStartStr = toISOStringDate(mondayDate);
  const periodNumber = calculateContractWeek(mondayDate);

  // Decisión D10: Sin gId -> FALLAR CERRADO (MISSING_GROUP_ID)
  if (!groupId) {
    await persistMaterializationEvent(
      supabase,
      boardId,
      null,
      weekStartStr,
      null,
      'SITE_MATERIALIZATION_SUMMARY',
      'FAILED',
      {
        board_id: boardId,
        group_id: null,
        week_start: weekStartStr,
        status: 'FAILED',
        error: {
          stage: 'pre_validation',
          code: 'MISSING_GROUP_ID',
          message: 'Missing group_id: cannot materialize weekly plan without site context',
        },
      }
    );
    throw new Error('MISSING_GROUP_ID: Cannot materialize weekly plan without group_id');
  }

  const gId = groupId;

  // 1. Obtener contrato del tablero (D13: tablero -> poa -> poa_versions -> poa_activities)
  // a) Consulta la tabla `poa` filtrando por board_id
  const { data: poaRows, error: poaErr } = await supabase
    .from('poa')
    .select('id')
    .eq('board_id', boardId);

  const poaIds = (poaRows || []).map((p: any) => p.id).filter(Boolean);
  if (poaErr || poaIds.length === 0) {
    await persistMaterializationEvent(
      supabase,
      boardId,
      gId,
      weekStartStr,
      null,
      'SITE_MATERIALIZATION_SUMMARY',
      'FAILED',
      {
        board_id: boardId,
        group_id: gId,
        week_start: weekStartStr,
        status: 'FAILED',
        error: {
          stage: 'pre_validation',
          code: 'NO_ACTIVE_POA',
          message: 'El tablero no cuenta con registro de POA',
        },
      }
    );
    throw new Error('NO_ACTIVE_POA: El tablero no cuenta con versión de POA activa');
  }

  // b) Consulta `poa_versions` con poa_id en esos ids y status = 'active'
  const { data: versionRows, error: versionErr } = await supabase
    .from('poa_versions')
    .select('id, poa_id')
    .in('poa_id', poaIds)
    .eq('status', 'active');

  const activeVersions = versionRows || [];
  if (versionErr || activeVersions.length === 0) {
    await persistMaterializationEvent(
      supabase,
      boardId,
      gId,
      weekStartStr,
      null,
      'SITE_MATERIALIZATION_SUMMARY',
      'FAILED',
      {
        board_id: boardId,
        group_id: gId,
        week_start: weekStartStr,
        status: 'FAILED',
        error: {
          stage: 'pre_validation',
          code: 'NO_ACTIVE_POA',
          message: 'El tablero no cuenta con versión de POA activa',
        },
      }
    );
    throw new Error('NO_ACTIVE_POA: El tablero no cuenta con versión de POA activa');
  }

  if (activeVersions.length > 1) {
    await persistMaterializationEvent(
      supabase,
      boardId,
      gId,
      weekStartStr,
      null,
      'SITE_MATERIALIZATION_SUMMARY',
      'FAILED',
      {
        board_id: boardId,
        group_id: gId,
        week_start: weekStartStr,
        status: 'FAILED',
        error: {
          stage: 'pre_validation',
          code: 'MULTIPLE_ACTIVE_POA_VERSIONS',
          message: `El tablero cuenta con múltiples versiones activas (${activeVersions.length})`,
          details: activeVersions.map((v: any) => v.id),
        },
      }
    );
    throw new Error(`MULTIPLE_ACTIVE_POA_VERSIONS: El tablero cuenta con múltiples versiones activas (${activeVersions.length})`);
  }

  const activeVersion = activeVersions[0];
  const activeVersionId = activeVersion.id;
  const activePoaId = activeVersion.poa_id;

  // c) Consulta `poa_activities` con poa_version_id = esa versión
  const { data: poaActs } = await supabase
    .from('poa_activities')
    .select('id, activity_key, frecuencia')
    .eq('poa_version_id', activeVersionId);

  // d) Si dentro de esa versión hay activity_key duplicadas -> FAILED con code DUPLICATE_ACTIVITY_KEY y la lista de claves. Prohibido "gana la última".
  const poaActivitiesMap = new Map<string, { id: string; frecuencia: number | null }>();
  const poaActivityKeyById = new Map<string, string>();
  const seenKeys = new Set<string>();
  const duplicateKeys: string[] = [];

  for (const pa of poaActs || []) {
    if (seenKeys.has(pa.activity_key)) {
      if (!duplicateKeys.includes(pa.activity_key)) {
        duplicateKeys.push(pa.activity_key);
      }
    } else {
      seenKeys.add(pa.activity_key);
    }
  }

  if (duplicateKeys.length > 0) {
    await persistMaterializationEvent(
      supabase,
      boardId,
      gId,
      weekStartStr,
      null,
      'SITE_MATERIALIZATION_SUMMARY',
      'FAILED',
      {
        board_id: boardId,
        group_id: gId,
        week_start: weekStartStr,
        poa_id: activePoaId,
        poa_version_id: activeVersionId,
        status: 'FAILED',
        error: {
          stage: 'pre_validation',
          code: 'DUPLICATE_ACTIVITY_KEY',
          message: `Claves de actividad duplicadas en la versión activa: ${duplicateKeys.join(', ')}`,
          details: duplicateKeys,
        },
      }
    );
    throw new Error(`DUPLICATE_ACTIVITY_KEY: Claves de actividad duplicadas en la versión activa: ${duplicateKeys.join(', ')}`);
  }

  for (const pa of poaActs || []) {
    poaActivitiesMap.set(pa.activity_key, {
      id: pa.id,
      frecuencia: pa.frecuencia !== null && pa.frecuencia !== undefined ? Number(pa.frecuencia) : null,
    });
    poaActivityKeyById.set(pa.id, pa.activity_key);
  }

  // D11: Tablero sin actividades en POA -> NO_ACTIVE_POA
  const hasPoa = poaActivitiesMap.size > 0;
  if (!hasPoa) {
    await persistMaterializationEvent(
      supabase,
      boardId,
      gId,
      weekStartStr,
      null,
      'SITE_MATERIALIZATION_SUMMARY',
      'FAILED',
      {
        board_id: boardId,
        group_id: gId,
        week_start: weekStartStr,
        poa_id: activePoaId,
        poa_version_id: activeVersionId,
        status: 'FAILED',
        error: {
          stage: 'pre_validation',
          code: 'NO_ACTIVE_POA',
          message: 'La versión activa de POA no cuenta con actividades',
        },
      }
    );
    throw new Error('NO_ACTIVE_POA: El tablero no cuenta con versión de POA activa');
  }

  // 2. Obtener Alcance Físico Contractual desde poa_activity_zones (B1: ÚNICA autoridad)
  const poaZoneQtyMap = new Map<string, number>();
  let hasZoneScopeData = false;

  try {
    const poaActIds = Array.from(poaActivitiesMap.values()).map((a) => a.id).filter(Boolean);
    if (poaActIds.length > 0) {
      const { data: zoneRows } = await supabase
        .from('poa_activity_zones')
        .select('poa_activity_id, zone_id, cantidad_contratada')
        .eq('zone_id', gId)
        .in('poa_activity_id', poaActIds);

      if (Array.isArray(zoneRows) && zoneRows.length > 0) {
        hasZoneScopeData = true;
        for (const z of zoneRows) {
          const actKey = poaActivityKeyById.get(z.poa_activity_id);
          if (actKey) {
            poaZoneQtyMap.set(actKey, Number(z.cantidad_contratada));
          }
        }
      }
    }
  } catch (_errZone) {
    // Manejo seguro
  }

  // 3. Obtener Catálogo Técnico para el board SIN el filtro requiere_rendimiento=true
  const { data: standardsData } = await supabase
    .from('board_activity_standards')
    .select('*')
    .eq('board_id', boardId);

  const allBoardStandards = (standardsData || []).map((s: any) => ({
    id: s.id,
    activity_key: s.activity_key,
    name: s.name,
    category: s.category,
    unit: s.unit,
    rendimiento: Number(s.rendimiento),
    requiere_rendimiento: s.requiere_rendimiento !== false,
    priority: s.priority || 'must_execute',
  }));

  // 4. Clasificar actividades del universo contractual del sitio (B1, B2)
  const classification = classifySiteActivities(boardId, gId, weekStartStr, {
    poaActivitiesMap,
    poaZoneQtyMap,
    hasZoneScopeData,
    allBoardStandards,
  });

  const templates: RoutineBaseTemplate[] = classification.templates;

  // D5: Validación previa de plantillas. Cero plantillas -> FAILED con NO_TEMPLATES sin invocar header
  if (templates.length === 0) {
    await persistMaterializationEvent(
      supabase,
      boardId,
      gId,
      weekStartStr,
      null,
      'SITE_MATERIALIZATION_SUMMARY',
      'FAILED',
      {
        ...classification.summary,
        poa_id: activePoaId,
        poa_version_id: activeVersionId,
        status: 'FAILED',
        error: {
          stage: 'pre_validation',
          code: 'NO_TEMPLATES',
          message: 'Cero plantillas operacionales viables generadas para el sitio con POA activo',
        },
      }
    );
    throw new Error('NO_TEMPLATES: Cero plantillas operacionales viables generadas para el sitio con POA activo');
  }

  // 5. Generar Ocurrencias Diarias con Calendario Laboral Colombiano (F3.1)
  const projection = generateRoutineScheduleForWeek(
    templates,
    mondayDate,
    [],
    { customNonWorkingDays: options.customNonWorkingDays }
  );

  // 6. D5: Validar y Construir DTO Items antes del Gateway (B3: Sin defaults prohibidos)
  const dtoItems = projection.assignments
    .filter((assign) => isValidISODateString(assign.dateStr))
    .map((assign, idx) => {
      const matchedStd = allBoardStandards.find((s) => s.activity_key === assign.activity_key);
      if (!matchedStd) {
        throw new Error(`ESTÁNDAR_FALTANTE: No existe estándar técnico para la actividad ${assign.activity_key}`);
      }
      return {
        planned_sequence: idx + 1,
        activity_key: assign.activity_key,
        activity_standard_id: matchedStd.id,
        planned_rendimiento: matchedStd.rendimiento,
        planned_frecuencia: assign.frequency_interval,
        priority: matchedStd.priority || 'must_execute',
        planned_qty: assign.cantidad,
        unit: assign.unit,
        planned_jr: assign.theoretical_jr,
        planned_date: assign.dateStr,
      };
    });

  // 7. Gateway de Cabecera (ensure_weekly_plan_header)
  let headerPlanId: string | null = null;
  let headerFailedLogged = false;

  try {
    const { data: hId, error: headerErr } = await supabase.rpc('ensure_weekly_plan_header', {
      p_board_id: boardId,
      p_group_id: gId,
      p_week_start: weekStartStr,
      p_period_number: periodNumber,
    });

    if (headerErr || !hId) {
      headerFailedLogged = true;
      await persistMaterializationEvent(
        supabase,
        boardId,
        gId,
        weekStartStr,
        null,
        'SITE_MATERIALIZATION_SUMMARY',
        'FAILED',
        {
          ...classification.summary,
          poa_id: activePoaId,
          poa_version_id: activeVersionId,
          status: 'FAILED',
          error: {
            stage: 'header',
            code: headerErr?.code || 'HEADER_RPC_FAILED',
            message: headerErr?.message || 'ensure_weekly_plan_header did not return plan ID',
            details: headerErr?.details,
          },
        }
      );
      // D4: SIN fallback a syncWeeklyPlanForBoard
      throw new Error(`ensure_weekly_plan_header failed: ${headerErr?.message || 'No plan ID returned'}`);
    }

    headerPlanId = hId;
  } catch (errHeader: any) {
    if (!headerPlanId && !headerFailedLogged) {
      await persistMaterializationEvent(
        supabase,
        boardId,
        gId,
        weekStartStr,
        null,
        'SITE_MATERIALIZATION_SUMMARY',
        'FAILED',
        {
          ...classification.summary,
          poa_id: activePoaId,
          poa_version_id: activeVersionId,
          status: 'FAILED',
          error: {
            stage: 'exception',
            message: errHeader?.message || String(errHeader),
          },
        }
      );
    }
    // D4: SIN fallback a syncWeeklyPlanForBoard
    throw errHeader;
  }

  // 8. Verificación Previa de Identidad de Secuencias (Sección 7.B)
  const existingRowsMap = new Map<number, { activity_key: string; planned_date: string }>();
  let hasSequenceConflict = false;

  try {
    const { data: existingRows } = await supabase
      .from('weekly_plan_items')
      .select('planned_sequence, activity_key, planned_date')
      .eq('plan_id', headerPlanId);

    for (const r of existingRows || []) {
      existingRowsMap.set(r.planned_sequence, {
        activity_key: r.activity_key,
        planned_date: r.planned_date,
      });
    }

    for (const item of dtoItems) {
      const existing = existingRowsMap.get(item.planned_sequence);
      if (existing && existing.activity_key !== item.activity_key) {
        hasSequenceConflict = true;
        await persistMaterializationEvent(
          supabase,
          boardId,
          gId,
          weekStartStr,
          headerPlanId,
          'SEQUENCE_IDENTITY_CONFLICT',
          'PARTIAL',
          {
            planned_sequence: item.planned_sequence,
            sent_key: item.activity_key,
            existing_key: existing.activity_key,
            plan_id: headerPlanId,
          }
        );
      }
    }
  } catch (_errSeq) {
    // Continuar con la sincronización
  }

  // 9. Gateway de Sincronización de Ítems (sync_weekly_plan_items_rpc)
  let syncedRows: any[] | null = null;
  try {
    const { data: rows, error: syncErr } = await supabase.rpc('sync_weekly_plan_items_rpc', {
      p_plan_id: headerPlanId,
      p_items: dtoItems,
    });

    if (syncErr) {
      await persistMaterializationEvent(
        supabase,
        boardId,
        gId,
        weekStartStr,
        headerPlanId,
        'SITE_MATERIALIZATION_SUMMARY',
        'FAILED',
        {
          ...classification.summary,
          poa_id: activePoaId,
          poa_version_id: activeVersionId,
          status: 'FAILED',
          error: {
            stage: 'sync',
            code: syncErr.code || 'SYNC_RPC_FAILED',
            message: syncErr.message,
            details: syncErr.details,
          },
        }
      );
      // D4: SIN fallback a syncWeeklyPlanForBoard
      throw new Error(`sync_weekly_plan_items_rpc failed: ${syncErr.message}`);
    }

    syncedRows = rows;
  } catch (errSync: any) {
    // D4: SIN fallback a syncWeeklyPlanForBoard
    throw errSync;
  }

  // 10. Detección Post-RPC de Descartes en Gateway (Sección 7.B)
  const existingSeqSet = new Set(existingRowsMap.keys());
  const expectedSequences = new Set(
    dtoItems.map((i) => i.planned_sequence).filter((seq) => !existingSeqSet.has(seq))
  );
  const returnedSequences = new Set((syncedRows || []).map((r: any) => r.planned_sequence));
  const missingSequences = [...expectedSequences].filter((seq) => !returnedSequences.has(seq));

  if (missingSequences.length > 0) {
    await persistMaterializationEvent(
      supabase,
      boardId,
      gId,
      weekStartStr,
      headerPlanId,
      'WEEKLY_PLAN_ITEMS_GATEWAY_DROPPED',
      'PARTIAL',
      {
        missing_sequences: missingSequences,
        expected_count: expectedSequences.size,
        returned_count: returnedSequences.size,
        plan_id: headerPlanId,
      }
    );
  }

  // Regla M2: Si hubo SEQUENCE_IDENTITY_CONFLICT o GATEWAY_DROPPED, el resumen pasa a PARTIAL
  const finalSummary = {
    ...classification.summary,
    plan_id: headerPlanId,
    poa_id: activePoaId,
    poa_version_id: activeVersionId,
  };
  let finalStatus = classification.status;

  if (hasSequenceConflict) {
    finalStatus = 'PARTIAL';
    finalSummary.is_partial = true;
    finalSummary.partial_reasons.push('SEQUENCE_IDENTITY_CONFLICT: Conflicto de identidad en secuencia previa');
  }

  if (missingSequences.length > 0) {
    finalStatus = 'PARTIAL';
    finalSummary.is_partial = true;
    finalSummary.partial_reasons.push(`WEEKLY_PLAN_ITEMS_GATEWAY_DROPPED: Gateway descartó ${missingSequences.length} secuencias esperadas`);
  }

  finalSummary.status = finalStatus;

  // 11. Persistir Evento Resumen del Sitio P3
  await persistMaterializationEvent(
    supabase,
    boardId,
    gId,
    weekStartStr,
    headerPlanId,
    'SITE_MATERIALIZATION_SUMMARY',
    finalStatus,
    finalSummary
  );

  return {
    weeklyPlan: {
      id: headerPlanId as string,
      board_id: boardId,
      group_id: gId,
      week_start_date: weekStartStr,
      week_end_date: weekStartStr,
      status: 'published',
    },
    insertedCount: syncedRows?.length ?? 0,
    updatedCount: 0,
    cancelledCount: 0,
    protectedCount: existingRowsMap.size,
    totalItems: (syncedRows?.length ?? 0) + existingRowsMap.size,
  };
}
