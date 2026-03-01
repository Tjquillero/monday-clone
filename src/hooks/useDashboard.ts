'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

export interface Dashboard {
  id: string;
  board_id: string;
  name: string;
  description: string;
  is_default: boolean;
  created_at: string;
  created_by: string;
}

export interface DashboardWidget {
  id: string;
  dashboard_id: string;
  type: string;
  title: string;
  config: any;
  layout: {
    x: number;
    y: number;
    w: number;
    h: number;
    i: string;
  };
  created_at: string;
}

export function useDashboard(boardId?: string | number) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // 1. Fetch Dashboards for this board
  const { data: dashboards, isLoading: loadingDashboards } = useQuery({
    queryKey: ['dashboards', boardId],
    queryFn: async () => {
      if (!boardId) return [];
      const { data, error } = await supabase
        .from('dashboards')
        .select('*')
        .eq('board_id', boardId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Dashboard[];
    },
    enabled: !!boardId,
  });

  // 2. Fetch Widgets for a specific dashboard
  const useWidgets = (dashboardId?: string) => {
    return useQuery({
      queryKey: ['dashboard_widgets', dashboardId],
      queryFn: async () => {
        if (!dashboardId) return [];
        const { data, error } = await supabase
          .from('dashboard_widgets')
          .select('*')
          .eq('dashboard_id', dashboardId)
          .order('created_at', { ascending: true });
        
        if (error) throw error;
        return data as DashboardWidget[];
      },
      enabled: !!dashboardId,
    });
  };

  // 3. Create Dashboard
  const createDashboard = useMutation({
    mutationFn: async (name: string) => {
      if (!boardId || !user) throw new Error('Missing boardId or user');
      const { data, error } = await supabase
        .from('dashboards')
        .insert({
          board_id: boardId,
          name,
          created_by: user.id
        })
        .select()
        .single();
      
      if (error) throw error;
      return data as Dashboard;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards', boardId] });
    },
  });

  // 4. Add Widget
  const addWidget = useMutation({
    mutationFn: async ({ dashboardId, type, title, layout }: { dashboardId: string, type: string, title: string, layout: any }) => {
      const { data, error } = await supabase
        .from('dashboard_widgets')
        .insert({
          dashboard_id: dashboardId,
          type,
          title,
          layout
        })
        .select()
        .single();
      
      if (error) throw error;
      return data as DashboardWidget;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard_widgets', variables.dashboardId] });
    },
  });

  // 5. Update Layouts (Bulk)
  const updateLayouts = useMutation({
    mutationFn: async ({ dashboardId, layouts }: { dashboardId: string, layouts: { id: string, layout: any }[] }) => {
      const updates = layouts.map(l => 
        supabase
          .from('dashboard_widgets')
          .update({ layout: l.layout })
          .eq('id', l.id)
      );

      const results = await Promise.all(updates);
      const errors = results.filter(r => r.error);
      
      if (errors.length > 0) throw errors[0].error;
      return results;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard_widgets', variables.dashboardId] });
    },
  });

  // 6. Delete Widget
  const deleteWidget = useMutation({
    mutationFn: async ({ widgetId, dashboardId }: { widgetId: string, dashboardId: string }) => {
      const { error } = await supabase
        .from('dashboard_widgets')
        .delete()
        .eq('id', widgetId);
      
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard_widgets', variables.dashboardId] });
    },
  });

  return {
    dashboards,
    loadingDashboards,
    useWidgets,
    createDashboard,
    addWidget,
    updateLayouts,
    deleteWidget
  };
}
