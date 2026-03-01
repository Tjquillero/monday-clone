'use client';

import { useMemo, useState, useEffect } from 'react';
import { Group, Item, Column } from '@/types/monday';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { MapPin } from 'lucide-react';

interface BudgetExecutionWidgetProps {
  groups: Group[];
  columns: Column[];
  activeSiteId?: string;
  hideSelector?: boolean;
}

export default function BudgetExecutionWidget({ groups, columns, activeSiteId: propActiveSiteId, hideSelector }: BudgetExecutionWidgetProps) {
  const [mounted, setMounted] = useState(false);
  const [internalActiveSiteId, setInternalActiveSiteId] = useState<string>('all');
  
  const activeSiteId = propActiveSiteId !== undefined ? propActiveSiteId : internalActiveSiteId;

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data, totalBudget, totalExecuted, currencyFormatter } = useMemo(() => {
    if (!mounted) return { data: [], totalBudget: 0, totalExecuted: 0, currencyFormatter: { format: (n: number) => n.toString() } };

    // Filter Groups
    const filteredGroups = (activeSiteId === 'all') 
        ? groups 
        : groups.filter(g => g.id === activeSiteId);

    // Column Mapping
    // Column Mapping
    const priceCol = columns.find(c => ['precio', 'unit_price', 'costo', 'valor'].some(term => c.id === term || c.title.toLowerCase().includes(term))) || { id: 'unit_price' };
    const qtyCol = columns.find(c => ['cant', 'm2', 'volumen', 'metrado'].some(term => c.id === term || c.title.toLowerCase().includes(term))) || { id: 'cant' };
    
    // For grouping, we prefer 'category' but fallback to mapping if item values are missing
    const categoryTotals: Record<string, { planned: number; executed: number }> = {};
    let totalBudget = 0;
    let totalExecuted = 0;

    const processItem = (item: Item) => {
        // Standard APU logic: If item has subitems, we sum ONLY the subitems
        if (item.subItems && item.subItems.length > 0) {
            item.subItems.forEach(sub => processItem(sub));
            return;
        }

        // Get category from item values or fallback
        const cat = item.values['category'] || item.values['parent_group'] || 'General';
        const categoryKey = String(cat).trim();

        if (!categoryTotals[categoryKey]) {
            categoryTotals[categoryKey] = { planned: 0, executed: 0 };
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

        // Amounts
        const plannedAmount = unitPrice * qty;
        const executedAmount = unitPrice * executedQty;

        categoryTotals[categoryKey].planned += plannedAmount;
        categoryTotals[categoryKey].executed += executedAmount;

        totalBudget += plannedAmount;
        totalExecuted += executedAmount;
    };

    filteredGroups.forEach(group => {
      group.items.forEach(item => {
          // Filter out header/summary rows if needed
          if (String(item.values?.rubro || '').trim().toLowerCase() === 'otros costos') return;
          processItem(item);
      });
    });

    const data = Object.entries(categoryTotals)
        .filter(([_, vals]) => vals.planned > 0 || vals.executed > 0)
        .map(([name, vals]) => ({
            name: name.length > 20 ? name.substring(0, 17) + '...' : name,
             Presupuesto: vals.planned,
            Ejecución: vals.executed
        }))
        .sort((a,b) => b.Presupuesto - a.Presupuesto);

    const currencyFormatter = new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0
    });

    return { data, totalBudget, totalExecuted, currencyFormatter };
  }, [groups, columns, activeSiteId]);

  if (!mounted || data.length === 0) return (
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-[400px] flex items-center justify-center text-gray-400 text-sm">
          No hay datos de presupuesto para mostrar.
      </div>
  );

  return (
    <div className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col h-[480px] font-sans">
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-6 mb-4 gap-4">
             <div>
                <h3 className="text-slate-900 font-black text-2xl tracking-tight flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-600 shadow-sm">
                        <MapPin size={20} />
                    </div>
                    {activeSiteId === 'all' ? 'Presupuesto: Global' : `Presupuesto: ${groups.find(g => g.id === activeSiteId)?.title}`}
                </h3>
                <div className="flex gap-6 text-[10px] mt-2 font-black uppercase tracking-widest">
                     <span className="text-slate-400">Ppto Total: <b className="text-slate-900">{currencyFormatter.format(totalBudget)}</b></span>
                     <span className="text-slate-400">Ejecutado: <b className="text-emerald-600">{currencyFormatter.format(totalExecuted)}</b></span>
                </div>
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
        
        <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                    <YAxis 
                        tickFormatter={(val) => `$${(val/1000000).toFixed(0)}M`} 
                        tick={{ fontSize: 11, fill: '#6b7280' }} 
                        axisLine={false} 
                        tickLine={false}
                    />
                    <Tooltip 
                        cursor={{ fill: '#f9fafb' }}
                        contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: any, name: any, item: any) => {
                            if (name === 'Ejecución' && item && item.payload && item.payload.Presupuesto > 0) {
                                const valNum = typeof value === 'number' ? value : parseFloat(value);
                                const pct = (valNum / item.payload.Presupuesto) * 100;
                                return [`${currencyFormatter.format(valNum)} (${pct.toFixed(1)}%)`, name];
                            }
                            return [currencyFormatter.format(value), name];
                        }}
                    />
                    <Legend />
                    <Bar dataKey="Presupuesto" fill="#475569" radius={[4, 4, 0, 0]} barSize={30} />
                    <Bar dataKey="Ejecución" fill="#10b981" radius={[4, 4, 0, 0]} barSize={30} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    </div>
  );
}
