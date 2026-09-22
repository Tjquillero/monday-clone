'use client';

import React from 'react';
import { useExecutiveProgressMatrix } from '@/hooks/useExecutiveProgressMatrix';
import { ExecutiveSiteProgressRow } from './ExecutiveSiteProgressRow';
import { WeeklyProgressTrendCard } from './WeeklyProgressTrendCard';
import { Layers, RefreshCw, CheckCircle2 } from 'lucide-react';

interface ExecutiveProgressMatrixProps {
  boardId: string;
  boardTitle?: string;
}

export const ExecutiveProgressMatrix: React.FC<ExecutiveProgressMatrixProps> = ({
  boardId,
  boardTitle = 'Tablero Operativo',
}) => {
  const { data: matrixData, isLoading, isError, error, refetch, isFetching } = useExecutiveProgressMatrix({
    boardId,
  });

  if (isLoading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3 bg-slate-900/40 rounded-2xl border border-slate-800">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">
          Calculando progreso gerencial consolidado...
        </p>
      </div>
    );
  }

  if (isError || !matrixData) {
    return (
      <div className="p-6 bg-red-950/40 border border-red-800 rounded-2xl text-red-300">
        <h3 className="font-bold text-sm">Error al cargar el progreso gerencial</h3>
        <p className="text-xs text-red-400 mt-1">{(error as Error)?.message || 'No se pudieron recuperar las métricas.'}</p>
      </div>
    );
  }

  const { dashboard, sites, overallCompletedActivities, overallTotalActivities } = matrixData;

  const overallVerifiedPct = dashboard.physicalKpis.scopeComplianceRate;
  const overallReportedQty = dashboard.occurrences.reduce(
    (sum, o) => sum + (o.executedQtyReported || 0),
    0
  );
  const overallPlannedQty = dashboard.physicalKpis.totalPlannedQty;

  const reportedProgressPct = overallPlannedQty > 0
    ? (overallReportedQty / overallPlannedQty) * 100
    : 0;

  return (
    <div className="space-y-6 text-slate-100">
      {/* Cabecera Gerencial */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 p-5 rounded-2xl border border-slate-800 backdrop-blur-md shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-extrabold uppercase tracking-wider">
              Control Gerencial
            </span>
            <span className="text-xs font-mono text-slate-400">H2 · Progreso & Desviaciones</span>
          </div>
          <h2 className="text-xl font-black text-white tracking-tight">
            Progreso Acumulado de la Planificación — {boardTitle}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Comparativa estricta Plan vs Ejecutado con separación formal entre avance verificado y reporte operativo.
          </p>
        </div>

        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="self-start md:self-auto p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white transition-colors disabled:opacity-50 flex items-center gap-2 text-xs font-semibold"
          title="Refrescar métricas"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-emerald-400' : ''}`} />
          <span>Actualizar</span>
        </button>
      </div>

      {/* KPI Cards Consolidados */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* KPI 1: % Cumplimiento Formal */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col justify-between">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
            Cumplimiento Verificado (Formal)
          </span>
          <div className="my-2">
            <div className="text-3xl font-black text-emerald-400 tracking-tight">
              {overallVerifiedPct.toFixed(1)}%
            </div>
            <div className="w-full bg-slate-950 h-2.5 rounded-full mt-2 overflow-hidden border border-slate-800">
              <div
                className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-500"
                style={{ width: `${Math.min(100, overallVerifiedPct)}%` }}
              />
            </div>
          </div>
          <span className="text-[11px] text-slate-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 inline shrink-0" />
            <span>{overallCompletedActivities} de {overallTotalActivities} metas satisfechas</span>
          </span>
        </div>

        {/* KPI 2: Avance Reportado Bruto */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col justify-between">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
            Avance Reportado (Operativo)
          </span>
          <div className="my-2">
            <div className="text-3xl font-black text-indigo-400 tracking-tight">
              {reportedProgressPct.toFixed(1)}%
            </div>
            <div className="w-full bg-slate-950 h-2.5 rounded-full mt-2 overflow-hidden border border-slate-800">
              <div
                className="bg-indigo-500 h-full transition-all duration-500"
                style={{ width: `${Math.min(100, reportedProgressPct)}%` }}
              />
            </div>
          </div>
          <span className="text-[11px] text-slate-400">
            Indicador anticipado de avance en campo
          </span>
        </div>

        {/* KPI 3: Total Actividades Planificadas */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col justify-between">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
            Frentes y Actividades
          </span>
          <div className="my-2 text-3xl font-black text-white">
            {overallTotalActivities}{' '}
            <span className="text-sm font-normal text-slate-400">actividades</span>
          </div>
          <span className="text-[11px] text-slate-400">
            Distribuido en {sites.length} {sites.length === 1 ? 'sitio' : 'sitios de trabajo'}
          </span>
        </div>

        {/* KPI 4: Jornales Ejecutados y Balance */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col justify-between">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
            Jornales Verificados (Esfuerzo Laboral)
          </span>
          <div className="my-2 text-3xl font-black text-amber-300">
            {dashboard.physicalKpis.totalExecutedJrVerified}{' '}
            <span className="text-sm font-normal text-slate-400">JR</span>
          </div>
          <span className="text-[11px] text-slate-400">
            Balance Delta JR: {dashboard.physicalKpis.overallDeltaJr > 0 ? '+' : ''}
            {dashboard.physicalKpis.overallDeltaJr} JR (vs {dashboard.physicalKpis.totalTheoreticalJr} JR plan)
          </span>
        </div>
      </div>

      {/* H2.1: Tendencia Semanal de Cumplimiento Verificado */}
      {dashboard.weeklyTrend && dashboard.weeklyTrend.length > 0 && (
        <WeeklyProgressTrendCard weeklyTrend={dashboard.weeklyTrend} />
      )}

      {/* Matriz Desglosada: Consolidado -> Sitio -> Actividad */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            <span>Desglose por Sitio de Trabajo</span>
          </h3>
          <span className="text-xs text-slate-500">
            Haz clic en un sitio para desplegar sus actividades
          </span>
        </div>

        {sites.length === 0 ? (
          <div className="p-8 text-center bg-slate-900/40 rounded-2xl border border-slate-800 text-slate-500 text-xs">
            No se encontraron actividades planificadas para los sitios de este tablero.
          </div>
        ) : (
          sites.map((site) => (
            <ExecutiveSiteProgressRow
              key={site.siteId}
              siteTitle={site.siteTitle}
              verifiedProgressPct={site.verifiedProgressPct}
              reportedProgressPct={site.reportedProgressPct}
              totalActivities={site.totalActivitiesCount}
              completedActivities={site.completedActivitiesCount}
              items={site.items}
            />
          ))
        )}
      </div>
    </div>
  );
};
