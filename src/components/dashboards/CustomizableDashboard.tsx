'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Responsive, WidthProvider } from 'react-grid-layout';
import Widget, { WidgetType } from './Widget';
import { useMemo } from 'react';
import { Plus, LayoutGrid } from 'lucide-react';

const ResponsiveGridLayout = WidthProvider(Responsive);

interface DashboardWidget {
  id: string;
  dashboard_id: string;
  widget_type: WidgetType;
  layout: {
    i: string; // Corresponds to widget.id
    x: number;
    y: number;
    w: number;
    h: number;
  };
  config: {
    title: string;
    [key: string]: any;
  };
}

interface CustomizableDashboardProps {
  dashboardId: string;
}

// --- API Functions ---
const getDashboardWidgets = async (dashboardId: string): Promise<DashboardWidget[]> => {
  const { data, error } = await supabase
    .from('dashboard_widgets')
    .select('*')
    .eq('dashboard_id', dashboardId);
  if (error) throw new Error(error.message);
  return data.map(w => ({ ...w, layout: w.layout || { i: w.id, x: 0, y: 0, w: 4, h: 2 } }));
};

const updateWidgetLayouts = async (widgets: { id: string, layout: any }[]) => {
  const updates = widgets.map(({ id, layout }) => 
    supabase.from('dashboard_widgets').update({ layout }).eq('id', id)
  );
  const results = await Promise.all(updates);
  const error = results.find(res => res.error);
  if (error) throw error.error;
  return results;
};

const addWidgetToDB = async ({ dashboardId, type, layout, config }: any) => {
    const { data, error } = await supabase
        .from('dashboard_widgets')
        .insert({
            dashboard_id: dashboardId,
            widget_type: type,
            layout: layout,
            config: config
        })
        .select()
        .single();
    if (error) throw error;
    return data;
}

const removeWidgetFromDB = async (widgetId: string) => {
    const { error } = await supabase.from('dashboard_widgets').delete().eq('id', widgetId);
    if (error) throw error;
}

export default function CustomizableDashboard({ dashboardId }: CustomizableDashboardProps) {
  const queryClient = useQueryClient();

  const { data: widgets = [], isLoading } = useQuery({
    queryKey: ['dashboard', dashboardId, 'widgets'],
    queryFn: () => getDashboardWidgets(dashboardId),
    enabled: !!dashboardId,
  });

  const saveLayoutMutation = useMutation({
    mutationFn: updateWidgetLayouts,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', dashboardId, 'widgets'] });
    },
    onError: (error) => {
      console.error("Failed to save layout:", error);
      alert("No se pudo guardar el diseño.");
    }
  });

  const addWidgetMutation = useMutation({
      mutationFn: addWidgetToDB,
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['dashboard', dashboardId, 'widgets'] });
      }
  });

  const removeWidgetMutation = useMutation({
      mutationFn: removeWidgetFromDB,
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['dashboard', dashboardId, 'widgets'] });
      }
  });

  const handleLayoutChange = (layout: ReactGridLayout.Layout[]) => {
    const widgetsToUpdate = layout.map(l => ({
      id: l.i,
      layout: { i: l.i, x: l.x, y: l.y, w: l.w, h: l.h }
    }));
    saveLayoutMutation.mutate(widgetsToUpdate);
  };

  const handleAddWidget = (type: WidgetType) => {
      const newWidget = {
          dashboardId,
          type,
          config: { title: `Nuevo Widget: ${type}` },
          layout: {
              i: `new-${Date.now()}`, // Temporary ID, will be replaced by DB ID
              x: (widgets.length * 4) % 12, // Basic positioning
              y: Infinity, // Puts it at the bottom
              w: 4,
              h: 2
          }
      };
      addWidgetMutation.mutate(newWidget);
  }

  const handleRemoveWidget = (widgetId: string) => {
      if (confirm('¿Estás seguro de que quieres eliminar este widget?')) {
          removeWidgetMutation.mutate(widgetId);
      }
  }

  const layouts = useMemo(() => ({
    lg: widgets.map(w => w.layout)
  }), [widgets]);

  if (isLoading) {
    return <div className="p-8 text-center">Cargando Dashboard...</div>;
  }

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-slate-800">Panel Personalizable</h1>
        <div className="relative group">
            <button 
                className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2"
            >
                <Plus size={16} /> Añadir Widget
            </button>
            <div className="absolute top-full right-0 mt-1 w-56 bg-white rounded-lg shadow-xl border border-slate-100 py-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
                <button onClick={() => handleAddWidget('s-curve')} className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50">Curva S de Avance</button>
                <button onClick={() => handleAddWidget('budget-execution')} className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50">Ejecución Presupuestal</button>
                <button onClick={() => handleAddWidget('cost-deviation')} className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50">Desviación de Costos</button>
                <button onClick={() => handleAddWidget('tasks-list')} className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50">Lista de Tareas</button>
            </div>
        </div>
      </div>

      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
        rowHeight={100}
        onLayoutChange={handleLayoutChange}
        draggableHandle=".widget-header" // Optional: only allow dragging from a specific handle
      >
        {widgets.map(widget => (
          <div key={widget.id} data-grid={widget.layout}>
            <Widget
              id={widget.id}
              type={widget.widget_type}
              title={widget.config.title}
              config={widget.config}
              onRemove={handleRemoveWidget}
            />
          </div>
        ))}
      </ResponsiveGridLayout>
      
      {widgets.length === 0 && (
          <div className="text-center py-24 border-2 border-dashed border-slate-200 rounded-xl">
              <LayoutGrid size={48} className="mx-auto text-slate-300 mb-4" />
              <h3 className="text-lg font-bold text-slate-600">Panel Vacío</h3>
              <p className="text-sm text-slate-400 mb-6">Añade tu primer widget para empezar a visualizar tus datos.</p>
              <button onClick={() => handleAddWidget('s-curve')} className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-bold">Añadir Widget de Curva S</button>
          </div>
      )}
    </div>
  );
}
