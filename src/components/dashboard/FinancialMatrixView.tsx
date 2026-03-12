
import React, { useState, useMemo, useEffect, Fragment } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  Layers, 
  ChevronRight, 
  ChevronDown,
  ChevronUp,
  CreditCard,
  Briefcase,
  Trash2,
  AlertCircle,
  Plus
} from 'lucide-react';
import { EditableCell } from '../common/EditableCell';

interface SiteData {
  groupId: string;
  itemId: string;
  budgetQty: number;
  unitPrice: number;
  budgetTotal: number;
  executedQty: number;
  executedTotal: number;
  compliance: number;
  unit: string;
}

interface ItemSummary {
  name: string;
  unit: string;
  siteData: { [key: string]: SiteData };
  allItemIds: string[];
}

interface CategoryWithSubs {
  id: string;
  label: string;
  subs: string[];
}

interface FinancialMatrixViewProps {
  groups: any[];
  columns: any[];
  onUpdateItemValue?: (groupId: string, itemId: string, columnId: string, value: any) => void;
  onAddItem?: (major: string, sub: string, subSub?: string) => void;
  onDeleteItem?: (itemId: string) => void;
  onDeleteItems?: (itemIds: string[]) => void;
  onRenameGroup?: (oldName: string, newName: string, type: 'major' | 'sub' | 'subsub', context?: { major?: string, sub?: string }) => void;
  onAddGroup?: (type: 'major' | 'sub' | 'subsub', parentContext?: { major?: string, sub?: string }) => void;
  onAddSite?: (title: string) => void;
  totalActa?: number;
  onUpdateActa?: (val: number) => void;
  valorActaPorSitio?: { [key: string]: number };
  onUpdateValorActaPorSitio?: (newVal: { [key: string]: number }) => void;
}

const qtyColId = 'cant';
const priceColId = 'unit_price';
const execQtyColId = 'executed_qty';
const unitColId = 'unit';

interface HierarchicalItem extends ItemSummary {
  majorCat: string;
  subCat: string;
  subSubCat: string;
}

