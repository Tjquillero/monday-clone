'use client';

import dynamic from 'next/dynamic';

// Explicitly use default imports for all widgets since they use 'export default'
const SCurveWidget = dynamic(() => import('./SCurveWidget').then(mod => mod.default), {
  loading: () => <div className="animate-pulse bg-slate-50 h-full w-full rounded-2xl" />,
  ssr: false
});

const BudgetExecutionWidget = dynamic(() => import('./BudgetExecutionWidget').then(mod => mod.default), {
  loading: () => <div className="animate-pulse bg-slate-50 h-full w-full rounded-2xl" />,
  ssr: false
});

const FinancialWidget = dynamic(() => import('./FinancialWidget').then(mod => mod.default), {
  loading: () => <div className="animate-pulse bg-slate-50 h-full w-full rounded-2xl" />,
  ssr: false
});

const ResourceEfficiencyWidget = dynamic(() => import('./ResourceEfficiencyWidget').then(mod => mod.default), {
  loading: () => <div className="animate-pulse bg-slate-50 h-full w-full rounded-2xl" />,
  ssr: false
});

export const WIDGET_COMPONENTS: Record<string, React.ComponentType<any>> = {
  'scurve': SCurveWidget,
  'budget-execution': BudgetExecutionWidget,
  'financial': FinancialWidget,
  'efficiency': ResourceEfficiencyWidget,
};

export const WIDGET_TITLES: Record<string, string> = {
  'scurve': 'Curva S de Avance',
  'budget-execution': 'Ejecución Presupuestaria',
  'financial': 'Estado Financiero',
  'efficiency': 'Eficiencia de Recursos',
};

export function renderWidget(type: string, props: any) {
  const Component = WIDGET_COMPONENTS[type];
  if (!Component) return (
    <div className="h-full flex items-center justify-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
      <div className="text-center">
        <p className="text-slate-400 text-sm font-medium italic">Widget no encontrado</p>
        <p className="text-slate-300 text-[10px] uppercase font-black tracking-widest mt-1">{type}</p>
      </div>
    </div>
  );
  return <Component {...props} />;
}
