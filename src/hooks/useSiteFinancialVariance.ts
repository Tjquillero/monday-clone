'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import {
  evaluateSiteExecutiveVariance,
  SiteExecutiveVarianceSummary,
  ContractualPriceSource,
} from '@/lib/realCostVarianceService';
import { WeeklyPlanItem } from '@/types/weeklyPlan';
import { ExecutionRecord } from '@/types/execution';
import { Acta, ActaItem, ActaItemSource } from '@/types/acta';
import { resolveActivityDescriptiveName } from '@/lib/activityCatalogResolver';

export interface UseSiteFinancialVarianceOptions {
  boardId?: string;
  enabled?: boolean;
}

export interface SiteFinancialVarianceResult {
  summary: SiteExecutiveVarianceSummary | null;
  planItems: WeeklyPlanItem[];
  executions: ExecutionRecord[];
  actas: Acta[];
  actaItems: ActaItem[];
  actaItemSources: ActaItemSource[];
  groupsMap: Map<string, string>;
  isLoading: boolean;
  error: Error | null;
}

export const siteFinancialVarianceKeys = {
  all: (boardId: string) => ['site_financial_variance', boardId] as const,
};

export function useSiteFinancialVariance({
  boardId,
  enabled = true,
}: UseSiteFinancialVarianceOptions): SiteFinancialVarianceResult {
  const query = useQuery({
    queryKey: siteFinancialVarianceKeys.all(boardId || ''),
    enabled: !!boardId && enabled,
    queryFn: async () => {
      if (!boardId) return null;

      // 1. Obtener planes semanales del tablero
      const { data: plansData, error: plansErr } = await supabase
        .from('weekly_plans')
        .select('*')
        .eq('board_id', boardId);

      if (plansErr) {
        console.warn('[useSiteFinancialVariance] Error fetching weekly_plans:', plansErr);
      }

      const plans = (plansData || []) as Array<{ id: string; board_id: string; group_id: string | null; week_start?: string }>;
      const planIds = plans.map((p) => p.id);
      const plansMap = new Map<string, any>(plans.map((p) => [p.id, p]));

      // 2. Obtener grupos (sitios / frentes de trabajo)
      const { data: groupsData, error: groupsErr } = await supabase
        .from('groups')
        .select('id, title, position')
        .eq('board_id', boardId)
        .order('position', { ascending: true });

      if (groupsErr) {
        console.warn('[useSiteFinancialVariance] Error fetching groups:', groupsErr);
      }

      const groupsMap = new Map<string, string>();
      (groupsData || []).forEach((g: any) => groupsMap.set(g.id, g.title));

      // 3. Catálogo de actividades / estándares para nombres descriptivos
      const { data: standardsData } = await supabase
        .from('board_activity_standards')
        .select('activity_key, name, unit_price, unit')
        .eq('board_id', boardId)
        .is('effective_to', null);

      const standardsMap = new Map<string, string>();
      const pricesMap = new Map<string, { unitPrice: number | null; unit?: string }>();

      (standardsData || []).forEach((s: any) => {
        if (s.activity_key) {
          if (s.name) standardsMap.set(s.activity_key, s.name);
          if (s.unit_price !== undefined && s.unit_price !== null) {
            pricesMap.set(s.activity_key, {
              unitPrice: Number(s.unit_price),
              unit: s.unit || undefined,
            });
          }
        }
      });

      // 4. Obtener ítems de planes semanales
      let planItems: WeeklyPlanItem[] = [];
      if (planIds.length > 0) {
        const { data: rawItemsData, error: itemsErr } = await supabase
          .from('weekly_plan_items')
          .select('*')
          .in('plan_id', planIds);

        if (itemsErr) {
          console.warn('[useSiteFinancialVariance] Error fetching weekly_plan_items:', itemsErr);
        }

        planItems = (rawItemsData || []).map((row: any) => {
          const parentPlan = plansMap.get(row.plan_id);
          const groupTitle = parentPlan?.group_id ? groupsMap.get(parentPlan.group_id) : '';
          const descriptiveName = resolveActivityDescriptiveName(row.activity_key, standardsMap);

          return {
            id: row.id,
            weekly_plan_id: row.plan_id,
            board_id: parentPlan?.board_id || boardId,
            group_id: parentPlan?.group_id || null,
            activity_key: row.activity_key,
            name: descriptiveName,
            zone: groupTitle || '',
            unit: row.unit || 'und',
            planned_date: row.planned_date || parentPlan?.week_start || new Date().toISOString().split('T')[0],
            planned_qty: Number(row.planned_qty || 0),
            theoretical_jr: Number(row.planned_jr || 0),
            source_type: 'ROUTINE',
            routine_reference: row.activity_key,
            occurrence_key: row.occurrence_key || row.id,
            is_manual_override: !!row.is_manual_override,
            status: row.status || 'planned',
            created_at: row.created_at,
            updated_at: row.updated_at,
          };
        });
      }

      const itemIds = planItems.map((i) => i.id);

      // 5. Obtener ejecuciones físicas
      let executions: ExecutionRecord[] = [];
      if (itemIds.length > 0) {
        const { data: execData, error: execErr } = await supabase
          .from('weekly_plan_item_executions')
          .select('*')
          .in('weekly_plan_item_id', itemIds);

        if (execErr) {
          console.warn('[useSiteFinancialVariance] Error fetching executions:', execErr);
        }

        executions = (execData || []).map((row: any) => ({
          id: row.id,
          weekly_plan_item_id: row.weekly_plan_item_id,
          board_id: row.board_id || boardId,
          execution_date: row.execution_date,
          executed_qty: Number(row.executed_qty || 0),
          worker_count: Number(row.worker_count || 1),
          hours_worked: Number(row.hours_worked || 8),
          reported_by: row.reported_by || 'system',
          verification_status: row.verification_status || row.status || 'reported',
          verification_notes: row.verification_notes || row.rejection_notes || null,
          created_at: row.created_at,
          updated_at: row.updated_at,
        }));
      }

      // 6. Obtener precios contractuales POA
      const { data: poaData } = await supabase
        .from('poa_activities')
        .select('id, activity_key, unit_price, unit')
        .eq('board_id', boardId);

      const contractualPrices: ContractualPriceSource[] = [];
      (poaData || []).forEach((poa: any) => {
        if (poa.activity_key && poa.unit_price != null) {
          contractualPrices.push({
            poaActivityId: poa.activity_key,
            unitPrice: Number(poa.unit_price),
            currency: 'COP',
            unit: poa.unit || undefined,
          });
        }
      });

      // Si no vienen precios de poa_activities, usar los de board_activity_standards
      pricesMap.forEach((val, key) => {
        if (!contractualPrices.some((p) => p.poaActivityId === key) && val.unitPrice != null) {
          contractualPrices.push({
            poaActivityId: key,
            unitPrice: val.unitPrice,
            currency: 'COP',
            unit: val.unit,
          });
        }
      });

      // 7. Obtener Actas, ActaItems y ActaItemSources
      const { data: actasData } = await supabase
        .from('actas')
        .select('*')
        .eq('board_id', boardId);

      const actas: Acta[] = (actasData || []).map((a: any) => ({
        id: a.id,
        board_id: a.board_id,
        numero: a.numero != null ? Number(a.numero) : null,
        estado: a.estado || 'draft',
        fecha: a.fecha || null,
        observaciones: a.observaciones || null,
        generated_by: a.generated_by || 'system',
        generated_at: a.generated_at || new Date().toISOString(),
        issued_by: a.issued_by || null,
        issued_at: a.issued_at || null,
        created_at: a.created_at,
        updated_at: a.updated_at,
      }));

      const actaIds = actas.map((a) => a.id);
      let actaItems: ActaItem[] = [];
      let actaItemSources: ActaItemSource[] = [];

      if (actaIds.length > 0) {
        const { data: itemsData } = await supabase
          .from('acta_items')
          .select('*')
          .in('acta_id', actaIds);

        actaItems = (itemsData || []).map((ai: any) => ({
          id: ai.id,
          acta_id: ai.acta_id,
          poa_activity_id: ai.poa_activity_id,
          descripcion_snapshot: ai.descripcion_snapshot || '',
          unidad_snapshot: ai.unidad_snapshot || '',
          precio_unitario_snapshot: Number(ai.precio_unitario_snapshot || 0),
          activity_key_snapshot: ai.activity_key_snapshot || null,
          zone_snapshot: ai.zone_snapshot || null,
          cantidad_facturada: Number(ai.cantidad_facturada || 0),
          valor_total: ai.valor_total != null ? Number(ai.valor_total) : undefined,
          created_at: ai.created_at,
          updated_at: ai.updated_at,
        }));

        const actaItemIds = actaItems.map((ai) => ai.id);
        if (actaItemIds.length > 0) {
          const { data: sourcesData } = await supabase
            .from('acta_item_sources')
            .select('*')
            .in('acta_item_id', actaItemIds);

          actaItemSources = (sourcesData || []).map((ais: any) => ({
            id: ais.id,
            acta_item_id: ais.acta_item_id,
            execution_id: ais.execution_id,
            cantidad_consumida: Number(ais.cantidad_consumida || 0),
            created_at: ais.created_at,
          }));
        }
      }

      // 8. INVOCA SOBERANAMENTE evaluateSiteExecutiveVariance
      const summary = evaluateSiteExecutiveVariance(
        boardId,
        planItems,
        executions,
        contractualPrices,
        actas,
        actaItems,
        actaItemSources
      );

      return {
        summary,
        planItems,
        executions,
        actas,
        actaItems,
        actaItemSources,
        groupsMap,
      };
    },
  });

  return {
    summary: query.data?.summary || null,
    planItems: query.data?.planItems || [],
    executions: query.data?.executions || [],
    actas: query.data?.actas || [],
    actaItems: query.data?.actaItems || [],
    actaItemSources: query.data?.actaItemSources || [],
    groupsMap: query.data?.groupsMap || new Map(),
    isLoading: query.isLoading,
    error: (query.error as Error) || null,
  };
}
