import React from 'react';
import { useSupervisorExecutiveDashboard } from '@/hooks/useSupervisorExecutiveDashboard';
import { ExecutiveAlertSeverity } from '@/lib/supervisorExecutiveDashboardService';

interface SupervisorExecutiveDashboardProps {
  boardId: string;
  boardTitle?: string;
}

export const SupervisorExecutiveDashboard: React.FC<SupervisorExecutiveDashboardProps> = ({
  boardId,
  boardTitle = 'Tablero Operativo',
}) => {
  const { data: dashboard, isLoading, error } = useSupervisorExecutiveDashboard(boardId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 bg-slate-900/60 rounded-xl border border-slate-800 text-slate-300">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mr-3"></div>
        <span>Cargando datos determinísticos de supervisión...</span>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="p-6 bg-red-950/40 rounded-xl border border-red-800 text-red-300">
        <h3 className="font-semibold text-lg">Error al cargar el Dashboard Ejecutivo</h3>
        <p className="text-sm text-red-400 mt-1">No se pudieron recuperar las métricas soberanas del sitio.</p>
      </div>
    );
  }

  const getSeverityBadge = (severity: ExecutiveAlertSeverity) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-red-500/20 text-red-400 border-red-500/40';
      case 'HIGH':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
      case 'MEDIUM':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/40';
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-500/40';
    }
  };

  return (
    <div className="space-y-6 p-6 bg-slate-950 text-slate-100 rounded-2xl border border-slate-800 shadow-2xl">
      {/* Header Ejecutivo */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <span className="px-2.5 py-1 text-xs font-semibold uppercase tracking-wider rounded-md bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              Fase 4 · Módulo 4
            </span>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Control Consultivo de Supervisión — {boardTitle}
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Consolidado determinístico de Avance Físico, Salud de Capacidad ($H4.9$) y Consumo Operativo (M3).
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className="inline-flex items-center px-3 py-1 text-xs font-mono font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse mr-2"></span>
            LECTURA PURA SOBERANA
          </span>
        </div>
      </div>

      {/* KPI Primary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Avance Físico Verificado */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-inner flex flex-col justify-between">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            Avance Físico Verificado
          </span>
          <div className="my-2">
            <div className="text-3xl font-extrabold text-white">
              {dashboard.verifiedPhysicalProgressPct.toFixed(1)}%
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full transition-all duration-500"
                style={{ width: `${Math.min(100, dashboard.verifiedPhysicalProgressPct)}%` }}
              ></div>
            </div>
          </div>
          <span className="text-xs text-slate-400">
            {dashboard.totalVerifiedExecutedQty} de {dashboard.totalPlannedQty} unidades verificadas
          </span>
        </div>

        {/* Total Ocurrencias de Plan */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-inner flex flex-col justify-between">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            Planificación Semanal
          </span>
          <div className="my-2 text-3xl font-extrabold text-slate-200">
            {dashboard.totalPlannedItems} <span className="text-base font-normal text-slate-400">ítems</span>
          </div>
          <span className="text-xs text-slate-400">
            Theoretical JR: {dashboard.consumptionSummary.totalTheoreticalJr} JR
          </span>
        </div>

        {/* Consumo de Jornales Verificados */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-inner flex flex-col justify-between">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            Jornales Ejecutados (Verificados)
          </span>
          <div className="my-2 text-3xl font-extrabold text-amber-300">
            {dashboard.consumptionSummary.totalExecutedJrVerified}{' '}
            <span className="text-base font-normal text-slate-400">JR</span>
          </div>
          <span className="text-xs text-slate-400">
            Balance $\Delta_{`jr`}$: {dashboard.consumptionSummary.overallDeltaJr > 0 ? '+' : ''}
            {dashboard.consumptionSummary.overallDeltaJr} JR
          </span>
        </div>

        {/* Estado Monetario Desacoplado */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-inner flex flex-col justify-between">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            Costo Monetario Real Devengado
          </span>
          <div className="my-2 text-sm font-semibold text-slate-400 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 text-center font-mono">
            {dashboard.monetaryCostStatus}
          </div>
          <span className="text-xs text-slate-400">
            Desacoplado soberanamente (0 estimaciones inventadas)
          </span>
        </div>
      </div>

      {/* Grid Secundario: Alertas Críticas & Distribución de Salud */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel de Alertas Críticas */}
        <div className="lg:col-span-2 p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 mr-2"></span>
              Matriz de Alertas Críticas de Supervisión ({dashboard.alerts.length})
            </h3>
            <span className="text-xs text-slate-400 font-mono">ALERT-01 ... ALERT-06</span>
          </div>

          {dashboard.alerts.length === 0 ? (
            <div className="p-6 text-center text-slate-400 bg-slate-950/40 rounded-lg border border-slate-800/80">
              🟢 No se detectaron anomalías operativas ni alertas de capacidad en el sitio.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {dashboard.alerts.map((alert) => (
                <div
                  key={alert.alertId}
                  className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-700 transition-all"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`px-2 py-0.5 text-xs font-mono font-bold rounded border ${getSeverityBadge(
                          alert.severity
                        )}`}
                      >
                        {alert.alertCode}
                      </span>
                      <span className="text-xs font-medium text-slate-400">[{alert.moduleSource}]</span>
                      <span className="text-xs text-slate-400 font-mono">Entity: {alert.entityId}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-200">{alert.description}</p>
                  </div>
                  <div className="text-xs font-mono text-slate-400 self-start sm:self-center shrink-0">
                    {alert.plannedDate}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Salud de Capacidad de Cuadrillas (H4.9) */}
        <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
          <h3 className="text-base font-bold text-white flex items-center">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 mr-2"></span>
            Salud de Capacidad ($H4.9$)
          </h3>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center p-2 rounded bg-slate-950/60 border border-slate-800/60">
              <span className="text-red-400 font-medium">Sobrecarga (OVERLOADED)</span>
              <span className="font-mono font-bold text-red-300">
                {dashboard.crewCapacityDistribution.OVERLOADED ?? 0}
              </span>
            </div>

            <div className="flex justify-between items-center p-2 rounded bg-slate-950/60 border border-slate-800/60">
              <span className="text-red-400 font-medium">Capacidad Cero (CAPACITY_ZERO)</span>
              <span className="font-mono font-bold text-red-300">
                {dashboard.crewCapacityDistribution.CAPACITY_ZERO ?? 0}
              </span>
            </div>

            <div className="flex justify-between items-center p-2 rounded bg-slate-950/60 border border-slate-800/60">
              <span className="text-amber-400 font-medium">Día No Laborable (INVALID_DAY)</span>
              <span className="font-mono font-bold text-amber-300">
                {dashboard.crewCapacityDistribution.INVALID_WORKING_CALENDAR_DAY ?? 0}
              </span>
            </div>

            <div className="flex justify-between items-center p-2 rounded bg-slate-950/60 border border-slate-800/60">
              <span className="text-emerald-400 font-medium">Balanceada (BALANCED)</span>
              <span className="font-mono font-bold text-emerald-300">
                {dashboard.crewCapacityDistribution.BALANCED ?? 0}
              </span>
            </div>

            <div className="flex justify-between items-center p-2 rounded bg-slate-950/60 border border-slate-800/60">
              <span className="text-blue-400 font-medium">Subutilizada (UNDERUTILIZED)</span>
              <span className="font-mono font-bold text-blue-300">
                {dashboard.crewCapacityDistribution.UNDERUTILIZED ?? 0}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
