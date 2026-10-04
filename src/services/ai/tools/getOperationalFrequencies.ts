import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiToolDefinition, AiToolContext } from './types';
import { resolveSite } from '../domainTools/siteResolver';

export interface OperationalFrequencyItem {
  site: string;
  key: string;
  description: string;
  visits_per_month: number;
  uses_machinery: boolean;
  source: string;
}

export const getOperationalFrequenciesTool: AiToolDefinition = {
  name: 'get_operational_frequencies',
  description:
    'Consulta las frecuencias operativas (visitas por mes) asignadas a las actividades del contrato. Indica con qué periodicidad se ejecuta cada actividad en uno o todos los sitios del tablero y si emplea maquinaria o personal.',
  sideEffects: false,
  requiresConfirmation: false,
  parametersJsonSchema: {
    type: 'object',
    properties: {
      site: {
        type: 'string',
        description:
          'Nombre del sitio (ej. "Miramar", "Country"). Opcional; si no se especifica, consulta las frecuencias en todos los sitios del tablero.',
      },
      activity_key: {
        type: 'string',
        description:
          'Código o identificador de la actividad (ej. "1.12", "1.15"). Opcional.',
      },
    },
    required: [],
  },
  execute: async (
    supabase: SupabaseClient,
    args: { site?: string; activity_key?: string },
    ctx: AiToolContext
  ): Promise<OperationalFrequencyItem[]> => {
    if (!ctx.boardId) {
      throw new Error('Abre un tablero para hacer esta consulta.');
    }

    let targetGroupId: string | null = null;
    if (args.site && args.site.trim()) {
      const resolved = await resolveSite(supabase, ctx.boardId, args.site, null);
      targetGroupId = resolved.id;
    }

    // 1. Consultar nombres de sitios del tablero
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

    // 2. Consultar descripciones de actividades de la versión activa de POA
    const { data: poaList, error: poaErr } = await supabase
      .from('poa')
      .select('id')
      .eq('board_id', ctx.boardId);

    if (poaErr) {
      throw new Error(`Error al consultar POA: ${poaErr.message}`);
    }

    const poaIds = (poaList || []).map((p: any) => p.id);
    const activityMetaMap = new Map<string, string>();

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
          .select('activity_key, description')
          .eq('poa_version_id', versions[0].id);

        if (actsErr) {
          throw new Error(`Error al consultar actividades del POA: ${actsErr.message}`);
        }

        for (const a of acts || []) {
          if (a.activity_key) {
            activityMetaMap.set(a.activity_key, a.description || a.activity_key);
          }
        }
      }
    }

    // 3. Consultar operational_frequencies
    let query = supabase
      .from('operational_frequencies')
      .select('group_id, activity_key, visits_per_month, counts_capacity, source')
      .eq('board_id', ctx.boardId);

    if (targetGroupId) {
      query = query.eq('group_id', targetGroupId);
    }

    if (args.activity_key && args.activity_key.trim()) {
      query = query.eq('activity_key', args.activity_key.trim());
    }

    const { data: freqs, error: freqsErr } = await query;
    if (freqsErr) {
      throw new Error(`Error al consultar frecuencias operativas: ${freqsErr.message}`);
    }

    const result: OperationalFrequencyItem[] = (freqs || []).map((f: any) => {
      const siteName = groupTitleMap.get(f.group_id) || f.group_id;
      const desc = activityMetaMap.get(f.activity_key) || f.activity_key;
      return {
        site: siteName,
        key: f.activity_key,
        description: desc,
        visits_per_month: Number(f.visits_per_month || 0),
        uses_machinery: f.counts_capacity === false,
        source: f.source || 'default',
      };
    });

    // Ordenar por nombre de sitio y luego por clave de actividad
    result.sort((a, b) => {
      const siteCmp = a.site.localeCompare(b.site, 'es', { sensitivity: 'base' });
      if (siteCmp !== 0) return siteCmp;
      return a.key.localeCompare(b.key, 'es', { numeric: true });
    });

    return result;
  },
};
