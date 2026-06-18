import React from 'react';
import { Package, DollarSign, Activity, TrendingUp, BarChart2, AlertCircle } from 'lucide-react';

export default function InsumosDashboard() {
  const kpis = [
    { title: 'Total Insumos', value: '1,245', icon: Package, trend: '+5.2%' },
    { title: 'Costo Ejecutado', value: '$124,500', icon: DollarSign, trend: '+2.1%' },
    { title: 'Materiales Críticos', value: '18', icon: AlertCircle, trend: '+12%' },
    { title: 'Rendimiento Promedio', value: '94%', icon: Activity, trend: '+1.5%' },
  ];

  const recentActivity = [
    { id: 1, action: 'Actualización de precio', item: 'Cemento Portland', date: 'Hace 2 horas', type: 'neutral' },
    { id: 2, action: 'Bajo stock detectado', item: 'Varilla de Acero 1/2"', date: 'Hace 4 horas', type: 'critical' },
    { id: 3, action: 'Nuevo ingreso', item: 'Arena Fina', date: 'Ayer', type: 'positive' },
    { id: 4, action: 'Ajuste de presupuesto', item: 'Pintura Blanca', date: 'Ayer', type: 'neutral' },
  ];

  return (
    <div className="p-6 md:p-10 bg-[#fafafa] min-h-screen font-sans selection:bg-slate-900 selection:text-white">
      <div className="mb-12 flex flex-col md:flex-row md:items-end md:justify-between gap-6 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900">Variables de Control</h1>
          <p className="text-sm md:text-base text-slate-500 mt-2 max-w-lg leading-relaxed">Monitoreo de insumos, materiales y fluctuaciones de costos operativos.</p>
        </div>
        <div className="flex gap-3">
          <button className="bg-white border-2 border-slate-200 hover:border-slate-900 text-slate-900 px-5 py-2.5 text-sm font-bold transition-all shadow-[0_2px_0_0_rgba(15,23,42,0.1)] hover:shadow-none translate-y-0 hover:translate-y-[2px]">
            Reporte
          </button>
          <button className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 text-sm font-bold transition-all shadow-[0_2px_0_0_rgba(15,23,42,0.2)] hover:shadow-none translate-y-0 hover:translate-y-[2px] flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Análisis
          </button>
        </div>
      </div>

      {/* KPI Cards - Minimalist/High Contrast */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-12">
        {kpis.map((kpi, index) => (
          <div key={index} className="bg-white p-6 border-2 border-slate-200 hover:border-slate-900 transition-colors flex flex-col justify-between min-h-[140px]">
            <div className="flex justify-between items-start mb-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{kpi.title}</p>
              <kpi.icon className="w-5 h-5 text-slate-900" strokeWidth={2.5} />
            </div>
            <div className="flex items-end justify-between">
              <h3 className="text-3xl font-black tracking-tighter text-slate-900">{kpi.value}</h3>
              <span className={`text-[10px] uppercase font-bold px-2 py-1 ${kpi.trend.startsWith('+') ? 'bg-slate-100 text-slate-900' : 'bg-red-50 text-red-700'}`}>
                {kpi.trend}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Charts and Activity Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 md:gap-12">
        {/* Main Chart Placeholder */}
        <div className="lg:col-span-2 flex flex-col">
          <div className="flex justify-between items-end mb-6 border-b border-slate-200 pb-2">
            <h2 className="text-lg font-bold text-slate-900">Evolución de Costos</h2>
            <select className="text-xs font-bold uppercase tracking-wider bg-transparent border-none text-slate-500 hover:text-slate-900 cursor-pointer outline-none pb-1">
              <option>Últimos 30 días</option>
              <option>Este mes</option>
              <option>Este año</option>
            </select>
          </div>
          <div className="flex-1 min-h-[300px] flex items-center justify-center bg-white border-2 border-slate-100 hover:border-slate-300 transition-colors group">
            <div className="text-center">
              <BarChart2 className="w-10 h-10 mx-auto mb-4 text-[var(--text-primary)] group-hover:text-slate-500 transition-colors" strokeWidth={1.5} />
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Gráfico de Evolución</p>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="flex flex-col">
          <div className="flex justify-between items-end mb-6 border-b border-slate-200 pb-2">
            <h2 className="text-lg font-bold text-slate-900">Actividad</h2>
            <button className="text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-900 pb-1">Ver todo</button>
          </div>
          <div className="space-y-0">
            {recentActivity.map((activity, idx) => (
              <div key={activity.id} className={`p-4 flex flex-col justify-center border-b border-slate-100 hover:bg-white transition-colors cursor-default ${idx === 0 ? 'border-t border-slate-100' : ''}`}>
                <div className="flex justify-between items-start mb-1.5">
                  <p className="text-sm font-bold text-slate-900">{activity.action}</p>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">{activity.date}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-none ${activity.type === 'critical' ? 'bg-red-500' : activity.type === 'positive' ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                  <p className="text-xs text-slate-500 font-medium">{activity.item}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
