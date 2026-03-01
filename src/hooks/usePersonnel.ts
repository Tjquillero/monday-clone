'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Personnel } from '@/types/monday';

export function usePersonnel() {
  return useQuery<Personnel[]>({
    queryKey: ['personnel'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('personnel')
        .select('*')
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });
}

export function usePersonnelMutations() {
  const queryClient = useQueryClient();

  const createPersonnel = useMutation({
    mutationFn: async (newPerson: Omit<Personnel, 'id'>) => {
      const { data, error } = await supabase
        .from('personnel')
        .insert([newPerson])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personnel'] });
    },
  });

  const updatePersonnel = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Personnel> }) => {
      const { data, error } = await supabase
        .from('personnel')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: ['personnel'] });
      const previousPersonnel = queryClient.getQueryData<Personnel[]>(['personnel']);
      
      queryClient.setQueryData<Personnel[]>(['personnel'], (old) => 
        old?.map(p => p.id === id ? { ...p, ...updates } : p)
      );

      return { previousPersonnel };
    },
    onError: (err, variables, context) => {
      if (context?.previousPersonnel) {
        queryClient.setQueryData(['personnel'], context.previousPersonnel);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['personnel'] });
    },
  });

  const deletePersonnel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('personnel')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return id;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['personnel'] });
      const previousPersonnel = queryClient.getQueryData<Personnel[]>(['personnel']);
      
      queryClient.setQueryData<Personnel[]>(['personnel'], (old) => 
        old?.filter(p => p.id !== id)
      );

      return { previousPersonnel };
    },
    onError: (err, id, context) => {
      if (context?.previousPersonnel) {
        queryClient.setQueryData(['personnel'], context.previousPersonnel);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['personnel'] });
    },
  });

  return {
    createPersonnel,
    updatePersonnel,
    deletePersonnel,
  };
}
