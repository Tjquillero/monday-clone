'use client';

import { useState, useEffect } from 'react';
import { Group, Column } from '@/types/monday';
import SCurveWidget from './SCurveWidget';
import BudgetExecutionWidget from './BudgetExecutionWidget';
import CostDeviationWidget from './CostDeviationWidget';
import FinancialWidget from './FinancialWidget';
import FinancialTableView from './FinancialTableView';
import FinancialMatrixView from './FinancialMatrixView';
import ActasModule from '../financial/ActasModule';
import ResourceEfficiencyWidget from './ResourceEfficiencyWidget';
import { MapPin, DollarSign, Wallet, LayoutGrid, List, Plus, FileText, Calculator } from 'lucide-react';

interface CentralizedFinancialDashboardProps {
  groups: Group[];
  columns: Column[];
  onUpdateItemValue?: (groupId: string, itemId: number | string, columnId: string, value: any) => void;
  onAddItem?: (rubro: string, category: string, subSub?: string) => void;
  onDeleteItem?: (itemId: number | string) => void;
  onDeleteItems?: (itemIds: (number | string)[]) => void;
  onRenameGroup?: (oldName: string, newName: string, type: 'major' | 'sub' | 'subsub', context?: { major?: string, sub?: string }) => void;
  onAddGroup?: (type: 'major' | 'sub' | 'subsub', parentContext?: { major?: string, sub?: string }) => void;
  onAddSite?: () => void;
  totalActa?: number;
  onUpdateActa?: (val: number) => void;
  valorActaPorSitio?: Record<string, number>;
  onUpdateValorActaPorSitio?: (val: Record<string, number>) => void;
  boardId?: string;
  activityGroups?: Group[];
  activityTemplates?: any[];
}

