'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Board, Group, Column, Item } from '@/types/monday';
import { offlineDB } from '@/lib/offlineDB';

export function isNetworkError(error: any): boolean {
  if (!error) return false;
  if (typeof window !== 'undefined' && !window.navigator.onLine) return true;
  
  const msg = (error.message || '').toLowerCase();
  const name = (error.name || '').toLowerCase();
  
  return (
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('load failed') ||
    msg.includes('connection') ||
    msg.includes('aborted') ||
    msg.includes('timeout') ||
    name.includes('aborterror') ||
    name.includes('typeerror') ||
    error.status === 502 ||
    error.status === 503 ||
    error.status === 504
  );
}

export function useBoard(boardId?: string) {
  return useQuery({
    queryKey: ['board', boardId],
    queryFn: async () => {
      try {
        let query = supabase.from('boards').select('*');
        if (boardId) {
          query = query.eq('id', boardId);
        } else {
          query = query.order('created_at', { ascending: false }).limit(1);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        const board = data && data.length > 0 ? (data[0] as Board) : null;
        if (board && offlineDB) {
          await offlineDB.upsertRecords('boards', [board]);
        }
        return board;
      } catch (error: any) {
        const isAbort = error.name === 'AbortError' || error.message?.includes('aborted');
        if (isAbort) {
          console.log('Board fetch aborted');
          return null;
        }

        if (isNetworkError(error) && offlineDB) {
          console.log('[Offline] Board query failed due to network. Falling back to IndexedDB.');
          const localBoards = await offlineDB.getTable('boards');
          const found = boardId 
            ? localBoards.find((b: any) => String(b.id) === String(boardId))
            : [...localBoards].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
          return found || null;
        }

        console.error('Board fetch error - Full:', error);
        throw error;
      }
    },
    retry: 2, 
    staleTime: 30 * 60 * 1000,
  });
}

export function useBoardColumns(boardId?: string) {
  return useQuery({
    queryKey: ['columns', boardId],
    queryFn: async () => {
      if (!boardId) return [];
      try {
        const { data, error } = await supabase
          .from('board_columns')
          .select('*')
          .eq('board_id', boardId)
          .order('position');
        
        if (error) throw error;

        const cols = [...(data || [])];
        if (offlineDB) {
          await offlineDB.upsertRecords('board_columns', cols);
        }
        
        return sortColumns(cols);
      } catch (error: any) {
        if (isNetworkError(error) && offlineDB) {
          console.log('[Offline] Board columns query failed due to network. Falling back to IndexedDB.');
          const localCols = await offlineDB.getTable('board_columns');
          const filteredCols = localCols.filter((c: any) => String(c.board_id) === String(boardId));
          return sortColumns(filteredCols);
        }
        throw error;
      }
    },
    enabled: !!boardId,
    staleTime: 10 * 60 * 1000,
  });
}

function sortColumns(cols: Column[]): Column[] {
  return [...cols].sort((a, b) => (a.position || 0) - (b.position || 0));
}

export function useBoardGroups(boardId?: string) {
  return useQuery({
    queryKey: ['groups', boardId],
    queryFn: async () => {
      if (!boardId) return [];
      
      try {
        const { data, error } = await supabase
          .from('groups')
          .select(`
            *,
            items (*, personnel(*))
          `)
          .eq('board_id', boardId)
          .order('position');

        if (error) throw error;

        const result = (data || []).map((g: any) => {
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

        if (offlineDB && data) {
          const groupsToSave = data.map((g: any) => {
            const { items, ...groupOnly } = g;
            return groupOnly;
          });
          await offlineDB.upsertRecords('groups', groupsToSave);

          const itemsToSave: any[] = [];
          data.forEach((g: any) => {
            if (g.items) {
              g.items.forEach((item: any) => {
                const { subItems, ...itemOnly } = item;
                itemsToSave.push(itemOnly);
                if (subItems) {
                  subItems.forEach((sub: any) => {
                    itemsToSave.push(sub);
                  });
                }
              });
            }
          });
          if (itemsToSave.length > 0) {
            await offlineDB.upsertRecords('items', itemsToSave);
          }
        }

        return result;
      } catch (error: any) {
        if (isNetworkError(error) && offlineDB) {
          console.log('[Offline] Board groups query failed due to network. Falling back to IndexedDB.');
          const localGroups = await offlineDB.getTable('groups');
          const localItems = await offlineDB.getTable('items');

          const filteredGroups = localGroups.filter((g: any) => String(g.board_id) === String(boardId));
          const filteredItems = localItems.filter((item: any) => 
            filteredGroups.some((g: any) => String(g.id) === String(item.group_id))
          );

          return filteredGroups.map((g: any) => {
            const parentItems = filteredItems.filter((i: any) => String(i.group_id) === String(g.id) && !i.parent_id);
            const subItems = filteredItems.filter((i: any) => String(i.group_id) === String(g.id) && !!i.parent_id);

            return {
              ...g,
              items: parentItems.map((parent: any) => ({
                ...parent,
                subItems: subItems.filter((child: any) => String(child.parent_id) === String(parent.id))
              }))
            };
          }).sort((a: any, b: any) => (a.position || 0) - (b.position || 0)) as Group[];
        }
        throw error;
      }
    },
    enabled: !!boardId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useActivityTemplates() {
  return useQuery({
    queryKey: ['activity_templates'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from('activity_templates').select('*').order('name');
        if (error) throw error;
        if (offlineDB && data) {
          await offlineDB.upsertRecords('activity_templates', data);
        }
        return data;
      } catch (error: any) {
        if (isNetworkError(error) && offlineDB) {
          console.log('[Offline] Activity templates query failed due to network. Falling back to IndexedDB.');
          return await offlineDB.getTable('activity_templates');
        }
        throw error;
      }
    },
    staleTime: 60 * 60 * 1000,
  });
}

export function useTaskDependencies(boardId?: string) {
  return useQuery({
    queryKey: ['task_dependencies', boardId],
    queryFn: async () => {
      if (!boardId) return [];
      try {
        const { data, error } = await supabase.from('task_dependencies').select('*').eq('board_id', boardId);
        if (error) throw error;
        if (offlineDB && data) {
          await offlineDB.upsertRecords('task_dependencies', data);
        }
        return data;
      } catch (error: any) {
        if (isNetworkError(error) && offlineDB) {
          console.log('[Offline] Task dependencies query failed due to network. Falling back to IndexedDB.');
          const localDeps = await offlineDB.getTable('task_dependencies');
          return localDeps.filter((d: any) => String(d.board_id) === String(boardId));
        }
        throw error;
      }
    },
    enabled: !!boardId,
    staleTime: 10 * 60 * 1000,
  });
}
