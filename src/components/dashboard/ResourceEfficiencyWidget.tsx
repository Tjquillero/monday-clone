'use client';

import { useState, useEffect, useMemo, Fragment } from 'react';
import { Group, ActivityTemplate, EfficiencyRow, ResourceAnalysisDBRow } from '@/types/monday';
import { Database, AlertCircle, Table, MapPin, DollarSign } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

interface ResourceEfficiencyWidgetProps {
  boardId: string | null;
  groups: Group[]; // We use groups to define the "Sites"
  activityTemplates: ActivityTemplate[];
}

interface ActivityDefinition {
  id: string;
  name: string;
  unit: string;
  rendimiento: number;
  frecuencia: number;
  factor: number;
  assignedWorkers: number;
}

// STANDARD ITEMS FOR INPUT TABLE
const SCOPE_ITEMS = [
    { id: 'total_paisajismo', name: 'TOTAL PAISAJISMO', unit: 'M2' },
    { id: 'grama', name: 'GRAMA', unit: 'M2' },
    { id: 'arbustos', name: 'ARBUSTOS Y CUBRE SUELOS', unit: 'M2' },
    { id: 'arboles', name: 'ARBOLES TOTALES', unit: 'UND' },
    { id: 'zona_dura', name: 'ZONA DURA', unit: 'M2' },
    { id: 'limpieza_marmol', name: 'LIMPIEZA MARMOL', unit: 'M2' },
    { id: 'zona_playa', name: 'ZONA DE PLAYA', unit: 'M2' },
    { id: 'trasiego_playa', name: 'TRASIEGO DE PLAYA', unit: 'M2' },
    { id: 'limpieza_manual', name: 'LIMPIEZA MANUAL', unit: 'M2' },
    { id: 'corte_troncos', name: 'CORTE DE TRONCOS', unit: 'UND' },
];

const STANDARD_MAPPINGS: Record<string, Array<{ name: string, unit: string, rend: number, freq: number, category: string }>> = {
    'total_paisajismo': [
        { name: 'Limpieza General', unit: 'm2/dia', rend: 7500, freq: 2.083, category: 'ZONA VERDE' },
    ],
    'grama': [
        { name: 'Op Guadaña', unit: 'm2/dia', rend: 5000, freq: 25, category: 'ZONA VERDE' },
        { name: 'Riego general Grama', unit: 'm2/dia', rend: 3500, freq: 2.083, category: 'ZONA VERDE' },
        { name: 'TC Insecticida y Fungicida', unit: 'm2/dia', rend: 3500, freq: 150, category: 'ZONA VERDE' },
        { name: 'TC Herbicida Grama', unit: 'm2/dia', rend: 2400, freq: 50, category: 'ZONA VERDE' },
        { name: 'Fertil Grama', unit: 'm2/dia', rend: 3500, freq: 150, category: 'ZONA VERDE' },
    ],
    'arbustos': [
        { name: 'Plateo', unit: 'und/dia', rend: 160, freq: 12.5, category: 'ZONA VERDE' },
        { name: 'Poda Arbustos y CS', unit: 'm2/dia', rend: 1495, freq: 12.5, category: 'ZONA VERDE' },
        { name: 'Mto Cama Siembra', unit: 'm2/dia', rend: 450, freq: 6.25, category: 'ZONA VERDE' },
        { name: 'Riego general Arbusto', unit: 'm2/dia', rend: 3500, freq: 2.083, category: 'ZONA VERDE' },
        { name: 'TC Insect y Fung Arbus', unit: 'm2/dia', rend: 2400, freq: 50, category: 'ZONA VERDE' },
        { name: 'Fertil Arbust y Cubresul', unit: 'm2/dia', rend: 3500, freq: 150, category: 'ZONA VERDE' },
    ],
    'arboles': [
        { name: 'Poda Arboles y Palmas', unit: 'und/dia', rend: 450, freq: 75, category: 'ZONA VERDE' },
        { name: 'Riego general Arboles', unit: 'und/dia', rend: 480, freq: 3.125, category: 'ZONA VERDE' },
        { name: 'TC Insecticida y Fung Arb', unit: 'und/dia', rend: 360, freq: 50, category: 'ZONA VERDE' },
        { name: 'Fertil Arb y Palmas Comp', unit: 'und/dia', rend: 240, freq: 150, category: 'ZONA VERDE' },
        { name: 'Fertil Arb y Palmas Quim', unit: 'und/dia', rend: 490, freq: 150, category: 'ZONA VERDE' },
    ],
    'zona_dura': [
        { name: 'Limpieza General Zonas Duras', unit: 'm2/dia', rend: 10000, freq: 1, category: 'ZONA DURA' },
    ],
    'limpieza_marmol': [
        { name: 'Limpieza general mármol', unit: 'm2/dia', rend: 600, freq: 1, category: 'ZONA DURA' },
    ],
    'zona_playa': [
        { name: 'Acopio y limpieza manual', unit: 'm2/dia', rend: 3000, freq: 25, category: 'ZONA DE PLAYA' }
    ],
    'trasiego_playa': [
        { name: 'Arrume con tractor (trasiego)', unit: 'm2/dia', rend: 5000, freq: 4, category: 'ZONA DE PLAYA' }
    ],
    'limpieza_manual': [
        { name: 'Limpieza Manual (Extra)', unit: 'm2/dia', rend: 3000, freq: 25, category: 'ZONA DE PLAYA' }
    ],
    'corte_troncos': [
        { name: 'Corte de troncos', unit: 'und/dia', rend: 15, freq: 4, category: 'ZONA DE PLAYA' }
    ]
};

