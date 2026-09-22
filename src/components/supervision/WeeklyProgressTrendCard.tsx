'use client';

import React from 'react';
import { TrendingUp, Calendar, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { WeeklyProgressTrendItem } from '@/lib/supervisorExecutiveDashboardService';

interface WeeklyProgressTrendCardProps {
  weeklyTrend: WeeklyProgressTrendItem[];
}

export const WeeklyProgressTrendCard: React.FC<WeeklyProgressTrendCardProps> = ({ weeklyTrend }) => {
  if (!weeklyTrend || weeklyTrend.length === 0) {
    return null;
  }

  const getStatusBadge = (status: WeeklyProgressTrendItem['status']) => {
    switch (status) {
      case 'COMPLETADO':
        return {
          label: 'Completado',
          badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
          icon: <CheckCircle2 className="w-3 h-3" />,
        };
      case 'EN_PROGRESO':
        return {
          label: 'En Progreso',
          badge: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
          icon: <Clock className="w-3 h-3" />,
        };
      case 'SIN_EJECUCION':
        return {
          label: 'Sin Ejecución',
          badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
          icon: <AlertCircle className="w-3 h-3" />,
        };
      case 'SIN_PROGRAMACION':
      default:
        return {
          label: 'N/A',
          badge: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
          icon: <Calendar className="w-3 h-3 opacity-50" />,
        };
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      {/* Encabezado del Bloque de Tendencia */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-sm">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">
              Tendencia Semanal de Cumplimiento Verificado (H2.1)
            </h3>
            <span className="text-xs text-slate-400">
              Serie histórica de 4 semanas consecutivas basada exclusivamente en avance verificado formal.
            </span>
          </div>
        </div>
        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg self-start sm:self-auto">
          SoT: status verificado
        </span>
      </div>

      {/* Gráfica Visual de Barras de Cumplimiento por Semana */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {weeklyTrend.map((item) => {
          const isNoProgram = item.status === 'SIN_PROGRAMACION';
          const badgeInfo = getStatusBadge(item.status);

          return (
            <div
              key={item.weekStart}
              className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-extrabold text-white">{item.weekLabel}</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border ${badgeInfo.badge}`}>
                  {badgeInfo.icon}
                  {badgeInfo.label}
                </span>
              </div>

              <div className="my-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-black text-emerald-400">
                    {isNoProgram ? 'N/A' : `${item.verifiedCompliancePct.toFixed(1)}%`}
                  </span>
                  {!isNoProgram && (
                    <span className="text-[10px] text-slate-400 font-mono">
                      rep: {item.reportedCompliancePct.toFixed(1)}%
                    </span>
                  )}
                </div>

                {/* Barra Multicapa por Semana */}
                <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden relative border border-slate-800 mt-1.5">
                  {!isNoProgram && (
                    <>
                      <div
                        className="bg-indigo-500/40 h-full absolute top-0 left-0 transition-all duration-500"
                        style={{ width: `${Math.min(100, item.reportedCompliancePct)}%` }}
                      />
                      <div
                        className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full absolute top-0 left-0 transition-all duration-500"
                        style={{ width: `${Math.min(100, item.verifiedCompliancePct)}%` }}
                      />
                    </>
                  )}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400 mt-2">
                <span>{item.totalPlannedItemsCount} ítem(s)</span>
                <span className="font-mono text-amber-300 font-semibold">
                  {item.totalVerifiedJr} / {item.totalPlannedJr} JR
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabla Desglosada de la Tendencia Semanal */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
              <th className="pb-2 pl-2">Semana (Lunes)</th>
              <th className="pb-2 text-center">Ítems Plan.</th>
              <th className="pb-2 text-right">% Verificado (Formal)</th>
              <th className="pb-2 text-right">% Reportado (Operativo)</th>
              <th className="pb-2 text-right">Esfuerzo Laboral (JR)</th>
              <th className="pb-2 text-center">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {weeklyTrend.map((item) => {
              const badgeInfo = getStatusBadge(item.status);
              const isNoProgram = item.status === 'SIN_PROGRAMACION';

              return (
                <tr key={item.weekStart} className="hover:bg-slate-950/40 transition-colors">
                  <td className="py-2.5 pl-2 font-mono text-xs font-bold text-white">
                    {item.weekLabel} <span className="text-[10px] text-slate-500 font-normal">({item.weekStart})</span>
                  </td>
                  <td className="py-2.5 text-center font-semibold text-slate-300">
                    {item.totalPlannedItemsCount}
                  </td>
                  <td className="py-2.5 text-right font-black text-emerald-400">
                    {isNoProgram ? 'N/A' : `${item.verifiedCompliancePct.toFixed(1)}%`}
                  </td>
                  <td className="py-2.5 text-right font-semibold text-indigo-400">
                    {isNoProgram ? 'N/A' : `${item.reportedCompliancePct.toFixed(1)}%`}
                  </td>
                  <td className="py-2.5 text-right font-mono text-amber-300 font-medium">
                    {item.totalVerifiedJr} JR <span className="text-slate-500 font-normal">(vs {item.totalPlannedJr} JR)</span>
                  </td>
                  <td className="py-2.5 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border ${badgeInfo.badge}`}>
                      {badgeInfo.icon}
                      {badgeInfo.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
