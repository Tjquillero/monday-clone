'use client';

import { Group, Item, Column } from '@/types/monday';
import { useMemo, useState, useEffect } from 'react';
import { DollarSign, TrendingUp, AlertTriangle, CheckCircle2, Users } from 'lucide-react';

interface FinancialWidgetProps {
  groups: Group[];
  columns: Column[];
  activeSiteId?: string;
  totalActa?: number;
}

export default function FinancialWidget({ groups, columns, activeSiteId = 'all', totalActa = 0 }: FinancialWidgetProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const stats = useMemo(() => {
    // Filter groups by site
    const filteredGroups = activeSiteId === 'all' ? groups : groups.filter(g => g.id === activeSiteId);

    // Dynamic Columns Mapping
    const priceCol = columns.find(c => ['precio', 'unit_price', 'costo', 'valor'].some(term => c.id === term || c.title.toLowerCase().includes(term))) || { id: 'unit_price' };
    const qtyCol = columns.find(c => ['cant', 'm2', 'volumen', 'metrado'].some(term => c.id === term || c.title.toLowerCase().includes(term))) || { id: 'cant' };

    let totalBudget = 0;
    let totalExecutedCost = 0;
    let totalItems = 0;
    let efficientItems = 0;
    let totalRequiredManDays = 0;

    const processItem = (item: Item) => {
        if (item.subItems && item.subItems.length > 0) {
            item.subItems.forEach(sub => processItem(sub));
            return;
        }

        const unitPrice = parseFloat(item.values[priceCol.id] || 0);
        const totalQty = parseFloat(item.values[qtyCol.id] || 0);
        
        let executedQty = parseFloat(item.values['executed_qty'] || 0);
        const dailyExec = item.values['daily_execution'] || {};
        
        if (executedQty === 0) {
            executedQty = Object.values(dailyExec).reduce((acc: number, val: any) => {
                const v = typeof val === 'object' ? (val.val || 0) : (parseFloat(val) || 0);
                return acc + (isNaN(v) ? 0 : v);
            }, 0);
        }
        
        const itemBudget = unitPrice * totalQty;
        const itemExecutedCost = unitPrice * executedQty;

        totalBudget += itemBudget;
        totalExecutedCost += itemExecutedCost;

        // Yield & Resource Analysis
        const targetYield = parseFloat(item.values['rend'] || 0);
        const frequency = parseFloat(item.values['frequency'] || 25) || 25;

        if (targetYield > 0) {
            const daysWorked = Object.keys(dailyExec).filter(k => {
                const v = dailyExec[k];
                const val = typeof v === 'object' ? v.val : parseFloat(v);
                return val > 0;
            }).length;

            if (daysWorked > 0) {
                const actualYield = executedQty / daysWorked;
                if (actualYield >= targetYield) efficientItems++;
            }

            const factor = 25 / (frequency || 25);
            const reqManDays = (totalQty / targetYield) * factor;
            totalRequiredManDays += reqManDays;
        }
        
        totalItems++;
    };

    filteredGroups.forEach(group => {
      group.items.forEach(item => {
          if (String(item.values?.rubro || '').trim().toLowerCase() === 'otros costos') return;
          processItem(item);
      });
    });

    const efficiencyRate = totalItems > 0 ? (efficientItems / totalItems) * 100 : 0;
    
    // Use Acta as base for balance if present, otherwise Budget
    const baseForSpending = totalActa > 0 ? totalActa : totalBudget;
    const spendingRate = baseForSpending > 0 ? (totalExecutedCost / baseForSpending) * 100 : 0;
    const requiredPeople = totalRequiredManDays / 25;

    return {
      totalBudget,
      totalExecutedCost,
      variance: baseForSpending - totalExecutedCost,
      efficiencyRate,
      spendingRate,
      totalRequiredManDays,
      requiredPeople
    };
  }, [groups, columns, activeSiteId, totalActa]);

  const currencyFormatter = useMemo(() => {
     return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
      });
  }, []);

  if (!mounted) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      {/* Financial Health Card */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-5">
            <DollarSign className="w-24 h-24" />
        </div>
        <div>
            <h3 className="text-gray-500 text-sm font-bold uppercase tracking-wider mb-1">Ejecución Financiera</h3>
            <div className="text-3xl font-black text-[#323338]">
                {currencyFormatter.format(stats.totalExecutedCost)}
            </div>
            <div className="text-xs text-gray-400 font-medium mt-1">
                de {currencyFormatter.format(stats.totalBudget)} Presupuestados
            </div>
        </div>
        
        <div className="mt-6">
            <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-gray-600">Avance Financiero</span>
                <span className={`${stats.spendingRate > 100 ? 'text-red-500' : 'text-primary'}`}>
                    {stats.spendingRate.toFixed(1)}%
                </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div 
                    className={`h-full rounded-full transition-all duration-1000 ${stats.spendingRate > 100 ? 'bg-red-500' : 'bg-primary'}`}
                    style={{ width: `${Math.min(stats.spendingRate, 100)}%` }}
                ></div>
            </div>
        </div>
      </div>

       {/* Resource Planning Card (NEW) */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-5">
            <Users className="w-24 h-24" />
        </div>
        <div>
            <h3 className="text-gray-500 text-sm font-bold uppercase tracking-wider mb-1">Personal Requerido</h3>
            <div className="flex items-baseline space-x-2">
                <div className="text-4xl font-black text-[#323338]">
                    {stats.requiredPeople.toFixed(1)}
                </div>
                <span className="text-xs font-bold text-gray-400">Personas/Mes</span>
            </div>
        </div>
        
        <div className="mt-4">
            <div className="flex items-center space-x-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-lg w-fit">
                <Users className="w-4 h-4" />
                <span className="text-xs font-bold">
                    Total Jornales: {stats.totalRequiredManDays.toFixed(0)}
                </span>
            </div>
             <p className="text-[10px] text-gray-400 mt-2 leading-tight">
                Calculado con Frecuencia y Rendimiento de actividades activas.
            </p>
        </div>
      </div>

      {/* Yield Efficiency Card */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-5">
            <TrendingUp className="w-24 h-24" />
        </div>
        <div>
            <h3 className="text-gray-500 text-sm font-bold uppercase tracking-wider mb-1">Eficiencia Operativa</h3>
            <div className="flex items-baseline space-x-2">
                <div className="text-3xl font-black text-[#323338]">
                    {stats.efficiencyRate.toFixed(0)}%
                </div>
                <span className="text-xs font-bold text-gray-400">Actividades en Meta</span>
            </div>
        </div>
        
        <div className="mt-4 flex items-center space-x-4">
             <div className={`flex items-center space-x-2 px-3 py-1 rounded-lg ${stats.efficiencyRate >= 80 ? 'bg-green-50 text-green-700' : stats.efficiencyRate >= 50 ? 'bg-yellow-50 text-yellow-700' : 'bg-red-50 text-red-700'}`}>
                {stats.efficiencyRate >= 80 ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                <span className="text-xs font-bold">
                    {stats.efficiencyRate >= 80 ? 'Rendimiento Óptimo' : 'Atención Requerida'}
                </span>
            </div>
        </div>
      </div>

      {/* Projected Variance */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between relative overflow-hidden">
         <div className="absolute top-0 right-0 p-4 opacity-5">
            <AlertTriangle className="w-24 h-24" />
        </div>
        <div>
            <h3 className="text-gray-500 text-sm font-bold uppercase tracking-wider mb-1">Balance / Desviación</h3>
             <div className={`text-3xl font-black ${stats.variance >= 0 ? 'text-[#00c875]' : 'text-red-500'}`}>
                {stats.variance >= 0 ? '+' : ''}{currencyFormatter.format(stats.variance)}
            </div>
             <div className="text-xs text-gray-400 font-medium mt-1">
                {stats.variance >= 0 ? 'Por debajo del presupuesto' : 'Sobrecosto detectado'}
            </div>
        </div>
      </div>
    </div>
  );
}
