'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

// ─────────────────────────────────────────────────────────────────────────────
// usePoaZoneMappings / useResolveZoneMapping
//
// UI de resolución de mapeos de zona (ADR-0004). Alcance de esta primera
// versión: reasignar mapeos YA EXISTENTES cuyo group_id quedó en NULL (Regla
// 5 de ADR-0004 — el group asociado se eliminó). Usa exactamente el índice
// parcial idx_poa_zone_mappings_pending de la migración
// 20260720_poa_zone_mappings.sql, pensado para esta consulta.
//
// Fuera de alcance todavía: zonas nunca antes vistas en un Excel nuevo
// (Regla 2 de ADR-0004) — hoy import_poa_version()/resolveValidationContext
// solo REPORTAN esas zonas como unresolvedZones, sin crear ninguna fila en
// poa_zone_mappings. Cuando exista la UI de importación, el paso natural es
// que, al detectar una zona nueva, se inserte una fila con group_id=NULL —
// y entonces aparecerá aquí automáticamente, sin cambiar este hook.
// ─────────────────────────────────────────────────────────────────────────────

export interface PendingZoneMapping {
  id: string;
  excelZoneName: string;
}

export interface BoardGroupOption {
  id: string;
  title: string;
}

export interface PoaZoneMappingsData {
  poaId: string;
  boardId: string;
  pending: PendingZoneMapping[];
  groups: BoardGroupOption[];
}

export function poaZoneMappingsKey(poaId: string) {
  return ['poa_zone_mappings', poaId] as const;
}

export function usePoaZoneMappings(poaId: string | undefined) {
  return useQuery({
    queryKey: poaId ? poaZoneMappingsKey(poaId) : poaZoneMappingsKey('disabled'),
    queryFn: async (): Promise<PoaZoneMappingsData> => {
      if (!poaId) throw new Error('poaId requerido');

      const { data: poaRow, error: poaError } = await supabase
        .from('poa')
        .select('id, board_id')
        .eq('id', poaId)
        .single();
      if (poaError) throw poaError;

      const boardId = poaRow.board_id as string;

      const [pendingResult, groupsResult] = await Promise.all([
        supabase
          .from('poa_zone_mappings')
          .select('id, excel_zone_name')
          .eq('poa_id', poaId)
          .is('group_id', null)
          .order('excel_zone_name', { ascending: true }),
        supabase
          .from('groups')
          .select('id, title')
          .eq('board_id', boardId)
          .order('title', { ascending: true }),
      ]);

      if (pendingResult.error) throw pendingResult.error;
      if (groupsResult.error) throw groupsResult.error;

      return {
        poaId,
        boardId,
        pending: (pendingResult.data ?? []).map((row: { id: string; excel_zone_name: string }) => ({
          id: row.id,
          excelZoneName: row.excel_zone_name,
        })),
        groups: (groupsResult.data ?? []).map((row: { id: string; title: string }) => ({
          id: row.id,
          title: row.title,
        })),
      };
    },
    enabled: !!poaId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export interface ResolveZoneMappingInput {
  mappingId: string;
  groupId: string;
}

export function useResolveZoneMapping(poaId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation<void, Error, ResolveZoneMappingInput>({
    mutationFn: async ({ mappingId, groupId }) => {
      if (!user?.id) throw new Error('Usuario no autenticado');

      const { error } = await supabase
        .from('poa_zone_mappings')
        .update({ group_id: groupId })
        .eq('id', mappingId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: poaZoneMappingsKey(poaId) });
    },
  });
}
