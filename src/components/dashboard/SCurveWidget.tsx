'use client';

import { useMemo, useState, useEffect } from 'react';
import { Group, Item, Column } from '@/types/monday';
import { format, eachWeekOfInterval, startOfWeek, endOfWeek, isAfter, isBefore, addWeeks, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { MapPin } from 'lucide-react';

interface SCurveWidgetProps {
  groups: Group[];
  columns: Column[];
  activeSiteId?: string;
  hideSelector?: boolean;
}

export default function SCurveWidget({ groups, columns, activeSiteId: propActiveSiteId, hideSelector }: SCurveWidgetProps) {
  const [mounted, setMounted] = useState(false);
  const [internalActiveSiteId, setInternalActiveSiteId] = useState<string>('all');
  
  const activeSiteId = propActiveSiteId !== undefined ? propActiveSiteId : internalActiveSiteId;

  useEffect(() => {
    setMounted(true);
  }, []);

  const { dataPoints, maxVal, totalProjectValue, currencyFormatter, currentPlanned, currentActual, variance, performance } = useMemo(() => {
    if (!mounted) return { dataPoints: [], maxVal: 0, totalProjectValue: 0, currencyFormatter: { format: (n: number) => n.toString() }, currentPlanned: 0, currentActual: 0, variance: 0, performance: 0 };
    
    // Filter Groups based on Active Site
    const filteredGroups = (activeSiteId === 'all') 
        ? groups 
        : groups.filter(g => g.id === activeSiteId);

    // Dynamic Column Mapping
    // Dynamic Column Mapping
    const timelineCol = columns.find(c => c.type === 'timeline' || c.type === 'date' || ['cronograma', 'fecha', 'timeline'].some(term => c.title.toLowerCase().includes(term))) || { id: 'timeline' };
    const priceCol = columns.find(c => ['precio', 'unit_price', 'costo', 'valor'].some(term => c.id === term || c.title.toLowerCase().includes(term))) || { id: 'unit_price' };
    const qtyCol = columns.find(c => ['cant', 'm2', 'volumen', 'metrado'].some(term => c.id === term || c.title.toLowerCase().includes(term))) || { id: 'cant' };

    let minDate = new Date();
    let maxDate = new Date();
    let hasDates = false;

    const processItemForDates = (item: Item) => {
        if (item.subItems && item.subItems.length > 0) {
            item.subItems.forEach(sub => processItemForDates(sub));
            return;
        }
        
        const tVal = item.values[timelineCol.id] || item.values['timeline'];
        const startStr = typeof tVal === 'object' ? tVal?.from : tVal;
        const endStr = typeof tVal === 'object' ? tVal?.to : tVal;
        
        const start = startStr ? new Date(startStr) : null;
        const end = endStr ? new Date(endStr) : null;

        if (start && !isNaN(start.getTime())) {
            if (!hasDates || start < minDate) minDate = start;
            hasDates = true;
        }
        if (end && !isNaN(end.getTime())) {
            if (!hasDates || end > maxDate) maxDate = end;
            hasDates = true;
        }

        // Also check actual execution dates
        const dailyExec = item.values['daily_execution'] || {};
        Object.keys(dailyExec).forEach(dateStr => {
             if (!dateStr.includes('-')) return;
             const d = parseISO(dateStr);
             if (!isNaN(d.getTime())) {
                 if (!hasDates || d < minDate) minDate = d;
                 if (!hasDates || d > maxDate) maxDate = d;
                 hasDates = true;
             }
        });
    };
    
    filteredGroups.forEach(g => g.items.forEach(item => processItemForDates(item)));

    if (!hasDates) {
        minDate = startOfWeek(new Date());
        maxDate = addWeeks(endOfWeek(new Date()), 8);
    } else {
        minDate = startOfWeek(minDate);
        maxDate = addWeeks(endOfWeek(maxDate), 2);
    }

    const weeks = eachWeekOfInterval({ start: minDate, end: maxDate });
    
    let cumulativePlanned = 0;
    let cumulativeActual = 0;
    let totalProjectValue = 0;

    const calculateTotalValue = (item: Item) => {
         if (item.subItems && item.subItems.length > 0) {
            item.subItems.forEach(sub => calculateTotalValue(sub));
            return;
        }
        const qty = parseFloat(item.values[qtyCol.id] || 0);
        const price = parseFloat(item.values[priceCol.id] || 0);
        totalProjectValue += (qty * price);
    };

    filteredGroups.forEach(g => g.items.forEach(item => calculateTotalValue(item)));
 
    const dataPoints = weeks.map(week => {
        let weeklyPlanned = 0;
        let weeklyActual = 0;

        const processItemForWeek = (item: Item) => {
            if (item.subItems && item.subItems.length > 0) {
                item.subItems.forEach(sub => processItemForWeek(sub));
                return;
            }

            const qty = parseFloat(item.values[qtyCol.id] || 0);
            const price = parseFloat(item.values[priceCol.id] || 0);
            const budget = qty * price;
            
            // Planned (Linear Distribution over timeline)
            const tVal = item.values[timelineCol.id] || item.values['timeline'];
            const startStr = typeof tVal === 'object' ? tVal?.from : tVal;
            const endStr = typeof tVal === 'object' ? tVal?.to : tVal;
            const start = startStr ? new Date(startStr) : null;
            const end = endStr ? new Date(endStr) : null;

            if (start && !isNaN(start.getTime()) && budget > 0) {
                const endDate = (end && !isNaN(end.getTime())) ? end : start;
                const totalDuration = Math.max(endDate.getTime() - start.getTime(), 86400000); 
                const weekStart = week.getTime();
                const weekEnd = addWeeks(week, 1).getTime();

                const overlapStart = Math.max(start.getTime(), weekStart);
                const overlapEnd = Math.min(endDate.getTime(), weekEnd);
                
                if (overlapEnd > overlapStart) {
                    const ratio = (overlapEnd - overlapStart) / totalDuration;
                    weeklyPlanned += (budget * ratio);
                }
            }

            // Actual (From Daily Execution logs)
            const dailyExec = item.values['daily_execution'] || {};
            Object.keys(dailyExec).forEach(dateStr => {
                 const execDate = parseISO(dateStr);
                 if (!isNaN(execDate.getTime()) && isAfter(execDate, week) && isBefore(execDate, addWeeks(week, 1))) {
                     const val = dailyExec[dateStr];
                     const amount = typeof val === 'object' ? (val.val || 0) : parseFloat(val || 0);
                     weeklyActual += (amount * price);
                 }
            });
        };

        filteredGroups.forEach(g => g.items.forEach(item => processItemForWeek(item)));

        cumulativePlanned += weeklyPlanned;
        cumulativeActual += weeklyActual;

        return {
            date: format(week, 'd MMM/yy', { locale: es }),
            rawDate: week,
            planned: cumulativePlanned,
            actual: hasDates && week <= new Date() ? cumulativeActual : null
        };
    });

    const currencyFormatter = new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0
    });

    const maxVal = Math.max(cumulativePlanned, cumulativeActual, totalProjectValue);
    
    const today = new Date();
    const currentStatusPoint = dataPoints.filter(dp => dp.rawDate <= today).pop();
    const currentPlanned = currentStatusPoint ? currentStatusPoint.planned : 0;
    const currentActual = currentStatusPoint ? (currentStatusPoint.actual || 0) : 0;
    const variance = currentActual - currentPlanned;
    const performance = currentPlanned > 0 ? (currentActual / currentPlanned) * 100 : 0;

    return { dataPoints, maxVal, totalProjectValue, currencyFormatter, currentPlanned, currentActual, variance, performance };
  }, [groups, columns, activeSiteId]);

  if (!mounted || dataPoints.length === 0) return (
       <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-[400px] flex flex-col gap-4 font-sans">
            <div className="flex justify-between items-center border-b border-gray-100 pb-4">
                 <h3 className="text-gray-700 font-bold flex items-center gap-2">
                    <MapPin size={18} className="text-primary" />
                    Curva S Financiera
                 </h3>
                 <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button onClick={() => setInternalActiveSiteId('all')} className={`px-3 py-1 rounded text-xs font-bold ${activeSiteId === 'all' ? 'bg-white shadow text-primary' : 'text-gray-500'}`}>Todos</button>
                    {groups.map(g => (
                        <button key={g.id} onClick={() => setInternalActiveSiteId(g.id)} className={`px-3 py-1 rounded text-xs font-bold ${activeSiteId === g.id ? 'bg-white shadow text-primary' : 'text-gray-500'}`}>
                            {g.title}
                        </button>
                    ))}
                 </div>
            </div>
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                No hay datos de cronograma para este sitio.
            </div>
       </div>
  );

  return (
    <div className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col h-[480px] font-sans">
        <div className="flex flex-col gap-6 border-b border-slate-100 pb-6 mb-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                     <h3 className="text-slate-900 font-black text-2xl tracking-tight flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-600 shadow-sm">
                            <MapPin size={20} />
                        </div>
                        {activeSiteId === 'all' ? 'Curva S: Global' : `Curva S: ${groups.find(g => g.id === activeSiteId)?.title}`}
                     </h3>
                     <p className="text-slate-400 text-sm font-medium mt-1">Comparativo de Valor Ganado (BCWP) vs Planeado (BCWS)</p>
                </div>
                
                {!hideSelector && (
                    <div className="flex bg-gray-100 p-1 rounded-lg overflow-x-auto no-scrollbar">
                        <button 
                            onClick={() => setInternalActiveSiteId('all')} 
                            className={`px-3 py-1.5 rounded-md text-xs font-bold whitespace-nowrap transition-all ${activeSiteId === 'all' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Todos
                        </button>
                        {groups.map(group => (
                            <button
                                key={group.id}
                                onClick={() => setInternalActiveSiteId(group.id)}
                                className={`px-3 py-1.5 rounded-md text-xs font-bold whitespace-nowrap transition-all ${activeSiteId === group.id ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                {group.title}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Financial Metrics Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-slate-400 text-[10px] uppercase font-black tracking-widest mb-1">Planeado (Hoy)</p>
                    <p className="text-slate-900 font-black text-lg">{currencyFormatter.format(currentPlanned)}</p>
                </div>
                <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100">
                    <p className="text-emerald-700/60 text-[10px] uppercase font-black tracking-widest mb-1">Ejecutado (Hoy)</p>
                    <p className="text-emerald-700 font-black text-lg">{currencyFormatter.format(currentActual)}</p>
                </div>
                 <div className={`p-4 rounded-2xl border ${variance >= 0 ? 'bg-emerald-50/30 border-emerald-100' : 'bg-rose-50/30 border-rose-100'}`}>
                    <p className="text-slate-400 text-[10px] uppercase font-black tracking-widest mb-1">Variación (SV)</p>
                    <p className={`font-black text-lg ${variance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {variance > 0 ? '+' : ''}{currencyFormatter.format(variance)}
                    </p>
                </div>
                <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
                     <p className="text-slate-400 text-[10px] uppercase font-black tracking-widest mb-1">Eficiencia</p>
                     <p className={`font-black text-lg ${performance >= 100 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {performance.toFixed(1)}%
                     </p>
                </div>
            </div>
        </div>
        <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dataPoints} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorPlanned" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 11, fill: '#6b7280' }} 
                        axisLine={false} 
                        tickLine={false} 
                    />
                    <YAxis 
                        tickFormatter={(val) => `$${(val/1000000).toFixed(1)}M`} 
                        tick={{ fontSize: 11, fill: '#6b7280' }} 
                        axisLine={false} 
                        tickLine={false}
                    />
                    <Tooltip 
                        contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: any, name: any) => [
                            currencyFormatter.format(value), 
                            name === 'planned' ? 'Planificado' : 'Real Ejecutado'
                        ]}
                    />
                    <Legend iconType="circle" />
                    <Area 
                        type="monotone" 
                        dataKey="planned" 
                        stroke="#3b82f6" 
                        fillOpacity={1} 
                        fill="url(#colorPlanned)" 
                        name="planned"
                        strokeWidth={2}
                    />
                    <Line 
                        type="monotone" 
                        dataKey="actual" 
                        stroke="#10b981" 
                        strokeWidth={3} 
                        dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} 
                        activeDot={{ r: 6 }} 
                        name="actual"
                    />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
        <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
             <div>Total Proyecto: <span className="font-bold text-gray-800">{currencyFormatter.format(totalProjectValue)}</span></div>
             <div>Max Acumulado: <span className="font-bold text-gray-800">{currencyFormatter.format(maxVal)}</span></div>
        </div>
    </div>
  );
}
