'use client';

import { useMemo, Fragment, useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, CheckCircle, AlertCircle, Plus, Trash2, Maximize2, Minimize2 } from 'lucide-react';
import { Group, Item, Column } from '@/types/monday';

interface FinancialTableViewProps {
  groups: Group[];
  columns: Column[];
  activeSiteId: string;
  onUpdateItemValue?: (groupId: string, itemId: number | string, columnId: string, value: any) => void;
  onAddItem?: (rubro: string, category: string) => void;
  onDeleteItem?: (itemId: number | string) => void;
  onDeleteItems?: (itemIds: (number | string)[]) => void;
  onRenameGroup?: (oldName: string, newName: string, type: 'major' | 'sub' | 'subsub', context?: { major?: string, sub?: string }) => void;
  onAddGroup?: (type: 'major' | 'sub' | 'subsub', parentContext?: { major?: string, sub?: string }) => void;
  totalActa?: number;
  onUpdateActa?: (val: number) => void;
  valorActaPorSitio?: Record<string, number>;
  onUpdateValorActaPorSitio?: (val: Record<string, number>) => void;
}

interface FinancialItem {
  id: string | number;
  name: string;
  unit: string;
  category: string;
  groupName: string;
  unitPrice: number;
  budgetQty: number;
  budgetTotal: number;
  executedQty: number;
  executedTotal: number;
  compliance: number;
  observaciones?: string;
}

const EditableCell = ({ value, type, onSave, className = '', step = 'any', align = 'center' }: any) => {
    const [localValue, setLocalValue] = useState<string>(String(value || ''));
    const [isFocused, setIsFocused] = useState(false);

    useEffect(() => {
        if (!isFocused) setLocalValue(String(value || ''));
    }, [value, isFocused]);

    const handleBlur = () => {
        setIsFocused(false);
        let finalVal: any = localValue;
        if (type === 'number') {
            finalVal = localValue === '' ? 0 : parseFloat(localValue);
            if (isNaN(finalVal)) finalVal = 0;
        }
        
        const currentVal = type === 'number' ? parseFloat(String(value || 0)) : value;
        if (finalVal !== currentVal) {
            onSave(finalVal);
        }
    };

    return (
        <div className="w-full h-full relative flex items-center justify-center">
            <input 
                type={type}
                step={step}
                value={(localValue === '0' || localValue === '0.00') && isFocused ? '' : localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                onFocus={(e) => {
                    setIsFocused(true);
                    e.target.select();
                }}
                onBlur={handleBlur}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as any).blur()}
                className={`w-full bg-transparent border border-transparent hover:border-blue-300 focus:border-blue-500 rounded transition-all py-1 px-1 cursor-text z-50 text-${align} ${className}`}
                style={{ pointerEvents: 'auto', outline: 'none' }}
            />
        </div>
    );
};