interface Totals {
  budgetTotal: number;
  executedTotal: number;
  compliancePct: number;
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
    totalActa = 0,
    onUpdateActa,
    valorActaPorSitio = {}, 
    onUpdateValorActaPorSitio 
}: FinancialMatrixViewProps) {
  
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [costCategories, setCostCategories] = useState<CategoryWithSubs[]>([]);
  const [viewMode, setViewMode] = useState<'budget' | 'execution'>('execution');
  const [confirmDeleteSubSub, setConfirmDeleteSubSub] = useState<{name: string, itemIds: string[] } | null>(null);

  useEffect(() => {
      if (typeof window !== 'undefined') {
          localStorage.removeItem('costCategories');
      }
  }, []);
  
  const currentMonth = useMemo(() => {
      return new Date().toLocaleString('es-ES', { month: 'long' });
  }, []);

  const hierarchicalData = useMemo(() => {
    const data: { [major: string]: { [sub: string]: { [subSub: string]: ItemSummary[] } } } = {};
    
    groups.forEach(group => {
      group.items.forEach((item: any) => {
        const parts = item.name.split('|').map((s: string) => s.trim());
        let major = 'SIN CATEGORÍA';
        let sub = 'General';
        let subSub = 'Detalle';
        let itemName = item.name;

        if (parts.length >= 3) {
           major = parts[0];
           sub = parts[1];
           subSub = parts[2];
           itemName = parts.slice(3).join(' | ') || subSub;
        } else if (parts.length === 2) {
           major = parts[0];
           sub = parts[1];
           itemName = sub;
        }

        if (!data[major]) data[major] = {};
        if (!data[major][sub]) data[major][sub] = {};
        if (!data[major][sub][subSub]) data[major][sub][subSub] = [];

        let existing = data[major][sub][subSub].find(i => i.name === itemName);
        if (!existing) {
          existing = { name: itemName, unit: item.values?.[unitColId] || 'UND', siteData: {}, allItemIds: [] };
          data[major][sub][subSub].push(existing);
        }
        
        existing.allItemIds.push(item.id);
        
        const bQty = Number(item.values?.[qtyColId]) || 0;
        const uPrice = Number(item.values?.[priceColId]) || 0;
        const eQty = Number(item.values?.[execQtyColId]) || 0;
        
        existing.siteData[group.id] = {
          groupId: group.id,
          itemId: item.id,
          budgetQty: bQty,
          unitPrice: uPrice,
          budgetTotal: bQty * uPrice,
          executedQty: eQty,
          executedTotal: eQty * uPrice,
          compliance: bQty > 0 ? (eQty / bQty) * 100 : 0,
          unit: item.values?.[unitColId] || 'UND'
        };
      });
    });

    return data;
  }, [groups]);

  const { majorTotals, siteTotals } = useMemo(() => {
    const mT: { [major: string]: { [siteId: string]: Totals } } = {};
    const sT: { [siteId: string]: Totals } = {};

    groups.forEach(g => {
        sT[g.id] = { budgetTotal: 0, executedTotal: 0, compliancePct: 0 };
    });

    Object.entries(hierarchicalData).forEach(([major, subs]) => {
      mT[major] = {};
      Object.entries(subs).forEach(([sub, subSubs]) => {
        Object.entries(subSubs).forEach(([subSub, items]) => {
          items.forEach(item => {
            Object.entries(item.siteData).forEach(([siteId, data]) => {
              if (!mT[major][siteId]) mT[major][siteId] = { budgetTotal: 0, executedTotal: 0, compliancePct: 0 };
              mT[major][siteId].budgetTotal += data.budgetTotal;
              mT[major][siteId].executedTotal += data.executedTotal;
              
              if (sT[siteId]) {
                 sT[siteId].budgetTotal += data.budgetTotal;
                 sT[siteId].executedTotal += data.executedTotal;
              }
            });
          });
        });
      });
      
      Object.keys(mT[major]).forEach(siteId => {
          const t = mT[major][siteId];
          t.compliancePct = t.budgetTotal > 0 ? (t.executedTotal / t.budgetTotal) * 100 : 0;
      });
    });

    Object.keys(sT).forEach(siteId => {
        const t = sT[siteId];
        t.compliancePct = t.budgetTotal > 0 ? (t.executedTotal / t.budgetTotal) * 100 : 0;
    });

    return { majorTotals: mT, siteTotals: sT };
  }, [hierarchicalData, groups]);

  const handleRenameMatrixItem = (item: ItemSummary, newName: string) => {
      // In a real scenario, this would rename the item across all sites by parsing its original name parts
      // For now, we update the last part of the name
      console.log('Renaming matrix item', item.name, 'to', newName);
  };

  const calculateTotalItemData = (item: ItemSummary): SiteData => {
      return Object.values(item.siteData).reduce((acc, curr) => ({
          groupId: 'total_proyecto',
          itemId: 'total',
          budgetQty: acc.budgetQty + curr.budgetQty,
          unitPrice: curr.unitPrice, // average maybe?
          budgetTotal: acc.budgetTotal + curr.budgetTotal,
          executedQty: acc.executedQty + curr.executedQty,
          executedTotal: acc.executedTotal + curr.executedTotal,
          compliance: (acc.budgetQty + curr.budgetQty) > 0 ? ((acc.executedQty + curr.executedQty) / (acc.budgetQty + curr.budgetQty)) * 100 : 0,
          unit: curr.unit
      }), { budgetQty:0, unitPrice:0, budgetTotal:0, executedQty:0, executedTotal:0, compliance:0, itemId: '', groupId: '', unit: '' });
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 overflow-hidden font-sans">
           <div className="p-4 flex flex-wrap items-center justify-between gap-4 border-b border-slate-700 bg-slate-900/50 backdrop-blur-md sticky top-0 z-[60]">
               <div className="flex items-center gap-6">
                   <div className="flex flex-col">
                       <h2 className="text-xl font-black text-white flex items-center gap-2 tracking-tight">
                           <BarChart3 className="text-blue-400" size={24} />
                           MATRIZ FINANCIERA <span className="text-blue-500/50 text-sm font-medium">| RESUMEN EJECUTIVO</span>
                       </h2>
                   </div>
                   
                   <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 shadow-inner">
                       <button 
                         onClick={() => setViewMode('budget')}
                         className={`px-6 py-2 rounded-lg text-xs font-black transition-all duration-300 flex items-center gap-2 ${viewMode === 'budget' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40 ring-2 ring-blue-400/20' : 'text-slate-400 hover:text-white'}`}
                       >
                           <Briefcase size={14} /> PRESUPUESTO
                       </button>
                       <button 
                         onClick={() => setViewMode('execution')}
                         className={`px-6 py-2 rounded-lg text-xs font-black transition-all duration-300 flex items-center gap-2 ${viewMode === 'execution' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40 ring-2 ring-emerald-400/20' : 'text-slate-400 hover:text-white'}`}
                       >
                           <TrendingUp size={14} /> EJECUCIÓN
                       </button>
                   </div>
               </div>
               <div className="flex items-center gap-4">
                   <span className="text-slate-400 uppercase text-[10px] font-bold tracking-widest bg-slate-800 px-3 py-1 rounded-full border border-slate-700">Período: {currentMonth}</span>
               </div>
           </div>

           <div className="overflow-auto flex-1 p-2 bg-slate-950 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                <table className="w-max text-[10px] border-separate border-spacing-0 select-text table-fixed">
                    <colgroup>
                        <col style={{ width: '320px' }} />
                        <col style={{ width: '50px' }} />
                        {[...groups, { id: 'total_proyecto' }].map(g => (
                            <Fragment key={g.id}>
                                <col style={{ width: '100px' }} />
                                <col style={{ width: '150px' }} />
                                <col style={{ width: '180px' }} />
                                <col style={{ width: '110px' }} />
                            </Fragment>
                        ))}
                    </colgroup>
                    
                    <thead className="sticky top-0 z-[50]">
                       <tr className="bg-slate-800 text-white">
                           <th rowSpan={2} className="p-3 border border-slate-700 sticky left-0 z-[60] bg-slate-800 w-[320px] text-left font-black uppercase tracking-wider shadow-[4px_0_8px_rgba(0,0,0,0.3)]">
                               Descripción de Rubros
                           </th>
                           <th rowSpan={2} className="p-3 border border-slate-700 bg-slate-800 w-[50px] text-center font-black">
                               UND
                           </th>
                           {groups.map(group => (
                               <th key={group.id} colSpan={4} className="p-2 border border-slate-700 text-center font-black bg-blue-700/80 w-[540px]">
                                   <div className="text-xs truncate" title={group.title}>{group.title}</div>
                                   <div className="text-[9px] font-medium opacity-60 uppercase">{currentMonth}</div>
                               </th>
                           ))}
                           <th colSpan={4} className="p-2 border border-slate-700 text-center font-black bg-slate-700 w-[540px]">
                               TOTAL PROYECTO
                           </th>
                       </tr>
                       <tr className="bg-slate-700/50 text-slate-100 text-[9px] backdrop-blur-sm">
                           {[...groups, { id: 'total_proyecto' }].map(g => (
                                <Fragment key={g.id}>
                                    <th className={`p-2 border border-slate-700 text-center font-bold ${viewMode === 'execution' ? 'bg-emerald-900/40' : 'bg-blue-900/40'}`}>CANT INST</th>
                                    <th className={`p-2 border border-slate-700 text-center font-bold italic ${viewMode === 'execution' ? 'bg-emerald-900/40' : 'bg-blue-900/40'}`}>VLR PROMEDIO</th>
                                    <th className={`p-2 border border-slate-700 text-center font-bold ${viewMode === 'execution' ? 'bg-emerald-950 shadow-inner' : 'bg-blue-950 shadow-inner'}`}>VLR TOTAL</th>
                                    <th className="p-2 border border-slate-700 text-center font-black bg-slate-900 text-emerald-400 text-[10px]">INCIDENCIA</th>
                                 </Fragment>
                           ))}
                       </tr>
                    </thead>

                    <tbody className="bg-white/5">
                       {Object.entries(hierarchicalData)
                           .filter(([majorCat]) => !majorCat.toLowerCase().includes('otros costos'))
                           .sort(([a], [b]) => {
                               const order = ['nómina', 'insumos', 'transporte', 'caja menor'];
                               const indexA = order.indexOf(a.toLowerCase().trim());
                               const indexB = order.indexOf(b.toLowerCase().trim());
                               return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
                           })
                           .map(([majorCat, subCats]) => (
                             <Fragment key={majorCat}>
                                 <tr className="bg-slate-800 h-10 border-b border-slate-600">
                                     <td className="px-5 sticky left-0 z-40 bg-slate-800 text-white uppercase text-[10px] font-black tracking-widest shadow-[4px_0_8px_rgba(0,0,0,0.3)]">
                                         <div className="flex items-center gap-3">
                                             <div className="w-1.5 h-4 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                                             {majorCat}
                                         </div>
                                     </td>
                                     <td className="bg-slate-800"></td>
                                     {[...groups, { id: 'total_proyecto' }].map(g => {
                                         let totals = { budgetTotal: 0, executedTotal: 0 };
                                         if (g.id === 'total_proyecto') {
                                             totals = Object.values(majorTotals[majorCat] || {}).reduce((acc, curr) => ({
                                                 budgetTotal: acc.budgetTotal + curr.budgetTotal,
                                                 executedTotal: acc.executedTotal + curr.executedTotal
                                             }), { budgetTotal: 0, executedTotal: 0 });
                                         } else {
                                             totals = majorTotals[majorCat]?.[g.id] || { budgetTotal: 0, executedTotal: 0 };
                                         }
                                         
                                         const bgCol = g.id === 'total_proyecto' ? 'bg-slate-900' : 'bg-slate-800';
                                         
                                         return (
                                             <Fragment key={g.id}>
                                                 <td className={`p-1 border-r border-slate-700/50 ${bgCol}`}></td>
                                                 <td className={`p-1 border-r border-slate-700/50 ${bgCol}`}></td>
                                                 <td className={`p-1 text-right font-black border-r border-slate-700/50 ${bgCol} text-xs ${viewMode === 'budget' ? 'text-blue-300' : 'text-emerald-400'}`}>
                                                     {currencyFormatter.format(viewMode === 'budget' ? totals.budgetTotal : totals.executedTotal)}
                                                 </td>
                                                 <td className={`p-1 text-center bg-slate-950 border-r border-slate-700/50`}></td>
                                             </Fragment>
                                         );
                                     })}
                                 </tr>

                                 {Object.entries(subCats as any).map(([subCat, subSubCats]: [string, any]) => (
                                     <Fragment key={`${majorCat}-${subCat}`}>
                                         {Object.entries(subSubCats as any).map(([subSubCat, items]) => (
                                              <Fragment key={`${majorCat}-${subCat}-${subSubCat}`}>
                                                   {(items as any[]).map((item, idx) => {
                                                       const itemRowKey = `${majorCat}|${subCat}|${subSubCat}|${item.name}`;
                                                       const isEven = idx % 2 === 0;
                                                       return (
                                                       <tr key={itemRowKey} className={`group hover:bg-slate-800/80 transition-colors ${isEven ? 'bg-transparent' : 'bg-slate-900/20'}`}>
                                                           <td className="p-0 border border-slate-800/50 sticky left-0 z-40 bg-slate-900 text-slate-300 text-[11px] group/row shadow-[4px_0_8px_rgba(0,0,0,0.2)]">
                                                               <div className="relative w-full h-full pl-8 pr-2 py-1.5 flex items-center">
                                                                   <div className="absolute left-4 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full border border-slate-600 bg-slate-800"></div>
                                                                   <EditableCell value={item.name} type="text" onSave={() => {}} className="text-slate-300 font-medium truncate" align="left" />
                                                                   <button 
                                                                       onClick={() => {
                                                                           if (window.confirm(`¿Eliminar '${item.name}' de todos los sitios?`)) {
                                                                                onDeleteItems?.(item.allItemIds);
                                                                           }
                                                                       }}
                                                                       className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-rose-500 rounded opacity-0 group-hover/row:opacity-100 transition-opacity"
                                                                   >
                                                                       <Trash2 size={12} />
                                                                   </button>
                                                               </div>
                                                          </td>
                                                          <td className="p-0 border border-slate-800/50 bg-slate-900 text-slate-500 text-center font-medium">
                                                              {item.unit}
                                                          </td>

                                                          {[...groups, { id: 'total_proyecto' }].map((g: any) => {
                                                              const isTotal = g.id === 'total_proyecto';
                                                              const sD = isTotal ? calculateTotalItemData(item) : (item.siteData[g.id] || { budgetQty: 0, unitPrice: 0, budgetTotal: 0, executedQty: 0, executedTotal: 0, compliance: 0, itemId: ''});
                                                              const v = viewMode === 'budget' ? { q: sD.budgetQty, t: sD.budgetTotal, p: sD.unitPrice } : { q: sD.executedQty, t: sD.executedTotal, p: sD.unitPrice };
                                                              const cellBg = isTotal ? 'bg-slate-950/40' : 'bg-transparent';
                                                              return (
                                                                <Fragment key={g.id}>
                                                                    <td className={`p-1 border border-slate-800/50 ${cellBg}`}>
                                                                        <EditableCell value={v.q} type="number" onSave={(val) => !isTotal && onUpdateItemValue?.(g.id, sD.itemId, viewMode === 'budget' ? qtyColId : execQtyColId, val)} className={`text-center font-bold text-[11px] ${viewMode === 'budget' ? 'text-blue-400' : 'text-emerald-400'}`} readonly={isTotal} />
                                                                    </td>
                                                                    <td className={`p-1 border border-slate-800/50 ${cellBg}`}>
                                                                        <EditableCell value={v.p} type="number" onSave={(val) => !isTotal && onUpdateItemValue?.(g.id, sD.itemId, priceColId, val)} className="text-slate-400 italic text-right font-medium" align="right" readonly={isTotal} />
                                                                    </td>
                                                                    <td className={`p-1 border border-slate-800/50 text-right font-black text-xs ${isTotal ? 'text-white' : 'text-slate-200'} ${cellBg}`}>
                                                                        {currencyFormatter.format(v.t)}
                                                                    </td>
                                                                    <td className={`p-1 border border-slate-800/50 text-center font-black text-[10px] ${isTotal ? 'bg-slate-900 text-emerald-400' : 'text-slate-500 bg-black/10'}`}>
                                                                        <span className={sD.compliance >= 70 ? 'text-emerald-500' : sD.compliance >= 65 ? 'text-amber-500' : 'text-rose-500'}>
                                                                            {sD.compliance.toFixed(1)}%
                                                                        </span>
                                                                    </td>
                                                                </Fragment>
                                                              );
                                                          })}
                                                       </tr>
                                                       );
                                                   })}
                                              </Fragment>
                                         ))}
                                     </Fragment>
                                 ))}
                             </Fragment>
                         ))}
                    </tbody>

                    <tfoot className="sticky bottom-0 z-[50] border-t-2 border-slate-600">
                        {[
                            { label: 'TOTAL COSTO DIRECTO', type: 'base' },
                            { label: 'A (20%)', factor: 0.20, type: 'aiu' },
                            { label: 'I (5%)', factor: 0.05, type: 'aiu' },
                            { label: 'U (5%)', factor: 0.05, type: 'aiu' }
                        ].map((row_def) => (
                            <tr key={row_def.label} className={`border-b border-slate-700/30 ${row_def.type === 'acta' || row_def.type === 'utility' ? 'bg-slate-900' : 'bg-slate-800'}`}>
                                <td className="p-2 border-r border-slate-700 sticky left-0 z-40 bg-slate-800 text-right uppercase text-[9px] font-black tracking-widest text-slate-300 shadow-[4px_0_8px_rgba(0,0,0,0.3)]">
                                     {row_def.label}
                                </td>
                                <td className="bg-slate-800 border-r border-slate-700"></td>
                                {[...groups, { id: 'total_proyecto' }].map((g: any) => {
                                    const isTotal = g.id === 'total_proyecto';
                                    let sT = isTotal ? Object.values(siteTotals).reduce((a,c)=>({budgetTotal:a.budgetTotal+(c.budgetTotal||0), executedTotal:a.executedTotal+(c.executedTotal||0)}),{budgetTotal:0,executedTotal:0}) : (siteTotals[g.id] || {budgetTotal:0, executedTotal:0});
                                    
                                    // Acta logic - No mixing!
                                    const siteActa = isTotal ? Object.values(valorActaPorSitio).reduce((a,b)=>a+b, 0) : (valorActaPorSitio?.[g.id] || 0);
                                    const budgetActa = isTotal ? totalActa : 0; // Matrix doesn't currently store budget acta per site, only total

                                    let bDisplay: any = '', eDisplay: any = '', bSub: any = '', eSub: any = '';
                                    const budgetCost = sT.budgetTotal;
                                    const execCost = sT.executedTotal;

                                    if(row_def.type === 'base') {
                                        bDisplay = currencyFormatter.format(budgetCost);
                                        eDisplay = currencyFormatter.format(execCost);
                                        bSub = '100% (C)';
                                        eSub = '100% (C)';
                                    } else if(row_def.type === 'aiu') {
                                        bDisplay = currencyFormatter.format(budgetCost * row_def.factor!);
                                        eDisplay = currencyFormatter.format(execCost * row_def.factor!);
                                        bSub = (row_def.factor! * 100) + '%';
                                        eSub = bSub;
                                    } else if(row_def.type === 'acta') {
                                        bDisplay = isTotal ? currencyFormatter.format(totalActa) : '-';
                                        if (isTotal) {
                                            eDisplay = currencyFormatter.format(siteActa);
                                        } else {
                                            eDisplay = (
                                                <div className="flex justify-end pr-1">
                                                    {onUpdateValorActaPorSitio ? (
                                                        <div className="w-[124px]">
                                                            <EditableCell value={siteActa} type="number" onSave={(v)=>{const n={...valorActaPorSitio}; n[g.id]=v; onUpdateValorActaPorSitio(n);}} className="bg-slate-950 text-emerald-400 font-black px-2 py-0.5 rounded border border-emerald-500/30 text-right text-[10px]" align="right" />
                                                        </div>
                                                    ) : <span className="text-emerald-400 font-black tracking-wider text-[10px]">{currencyFormatter.format(siteActa)}</span>}
                                                </div>
                                            );
                                        }
                                        bSub = 'Contratado';
                                        eSub = 'Facturado';
                                    } else if(row_def.type === 'utility') {
                                        const bPct = budgetActa > 0 ? ((budgetActa - budgetCost) / budgetActa) * 100 : 0;
                                        const ePct = siteActa > 0 ? ((siteActa - execCost) / siteActa) * 100 : 0;
                                        
                                        bDisplay = isTotal ? `${bPct.toFixed(1)}%` : '-';
                                        eDisplay = (
                                            <div className={`inline-flex px-2 py-0.5 rounded font-black text-[9px] border ${ePct>=70?'bg-emerald-500/10 text-emerald-400 border-emerald-500/40':ePct>=65?'bg-amber-500/10 text-amber-400 border-amber-500/40':'bg-rose-500/10 text-rose-400 border-rose-500/40'}`}>
                                                {ePct.toFixed(1)}%
                                            </div>
                                        );
                                    } else if(row_def.type === 'ub_cd') {
                                         bDisplay = budgetCost > 0 && budgetActa > 0 ? (((budgetActa - budgetCost) / budgetCost) * 100).toFixed(1) + '%' : '-';
                                         eDisplay = execCost > 0 && siteActa > 0 ? (((siteActa - execCost) / execCost) * 100).toFixed(1) + '%' : '-';
                                    } else if(row_def.type === 'costo_fac') {
                                         bDisplay = budgetActa > 0 ? ((budgetCost / budgetActa) * 100).toFixed(1) + '%' : '-';
                                         eDisplay = siteActa > 0 ? ((execCost / siteActa) * 100).toFixed(1) + '%' : '-';
                                    }

                                    const cellBg = isTotal ? 'bg-slate-950/60' : '';
                                    const tc = (row_def.type==='acta'||row_def.type==='utility') ? 'text-emerald-400' : 'text-slate-300';

                                    return (
                                        <Fragment key={g.id}>
                                            <td className={`border-r border-slate-700/50 ${cellBg}`}></td>
                                            <td className={`border-r border-slate-700/50 ${cellBg}`}></td>
                                            <td className={`p-2 border-r border-slate-700/50 text-right font-black text-[10px] ${tc} ${cellBg}`}>
                                                {bDisplay}
                                            </td>
                                            <td className={`p-2 border-r border-slate-700/50 text-center font-bold text-slate-400 ${cellBg} bg-black/20`}>
                                                {typeof eDisplay === 'string' || !eDisplay ? eDisplay : eDisplay}
                                                {!eDisplay && eSub}
                                            </td>
                                        </Fragment>
                                    );
                                })}
                            </tr>
                        ))}
                    </tfoot>


                </table>
           </div>
    </div>
  );
}

const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});