export default function CentralizedFinancialDashboard({ 
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
    valorActaPorSitio, 
    onUpdateValorActaPorSitio,
    boardId,
    activityGroups,
    activityTemplates
}: CentralizedFinancialDashboardProps) {
  const [activeSiteId, setActiveSiteId] = useState<string>('all');
  const [viewMode, _setViewMode] = useState<'list' | 'matrix' | 'actas'>('list'); // Vista por defecto: Resumen (Dashboards) para mejor UX inicial
  
  const setViewMode = (mode: any) => {
      _setViewMode(mode);
      if (typeof window !== 'undefined') localStorage.setItem('mantenix_finance_view', mode);
  };

  useEffect(() => {
      if (typeof window !== 'undefined') {
          const saved = localStorage.getItem('mantenix_finance_view');
          if (saved) _setViewMode(saved as any);
      }
  }, []);

  const currencyFormatter = new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0
    });

  return (
    <div className="flex flex-col gap-8 p-8 min-h-full font-sans bg-[#f8fafc]">
        {/* Unified Header */}
        <div className="bg-white px-8 py-6 rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-white">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-slate-900/20">
                        <Wallet size={24} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-slate-800 tracking-tight">Control de Costos</h2>
                        <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-0.5">Gestión Financiera Centralizada</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-6">
                     {/* View Switcher - Premium Toggle */}
                     <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-50 shadow-inner">
                        <button 
                            onClick={() => setViewMode('matrix')}
                            className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-black transition-all duration-300 ${viewMode === 'matrix' ? 'bg-white text-slate-900 shadow-md ring-1 ring-slate-100' : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'}`}
                        >
                            <LayoutGrid size={14} /> SÁBANA
                        </button>
                        <button 
                            onClick={() => setViewMode('list')}
                            className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-black transition-all duration-300 ${viewMode === 'list' ? 'bg-white text-slate-900 shadow-md ring-1 ring-slate-100' : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'}`}
                        >
                            <List size={14} /> RESUMEN
                        </button>
                        <button 
                            onClick={() => setViewMode('actas')}
                            className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-black transition-all duration-300 ${viewMode === 'actas' ? 'bg-white text-emerald-800 shadow-md ring-1 ring-emerald-100' : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'}`}
                        >
                            <FileText size={14} /> ACTAS
                        </button>
                     </div>

                    <div className="h-10 w-px bg-slate-100"></div>
 
                    {/* Site Switcher */}
                    <div className="flex bg-slate-100/50 p-1.5 rounded-2xl border border-slate-50 overflow-x-auto no-scrollbar max-w-[500px]">
                        <button 
                            onClick={() => setActiveSiteId('all')} 
                            className={`px-5 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all duration-300 ${activeSiteId === 'all' ? 'bg-white text-emerald-700 shadow-md ring-1 ring-slate-100' : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'}`}
                        >
                            TODO
                        </button>
                        {groups.map(group => (
                            <button
                                key={group.id}
                                onClick={() => setActiveSiteId(group.id)}
                                className={`px-5 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all duration-300 ${activeSiteId === group.id ? 'bg-white text-emerald-700 shadow-md ring-1 ring-slate-100' : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'}`}
                            >
                                {group.title.toUpperCase()}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>

        {/* Premium Dashboard Metrics */}
        <FinancialWidget 
            groups={groups} 
            columns={columns} 
            activeSiteId={activeSiteId} 
            totalActa={totalActa}
        />

        {/* Detailed Financial Table vs Matrix vs Actas */}
        <div className="flex-1 min-h-0 relative">
             {viewMode === 'actas' ? (
                <ActasModule groups={groups} boardId={boardId} onAddSite={onAddSite} />
             ) : viewMode === 'list' ? (
                <FinancialTableView 
                    groups={groups.map(g => ({
                        ...g,
                        items: g.items.filter(i => String(i.values?.rubro || '').trim().toLowerCase() !== 'otros costos')
                    }))} 
                    columns={columns} 
                    activeSiteId={activeSiteId}
                    onUpdateItemValue={onUpdateItemValue}
                    onAddItem={onAddItem}
                    onDeleteItem={onDeleteItem}
                    onDeleteItems={onDeleteItems}
                    onRenameGroup={onRenameGroup}
                    onAddGroup={onAddGroup}
                    totalActa={totalActa}
                    onUpdateActa={onUpdateActa}
                    valorActaPorSitio={valorActaPorSitio}
                    onUpdateValorActaPorSitio={onUpdateValorActaPorSitio}
                />
             ) : (
                <FinancialMatrixView 
                    groups={groups.map(g => ({
                        ...g,
                        items: g.items.filter(i => String(i.values?.rubro || '').trim().toLowerCase() !== 'otros costos')
                    }))} 
                    columns={columns}
                    onUpdateItemValue={onUpdateItemValue}
                    onRenameGroup={onRenameGroup}
                    onAddItem={onAddItem}
                    onDeleteItem={onDeleteItem}
                    onDeleteItems={onDeleteItems}
                    onAddGroup={onAddGroup}
                    onAddSite={onAddSite}
                    totalActa={totalActa}
                    onUpdateActa={onUpdateActa}
                    valorActaPorSitio={valorActaPorSitio}
                    onUpdateValorActaPorSitio={onUpdateValorActaPorSitio}
                />
             )}
        </div>

        {/* Widgets Grid - Solo visible en vista Resumen (List) */}
        {viewMode === 'list' && (
            <div className="flex flex-col gap-6 mt-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[480px]">
                    <BudgetExecutionWidget 
                        groups={groups} 
                        columns={columns} 
                        activeSiteId={activeSiteId} 
                        hideSelector={true} 
                    />
                    <CostDeviationWidget 
                        groups={groups} 
                        columns={columns} 
                        activeSiteId={activeSiteId} 
                        hideSelector={true} 
                    />
                </div>
                
                <div className="h-[500px]">
                    <SCurveWidget 
                        groups={groups} 
                        columns={columns} 
                        activeSiteId={activeSiteId} 
                        hideSelector={true} 
                    />
                </div>
            </div>
        )}

        {/* Resource Efficiency - Visible in List and Matrix, HIDDEN in Actas */}
        {viewMode !== 'actas' && (
            <div className="mt-12 mb-8">
                <h2 className="text-xl font-black text-slate-800 mb-6 px-1 flex items-center gap-3">
                    <Calculator className="text-primary" />
                    Análisis de Recursos y Eficiencia
                </h2>
                <ResourceEfficiencyWidget 
                    boardId={boardId || null} 
                    groups={activityGroups || []} 
                    activityTemplates={activityTemplates || []} 
                />
            </div>
        )}
    </div>
  );
}
