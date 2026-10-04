import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiToolDefinition, AiToolContext } from './types';
import { resolveSite } from '../domainTools/siteResolver';
import { extractCarryoverFromEvents } from '@/lib/monthlyScheduleReportService';

export interface CarryoverItemOutput {
  key: string;
  description: string;
  qty: number;
  unit: string;
  jr: number;
}

export interface SiteMonthCarryoverOutput {
  site: string;
  status: 'SIN_INFORMACION' | 'NINGUNA' | 'CON_ACTIVIDADES';
  items: CarryoverItemOutput[];
}

export const getMonthCarryoverTool: AiToolDefinition = {
  name: 'get_month_carryover',
  description:
    'Consulta las actividades reprogramadas o proyectadas como arrastre para el mes siguiente en los sitios del contrato. Esta información proviene del resumen de materialización de los administradores; usuarios sin permisos de administrador verán estado SIN_INFORMACION.',
  sideEffects: false,
  requiresConfirmation: false,
  parametersJsonSchema: {
    type: 'object',
    properties: {
      site: {
        type: 'string',
        description:
          'Nombre del sitio (ej. "Miramar", "Mercado"). Opcional; si no se especifica, consulta todos los sitios del tablero.',
      },
      month: {
        type: 'string',
        description:
          'Mes a consultar en formato YYYY-MM (ej. "2026-10"). Si se omite, se usa el mes actual en Bogotá.',
      },
    },
    required: [],
  },
  execute: async (
    supabase: SupabaseClient,
    args: { site?: string; month?: string },
    ctx: AiToolContext
  ): Promise<SiteMonthCarryoverOutput[]> => {
    if (!ctx.boardId) {
      throw new Error('Abre un tablero para hacer esta consulta.');
    }

    const todayStr =
      ctx.todayBogota ||
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
    const targetMonth =
      args.month && /^\d{4}-\d{2}$/.test(args.month.trim())
        ? args.month.trim()
        : todayStr.slice(0, 7);

    const [yearStr, monthStr] = targetMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const monthStartStr = `${targetMonth}-01`;
    const monthEndStr = `${targetMonth}-${String(daysInMonth).padStart(2, '0')}`;

    // 1. Consultar sitios del tablero o resolver el sitio solicitado
    const { data: allGroups, error: grpErr } = await supabase
      .from('groups')
      .select('id, title')
      .eq('board_id', ctx.boardId)
      .order('position', { ascending: true });

    if (grpErr) {
      throw new Error(`Error al consultar sitios: ${grpErr.message}`);
    }

    let targetGroups = allGroups || [];
    if (args.site && args.site.trim()) {
      const resolved = await resolveSite(supabase, ctx.boardId, args.site, null);
      targetGroups = [{ id: resolved.id, title: resolved.title }];
    }

    // 2. Consultar descripciones de actividades de POA
    const { data: poaList } = await supabase.from('poa').select('id').eq('board_id', ctx.boardId);
    const poaIds = (poaList || []).map((p: any) => p.id);
    const activityMetaMap = new Map<string, { description: string; unit: string }>();

    if (poaIds.length > 0) {
      const { data: versions } = await supabase
        .from('poa_versions')
        .select('id')
        .in('poa_id', poaIds)
        .eq('status', 'active');

      if (versions && versions.length > 0) {
        const { data: acts } = await supabase
          .from('poa_activities')
          .select('activity_key, description, unit')
          .eq('poa_version_id', versions[0].id);

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

    // 3. Consultar materialization_events del mes
    let matEvents: any[] = [];
    try {
      const { data, error } = await supabase
        .from('materialization_events')
        .select('group_id, week_start, status, payload, created_at')
        .eq('board_id', ctx.boardId)
        .eq('event_type', 'SITE_MATERIALIZATION_SUMMARY')
        .neq('status', 'FAILED')
        .gte('week_start', monthStartStr)
        .lte('week_start', monthEndStr)
        .order('week_start', { ascending: false })
        .order('created_at', { ascending: false });

      if (!error && data) {
        matEvents = data;
      }
    } catch {
      // Fallo defensivo por RLS (usuario sin permisos sobre materialization_events)
      matEvents = [];
    }

    const carryoverMap = extractCarryoverFromEvents(matEvents, activityMetaMap);

    const result: SiteMonthCarryoverOutput[] = targetGroups.map((g) => {
      const siteCarry = carryoverMap.get(g.id);
      let status: 'SIN_INFORMACION' | 'NINGUNA' | 'CON_ACTIVIDADES' = 'SIN_INFORMACION';
      let items: CarryoverItemOutput[] = [];

      if (siteCarry) {
        if (siteCarry.status === 'NONE') {
          status = 'NINGUNA';
        } else if (siteCarry.status === 'ITEMS') {
          status = 'CON_ACTIVIDADES';
          items = siteCarry.items.map((i) => ({
            key: i.activity_key,
            description: i.description,
            qty: Number(i.qty || 0),
            unit: i.unit,
            jr: Number(i.jr || 0),
          }));
        }
      }

      return {
        site: g.title,
        status,
        items,
      };
    });

    return result;
  },
};
