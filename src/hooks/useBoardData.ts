'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Board, Group, Column, Item } from '@/types/monday';

export function useBoard(boardId?: string) {
  return useQuery({
    queryKey: ['board', boardId],
    queryFn: async () => {
      let query = supabase.from('boards').select('*');
      if (boardId) {
        query = query.eq('id', boardId);
      } else {
        query = query.order('created_at', { ascending: false }).limit(1);
      }
      
      const { data, error } = await query;
      
      if (error) {
        const isAbort = error.name === 'AbortError' || error.message?.includes('aborted');
        if (isAbort) {
          console.log('Board fetch aborted');
          return null; // Don't throw AbortError to avoid Next.js overlay crashes
        } else {
          console.error('Board fetch error - Full:', error);
          console.error('Board fetch error - Code:', error.code);
          console.error('Board fetch error - Message:', error.message);
          console.error('Board fetch error - Details:', error.details);
          throw error; // Throw other errors to trigger Retry/Error state
        }
      }
      
      return data && data.length > 0 ? (data[0] as Board) : null;
    },
    retry: 2, 
    staleTime: 30 * 60 * 1000, // Increase staleTime to reduce redundant fetches
  });
}

export function useBoardColumns(boardId?: string) {
  return useQuery({
    queryKey: ['columns', boardId],
    queryFn: async () => {
      if (!boardId) return [];
      const { data, error } = await supabase
        .from('board_columns')
        .select('*')
        .eq('board_id', boardId)
        .order('position');
      
      if (error) throw error;

      const cols = [...(data || [])];
      
      // Fallback: Ensure crucial columns exist
      if (!cols.some((c: any) => c.type === 'status' || c.id === 'status' || c.title.toLowerCase().includes('estado'))) {
        cols.push({ id: 'status', title: 'Estado', type: 'status', width: 140, position: 1 });
      }
      if (!cols.some((c: Column) => c.type === 'people')) {
        cols.push({ id: 'people', title: 'Personas', type: 'people', width: 150, position: 2 });
      }
      if (!cols.some((c: any) => c.id === 'unit_price' || c.title.includes('Precio'))) {
        cols.push({ id: 'unit_price', title: 'Precio Unitario', type: 'numbers', width: 140, position: 3 });
      }
      if (!cols.some((c: any) => c.id === 'cant' || c.title.includes('Cant'))) {
        cols.push({ id: 'cant', title: 'Cantidad', type: 'numbers', width: 100, position: 4 });
      }
      if (!cols.some((c: any) => c.id === 'category' || c.title.includes('Categor'))) {
        cols.push({ id: 'category', title: 'Categoría', type: 'text', width: 150, position: 5 });
      }
      if (!cols.some((c: any) => c.id === 'rubro')) {
        cols.push({ id: 'rubro', title: 'Rubro Mayor', type: 'text', width: 150, position: 6 });
      }

      return cols.sort((a, b) => (a.position || 0) - (b.position || 0));
    },
    enabled: !!boardId,
    staleTime: 10 * 60 * 1000,
  });
}

export function useBoardGroups(boardId?: string) {
  return useQuery({
    queryKey: ['groups', boardId],
    queryFn: async () => {
      if (!boardId) return [];
      
      // Fetch groups and items in one efficient query
      const { data, error } = await supabase
        .from('groups')
        .select(`
          *,
          items (*)
        `)
        .eq('board_id', boardId)
        .order('position');

      if (error) throw error;

      return (data || []).map((g: any) => {
        // Separate parent items and subitems efficiently
        const parentItems = g.items.filter((i: Item) => !i.parent_id);
        const subItems = g.items.filter((i: Item) => !!i.parent_id);
        
        return {
          ...g,
          items: parentItems.map((parent: Item) => ({
            ...parent,
            subItems: subItems.filter((child: Item) => child.parent_id === parent.id)
          }))
        };
      }) as Group[];
    },
    enabled: !!boardId,
    staleTime: 5 * 60 * 1000, // Reasonable staleTime for group data
  });
}

export function useActivityTemplates() {
  return useQuery({
    queryKey: ['activity_templates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('activity_templates').select('*').order('name');
      if (error) throw error;
      return data;
    },
    staleTime: 60 * 60 * 1000, // Templates change very rarely
  });
}

export function useTaskDependencies(boardId?: string) {
  return useQuery({
    queryKey: ['task_dependencies', boardId],
    queryFn: async () => {
      if (!boardId) return [];
      const { data, error } = await supabase.from('task_dependencies').select('*').eq('board_id', boardId);
      if (error) throw error;
      return data;
    },
    enabled: !!boardId,
    staleTime: 10 * 60 * 1000,
  });
}
