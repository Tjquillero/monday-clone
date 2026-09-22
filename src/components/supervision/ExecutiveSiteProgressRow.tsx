'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, CheckCircle2, Clock } from 'lucide-react';
import { ExecutiveOccurrenceAnalysis } from '@/lib/supervisorExecutiveDashboardService';
import { resolveActivityDescriptiveName } from '@/lib/activityCatalogResolver';

export interface SiteItemData extends ExecutiveOccurrenceAnalysis {
  unit: string;
  zone?: string;
}

export interface ExecutiveSiteProgressRowProps {
  siteTitle: string;
  verifiedProgressPct: number;
  reportedProgressPct: number;
  totalActivities: number;
  completedActivities: number;
  items: SiteItemData[];
}

export const ExecutiveSiteProgressRow: React.FC<ExecutiveSiteProgressRowProps> = ({
  siteTitle,
  verifiedProgressPct,
  reportedProgressPct,
  totalActivities,
  completedActivities,
  items,
}) => {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-lg transition-all mb-4">
      {/* Cabecera del Sitio con Barra Multicapa */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-800/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <button type="button" className="p-1 rounded-lg bg-slate-800 text-slate-400">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <span>{siteTitle}</span>
              <span className="text-xs font-normal text-slate-500 font-mono">({items.length} actividades)</span>
            </h3>
            <span className="text-xs text-slate-400">
              Cumplimiento: <strong className="text-emerald-400">{completedActivities}</strong> de <strong className="text-slate-200">{totalActivities}</strong> metas satisfechas
            </span>
          </div>
        </div>

        {/* Métricas y Barra Multicapa (Verificado sólido + Reportado traslúcido) */}
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6 min-w-[320px]">
          <div className="w-full md:w-56 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-extrabold text-white text-sm">
                {verifiedProgressPct.toFixed(1)}%{' '}
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Verificado</span>
              </span>
              <span className="text-[11px] text-slate-400">
                {reportedProgressPct.toFixed(1)}% <span className="text-slate-500">rep.</span>
              </span>
            </div>

            {/* Barra Multicapa */}
            <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden relative border border-slate-800">
              {/* Capa Reportada (traslúcida) */}
              <div
                className="bg-indigo-500/40 h-full absolute top-0 left-0 transition-all duration-500"
                style={{ width: `${Math.min(100, reportedProgressPct)}%` }}
              />
              {/* Capa Verificada (sólida formal) */}
              <div
                className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full absolute top-0 left-0 transition-all duration-500 shadow-sm"
                style={{ width: `${Math.min(100, verifiedProgressPct)}%` }}
              />
            </div>
          </div>

          <div className="text-right text-xs">
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
              Avance del Frente
            </span>
            <span className="font-black text-white text-sm">
              {verifiedProgressPct.toFixed(1)}% <span className="text-slate-500 font-normal">formal</span>
            </span>
          </div>
        </div>
      </div>

      {/* Tabla Desglosada por Actividad */}
      {expanded && (
        <div className="border-t border-slate-800/80 bg-slate-950/60 p-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                <th className="pb-3 pl-2">Actividad</th>
                <th className="pb-3">Fecha</th>
                <th className="pb-3 text-right">Meta Plan</th>
                <th className="pb-3 text-right">Reportado</th>
                <th className="pb-3 text-right">Verificado</th>
                <th className="pb-3 text-right">Saldo</th>
                <th className="pb-3 text-right">% Cumplimiento</th>
                <th className="pb-3 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {items.map((item) => {
                const itemVerifiedPct = item.plannedQty > 0
                  ? Math.min(100, (item.executedQtyVerified / item.plannedQty) * 100)
                  : 0;
                const unitLabel = item.unit ? ` ${item.unit}` : '';
                const itemSaldo = Math.max(0, item.plannedQty - item.executedQtyVerified);
                const rawKey = item.poaActivityId || (item.activityName && /^[0-9.]+$/.test(item.activityName) ? item.activityName : undefined);
                const resolved = resolveActivityDescriptiveName(rawKey);
                const isGenericOrKey = !item.activityName || item.activityName === rawKey || /^[0-9.]+$/.test(item.activityName);
                const displayName = isGenericOrKey ? resolved : item.activityName;

                return (
                  <tr key={item.planItemId} className="hover:bg-slate-900/50 transition-colors">
                    <td className="py-3 pl-2 font-semibold text-white">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {rawKey && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[9px] font-bold text-indigo-300 shrink-0">
                            Ítem {rawKey}
                          </span>
                        )}
                        <span className="text-xs text-white font-medium">{displayName}</span>
                      </div>
                      {item.zone && <div className="text-[10px] text-slate-400 font-normal mt-0.5">{item.zone}</div>}
                    </td>
                    <td className="py-3 font-mono text-[11px] text-slate-400">{item.plannedDate}</td>
                    <td className="py-3 text-right font-bold text-slate-300">{item.plannedQty}{unitLabel}</td>
                    <td className="py-3 text-right text-indigo-400 font-semibold">{item.executedQtyReported}{unitLabel}</td>
                    <td className="py-3 text-right text-emerald-400 font-bold">{item.executedQtyVerified}{unitLabel}</td>
                    <td className="py-3 text-right font-mono text-slate-400">{itemSaldo}{unitLabel}</td>
                    <td className="py-3 text-right font-extrabold text-white">
                      {itemVerifiedPct.toFixed(1)}%
                    </td>
                    <td className="py-3 text-center">
                      {item.executedQtyVerified >= item.plannedQty ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold uppercase">
                          <CheckCircle2 className="w-3 h-3" /> Cumplido
                        </span>
                      ) : item.executedQtyReported > item.executedQtyVerified ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-bold uppercase">
                          <Clock className="w-3 h-3" /> Por Verificar
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/30 text-[10px] font-bold uppercase">
                          En Proceso
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