const WORKING_DAYS_MONTH = 25;

export default function ResourceEfficiencyWidget({ boardId, groups, activityTemplates }: ResourceEfficiencyWidgetProps) {
  const [activeSiteId, setActiveSiteId] = useState<string>('');
  const [mounted, setMounted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  
  const [dbError, setDbError] = useState<string | null>(null);
  
  // State: Map<SiteId, Map<ScopeId, Quantity>>
  const [scopeInputs, setScopeInputs] = useState<Record<string, Record<string, number>>>({});
  
  // State: Map<SiteId, Map<ActivityId, Workers>>
  const [assignedWorkers, setAssignedWorkers] = useState<Record<string, Record<string, number>>>({});

  // State: Map<SiteId, Wage>
  const [wageInputs, setWageInputs] = useState<Record<string, number>>({});

  // Initialize active site
  useEffect(() => {
      if (groups.length > 0 && !activeSiteId) {
          setActiveSiteId(groups[0].id);
      }
  }, [groups]);

  // Load Persistence from Supabase
  useEffect(() => {
    if (!boardId) return;

    let isMounted = true;
    const controller = new AbortController();

    const loadData = async () => {
        try {
            console.log(`[Resource Efficiency] Loading data for board ${boardId}`);
            const { data, error } = await supabase
                .from('resource_analysis')
                .select('*')
                .eq('board_id', boardId)
                .abortSignal(controller.signal);
            
            if (!isMounted) return;
            
            if (error) {
                // Ignore intentional abortions from unmounting
                if (error.name === 'AbortError' || error.message?.includes('aborted')) {
                    return;
                }
                
                console.error("Error loading resource analysis from Supabase:", error.message);
                setDbError(error.message || "Error de conexión con la base de datos");
                
                // Fallback to local storage for legacy data if DB fails
                const savedScope = localStorage.getItem('monday_resource_scope_v1');
                const savedWorkers = localStorage.getItem('monday_resource_workers_v1');
                const savedWages = localStorage.getItem('monday_resource_wages_v1');
                
                if (savedScope) try { setScopeInputs(JSON.parse(savedScope)); } catch (e) { console.error("Error parsing fallback scope:", e); }
                if (savedWorkers) try { setAssignedWorkers(JSON.parse(savedWorkers)); } catch (e) { console.error("Error parsing fallback workers:", e); }
                if (savedWages) try { setWageInputs(JSON.parse(savedWages)); } catch (e) { console.error("Error parsing fallback wages:", e); }
                
                setMounted(true);
                return; // EXIT EARLY ON ERROR
            }

            if (Array.isArray(data) && data.length > 0) {
                console.log(`[Resource Efficiency] Processing ${data.length} rows from database`);
                setDbError(null);
                const scope: Record<string, any> = {};
                const workers: Record<string, any> = {};
                const wages: Record<string, any> = {};
                
                (data as ResourceAnalysisDBRow[]).forEach((row) => {
                   if (row.site_id) {
                       scope[row.site_id] = row.scope_data || {};
                       workers[row.site_id] = row.workers_data || {};
                       wages[row.site_id] = row.wages_data || 0;
                   }
                });
                
                setScopeInputs(scope);
                setAssignedWorkers(workers);
                setWageInputs(wages);
            } else {
                console.log("[Resource Efficiency] No data found in database for this boardId");
                setDbError(null);
            }
            setMounted(true);
        } catch (err: any) {
             if (isMounted && err.name !== 'AbortError') {
                 console.error("Unexpected error loading data:", err);
             }
        }
    };

    loadData();
    
    return () => {
        isMounted = false;
        controller.abort();
    };
  }, [boardId]);

  // Save Persistence to Supabase (Debounced)
  useEffect(() => {
    if (!mounted || !boardId || !activeSiteId) return;

    const saveTimer = setTimeout(async () => {
        setIsSaving(true);
        console.log(`[Resource Efficiency] Saving data for site ${activeSiteId}`);
        
        const payload = {
            board_id: boardId,
            site_id: activeSiteId,
            scope_data: scopeInputs[activeSiteId] || {},
            workers_data: assignedWorkers[activeSiteId] || {},
            wages_data: wageInputs[activeSiteId] || 0,
            updated_at: new Date().toISOString()
        };

        const { error } = await supabase
            .from('resource_analysis')
            .upsert(payload, { onConflict: 'board_id,site_id' });

        if (error) console.error("Error saving resource analysis:", error);
        else {
            setLastSaved(new Date());
            // Sync to local storage as double-backup
            localStorage.setItem('monday_resource_scope_v1', JSON.stringify(scopeInputs));
            localStorage.setItem('monday_resource_workers_v1', JSON.stringify(assignedWorkers));
            localStorage.setItem('monday_resource_wages_v1', JSON.stringify(wageInputs));
        }
        setIsSaving(false);
    }, 2000);

    return () => clearTimeout(saveTimer);
  }, [scopeInputs, assignedWorkers, wageInputs, activeSiteId, boardId, mounted]);

  const handleScopeChange = (scopeId: string, val: string) => {
      const num = parseFloat(val);
      const safeVal = isNaN(num) ? 0 : num;
      
      setScopeInputs(prev => ({
          ...prev,
          [activeSiteId]: {
              ...(prev[activeSiteId] || {}),
              [scopeId]: safeVal
          }
      }));
  };

  const handleWorkerChange = (actId: string, val: string) => {
       const num = parseFloat(val);
      const safeVal = isNaN(num) ? 0 : num;
      
      setAssignedWorkers(prev => ({
          ...prev,
          [activeSiteId]: {
              ...(prev[activeSiteId] || {}),
              [actId]: safeVal
          }
      }));
  };

  const handleWageChange = (val: string) => {
      const num = parseFloat(val);
      const safeVal = isNaN(num) ? 0 : num;
      
      setWageInputs(prev => ({
          ...prev,
          [activeSiteId]: safeVal
      }));
  };

  const formatCurrency = (val: number) => {
      return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
  };

  // CALCULATIONS ENGINE
  const calculations = useMemo(() => {
      if (!activeSiteId) return { groups: [], totalJornales: 0, totalCost: 0 };

      const currentInputs = scopeInputs[activeSiteId] || {};
      const currentWorkers = assignedWorkers[activeSiteId] || {};
      const currentWage = wageInputs[activeSiteId] || 0;
      
      const allRows: EfficiencyRow[] = [];
      let totalJornales = 0;
      let totalCost = 0;

      // 1. Iterate over defined Scope Rules
      Object.keys(STANDARD_MAPPINGS).forEach(scopeKey => {
          const qty = currentInputs[scopeKey] || 0;
          if (qty > 0) {
              const rules = STANDARD_MAPPINGS[scopeKey];
              rules.forEach(rule => {
                  const factor = rule.freq / WORKING_DAYS_MONTH;
                  const denominator = rule.rend * factor;
                  const theoretical = (denominator > 0) ? (qty / denominator) : 0;
                  
                  // Unique ID for this row context
                  const rowId = `${scopeKey}-${rule.name.replace(/\s/g, '')}`;
                  
                  // Actuals
                  const real = currentWorkers[rowId] !== undefined ? currentWorkers[rowId] : 0; // default 0 if not set

                  const activityValue = theoretical * currentWage;

                  allRows.push({
                      id: rowId,
                      name: rule.name,
                      category: rule.category,
                      unit: rule.unit,
                      rendimiento: rule.rend,
                      frecuencia: rule.freq,
                      factor,
                      scopeName: SCOPE_ITEMS.find(s => s.id === scopeKey)?.name || scopeKey.toUpperCase(),
                      qty,
                      theoretical,
                      real,
                      savings: theoretical - real,
                      activityValue
                  });

                  totalJornales += theoretical;
                  totalCost += activityValue;
              });
          }
      });

      // Group by Category
      const definedCategories = ['ZONA VERDE', 'ZONA DURA', 'ZONA DE PLAYA'];
      const groups = definedCategories.map(catName => {
          const rows = allRows.filter(r => r.category === catName);
          const subtotalJornales = rows.reduce((sum, r) => sum + r.theoretical, 0);
          const subtotalCost = rows.reduce((sum, r) => sum + r.activityValue, 0);
          return {
              name: catName,
              rows,
              subtotalJornales,
              subtotalCost
          };
      }).filter(g => g.rows.length > 0);

      return { groups, totalJornales, totalCost };
  }, [activeSiteId, scopeInputs, assignedWorkers, wageInputs]);


  if (!mounted) return null;

  return (
    <div className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col gap-8 font-sans">
        
        {/* Header with Site Selector */}
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-6 gap-6">
             <div>
                <h3 className="text-slate-900 font-black text-2xl tracking-tight flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 shadow-sm">
                        <MapPin size={20} />
                    </div>
                    {activeSiteId ? `Análisis: ${groups.find(g => g.id === activeSiteId)?.title || 'Sitio'}` : 'Análisis de Jornales'}
                </h3>
                <p className="text-slate-400 text-sm font-medium mt-1">Ingresa las cantidades por sitio para calcular la mano de obra eficiente</p>
                {dbError && (
                    <div className="mt-4 flex items-center gap-2 bg-amber-50 text-amber-700 px-4 py-2 rounded-xl border border-amber-100 text-[11px] font-bold uppercase tracking-wider shadow-sm animate-pulse">
                        <Database size={14} />
                        <span>Respaldo Activado: {dbError === 'relation "resource_analysis" does not exist' ? 'Tabla no encontrada en Supabase' : 'Offline'}</span>
                    </div>
                )}
            </div>
            
            {/* Site Tabs */}
            <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-100 overflow-x-auto no-scrollbar shadow-inner">
                {groups.map(group => (
                    <button
                        key={group.id}
                        onClick={() => setActiveSiteId(group.id)}
                        className={`px-5 py-2.5 rounded-xl text-xs font-black whitespace-nowrap transition-all duration-300 ${activeSiteId === group.id ? 'bg-white text-emerald-700 shadow-md ring-1 ring-slate-100' : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'}`}
                    >
                        {group.title.toUpperCase()}
                    </button>
                ))}
            </div>
        </div>
        
        <div className="flex flex-col xl:flex-row gap-8">
            {/* LEFT: INPUT TABLE */}
            <div className="w-full xl:w-1/3 min-w-[340px]">
                 <div className="flex items-center gap-2 mb-4 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-lg shadow-slate-200/50">
                    <Table size={16} className="text-emerald-400" />
                    <h3 className="font-black text-[10px] uppercase tracking-[0.2em]">1. Alcance del Proyecto</h3>
                 </div>
                 <div className="border border-slate-100 rounded-[2rem] overflow-hidden bg-slate-50/30 shadow-sm">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-100/50 text-slate-500 text-[9px] uppercase font-black tracking-widest border-b border-slate-100">
                            <tr>
                                <th className="p-4 text-left">Descripción</th>
                                <th className="p-4 text-center">UND</th>
                                <th className="p-4 text-right text-emerald-700 bg-emerald-50/50">CANTIDAD</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {SCOPE_ITEMS.map(item => (
                                <tr key={item.id} className="group hover:bg-white transition-colors duration-200">
                                    <td className="p-4 font-bold text-slate-700">{item.name}</td>
                                    <td className="p-4 text-center text-[10px] font-black text-slate-400">{item.unit}</td>
                                    <td className="p-1 px-3 text-right">
                                        <input 
                                            type="number" 
                                            className="w-full text-right bg-emerald-50/30 border-2 border-transparent focus:border-emerald-500 focus:bg-white rounded-xl px-3 py-2 font-black text-emerald-900 transition-all outline-none text-sm"
                                            placeholder="0"
                                            value={(scopeInputs[activeSiteId] || {})[item.id] || ''}
                                            onChange={(e) => handleScopeChange(item.id, e.target.value)}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                 </div>
            </div>


            {/* RIGHT: ANALYSIS TABLE */}
            <div className="w-full xl:w-2/3 overflow-x-auto">
                 <div className="flex items-center gap-2 mb-4 bg-slate-900 text-white px-5 py-3 rounded-2xl justify-between flex-wrap shadow-lg shadow-slate-200/50">
                    <div className="flex items-center gap-3">
                        <Database size={16} className="text-emerald-400" />
                        <h3 className="font-black text-[10px] uppercase tracking-[0.2em]">2. Análisis de Rendimiento</h3>
                    </div>
 
                    {/* Wage Input */}
                    <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2 rounded-xl backdrop-blur-md">
                        <DollarSign size={14} className="text-emerald-400" />
                        <span className="text-[10px] font-black uppercase tracking-wider text-white/60 whitespace-nowrap">Jornal Promedio:</span>
                        <input
                            type="number"
                            className="w-28 text-right bg-white/10 border-none text-white font-black text-sm rounded-lg px-2 py-1 focus:bg-white focus:text-slate-900 outline-none transition-all placeholder-white/20"
                            placeholder="0"
                            value={wageInputs[activeSiteId] || ''}
                            onChange={(e) => handleWageChange(e.target.value)}
                        />
                    </div>
                </div>
 
                <div className="border border-slate-100 rounded-[2rem] overflow-hidden shadow-sm min-w-[900px] bg-white">
                    <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 text-slate-500 font-black text-[9px] uppercase tracking-widest border-b border-slate-100">
                            <tr>
                                <th className="p-3 border-r border-slate-50 w-8 text-center bg-slate-50/50">#</th>
                                <th className="p-3 border-r border-slate-50">Actividad</th>
                                <th className="p-3 border-r border-slate-50 w-16 text-center">Unidad</th>
                                <th className="p-3 border-r border-slate-50 w-20 text-center">Cant.</th>
                                <th className="p-3 border-r border-slate-50 w-20 text-center">Frec.</th>
                                <th className="p-3 border-r border-slate-50 w-16 text-center">Rend.</th>
                                <th className="p-3 border-r border-slate-50 w-24 text-right bg-amber-50/50 text-amber-800">JR Teórico</th>
                                <th className="p-3 border-r border-slate-50 w-24 text-right bg-emerald-50/50 text-emerald-800">Real</th>
                                <th className="p-3 border-r border-slate-50 w-20 text-right">Eficiencia</th>
                                <th className="p-3 w-32 text-right bg-slate-900 text-white">V. Actividad</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {calculations.groups.length === 0 ? (
                                <tr>
                                    <td colSpan={11} className="p-8 text-center">
                                        <div className="flex flex-col items-center justify-center text-gray-400">
                                            <AlertCircle className="mb-2 opacity-50" />
                                            <p>Ingresa cantidades en el cuadro de la izquierda para ver el cálculo.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                calculations.groups.map(group => (
                                    <Fragment key={group.name}>
                                        {/* Category Header */}
                                        <tr key={group.name} className="bg-slate-100/30 text-slate-400 font-black text-[9px] uppercase tracking-[0.2em]">
                                            <td colSpan={10} className="p-2 pl-4 border-y border-slate-100">{group.name}</td>
                                        </tr>
                                        {/* Rows */}
                                        {group.rows.map((row: EfficiencyRow, idx: number) => (
                                            <tr key={row.id} className="hover:bg-slate-50 transition-colors group/row">
                                                <td className="p-3 border-r border-slate-50 text-center text-slate-400 font-bold">{idx + 1}</td>
                                                <td className="p-3 border-r border-slate-50">
                                                    <div className="font-bold text-slate-800">{row.name}</div>
                                                    <div className="text-[9px] text-slate-400 font-medium">Factor: {row.factor.toFixed(2)}</div>
                                                </td>
                                                <td className="p-3 border-r border-slate-50 text-center text-slate-500 font-medium italic">{row.unit}</td>
                                                <td className="p-3 border-r border-slate-50 text-right font-mono text-slate-600 font-bold">{row.qty.toLocaleString()}</td>
                                                <td className="p-3 border-r border-slate-50 text-center text-slate-500 font-bold">{row.frecuencia}</td>
                                                <td className="p-3 border-r border-slate-50 text-center text-slate-500">{row.rendimiento.toLocaleString()}</td>
                                                <td className="p-3 border-r border-slate-50 text-right font-black bg-amber-50/20 text-slate-900">
                                                    {row.theoretical.toFixed(1)}
                                                </td>
                                                <td className="p-0 border-r border-slate-50 bg-emerald-50/30">
                                                     <input 
                                                        type="number" 
                                                        className="w-full h-full text-right bg-transparent border-none focus:ring-0 p-3 font-black text-emerald-800 text-xs"
                                                        value={row.real || ''}
                                                        placeholder={row.theoretical.toFixed(1)}
                                                        onChange={(e) => handleWorkerChange(row.id, e.target.value)}
                                                    />
                                                </td>
                                                <td className={`p-3 border-r border-slate-50 text-right font-black ${row.savings >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                                    {row.savings > 0 ? '+' : ''}{row.savings.toFixed(1)}
                                                </td>
                                                <td className="p-3 text-right font-black text-slate-900 bg-slate-50/50">
                                                    {formatCurrency(row.activityValue)}
                                                </td>
                                            </tr>
                                        ))}
                                        {/* Category Subtotal */}
                                        <tr key={`${group.name}-subtotal`} className="bg-slate-50/50 font-black border-b border-slate-100">
                                            <td colSpan={6} className="p-3 text-right text-slate-400 text-[9px] uppercase tracking-widest">Subtotal {group.name}:</td>
                                            <td className="p-3 text-right text-amber-800 bg-amber-50">
                                                {group.subtotalJornales.toFixed(1)}
                                            </td>
                                            <td colSpan={2}></td>
                                            <td className="p-3 text-right text-slate-900 bg-slate-100">
                                                {formatCurrency(group.subtotalCost)}
                                            </td>
                                        </tr>
                                    </Fragment>
                                ))
                            )}
                        </tbody>
                        <tfoot>
                            <tr className="bg-slate-50 border-t-2 border-slate-200 font-black">
                                <td colSpan={6} className="p-5 text-right text-slate-500 uppercase text-[10px] tracking-[0.2em] border-r border-slate-100">Capacidad Teórica (JR Mes):</td>
                                <td className="p-5 text-right text-xl text-amber-700 bg-amber-50 border-r border-slate-100">
                                    {calculations.totalJornales.toFixed(1)}
                                </td>
                                <td colSpan={2} className="border-r border-slate-100"></td>
                                <td rowSpan={2} className="p-5 text-right text-2xl text-slate-900 bg-emerald-50/30 align-middle">
                                    {formatCurrency(calculations.totalCost)}
                                    <div className="text-[10px] text-emerald-600 uppercase font-black tracking-widest mt-1">Costo Estimado</div>
                                </td>
                            </tr>
                            <tr className="bg-slate-900 text-white font-black">
                                <td colSpan={6} className="p-5 text-right uppercase text-[10px] tracking-[0.2em] border-r border-slate-700">Cant. Personal Requerido:</td>
                                <td className="p-5 text-right text-xl text-emerald-400 bg-white/5 border-r border-slate-700">
                                    {(calculations.totalJornales / WORKING_DAYS_MONTH).toFixed(1)}
                                </td>
                                <td colSpan={2} className="border-r border-slate-700"></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    </div>
  );
}
