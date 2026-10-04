import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiToolDefinition, AiToolContext } from './types';
import { resolveSite } from '../domainTools/siteResolver';
import { resolveWeekMonday } from '../domainTools/weekResolver';

export interface PlanActivityItem {
  key: string;
  description: string;
  qty: number;
  unit: string;
  jr: number;
  machinery: boolean;
}

export interface PlanDaySchedule {
  date: string;
  weekday: string;
  activities: PlanActivityItem[];
  personnel_jr_total: number;
  machinery_jr_total: number;
  daily_limit_jr: number | null;
  over_limit: boolean;
}

export interface SiteWeekPlanOutput {
  site: string;
  week_start: string;
  plan_status: string | null;
  days: PlanDaySchedule[];
  message?: string;
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export const getSiteWeekPlanTool: AiToolDefinition = {
  name: 'get_site_week_plan',
  description:
    'Obtiene el cronograma de trabajo planificado para un sitio en una semana dada. Detalla las actividades asignadas día a día, calcula los totales de jornales de personal vs maquinaria y alerta si se excede la capacidad diaria permitida.',
  sideEffects: false,
  requiresConfirmation: false,
  parametersJsonSchema: {
    type: 'object',
    properties: {
      site: {
        type: 'string',
        description:
          'Nombre del sitio o frente de trabajo (ej. "Miramar", "Plaza", "Sabanilla"). Si se omite, se usa el sitio activo en pantalla.',
      },
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
    args: { site?: string; date?: string },
    ctx: AiToolContext
  ): Promise<SiteWeekPlanOutput> => {
    if (!ctx.boardId) {
      throw new Error('Abre un tablero para hacer esta consulta.');
    }

    const resolvedSite = await resolveSite(supabase, ctx.boardId, args.site, ctx.groupId);
    const weekStart = resolveWeekMonday(args.date, ctx.weekStart, ctx.todayBogota);

    // 1. Consultar el plan semanal no anulado
    const { data: plan, error: planErr } = await supabase
      .from('weekly_plans')
      .select('id, status')
      .eq('board_id', ctx.boardId)
      .eq('group_id', resolvedSite.id)
      .eq('week_start', weekStart)
      .neq('status', 'cancelled')
      .maybeSingle();

    if (planErr) {
      throw new Error(`Error al consultar el plan semanal: ${planErr.message}`);
    }

    if (!plan) {
      return {
        site: resolvedSite.title,
        week_start: weekStart,
        plan_status: null,
        message: 'No hay plan creado para esa semana',
        days: [],
      };
    }

    // 2. Consultar ítems del plan
    const { data: items, error: itemsErr } = await supabase
      .from('weekly_plan_items')
      .select('activity_key, planned_date, planned_qty, planned_jr, unit')
      .eq('plan_id', plan.id)
      .order('planned_date', { ascending: true });

    if (itemsErr) {
      throw new Error(`Error al consultar las actividades del plan: ${itemsErr.message}`);
    }

    // 3. Consultar metadatos de POA activo (descripciones)
    const { data: poaList, error: poaErr } = await supabase
      .from('poa')
      .select('id')
      .eq('board_id', ctx.boardId);

    if (poaErr) {
      throw new Error(`Error al consultar POA: ${poaErr.message}`);
    }

    const poaIds = (poaList || []).map((p: any) => p.id);
    const activityMetaMap = new Map<string, { description: string; unit: string }>();

    if (poaIds.length > 0) {
      const { data: versions, error: verErr } = await supabase
        .from('poa_versions')
        .select('id')
        .in('poa_id', poaIds)
        .eq('status', 'active');

      if (verErr) {
        throw new Error(`Error al consultar versiones de POA: ${verErr.message}`);
      }

      if (versions && versions.length > 0) {
        const { data: acts, error: actsErr } = await supabase
          .from('poa_activities')
          .select('activity_key, description, unit')
          .eq('poa_version_id', versions[0].id);

        if (actsErr) {
          throw new Error(`Error al consultar actividades del POA: ${actsErr.message}`);
        }

        for (const a of acts || []) {
          if (a.activity_key) {
            activityMetaMap.set(a.activity_key, {
              description: a.description || a.activity_key,
              unit: a.unit || 'UND',
            });
          }
        }
      }
    }

    // 4. Consultar frecuencias operativas para distinguir maquinaria (!counts_capacity)
    const { data: freqs, error: freqsErr } = await supabase
      .from('operational_frequencies')
      .select('activity_key, counts_capacity')
      .eq('board_id', ctx.boardId)
      .eq('group_id', resolvedSite.id);

    if (freqsErr) {
      throw new Error(`Error al consultar frecuencias operativas: ${freqsErr.message}`);
    }

    const countsCapMap = new Map<string, boolean>();
    for (const f of freqs || []) {
      countsCapMap.set(f.activity_key, f.counts_capacity !== false);
    }

    // 5. Consultar límite de capacidad diaria
    const { data: capData, error: capErr } = await supabase
      .from('site_daily_capacity')
      .select('jornales_dia')
      .eq('board_id', ctx.boardId)
      .eq('group_id', resolvedSite.id)
      .maybeSingle();

    if (capErr) {
      throw new Error(`Error al consultar capacidad diaria: ${capErr.message}`);
    }

    const dailyLimitJr =
      capData?.jornales_dia !== null && capData?.jornales_dia !== undefined
        ? Number(capData.jornales_dia)
        : null;

    // 6. Armar los 6 días de la semana operativa (Lunes a Sábado)
    const [y, m, dNum] = weekStart.split('-').map(Number);
    const days: PlanDaySchedule[] = [];

    for (let i = 0; i < 6; i++) {
      const curDate = new Date(Date.UTC(y, m - 1, dNum + i));
      const dateStr = curDate.toISOString().slice(0, 10);
      const weekday = WEEKDAYS[curDate.getUTCDay()];

      const dayItems = (items || []).filter((it: any) => it.planned_date === dateStr);
      let personnelJr = 0;
      let machineryJr = 0;

      const activities: PlanActivityItem[] = dayItems.map((it: any) => {
        const meta = activityMetaMap.get(it.activity_key);
        const countsCap = countsCapMap.has(it.activity_key)
          ? countsCapMap.get(it.activity_key)!
          : true;
        const isMachinery = !countsCap;
        const jr = Number(it.planned_jr || 0);

        if (isMachinery) {
          machineryJr += jr;
        } else {
          personnelJr += jr;
        }

        return {
          key: it.activity_key,
          description: meta?.description || it.activity_key,
          qty: Number(it.planned_qty || 0),
          unit: it.unit || meta?.unit || 'UND',
          jr: Number(jr.toFixed(2)),
          machinery: isMachinery,
        };
      });

      const personnelTotal = Number(personnelJr.toFixed(2));
      const machineryTotal = Number(machineryJr.toFixed(2));
      const overLimit = dailyLimitJr !== null ? personnelTotal > dailyLimitJr : false;

      days.push({
        date: dateStr,
        weekday,
        activities,
        personnel_jr_total: personnelTotal,
        machinery_jr_total: machineryTotal,
        daily_limit_jr: dailyLimitJr,
        over_limit: overLimit,
      });
    }

    return {
      site: resolvedSite.title,
      week_start: weekStart,
      plan_status: plan.status,
      days,
    };
  },
};
