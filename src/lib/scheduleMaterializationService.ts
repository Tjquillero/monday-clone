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

function compareStringsCode(a: string = '', b: string = ''): number {
  return a < b ? -1 : a > b ? 1 : 0;
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

  // c) Consulta `poa_activities` con poa_version_id = esa versión ordenado determinísticamente por activity_key
  const { data: poaActs } = await supabase
    .from('poa_activities')
    .select('id, activity_key, frecuencia')
    .eq('poa_version_id', activeVersionId)
    .order('activity_key');

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
  const poaZoneInfoMap = new Map<string, { id: string; cantidad: number }>();
  const poaZoneQtyMap = new Map<string, number>();
  let hasZoneScopeData = false;

  const poaActIds = Array.from(poaActivitiesMap.values()).map((a) => a.id).filter(Boolean);
  if (poaActIds.length > 0) {
    const { data: zoneRows, error: zoneReadErr } = await supabase
      .from('poa_activity_zones')
      .select('id, poa_activity_id, zone_id, cantidad_contratada')
      .eq('zone_id', gId)
      .in('poa_activity_id', poaActIds)
      .order('poa_activity_id');

    if (zoneReadErr) {
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
            code: 'ZONE_READ_FAILED',
            message: zoneReadErr.message || 'Error al consultar poa_activity_zones para el sitio',
          },
        }
      );
      throw new Error(`ZONE_READ_FAILED: ${zoneReadErr.message || 'Error al consultar poa_activity_zones'}`);
    }

    if (Array.isArray(zoneRows) && zoneRows.length > 0) {
      hasZoneScopeData = true;
      const seenZoneKeys = new Set<string>();
      const duplicateZoneKeys: string[] = [];

      for (const z of zoneRows) {
        const actKey = poaActivityKeyById.get(z.poa_activity_id);
        if (actKey) {
          if (seenZoneKeys.has(actKey)) {
            if (!duplicateZoneKeys.includes(actKey)) {
              duplicateZoneKeys.push(actKey);
            }
          } else {
            seenZoneKeys.add(actKey);
          }
        }
      }

      if (duplicateZoneKeys.length > 0) {
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
              code: 'DUPLICATE_ZONE_LINK',
              message: `Múltiples filas en poa_activity_zones para el mismo sitio y clave de actividad: ${duplicateZoneKeys.join(', ')}`,
              details: duplicateZoneKeys,
            },
          }
        );
        throw new Error(`DUPLICATE_ZONE_LINK: Múltiples filas en poa_activity_zones para el mismo sitio y clave de actividad: ${duplicateZoneKeys.join(', ')}`);
      }

      for (const z of zoneRows) {
        const actKey = poaActivityKeyById.get(z.poa_activity_id);
        if (actKey) {
          poaZoneInfoMap.set(actKey, {
            id: z.id,
            cantidad: Number(z.cantidad_contratada),
          });
          poaZoneQtyMap.set(actKey, Number(z.cantidad_contratada));
        }
      }
    }
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

  const templates: RoutineBaseTemplate[] = [...classification.templates].sort((a, b) =>
    compareStringsCode(a.activity_key, b.activity_key)
  );

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

  // Ordenar assignments por (dateStr, activity_key) de forma determinista y estable ANTES de asignar planned_sequence
  const sortedAssignments = [...projection.assignments]
    .filter((assign) => isValidISODateString(assign.dateStr))
    .sort((a, b) => {
      const dateCmp = compareStringsCode(a.dateStr, b.dateStr);
      if (dateCmp !== 0) return dateCmp;
      return compareStringsCode(a.activity_key, b.activity_key);
    });

  // 6. Validar y Construir DTO Items completos antes de decidir escrituras
  const dtoItems: any[] = [];
  for (let idx = 0; idx < sortedAssignments.length; idx++) {
    const assign = sortedAssignments[idx];
    const matchedStd = allBoardStandards.find((s) => s.activity_key === assign.activity_key);
    if (!matchedStd) {
      throw new Error(`ESTÁNDAR_FALTANTE: No existe estándar técnico para la actividad ${assign.activity_key}`);
    }

    const zoneInfo = poaZoneInfoMap.get(assign.activity_key);
    if (!zoneInfo || !zoneInfo.id) {
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
            code: 'MISSING_ZONE_LINK',
            message: `La actividad ${assign.activity_key} no cuenta con enlace obligatorio a poa_activity_zones para el sitio ${gId}`,
          },
        }
      );
      throw new Error(`MISSING_ZONE_LINK: La actividad ${assign.activity_key} no cuenta con enlace obligatorio a poa_activity_zones`);
    }

    dtoItems.push({
      planned_sequence: idx + 1,
      activity_key: assign.activity_key,
      poa_activity_zone_id: zoneInfo.id,
      activity_standard_id: matchedStd.id,
      planned_rendimiento: matchedStd.rendimiento,
      planned_frecuencia: assign.frequency_interval,
      priority: matchedStd.priority || 'must_execute',
      planned_qty: assign.cantidad,
      unit: assign.unit,
      planned_jr: assign.theoretical_jr,
      planned_date: assign.dateStr,
    });
  }

  // 7. SOLO LECTURAS ANTES DE DECIDIR (Paso b y c)
  // b) LEER si existe el plan del (board_id, group_id, week_start)
  const { data: existingPlan, error: planReadErr } = await supabase
    .from('weekly_plans')
    .select('id, status')
    .eq('board_id', boardId)
    .eq('group_id', gId)
    .eq('week_start', weekStartStr)
    .maybeSingle();

  if (planReadErr) {
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
          stage: 'plan_state_read',
          code: 'PLAN_STATE_READ_FAILED',
          message: planReadErr.message || 'Error al consultar el estado del plan existente',
        },
      }
    );
    throw new Error(`PLAN_STATE_READ_FAILED: ${planReadErr.message}`);
  }

  // c) Si existe el plan, LEER todos sus weekly_plan_items
  let existingItems: any[] = [];
  if (existingPlan?.id) {
    const { data: itemsData, error: itemsReadErr } = await supabase
      .from('weekly_plan_items')
      .select('planned_sequence, activity_key, planned_date')
      .eq('plan_id', existingPlan.id);

    if (itemsReadErr) {
      await persistMaterializationEvent(
        supabase,
        boardId,
        gId,
        weekStartStr,
        existingPlan.id,
        'SITE_MATERIALIZATION_SUMMARY',
        'FAILED',
        {
          ...classification.summary,
          poa_id: activePoaId,
          poa_version_id: activeVersionId,
          plan_id: existingPlan.id,
          status: 'FAILED',
          error: {
            stage: 'plan_state_read',
            code: 'PLAN_STATE_READ_FAILED',
            message: itemsReadErr.message || 'Error al consultar los ítems del plan existente',
          },
        }
      );
      throw new Error(`PLAN_STATE_READ_FAILED: ${itemsReadErr.message}`);
    }
    existingItems = itemsData || [];
  }

  // 8. D14 — DEFINICIÓN Y EVALUACIÓN DE CONFLICTOS
  if (existingPlan?.id && existingItems.length > 0) {
    const existingSeqMap = new Map<number, { activity_key: string; planned_date: string }>();
    for (const it of existingItems) {
      existingSeqMap.set(it.planned_sequence, {
        activity_key: it.activity_key,
        planned_date: it.planned_date,
      });
    }

    const sentSeqMap = new Map<number, { activity_key: string; planned_date: string }>();
    for (const it of dtoItems) {
      sentSeqMap.set(it.planned_sequence, {
        activity_key: it.activity_key,
        planned_date: it.planned_date,
      });
    }

    let keyOrDateMismatchCount = 0;
    let missingInPlanCount = 0;
    let extraInPlanCount = 0;
    const conflictsList: Array<{ type: string; sequence: number; sent?: any; existing?: any }> = [];

    // Comprobar lo enviado contra lo existente
    for (const item of dtoItems) {
      const existing = existingSeqMap.get(item.planned_sequence);
      if (!existing) {
        missingInPlanCount++;
        conflictsList.push({
          type: 'MISSING_IN_PLAN',
          sequence: item.planned_sequence,
          sent: { activity_key: item.activity_key, planned_date: item.planned_date },
        });
      } else if (existing.activity_key !== item.activity_key || existing.planned_date !== item.planned_date) {
        keyOrDateMismatchCount++;
        conflictsList.push({
          type: 'KEY_OR_DATE_MISMATCH',
          sequence: item.planned_sequence,
          sent: { activity_key: item.activity_key, planned_date: item.planned_date },
          existing: { activity_key: existing.activity_key, planned_date: existing.planned_date },
        });
      }
    }

    // Comprobar lo existente que no está en lo enviado
    for (const [seq, ex] of existingSeqMap.entries()) {
      if (!sentSeqMap.has(seq)) {
        extraInPlanCount++;
        conflictsList.push({
          type: 'EXTRA_IN_PLAN',
          sequence: seq,
          existing: { activity_key: ex.activity_key, planned_date: ex.planned_date },
        });
      }
    }

    const totalConflicts = keyOrDateMismatchCount + missingInPlanCount + extraInPlanCount;

    if (totalConflicts > 0) {
      // D14: Bloqueo total ante conflicto. Cero llamadas a header, cero a sync. Exactamente UN evento.
      await persistMaterializationEvent(
        supabase,
        boardId,
        gId,
        weekStartStr,
        existingPlan.id,
        'SITE_MATERIALIZATION_SUMMARY',
        'FAILED',
        {
          ...classification.summary,
          poa_id: activePoaId,
          poa_version_id: activeVersionId,
          plan_id: existingPlan.id,
          error: {
            stage: 'identity_precheck',
            code: 'SEQUENCE_IDENTITY_CONFLICT',
            counts: {
              key_or_date_mismatch: keyOrDateMismatchCount,
              missing_in_plan: missingInPlanCount,
              extra_in_plan: extraInPlanCount,
            },
            sample: conflictsList.slice(0, 50),
            truncated: conflictsList.length > 50,
          },
          status: 'FAILED',
        }
      );
      throw new Error(
        `SEQUENCE_IDENTITY_CONFLICT: Conflicto de identidad detectado en plan existente (${totalConflicts} discrepancias: ${keyOrDateMismatchCount} mismatches, ${missingInPlanCount} faltantes en plan, ${extraInPlanCount} extras en plan)`
      );
    }

    // Plan existente con ítems IDÉNTICOS -> CERO escrituras y retornar el estado existente
    return {
      weeklyPlan: {
        id: existingPlan.id,
        board_id: boardId,
        group_id: gId,
        week_start_date: weekStartStr,
        week_end_date: weekStartStr,
        status: existingPlan.status || 'published',
      },
      insertedCount: 0,
      updatedCount: 0,
      cancelledCount: 0,
      protectedCount: existingItems.length,
      totalItems: existingItems.length,
    };
  }

  // 9. Gateway de Cabecera (ensure_weekly_plan_header) — solo si el plan no existía o tenía 0 ítems
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

  // 10. Gateway de Sincronización de Ítems (sync_weekly_plan_items_rpc)
  let syncedRows: any[] | null = null;
  let syncFailedLogged = false;
  try {
    const { data: rows, error: syncErr } = await supabase.rpc('sync_weekly_plan_items_rpc', {
      p_plan_id: headerPlanId,
      p_items: dtoItems,
    });

    if (syncErr) {
      syncFailedLogged = true;
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
    if (!syncFailedLogged) {
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
            stage: 'exception',
            message: errSync?.message || String(errSync),
          },
        }
      );
    }
    // D4: SIN fallback a syncWeeklyPlanForBoard
    throw errSync;
  }

  // 11. Detección Post-RPC de Descartes en Gateway (Sección 7.B)
  const existingSeqSet = new Set(existingItems.map((r) => r.planned_sequence));
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

  // Regla M2: Si hubo GATEWAY_DROPPED, el resumen pasa a PARTIAL
  const finalSummary = {
    ...classification.summary,
    plan_id: headerPlanId,
    poa_id: activePoaId,
    poa_version_id: activeVersionId,
  };
  let finalStatus = classification.status;

  if (missingSequences.length > 0) {
    finalStatus = 'PARTIAL';
    finalSummary.is_partial = true;
    finalSummary.partial_reasons.push(`WEEKLY_PLAN_ITEMS_GATEWAY_DROPPED: Gateway descartó ${missingSequences.length} secuencias esperadas`);
  }

  finalSummary.status = finalStatus;

  // 12. Persistir Evento Resumen del Sitio P3
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
    protectedCount: existingItems.length,
    totalItems: (syncedRows?.length ?? 0) + existingItems.length,
  };
}
