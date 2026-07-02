'use client';

// ============================================================================
// LEGACY — eliminado de la navegación el 2026-07-01 (era la pestaña "Ops").
// NO volver a conectar a la navegación. Pendiente decidir si se consolida
// con el Cronograma (planner) o se elimina. Ver src/config/navigation.ts.
// ============================================================================

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  GitGraph, Target, LayoutGrid, Clock, Users, 
  TrendingUp, AlertTriangle, CheckCircle2, 
  Calendar as CalendarIcon, Filter, Layers, 
  Activity, Gauge, Zap, ChevronRight, BarChart3,
  CalendarDays, Flame, MousePointer2
} from 'lucide-react';
import { Group, Item, Column } from '@/types/monday';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, BarChart, Bar, Cell 
} from 'recharts';

interface TacticalOperationsViewProps {
  groups: Group[];
  columns: Column[];
  onOpenItem?: (groupId: string, item: Item) => void;
  onUpdateItemValue?: (groupId: string, itemId: string | number, columnId: string, value: any) => void;
}

type TabType = 'kpis' | 'timeline' | 'heatmap' | 'kanban' | 'scurve';

export default function TacticalOperationsView({ 
  groups, 
  columns, 
  onOpenItem,
  onUpdateItemValue 
}: TacticalOperationsViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>('kpis');

  // Core Metrics Calculation
  const metrics = useMemo(() => {
    let totalItems = 0;
    let completedItems = 0;
    let totalJornales = 0;
    let completedJornales = 0;
    const siteProgress: any[] = [];
    const statusCounts: Record<string, number> = { 'Pending': 0, 'In Progress': 0, 'Done': 0, 'Stuck': 0 };
    
    groups.forEach(group => {
      let groupTotal = 0;
      let groupDone = 0;
      
      group.items.forEach(item => {
        totalItems++;
        const cant = parseFloat(item.values['cant'] || '0');
        const rend = parseFloat(item.values['rend'] || '1');
        const jor = cant / rend;
        totalJornales += jor;
        
        const exec = item.values['daily_execution'] || {};
        const doneVal = Object.values(exec).reduce((acc: number, v: any) => acc + (typeof v === 'object' ? (parseFloat(v.val) || 0) : (parseFloat(v) || 0)), 0);
        completedJornales += Math.min(jor, doneVal);
        
        groupTotal += jor;
        groupDone += Math.min(jor, doneVal);

        const status = item.values['status'] || 'Pending';
        if (status.includes('Listo') || status.includes('Done')) {
            completedItems++;
            statusCounts['Done']++;
        } else if (status.includes('proceso') || status.includes('Working')) {
            statusCounts['In Progress']++;
        } else if (status.includes('Detenido') || status.includes('Stuck')) {
            statusCounts['Stuck']++;
        } else {
            statusCounts['Pending']++;
        }
      });

      siteProgress.push({
        name: group.title,
        progress: groupTotal > 0 ? Math.round((groupDone / groupTotal) * 100) : 0,
        total: Math.round(groupTotal),
        done: Math.round(groupDone),
        color: group.color
      });
    });

    return {
      totalItems,
      completedItems,
      totalJornales,
      completedJornales,
      globalProgress: totalJornales > 0 ? Math.round((completedJornales / totalJornales) * 100) : 0,
      siteProgress: siteProgress.sort((a, b) => b.progress - a.progress),
      statusCounts
    };
  }, [groups]);

  // S-Curve Data Generation (Simulated for visualization)
  const scurveData = useMemo(() => {
    const data = [];
    let cumulativePlanned = 0;
    let cumulativeReal = 0;
    const today = new Date().getDate();

    for (let i = 1; i <= 31; i++) {
        const plannedGrowth = Math.pow(i/31, 2) * 100;
        cumulativePlanned = plannedGrowth;
        
        if (i <= today) {
            // Real progress slightly lower than planned for effect
            cumulativeReal = plannedGrowth * (0.8 + Math.random() * 0.1);
        } else {
            cumulativeReal = null as any;
        }

        data.push({
            day: i,
            planned: Math.round(cumulativePlanned),
            real: cumulativeReal !== null ? Math.round(cumulativeReal) : null
        });
    }
    return data;
  }, []);

  return (
    <div className="flex flex-col h-full bg-[var(--bg-primary)] font-sans overflow-hidden">
      {/* Tactical Sub-Header */}
      <div className="px-8 py-5 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]/30 backdrop-blur-md flex items-center justify-between shrink-0">
         <div className="flex items-center space-x-8">
            <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#3B7EF8]/10 border border-[#3B7EF8]/20 flex items-center justify-center text-[#3B7EF8]">
                    <GitGraph className="w-5 h-5" />
                </div>
                <div>
                   <h2 className="text-lg font-black text-white uppercase tracking-tighter italic">Tactical_Operations</h2>
                   <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.2em]">Operational Monitoring Dashboard v2.0</p>
                </div>
            </div>

            <div className="h-8 w-px bg-slate-500/5" />

            {/* View Selectors */}
            <div className="flex bg-[var(--bg-primary)] p-1 rounded-xl border border-[var(--border-color)] shadow-inner scale-95">
                {[
                    { id: 'kpis', icon: Gauge, label: 'Resumen KPI' },
                    { id: 'timeline', icon: Clock, label: 'Cronograma' },
                    { id: 'heatmap', icon: Flame, label: 'Heatmap' },
                    { id: 'kanban', icon: LayoutGrid, label: 'Flujo Estado' },
                    { id: 'scurve', icon: BarChart3, label: 'Curva-S' },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as TabType)}
                        className={`flex items-center gap-2.5 px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-[#3B7EF8] text-white shadow-xl shadow-[#3B7EF8]/20 ring-1 ring-white/20' : 'text-slate-600 hover:text-slate-400'}`}
                    >
                        <tab.icon className="w-3.5 h-3.5" />
                        <span className="hidden md:inline">{tab.label}</span>
                    </button>
                ))}
            </div>
         </div>

         <div className="flex items-center gap-4">
            <div className="px-4 py-2 bg-slate-500/5 border border-[var(--border-color)] rounded-xl flex items-center gap-3">
                <Users className="w-4 h-4 text-[#3B7EF8]" />
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{metrics.totalItems} Activos</span>
            </div>
            <button className="p-2.5 bg-slate-500/5 border border-[var(--border-color)] rounded-xl text-slate-500 hover:text-white transition-all">
                <Filter className="w-4 h-4" />
            </button>
         </div>
      </div>

      {/* Main Viewport */}
      <div className="flex-1 overflow-hidden relative">
         <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full overflow-y-auto custom-scrollbar p-8"
            >
               {activeTab === 'kpis' && (
                  <div className="space-y-8 max-w-[1400px] mx-auto">
                     {/* Global Efficiency Grid */}
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <KPIColCard label="Eficiencia Global" value={metrics.globalProgress} suffix="%" icon={TrendingUp} color="#3B7EF8" />
                        <KPIColCard label="Jornales Ejecutados" value={Math.round(metrics.completedJornales)} suffix={`/ ${Math.round(metrics.totalJornales)}`} icon={MousePointer2} color="#10B981" />
                        <KPIColCard label="Alertas Críticas" value={metrics.statusCounts['Stuck']} icon={AlertTriangle} color="#F43F5E" />
                        <KPIColCard label="Hitos Completados" value={metrics.completedItems} icon={CheckCircle2} color="#8B5CF6" />
                     </div>

                     {/* Site Performance Breakdown */}
                     <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Site Progress Bars */}
                        <div className="lg:col-span-2 industrial-card p-8 rounded-[2.5rem]">
                            <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.3em] mb-8 flex items-center gap-3">
                                <Target className="w-4 h-4 text-[#3B7EF8]" /> Avance_Por_Sitio
                            </h3>
                            <div className="space-y-6">
                                {metrics.siteProgress.slice(0, 8).map((site, idx) => (
                                    <div key={`site-progress-${site.name}`}>
                                        <div className="flex justify-between items-end mb-2 px-1">
                                            <span className="text-[11px] font-black text-[var(--text-primary)] uppercase tracking-wide flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: site.color }} />
                                                {site.name}
                                            </span>
                                            <span className="text-[10px] font-mono font-black text-slate-500">
                                                {site.done} / {site.total} JOR <span className="ml-2 text-[#3B7EF8]">{site.progress}%</span>
                                            </span>
                                        </div>
                                        <div className="h-2 bg-slate-500/5 rounded-full overflow-hidden border border-[var(--border-color)]">
                                            <motion.div 
                                                initial={{ width: 0 }}
                                                animate={{ width: `${site.progress}%` }}
                                                className={`h-full bg-gradient-to-r ${site.progress >= 90 ? 'from-[#10B981] to-emerald-400' : 'from-[#3B7EF8] to-blue-400'} shadow-[0_0_10px_rgba(59,126,248,0.3)]`}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Status Distribution */}
                        <div className="industrial-card p-8 rounded-[2.5rem]">
                            <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.3em] mb-8 flex items-center gap-3">
                                <Layers className="w-4 h-4 text-emerald-500" /> Distribución_Flujo
                            </h3>
                            <div className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={[
                                        { name: 'Pendiente', val: metrics.statusCounts['Pending'], color: '#475569' },
                                        { name: 'Activo', val: metrics.statusCounts['In Progress'], color: '#3B7EF8' },
                                        { name: 'Crítico', val: metrics.statusCounts['Stuck'], color: '#F43F5E' },
                                        { name: 'Completado', val: metrics.statusCounts['Done'], color: '#10B981' },
                                    ]}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                        <XAxis dataKey="name" stroke="#64748b" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} />
                                        <Tooltip 
                                            contentStyle={{ backgroundColor: '#161B30', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                                            itemStyle={{ color: '#fff', fontSize: '10px', fontWeight: '900' }}
                                        />
                                        <Bar dataKey="val" radius={[8, 8, 0, 0]}>
                                            {
                                                [0,1,2,3].map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={['#475569', '#3B7EF8', '#F43F5E', '#10B981'][index]} />
                                                ))
                                            }
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                     </div>
                  </div>
               )}

               {activeTab === 'scurve' && (
                  <div className="industrial-card p-10 rounded-[3rem] h-[600px] max-w-[1400px] mx-auto overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-10">
                        <div className="flex gap-6">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded bg-slate-700" />
                                <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Planificado</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded bg-[#3B7EF8]" />
                                <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Ejecución Real</span>
                            </div>
                        </div>
                    </div>
                    
                    <h3 className="text-xl font-black text-white uppercase italic tracking-tighter mb-2">Monitor_CurvaS</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.3em] mb-10">Análisis acumulado de avance operativo</p>
                    
                    <div className="h-full pb-20">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={scurveData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorReal" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3B7EF8" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#3B7EF8" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="5 5" stroke="rgba(255,255,255,0.03)" vertical={false} />
                                <XAxis dataKey="day" stroke="#475569" fontSize={10} fontWeight="900" axisLine={false} tickLine={false} label={{ value: 'Días del Mes', position: 'insideBottom', offset: -10, fill: '#475569', fontSize: 10, fontWeight: 'bold' }} />
                                <YAxis stroke="#475569" fontSize={10} fontWeight="900" axisLine={false} tickLine={false} label={{ value: '% Avance', angle: -90, position: 'insideLeft', fill: '#475569', fontSize: 10, fontWeight: 'bold' }} />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: '#0C0F1A', border: '1px solid rgba(59,126,248,0.2)', borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}
                                    itemStyle={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' }}
                                />
                                <Area type="monotone" dataKey="planned" stroke="#475569" strokeWidth={2} fill="transparent" strokeDasharray="8 8" />
                                <Area type="monotone" dataKey="real" stroke="#3B7EF8" strokeWidth={4} fillOpacity={1} fill="url(#colorReal)" animationDuration={2000} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                  </div>
               )}

               {activeTab === 'timeline' && (
                  <div className="industrial-card rounded-[2.5rem] overflow-hidden flex flex-col h-full border border-[var(--border-color)]">
                     <div className="p-6 border-b border-[var(--border-color)] flex items-center justify-between bg-slate-500/5">
                        <div className="flex items-center gap-3">
                           <CalendarDays className="w-5 h-5 text-[#3B7EF8]" />
                           <h3 className="text-xs font-black text-white uppercase tracking-widest">Cronograma_Agrupado</h3>
                        </div>
                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Nivel de Zoom: Semanal</div>
                     </div>
                     <div className="flex-1 overflow-auto p-6 scrollbar-hide">
                        <div className="min-w-[800px] space-y-4">
                           {groups.map((group, gIdx) => {
                              const groupStart = 5 + (gIdx * 3); // Simulated
                              const groupWidth = 20 + Math.random() * 40;
                              return (
                                <div key={group.id} className="group/tl py-4 border-b border-white/[0.03] hover:bg-white/[0.01] transition-colors rounded-xl px-4 flex items-center">
                                    <div className="w-64 shrink-0 flex flex-col">
                                        <span className="text-[11px] font-black text-[var(--text-primary)] uppercase tracking-wider">{group.title}</span>
                                        <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest mt-1">{group.items.length} Actividades Activas</span>
                                    </div>
                                    <div className="flex-1 relative h-6 bg-white/[0.02] rounded-full">
                                        <motion.div 
                                            initial={{ width: 0, x: `${groupStart}%` }}
                                            animate={{ width: `${groupWidth}%`, x: `${groupStart}%` }}
                                            className="absolute h-full rounded-full border border-[var(--border-color)] shadow-lg flex items-center px-4"
                                            style={{ backgroundColor: group.color + '40', borderLeftColor: group.color, borderLeftWidth: '4px' }}
                                        >
                                            <span className="text-[8px] font-black text-white/40 uppercase tracking-[0.2em] whitespace-nowrap overflow-hidden">Sequence_Active</span>
                                        </motion.div>
                                    </div>
                                    <div className="w-20 shrink-0 flex justify-end">
                                        <button className="w-8 h-8 rounded-lg bg-slate-500/5 flex items-center justify-center text-slate-600 hover:text-white transition-all">
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                              );
                           })}
                        </div>
                     </div>
                  </div>
               )}

               {activeTab === 'heatmap' && (
                   <div className="space-y-8">
                       <div className="industrial-card p-10 rounded-[3rem]">
                           <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.3em] mb-8 flex items-center gap-3">
                               <BarChart className="w-4 h-4 text-amber-500" /> Carga_Recursos_Heatmap
                           </h3>
                           <div className="grid grid-cols-7 gap-4">
                               {['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'].map(d => (
                                   <div key={d} className="text-center text-[9px] font-black text-slate-700 uppercase mb-2">{d}</div>
                               ))}
                               {Array.from({ length: 28 }).map((_, i) => {
                                   const intensity = Math.random();
                                   const color = intensity > 0.8 ? 'bg-rose-500' : intensity > 0.5 ? 'bg-[#3B7EF8]' : 'bg-slate-800';
                                   const glow = intensity > 0.8 ? 'shadow-[0_0_15px_#f43f5e]' : '';
                                   return (
                                       <motion.div 
                                           key={`heatmap-day-${i}`}
                                           whileHover={{ scale: 1.1, zIndex: 50 }}
                                           className={`aspect-square rounded-xl ${color} ${glow} border border-[var(--border-color)] flex items-center justify-center relative cursor-pointer group`}
                                       >
                                           <span className="text-[10px] font-black text-white/20 group-hover:text-white">{i + 1}</span>
                                           <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl" />
                                       </motion.div>
                                   );
                               })}
                           </div>
                       </div>
                   </div>
               )}

               {activeTab === 'kanban' && (
                   <div className="h-full flex gap-6 overflow-x-auto pb-10 scrollbar-hide">
                       {['Pendiente', 'En Ejecución', 'Detenido', 'Listo'].map(status => {
                           const items = groups.flatMap(g => g.items).filter(it => (it.values['status'] || 'Pendiente').includes(status)).slice(0, 5);
                           return (
                               <div key={status} className="w-[320px] shrink-0 flex flex-col min-h-0">
                                   <div className="flex items-center justify-between mb-4 px-2">
                                       <div className="flex items-center gap-3">
                                           <div className={`w-2 h-2 rounded-full ${status === 'Listo' ? 'bg-emerald-500' : status === 'Detenido' ? 'bg-rose-500' : 'bg-[#3B7EF8]'}`} />
                                           <span className="text-[10px] font-black uppercase text-white tracking-widest">{status}</span>
                                       </div>
                                       <span className="text-[10px] font-black text-slate-600 bg-slate-500/5 px-2 py-0.5 rounded-md">{items.length}</span>
                                   </div>
                                   <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar pr-2">
                                       {items.map(item => (
                                           <div 
                                              key={item.id} 
                                              onClick={() => onOpenItem?.(item.group_id as string, item)}
                                              className="industrial-card p-4 rounded-2xl border border-[var(--border-color)] hover:border-[#3B7EF8]/40 transition-all cursor-pointer group"
                                           >
                                               <div className="flex justify-between items-start mb-3">
                                                   <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{item.values['category'] || 'General'}</span>
                                                   <div className="w-6 h-6 rounded-lg bg-slate-500/5 flex items-center justify-center text-slate-600 group-hover:text-[#3B7EF8]">
                                                       <Activity className="w-3.5 h-3.5" />
                                                   </div>
                                               </div>
                                               <h4 className="text-[12px] font-bold text-[var(--text-primary)] line-clamp-2 uppercase tracking-tight leading-snug">{item.name}</h4>
                                               <div className="mt-4 pt-3 border-t border-[var(--border-color)] flex justify-between items-center">
                                                   <div className="flex -space-x-1.5">
                                                        <div className="w-6 h-6 rounded-full bg-slate-800 border border-[var(--border-color)] flex items-center justify-center text-[7px] font-black">OP</div>
                                                   </div>
                                                   <span className="text-[8px] font-mono text-slate-600">ID_9281</span>
                                               </div>
                                           </div>
                                       ))}
                                   </div>
                               </div>
                           );
                       })}
                   </div>
               )}
            </motion.div>
         </AnimatePresence>
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(59, 126, 248, 0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
      `}</style>
    </div>
  );
}

function KPIColCard({ label, value, suffix = "", icon: Icon, color }: { label: string, value: number | string, suffix?: string, icon: any, color: string }) {
    return (
        <div className="industrial-card p-8 rounded-[2.5rem] group relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                <Icon className="w-12 h-12" style={{ color }} />
            </div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-4">{label}</p>
            <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black italic tracking-tighter text-white">{value}</span>
                {suffix && <span className="text-xs font-black text-slate-500 uppercase tracking-widest">{suffix}</span>}
            </div>
            <div className="mt-6 flex items-center gap-2">
                <div className="w-1 h-3 rounded-full bg-emerald-500/50" />
                <span className="text-[8px] font-bold text-emerald-500/60 uppercase tracking-widest">Tendencia Positiva</span>
            </div>
        </div>
    );
}
