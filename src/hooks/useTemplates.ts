'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

export interface TemplateColumn {
  id: string;
  templateId: string;
  key: string | null;
  title: string;
  type: string;
  position: number;
  width: number;
  options: Record<string, unknown>;
  required: boolean;
  hidden: boolean;
}

export interface TemplateGroup {
  id: string;
  templateId: string;
  title: string;
  color: string;
  position: number;
}

export interface BoardTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  isSystem: boolean;
  columns: TemplateColumn[];
  groups: TemplateGroup[];
  createdAt?: string;
}

function rowToTemplate(row: any): BoardTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    icon: row.icon ?? 'layout',
    color: row.color ?? '#3B7EF8',
    isSystem: row.is_system ?? false,
    createdAt: row.created_at,
    columns: (row.board_template_columns ?? [])
      .sort((a: any, b: any) => a.position - b.position)
      .map((c: any): TemplateColumn => ({
        id: c.id,
        templateId: c.template_id,
        key: c.key ?? null,
        title: c.title,
        type: c.type,
        position: c.position,
        width: c.width ?? 150,
        options: c.options ?? {},
        required: c.required ?? false,
        hidden: c.hidden ?? false,
      })),
    groups: (row.board_template_groups ?? [])
      .sort((a: any, b: any) => a.position - b.position)
      .map((g: any): TemplateGroup => ({
        id: g.id,
        templateId: g.template_id,
        title: g.title,
        color: g.color ?? '#c4c4c4',
        position: g.position,
      })),
  };
}

export function useTemplates() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: templates = [], isLoading } = useQuery<BoardTemplate[]>({
    queryKey: ['board_templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('board_templates')
        .select(`
          *,
          board_template_columns(*),
          board_template_groups(*)
        `)
        .order('name', { ascending: true });

      if (error) throw error;
      return (data ?? []).map(rowToTemplate);
    },
  });

  const saveTemplate = useMutation({
    mutationFn: async ({
      name,
      description,
      columns,
      groups,
    }: {
      name: string;
      description: string;
      columns: Omit<TemplateColumn, 'id' | 'templateId'>[];
      groups: Omit<TemplateGroup, 'id' | 'templateId'>[];
    }) => {
      const { data: tmpl, error: tmplErr } = await supabase
        .from('board_templates')
        .insert({ name, description, created_by: user?.id })
        .select()
        .single();
      if (tmplErr) throw tmplErr;

      if (columns.length > 0) {
        const { error: colErr } = await supabase.from('board_template_columns').insert(
          columns.map(c => ({ ...c, template_id: tmpl.id }))
        );
        if (colErr) throw colErr;
      }

      if (groups.length > 0) {
        const { error: grpErr } = await supabase.from('board_template_groups').insert(
          groups.map(g => ({ ...g, template_id: tmpl.id }))
        );
        if (grpErr) throw grpErr;
      }

      return tmpl;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board_templates'] });
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('board_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board_templates'] });
    },
  });

  return { templates, isLoading, saveTemplate, deleteTemplate };
}
