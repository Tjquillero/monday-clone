'use client';

import { Fragment, useMemo, useState, useEffect } from 'react';
import { Group, Item, Column } from '@/types/monday';
import { ChevronDown, ChevronRight, Save, Trash2, Plus, Download, Edit, Maximize2, Minimize2, MapPin } from 'lucide-react';

interface FinancialMatrixViewProps {
  groups: Group[];
  columns: Column[];
  onUpdateItemValue?: (groupId: string, itemId: number | string, columnId: string, value: any) => void;
  onAddItem?: (rubro: string, category: string, subSub?: string) => void;
  onDeleteItem?: (itemId: number | string) => void;
  onDeleteItems?: (itemIds: (number | string)[]) => void;
  onRenameGroup?: (oldName: string, newName: string, type: 'major' | 'sub' | 'subsub', context?: { major?: string, sub?: string }) => void;
  onAddGroup?: (type: 'major' | 'sub' | 'subsub', parentContext?: { major?: string, sub?: string }) => void;
  onAddSite?: () => void;
  valorActaPorSitio?: Record<string, number>;
  onUpdateValorActaPorSitio?: (val: Record<string, number>) => void;
}

// Estructura de categoría con subcategorías
interface CategoryWithSubs {
  name: string;
  subcategories: string[];
}

interface MatrixItem {
  id: string | number;
  name: string;
  unit: string;
  category: string;
  majorCategory: string;
  siteData: Record<string, SiteData>; // key is groupId
  allItemIds: (string | number)[];
}

interface EditableCellProps {
    value: string | number;
    type: 'text' | 'number';
    onSave: (val: any) => void;
    className?: string;
    step?: string;
    align?: 'left' | 'center' | 'right';
    readonly?: boolean;
}

const EditableCell = ({ value, type, onSave, className = '', step = 'any', align = 'center', readonly = false }: EditableCellProps) => {
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

    if (readonly) {
        return (
            <div className={`w-full h-full flex items-center justify-${align === 'right' ? 'end' : align === 'left' ? 'start' : 'center'} min-h-[32px] px-1 ${className}`}>
                {value}
            </div>
        );
    }

    return (
        <div className="w-full h-full relative flex items-center justify-center min-h-[32px]">
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
                className={`w-full bg-transparent border border-transparent hover:border-blue-400 focus:border-blue-600 focus:bg-white focus:shadow-md focus:outline-none rounded transition-all py-1.5 px-1 cursor-text z-50 text-${align} ${className} ${isFocused ? 'ring-2 ring-blue-100 relative' : ''}`}
                style={{ pointerEvents: 'auto', outline: 'none' }}
            />
        </div>
    );
};

interface SiteData {
  itemId: string | number;
  groupId: string;
  budgetQty: number;
  unitPrice: number;
  budgetTotal: number;
  executedQty: number;
  executedTotal: number;
  reservedBudgetPct: number; // Percentage reserved on budget
  reservedExecutionPct: number; // Percentage reserved on execution
  compliance: number; // Percentage: (executedQty / budgetQty) × 100
  unit: string;
}

