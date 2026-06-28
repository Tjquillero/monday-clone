'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Column, ColumnType, LabelOptions } from '@/types/monday';

// Default options per type, used when creating a new column.
const DEFAULT_OPTIONS: Partial<Record<ColumnType, object>> = {
  status: {
    labels: [
      { id: 'Not Started', title: 'Pendiente',    color: '#334155' },
      { id: 'Working on it', title: 'En proceso', color: '#F59E0B' },
      { id: 'Done',          title: 'Completado', color: '#10B981' },
      { id: 'Stuck',         title: 'Bloqueado',  color: '#EF4444' },
    ],
    default: 'Not Started',
  } as LabelOptions,
  priority: {
    labels: [
      { id: 'Low',    title: 'Baja',  color: '#3B7EF8' },
      { id: 'Medium', title: 'Media', color: '#F59E0B' },
      { id: 'High',   title: 'Alta',  color: '#EF4444' },
    ],
    default: 'Low',
  } as LabelOptions,
  dropdown: {
    labels: [{ id: 'Opción 1', title: 'Opción 1', color: '#6B7280' }],
    default: 'Opción 1',
  } as LabelOptions,
  tags: {
    labels: [],
  } as LabelOptions,
  people: { multiple: false },
  date: { includeTime: false },
  numbers: { format: 'number', decimals: 0 },
};

const DEFAULT_WIDTHS: Partial<Record<ColumnType, number>> = {
  status:   140,
  priority: 120,
  people:   160,
  date:     130,
  numbers:  110,
  text:     200,
  checkbox:  80,
  tags:     180,
  timeline: 200,
  dropdown: 150,
};

export function useColumnMutations(boardId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['columns', boardId] });

  const createColumn = useMutation({
    mutationFn: async (type: ColumnType) => {
      if (!boardId) throw new Error('boardId required');

      // Determine next position
      const { data: existing } = await supabase
        .from('board_columns')
        .select('position')
        .eq('board_id', boardId)
        .order('position', { ascending: false })
        .limit(1);
      const nextPos = ((existing?.[0]?.position ?? 0) as number) + 10;

      const { data, error } = await supabase
        .from('board_columns')
        .insert({
          board_id: boardId,
          title: defaultTitle(type),
          type,
          key: null,          // user-created columns have no reserved key
          position: nextPos,
          width: DEFAULT_WIDTHS[type] ?? 150,
          options: DEFAULT_OPTIONS[type] ?? {},
          required: false,
          editable: true,
          hidden: false,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  const updateColumn = useMutation({
    mutationFn: async ({ columnId, updates }: { columnId: string; updates: Partial<Column> }) => {
      const { error } = await supabase
        .from('board_columns')
        .update(updates)
        .eq('id', columnId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteColumn = useMutation({
    mutationFn: async (columnId: string) => {
      const { error } = await supabase
        .from('board_columns')
        .delete()
        .eq('id', columnId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  // Reorder: single RPC call (one transaction, no partial-failure risk).
  // Optimistic update: React Query cache is patched immediately so the
  // UI responds without waiting for the round-trip. On error, the cache
  // is rolled back to the previous state.
  const reorderColumns = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      if (!boardId) throw new Error('boardId required');
      const { error } = await supabase.rpc('reorder_board_columns', {
        p_board_id:    boardId,
        p_ordered_ids: orderedIds,
      });
      if (error) throw error;
    },
    onMutate: async (orderedIds: string[]) => {
      // Cancel any in-flight refetches to avoid overwriting the optimistic update
      await queryClient.cancelQueries({ queryKey: ['columns', boardId] });

      // Snapshot current cache for rollback
      const previous = queryClient.getQueryData<Column[]>(['columns', boardId]);

      // Apply optimistic order
      queryClient.setQueryData<Column[]>(['columns', boardId], old => {
        if (!old) return old;
        const byId = new Map(old.map(c => [c.id, c]));
        return orderedIds
          .map((id, i) => ({ ...byId.get(id)!, position: i * 10 }))
          .filter(Boolean);
      });

      return { previous };
    },
    onError: (_err, _ids, ctx) => {
      // Rollback to snapshot on failure
      if (ctx?.previous) {
        queryClient.setQueryData(['columns', boardId], ctx.previous);
      }
    },
    onSettled: invalidate,
  });

  return { createColumn, updateColumn, deleteColumn, reorderColumns };
}

function defaultTitle(type: ColumnType): string {
  const titles: Record<ColumnType, string> = {
    status:   'Estado',
    priority: 'Prioridad',
    people:   'Responsable',
    date:     'Fecha',
    numbers:  'Número',
    text:     'Texto',
    checkbox: 'Casilla',
    tags:     'Etiquetas',
    timeline: 'Línea de tiempo',
    dropdown: 'Desplegable',
  };
  return titles[type] ?? 'Nueva columna';
}
