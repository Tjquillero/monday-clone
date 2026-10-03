'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { AlertTriangle, Save, CheckCircle, DollarSign } from 'lucide-react';
import {
  WeeklyPlanningContext,
  WeeklyPlan,
  WeeklyPlanItem,
  PlanStatus,
  MissingActivityStandard,
  ActivityStandard,
  ActivityCategory,
} from '@/types/scheduler';
import { isColombianHoliday, getColombianHolidayName } from '@/lib/colombianHolidays';
import { isOperationalWorkingDay } from '@/lib/routineScheduler';
import WeekSelector from './WeekSelector';
import PlanningTable, { PlanningTableActivityItem } from './PlanningTable';
import CapacitySummary, { DailyCapacityDetailItem, CarryoverItemDisplay, RecurrentExceedsDisplay } from './CapacitySummary';
import PlanningWarnings from './PlanningWarnings';
import PlanLifecyclePanel from './PlanLifecyclePanel';

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

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

interface Props {
  boardId: string | undefined;
  plan: WeeklyPlanningContext | null;
  missingStandards: MissingActivityStandard[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  notOperational?: boolean;
  group: { id: string; title: string } | undefined;
  weekStart: Date;
  // Persistence
  savedPlan?: WeeklyPlan;
  savedPlanItems?: WeeklyPlanItem[];
  siteDailyCapacity?: number | null;
  standards?: ActivityStandard[];
  onSave: () => void;
  isSaving: boolean;
  onPublish: () => void;
  isPublishing: boolean;
  saveError: string | null;
  // Confirmación / Cierre — continuación del ciclo de vida del plan.
  onConfirm: () => void;
  isConfirming: boolean;
  confirmError: Error | null;
  onClose: () => void;
  isClosing: boolean;
  closeError: Error | null;
  onGoToCosts: () => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onChangeSite?: () => void;
  carryoverNextMonth?: CarryoverItemDisplay[];
  carryoverNextMonthProjection?: CarryoverItemDisplay[];
  carryoverFromThisWeek?: CarryoverItemDisplay[];
  recurrentExceedsCapacity?: RecurrentExceedsDisplay[];
}

export default function WeeklyPlannerView({
  boardId,
  plan,
  missingStandards,
  isLoading,
  isError,
  error,
  notOperational,
  group,
  weekStart,
  savedPlan,
  savedPlanItems,
  siteDailyCapacity,
  standards,
  onSave,
  isSaving,
  onPublish,
  isPublishing,
  saveError,
  onConfirm,
  isConfirming,
  confirmError,
  onClose,
  isClosing,
  closeError,
  onGoToCosts,
  onPrevWeek,
  onNextWeek,
  onChangeSite,
  carryoverNextMonth,
  carryoverNextMonthProjection,
  carryoverFromThisWeek,
  recurrentExceedsCapacity,
}: Props) {
  const noGroupSelected = !group;
  const hasMissingStandards = missingStandards.length > 0;

  const safeWeekStart = weekStart instanceof Date && !isNaN(weekStart.getTime()) ? weekStart : new Date();
  const safeWeekStartISO = safeWeekStart.toISOString().split('T')[0];

  const selectorProps = plan
    ? { weekStart: plan.week.start, weekEnd: plan.week.end, periodNumber: plan.week.number }
    : {
        weekStart: safeWeekStartISO,
        weekEnd: new Date(
          Date.UTC(
            safeWeekStart.getUTCFullYear(),
            safeWeekStart.getUTCMonth(),
            safeWeekStart.getUTCDate() + 4,
          )
        )
          .toISOString()
          .split('T')[0],
        periodNumber: 1,
      };

  // B1: Si existe plan guardado con items, estructurar las actividades desde weekly_plan_items
  const hasSavedItems = Boolean(savedPlan && savedPlanItems && savedPlanItems.length > 0);

  const displayActivities = useMemo<PlanningTableActivityItem[]>(() => {
    if (hasSavedItems && savedPlanItems) {
      const itemsByKey = new Map<string, WeeklyPlanItem[]>();
      for (const item of savedPlanItems) {
        const list = itemsByKey.get(item.activity_key) || [];
        list.push(item);
        itemsByKey.set(item.activity_key, list);
      }

      return Array.from(itemsByKey.entries()).map(([key, items]) => {
        const first = items[0];
        const matchedStd = standards?.find((s) => s.activity_key === key);
        const totalQty = items.reduce((sum, i) => sum + (i.planned_qty || 0), 0);
        const totalJr = items.reduce((sum, i) => sum + (i.planned_jr || 0), 0);
        const dailyMap: Record<string, number> = {};
        for (const it of items) {
          if (it.planned_date) {
            dailyMap[it.planned_date] = (dailyMap[it.planned_date] || 0) + (it.planned_jr || 0);
          }
        }

        return {
          activity_key: key,
          name: matchedStd?.name || first.name || key,
          category: (matchedStd?.category || 'ZONA VERDE') as ActivityCategory,
          priority: first.priority || matchedStd?.priority || 'must_execute',
          qty: totalQty,
          unit: first.unit || matchedStd?.unit || '',
          rendimiento: first.planned_rendimiento,
          frecuencia: first.planned_frecuencia,
          theoretical_journals_month: 0,
          theoretical_journals_week: totalJr,
          planned_jr: totalJr,
          dailyJournals: dailyMap,
        };
      });
    }

    if (plan && plan.activities) {
      return plan.activities;
    }

    return [];
  }, [hasSavedItems, savedPlanItems, standards, plan]);

  const hasNoActivities = displayActivities.length === 0;
  const showTable = displayActivities.length > 0;

  const isBlockingState = noGroupSelected || notOperational || isError || (hasNoActivities && !hasMissingStandards);
  const showWarnings = isBlockingState || hasMissingStandards;

  // B2: Con plan existente, ocultar "GUARDAR PLAN"
  const canSave = showTable && !savedPlan;
  const canPublish = Boolean(savedPlan && savedPlan.status === 'draft');
  const showActionBar = showTable || Boolean(savedPlan);

  // Desglose diario para CapacitySummary (B3 / B4)
  const dailyDetails = useMemo<DailyCapacityDetailItem[]>(() => {
    const startDate = new Date(selectorProps.weekStart + 'T00:00:00Z');
    return DAY_NAMES.map((name, idx) => {
      const d = new Date(startDate);
      d.setUTCDate(startDate.getUTCDate() + idx);
      const dateStr = d.toISOString().split('T')[0];
      const isHoliday = isColombianHoliday(d);
      const holidayName = getColombianHolidayName(d);
      const isWorking = isOperationalWorkingDay(d);

      let countingJournals = 0;
      let machineJournals = 0;

      if (hasSavedItems && savedPlanItems) {
        for (const item of savedPlanItems) {
          if (item.planned_date === dateStr) {
            const isMachine = ['1.11', '1.14', '1.15', '2.17'].includes(item.activity_key);
            if (isMachine) {
              machineJournals += item.planned_jr || 0;
            } else {
              countingJournals += item.planned_jr || 0;
            }
          }
        }
      }

      countingJournals = Number(countingJournals.toFixed(4));
      machineJournals = Number(machineJournals.toFixed(4));

      const cap = siteDailyCapacity ?? null;
      // B4: Tolerancia de 0.005
      const exceeded = isWorking && cap !== null && cap > 0 && countingJournals > cap + 0.005;
      const deficit = exceeded ? Number((countingJournals - cap).toFixed(4)) : 0;

      return {
        dateStr,
        dayName: name,
        dayNumber: idx + 1,
        isWorking,
        isHoliday,
        holidayName,
        countingJournals,
        machineJournals,
        capacity: cap,
        deficit,
        exceeded,
      };
    });
  }, [selectorProps.weekStart, hasSavedItems, savedPlanItems, siteDailyCapacity]);

  const workingDaysCount = dailyDetails.filter((d) => d.isWorking).length;

  return (
    <div className="h-full flex flex-col gap-4 p-4 overflow-auto custom-scrollbar">
      {/* ── Encabezado ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xs font-brand font-bold uppercase tracking-widest text-[var(--text-primary)]">
            Planificador Semanal
          </h2>
          {group && (
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-bold">
                {group.title}
              </p>
              {onChangeSite && (
                <button
                  onClick={onChangeSite}
                  className="text-[9px] font-bold uppercase tracking-wider text-[var(--color-primary)] dark:text-[var(--color-accent)] hover:underline transition-colors"
                >
                  · Cambiar sitio
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {boardId && group && (
            <Link
              href={`/dashboard?boardId=${boardId}&view=costos-operativos&groupId=${group.id}`}
              className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest px-2.5 py-1.5 rounded-[var(--radius-control)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--color-primary)]/40 transition-colors"
            >
              <DollarSign className="w-3 h-3" /> Costos operativos
            </Link>
          )}
          <WeekSelector {...selectorProps} onPrev={onPrevWeek} onNext={onNextWeek} />
        </div>
      </div>

      {/* ── Barra de acciones ───────────────────────────────────── */}
      {!isLoading && showActionBar && (
        <div className="flex items-center justify-between shrink-0">
          {/* Badge de estado: Si existe plan guardado muestra su estado real; nunca "Sin guardar" (B1) */}
          {savedPlan ? (
            <span
              className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded border ${
                STATUS_STYLE[savedPlan.status] || 'text-slate-400 border-slate-500/40'
              }`}
            >
              {STATUS_LABEL[savedPlan.status] || savedPlan.status}
              {hasMissingStandards ? ' · Parcial' : ''}
            </span>
          ) : (
            <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest">
              Sin guardar{hasMissingStandards ? ' · Parcial' : ''}
            </span>
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
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-[var(--radius-control)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:bg-[var(--color-primary-hover)] transition-colors shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Save className="w-3 h-3" />
                {isSaving ? 'Guardando…' : 'Guardar plan'}
              </button>
            )}
            {canPublish && (
              <button
                onClick={onPublish}
                disabled={isPublishing}
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-[var(--radius-control)] border border-green-500/50 text-green-400 hover:bg-green-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CheckCircle className="w-3 h-3" />
                {isPublishing ? 'Publicando…' : 'Publicar'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Confirmación / Cierre ───────────────────────────────── */}
      {!isLoading &&
        savedPlan &&
        (savedPlan.status === 'published' ||
          savedPlan.status === 'in_progress' ||
          savedPlan.status === 'confirmed' ||
          savedPlan.status === 'closed') && (
          <PlanLifecyclePanel
            planId={savedPlan.id}
            boardId={savedPlan.board_id || boardId}
            groupId={savedPlan.group_id || group?.id}
            weekStart={
              savedPlan.week_start ||
              (weekStart instanceof Date ? weekStart.toISOString().split('T')[0] : weekStart)
            }
            status={savedPlan.status}
            periodNumber={plan?.week.number ?? selectorProps.periodNumber}
            missingStandards={missingStandards}
            onConfirm={onConfirm}
            isConfirming={isConfirming}
            confirmError={confirmError}
            onClose={onClose}
            isClosing={isClosing}
            closeError={closeError}
            onGoToCosts={onGoToCosts}
          />
        )}

      {/* ── Cargando ────────────────────────────────────────────── */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[var(--color-primary)] dark:border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">
              Calculando plan...
            </p>
          </div>
        </div>
      )}

      {/* ── Contenido ───────────────────────────────────────────── */}
      {!isLoading && (
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          {showWarnings && (
            <PlanningWarnings
              boardId={boardId}
              error={isError ? error : null}
              notOperational={notOperational}
              noGroupSelected={noGroupSelected}
              hasNoActivities={hasNoActivities && !hasMissingStandards}
              missingStandards={missingStandards}
            />
          )}

          {showTable && (
            <>
              {plan && !plan.capacity.feasible && !savedPlan && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/10 shrink-0">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-400">
                    <span className="font-black">Plan infactible</span> — la carga semanal supera
                    la capacidad del sitio. Reduce cantidades, amplía días o aumenta cuadrilla.
                  </p>
                </div>
              )}
              <PlanningTable
                activities={displayActivities}
                weeklyAvailable={
                  siteDailyCapacity && siteDailyCapacity > 0
                    ? siteDailyCapacity * workingDaysCount
                    : plan?.capacity.weekly_available ?? 0
                }
                weekStartStr={selectorProps.weekStart}
              />
              <CapacitySummary
                plan={plan}
                siteDailyCapacity={siteDailyCapacity}
                workingDaysCount={workingDaysCount}
                dailyDetails={dailyDetails}
                zoneName={group?.title}
                carryoverNextMonth={carryoverNextMonth}
                carryoverNextMonthProjection={carryoverNextMonthProjection}
                carryoverFromThisWeek={carryoverFromThisWeek}
                recurrentExceedsCapacity={recurrentExceedsCapacity}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