export default function FinancialMatrixView({ 
    groups, 
    columns, 
    onUpdateItemValue, 
    onAddItem, 
    onDeleteItem, 
    onDeleteItems,
    onRenameGroup, 
    onAddGroup, 
    onAddSite,
    valorActaPorSitio = {}, 
    onUpdateValorActaPorSitio 
}: FinancialMatrixViewProps) {
  
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // Categorías de costos configurables (DEPRECATED: Moved to Main Table DB Items)
  // We force empty array to hide the legacy footer section.
  const [costCategories, setCostCategories] = useState<CategoryWithSubs[]>([]);

  // Clear legacy storage
  useEffect(() => {
      if (typeof window !== 'undefined') {
          localStorage.removeItem('costCategories');
      }
  }, []);
  
  const [addingSubcategoryTo, setAddingSubcategoryTo] = useState<number | null>(null);
  const [newSubcategoryName, setNewSubcategoryName] = useState('');

  // Función para renombrar un ítem en TODOS los grupos donde existe
  const handleRenameMatrixItem = (item: MatrixItem, newName: string) => {
      if (!onUpdateItemValue) return;
      
      // Iterar por todos los sitios donde existe este ítem (según sus datos)
      Object.values(item.siteData).forEach(siteData => {
           onUpdateItemValue(siteData.groupId, siteData.itemId, "name", newName);
      });
  };

  const [viewMode, setViewMode] = useState<'budget' | 'execution'>('budget');
  const [isCanvasMode, setIsCanvasMode] = useState(false);

  const { hierarchicalData, currencyFormatter, qtyColId, priceColId, unitColId, execQtyColId } = useMemo(() => {
    // Helpers
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
        if (!s) return 0;
        
        // Handle Colombian/International formats: 38.574.000 or 38,574,000 or 38574000.00
        let clean = s.replace(/s/g, ''); // Remove spaces
        
        // If it has multiple dots, they are likely thousands
        if ((clean.match(/\./g) || []).length > 1) {
            clean = clean.replace(/\./g, '');
        }
        // If it has a comma and a dot, comma is likely thousands
        if (clean.includes(',') && clean.includes('.')) {
            clean = clean.replace(/,/g, '');
        } else if (clean.includes(',')) {
            clean = clean.replace(',', '.');
        }

        const n = parseFloat(clean.replace(/[^0-9.-]/g, ''));
        return isNaN(n) ? 0 : n;
    };

    // Column IDs
    const priceCol = columns.find(c => c.id === 'unit_price') || 
                    columns.find(c => ['p.u', 'v.u', 'unit price', 'precio unitario', 'valor unitario'].some(term => c.title.toLowerCase().includes(term))) ||
                    columns.find(c => ['precio', 'valor', 'costo'].some(term => c.title.toLowerCase().includes(term)) && !c.title.toLowerCase().includes('total')) || 
                    { id: 'unit_price' };

    const qtyCol = columns.find(c => c.id === 'cant' || c.id === 'quantity') ||
                   columns.find(c => ['cant', 'ppto', 'presupuesto'].some(term => c.title.toLowerCase().includes(term)) && !['ejec', 'real', 'avance'].some(term => c.title.toLowerCase().includes(term))) ||
                   { id: 'cant' };

    const unitCol = columns.find(c => c.id === 'unit') || 
                    columns.find(c => ['und', 'unidad', 'medida'].some(term => c.title.toLowerCase().includes(term))) || 
                    { id: 'unit' };

    const execQtyCol = columns.find(c => c.id === 'executed_qty') || 
                       columns.find(c => ['ejec', 'real', 'avance', 'cant e', 'cant. e'].some(term => c.title.toLowerCase().includes(term))) || 
                       { id: 'executed_qty' };

    const catCol = columns.find(c => c.id === 'category' || c.title.toLowerCase().includes('categ')) || { id: 'category' };
    const typeCol = columns.find(c => c.id !== catCol.id && ['rubro', 'tipo', 'clase', 'grupo', 'type'].some(term => c.title.toLowerCase().includes(term))) || { id: 'rubro' };

    // Process items
    const itemsMap = new Map<string, MatrixItem>();

    const processItem = (item: Item, groupId: string) => {
        // Process sub-items first if any
        if (item.subItems && item.subItems.length > 0) {
            item.subItems.forEach(sub => processItem(sub, groupId));
        }

        const name = item.name;
        const values = item.values || {};
        const category = safeText(values[catCol.id]) || 'Sin Categoría';
        const majorCategory = safeText(values[typeCol.id]) || 'Otros Costos Directos';
        const subCatVal = values.sub_category || 'General';
        
        // ItemKey MUST include the hierarchy to prevent merging items with same name (like "General") from different groups
        const itemKey = `${majorCategory}|${category}|${subCatVal}|${name}`;
        const unit = safeText(values[unitCol.id]) || 'Und';
        
        const unitPrice = values[priceCol.id] !== undefined ? safeNumber(values[priceCol.id]) : (values.unit_price || 0);
        const budgetQty = values[qtyCol.id] !== undefined ? safeNumber(values[qtyCol.id]) : (values.cant || 0);
        const budgetTotal = unitPrice * budgetQty;

        // Execution calculation
        const manualExec = values[execQtyCol.id] !== undefined ? safeNumber(values[execQtyCol.id]) : (values.executed_qty !== undefined ? safeNumber(values.executed_qty) : undefined);
        const dailyExec = values['daily_execution'] || {};
        const executedQty = manualExec !== undefined ? manualExec : Object.values(dailyExec).reduce((acc: number, val: any) => {
             const v = typeof val === 'object' ? (val.val || 0) : (parseFloat(val) || 0);
             return acc + v;
        }, 0);
        const executedTotal = unitPrice * executedQty;
        
        const reservedBudgetPct = values['reserved_budget_pct'] ? safeNumber(values['reserved_budget_pct']) : 0;
        const reservedExecutionPct = values['reserved_execution_pct'] ? safeNumber(values['reserved_execution_pct']) : 0;
        
        const compliance = budgetQty > 0 ? ((budgetQty - executedQty) / budgetQty) * 100 : 0;

        if (!itemsMap.has(itemKey)) {
            itemsMap.set(itemKey, {
                id: item.id,
                name: item.name,
                unit,
                category,
                majorCategory,
                siteData: {},
                allItemIds: []
            });
        }

        const matrixItem = itemsMap.get(itemKey)!;
        matrixItem.allItemIds.push(item.id);

        if (!matrixItem.siteData[groupId]) {
            matrixItem.siteData[groupId] = {
                itemId: item.id,
                groupId,
                budgetQty: 0,
                unitPrice: unitPrice,
                budgetTotal: 0,
                executedQty: 0,
                executedTotal: 0,
                reservedBudgetPct: 0,
                reservedExecutionPct: 0,
                compliance: 0,
                unit,
            };
        }

        const siteData = matrixItem.siteData[groupId];
        siteData.budgetQty += budgetQty;
        siteData.budgetTotal += budgetTotal;
        siteData.executedQty += executedQty;
        siteData.executedTotal += executedTotal;
        
        // Use max value for percentages or average? Max is usually safer for warnings
        siteData.reservedBudgetPct = Math.max(siteData.reservedBudgetPct, reservedBudgetPct);
        siteData.reservedExecutionPct = Math.max(siteData.reservedExecutionPct, reservedExecutionPct);
        
        // Recalculate compliance for the aggregate
        siteData.compliance = siteData.budgetQty > 0 ? ((siteData.budgetQty - siteData.executedQty) / siteData.budgetQty) * 100 : 0;
    };

    groups.forEach(g => g.items.forEach(i => processItem(i, g.id)));

    // Hierarchical grouping
    const hierarchical: Record<string, Record<string, Record<string, MatrixItem[]>>> = {};

    // Create a fast lookup for sub-categories
    const subCategoryLookup = new Map<string, string>();
    groups.forEach(g => {
        g.items.forEach(i => {
            subCategoryLookup.set(String(i.id), i.values?.sub_category || 'General');
            if (i.subItems) {
                i.subItems.forEach(si => subCategoryLookup.set(String(si.id), si.values?.sub_category || 'General'));
            }
        });
    });

    itemsMap.forEach(item => {
        if (!hierarchical[item.majorCategory]) {
            hierarchical[item.majorCategory] = {};
        }
        if (!hierarchical[item.majorCategory][item.category]) {
            hierarchical[item.majorCategory][item.category] = {};
        }
        
        const subCatVal = subCategoryLookup.get(String(item.id)) || 'General';
        
        if (!hierarchical[item.majorCategory][item.category][subCatVal]) {
            hierarchical[item.majorCategory][item.category][subCatVal] = [];
        }
        
        hierarchical[item.majorCategory][item.category][subCatVal].push(item);
    });

    const currencyFormatter = new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0
    });

    return {
        hierarchicalData: hierarchical,
        currencyFormatter,
        qtyColId: qtyCol.id,
        priceColId: priceCol.id,
        unitColId: unitCol.id,
        execQtyColId: execQtyCol.id
    };

  }, [groups, columns]);

  const toggleCategory = (cat: string) => {
    setCollapsedCategories(prev => {
        const newSet = new Set(prev);
        if (newSet.has(cat)) newSet.delete(cat);
        else newSet.add(cat);
        return newSet;
    });
  };

  const currentMonth = new Date().toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }).toLowerCase();

  const { siteTotals, categoryTotals, subCategoryTotals } = useMemo(() => {
    const totals: Record<string, { 
        budgetTotal: number, 
        executedTotal: number,
        compliancePct: number
    }> = {};
    const catTotals: Record<string, Record<string, { budgetTotal: number, executedTotal: number }>> = {};
    const subTotals: Record<string, Record<string, { budgetTotal: number, executedTotal: number }>> = {};

    try {
      groups.forEach(g => {
          totals[g.id] = { 
              budgetTotal: 0, 
              executedTotal: 0,
              compliancePct: 0
          };
          catTotals[g.id] = {};
          subTotals[g.id] = {};
      });

      Object.values(hierarchicalData).forEach(subCats => {
          Object.entries(subCats).forEach(([subCatName, subSubCats]) => {
              Object.values(subSubCats).forEach(items => {
                  items.forEach(item => {
                      Object.entries(item.siteData).forEach(([siteId, data]) => {
                          if (totals[siteId]) {
                              totals[siteId].budgetTotal += data.budgetTotal;
                              totals[siteId].executedTotal += data.executedTotal;
                              
                              const catKey = item.majorCategory || 'Otros';
                              if (!catTotals[siteId][catKey]) {
                                  catTotals[siteId][catKey] = { budgetTotal: 0, executedTotal: 0 };
                              }
                              catTotals[siteId][catKey].budgetTotal += data.budgetTotal;
                              catTotals[siteId][catKey].executedTotal += data.executedTotal;

                              if (!subTotals[siteId][subCatName]) {
                                  subTotals[siteId][subCatName] = { budgetTotal: 0, executedTotal: 0 };
                              }
                              subTotals[siteId][subCatName].budgetTotal += data.budgetTotal;
                              subTotals[siteId][subCatName].executedTotal += data.executedTotal;
                          }
                      });
                  });
              });
          });
      });

      Object.keys(totals).forEach(siteId => {
          const t = totals[siteId];
          t.compliancePct = t.budgetTotal > 0 ? ((t.budgetTotal - t.executedTotal) / t.budgetTotal) * 100 : 0;
      });
    } catch (error) {
       console.error("Error calculating Financial Matrix totals:", error);
    }

    return { siteTotals: totals, categoryTotals: catTotals, subCategoryTotals: subTotals };
  }, [hierarchicalData, groups]);

  return (
    <div className={`transition-all duration-300 ${isCanvasMode ? 'fixed inset-0 z-[120] flex flex-col w-screen h-screen bg-slate-100' : 'flex flex-col h-full bg-white shadow-sm overflow-hidden rounded-xl border border-[#e1e4e8] pb-2'}`}>
        <div className={isCanvasMode ? "flex-1 overflow-auto p-8" : "flex flex-col h-full overflow-hidden"}>
          <div className={`${isCanvasMode ? "max-w-[1920px] mx-auto bg-white rounded-2xl shadow-2xl border border-slate-300 flex flex-col min-h-0 relative" : "flex flex-col h-full relative"}`} style={{ height: isCanvasMode ? 'auto' : 'auto' }}>
            <div className={`bg-[#2b579a] p-2 py-4 px-6 border-b border-gray-400 flex justify-between items-center text-xs text-white ${isCanvasMode ? 'rounded-t-2xl' : 'rounded-t-xl'}`}>
             <div className="flex items-center gap-4">
                 <button 
                     onClick={() => setIsCanvasMode(!isCanvasMode)}
                     className="p-2 rounded-xl border transition-all bg-[#1e3a8a] text-white border-[#3b82f6]/30 shadow-lg hover:bg-blue-800"
                     title={isCanvasMode ? "Salir de pantalla completa" : "Pantalla completa (Modo Canvas)"}
                 >
                     {isCanvasMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                 </button>
                  {onAddGroup && (
                     <button 
                         onClick={() => onAddGroup('major')}
                         className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg border transition-all bg-[#1e3a8a] border-[#3b82f6]/30 text-white shadow-lg hover:bg-[#2563eb]"
                     >
                         <Plus size={14} /> Rubro (Categoría)
                     </button>
                  )}
                  {onAddSite && (
                      <button 
                          onClick={onAddSite}
                          className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg border transition-all bg-emerald-700 border-emerald-500/30 text-white shadow-lg hover:bg-emerald-600"
                      >
                          <MapPin size={14} /> Añadir Sitio
                      </button>
                  )}
                 <span className="font-bold uppercase tracking-wider text-sm hidden sm:inline">Planilla de Control Financiero</span>
                 <div className="flex bg-[#1e3a8a] rounded-lg p-1 border border-[#3b82f6]/30">
                     <button 
                         onClick={() => setViewMode('budget')}
                         className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'budget' ? 'bg-white text-[#2b579a] shadow-sm' : 'text-white/80 hover:bg-white/10'}`}
                     >
                         PRESUPUESTO
                     </button>
                     <button 
                         onClick={() => setViewMode('execution')}
                         className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'execution' ? 'bg-[#10b981] text-white shadow-sm' : 'text-white/80 hover:bg-white/10'}`}
                     >
                         EJECUCIÓN
                     </button>
                 </div>
             </div>
              <div className="flex items-center gap-3">
                  <span className="text-white/70 font-medium">Período: {currentMonth.toUpperCase()}</span>
              </div>
          </div>

         <div className="overflow-auto flex-1 p-1 scrollbar-thin scrollbar-thumb-slate-300">
               <table className="w-full text-[10px] border-collapse select-text table-fixed">
                   <colgroup>
                       <col style={{ width: '320px' }} />
                       <col style={{ width: '50px' }} />
                       {[...groups, { id: 'total_proyecto' }].map(g => (
                           <Fragment key={g.id}>
                                    {viewMode === 'budget' ? (
                                        <>
                                            <col style={{ width: '100px', minWidth: '100px' }} />
                                            <col style={{ width: '150px', minWidth: '150px' }} />
                                            <col style={{ width: '180px', minWidth: '180px' }} />
                                            <col style={{ width: '110px', minWidth: '110px' }} />
                                        </>
                                    ) : (
                                        <>
                                            <col style={{ width: '100px', minWidth: '100px' }} />
                                            <col style={{ width: '150px', minWidth: '150px' }} />
                                            <col style={{ width: '180px', minWidth: '180px' }} />
                                            <col style={{ width: '110px', minWidth: '110px' }} />
                                        </>
                                    )}
                                </Fragment>
                       ))}
                   </colgroup>
                   <thead className="sticky top-0 z-20">
                      <tr className="bg-[#2b579a] text-white border-b-2 border-white">
                          <th rowSpan={2} className="p-2 border border-white sticky left-0 z-30 bg-[#2b579a] w-[320px] min-w-[320px] text-left font-bold rounded-tl-xl">
                              DESCRIPCIÓN DE RUBROS
                          </th>
                          <th rowSpan={2} className="p-2 border border-white bg-[#2b579a] w-[50px] min-w-[50px] text-center font-bold">
                              UND
                          </th>
                          {groups.map(group => (
                              <th key={group.id} colSpan={4} className="p-1 border border-white text-center font-bold bg-[#4472c4] min-w-[350px]">
                                  <div className="truncate px-2" title={group.title}>{group.title}</div>
                                  <div className="text-[9px] opacity-80 mt-0.5">{currentMonth.toUpperCase()}</div>
                              </th>
                          ))}
                          <th colSpan={4} className="p-1 border border-white text-center font-bold bg-[#1e293b] min-w-[700px] rounded-tr-xl sticky right-0 z-30 shadow-[-4px_0_8px_rgba(0,0,0,0.1)]">
                              TOTAL PROYECTO
                          </th>
                      </tr>
                      <tr className="bg-[#5b9bd5] text-white text-[9px]">
                          {[...groups, { id: 'total_proyecto' }].map(g => (
                               <Fragment key={g.id}>
                                   {viewMode === 'budget' ? (
                                        <>
                                            <th className={`p-1 border border-white text-center w-[100px] min-w-[100px] font-semibold ${g.id === 'total_proyecto' ? 'sticky right-[440px] z-20 bg-[#5b9bd5]' : ''}`}>CANT INST</th>
                                            <th className={`p-1 border border-white text-center w-[150px] min-w-[150px] font-semibold italic ${g.id === 'total_proyecto' ? 'sticky right-[290px] z-20 bg-[#5b9bd5]' : ''}`}>VLR PROMEDIO</th>
                                            <th className={`p-1 border border-white text-center w-[180px] min-w-[180px] font-semibold ${g.id === 'total_proyecto' ? 'sticky right-[110px] z-20 bg-[#5b9bd5]' : ''}`}>VLR TOTAL</th>
                                            <th className={`p-1 border border-white text-center w-[110px] min-w-[110px] font-bold bg-[#1e293b] text-blue-400 text-[11px] ${g.id === 'total_proyecto' ? 'sticky right-0 z-20 shadow-[-4px_0_12px_rgba(0,0,0,0.15)]' : ''}`}>INCIDENCIA</th>
                                        </>
                                   ) : (
                                        <>
                                            <th className={`p-1 border border-white text-center w-[100px] min-w-[100px] font-semibold bg-[#15803d] ${g.id === 'total_proyecto' ? 'sticky right-[440px] z-20 shadow-[-2px_0_4px_rgba(0,0,0,0.1)]' : ''}`}>CANT INST</th>
                                            <th className={`p-1 border border-white text-center w-[150px] min-w-[150px] font-semibold italic bg-[#15803d] ${g.id === 'total_proyecto' ? 'sticky right-[290px] z-20' : ''}`}>VLR PROMEDIO</th>
                                            <th className={`p-1 border border-white text-center w-[180px] min-w-[180px] font-semibold bg-[#15803d] ${g.id === 'total_proyecto' ? 'sticky right-[110px] z-20' : ''}`}>VLR TOTAL</th>
                                            <th className={`p-1 border border-white text-center w-[110px] min-w-[110px] font-bold bg-[#064e3b] text-emerald-400 text-[11px] ${g.id === 'total_proyecto' ? 'sticky right-0 z-20 shadow-[-4px_0_12px_rgba(0,0,0,0.15)]' : ''}`}>INCIDENCIA</th>
                                        </>
                                   )}
                                </Fragment>
                          ))}
                      </tr>
                  </thead>
                  <tbody>
                      {Object.entries(hierarchicalData)
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
                          .map(([majorCat, subCats]) => (
                          <Fragment key={majorCat}>
                              <tr className="bg-[#1e293b] text-white font-bold hover:bg-[#334155] transition-colors group/major">
                                  <td colSpan={2 + ((groups.length + 1) * 4)} className="p-2 pl-3 text-xs uppercase tracking-wide border border-gray-600">
                                      <div className="flex items-center gap-2">
                                        <button onClick={() => toggleCategory(majorCat)} className="flex items-center gap-2 text-left">
                                            {collapsedCategories.has(majorCat) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                                        </button>
                                        <div className="flex-1" onClick={(e) => e.stopPropagation()}>
                                            <EditableCell 
                                                value={majorCat} 
                                                type="text" 
                                                onSave={(val) => onRenameGroup?.(majorCat, val, 'major')}
                                                className="bg-transparent text-white font-bold uppercase tracking-wide border-none focus:bg-white/10 w-full"
                                                align="left"
                                            />
                                        </div>
                                        <div className="flex items-center gap-1.5 px-2">
                                            {onAddGroup && (
                                                 <button 
                                                     onClick={() => onAddGroup?.('sub', { major: majorCat })}
                                                     className="p-1 bg-blue-600 hover:bg-blue-500 rounded text-white text-[9px] px-2 flex items-center gap-1 shadow-sm transition-all active:scale-95"
                                                 >
                                                     <Plus size={12} /> <span className="hidden lg:inline">Añadir Subcategoría</span>
                                                 </button>
                                            )}
                                            {onAddItem && (
                                                <button 
                                                    onClick={() => {
                                                        const name = prompt('Nombre del nuevo grupo (ej: OPERATIVOS):');
                                                        if (name) onAddItem(majorCat, 'General', name);
                                                    }}
                                                    className="bg-[#8b5cf6] hover:bg-purple-500 text-white p-1 rounded text-[9px] font-bold flex items-center gap-1 px-2 transition-all shadow-sm"
                                                    title="Crear Grupo en General (Nivel 3)"
                                                >
                                                    <Plus size={11} /> Grupo
                                                </button>
                                            )}
                                            {onAddItem && (
                                                <button 
                                                    onClick={() => onAddItem(majorCat, 'General')}
                                                    className="bg-[#10b981] hover:bg-emerald-500 text-white p-1 rounded text-[9px] font-bold flex items-center gap-1 px-2 transition-all shadow-sm"
                                                    title="Agregar ítem directo"
                                                >
                                                    <Plus size={11} /> Ítem
                                                </button>
                                            )}
                                            {onDeleteItem && (
                                                <button 
                                                    onClick={() => {
                                                        const allIds = Object.values(subCats).flatMap((ssCats: any) => 
                                                            Object.values(ssCats).flat().flatMap((item: any) => 
                                                                Object.values(item.siteData).map((sd: any) => sd.itemId)
                                                            )
                                                        );
                                                        if (onDeleteItems) {
                                                            onDeleteItems(allIds);
                                                        } else {
                                                            allIds.forEach((id: string | number) => onDeleteItem(id));
                                                        }
                                                    }}
                                                    className="bg-rose-500 hover:bg-rose-600 text-white p-1 rounded transition-all shadow-sm cursor-pointer z-[60] relative"
                                                    title="Eliminar Rubro Completo"
                                                >
                                                    <Trash2 size={11} />
                                                </button>
                                            )}
                                        </div>
                                      </div>
                                  </td>
                              </tr>

                              {!collapsedCategories.has(majorCat) && Object.entries(subCats).map(([subCat, subSubCats]) => {
                                  const isGeneral = subCat === 'General';
                                  
                                  return (
                                  <Fragment key={`sub-${majorCat}-${subCat}`}>
                                      {!isGeneral && (
                                      <tr className="bg-slate-50/80 border-b border-slate-100">
                                          <td colSpan={2 + ((groups.length + 1) * 4)} className="p-1 px-3 pl-8 text-[10px] font-bold text-slate-600 uppercase border border-slate-200/50">
                                              <div className="flex items-center gap-2 group/subcat w-full">
                                                  <div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div>
                                                  <div className="flex-1">
                                                      <EditableCell 
                                                          value={subCat} 
                                                          type="text" 
                                                          onSave={(val) => onRenameGroup?.(subCat, val, 'sub', { major: majorCat })} 
                                                          className="bg-transparent text-slate-700 font-bold uppercase border-none focus:bg-white w-full h-6"
                                                          align="left" 
                                                      />
                                                  </div>
                                                  <div className="flex items-center gap-1.5 px-2">
                                                      {onAddGroup && (
                                                          <button 
                                                              onClick={() => onAddGroup('subsub', { major: majorCat, sub: subCat })}
                                                              className="ml-2 p-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-600 border border-slate-300 shadow-sm transition-all active:scale-95 flex items-center gap-1 text-[9px]"
                                                              title="Añadir Grupo"
                                                          >
                                                              <Plus size={10} /> <span className="hidden lg:inline">Nuevo Grupo</span>
                                                          </button>
                                                      )}
                                                      {onAddItem && (
                                                          <button 
                                                              onClick={() => onAddItem(majorCat, subCat)}
                                                              className="p-1 px-2 border border-slate-200 bg-white hover:bg-slate-50 rounded text-slate-500 text-[9px] font-bold transition-all flex items-center gap-1 shadow-sm"
                                                              title="Añadir Recurso"
                                                          >
                                                              <Plus size={10} className="text-emerald-400" /> Ítem
                                                          </button>
                                                      )}
                                                      {onDeleteItem && (
                                                          <button 
                                                              onClick={() => {
                                                                  if (window.confirm(`⚠️ PELIGRO - BORRADO GLOBAL ⚠️\n\n¿Eliminar la subcategoría '${subCat}' DEFINITIVAMENTE con TODOS sus ítems de la base de datos?`)) {
                                                                       const allIds = Object.values(subSubCats as any).flat().flatMap((i: any) => Object.values(i.siteData).map((sd: any) => sd.itemId));
                                                                       if (onDeleteItems) {
                                                                           onDeleteItems(allIds);
                                                                       } else {
                                                                           allIds.forEach((id: string | number) => onDeleteItem(id));
                                                                       }
                                                                  }
                                                              }}
                                                              className="ml-1 p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded transition-all cursor-pointer z-[60] relative"
                                                              title="Eliminar Subcategoría Completa"
                                                          >
                                                              <Trash2 size={12} />
                                                          </button>
                                                      )}
                                                  </div>
                                              </div>
                                          </td>
                                      </tr>
                                      )}

                                      {Object.entries(subSubCats).map(([subSubCat, items]) => {
                                           const isGeneralSub = subSubCat === 'General';
                                           return (
                                               <Fragment key={`subsub-${majorCat}-${subCat}-${subSubCat}`}>
                                                   {!isGeneralSub && (
                                                       <tr className="bg-white border-b border-slate-100/60">
                                                            <td colSpan={2 + ((groups.length + 1) * 4)} className="p-1 px-3 pl-12 text-[9px] font-bold text-slate-400 uppercase tracking-tight">
                                                                <div className="flex items-center gap-2 group/subsub border-l-2 border-slate-100 ml-1 pl-2">
                                                                    <span className="text-slate-300">↳</span>
                                                                    <div className="flex-1 bg-slate-50/50 rounded-md">
                                                                        <EditableCell 
                                                                            value={subSubCat} 
                                                                            type="text" 
                                                                            onSave={(val) => onRenameGroup?.(subSubCat, val, 'subsub', { major: majorCat, sub: subCat })} 
                                                                            className="text-slate-500 font-bold tracking-tight" 
                                                                            align="left" 
                                                                        />
                                                                    </div>
                                                                    {(onDeleteItems || onDeleteItem) && (
                                                                        <button 
                                                                            onClick={() => {
                                                                                if (window.confirm(`⚠️ PELIGRO - BORRADO GLOBAL ⚠️\n\n¿Eliminar '${subSubCat}' DEFINITIVAMENTE con TODOS sus ítems de la base de datos?`)) {
                                                                                    const allIds = (items as any[]).flatMap(i => Object.values(i.siteData).map((sd: any) => sd.itemId));
                                                                                    if (onDeleteItems) {
                                                                                        onDeleteItems(allIds);
                                                                                    } else {
                                                                                       allIds.forEach((id: string | number) => onDeleteItem?.(id));
                                                                                    }
                                                                                }
                                                                            }}
                                                                            className="p-1 text-slate-300 hover:text-red-500 hover:bg-rose-50 rounded transition-all transition-opacity opacity-0 group-hover/subsub:opacity-100 cursor-pointer z-[60] relative"
                                                                            title="Eliminar Grupo Completo"
                                                                        >
                                                                            <Trash2 size={10} />
                                                                        </button>
                                                                    )}
                                                                    {onAddItem && (
                                                                        <button 
                                                                            onClick={() => onAddItem(majorCat, subCat, subSubCat)}
                                                                            className="ml-2 p-1 border border-slate-100 hover:border-slate-300 rounded text-slate-400 opacity-60 hover:opacity-100 transition-all shadow-sm bg-white"
                                                                            title="Añadir ítem al grupo"
                                                                        >
                                                                            <Plus size={10} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                       </tr>
                                                   )}

                                                   {(items as any[]).map((item, idx) => {
                                                       const itemRowKey = `${majorCat}|${subCat}|${subSubCat}|${item.name}`;
                                                       return (
                                                       <tr key={itemRowKey} className={`hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/20'}`}>
                                                           <td className="p-0 border border-slate-200/60 sticky left-0 bg-inherit z-10 text-gray-800 text-[11px] group/row" title={item.name}>
                                                               <div className="relative w-full h-full pl-2">
                                                                   <EditableCell value={item.name} type="text" onSave={(val) => handleRenameMatrixItem(item, val)} className="text-gray-800 font-medium" align="left" />
                                                                   {(onDeleteItems || onDeleteItem) && (
                                                                       <button 
                                                                           onClick={() => {
                                                                               if (window.confirm(`⚠️ PELIGRO - BORRADO GLOBAL ⚠️\n\n¿Eliminar '${item.name}' DEFINITIVAMENTE de TODOS los sitios y de la base de datos?\n\nPensado para limpiar ítems viejos o duplicados.`)) {
                                                                                     const allIds = item.allItemIds;
                                                                                    if (onDeleteItems) {
                                                                                        onDeleteItems(allIds);
                                                                                    } else {
                                                                                        allIds.forEach((id: string | number) => onDeleteItem?.(id));
                                                                                    }
                                                                               }
                                                                           }}
                                                                           className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded opacity-60 group-hover/row:opacity-100 transition-opacity bg-white/80 cursor-pointer z-[60]"
                                                                           title="Eliminar de todos los sitios"
                                                                       >
                                                                           <Trash2 size={12} />
                                                                       </button>
                                                                   )}
                                                               </div>
                                                          </td>
                                                          <td className="p-0 border border-slate-200/60 bg-inherit z-10 text-gray-800 text-[11px] w-[50px] min-w-[50px]">
                                                              <EditableCell 
                                                                  value={item.unit} 
                                                                  type="text" 
                                                                  onSave={(val) => {
                                                                      const firstSite = Object.values(item.siteData)[0] as SiteData | undefined;
                                                                      if (firstSite) onUpdateItemValue?.(firstSite.groupId, firstSite.itemId, unitColId, val);
                                                                  }} 
                                                                  className="text-gray-600 font-medium text-center" 
                                                                  align="center" 
                                                              />
                                                          </td>
            
                                                           {[...groups, { id: 'total_proyecto' }].map((g: any) => {
                                                               const isTotal = g.id === 'total_proyecto';
                                                               let siteData: any;
                                                               
                                                               if (isTotal) {
                                                                   siteData = Object.values(item.siteData).reduce((acc: any, curr: any) => ({
                                                                       budgetQty: acc.budgetQty + curr.budgetQty,
                                                                       unitPrice: curr.unitPrice || acc.unitPrice, 
                                                                       budgetTotal: acc.budgetTotal + curr.budgetTotal,
                                                                       executedQty: acc.executedQty + curr.executedQty,
                                                                       executedTotal: acc.executedTotal + curr.executedTotal,
                                                                       unit: curr.unit || acc.unit
                                                                   }), { budgetQty: 0, unitPrice: 0, budgetTotal: 0, executedQty: 0, executedTotal: 0, unit: item.unit });
                                                                   siteData.compliance = siteData.budgetQty > 0 ? ((siteData.budgetQty - siteData.executedQty) / siteData.budgetQty) * 100 : 0;
                                                               } else {
                                                                   siteData = item.siteData[g.id] || {
                                                                       itemId: item.id,
                                                                       budgetQty: 0,
                                                                       unitPrice: 0,
                                                                       budgetTotal: 0,
                                                                       executedQty: 0,
                                                                       executedTotal: 0,
                                                                       compliance: 0,
                                                                       unit: item.unit 
                                                                   };
                                                               }
                                                               
                                                                 return (
                                                                   <Fragment key={g.id}>
                                                                      {viewMode === 'budget' ? (
                                                                          // --- BUDGET ONLY VIEW ---
                                                                          <>
                                                                            <td className={`p-1 border border-slate-200/60 w-[100px] min-w-[100px] ${isTotal ? 'bg-slate-100/50' : 'bg-blue-50/5'}`}>
                                                                                <EditableCell 
                                                                                   value={siteData.budgetQty}
                                                                                   type="number"
                                                                                   onSave={(val) => !isTotal && onUpdateItemValue?.(g.id, siteData.itemId, qtyColId, val)}
                                                                                   className={`text-slate-700 font-bold text-[11px] ${isTotal ? 'text-slate-900' : ''}`}
                                                                                   readonly={isTotal}
                                                                               />
                                                                            </td>
                                                                            <td className={`p-1 border border-slate-200/60 w-[150px] min-w-[150px] ${isTotal ? 'bg-slate-100/50' : 'bg-blue-50/10'}`}>
                                                                                <EditableCell 
                                                                                   value={siteData.unitPrice}
                                                                                   type="number"
                                                                                   onSave={(val) => !isTotal && onUpdateItemValue?.(g.id, siteData.itemId, priceColId, val)}
                                                                                   className={`text-gray-700 italic font-medium text-[11px] ${isTotal ? 'font-black' : ''}`}
                                                                                   align="right"
                                                                                   readonly={isTotal}
                                                                               />
                                                                            </td>
                                                                             <td className={`p-1 border border-slate-200/60 text-right font-bold text-[11px] w-[180px] min-w-[180px] ${isTotal ? 'bg-slate-200/40 text-slate-900' : 'bg-slate-50/10 text-slate-800'}`}>
                                                                                 {currencyFormatter.format(siteData.budgetTotal)}
                                                                             </td>
                                                                             <td className={`p-1 border border-slate-200/60 w-[110px] min-w-[110px] text-center text-[10px] font-black ${isTotal ? 'bg-slate-800 text-white' : 'text-blue-600'}`}>
                                                                                 <span className={siteData.compliance >= 70 ? 'text-emerald-500' : siteData.compliance >= 65 ? 'text-amber-500' : 'text-rose-500'}>
                                                                                     {siteData.compliance > 0 ? `${siteData.compliance.toFixed(1)}%` : '0.0%'}
                                                                                 </span>
                                                                             </td>
                                                                          </>
                                                                      ) : (
                                                                          // --- EXECUTION ONLY VIEW ---
                                                                          <>
                                                                            <td className={`p-1 border border-emerald-100/60 w-[100px] min-w-[100px] ${isTotal ? 'bg-[#d1fae5]/40' : 'bg-emerald-50/5'}`}>
                                                                                <EditableCell 
                                                                                   value={siteData.executedQty}
                                                                                   type="number"
                                                                                   onSave={(val) => !isTotal && onUpdateItemValue?.(g.id, siteData.itemId, execQtyColId, val)}
                                                                                   className={`text-emerald-700 font-mono font-bold text-[11px] ${isTotal ? 'text-emerald-950 px-1' : ''}`}
                                                                                   readonly={isTotal}
                                                                               />
                                                                            </td>
                                                                            <td className={`p-1 border border-emerald-100/60 w-[150px] min-w-[150px] ${isTotal ? 'bg-slate-100/50' : 'bg-blue-50/10'}`}>
                                                                                <EditableCell 
                                                                                   value={siteData.unitPrice}
                                                                                   type="number"
                                                                                   onSave={(val) => !isTotal && onUpdateItemValue?.(g.id, siteData.itemId, priceColId, val)}
                                                                                   className={`text-gray-600 italic font-medium text-[11px] ${isTotal ? 'font-black' : ''}`}
                                                                                   align="right"
                                                                                   readonly={isTotal}
                                                                               />
                                                                            </td>
                                                                             <td className={`p-1 border border-emerald-100/60 text-right font-bold text-[11px] w-[180px] min-w-[180px] ${isTotal ? 'bg-emerald-900 text-white' : 'text-emerald-800 bg-emerald-50/10'}`}>
                                                                                 {currencyFormatter.format(siteData.executedTotal)}
                                                                             </td>
                                                                              <td className={`p-1 border border-emerald-100/60 w-[110px] min-w-[110px] text-center text-[10px] font-black ${isTotal ? 'bg-emerald-900 text-white' : 'text-emerald-600 bg-emerald-50/10'} `}>
                                                                                 <span className={siteData.compliance >= 70 ? 'text-emerald-400' : siteData.compliance >= 65 ? 'text-amber-400' : 'text-rose-400'}>
                                                                                     {siteData.compliance > 0 ? `${siteData.compliance.toFixed(1)}%` : '0.0%'}
                                                                                 </span>
                                                                              </td>
                                                                           </>
                                                                       )}
                                                                     </Fragment>
                                                                  );
                                                                })}
                                                        </tr>
                                                      );
                                                   })}
                                               </Fragment>
                                           );
                                      })}
                                  </Fragment>
                                  );
                                })}

                           </Fragment>
                       ))}
                      
                      {onAddGroup && (
                        <tr>
                            <td colSpan={2 + ((groups.length + 1) * 4)} className="p-4 bg-gray-100 border-t border-gray-300 text-center">
                                <button 
                                    onClick={() => onAddGroup('major')}
                                    className="bg-white border-2 border-dashed border-gray-300 hover:border-blue-400 hover:text-blue-600 text-slate-400 font-bold py-2 px-6 rounded-lg transition-all flex items-center gap-2 mx-auto"
                                >
                                    <Plus size={16} /> Agregar Nueva Categoría Principal
                                </button>
                            </td>
                        </tr>
                      )}
                  </tbody>

                  <tfoot className="sticky bottom-0 z-20 text-[10px]">
                      <tr className="bg-[#1e293b] text-white font-bold border-t-2 border-[#0f172a]">
                          <td className="p-2 text-right uppercase tracking-[0.05em] sticky left-0 bg-[#1e293b] text-[10px] font-black border border-slate-700 shadow-[inset_-2px_0_0_0_#334155] w-[350px] min-w-[350px] rounded-bl-xl">TOTAL COSTO DIRECTO</td>
                          {[...groups, { id: 'total_proyecto' }].map(g => {
                              const isTotal = g.id === 'total_proyecto';
                              let totals: any;
                              if (isTotal) {
                                  totals = Object.values(siteTotals).reduce((acc: any, curr: any) => ({
                                      budgetTotal: acc.budgetTotal + curr.budgetTotal,
                                      executedTotal: acc.executedTotal + curr.executedTotal
                                  }), { budgetTotal: 0, executedTotal: 0 });
                                  totals.compliancePct = totals.budgetTotal > 0 ? ((totals.budgetTotal - totals.executedTotal) / totals.budgetTotal) * 100 : 0;
                                } else {
                                  totals = siteTotals[g.id];
                                }
                              const bgClass = isTotal ? 'bg-[#0f172a]' : 'bg-[#1e293b]';
                              return (
                                  <Fragment key={g.id}>
                                       {viewMode === 'budget' ? (
                                           <>
                                                <td className={`p-1 border border-slate-700 ${bgClass} ${isTotal ? 'sticky right-[440px] z-10' : ''}`}></td>
                                                <td className={`p-1 border border-slate-700 ${bgClass} ${isTotal ? 'sticky right-[290px] z-10' : ''}`}></td>
                                                <td className={`p-1 border border-slate-700 text-right font-bold w-[180px] min-w-[180px] ${isTotal ? 'sticky right-[110px] z-10 bg-[#0f172a] text-blue-400 font-black shadow-[-2px_0_4px_rgba(0,0,0,0.15)]' : 'text-slate-300'}`}>
                                                    {currencyFormatter.format(totals.budgetTotal)}
                                                </td>
                                                <td className={`p-1 border border-slate-700 text-center font-black w-[110px] min-w-[110px] ${isTotal ? 'sticky right-0 z-10 shadow-[-4px_0_8px_rgba(0,0,0,0.2)] bg-[#0f172a]' : ''} ${totals.compliancePct >= 70 ? 'text-[#4ade80]' : totals.compliancePct >= 65 ? 'text-yellow-400' : 'text-red-400'} ${isTotal ? 'rounded-br-xl' : ''}`}>
                                                    {totals.compliancePct.toFixed(1)}%
                                                </td>
                                           </>
                                       ) : (
                                           <>
                                                <td className={`p-1 border border-slate-700 ${bgClass} ${isTotal ? 'sticky right-[440px] z-10' : ''}`}></td>
                                                <td className={`p-1 border border-slate-700 ${bgClass} ${isTotal ? 'sticky right-[290px] z-10' : ''}`}></td>
                                                <td className={`p-1 border border-slate-700 text-right font-black w-[180px] min-w-[180px] ${isTotal ? 'sticky right-[110px] z-10 bg-[#064e3b] text-white shadow-[-2px_0_4px_rgba(0,0,0,0.2)]' : 'text-emerald-800'}`}>
                                                    {currencyFormatter.format(totals.executedTotal)}
                                                </td>
                                                <td className={`p-1 border border-slate-700 text-center font-black w-[110px] min-w-[110px] ${isTotal ? 'sticky right-0 z-10 bg-[#064e3b] text-white shadow-[-4px_0_8px_rgba(0,0,0,0.2)]' : ''} ${totals.compliancePct >= 70 ? 'text-[#4ade80]' : totals.compliancePct >= 65 ? 'text-yellow-400' : 'text-red-400'} ${isTotal ? 'rounded-br-xl' : ''}`}>
                                                    {totals.compliancePct.toFixed(1)}%
                                                </td>
                                           </>
                                       )}
                                   </Fragment>
                              );
                          })}
                      </tr>
                       
                       {/* Footer Meta Rows (AIU, Utilidad) */}
                       {[
                           { label: 'A (20%)', factor: 0.20, type: 'aiu' },
                           { label: 'I (5%)', factor: 0.05, type: 'aiu' },
                           { label: 'U (5%)', factor: 0.05, type: 'aiu' },
                           { label: 'VALOR ACTA FACTURADO', type: 'acta' },
                           { label: 'UB / COSTO DIRECTO', type: 'ub_cd' },
                           { label: 'COSTO / FACTURACION', type: 'costo_fac' },
                           { label: 'UTILIDAD SOBRE ACTA', type: 'utility' }
                       ].map((row_def, index) => (
                           <tr key={row_def.label} className={`border-t border-slate-700/50 ${row_def.type === 'acta' ? 'bg-slate-900 border-t-2 border-slate-700' : row_def.type === 'utility' ? 'bg-slate-900 border-t-2 border-slate-700' : 'bg-[#1e293b]'}`}>
                               <td className={`p-2 border border-slate-700 sticky left-0 z-20 text-right uppercase text-[10px] font-bold shadow-[4px_0_8px_rgba(0,0,0,0.2)] ${row_def.type === 'acta' || row_def.type === 'utility' ? 'bg-slate-900 text-emerald-400' : 'bg-[#0f172a] text-slate-300'}`}>
                                    {row_def.label}
                               </td>
                               {[...groups, { id: 'total_proyecto' }].map((g: any) => {
                                   const isTotal = g.id === 'total_proyecto';
                                   let siteT: any;
                                   if (isTotal) {
                                       siteT = Object.values(siteTotals).reduce((acc: any, curr: any) => ({
                                           budgetTotal: acc.budgetTotal + curr.budgetTotal,
                                           executedTotal: acc.executedTotal + curr.executedTotal
                                       }), { budgetTotal: 0, executedTotal: 0 });
                                   } else {
                                       siteT = siteTotals[g.id] || { budgetTotal: 0, executedTotal: 0 };
                                   }
                                   
                                   const siteActa = isTotal 
                                        ? Object.values(valorActaPorSitio || {}).reduce((a,b)=>a+b, 0) 
                                        : (valorActaPorSitio?.[g.id] || 0);

                                   const bTotal = siteT.budgetTotal;
                                   const eTotal = siteT.executedTotal;
                                   
                                   const bgClass = isTotal ? 'bg-[#0f172a]' : (row_def.type === 'acta' || row_def.type === 'utility' ? 'bg-slate-900' : 'bg-[#1e293b]');
                                   const totalClass = isTotal ? 'bg-[#0f172a]' : 'bg-[#0f172a]';
                                   
                                   let bValue = '';
                                   let eValue = '';
                                   let bPct = '';
                                   let ePct = '';
                                   let eWidget: any = null;
                                   let bWidget: any = null;
                                   
                                   if (row_def.type === 'aiu') {
                                       bValue = currencyFormatter.format(bTotal * row_def.factor!);
                                       eValue = currencyFormatter.format(eTotal * row_def.factor!);
                                       bPct = (row_def.factor! * 100).toFixed(0) + '%';
                                       ePct = (row_def.factor! * 100).toFixed(0) + '%';
                                   } else if (row_def.type === 'acta') {
                                       bValue = currencyFormatter.format(bTotal * 1.30);
                                       bPct = 'Total';
                                       ePct = 'Total';
                                       eWidget = (
                                           <div className="w-full flex justify-end">
                                               {onUpdateValorActaPorSitio && !isTotal ? (
                                                    <div className="w-[120px]">
                                                        <EditableCell 
                                                            value={siteActa || (eTotal * 1.30)}
                                                            type="number"
                                                            onSave={(val) => {
                                                                const newVal = { ...(valorActaPorSitio || {}) };
                                                                newVal[g.id] = val;
                                                                onUpdateValorActaPorSitio(newVal);
                                                            }}
                                                            className="bg-slate-800 text-emerald-400 font-bold px-1 rounded border border-slate-700 w-full hover:bg-slate-700 text-right"
                                                            align="right"
                                                        />
                                                    </div>
                                               ) : (
                                                    <span className="text-emerald-400 font-black tracking-wider text-[11px]">{currencyFormatter.format(siteActa || (eTotal * 1.30))}</span>
                                               )}
                                           </div>
                                       );
                                   } else if (row_def.type === 'ub_cd') {
                                       const resolvedActa = siteActa > 0 ? siteActa : (eTotal * 1.30);
                                       const ubToCd_b = bTotal > 0 ? ((resolvedActa - bTotal)/bTotal)*100 : 0;
                                       const ubToCd_e = eTotal > 0 ? ((resolvedActa - eTotal)/eTotal)*100 : 0;
                                       bValue = ubToCd_b.toFixed(2) + '%';
                                       eValue = ubToCd_e.toFixed(2) + '%';
                                   } else if (row_def.type === 'costo_fac') {
                                       const resolvedActa = siteActa > 0 ? siteActa : (eTotal * 1.30);
                                       const cf_b = resolvedActa > 0 ? (bTotal/resolvedActa)*100 : 0;
                                       const cf_e = resolvedActa > 0 ? (eTotal/resolvedActa)*100 : 0;
                                       bValue = cf_b.toFixed(2) + '%';
                                       eValue = cf_e.toFixed(2) + '%';
                                   } else if (row_def.type === 'utility') {
                                       const resolvedActa = siteActa > 0 ? siteActa : (eTotal * 1.30);
                                       const u_b = resolvedActa > 0 ? ((resolvedActa - bTotal)/resolvedActa)*100 : 0;
                                       const u_e = resolvedActa > 0 ? ((resolvedActa - eTotal)/resolvedActa)*100 : 0;
                                       
                                       const renderUtility = (pct: number) => {
                                            const cClass = pct >= 70 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' 
                                                         : pct >= 65 ? 'bg-amber-500/20 text-amber-400 border-amber-500/50' 
                                                         : 'bg-rose-500/20 text-rose-400 border-rose-500/50';
                                            return <div className={`inline-flex px-3 py-1 rounded-sm border-2 font-black ${cClass}`}>{pct.toFixed(2)}%</div>;
                                       };
                                       eWidget = renderUtility(u_e);
                                       // Only render utility result logically for the right place and empty spaces otherwise
                                   }
                                   
                                   const tc1 = row_def.type === 'acta' || row_def.type === 'utility' ? 'text-white' : 'text-slate-300';
                                   const tc2 = row_def.type === 'acta' || row_def.type === 'utility' ? 'text-emerald-400' : 'text-blue-300';
                                   
                                   // Sub rows do not need the sticky right shadow unless it's total
                                   const rWidth110 = isTotal ? 'sticky right-[110px] z-10' : '';
                                   const rWidth0 = isTotal ? 'sticky right-0 z-10' : '';
                                   const shadow110 = isTotal ? 'shadow-[-2px_0_4px_rgba(0,0,0,0.15)] bg-slate-900 border-l border-slate-700' : '';
                                   const shadow0 = isTotal ? 'shadow-[-4px_0_8px_rgba(0,0,0,0.2)] bg-slate-900' : '';
                                   
                                   return (
                                       <Fragment key={g.id}>
                                           {viewMode === 'budget' ? (
                                                <>
                                                 <td className={`p-1 border border-slate-700 ${bgClass} ${isTotal ? 'sticky right-[440px] z-10' : ''}`}></td>
                                                 <td className={`p-1 border border-slate-700 ${bgClass} ${isTotal ? 'sticky right-[290px] z-10' : ''}`}></td>
                                                 <td className={`p-1 border border-slate-700 text-right w-[180px] min-w-[180px] font-bold text-[11px] ${rWidth110} ${shadow110} ${tc1}`}>
                                                     {bWidget || bValue}
                                                 </td>
                                                 <td className={`p-1 border border-slate-700 text-center font-bold text-[10px] w-[110px] min-w-[110px] ${rWidth0} ${shadow0} ${tc1}`}>
                                                     {bPct}
                                                 </td>
                                                </>
                                           ) : (
                                                <>
                                                 <td className={`p-1 border border-slate-700 ${bgClass} ${isTotal ? 'sticky right-[440px] z-10' : ''}`}></td>
                                                 <td className={`p-1 border border-slate-700 ${bgClass} ${isTotal ? 'sticky right-[290px] z-10' : ''}`}></td>
                                                 <td className={`p-1 border border-slate-700 text-right w-[180px] min-w-[180px] font-black tracking-wide text-[11px] ${rWidth110} ${shadow110} ${tc1}`}>
                                                     {eWidget || eValue}
                                                 </td>
                                                 <td className={`p-1 border border-slate-700 text-center font-bold text-[10px] w-[110px] min-w-[110px] ${rWidth0} ${shadow0} ${tc1}`}>
                                                     {ePct}
                                                 </td>
                                                </>
                                           )}
                                       </Fragment>
                                   );
                               })}
                           </tr>
                       ))}
                   </tfoot>
                </table>
            </div>
          </div>
        </div>
    </div>
  );
}