export default function FinancialTableView({ 
    groups, 
    columns, 
    activeSiteId = 'all', 
    onUpdateItemValue, 
    onAddItem, 
    onDeleteItem, 
    onDeleteItems,
    onRenameGroup, 
    onAddGroup, 
    totalActa = 0, 
    onUpdateActa,
    valorActaPorSitio,
    onUpdateValorActaPorSitio
}: FinancialTableViewProps) {
  const [isCanvasMode, setIsCanvasMode] = useState(false);


  const { hierarchicalGroups, totalBudget, totalExecuted, currencyFormatter, priceColId, qtyColId, unitColId, catColId } = useMemo(() => {
    // 1. Column Identification
    const priceCol = columns.find(c => ['precio', 'unit', 'costo', 'valor'].some(term => c.title.toLowerCase().includes(term)) || c.id === 'unit_price') || { id: 'unit_price' };
    const qtyCol = columns.find(c => ['cant', 'm2', 'volumen', 'metrado'].some(term => c.title.toLowerCase().includes(term)) || c.id === 'cant') || { id: 'cant' };
    const unitCol = columns.find(c => ['und', 'unidad', 'medida'].some(term => c.title.toLowerCase().includes(term)) || c.id === 'unit') || { id: 'unit' };
    
    // Detailed Category (Sub-Category)
    const catCol = columns.find(c => c.id === 'category' || c.title.toLowerCase().includes('categ') || c.title.toLowerCase().includes('sub')) || { id: 'category' };

    // Major Category (Rubro/Tipo) - Look for columns like 'Rubro', 'Tipo', 'Grupo', 'Clase'
    const typeCol = columns.find(c => c.id !== catCol.id && ['rubro', 'tipo', 'clase', 'grupo', 'type', 'class'].some(term => c.title.toLowerCase().includes(term))) || { id: 'rubro' };

    // 2. Filter Groups
    const filteredGroups = (activeSiteId === 'all') 
        ? groups 
        : groups.filter(g => g.id === activeSiteId);

    // 3. Flatten and Process Items
    const processedItems: FinancialItemExtended[] = [];
    
    interface FinancialItemExtended extends FinancialItem {
        majorCategory: string;
        groupId: string; // Add groupId to interface
    }

    const processItem = (item: Item, groupName: string, groupId: string) => {
        if (item.subItems && item.subItems.length > 0) {
            item.subItems.forEach(sub => processItem(sub, groupName, groupId));
            return; 
        }

        const safeText = (val: any) => {
            if (val === null || val === undefined) return '';
            if (typeof val === 'object' && val.text) return String(val.text);
            if (typeof val === 'object' && val.label) return String(val.label);
            if (typeof val === 'string') return val;
            return String(val);
        };

        const safeNumber = (val: any) => {
            if (typeof val === 'number') return val;
            const s = safeText(val); 
            if (!s || s.trim() === '') return 0;
            const clean = s.replace(/[^0-9.-]/g, ''); 
            const n = parseFloat(clean);
            return isNaN(n) ? 0 : n;
        };

        const unitPrice = item.values?.[priceCol.id] !== undefined ? safeNumber(item.values[priceCol.id]) : (item.values?.unit_price || 0);
        const qty = item.values?.[qtyCol.id] !== undefined ? safeNumber(item.values[qtyCol.id]) : (item.values?.cant || 0);
        const unit = safeText(item.values?.[unitCol.id]) || item.values?.unit || 'Und';
        
        // Categories
        const category = safeText(item.values?.[catCol.id]) || item.values?.category || 'Sin Categoría';
        const majorCategory = safeText(item.values?.[typeCol.id]) || item.values?.rubro || 'Otros Costos Directos'; // Default if not found

        // Execution Calculation
        const dailyExec = item.values['daily_execution'] || {};
        // Allow manual override 'executed_qty' or fall back to sum of daily logs
        const manualExec = item.values['executed_qty'] !== undefined ? safeNumber(item.values['executed_qty']) : undefined;
        
        const executedQty = manualExec !== undefined ? manualExec : Object.values(dailyExec).reduce((acc: number, val: any) => {
             const v = typeof val === 'object' ? (val.val || 0) : (parseFloat(val) || 0);
             return acc + v;
        }, 0);

        const obs = safeText(item.values?.observaciones) || '';

        const budgetTotal = unitPrice * qty;
        const executedTotal = unitPrice * executedQty;

        // Always show items to allow adding new ones with 0 value
        processedItems.push({
            id: item.id,
            name: item.name,
            unit,
            category,
            majorCategory,
            groupName,
            groupId, // Store groupId
            unitPrice,
            budgetQty: qty,
            budgetTotal,
            executedQty,
            executedTotal,
            observaciones: obs,
            // Calculate Utility/Margin: (Budget - Executed) / Budget
            compliance: budgetTotal > 0 ? ((budgetTotal - executedTotal) / budgetTotal) * 100 : 0
        });
    };

    filteredGroups.forEach(g => g.items.forEach(i => processItem(i, g.title, g.id)));

    // 4. Group by Major Category -> Sub Category
    // Structure: Record<Major, Record<Sub, Items[]>>
    const hierarchicalGroups: Record<string, Record<string, FinancialItemExtended[]>> = {};
    let tBudget = 0;
    let tExec = 0;

    processedItems.forEach(item => {
        if (!hierarchicalGroups[item.majorCategory]) hierarchicalGroups[item.majorCategory] = {};
        if (!hierarchicalGroups[item.majorCategory][item.category]) hierarchicalGroups[item.majorCategory][item.category] = [];
        
        hierarchicalGroups[item.majorCategory][item.category].push(item);
        
        tBudget += item.budgetTotal;
        tExec += item.executedTotal;
    });

    const currencyFormatter = new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0
    });

    return { 
        hierarchicalGroups, 
        totalBudget: tBudget, 
        totalExecuted: tExec,
        currencyFormatter,
        priceColId: priceCol.id,
        qtyColId: qtyCol.id,
        unitColId: unitCol.id,
        catColId: catCol.id
    };

  }, [groups, columns, activeSiteId]);

  const currentActa = activeSiteId === 'all' ? totalActa : (valorActaPorSitio?.[activeSiteId] || 0);
  const currentActaDenominator = currentActa > 0 ? currentActa : 1; // Avoid division by zero

  return (
    <div className={`bg-white transition-all duration-300 font-sans ${isCanvasMode ? 'fixed inset-0 z-[120] flex flex-col w-screen h-screen' : 'rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden'}`}>
        <div className={`px-6 py-4 flex justify-between items-center border-b border-slate-200 ${isCanvasMode ? 'bg-slate-900 text-slate-300 rounded-none' : 'bg-slate-50 text-slate-500 rounded-t-[2rem]'}`}>
             <div className="flex items-center gap-3">
                 <button 
                     onClick={() => setIsCanvasMode(!isCanvasMode)}
                     className={`p-2 rounded-xl border transition-all ${isCanvasMode ? 'bg-blue-600 text-white border-blue-700 shadow-lg hover:bg-blue-700' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'}`}
                     title={isCanvasMode ? "Salir de pantalla completa" : "Pantalla completa (Modo Canvas)"}
                 >
                     {isCanvasMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                 </button>
                 {onAddGroup && (
                     <button 
                        onClick={() => onAddGroup('major')}
                        className={`flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${isCanvasMode ? 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-white' : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'}`}
                     >
                         <Plus size={14} /> Rubro (Categoría)
                     </button>
                 )}
             </div>
             <div className="flex items-center gap-4 text-xs">
                <span className="font-medium uppercase hidden sm:inline">Total Ejecutado:</span>
                <span className="text-lg font-black text-slate-800">{currencyFormatter.format(totalExecuted)}</span>
                <span className="text-slate-400">/ {currencyFormatter.format(totalBudget)}</span>
                <div className="h-4 w-px bg-slate-200 mx-2"></div>
                
                {/* Global Utility Indicator in Header */}
                <span className="text-slate-500 font-medium uppercase">Utilidad Global:</span>
                  <span className={`text-lg font-black ${
                    currentActa > 0 
                    ? (((currentActa - totalExecuted) / currentActaDenominator) * 100) >= 70 ? 'text-emerald-600' 
                    : (((currentActa - totalExecuted) / currentActaDenominator) * 100) >= 65 ? 'text-amber-500' 
                    : 'text-rose-600' 
                    : 'text-slate-400'
                  }`}>
                    {currentActa > 0 ? (((currentActa - totalExecuted) / currentActaDenominator) * 100).toFixed(1) : 0}%
                  </span>
             </div>
        </div>

        <div className={`p-1 ${isCanvasMode ? 'flex-1 overflow-auto bg-slate-100 p-8' : 'overflow-x-auto'}`}>
            <div className={isCanvasMode ? "max-w-[1500px] mx-auto bg-white shadow-2xl rounded-2xl overflow-hidden border border-slate-300" : ""}>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left table-fixed border-collapse">
                <colgroup>
                    <col style={{ width: '280px' }} />
                    <col style={{ width: '50px' }} />
                    <col style={{ width: '70px' }} />
                    <col style={{ width: '90px' }} />
                    <col style={{ width: '100px' }} />
                    <col style={{ width: '80px' }} />
                    <col style={{ width: '70px' }} />
                    <col style={{ width: '90px' }} />
                    <col style={{ width: '100px' }} />
                    <col style={{ width: '80px' }} />
                    <col style={{ width: '150px' }} />
                    <col style={{ width: '90px' }} />
                </colgroup>
                <thead>
                    <tr className="text-[10px] uppercase font-bold tracking-wider text-white">
                        <th colSpan={2} className="bg-slate-800 border-b border-slate-700 rounded-tl-xl"></th>
                        <th colSpan={4} className="bg-blue-900 border-b border-blue-800 text-center py-2 border-l border-slate-700/50">PRESUPUESTO</th>
                        <th colSpan={4} className="bg-emerald-900 border-b border-emerald-800 text-center py-2 border-l border-slate-700/50">EJECUCIÓN</th>
                        <th colSpan={2} className="bg-slate-800 border-b border-slate-700 border-l border-slate-700/50 rounded-tr-xl"></th>
                    </tr>
                    <tr className="text-[9px] uppercase font-bold tracking-wider text-slate-300">
                        <th className="px-4 py-3 bg-slate-800 text-left border-b-4 border-slate-900">DESCRIPCIÓN</th>
                        <th className="px-1 py-3 bg-slate-800 text-center border-b-4 border-slate-900 border-l border-slate-700/50">UND</th>
                        
                        {/* Budget Headers */}
                        <th className="px-2 py-3 bg-blue-900/80 text-right border-b-4 border-blue-950 border-l border-slate-700/50">CANT INST</th>
                        <th className="px-2 py-3 bg-blue-900/80 text-right border-b-4 border-blue-950">VLR PROMEDIO</th>
                        <th className="px-2 py-3 bg-blue-900 text-right border-b-4 border-blue-950 text-white font-black">VLR TOTAL</th>
                        <th className="px-2 py-3 bg-blue-900/80 text-center border-b-4 border-blue-950">INCIDENCIA</th>
                        
                        {/* Execution Headers */}
                        <th className="px-2 py-3 bg-emerald-900/80 text-right border-b-4 border-emerald-950 border-l border-slate-700/50">CANT INST</th>
                        <th className="px-2 py-3 bg-emerald-900/80 text-right border-b-4 border-emerald-950">VLR PROMEDIO</th>
                        <th className="px-2 py-3 bg-emerald-900 text-right border-b-4 border-emerald-950 text-white font-black">VLR TOTAL</th>
                        <th className="px-2 py-3 bg-emerald-900/80 text-center border-b-4 border-emerald-950">CUMPLIMIENTO</th>
                        
                        {/* Other Headers */}
                        <th className="px-3 py-3 bg-slate-800 text-left border-b-4 border-slate-900 border-l border-slate-700/50">OBSERVACIONES</th>
                        <th className="px-2 py-3 bg-slate-800 text-right border-b-4 border-slate-900 text-rose-300">DIFERENCIA</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {Object.entries(hierarchicalGroups)
                        .filter(([majorCat]) => !majorCat.toLowerCase().includes('otros costos'))
                        .sort(([a], [b]) => {
                            const order = ['nómina', 'insumos', 'transporte', 'caja menor'];
                            const indexA = order.indexOf(a.toLowerCase().trim());
                            const indexB = order.indexOf(b.toLowerCase().trim());
                            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                            if (indexA !== -1) return -1;
                            if (indexB !== -1) return 1;
                            return a.localeCompare(b);
                        })
                        .map(([majorCat, unknownSubCats]) => {
                        const subCats = unknownSubCats as Record<string, any[]>;
                        // Major Category Totals
                        let majorBudget = 0;
                        let majorExec = 0;
                        Object.values(subCats).forEach(items => {
                            majorBudget += items.reduce((s: number, i: any) => s + i.budgetTotal, 0);
                            majorExec += items.reduce((s: number, i: any) => s + i.executedTotal, 0);
                        });

                        return (
                            <Fragment key={majorCat}>
                                {/* Major Category Header - Dark Bar */}
                                <tr className="bg-[#1e293b] border-b border-gray-700">
                                    <td colSpan={2} className="px-4 py-3 font-black text-white uppercase tracking-wider text-sm group/major">
                                        <div className="flex items-center justify-between w-full">
                                            {onRenameGroup ? (
                                                <div className="flex-1">
                                                    <EditableCell 
                                                        value={majorCat}
                                                        type="text"
                                                        onSave={(val: any) => onRenameGroup(majorCat, val, 'major')}
                                                        className="bg-transparent text-white font-black uppercase tracking-wider text-[11px] focus:bg-white/10"
                                                        align="left"
                                                    />
                                                </div>
                                            ) : (
                                                majorCat
                                            )}
                                            {onAddGroup && (
                                                <button 
                                                    onClick={() => onAddGroup('sub', { major: majorCat })}
                                                    className="ml-2 p-1 bg-blue-600 hover:bg-blue-500 rounded text-white text-[10px] px-2 flex items-center gap-1 shadow-sm transition-all active:scale-95"
                                                >
                                                    <Plus size={12} /> <span className="hidden lg:inline">Añadir Subcategoría</span>
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-2 py-3 bg-[#1e293b]"></td>
                                    <td className="px-2 py-3 bg-[#1e293b]"></td>
                                    <td className="px-2 py-3 text-right font-bold text-white text-[11px] bg-slate-800/50">
                                        {currencyFormatter.format(majorBudget).replace('$', '')}
                                    </td>
                                    <td className="px-2 py-3 bg-[#1e293b]"></td>
                                    <td className="px-2 py-3 bg-[#1e293b]"></td>
                                    <td className="px-2 py-3 bg-[#1e293b]"></td>
                                    <td className="px-2 py-3 text-right font-bold text-emerald-400 text-[11px] bg-slate-800/50">
                                        {currencyFormatter.format(majorExec).replace('$', '')}
                                    </td>
                                    <td className="px-2 py-3 bg-[#1e293b]"></td>
                                    <td className="px-2 py-3 bg-[#1e293b]"></td>
                                    <td className="px-2 py-3 text-right font-bold text-rose-400 text-[11px]">
                                        {currencyFormatter.format(majorBudget - majorExec).replace('$', '')}
                                    </td>
                                </tr>

                                {/* Sub Categories */}
                                {Object.entries(subCats).map(([subCat, items]) => {
                                     const subBudget = items.reduce((s: number, i: any) => s + i.budgetTotal, 0);
                                     const subExec = items.reduce((s: number, i: any) => s + i.executedTotal, 0);
                                     const subMargin = subBudget > 0 ? ((subBudget - subExec) / subBudget) * 100 : 0;

                                     return (
                                        <Fragment key={`${majorCat}-${subCat}`}>
                                            {/* Sub Category Header */}
                                            <tr className="bg-[#f0f9ff] border-b border-blue-100">
                                                <td colSpan={2} className="px-4 py-2 font-bold text-[#0369a1] uppercase text-[10px] pl-8 group/cat min-w-[300px]">
                                                    <div className="flex items-center gap-3 w-full">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-[#0ea5e9]"></div>
                                                        {onRenameGroup ? (
                                                            <div className="flex-1">
                                                                <EditableCell 
                                                                    value={subCat}
                                                                    type="text"
                                                                    onSave={(val: any) => onRenameGroup(subCat, val, 'sub', { major: majorCat })}
                                                                    className="bg-transparent text-[#0369a1] font-bold uppercase text-[10px] focus:bg-blue-200/50"
                                                                    align="left"
                                                                />
                                                            </div>
                                                        ) : (
                                                            subCat
                                                        )}
                                                        {onAddItem && (
                                                            <button 
                                                                onClick={() => onAddItem(majorCat, subCat)}
                                                                className="ml-2 p-1 bg-blue-50 hover:bg-blue-100 rounded text-blue-600 border border-blue-200 shadow-sm transition-all active:scale-95 flex items-center gap-1 text-[9px]"
                                                                title="Agregar Recurso"
                                                            >
                                                                <Plus size={10} /> Nuevo Recurso
                                                            </button>
                                                        )}
                                                        {(onDeleteItems || onDeleteItem) && (
                                                            <button 
                                                                onClick={() => {
                                                                    if (window.confirm(`⚠️ PELIGRO - BORRADO GLOBAL ⚠️\n\n¿Eliminar la subcategoría '${subCat}' DEFINITIVAMENTE con TODOS sus ítems de la base de datos?`)) {
                                                                        const allIds = items.map((i: any) => i.id);
                                                                        if (onDeleteItems) {
                                                                            onDeleteItems(allIds);
                                                                        } else {
                                                                            allIds.forEach((id: string | number) => onDeleteItem?.(id));
                                                                        }
                                                                    }
                                                                }}
                                                                className="ml-2 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-all cursor-pointer z-[60] flex items-center gap-1 text-[9px]"
                                                                title="Eliminar Subcategoría Completa"
                                                            >
                                                                <Trash2 size={10} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-1 py-2 bg-[#f0f9ff]"></td>
                                                <td className="px-1 py-2 bg-[#f0f9ff]"></td>
                                                <td className="px-2 py-2 text-right font-bold text-[#0369a1] text-[10px]">
                                                    {currencyFormatter.format(subBudget).replace('$', '')}
                                                </td>
                                                <td className="px-1 py-2 bg-[#f0f9ff]"></td>
                                                
                                                <td className="px-1 py-2 bg-[#f0fdf4]"></td>
                                                <td className="px-1 py-2 bg-[#f0fdf4]"></td>
                                                <td className="px-2 py-2 text-right font-bold text-[#15803d] bg-[#f0fdf4] text-[10px]">
                                                    {currencyFormatter.format(subExec).replace('$', '')}
                                                </td>
                                                <td className="px-1 py-2 bg-[#f0fdf4]"></td>
                                                
                                                <td className="px-1 py-2 bg-[#f0f9ff]"></td>
                                                <td className="px-2 py-2 text-right font-bold text-rose-500 text-[10px]">
                                                    {currencyFormatter.format(subBudget - subExec).replace('$', '')}
                                                </td>
                                            </tr>

                                            {/* Items */}
                                            {items.map((item: any) => {
                                                const itemRowKey = `${majorCat}|${subCat}|${item.name}`;
                                                return (
                                                <tr key={itemRowKey} className="hover:bg-gray-50 transition-colors group text-[10px] border-b border-gray-50">
                                                    <td className="px-4 py-1.5 pl-10 group/row relative font-semibold text-gray-700">
                                                        {onUpdateItemValue ? (
                                                            <EditableCell 
                                                                value={item.name}
                                                                type="text"
                                                                onSave={(val: any) => onUpdateItemValue(item.groupId, item.id, 'name', val)}
                                                                className="text-gray-700"
                                                                align="left"
                                                            />
                                                        ) : (
                                                            <div className="truncate" title={item.name}>{item.name}</div>
                                                        )}
                                                        {(onDeleteItems || onDeleteItem) && (
                                                            <button 
                                                                onClick={() => {
                                                                    if (window.confirm(`⚠️ PELIGRO - BORRADO GLOBAL ⚠️\n\n¿Eliminar '${item.name}' DEFINITIVAMENTE de TODOS los sitios y de la base de datos?\n\nPensado para limpiar ítems viejos o duplicados.`)) {
                                                                        if (onDeleteItems) {
                                                                            onDeleteItems([item.id]);
                                                                        } else {
                                                                            onDeleteItem?.(item.id);
                                                                        }
                                                                    }
                                                                }}
                                                                className="absolute left-4 top-1/2 -translate-y-1/2 p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-opacity opacity-0 group-hover/row:opacity-100 cursor-pointer z-[60]"
                                                                title="Eliminar Recurso"
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        )}
                                                    </td>
                                                    <td className="px-1 py-1.5 text-center text-gray-500">
                                                        {onUpdateItemValue ? (
                                                            <EditableCell 
                                                                value={item.unit}
                                                                type="text"
                                                                onSave={(val: any) => onUpdateItemValue(item.groupId, item.id, unitColId, val)}
                                                            />
                                                        ) : (
                                                            item.unit
                                                        )}
                                                    </td>
                                                    
                                                    {/* Budget Columns */}
                                                    <td className="px-1 py-1.5 font-medium text-gray-700 bg-blue-50/10">
                                                        {onUpdateItemValue ? (
                                                            <EditableCell 
                                                                value={item.budgetQty}
                                                                type="number"
                                                                onSave={(val: any) => onUpdateItemValue(item.groupId, item.id, qtyColId, val)}
                                                                className="text-gray-700"
                                                                align="right"
                                                            />
                                                        ) : (
                                                            item.budgetQty.toLocaleString('es-CO')
                                                        )}
                                                    </td>
                                                    <td className="px-1 py-1.5 font-medium text-gray-700 bg-blue-50/10">
                                                        {onUpdateItemValue ? (
                                                            <EditableCell 
                                                                value={item.unitPrice}
                                                                type="number"
                                                                onSave={(val: any) => onUpdateItemValue(item.groupId, item.id, priceColId, val)}
                                                                className="text-gray-700"
                                                                align="right"
                                                            />
                                                        ) : (
                                                            currencyFormatter.format(item.unitPrice).replace('$', '')
                                                        )}
                                                    </td>
                                                    <td className="px-2 py-1.5 text-right font-black text-slate-800 bg-blue-50/20">
                                                        {currencyFormatter.format(item.budgetTotal).replace('$', '')}
                                                    </td>
                                                    <td className="px-1 py-1.5 text-center text-slate-500 bg-blue-50/10">
                                                        {totalBudget > 0 ? ((item.budgetTotal / totalBudget) * 100).toFixed(4) : 0}
                                                    </td>
 
                                                    {/* Execution Columns */}
                                                    <td className="px-1 py-1.5 bg-emerald-50/10">
                                                        {onUpdateItemValue ? (
                                                            <EditableCell 
                                                                value={item.executedQty}
                                                                type="number"
                                                                onSave={(val: any) => onUpdateItemValue(item.groupId, item.id, 'executed_qty', val)}
                                                                className="text-[#15803d] font-bold"
                                                                align="right"
                                                            />
                                                        ) : (
                                                            item.executedQty > 0 ? item.executedQty.toLocaleString('es-CO', { maximumFractionDigits: 1 }) : '0'
                                                        )}
                                                    </td>
                                                    <td className="px-1 py-1.5 font-medium text-[#15803d] bg-emerald-50/10 text-right">
                                                        {/* Execution unit price is the same as budget for simplicity unless handled otherwise */}
                                                        {currencyFormatter.format(item.unitPrice).replace('$', '')}
                                                    </td>
                                                    <td className={`px-2 py-1.5 text-right font-black bg-emerald-50/20 ${item.executedTotal > item.budgetTotal ? 'text-red-600' : 'text-[#15803d]'}`}>
                                                        {item.executedTotal > 0 ? currencyFormatter.format(item.executedTotal).replace('$', '') : '0'}
                                                    </td>
                                                     <td className="px-1 py-1.5 text-center bg-gray-50/50">
                                                         <span className={`${item.compliance >= 70 ? 'text-emerald-600' : item.compliance >= 65 ? 'text-amber-500' : 'text-rose-500'} font-bold`}>
                                                             {item.compliance.toFixed(1)}%
                                                         </span>
                                                     </td>
                                                    
                                                    {/* Observaciones & Diferencia */}
                                                    <td className="px-2 py-1.5 text-slate-500 text-left truncate max-w-[150px]" title={item.observaciones}>
                                                        {onUpdateItemValue ? (
                                                            <EditableCell 
                                                                value={item.observaciones}
                                                                type="text"
                                                                onSave={(val: any) => onUpdateItemValue(item.groupId, item.id, 'observaciones', val)}
                                                                className="text-slate-500"
                                                                align="left"
                                                            />
                                                        ) : (
                                                            item.observaciones
                                                        )}
                                                    </td>
                                                    <td className={`px-2 py-1.5 text-right font-black ${item.budgetTotal - item.executedTotal < 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                                                        {currencyFormatter.format(item.budgetTotal - item.executedTotal).replace('$', '')}
                                                     </td>
                                                 </tr>
                                                );
                                             })}
                                         </Fragment>
                                      );
                                })}
                            </Fragment>
                        );
                    })}
                </tbody>

                <tfoot className="border-t-4 border-[#1e293b]">
                     <tr className="bg-slate-800 text-white/90 border-t border-slate-700">
                         <td colSpan={2} className="px-6 py-2 font-black text-right uppercase text-[10px] pr-6">TOTAL COSTO DIRECTO</td>
                         <td className="px-2 py-2"></td><td className="px-2 py-2"></td>
                         <td className="px-2 py-2 text-right font-black text-[11px] bg-slate-700/30">{currencyFormatter.format(totalBudget)}</td>
                         <td className="px-2 py-2 text-center font-bold text-[10px]">100%</td>
                         <td className="px-2 py-2"></td><td className="px-2 py-2"></td>
                         <td className="px-2 py-2 text-right font-black text-[11px] bg-slate-700/30">{currencyFormatter.format(totalExecuted)}</td>
                         <td className="px-2 py-2 text-center font-bold text-[10px]">100%</td>
                         <td className="px-2 py-2"></td><td className="px-2 py-2 text-right font-bold text-rose-300 text-[11px]">{currencyFormatter.format(totalBudget - totalExecuted)}</td>
                     </tr>
                     
                     {/* 2. AIU Rows */}
                     <tr className="bg-[#334155] text-white/80 border-t border-slate-600">
                         <td colSpan={2} className="px-6 py-1.5 font-bold text-right uppercase text-[10px] pr-6">A (20%)</td>
                         <td className="px-2 py-1.5"></td><td className="px-2 py-1.5"></td>
                         <td className="px-2 py-1.5 text-right font-bold text-[11px]">{currencyFormatter.format(totalBudget * 0.2)}</td>
                         <td className="px-2 py-1.5 text-center font-bold text-[10px]">20%</td>
                         <td className="px-2 py-1.5"></td><td className="px-2 py-1.5"></td>
                         <td className="px-2 py-1.5 text-right font-bold text-[11px]">{currencyFormatter.format(totalExecuted * 0.2)}</td>
                         <td className="px-2 py-1.5 text-center font-bold text-[10px]">20%</td>
                         <td className="px-2 py-1.5"></td><td className="px-2 py-1.5 text-right font-bold text-rose-300 text-[11px]">{currencyFormatter.format((totalBudget - totalExecuted) * 0.2)}</td>
                     </tr>
                     <tr className="bg-[#334155] text-white/80">
                         <td colSpan={2} className="px-6 py-1.5 font-bold text-right uppercase text-[10px] pr-6">I (5%)</td>
                         <td className="px-2 py-1.5"></td><td className="px-2 py-1.5"></td>
                         <td className="px-2 py-1.5 text-right font-bold text-[11px]">{currencyFormatter.format(totalBudget * 0.05)}</td>
                         <td className="px-2 py-1.5 text-center font-bold text-[10px]">5%</td>
                         <td className="px-2 py-1.5"></td><td className="px-2 py-1.5"></td>
                         <td className="px-2 py-1.5 text-right font-bold text-[11px]">{currencyFormatter.format(totalExecuted * 0.05)}</td>
                         <td className="px-2 py-1.5 text-center font-bold text-[10px]">5%</td>
                         <td className="px-2 py-1.5"></td><td className="px-2 py-1.5 text-right font-bold text-rose-300 text-[11px]">{currencyFormatter.format((totalBudget - totalExecuted) * 0.05)}</td>
                     </tr>
                     <tr className="bg-[#334155] text-white/80">
                         <td colSpan={2} className="px-6 py-1.5 font-bold text-right uppercase text-[10px] pr-6">U (5%)</td>
                         <td className="px-2 py-1.5"></td><td className="px-2 py-1.5"></td>
                         <td className="px-2 py-1.5 text-right font-bold text-[11px]">{currencyFormatter.format(totalBudget * 0.05)}</td>
                         <td className="px-2 py-1.5 text-center font-bold text-[10px]">5%</td>
                         <td className="px-2 py-1.5"></td><td className="px-2 py-1.5"></td>
                         <td className="px-2 py-1.5 text-right font-bold text-[11px]">{currencyFormatter.format(totalExecuted * 0.05)}</td>
                         <td className="px-2 py-1.5 text-center font-bold text-[10px]">5%</td>
                         <td className="px-2 py-1.5"></td><td className="px-2 py-1.5 text-right font-bold text-rose-300 text-[11px]">{currencyFormatter.format((totalBudget - totalExecuted) * 0.05)}</td>
                     </tr>

                     {/* VALOR ACTA FACTURADO */}
                     <tr className="bg-slate-900 text-white border-t border-slate-700">
                         <td colSpan={2} className="px-6 py-3 font-bold text-right uppercase text-[11px] flex items-center justify-end gap-2 w-full pr-6">
                            <span className="text-emerald-400 mr-2">VALOR ACTA FACTURADO:</span>
                            {onUpdateActa ? (
                              <div className="w-32 inline-block">
                                 <EditableCell 
                                     value={totalActa}
                                     type="number"
                                     onSave={(val: any) => onUpdateActa(val)}
                                     className="bg-slate-800 text-emerald-400 font-black text-sm px-2 py-1.5 rounded focus:bg-slate-700 border border-slate-700"
                                     align="right"
                                 />
                              </div>
                            ) : (
                                <span className="text-emerald-400 font-black text-sm">{currencyFormatter.format(currentActa || 0)}</span>
                            )}
                         </td>
                         <td className="px-2 py-3 bg-slate-900"></td><td className="px-2 py-3 bg-slate-900"></td>
                         <td className="px-2 py-3 text-right font-black text-white text-[12px]">{currencyFormatter.format(totalBudget * 1.30)}</td>
                         <td className="px-2 py-3 text-center font-bold text-[10px]">Total</td>
                         <td className="px-2 py-3 bg-slate-900"></td><td className="px-2 py-3 bg-slate-900"></td>
                         <td className="px-2 py-3 text-right font-black text-white text-[12px]">{currencyFormatter.format(currentActa || (totalExecuted * 1.30))}</td>
                         <td className="px-2 py-3 text-center font-bold text-[10px]">Total</td>
                         <td className="px-2 py-3 bg-slate-900"></td><td className="px-2 py-3 bg-slate-900"></td>
                     </tr>

                     {/* COSTO / FACTURACION & UTILIDAD */}
                     <tr className="bg-slate-800 border-t border-slate-700">
                         <td colSpan={2} className="px-6 py-2 font-bold text-right text-[10px] text-slate-300 pr-6">UB / COSTO DIRECTO</td>
                         <td className="px-2 py-2"></td><td className="px-2 py-2"></td>
                         <td className="px-2 py-2 text-right font-bold text-blue-300">
                            {currentActa > 0 ? (((currentActa - totalBudget) / totalBudget) * 100).toFixed(2) : 0}%
                         </td>
                         <td className="px-2 py-2"></td><td className="px-2 py-2"></td><td className="px-2 py-2"></td>
                         <td className="px-2 py-2 text-right font-bold text-blue-300">
                            {totalExecuted > 0 ? (((currentActa - totalExecuted) / totalExecuted) * 100).toFixed(2) : 0}%
                         </td>
                         <td className="px-2 py-2"></td><td className="px-2 py-2"></td><td className="px-2 py-2"></td>
                     </tr>
                     <tr className="bg-slate-800">
                         <td colSpan={2} className="px-6 py-2 font-bold text-right text-[10px] text-slate-300 pr-6">COSTO / FACTURACION</td>
                         <td className="px-2 py-2"></td><td className="px-2 py-2"></td>
                         <td className="px-2 py-2 text-right font-bold text-white">
                            {currentActa > 0 ? ((totalBudget / currentActa) * 100).toFixed(2) : 0}%
                         </td>
                         <td className="px-2 py-2"></td><td className="px-2 py-2"></td><td className="px-2 py-2"></td>
                         <td className="px-2 py-2 text-right font-bold text-white">
                            {currentActa > 0 ? ((totalExecuted / currentActa) * 100).toFixed(2) : 0}%
                         </td>
                         <td className="px-2 py-2"></td><td className="px-2 py-2"></td><td className="px-2 py-2"></td>
                     </tr>
                     <tr className="bg-slate-900 border-t-2 border-slate-700">
                         <td colSpan={2} className="px-6 py-4 font-black text-right uppercase text-[12px] flex items-center justify-end w-full pr-6 text-white">
                            UTILIDAD SOBRE ACTA
                         </td>
                         <td className="px-2 py-4"></td><td className="px-2 py-4"></td>
                         <td className="px-2 py-4 text-right">
                             {/* Budget Utility */}
                         </td>
                         <td className="px-2 py-4"></td><td className="px-2 py-4"></td><td className="px-2 py-4"></td>
                         <td colSpan={2} className="px-2 py-4 text-center">
                             {/* Utility Logic: > 70 Green, 65-70 Yellow, <65 Red */}
                             {(() => {
                                 const utilityPct = currentActa > 0 ? (((currentActa - totalExecuted) / currentActa) * 100) : 0;
                                 let colorClass = utilityPct >= 70 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' 
                                                : utilityPct >= 65 ? 'bg-amber-500/20 text-amber-400 border-amber-500/50' 
                                                : 'bg-rose-500/20 text-rose-400 border-rose-500/50';
                                 return (
                                     <div className={`inline-block px-4 py-1.5 rounded-lg border-2 font-black text-lg ${colorClass}`}>
                                         {utilityPct.toFixed(2)}%
                                     </div>
                                 );
                             })()}
                         </td>
                         <td className="px-2 py-4"></td><td className="px-2 py-4"></td>
                     </tr>
                </tfoot>
            </table>
                </div>
            </div>
        </div>
    </div>
  );
}
