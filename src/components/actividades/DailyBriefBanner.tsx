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
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 md:p-6 mb-6">
      {/* 1. Header con fecha y badge de calendario legal colombiano */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-bold text-slate-800">
              Briefing Operativo del Día
            </h2>
            <p className="text-xs text-slate-500">
              Fecha de operación: <span className="font-semibold text-slate-700">{formattedDate}</span>
            </p>
          </div>
        </div>

        <div>
          {isWorkingDay ? (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse" />
              {workingDayReason}
            </span>
          ) : (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
              <AlertCircle className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
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
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            activeStatusFilter === 'all'
              ? 'bg-slate-50 border-primary ring-1 ring-primary/20'
              : 'bg-slate-50/50 border-slate-200/60 hover:bg-slate-50'
          }`}
        >
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            Actividades Hoy
          </div>
          <div className="text-xl md:text-2xl font-bold text-slate-800 mt-1">
            {totalActivities}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {completedActivities} cerradas · {inProgressActivities} en curso
          </div>
        </div>

        {/* Pendientes */}
        <div
          onClick={() => onFilterStatus && onFilterStatus('pending')}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            activeStatusFilter === 'pending'
              ? 'bg-amber-50/70 border-amber-400 ring-1 ring-amber-400/20'
              : 'bg-slate-50/50 border-slate-200/60 hover:bg-slate-50'
          }`}
        >
          <div className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide flex items-center">
            <Clock className="w-3.5 h-3.5 mr-1 text-amber-600" />
            Por Iniciar
          </div>
          <div className="text-xl md:text-2xl font-bold text-slate-800 mt-1">
            {pendingActivities}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Pendientes de reporte
          </div>
        </div>

        {/* Avance Físico Hoy */}
        <div className="p-3.5 rounded-xl border bg-slate-50/50 border-slate-200/60">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            Avance Reportado
          </div>
          <div className="text-xl md:text-2xl font-bold text-slate-800 mt-1">
            {totalDailyExecutedQty.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {totalVerifiedQty > 0 ? `${totalVerifiedQty.toLocaleString()} verificado` : `Meta planificada: ${totalPlannedQty.toLocaleString()}`}
          </div>
        </div>

        {/* Jornales de Turno */}
        <div className="p-3.5 rounded-xl border bg-slate-50/50 border-slate-200/60">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide flex items-center">
            <Users className="w-3.5 h-3.5 mr-1 text-slate-600" />
            Jornales Empleados
          </div>
          <div className="text-xl md:text-2xl font-bold text-slate-800 mt-1">
            {jornalesUsed.toFixed(1)} <span className="text-xs font-normal text-slate-400">JR</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Turno de hoy
          </div>
        </div>
      </div>

      {/* 3. Recursos Agregados Observados en la Jornada (POD-01) */}
      {consolidatedResources.length > 0 && (
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 flex items-center mr-1">
            <Wrench className="w-3.5 h-3.5 mr-1 text-slate-400" />
            Insumos y Equipos usados hoy:
          </span>
          {consolidatedResources.map((res, idx) => (
            <span
              key={`${res.resourceKey}-${idx}`}
              className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200"
            >
              <span className="font-semibold mr-1">{res.quantity} {res.unit}</span>
              {res.resourceName}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default DailyBriefBanner;
