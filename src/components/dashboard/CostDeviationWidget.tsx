'use client';

import { useMemo, useState, useEffect } from 'react';
import { Group, Item, Column } from '@/types/monday';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { PieChart as PieChartIcon } from 'lucide-react';

interface CostDeviationWidgetProps {
  groups: Group[];
  columns: Column[];
  activeSiteId?: string;
  hideSelector?: boolean;
}

const COLORS = ['#0f172a', '#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#06b6d4', '#f43f5e'];

export default function CostDeviationWidget({ groups, columns, activeSiteId: propActiveSiteId, hideSelector }: CostDeviationWidgetProps) {
  const [mounted, setMounted] = useState(false);
  const [internalActiveSiteId, setInternalActiveSiteId] = useState<string>('all');
  
  const activeSiteId = propActiveSiteId !== undefined ? propActiveSiteId : internalActiveSiteId;

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data, totalVariance, currencyFormatter } = useMemo(() => {
    if (!mounted) return { data: [], totalVariance: 0, currencyFormatter: { format: (n: number) => n.toString() } };

    // Filter Groups
    const filteredGroups = (activeSiteId === 'all') 
        ? groups 
        : groups.filter(g => g.id === activeSiteId);

    // Column Mapping
    // Column Mapping
    const priceCol = columns.find(c => ['precio', 'unit_price', 'costo', 'valor'].some(term => c.id === term || c.title.toLowerCase().includes(term))) || { id: 'unit_price' };
    const qtyCol = columns.find(c => ['cant', 'm2', 'volumen', 'metrado'].some(term => c.id === term || c.title.toLowerCase().includes(term))) || { id: 'cant' };
    const rubroCol = columns.find(c => c.id === 'rubro' || c.title.toLowerCase().includes('rubro')) || { id: 'rubro' };

    const rubroTotals: Record<string, { planned: number; executed: number }> = {};
    let totalPlanned = 0;
    let totalExecuted = 0;

    const processItem = (item: Item) => {
        if (item.subItems && item.subItems.length > 0) {
            item.subItems.forEach(sub => processItem(sub));
            return;
        }

        const rubroRaw = item.values[rubroCol.id] || item.values['rubro'] || 'Otros';
        const key = String(rubroRaw).trim();

        if (!rubroTotals[key]) {
            rubroTotals[key] = { planned: 0, executed: 0 };
        }

        const unitPrice = parseFloat(item.values[priceCol.id] || 0);
        const qty = parseFloat(item.values[qtyCol.id] || 0);
        
        // Executed Quantity Calculation
        let executedQty = parseFloat(item.values['executed_qty'] || 0);
        if (executedQty === 0 && item.values['daily_execution']) {
            const dailyExec = item.values['daily_execution'] || {};
            executedQty = Object.values(dailyExec).reduce((acc: number, val: any) => {
                 const v = typeof val === 'object' ? (val.val || 0) : (parseFloat(val) || 0);
                 return acc + v;
            }, 0);
        }

        // Planned
        const plannedAmount = unitPrice * qty;
        const executedAmount = unitPrice * executedQty;

        rubroTotals[key].planned += plannedAmount;
        rubroTotals[key].executed += executedAmount;

        totalPlanned += plannedAmount;
        totalExecuted += executedAmount;
    };

    filteredGroups.forEach(group => {
      group.items.forEach(item => {
          if (String(item.values?.rubro || '').trim().toLowerCase() === 'otros costos') return;
          processItem(item);
      });
    });

    const data = Object.entries(rubroTotals)
        .filter(([_, vals]) => vals.executed > 0)
        .map(([name, vals]) => ({
            name: name.length > 15 ? name.substring(0, 12) + '...' : name,
            value: vals.executed,
            planned: vals.planned,
            deviation: vals.executed - vals.planned
        }))
        .sort((a, b) => b.value - a.value);

    const currencyFormatter = new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0
    });

    return { data, totalVariance: totalExecuted - totalPlanned, currencyFormatter };
  }, [groups, columns, activeSiteId]);

  if (!mounted || data.length === 0) return (
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-[400px] flex items-center justify-center text-gray-400 text-sm">
          No hay datos de ejecución por rubro para mostrar.
      </div>
  );

  return (
    <div className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col h-[480px] font-sans">
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-6 mb-4 gap-4">
             <div>
                <h3 className="text-slate-900 font-black text-2xl tracking-tight flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-600 shadow-sm">
                        <PieChartIcon size={20} />
                    </div>
                    {activeSiteId === 'all' ? 'Distribución por Rubro' : `Rubros: ${groups.find(g => g.id === activeSiteId)?.title}`}
                </h3>
            </div>
            
            {!hideSelector && (
                <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-100 shadow-inner">
                    <button 
                        onClick={() => setInternalActiveSiteId('all')} 
                        className={`px-4 py-2 rounded-xl text-xs font-black shadow-sm transition-all duration-300 ${activeSiteId === 'all' ? 'bg-white text-slate-800 ring-1 ring-slate-100' : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'}`}
                    >
                        TODOS
                    </button>
                    {groups.map(group => (
                        <button
                            key={group.id}
                            onClick={() => setInternalActiveSiteId(group.id)}
                            className={`px-4 py-2 rounded-xl text-xs font-black transition-all duration-300 ${activeSiteId === group.id ? 'bg-white text-emerald-700 shadow-md ring-1 ring-slate-100' : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'}`}
                        >
                            {group.title.toUpperCase()}
                        </button>
                    ))}
                </div>
            )}
        </div>
        
        <div className="flex-1 w-full min-h-0 flex flex-col md:flex-row gap-6">
            <div className="flex-1 h-full min-h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            fill="#8884d8"
                            paddingAngle={5}
                            dataKey="value"
                        >
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            formatter={(value: any) => currencyFormatter.format(value || 0)}
                        />
                        <Legend iconType="circle" />
                    </PieChart>
                </ResponsiveContainer>
            </div>
            <div className="w-full md:w-1/3 overflow-y-auto pr-2 custom-scrollbar space-y-3">
                 <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 border-b border-slate-100 pb-2">Detalle de Inversión</h4>
                 {data.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-2 overflow-hidden">
                             <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                             <span className="text-xs font-bold text-slate-700 truncate">{item.name}</span>
                        </div>
                        <div className="text-right">
                             <div className="text-xs font-black text-slate-800">{currencyFormatter.format(item.value)}</div>
                             {/* Calculated Deviation display */}
                             <div className={`text-[10px] font-bold ${item.deviation > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                                {item.deviation > 0 ? '+' : ''}{currencyFormatter.format(item.deviation)} vs Ppto
                             </div>
                        </div>
                    </div>
                 ))}
                 <div className="p-3 bg-slate-900 text-white rounded-xl mt-2 text-center">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Total Ejecutado</div>
                    <div className="text-sm font-black">{currencyFormatter.format(data.reduce((a, b) => a + b.value, 0))}</div>
                 </div>
            </div>
        </div>
    </div>
  );
}
