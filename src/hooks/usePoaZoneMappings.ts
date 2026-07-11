'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

// ─────────────────────────────────────────────────────────────────────────────
// usePoaZoneMappings / useResolveZoneMapping
//
// UI de resolución de mapeos de zona (ADR-0004). Cubre ambos orígenes de
// "zona pendiente":
//   - Regla 5 de ADR-0004: un mapeo YA EXISTENTE cuyo group_id quedó en
//     NULL (el group se eliminó).
//   - Regla 2 de ADR-0004: una zona NUEVA, vista por primera vez en un
//     Excel — registerUnresolvedZones() (abajo) es quien crea la fila
//     pendiente cuando la pantalla de importación detecta unresolvedZones
//     en un ImportPoaResult 'blocked'. import_poa_version()/
//     resolveValidationContext NUNCA escriben esto — solo LEEN
//     poa_zone_mappings; registrar la fila pendiente es responsabilidad de
//     quien consume el resultado 'blocked' (la UI de importación), no del
//     motor de validación.
//
// Ambos casos usan el mismo índice parcial idx_poa_zone_mappings_pending
// de la migración 20260720_poa_zone_mappings.sql.
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

/**
 * Registra como pendientes (group_id = NULL) las zonas que un
 * ImportPoaResult 'blocked' reportó en unresolvedZones, para que aparezcan
 * en usePoaZoneMappings(). Idempotente: si la fila ya existe (pendiente o
 * ya resuelta), no la toca — un excel_zone_name con mapeo YA resuelto
 * nunca llega aquí, porque en ese caso resolveValidationContext ya lo
 * habría encontrado y no aparecería en unresolvedZones.
 */
export async function registerUnresolvedZones(
  poaId: string,
  excelZoneNames: string[],
  createdBy: string,
): Promise<void> {
  if (excelZoneNames.length === 0) return;

  const { error } = await supabase
    .from('poa_zone_mappings')
    .upsert(
      excelZoneNames.map((excelZoneName) => ({
        poa_id: poaId,
        excel_zone_name: excelZoneName,
        group_id: null,
        created_by: createdBy,
      })),
      { onConflict: 'poa_id,excel_zone_name', ignoreDuplicates: true },
    );

  if (error) throw error;
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
