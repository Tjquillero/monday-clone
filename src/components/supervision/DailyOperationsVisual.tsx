'use client';

import React, { useState, useMemo } from 'react';
import { useDailyOperationsVisual } from '@/hooks/useDailyOperationsVisual';
import { DailyOperationCard } from './DailyOperationCard';
import { useCrews } from '@/hooks/useCrews';
import { Camera, Calendar, RefreshCw, MapPin, Layers } from 'lucide-react';

interface DailyOperationsVisualProps {
  boardId: string;
  boardTitle?: string;
}

export const DailyOperationsVisual: React.FC<DailyOperationsVisualProps> = ({
  boardId,
  boardTitle = 'Operación en Campo',
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  });

  const [evidenceOnlyFilter, setEvidenceOnlyFilter] = useState<boolean>(false);

  const { data: operationsData, isLoading, isError, error, refetch, isFetching } = useDailyOperationsVisual({
    boardId,
    evaluatedDate: selectedDate,
  });

  const brief = operationsData?.brief;
  const siteGroups = operationsData?.siteGroups || [];

  const { data: crews = [] } = useCrews(boardId);

  const crewsMap = useMemo(() => {
    return new Map(crews.map((c: any) => [c.id, c.name]));
  }, [crews]);

  // Filtrar grupos y actividades según selección
  const filteredSiteGroups = useMemo(() => {
    if (!siteGroups) return [];
    return siteGroups
      .map((site) => {
        const filteredActs = site.activities.filter((act) => {
          if (evidenceOnlyFilter && !act.hasBeforePhoto && !act.hasAfterPhoto) return false;
          return true;
        });
        return {
          ...site,
          activities: filteredActs,
        };
      })
      .filter((site) => site.activities.length > 0);
  }, [siteGroups, evidenceOnlyFilter]);

  const totalFilteredCount = filteredSiteGroups.reduce((sum, s) => sum + s.activities.length, 0);

  return (
    <div className="space-y-6 text-slate-100">
      {/* Barra de Control y Filtros de la Jornada */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 p-5 rounded-2xl border border-slate-800 backdrop-blur-md shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 text-[10px] font-extrabold uppercase tracking-wider">
              Supervisión Visual
            </span>
            <span className="text-xs font-mono text-slate-400">H1 · Operación Diaria por Sitio</span>
          </div>
          <h2 className="text-xl font-black text-white tracking-tight">
            Control Visual de Campo — {boardTitle}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Vista en vivo de las actividades programadas y sus evidencias fotográficas organizadas por frente de trabajo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Selector de Fecha */}
          <div className="flex items-center gap-2 bg-slate-950 px-3 py-2 rounded-xl border border-slate-800 text-xs">
            <Calendar className="w-4 h-4 text-indigo-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-white font-medium focus:outline-none text-xs cursor-pointer"
            />
          </div>

          {/* Selector Rápido de Días con Programación */}
          {operationsData?.availableDates && operationsData.availableDates.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto py-1">
              {operationsData.availableDates.slice(-6).map((d) => {
                const isSelected = d === selectedDate;
                const dateObj = new Date(`${d}T12:00:00Z`);
                const dayName = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][dateObj.getUTCDay()];
                const dayNum = dateObj.getUTCDate();
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSelectedDate(d)}
                    className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all border shrink-0 ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
                    }`}
                  >
                    <span className="opacity-75 text-[9px] uppercase block leading-none">{dayName}</span>
                    <span>{dayNum}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Toggle Solo con Evidencia */}
          <button
            type="button"
            onClick={() => setEvidenceOnlyFilter(!evidenceOnlyFilter)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
              evidenceOnlyFilter
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-600/20'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Con Foto</span>
          </button>

          {/* Botón Refrescar */}
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
            title="Refrescar datos en vivo"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Resumen Superior del Turno */}
      {brief && brief.closureSummary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-950/40 p-4 rounded-2xl border border-slate-800/80">
          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/60">
            <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider block">
              Programadas Hoy
            </span>
            <span className="text-2xl font-black text-white">
              {brief.closureSummary.totalActivitiesScheduled}
            </span>
          </div>
          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/60">
            <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider block">
              Terminadas Hoy
            </span>
            <span className="text-2xl font-black text-emerald-400">
              {brief.closureSummary.completedTodayCount}
            </span>
          </div>
          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/60">
            <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider block">
              Continúan Mañana
            </span>
            <span className="text-2xl font-black text-blue-400">
              {brief.closureSummary.continuedTomorrowCount}
            </span>
          </div>
          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/60">
            <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider block">
              Jornales del Turno
            </span>
            <span className="text-2xl font-black text-amber-400">
              {brief.closureSummary.totalJornalesUsedToday.toFixed(1)}{' '}
              <span className="text-xs font-normal text-slate-400">JR</span>
            </span>
          </div>
        </div>
      )}

      {/* Estado de Carga */}
      {isLoading && (
        <div className="py-20 flex flex-col items-center justify-center gap-3 bg-slate-900/40 rounded-2xl border border-slate-800">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">
            Cargando actividades del día...
          </p>
        </div>
      )}

      {/* Estado de Error */}
      {isError && (
        <div className="p-6 bg-red-950/40 border border-red-800 rounded-2xl text-red-300">
          <h3 className="font-bold text-sm">Error al cargar la operación diaria</h3>
          <p className="text-xs text-red-400 mt-1">{(error as Error)?.message}</p>
        </div>
      )}

      {/* Agrupación Visual por Sitio / Frente de Trabajo */}
      {!isLoading && !isError && filteredSiteGroups.length > 0 && (
        <div className="space-y-8">
          {filteredSiteGroups.map((site) => (
            <div key={site.groupId} className="space-y-4 bg-slate-900/40 p-5 rounded-2xl border border-slate-800/80">
              {/* Encabezado del Sitio */}
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shadow-sm">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white uppercase tracking-wide">
                      {site.groupTitle}
                    </h3>
                    <span className="text-xs text-slate-300 font-medium">
                      {site.activities.length} {site.activities.length === 1 ? 'actividad programada' : 'actividades programadas'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Cuadrícula de Tarjetas para este Sitio */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {site.activities.map((activity) => (
                  <DailyOperationCard
                    key={activity.weeklyPlanItemId}
                    activity={activity}
                    siteName={site.groupTitle}
                    crewName={activity.crewId ? crewsMap.get(activity.crewId) : undefined}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Estado Vacío */}
      {!isLoading && !isError && totalFilteredCount === 0 && (
        <div className="py-16 flex flex-col items-center justify-center gap-4 bg-slate-900/40 rounded-2xl border border-dashed border-slate-800 text-slate-400 p-6 text-center">
          <Camera className="w-10 h-10 opacity-30 text-indigo-400" />
          <div>
            <p className="text-sm font-bold text-white">No hay actividades programadas para la fecha seleccionada ({selectedDate}).</p>
            <p className="text-xs text-slate-400 mt-1">Selecciona una jornada con actividades registradas:</p>
          </div>
          {operationsData?.availableDates && operationsData.availableDates.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-2 max-w-lg mt-1">
              {operationsData.availableDates.slice(-6).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSelectedDate(d)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                >
                  Ver jornada {d}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
