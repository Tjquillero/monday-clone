'use client';

import React from 'react';
import { Calendar, Users, Clock, AlertCircle, Wrench } from 'lucide-react';
import { DailyOperationalBrief } from '@/lib/dailyOperationalBriefService';
import { isOperationalWorkingDay } from '@/lib/routineScheduler';

interface DailyBriefBannerProps {
  brief: DailyOperationalBrief;
  onFilterStatus?: (status: 'all' | 'pending' | 'in_progress' | 'completed') => void;
  activeStatusFilter?: string;
}

export const DailyBriefBanner: React.FC<DailyBriefBannerProps> = ({
  brief,
  onFilterStatus,
  activeStatusFilter = 'all',
}) => {
  const { evaluationDate, activities = [], closureSummary } = brief;

  const dateStr = evaluationDate || (brief as any).date || '2026-09-15';
  const [year, month, day] = dateStr.split('-');
  const formattedDate = `${day}/${month}/${year}`;

  const isWorkingDay = isOperationalWorkingDay(dateStr);
  const workingDayReason = isWorkingDay
    ? 'Jornada Laboral Ordinaria'
    : 'Jornada No Laboral / Festivo';

  const totalActivities = closureSummary?.totalActivitiesScheduled ?? activities.length;
  const completedActivities = closureSummary?.completedTodayCount ?? 0;
  const inProgressActivities = closureSummary?.inProgressCount ?? 0;
  const pendingActivities = closureSummary?.notExecutedCount ?? activities.filter((a) => a.dailyExecutedQty === 0).length;

  const totalPlannedQty = activities.reduce((sum, a) => sum + (a.plannedQty || 0), 0);
  const totalDailyExecutedQty = activities.reduce((sum, a) => sum + (a.dailyExecutedQty || 0), 0);
  const totalVerifiedQty = activities.reduce((sum, a) => sum + (a.verifiedQty || 0), 0);

  const jornalesUsed = closureSummary?.totalJornalesUsedToday ?? 0;
  const consolidatedResources = closureSummary?.consolidatedResources ?? [];

  return (
    <div className="bg-[var(--card-bg)] rounded-[var(--radius-surface)] border border-[var(--border-color)] shadow-card p-5 md:p-6 mb-6 transition-colors">
      {/* 1. Header con fecha y badge de calendario legal colombiano */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[var(--border-color)]">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-[var(--radius-control)] bg-[var(--color-primary-subtle)] text-[var(--color-primary)]">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-brand font-bold text-[var(--text-primary)]">
              Briefing Operativo del Día
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Fecha de operación: <span className="font-semibold text-[var(--text-secondary)] font-mono">{formattedDate}</span>
            </p>
          </div>
        </div>

        <div>
          {isWorkingDay ? (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-[var(--color-success)] border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-[var(--color-success)] mr-2 animate-pulse" />
              {workingDayReason}
            </span>
          ) : (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-[var(--color-warning)] border border-amber-500/30">
              <AlertCircle className="w-3.5 h-3.5 mr-1.5 text-[var(--color-warning)]" />
              {workingDayReason}
            </span>
          )}
        </div>
      </div>

      {/* 2. Grid de Métricas Principales del Brief */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4 my-4">
        {/* Total Actividades */}
        <div
          onClick={() => onFilterStatus && onFilterStatus('all')}
          className={`p-3.5 rounded-[var(--radius-control)] border transition-all cursor-pointer ${
            activeStatusFilter === 'all'
              ? 'bg-[var(--color-primary-subtle)] border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]/20'
              : 'bg-[var(--color-surface-subtle)] border-[var(--border-color)] hover:border-[var(--color-primary)]/40'
          }`}
        >
          <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
            Actividades Hoy
          </div>
          <div className="text-xl md:text-2xl font-bold font-mono text-[var(--text-primary)] mt-1">
            {totalActivities}
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
            {completedActivities} cerradas · {inProgressActivities} en curso
          </div>
        </div>

        {/* Pendientes */}
        <div
          onClick={() => onFilterStatus && onFilterStatus('pending')}
          className={`p-3.5 rounded-[var(--radius-control)] border transition-all cursor-pointer ${
            activeStatusFilter === 'pending'
              ? 'bg-amber-500/15 border-[var(--color-warning)] ring-1 ring-[var(--color-warning)]/20'
              : 'bg-[var(--color-surface-subtle)] border-[var(--border-color)] hover:border-[var(--color-warning)]/40'
          }`}
        >
          <div className="text-[11px] font-semibold text-[var(--color-warning)] uppercase tracking-wide flex items-center">
            <Clock className="w-3.5 h-3.5 mr-1 text-[var(--color-warning)]" />
            Por Iniciar
          </div>
          <div className="text-xl md:text-2xl font-bold font-mono text-[var(--text-primary)] mt-1">
            {pendingActivities}
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
            Pendientes de reporte
          </div>
        </div>

        {/* Avance Físico Hoy */}
        <div className="p-3.5 rounded-[var(--radius-control)] border bg-[var(--color-surface-subtle)] border-[var(--border-color)]">
          <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
            Avance Reportado
          </div>
          <div className="text-xl md:text-2xl font-bold font-mono text-[var(--text-primary)] mt-1">
            {totalDailyExecutedQty.toLocaleString()}
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
            {totalVerifiedQty > 0 ? `${totalVerifiedQty.toLocaleString()} verificado` : `Meta planificada: ${totalPlannedQty.toLocaleString()}`}
          </div>
        </div>

        {/* Jornales de Turno */}
        <div className="p-3.5 rounded-[var(--radius-control)] border bg-[var(--color-surface-subtle)] border-[var(--border-color)]">
          <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide flex items-center">
            <Users className="w-3.5 h-3.5 mr-1 text-[var(--text-secondary)]" />
            Jornales Empleados
          </div>
          <div className="text-xl md:text-2xl font-bold font-mono text-[var(--text-primary)] mt-1">
            {jornalesUsed.toFixed(1)} <span className="text-xs font-normal text-[var(--text-muted)]">JR</span>
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
            Turno de hoy
          </div>
        </div>
      </div>

      {/* 3. Recursos Agregados Observados en la Jornada (POD-01) */}
      {consolidatedResources.length > 0 && (
        <div className="pt-3 border-t border-[var(--border-color)] flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[var(--text-secondary)] flex items-center mr-1">
            <Wrench className="w-3.5 h-3.5 mr-1 text-[var(--text-muted)]" />
            Insumos y Equipos usados hoy:
          </span>
          {consolidatedResources.map((res, idx) => (
            <span
              key={`${res.resourceKey}-${idx}`}
              className="inline-flex items-center px-2.5 py-0.5 rounded-[var(--radius-control)] text-xs font-medium bg-[var(--color-surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-color)]"
            >
              <span className="font-semibold font-mono mr-1">{res.quantity} {res.unit}</span>
              {res.resourceName}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default DailyBriefBanner;
