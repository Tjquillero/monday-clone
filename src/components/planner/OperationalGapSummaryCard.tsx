'use client';

import React from 'react';
import { OperationalGapSummary, DailyCrewWorkload } from '@/lib/operationalCapacityService';
import { Users, AlertTriangle, CheckCircle2, ShieldCheck, Info } from 'lucide-react';

interface OperationalGapSummaryCardProps {
  gapSummary: OperationalGapSummary | null;
  crewWorkloads?: DailyCrewWorkload[];
  isLoading?: boolean;
}

export function OperationalGapSummaryCard({
  gapSummary,
  crewWorkloads = [],
  isLoading = false,
}: OperationalGapSummaryCardProps) {
  if (isLoading) {
    return (
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm animate-pulse flex items-center justify-center">
        <span className="text-xs font-bold text-slate-400">Cargando análisis de capacidad operativa y brecha...</span>
      </div>
    );
  }

  if (!gapSummary) {
    return null;
  }

  const overloadedCrews = crewWorkloads.filter((cw) => cw.status === 'SOBRECARGA');

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-6 font-sans">
      {/* Header Macro */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-bold">
              <Users size={18} />
            </div>
            <h4 className="font-black text-slate-900 text-lg tracking-tight">
              Análisis Macro: Brecha Operativa de Personal ({gapSummary.siteName})
            </h4>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Contrapone la Necesidad Teórica (X desde Resource Analysis) vs el Personal Asignado (Y desde Módulo 2)
          </p>
        </div>

        {/* Badge de Estado Global */}
        <div className="flex items-center gap-2">
          {gapSummary.status === 'DEFICIT' && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-black">
              <AlertTriangle size={14} />
              <span>Déficit Total: -{gapSummary.netDeficit} personas</span>
            </div>
          )}
          {gapSummary.status === 'EXCEDENTE' && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-black">
              <Info size={14} />
              <span>Excedente: +{gapSummary.netExcedente} personas</span>
            </div>
          )}
          {gapSummary.status === 'BALANCED' && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-black">
              <CheckCircle2 size={14} />
              <span>Personal Balanceado</span>
            </div>
          )}
        </div>
      </div>

      {/* Tarjetas de Métricas Resumen (Desacoplamiento Estricto X vs Y vs D vs S) */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Carga Teórica Mes</span>
          <span className="text-lg font-black text-slate-900 mt-1 block">{gapSummary.totalMonthlyJournals} <span className="text-xs font-bold text-slate-500">JR/mes</span></span>
        </div>
        <div className="bg-emerald-50/50 p-3.5 rounded-xl border border-emerald-100/50">
          <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block">Demanda Semanal (X)</span>
          <span className="text-lg font-black text-emerald-900 mt-1 block">
            {Math.round((gapSummary.totalMonthlyJournals / 5) * 100) / 100} <span className="text-xs font-bold text-emerald-700">JR/sem</span>
          </span>
        </div>
        <div className="bg-blue-50/50 p-3.5 rounded-xl border border-blue-100/50">
          <span className="text-[10px] font-black text-blue-800 uppercase tracking-wider block">Personal Adscrito (Y)</span>
          <span className="text-lg font-black text-blue-900 mt-1 block">{gapSummary.totalAssignedWorkers} <span className="text-xs font-bold text-blue-700">adscritos</span></span>
        </div>
        <div className={`p-3.5 rounded-xl border ${gapSummary.netDeficit > 0 ? 'bg-rose-50/70 border-rose-200' : 'bg-slate-50 border-slate-100'}`}>
          <span className={`text-[10px] font-black uppercase tracking-wider block ${gapSummary.netDeficit > 0 ? 'text-rose-700' : 'text-slate-400'}`}>
            Déficit Semanal (D)
          </span>
          <span className={`text-lg font-black mt-1 block ${gapSummary.netDeficit > 0 ? 'text-rose-900' : 'text-slate-700'}`}>
            {gapSummary.netDeficit > 0 ? `-${gapSummary.netDeficit}` : '0'} <span className="text-xs font-bold">pers/sem</span>
          </span>
        </div>
        <div className="bg-indigo-50/50 p-3.5 rounded-xl border border-indigo-100/50">
          <span className="text-[10px] font-black text-indigo-800 uppercase tracking-wider block flex items-center gap-1">
            <Info size={11} className="text-indigo-600" /> Saldo Mensual (S)
          </span>
          <span className="text-lg font-black text-indigo-950 mt-1 block">
            {Math.round((gapSummary.totalMonthlyJournals - (gapSummary.totalMonthlyJournals / 5)) * 100) / 100} <span className="text-xs font-bold text-indigo-700">JR resto</span>
          </span>
        </div>
      </div>

      {/* Tabla Desglose por Zonas */}
      <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-50 text-slate-500 font-black text-[9px] uppercase tracking-wider border-b border-slate-100">
            <tr>
              <th className="p-3">Zona Técnica</th>
              <th className="p-3 text-right">Requerido (X)</th>
              <th className="p-3 text-right">Asignado (Y)</th>
              <th className="p-3 text-right">Déficit</th>
              <th className="p-3 text-right">Excedente</th>
              <th className="p-3 text-center">Estado Operativo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {gapSummary.zoneDetails.map((zd) => (
              <tr key={zd.zoneKey} className="hover:bg-slate-50 transition-colors">
                <td className="p-3 font-bold text-slate-800">{zd.zoneName}</td>
                <td className="p-3 text-right font-mono font-bold text-emerald-800">{zd.requiredWorkers} pers</td>
                <td className="p-3 text-right font-mono font-bold text-blue-800">{zd.assignedWorkers} pers</td>
                <td className={`p-3 text-right font-mono font-bold ${zd.deficit > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                  {zd.deficit > 0 ? `-${zd.deficit}` : '0'}
                </td>
                <td className={`p-3 text-right font-mono font-bold ${zd.excedente > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                  {zd.excedente > 0 ? `+${zd.excedente}` : '0'}
                </td>
                <td className="p-3 text-center">
                  {zd.status === 'DEFICIT' && (
                    <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-lg text-[10px] font-black">
                      DÉFICIT
                    </span>
                  )}
                  {zd.status === 'EXCEDENTE' && (
                    <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-lg text-[10px] font-black">
                      SUPERÁVIT
                    </span>
                  )}
                  {zd.status === 'BALANCED' && (
                    <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-lg text-[10px] font-black">
                      BALANCEADO
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Alertas Micro: Sobrecarga de Cuadrillas por Fecha */}
      {overloadedCrews.length > 0 && (
        <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-rose-800 font-black text-xs uppercase tracking-wider">
            <AlertTriangle size={16} className="text-rose-600" />
            <span>Alertas Micro: Sobrecarga de Cuadrillas Detectada ({overloadedCrews.length} fechas)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {overloadedCrews.map((cw) => (
              <div key={`${cw.crewId}__${cw.plannedDate}`} className="bg-white p-3 rounded-lg border border-rose-100 shadow-sm flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-800">{cw.crewName}</span>
                  <span className="text-[10px] font-mono text-slate-400 block">{cw.plannedDate} ({cw.assignedItemsCount} tareas)</span>
                </div>
                <div className="text-right font-mono font-black text-rose-700">
                  {cw.totalPlannedJournals} JR <span className="text-[10px] text-slate-400 font-medium">/ cap {cw.applicableDailyCapacity} JR</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
