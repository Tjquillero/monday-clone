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
  getMonthlyCandidateWeeks,
  computeTractorRouteForWeek,
  TractorUnit,
  TractorRouteResult,
  TRACTOR_PACKAGE_ACTIVITIES,
  MonthlyPlanInput,
  RoutineBaseTemplate,
  CarryoverItem,
  CarryoverNextMonthItem,
  RecurrentExceedsCapacityItem,
} from './routineScheduler';
import { SyncWeeklyPlanResult } from './weeklyPlanService';
import { calculateContractWeek } from './weeklyPlanner';
import {
  classifySiteActivities,
  isValidISODateString,
  persistMaterializationEvent,
} from './materialization/siteActivityClassifier';

export const CARRYOVER_START_MONTH = '2026-11';
export const TRACTOR_PAIR_TITLES = ['PLAYA DEL COUNTRY', 'PLAYA DE SABANILLA 2'] as const;

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

  // 3. Obtener Frecuencias Operativas para el sitio (D19 / FREQ-OP-01 / FREQ-OP-02 / FREQ-OP-03)
  const { data: opFreqData, error: opFreqErr } = await supabase
    .from('operational_frequencies')
    .select('activity_key, visits_per_month, source, qty_mode, rendimiento, counts_capacity')
    .eq('board_id', boardId)
    .eq('group_id', gId);

  if (opFreqErr) {
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
          code: 'OPERATIONAL_FREQ_READ_FAILED',
          message: opFreqErr.message || 'Error al consultar operational_frequencies para el sitio',
        },
      }
    );
    throw new Error(`OPERATIONAL_FREQ_READ_FAILED: ${opFreqErr.message || 'Error al consultar operational_frequencies'}`);
  }

  const operationalFreqMap = new Map<string, import('./materialization/siteActivityClassifier').SiteOperationalFrequencyConfig>();
  for (const row of opFreqData || []) {
    if (row.activity_key && row.visits_per_month !== null && row.visits_per_month !== undefined) {
      operationalFreqMap.set(row.activity_key, {
        visits_per_month: Number(row.visits_per_month),
        source: row.source || 'CRONOGRAMA',
        qty_mode: row.qty_mode || 'FULL',
        rendimiento: row.rendimiento !== null && row.rendimiento !== undefined ? Number(row.rendimiento) : null,
        counts_capacity: row.counts_capacity !== false,
      });
    }
  }

  // D25: Si el sitio no cuenta con filas en operational_frequencies -> fuera de operación.
  // Cero llamadas a header y sync, evento SUCCESS con error.code = 'SITE_NOT_OPERATIONAL'.
  if (operationalFreqMap.size === 0) {
    await persistMaterializationEvent(
      supabase,
      boardId,
      gId,
      weekStartStr,
      null,
      'SITE_MATERIALIZATION_SUMMARY',
      'SUCCESS',
      {
        board_id: boardId,
        group_id: gId,
        week_start: weekStartStr,
        poa_id: activePoaId,
        poa_version_id: activeVersionId,
        status: 'SUCCESS',
        error: {
          stage: 'pre_validation',
          code: 'SITE_NOT_OPERATIONAL',
          message: 'Sitio sin operación: no cuenta con parámetros en operational_frequencies',
        },
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
      }
    );

    return {
      weeklyPlan: {
        id: '',
        board_id: boardId,
        group_id: gId,
        week_start_date: weekStartStr,
        week_end_date: weekStartStr,
        week_start: weekStartStr,
        status: 'draft',
      } as any,
      insertedCount: 0,
      updatedCount: 0,
      cancelledCount: 0,
      protectedCount: 0,
      totalItems: 0,
      notOperational: true,
    };
  }

  // D31: Cálculo de Ruta Coordinada del Tractor si el sitio cuenta con actividad 1.15
  let tractorDaysForSite: string[] | undefined = undefined;
  let tractorRoute: Record<string, string[]> = {};
  let tractorDeficits: Array<{ unitKey: string; missingVisits: number }> = [];
  let tractorPairUnresolved = false;

  if (operationalFreqMap.has('1.15')) {
    const { data: tractorFreqRows, error: tractorFreqErr } = await supabase
      .from('operational_frequencies')
      .select('group_id, visits_per_month')
      .eq('board_id', boardId)
      .eq('activity_key', '1.15');

    if (tractorFreqErr) {
      await persistMaterializationEvent(
        supabase,
        boardId,
        gId,
        weekStartStr,
        null,
        'SITE_MATERIALIZATION_SUMMARY',
        'FAILED',
        {
          poa_id: activePoaId,
          poa_version_id: activeVersionId,
          status: 'FAILED',
          error: {
            stage: 'tractor_route_read',
            code: 'TRACTOR_ROUTE_READ_FAILED',
            message: tractorFreqErr.message || 'Error al consultar operational_frequencies para la ruta del tractor',
          },
        }
      );
      throw new Error(`TRACTOR_ROUTE_READ_FAILED: ${tractorFreqErr.message || 'Error al consultar operational_frequencies para la ruta del tractor'}`);
    }

    const { data: boardGroups, error: boardGroupsErr } = await supabase
      .from('groups')
      .select('id, title')
      .eq('board_id', boardId);

    if (boardGroupsErr) {
      await persistMaterializationEvent(
        supabase,
        boardId,
        gId,
        weekStartStr,
        null,
        'SITE_MATERIALIZATION_SUMMARY',
        'FAILED',
        {
          poa_id: activePoaId,
          poa_version_id: activeVersionId,
          status: 'FAILED',
          error: {
            stage: 'tractor_route_read',
            code: 'TRACTOR_ROUTE_READ_FAILED',
            message: boardGroupsErr.message || 'Error al consultar groups para la ruta del tractor',
          },
        }
      );
      throw new Error(`TRACTOR_ROUTE_READ_FAILED: ${boardGroupsErr.message || 'Error al consultar groups para la ruta del tractor'}`);
    }

    const groupTitleById = new Map<string, string>();
    for (const g of boardGroups || []) {
      groupTitleById.set(g.id, g.title);
    }

    const countryGroup = (boardGroups || []).find(
      (g: any) => g.title && g.title.trim().toUpperCase() === 'PLAYA DEL COUNTRY'
    );
    const sabanillaGroup = (boardGroups || []).find(
      (g: any) => g.title && g.title.trim().toUpperCase() === 'PLAYA DE SABANILLA 2'
    );

    const tractorRows = tractorFreqRows || [];
    const countryRow = countryGroup ? tractorRows.find((r: any) => r.group_id === countryGroup.id) : undefined;
    const sabanillaRow = sabanillaGroup ? tractorRows.find((r: any) => r.group_id === sabanillaGroup.id) : undefined;

    const tractorUnits: TractorUnit[] = [];
    const processedGroupIds = new Set<string>();

    if (countryRow && sabanillaRow && countryGroup && sabanillaGroup) {
      const pairIds = [countryGroup.id, sabanillaGroup.id].sort(compareStringsCode);
      const maxVisits = Math.max(Number(countryRow.visits_per_month), Number(sabanillaRow.visits_per_month));
      tractorUnits.push({
        unitKey: pairIds[0],
        groupIds: pairIds,
        visitsPerMonth: maxVisits,
        groupTitles: [countryGroup.title, sabanillaGroup.title],
        isPair: true,
      });
      processedGroupIds.add(countryGroup.id);
      processedGroupIds.add(sabanillaGroup.id);
    } else {
      tractorPairUnresolved = true;
    }

    for (const r of tractorRows) {
      if (processedGroupIds.has(r.group_id)) continue;
      const gTitle = groupTitleById.get(r.group_id) || r.group_id;
      tractorUnits.push({
        unitKey: r.group_id,
        groupIds: [r.group_id],
        visitsPerMonth: Number(r.visits_per_month),
        groupTitles: [gTitle],
        isPair: false,
      });
      processedGroupIds.add(r.group_id);
    }

    const tractorRouteResult = computeTractorRouteForWeek(
      tractorUnits,
      mondayDate,
      options.customNonWorkingDays
    );

    tractorDaysForSite = tractorRouteResult.daysByGroup.get(gId) ?? [];
    tractorRoute = tractorRouteResult.routeByDate || {};
    tractorDeficits = tractorRouteResult.deficits;
  }

  // 4. Leer Capacidad Diaria del Sitio (D24: no bloqueante)
  let siteDailyCapacity: number | null = null;
  let capacityReadError: string | null = null;
  try {
    const { data: capData, error: capErr } = await supabase
      .from('site_daily_capacity')
      .select('jornales_dia')
      .eq('board_id', boardId)
      .eq('group_id', gId)
      .maybeSingle();

    if (capErr) {
      capacityReadError = capErr.message;
    } else if (capData && capData.jornales_dia !== null && capData.jornales_dia !== undefined) {
      siteDailyCapacity = Number(capData.jornales_dia);
    }
  } catch (err) {
    capacityReadError = err instanceof Error ? err.message : String(err);
  }

  // 5. Obtener Catálogo Técnico para el board SIN el filtro requiere_rendimiento=true
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

  // 6. Clasificar actividades del universo contractual del sitio (D19, D20, D21, D23)
  const classification = classifySiteActivities(boardId, gId, weekStartStr, {
    poaActivitiesMap,
    poaZoneQtyMap,
    operationalFreqMap,
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

  // 6.b. Leer planes existentes del mes para proyección determinista de baja frecuencia (D29 / A6)
  const candidateWeeks = getMonthlyCandidateWeeks(mondayDate);
  const candidateMondays = candidateWeeks.map((w) => w.weekStartStr);
  const existingMonthPlans: MonthlyPlanInput[] = [];

  try {
    let monthPlansQuery: any = supabase
      .from('weekly_plans')
      .select('id, week_start, status')
      .eq('board_id', boardId)
      .eq('group_id', gId);

    if (typeof monthPlansQuery?.in === 'function') {
      monthPlansQuery = monthPlansQuery.in('week_start', candidateMondays);
    }

    const { data: monthPlans, error: monthPlansErr } = await monthPlansQuery;

    if (monthPlansErr) {
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
            stage: 'month_projection_read',
            code: 'MONTH_PROJECTION_READ_FAILED',
            message: monthPlansErr.message || 'Error al consultar planes del mes para proyección',
          },
        }
      );
      throw new Error(`MONTH_PROJECTION_READ_FAILED: ${monthPlansErr.message}`);
    }

    if (monthPlans && monthPlans.length > 0) {
      const planIds = monthPlans.map((p: any) => p.id);
      let itemsQuery: any = supabase
        .from('weekly_plan_items')
        .select('plan_id, activity_key, planned_qty, planned_jr, planned_rendimiento');

      if (typeof itemsQuery?.in === 'function') {
        itemsQuery = itemsQuery.in('plan_id', planIds);
      }

      const { data: monthItems, error: itemsErr } = await itemsQuery;

      if (itemsErr) {
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
              stage: 'month_projection_read',
              code: 'MONTH_PROJECTION_READ_FAILED',
              message: itemsErr.message || 'Error al consultar items de planes del mes',
            },
          }
        );
        throw new Error(`MONTH_PROJECTION_READ_FAILED: ${itemsErr.message}`);
      }

      const nonCancelledMonthPlans = (monthPlans || []).filter((p: any) => p.status !== 'cancelled');
      for (const p of nonCancelledMonthPlans) {
        const pItems = (monthItems || [])
          .filter((i: any) => i.plan_id === p.id)
          .map((i: any) => {
            const opFreq = operationalFreqMap.get(i.activity_key);
            const countsCap = opFreq?.counts_capacity !== false;
            return {
              activity_key: i.activity_key,
              planned_qty: Number(i.planned_qty || 0),
              planned_jr: Number(i.planned_jr || 0),
              counts_capacity: countsCap,
            };
          });

        existingMonthPlans.push({
          week_start: p.week_start,
          items: pItems,
        });
      }
    }
  } catch (err: any) {
    if (err.message && err.message.startsWith('MONTH_PROJECTION_READ_FAILED')) {
      throw err;
    }
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
          stage: 'month_projection_read',
          code: 'MONTH_PROJECTION_READ_FAILED',
          message: err.message || String(err),
        },
      }
    );
    throw new Error(`MONTH_PROJECTION_READ_FAILED: ${err.message || String(err)}`);
  }

  // 6.c. D30.4 / D30.5: Cálculo de Arrastre de Entrada (carryoverIn) para mes M >= CARRYOVER_START_MONTH
  const carryoverIn: CarryoverItem[] = [];
  const currentYear = mondayDate.getUTCFullYear();
  const currentMonth = mondayDate.getUTCMonth() + 1; // 1..12
  const currentMonthStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

  if (currentMonthStr >= CARRYOVER_START_MONTH) {
    const prevMonthDate = new Date(Date.UTC(currentYear, mondayDate.getUTCMonth() - 1, 15));
    const prevYear = prevMonthDate.getUTCFullYear();
    const prevMonth = prevMonthDate.getUTCMonth() + 1;
    const prevMonthStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

    const prevCandidateWeeks = getMonthlyCandidateWeeks(prevMonthDate).filter((w) => w.weekNumber <= 4);
    const prevCandidateMondays = prevCandidateWeeks.map((w) => w.weekStartStr);

    let prevPlansQuery: any = supabase
      .from('weekly_plans')
      .select('id, week_start, status')
      .eq('board_id', boardId)
      .eq('group_id', gId);

    if (typeof prevPlansQuery?.in === 'function') {
      prevPlansQuery = prevPlansQuery.in('week_start', prevCandidateMondays);
    }

    const { data: prevPlans, error: prevPlansErr } = await prevPlansQuery;

    if (prevPlansErr) {
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
            stage: 'carryover_read',
            code: 'MONTH_PROJECTION_READ_FAILED',
            message: prevPlansErr.message || 'Error al consultar planes de M-1 para arrastre',
          },
        }
      );
      throw new Error(`MONTH_PROJECTION_READ_FAILED: ${prevPlansErr.message}`);
    }

    const nonCancelledPrevPlans = (prevPlans || []).filter((p: any) => p.status !== 'cancelled');

    // D30.4: Fuente incompleta -> Si alguna semana candidata de M-1 no tiene plan no cancelado, la materialización falla
    const missingM1Weeks = prevCandidateWeeks.filter(
      (pw) => !nonCancelledPrevPlans.some((p: any) => p.week_start === pw.weekStartStr)
    );

    if (missingM1Weeks.length > 0) {
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
            stage: 'carryover_validation',
            code: 'CARRYOVER_SOURCE_INCOMPLETE',
            message: `Fuente incompleta en M-1 (${prevMonthStr}): faltan planes no cancelados en las semanas ${missingM1Weeks.map((w) => w.weekStartStr).join(', ')}`,
            missing_weeks: missingM1Weeks.map((w) => w.weekStartStr),
          },
        }
      );
      throw new Error(
        `CARRYOVER_SOURCE_INCOMPLETE: Fuente incompleta en M-1 (${prevMonthStr}): faltan planes no cancelados en las semanas candidatas`
      );
    }

    const prevPlanIds = nonCancelledPrevPlans.map((p: any) => p.id);
    let prevItemsQuery: any = supabase
      .from('weekly_plan_items')
      .select('plan_id, activity_key, planned_qty');

    if (typeof prevItemsQuery?.in === 'function') {
      prevItemsQuery = prevItemsQuery.in('plan_id', prevPlanIds);
    }

    const { data: prevItems, error: prevItemsErr } = await prevItemsQuery;

    if (prevItemsErr) {
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
            stage: 'carryover_read',
            code: 'MONTH_PROJECTION_READ_FAILED',
            message: prevItemsErr.message || 'Error al consultar items de planes de M-1 para arrastre',
          },
        }
      );
      throw new Error(`MONTH_PROJECTION_READ_FAILED: ${prevItemsErr.message}`);
    }

    const plannedQtyM1Map = new Map<string, number>();
    for (const item of prevItems || []) {
      plannedQtyM1Map.set(
        item.activity_key,
        Number(((plannedQtyM1Map.get(item.activity_key) || 0) + Number(item.planned_qty || 0)).toFixed(2))
      );
    }

    for (const template of templates) {
      const f = template.frecuencia;
      if (f <= 2) {
        let requiredVisitsM1 = 0;
        if (Math.abs(f - 2) < 0.1) {
          requiredVisitsM1 = 2;
        } else if (Math.abs(f - 1) < 0.1) {
          requiredVisitsM1 = 1;
        } else if (Math.abs(f - 0.5) < 0.05) {
          if (prevMonth % 2 === 0) requiredVisitsM1 = 1;
        } else if (Math.abs(f - 0.33) < 0.05) {
          if (prevMonth % 3 === 1) requiredVisitsM1 = 1;
        }

        if (requiredVisitsM1 > 0) {
          const requiredQtyM1 = Number((requiredVisitsM1 * template.cantidad).toFixed(2));
          const actualPlannedQtyM1 = plannedQtyM1Map.get(template.activity_key) || 0;
          const deficitQty = Number((requiredQtyM1 - actualPlannedQtyM1).toFixed(2));

          if (deficitQty > 0.005) {
            const carryoverJr =
              template.rendimiento !== null && template.rendimiento !== undefined && template.rendimiento > 0
                ? Number((deficitQty / template.rendimiento).toFixed(4))
                : 0;

            carryoverIn.push({
              activity_key: template.activity_key,
              qty: deficitQty,
              jr: carryoverJr,
            });
          }
        }
      }
    }
  }

  // 7. Generar Ocurrencias Diarias con Calendario Laboral Colombiano (F3.1, D26, D27, D28, D29, D30, D31)
  const projection = generateRoutineScheduleForWeek(
    templates,
    mondayDate,
    [],
    {
      customNonWorkingDays: options.customNonWorkingDays,
      siteDailyCapacity,
      existingMonthPlans,
      carryoverIn,
      tractorDays: tractorDaysForSite,
    }
  );

  // Ordenar assignments por (dateStr, activity_key) de forma determinista y estable ANTES de asignar planned_sequence
  const sortedAssignments = [...projection.assignments]
    .filter((assign) => isValidISODateString(assign.dateStr))
    .sort((a, b) => {
      const dateCmp = compareStringsCode(a.dateStr, b.dateStr);
      if (dateCmp !== 0) return dateCmp;
      return compareStringsCode(a.activity_key, b.activity_key);
    });

  // 8. Validar y Construir DTO Items completos antes de decidir escrituras
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

    const opFreqItem = operationalFreqMap.get(assign.activity_key);
    const overrideRend = opFreqItem?.rendimiento !== undefined && opFreqItem?.rendimiento !== null ? Number(opFreqItem.rendimiento) : null;
    const effectiveRend = (overrideRend !== null && Number.isFinite(overrideRend) && overrideRend > 0)
      ? overrideRend
      : Number(matchedStd.rendimiento);

    const isNoRendimiento = matchedStd.requiere_rendimiento === false;
    dtoItems.push({
      planned_sequence: idx + 1,
      activity_key: assign.activity_key,
      poa_activity_zone_id: zoneInfo.id,
      activity_standard_id: matchedStd.id,
      planned_rendimiento: isNoRendimiento ? null : effectiveRend,
      planned_frecuencia: assign.frequency_interval,
      priority: matchedStd.priority || 'must_execute',
      planned_qty: assign.cantidad,
      unit: assign.unit,
      planned_jr: isNoRendimiento ? 0 : assign.theoretical_jr,
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

  // 8. D14 / E4 — INMUTABILIDAD DE PLANES EXISTENTES CON ÍTEMS
  if (existingPlan?.id && existingItems.length > 0) {
    // Invariante de Inmutabilidad (E4): Si el plan ya existe no cancelado y con ítems,
    // la materialización no recalcula ni compara secuencias. Devuelve NOOP con 0 mutaciones y registra el resumen.
    await persistMaterializationEvent(
      supabase,
      boardId,
      gId,
      weekStartStr,
      existingPlan.id,
      'SITE_MATERIALIZATION_SUMMARY',
      classification.status,
      {
        ...classification.summary,
        plan_id: existingPlan.id,
        poa_id: activePoaId,
        poa_version_id: activeVersionId,
        site_daily_capacity: siteDailyCapacity,
        capacity_read_error: capacityReadError,
        capacity_error: capacityReadError,
        carryover_in: projection.carryoverIn || [],
        carryover_next_month: projection.carryoverNextMonth || [],
        carryover_next_month_projection: projection.carryoverNextMonthProjection || projection.carryoverNextMonth || [],
        carryover_from_this_week: projection.carryoverFromThisWeek || [],
        recurrent_exceeds_capacity: projection.recurrentExceedsCapacity || [],
        status: classification.status,
      }
    );

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
      carryoverIn: projection.carryoverIn,
      carryoverNextMonth: projection.carryoverNextMonth,
      carryoverNextMonthProjection: projection.carryoverNextMonthProjection,
      carryoverFromThisWeek: projection.carryoverFromThisWeek,
      recurrentExceedsCapacity: projection.recurrentExceedsCapacity,
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

  // D24 / D28: Cálculo informativo de jornales por día y verificación de capacidad del sitio
  // Solo las actividades con counts_capacity = true computan contra la capacidad diaria.
  const dailyJournalsMap: Record<string, number> = {};
  const dailyMachineJournalsMap: Record<string, number> = {};

  for (const assign of sortedAssignments) {
    if (assign.dateStr) {
      const isCounting = assign.counts_capacity !== false;
      if (isCounting) {
        dailyJournalsMap[assign.dateStr] = Number(((dailyJournalsMap[assign.dateStr] || 0) + assign.theoretical_jr).toFixed(4));
      } else {
        dailyMachineJournalsMap[assign.dateStr] = Number(((dailyMachineJournalsMap[assign.dateStr] || 0) + assign.theoretical_jr).toFixed(4));
      }
    }
  }

  const exceededCapacityDays: Array<{ date: string; journals: number; machine_journals?: number; capacity: number; deficit: number }> = [];
  if (siteDailyCapacity !== null && siteDailyCapacity > 0) {
    for (const [dateStr, jrTotal] of Object.entries(dailyJournalsMap)) {
      if (jrTotal > siteDailyCapacity + 0.005) {
        const machineJr = dailyMachineJournalsMap[dateStr] || 0;
        exceededCapacityDays.push({
          date: dateStr,
          journals: jrTotal,
          machine_journals: machineJr,
          capacity: siteDailyCapacity,
          deficit: Number((jrTotal - siteDailyCapacity).toFixed(4)),
        });
      }
    }
  }

  // Detalle por día para el evento de resumen (jornales que cuentan, jornales de máquina, capacidad y déficit)
  const allDates = Array.from(new Set([...Object.keys(dailyJournalsMap), ...Object.keys(dailyMachineJournalsMap)])).sort();
  const dailyCapacityDetail: Record<string, { counting_journals: number; machine_journals: number; capacity: number | null; deficit: number }> = {};
  for (const d of allDates) {
    const cJr = dailyJournalsMap[d] || 0;
    const mJr = dailyMachineJournalsMap[d] || 0;
    const cap = siteDailyCapacity;
    const def = cap !== null && cap > 0 && cJr > cap + 0.005 ? Number((cJr - cap).toFixed(4)) : 0;
    dailyCapacityDetail[d] = {
      counting_journals: cJr,
      machine_journals: mJr,
      capacity: cap,
      deficit: def,
    };
  }

  // Regla M2: Si hubo GATEWAY_DROPPED, el resumen pasa a PARTIAL
  const finalSummary = {
    ...classification.summary,
    plan_id: headerPlanId,
    poa_id: activePoaId,
    poa_version_id: activeVersionId,
    site_daily_capacity: siteDailyCapacity,
    capacity_read_error: capacityReadError,
    capacity_error: capacityReadError,
    daily_journals: dailyJournalsMap,
    daily_machine_journals: dailyMachineJournalsMap,
    daily_capacity_detail: dailyCapacityDetail,
    exceeded_capacity_days: exceededCapacityDays,
    capacity_exceeded: exceededCapacityDays.length > 0,
    carryover_in: projection.carryoverIn || [],
    carryover_next_month: projection.carryoverNextMonth || [],
    carryover_next_month_projection: projection.carryoverNextMonthProjection || projection.carryoverNextMonth || [],
    carryover_from_this_week: projection.carryoverFromThisWeek || [],
    recurrent_exceeds_capacity: projection.recurrentExceedsCapacity || [],
    tractor_days: tractorDaysForSite,
    tractor_route: tractorRoute,
    tractor_deficits: tractorDeficits,
    tractor_day_over_capacity: projection.tractor_day_over_capacity || [],
    tractor_package_not_aligned: projection.tractor_package_not_aligned || [],
    ...(tractorPairUnresolved ? { tractor_pair_unresolved: true } : {}),
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
    carryoverIn: projection.carryoverIn,
    carryoverNextMonth: projection.carryoverNextMonth,
    carryoverNextMonthProjection: projection.carryoverNextMonthProjection,
    carryoverFromThisWeek: projection.carryoverFromThisWeek,
    recurrentExceedsCapacity: projection.recurrentExceedsCapacity,
  };
}
