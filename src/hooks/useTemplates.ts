'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

export interface BoardTemplate {
  id: string;
  name: string;
  description: string;
  structure: {
    groups: any[];
    columns: any[];
  };
  created_at?: string;
}

export function useTemplates() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: templates = [], isLoading } = useQuery<BoardTemplate[]>({
    queryKey: ['board_templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('board_templates')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
  });

  const saveTemplate = useMutation({
    mutationFn: async ({ name, description, structure }: Omit<BoardTemplate, 'id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('board_templates')
        .insert({
          name,
          description,
          structure,
          created_by: user?.id
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board_templates'] });
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('board_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board_templates'] });
    },
  });

  return {
    templates,
    isLoading,
    saveTemplate,
    deleteTemplate
  };
}
