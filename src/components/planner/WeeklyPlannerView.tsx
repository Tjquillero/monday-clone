'use client';

import { AlertTriangle } from 'lucide-react';
import { WeeklyPlanningContext } from '@/types/scheduler';
import WeekSelector from './WeekSelector';
import PlanningTable from './PlanningTable';
import CapacitySummary from './CapacitySummary';
import PlanningWarnings from './PlanningWarnings';

interface Props {
  plan: WeeklyPlanningContext | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  group: { id: string; title: string } | undefined;
  weekStart: Date;       // para mostrar el selector antes de que llegue el plan
  onPrevWeek: () => void;
  onNextWeek: () => void;
}

export default function WeeklyPlannerView({
  plan, isLoading, isError, error,
  group, weekStart, onPrevWeek, onNextWeek,
}: Props) {
  const noGroupSelected = !group;
  const hasNoActivities = !!plan && plan.activities.length === 0;
  const showTable = !!plan && plan.activities.length > 0;

  // El selector usa datos del plan cuando existe, o deriva fechas del weekStart local
  const selectorProps = plan
    ? { weekStart: plan.week.start, weekEnd: plan.week.end, periodNumber: plan.week.number }
    : {
        weekStart: weekStart.toISOString().split('T')[0],
        weekEnd: new Date(Date.UTC(
          weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate() + 4,
        )).toISOString().split('T')[0],
        periodNumber: 1,
      };

  // Blocking state: reemplaza la tabla. No mostrar cuando hay tabla + advertencia infactible.
  const isBlockingState = noGroupSelected || isError || hasNoActivities;

  return (
    <div className="h-full flex flex-col gap-4 p-4 overflow-auto custom-scrollbar">
      {/* ── Barra de encabezado ─────────────────────────────────── */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xs font-black uppercase tracking-widest text-white">
            Planificador Semanal
          </h2>
          {group && (
            <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-widest">
              {group.title}
            </p>
          )}
        </div>
        <WeekSelector {...selectorProps} onPrev={onPrevWeek} onNext={onNextWeek} />
      </div>

      {/* ── Cargando ────────────────────────────────────────────── */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[#3B7EF8] border-t-transparent rounded-full animate-spin" />
            <p className="text-[10px] text-slate-500 uppercase tracking-widest">Calculando plan...</p>
          </div>
        </div>
      )}

      {/* ── Contenido ───────────────────────────────────────────── */}
      {!isLoading && (
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          {/* Estados bloqueantes (sin datos / error / sin sitio) */}
          {isBlockingState && (
            <PlanningWarnings
              error={isError ? error : null}
              noGroupSelected={noGroupSelected}
              hasNoActivities={hasNoActivities}
            />
          )}

          {/* Plan con actividades */}
          {showTable && (
            <>
              {/* Advertencia de infactibilidad encima de la tabla (no bloqueante) */}
              {!plan.capacity.feasible && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/10 shrink-0">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-400">
                    <span className="font-black">Plan infactible</span> — la carga semanal supera
                    la capacidad del sitio. Reduce cantidades, amplía días o aumenta cuadrilla.
                  </p>
                </div>
              )}
              <PlanningTable
                activities={plan.activities}
                weeklyAvailable={plan.capacity.weekly_available}
              />
              <CapacitySummary plan={plan} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
