import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiToolDefinition, AiToolContext } from './types';
import { resolveWeekMonday } from '../domainTools/weekResolver';
import { buildTractorUnits, computeTractorRouteForWeek } from '@/lib/routineScheduler';

export interface TractorDayRoute {
  date: string;
  weekday: string;
  sites: string[];
}

export interface PlannedVsRouteDay {
  date: string;
  planned_sites: string[];
  route_sites: string[];
  matches: boolean;
}

export interface TractorConflictDay {
  date: string;
  sites: string[];
}

export interface TractorRouteOutput {
  week_start: string;
  route: TractorDayRoute[];
  deficits: Array<{ unitKey: string; missingVisits: number }>;
  planned_vs_route: PlannedVsRouteDay[];
  conflicts: TractorConflictDay[];
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export const getTractorRouteTool: AiToolDefinition = {
  name: 'get_tractor_route',
  description:
    'Calcula la ruta semanal coordinada del tractor para las playas del contrato y la compara con lo efectivamente programado en los planes semanales, identificando discrepancias y conflictos de doble asignación.',
  sideEffects: false,
  requiresConfirmation: false,
  parametersJsonSchema: {
    type: 'object',
    properties: {
      date: {
        type: 'string',
        description:
          'Cualquier fecha dentro de la semana a consultar (formato YYYY-MM-DD). Se normaliza automáticamente al lunes. Si se omite, se usa la semana activa o actual.',
      },
    },
    required: [],
  },
  execute: async (
    supabase: SupabaseClient,
    args: { date?: string },
    ctx: AiToolContext
  ): Promise<TractorRouteOutput> => {
    if (!ctx.boardId) {
      throw new Error('Abre un tablero para hacer esta consulta.');
    }

    const weekStart = resolveWeekMonday(args.date, ctx.weekStart, ctx.todayBogota);

    // 1. Consultar grupos / playas del tablero
    const { data: groups, error: grpErr } = await supabase
      .from('groups')
      .select('id, title')
      .eq('board_id', ctx.boardId);

    if (grpErr) {
      throw new Error(`Error al consultar sitios: ${grpErr.message}`);
    }

    const groupTitleMap = new Map<string, string>();
    for (const g of groups || []) {
      groupTitleMap.set(g.id, g.title);
    }

    // 2. Consultar frecuencias de tractor (1.15)
    const { data: tractorFreqs, error: freqErr } = await supabase
      .from('operational_frequencies')
      .select('group_id, visits_per_month')
      .eq('board_id', ctx.boardId)
      .eq('activity_key', '1.15');

    if (freqErr) {
      throw new Error(`Error al consultar frecuencias de tractor: ${freqErr.message}`);
    }

    // 3. Armar unidades y calcular ruta algorítmica
    const { tractorUnits } = buildTractorUnits(groups || [], tractorFreqs || []);
    const tractorRouteResult = computeTractorRouteForWeek(tractorUnits, weekStart);

    // 4. Consultar planes semanales no anulados de esa semana
    const { data: plans, error: plansErr } = await supabase
      .from('weekly_plans')
      .select('id, group_id')
      .eq('board_id', ctx.boardId)
      .eq('week_start', weekStart)
      .neq('status', 'cancelled');

    if (plansErr) {
      throw new Error(`Error al consultar planes semanales: ${plansErr.message}`);
    }

    const planIds = (plans || []).map((p: any) => p.id);
    const planGroupMap = new Map<string, string>();
    for (const p of plans || []) {
      planGroupMap.set(p.id, p.group_id);
    }

    let planItems115: any[] = [];
    if (planIds.length > 0) {
      const { data: items, error: itemsErr } = await supabase
        .from('weekly_plan_items')
        .select('plan_id, planned_date, activity_key')
        .in('plan_id', planIds)
        .eq('activity_key', '1.15');

      if (itemsErr) {
        throw new Error(`Error al consultar actividades de tractor programadas: ${itemsErr.message}`);
      }
      planItems115 = items || [];
    }

    // Identificar IDs de Country y Sabanilla 2 para verificar conflictos por unidad
    const countryGroup = (groups || []).find(
      (g: any) => g.title && g.title.trim().toUpperCase() === 'PLAYA DEL COUNTRY'
    );
    const sabanillaGroup = (groups || []).find(
      (g: any) => g.title && g.title.trim().toUpperCase() === 'PLAYA DE SABANILLA 2'
    );
    const countryId = countryGroup?.id;
    const sabanillaId = sabanillaGroup?.id;

    // 5. Construir los días de la semana y la comparación
    const [y, m, dNum] = weekStart.split('-').map(Number);
    const routeDays: TractorDayRoute[] = [];
    const plannedVsRoute: PlannedVsRouteDay[] = [];
    const conflicts: TractorConflictDay[] = [];

    for (let i = 0; i < 6; i++) {
      const curDate = new Date(Date.UTC(y, m - 1, dNum + i));
      const dateStr = curDate.toISOString().slice(0, 10);
      const weekday = WEEKDAYS[curDate.getUTCDay()];

      // Sitios de la ruta calculada para este día
      const routeByDate = tractorRouteResult.routeByDate || {};
      const routeSitesForDate = routeByDate[dateStr] || [];

      // Sitios efectivamente programados en planes para este día con 1.15
      const dayPlanItems = planItems115.filter((it: any) => it.planned_date === dateStr);
      const plannedGroupIds: string[] = Array.from(
        new Set(
          dayPlanItems
            .map((it: any) => planGroupMap.get(it.plan_id))
            .filter((gid): gid is string => typeof gid === 'string' && gid.length > 0)
        )
      );
      const plannedSitesForDate = plannedGroupIds.map(
        (gid: string) => groupTitleMap.get(gid) || gid
      );

      // Evaluar si coinciden
      const sortedRoute = [...routeSitesForDate].sort();
      const sortedPlanned = [...plannedSitesForDate].sort();
      const matches =
        sortedRoute.length === sortedPlanned.length &&
        sortedRoute.every((val, idx) => val === sortedPlanned[idx]);

      routeDays.push({
        date: dateStr,
        weekday,
        sites: routeSitesForDate,
      });

      plannedVsRoute.push({
        date: dateStr,
        planned_sites: plannedSitesForDate,
        route_sites: routeSitesForDate,
        matches,
      });

      // Evaluar conflicto: si hay 1.15 en más de una unidad tractor.
      // Country y Sabanilla 2 cuentan como una sola unidad tractor.
      if (plannedGroupIds.length > 1) {
        const unitsCounted = new Set<string>();
        for (const gid of plannedGroupIds) {
          if (countryId && sabanillaId && (gid === countryId || gid === sabanillaId)) {
            unitsCounted.add('pair_country_sabanilla');
          } else {
            unitsCounted.add(gid);
          }
        }
        if (unitsCounted.size > 1) {
          conflicts.push({
            date: dateStr,
            sites: plannedSitesForDate,
          });
        }
      }
    }

    return {
      week_start: weekStart,
      route: routeDays,
      deficits: tractorRouteResult.deficits,
      planned_vs_route: plannedVsRoute,
      conflicts,
    };
  },
};
