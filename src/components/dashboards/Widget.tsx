'use client';

import { MoreHorizontal, Trash2 } from 'lucide-react';
import { memo } from 'react';

// Import specific widget components
import SCurveWidget from './SCurveWidget';
import BudgetExecutionWidget from './BudgetExecutionWidget';
import CostDeviationWidget from './CostDeviationWidget';
// We will add more widget types here in the future

export type WidgetType = 's-curve' | 'budget-execution' | 'cost-deviation' | 'tasks-list';

interface WidgetProps {
  id: string;
  type: WidgetType;
  title: string;
  // 'config' can hold specific settings for each widget, e.g., filter criteria
  config?: any; 
  onRemove: (widgetId: string) => void;
}

const WIDGET_COMPONENTS: Record<WidgetType, React.ComponentType<any>> = {
  's-curve': SCurveWidget,
  'budget-execution': BudgetExecutionWidget,
  'cost-deviation': CostDeviationWidget,
  'tasks-list': () => <div className="p-4">Tasks List Widget (Not Implemented)</div>, // Placeholder
};

const Widget = memo(function Widget({ id, type, title, config, onRemove }: WidgetProps) {
  const SpecificWidgetComponent = WIDGET_COMPONENTS[type];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full flex flex-col">
      {/* Widget Header */}
      <div className="p-4 border-b border-slate-100 flex justify-between items-center flex-shrink-0">
        <h3 className="text-sm font-bold text-slate-800 truncate">{title}</h3>
        <div className="relative group">
          <button className="p-1 text-slate-400 hover:bg-slate-100 rounded">
            <MoreHorizontal size={16} />
          </button>
          <div className="absolute top-full right-0 mt-1 w-40 bg-white rounded-lg shadow-xl border border-slate-100 py-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
            <button 
              onClick={() => onRemove(id)}
              className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center"
            >
              <Trash2 size={14} className="mr-2" />
              Eliminar Widget
            </button>
          </div>
        </div>
      </div>

      {/* Widget Body */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        {SpecificWidgetComponent ? (
          <SpecificWidgetComponent {...config} />
        ) : (
          <div className="p-4 text-center text-slate-400">
            Widget de tipo &quot;{type}&quot; no reconocido.
          </div>
        )}
      </div>
    </div>
  );
});

export default Widget;
