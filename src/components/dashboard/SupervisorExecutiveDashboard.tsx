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
      <div className="flex items-center justify-center p-8 bg-[var(--card-bg)] rounded-[var(--radius-surface)] border border-[var(--border-color)] text-[var(--text-muted)] shadow-[var(--shadow-card)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary)] mr-3"></div>
        <span className="text-sm font-medium text-[var(--text-secondary)]">Cargando datos determinísticos de supervisión...</span>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="p-6 bg-rose-50 dark:bg-rose-950/40 rounded-[var(--radius-surface)] border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200">
        <h3 className="font-bold text-sm">Error al cargar el Dashboard Ejecutivo</h3>
        <p className="text-xs mt-1">No se pudieron recuperar las métricas soberanas del sitio.</p>
      </div>
    );
  }

  const getSeverityBadge = (severity: ExecutiveAlertSeverity) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30';
      case 'HIGH':
        return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30';
      case 'MEDIUM':
        return 'bg-[var(--color-primary-subtle)] text-[var(--color-primary)] dark:text-[var(--text-primary)] border-[var(--color-primary)]/20';
      default:
        return 'bg-[var(--color-surface-subtle)] text-[var(--text-muted)] border-[var(--border-color)]';
    }
  };

  return (
    <div className="space-y-6 p-6 bg-[var(--card-bg)] text-[var(--text-primary)] rounded-[var(--radius-surface)] border border-[var(--border-color)] shadow-[var(--shadow-card)]">
      {/* Header Ejecutivo */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-[var(--border-color)] gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <span className="px-2.5 py-1 text-xs font-semibold uppercase tracking-wider rounded-[var(--radius-control)] bg-[var(--color-primary-subtle)] text-[var(--color-primary)] border border-[var(--border-color)]">
              Fase 4 · Módulo 4
            </span>
            <h2 className="text-xl font-brand font-bold text-[var(--text-primary)] tracking-tight">
              Control Consultivo de Supervisión — {boardTitle}
            </h2>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Consolidado determinístico de Avance Físico, Salud de Capacidad ($H4.9$) y Consumo Operativo (M3).
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className="inline-flex items-center px-3 py-1 text-xs font-mono font-medium rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mr-2"></span>
            LECTURA PURA SOBERANA
          </span>
        </div>
      </div>

      {/* KPI Primary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Avance Físico Verificado */}
        <div className="p-4 rounded-[var(--radius-control)] bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-2xs flex flex-col justify-between">
          <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
            Avance Físico Verificado
          </span>
          <div className="my-2">
            <div className="text-3xl font-extrabold font-mono text-[var(--text-primary)]">
              {dashboard.verifiedPhysicalProgressPct.toFixed(1)}%
            </div>
            <div className="w-full bg-[var(--color-surface-subtle)] h-2 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-emerald-500 h-full transition-all duration-500"
                style={{ width: `${Math.min(100, dashboard.verifiedPhysicalProgressPct)}%` }}
              ></div>
            </div>
          </div>
          <span className="text-xs text-[var(--text-muted)]">
            {dashboard.totalVerifiedExecutedQty} de {dashboard.totalPlannedQty} unidades verificadas
          </span>
        </div>

        {/* Total Ocurrencias de Plan */}
        <div className="p-4 rounded-[var(--radius-control)] bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-2xs flex flex-col justify-between">
          <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
            Planificación Semanal
          </span>
          <div className="my-2 text-3xl font-extrabold font-mono text-[var(--text-primary)]">
            {dashboard.totalPlannedItems} <span className="text-base font-normal text-[var(--text-muted)]">ítems</span>
          </div>
          <span className="text-xs text-[var(--text-muted)]">
            Theoretical JR: {dashboard.consumptionSummary.totalTheoreticalJr} JR
          </span>
        </div>

        {/* Consumo de Jornales Verificados */}
        <div className="p-4 rounded-[var(--radius-control)] bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-2xs flex flex-col justify-between">
          <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
            Jornales Ejecutados (Verificados)
          </span>
          <div className="my-2 text-3xl font-extrabold font-mono text-[var(--color-accent)]">
            {dashboard.consumptionSummary.totalExecutedJrVerified}{' '}
            <span className="text-base font-normal text-[var(--text-muted)]">JR</span>
          </div>
          <span className="text-xs text-[var(--text-muted)]">
            Balance $\Delta_{`jr`}$: {dashboard.consumptionSummary.overallDeltaJr > 0 ? '+' : ''}
            {dashboard.consumptionSummary.overallDeltaJr} JR
          </span>
        </div>

        {/* Estado Monetario Desacoplado */}
        <div className="p-4 rounded-[var(--radius-control)] bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-2xs flex flex-col justify-between">
          <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
            Costo Monetario Real Devengado
          </span>
          <div className="my-2 text-sm font-semibold text-[var(--text-secondary)] bg-[var(--color-surface-subtle)] p-2.5 rounded-[var(--radius-control)] border border-[var(--border-color)] text-center font-mono">
            {dashboard.monetaryCostStatus}
          </div>
          <span className="text-xs text-[var(--text-muted)]">
            Desacoplado soberanamente (0 estimaciones inventadas)
          </span>
        </div>
      </div>

      {/* Grid Secundario: Alertas Críticas & Distribución de Salud */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel de Alertas Críticas */}
        <div className="lg:col-span-2 p-5 rounded-[var(--radius-control)] bg-[var(--bg-secondary)] border border-[var(--border-color)] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 mr-2"></span>
              Matriz de Alertas Críticas de Supervisión ({dashboard.alerts.length})
            </h3>
            <span className="text-xs text-[var(--text-muted)] font-mono">ALERT-01 ... ALERT-06</span>
          </div>

          {dashboard.alerts.length === 0 ? (
            <div className="p-6 text-center text-[var(--text-muted)] bg-[var(--color-surface-subtle)] rounded-[var(--radius-control)] border border-[var(--border-color)]">
              🟢 No se detectaron anomalías operativas ni alertas de capacidad en el sitio.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {dashboard.alerts.map((alert) => (
                <div
                  key={alert.alertId}
                  className="p-3 rounded-[var(--radius-control)] bg-[var(--card-bg)] border border-[var(--border-color)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-[var(--color-primary)]/40 transition-all"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`px-2 py-0.5 text-xs font-mono font-bold rounded-[var(--radius-control)] border ${getSeverityBadge(
                          alert.severity
                        )}`}
                      >
                        {alert.alertCode}
                      </span>
                      <span className="text-xs font-medium text-[var(--text-muted)]">[{alert.moduleSource}]</span>
                      <span className="text-xs text-[var(--text-muted)] font-mono">Entity: {alert.entityId}</span>
                    </div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{alert.description}</p>
                  </div>
                  <div className="text-xs font-mono text-[var(--text-muted)] self-start sm:self-center shrink-0">
                    {alert.plannedDate}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Salud de Capacidad de Cuadrillas (H4.9) */}
        <div className="p-5 rounded-[var(--radius-control)] bg-[var(--bg-secondary)] border border-[var(--border-color)] space-y-4">
          <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-primary)] dark:bg-[var(--color-accent)] mr-2"></span>
            Salud de Capacidad ($H4.9$)
          </h3>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center p-2 rounded-[var(--radius-control)] bg-[var(--card-bg)] border border-[var(--border-color)]">
              <span className="text-red-600 dark:text-red-400 font-medium">Sobrecarga (OVERLOADED)</span>
              <span className="font-mono font-bold text-red-600 dark:text-red-300">
                {dashboard.crewCapacityDistribution.OVERLOADED ?? 0}
              </span>
            </div>

            <div className="flex justify-between items-center p-2 rounded-[var(--radius-control)] bg-[var(--card-bg)] border border-[var(--border-color)]">
              <span className="text-red-600 dark:text-red-400 font-medium">Capacidad Cero (CAPACITY_ZERO)</span>
              <span className="font-mono font-bold text-red-600 dark:text-red-300">
                {dashboard.crewCapacityDistribution.CAPACITY_ZERO ?? 0}
              </span>
            </div>

            <div className="flex justify-between items-center p-2 rounded-[var(--radius-control)] bg-[var(--card-bg)] border border-[var(--border-color)]">
              <span className="text-amber-600 dark:text-amber-400 font-medium">Día No Laborable (INVALID_DAY)</span>
              <span className="font-mono font-bold text-amber-600 dark:text-amber-300">
                {dashboard.crewCapacityDistribution.INVALID_WORKING_CALENDAR_DAY ?? 0}
              </span>
            </div>

            <div className="flex justify-between items-center p-2 rounded-[var(--radius-control)] bg-[var(--card-bg)] border border-[var(--border-color)]">
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">Balanceada (BALANCED)</span>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-300">
                {dashboard.crewCapacityDistribution.BALANCED ?? 0}
              </span>
            </div>

            <div className="flex justify-between items-center p-2 rounded-[var(--radius-control)] bg-[var(--card-bg)] border border-[var(--border-color)]">
              <span className="text-[var(--color-primary)] dark:text-[var(--text-primary)] font-medium">Subutilizada (UNDERUTILIZED)</span>
              <span className="font-mono font-bold text-[var(--color-primary)] dark:text-[var(--text-primary)]">
                {dashboard.crewCapacityDistribution.UNDERUTILIZED ?? 0}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
