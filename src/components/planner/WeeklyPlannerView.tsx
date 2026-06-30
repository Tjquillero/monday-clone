'use client';

import { AlertTriangle, Save, CheckCircle } from 'lucide-react';
import { WeeklyPlanningContext, WeeklyPlan, PlanStatus } from '@/types/scheduler';
import WeekSelector from './WeekSelector';
import PlanningTable from './PlanningTable';
import CapacitySummary from './CapacitySummary';
import PlanningWarnings from './PlanningWarnings';

const STATUS_LABEL: Record<PlanStatus, string> = {
  draft:       'Borrador',
  published:   'Publicado',
  in_progress: 'En ejecución',
  confirmed:   'Confirmado',
  closed:      'Cerrado',
  cancelled:   'Cancelado',
};

const STATUS_STYLE: Record<PlanStatus, string> = {
  draft:       'text-slate-400 border-slate-500/40',
  published:   'text-[#3B7EF8] border-[#3B7EF8]/40',
  in_progress: 'text-amber-400 border-amber-500/40',
  confirmed:   'text-green-400 border-green-500/40',
  closed:      'text-emerald-400 border-emerald-500/40',
  cancelled:   'text-red-400 border-red-500/40',
};

interface Props {
  plan: WeeklyPlanningContext | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  group: { id: string; title: string } | undefined;
  weekStart: Date;
  // Persistence
  savedPlan:    WeeklyPlan | undefined;
  onSave:       () => void;
  isSaving:     boolean;
  onPublish:    () => void;
  isPublishing: boolean;
  saveError:    string | null;
  onPrevWeek: () => void;
  onNextWeek: () => void;
}

export default function WeeklyPlannerView({
  plan, isLoading, isError, error,
  group, weekStart,
  savedPlan, onSave, isSaving, onPublish, isPublishing, saveError,
  onPrevWeek, onNextWeek,
}: Props) {
  const noGroupSelected  = !group;
  const hasNoActivities  = !!plan && plan.activities.length === 0;
  const showTable        = !!plan && plan.activities.length > 0;
  const isBlockingState  = noGroupSelected || isError || hasNoActivities;

  const canSave    = showTable && (!savedPlan || savedPlan.status === 'draft');
  const canPublish = !!savedPlan && savedPlan.status === 'draft';
  const showActionBar = showTable || !!savedPlan;

  const selectorProps = plan
    ? { weekStart: plan.week.start, weekEnd: plan.week.end, periodNumber: plan.week.number }
    : {
        weekStart: weekStart.toISOString().split('T')[0],
        weekEnd: new Date(Date.UTC(
          weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate() + 4,
        )).toISOString().split('T')[0],
        periodNumber: 1,
      };

  return (
    <div className="h-full flex flex-col gap-4 p-4 overflow-auto custom-scrollbar">

      {/* ── Encabezado ──────────────────────────────────────────── */}
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

      {/* ── Barra de acciones ───────────────────────────────────── */}
      {!isLoading && showActionBar && (
        <div className="flex items-center justify-between shrink-0">
          {/* Badge de estado */}
          {savedPlan ? (
            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded border ${STATUS_STYLE[savedPlan.status]}`}>
              {STATUS_LABEL[savedPlan.status]}
            </span>
          ) : (
            <span className="text-[9px] text-slate-600 uppercase tracking-widest">Sin guardar</span>
          )}

          {/* Acciones + error inline */}
          <div className="flex items-center gap-2">
            {saveError && (
              <p className="text-[10px] text-red-400 max-w-xs text-right leading-snug">
                {saveError}
              </p>
            )}
            {canSave && (
              <button
                onClick={onSave}
                disabled={isSaving}
                className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg bg-[#3B7EF8] text-white hover:bg-[#2563EB] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Save className="w-3 h-3" />
                {isSaving ? 'Guardando…' : 'Guardar plan'}
              </button>
            )}
            {canPublish && (
              <button
                onClick={onPublish}
                disabled={isPublishing}
                className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border border-green-500/50 text-green-400 hover:bg-green-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CheckCircle className="w-3 h-3" />
                {isPublishing ? 'Publicando…' : 'Publicar'}
              </button>
            )}
          </div>
        </div>
      )}

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
          {isBlockingState && (
            <PlanningWarnings
              error={isError ? error : null}
              noGroupSelected={noGroupSelected}
              hasNoActivities={hasNoActivities}
            />
          )}

          {showTable && (
            <>
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
