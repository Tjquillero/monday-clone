'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { SchedulerMigrationMissingError } from '@/types/scheduler';

// ─────────────────────────────────────────────────────────────────────────────
// usePoaActiveCatalog
//
// Resuelve la versión ACTIVA del POA de un board y devuelve, por activity_key,
// la frecuencia y el precio_unitario contractuales (poa_activities) más la
// cobertura por zona (poa_activity_zones → cantidad_contratada + el id que
// weekly_plan_items.poa_activity_zone_id debe referenciar).
//
// Fuente: docs/domain/poa-domain.md (Congelado v1) + ADR-0002.
// Reemplaza la resolución de `frecuencia` que antes vivía en
// board_activity_standards.
// ─────────────────────────────────────────────────────────────────────────────

export interface PoaActivityZoneEntry {
  poaActivityZoneId: string;
  zoneId: string;
  cantidadContratada: number;
}

export interface PoaActivityEntry {
  poaActivityId: string;
  activityKey: string;
  frecuencia: number;
  precioUnitario: number;
  zones: Map<string, PoaActivityZoneEntry>; // keyed by zoneId
}

export type PoaActiveCatalog = Map<string, PoaActivityEntry>; // keyed by activityKey

interface PoaActivityZoneRow {
  id: string;
  zone_id: string;
  cantidad_contratada: number;
}

interface PoaActivityRow {
  id: string;
  activity_key: string;
  frecuencia: number;
  precio_unitario: number;
  poa_activity_zones: PoaActivityZoneRow[];
}

interface PoaVersionRow {
  id: string;
  status: string;
  poa_activities: PoaActivityRow[];
}

interface PoaRow {
  id: string;
  poa_versions: PoaVersionRow[];
}

export function usePoaActiveCatalog(boardId: string | undefined) {
  return useQuery({
    queryKey: ['poa_active_catalog', boardId],
    queryFn: async (): Promise<PoaActiveCatalog> => {
      if (!boardId) return new Map();

      const { data, error } = await supabase
        .from('poa')
        .select(`
          id,
          poa_versions!inner(
            id, status,
            poa_activities(
              id, activity_key, frecuencia, precio_unitario,
              poa_activity_zones ( id, zone_id, cantidad_contratada )
            )
          )
        `)
        .eq('board_id', boardId)
        .eq('poa_versions.status', 'active')
        .maybeSingle();

      if (error?.code === '42P01') throw new SchedulerMigrationMissingError('poa_versions');
      if (error) throw error;

      const catalog: PoaActiveCatalog = new Map();
      const row = data as PoaRow | null;
      const activeVersion = row?.poa_versions?.[0];
      if (!activeVersion) return catalog;

      for (const activity of activeVersion.poa_activities ?? []) {
        const zones = new Map<string, PoaActivityZoneEntry>();
        for (const zone of activity.poa_activity_zones ?? []) {
          zones.set(zone.zone_id, {
            poaActivityZoneId: zone.id,
            zoneId: zone.zone_id,
            cantidadContratada: zone.cantidad_contratada,
          });
        }
        catalog.set(activity.activity_key, {
          poaActivityId: activity.id,
          activityKey: activity.activity_key,
          frecuencia: activity.frecuencia,
          precioUnitario: activity.precio_unitario,
          zones,
        });
      }

      return catalog;
    },
    enabled: !!boardId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
