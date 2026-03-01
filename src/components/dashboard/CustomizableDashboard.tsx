'use client';

import { useState, useMemo } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import { useDashboard, DashboardWidget } from '@/hooks/useDashboard';
import { renderWidget, WIDGET_TITLES } from './WidgetRegistry';
import { Plus, Trash2, Layout, Save, Settings2, X } from 'lucide-react';
import { Group, Column } from '@/types/monday';

const ResponsiveGridLayout = WidthProvider(Responsive);

interface CustomizableDashboardProps {
  boardId: string;
  groups: Group[];
  columns: Column[];
}

export function CustomizableDashboard({ boardId, groups, columns }: CustomizableDashboardProps) {
  const { dashboards, useWidgets, addWidget, updateLayouts, deleteWidget, createDashboard } = useDashboard(boardId);
  const activeDashboard = dashboards?.[0]; // For MVP, use the first one
  const { data: widgets, isLoading: loadingWidgets } = useWidgets(activeDashboard?.id);
  
  const [isEditing, setIsEditing] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);

  const layouts = useMemo(() => {
    if (!widgets) return { lg: [] };
    return {
      lg: widgets.map(w => ({
        i: w.id,
        x: w.layout.x,
        y: w.layout.y,
        w: w.layout.w,
        h: w.layout.h,
      }))
    };
  }, [widgets]);

  const handleLayoutChange = (currentLayout: any) => {
    if (!isEditing || !activeDashboard) return;
    
    const updates = currentLayout.map((l: any) => ({
      id: l.i,
      layout: { x: l.x, y: l.y, w: l.w, h: l.h }
    }));

    updateLayouts.mutate({ dashboardId: activeDashboard.id, layouts: updates });
  };

  const handleAddWidget = async (type: string) => {
    if (!activeDashboard) {
      const newDash = await createDashboard.mutateAsync('Mi Panel de Control');
      await addWidget.mutateAsync({
        dashboardId: newDash.id,
        type,
        title: WIDGET_TITLES[type],
        layout: { x: 0, y: 0, w: 6, h: 4 }
      });
    } else {
      await addWidget.mutateAsync({
        dashboardId: activeDashboard.id,
        type,
        title: WIDGET_TITLES[type],
        layout: { x: 0, y: 100, w: 6, h: 4 } // Add at bottom-ish
      });
    }
    setShowAddMenu(false);
  };

  if (loadingWidgets) return (
     <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
     </div>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f8fafc]/50">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary shadow-sm">
            <Layout size={20} />
          </div>
          <div>
            <h2 className="text-slate-900 font-bold text-lg">{activeDashboard?.name || 'Dashboard Principal'}</h2>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-widest">Panel Personalizable</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsEditing(!isEditing)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border ${isEditing ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' : 'bg-white text-slate-600 border-slate-200 hover:border-primary hover:text-primary'}`}
          >
            {isEditing ? <Save size={16} /> : <Settings2 size={16} />}
            {isEditing ? 'Guardar Cambios' : 'Personalizar'}
          </button>
          
          <div className="relative">
            <button 
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10"
            >
              <Plus size={16} />
              Añadir Widget
            </button>

            {showAddMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-100 p-2 z-50">
                <div className="px-3 py-2 border-b border-slate-50 mb-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Elegir Widget</p>
                </div>
                {Object.keys(WIDGET_TITLES).map(type => (
                  <button 
                    key={type}
                    onClick={() => handleAddWidget(type)}
                    className="w-full text-left px-3 py-2.5 hover:bg-slate-50 rounded-xl text-sm font-bold text-slate-700 transition-colors flex items-center gap-3"
                  >
                    <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400">
                      <Plus size={14} />
                    </div>
                    {WIDGET_TITLES[type]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Grid Area */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {!widgets || widgets.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-12">
            <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-200 mb-6">
              <Layout size={40} />
            </div>
            <h3 className="text-slate-900 font-bold text-xl mb-2">Tu panel está vacío</h3>
            <p className="text-slate-400 text-sm max-w-xs mb-8 font-medium">Empieza a construir tu tablero ideal añadiendo widgets de control financiero y de gestión.</p>
            <button 
              onClick={() => setShowAddMenu(true)}
              className="px-8 py-3 bg-primary text-white rounded-2xl font-bold shadow-xl shadow-primary/20 hover:scale-105 transition-transform"
            >
              Añadir mi primer widget
            </button>
          </div>
        ) : (
          <ResponsiveGridLayout
            className="layout"
            layouts={layouts}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
            rowHeight={100}
            isDraggable={isEditing}
            isResizable={isEditing}
            onLayoutChange={handleLayoutChange}
            draggableHandle=".widget-drag-handle"
            margin={[16, 16]}
          >
            {widgets.map((widget) => (
              <div key={widget.id} className="relative group">
                <div className="h-full flex flex-col bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
                  {/* Widget Toolbar (Visible in Editing Mode) */}
                  <div className={`absolute top-4 right-4 flex gap-1 z-10 transition-opacity ${isEditing ? 'opacity-100' : 'opacity-0 pointer-events-none group-hover:opacity-100'}`}>
                    <button 
                      onClick={() => deleteWidget.mutate({ widgetId: widget.id, dashboardId: activeDashboard!.id })}
                      className="p-2 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-100 transition-colors shadow-sm"
                      title="Eliminar Widget"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Drag Handle (Full header in Edit mode) */}
                  <div className={`p-4 bg-white/50 backdrop-blur-sm border-b border-slate-50/50 flex items-center gap-3 ${isEditing ? 'cursor-move widget-drag-handle' : ''}`}>
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <h4 className="text-slate-900 font-black text-[10px] uppercase tracking-widest">{widget.title}</h4>
                  </div>

                  <div className="flex-1 min-h-0 relative">
                    {renderWidget(widget.type, { 
                      groups, 
                      columns, 
                      ...widget.config,
                      hideSelector: true // Let the dashboard manage filters later
                    })}
                  </div>
                </div>
              </div>
            ))}
          </ResponsiveGridLayout>
        )}
      </div>
    </div>
  );
}
