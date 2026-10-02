'use client';

import { useMemo } from 'react';
import { Lock, Clock, Calendar } from 'lucide-react';
import { PlanningActivity, ActivityPriority, ActivityCategory } from '@/types/scheduler';
import { isColombianHoliday, getColombianHolidayName } from '@/lib/colombianHolidays';
import { isOperationalWorkingDay } from '@/lib/routineScheduler';

export interface PlanningTableActivityItem {
  activity_key: string;
  name: string;
  category: ActivityCategory;
  priority: ActivityPriority;
  qty: number;
  unit: string;
  rendimiento: number | null;
  frecuencia: number;
  theoretical_journals_month?: number;
  theoretical_journals_week?: number;
  dailyJournals?: Record<string, number>;
  planned_jr?: number;
  status?: string;
  is_manual_override?: boolean;
}

interface Props {
  activities: (PlanningActivity | PlanningTableActivityItem)[];
  weeklyAvailable: number;
  weekStartStr?: string; // YYYY-MM-DD (Monday ISO)
}

const PRIORITY_STYLE: Record<ActivityPriority, string> = {
  must_execute: 'bg-red-500/20 text-red-400 border-red-500/30',
  preferred:    'bg-[var(--color-primary-subtle)] text-[var(--color-primary)] border-[var(--color-primary)]/30 dark:text-[var(--text-primary)]',
  flexible:     'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

const PRIORITY_LABEL: Record<ActivityPriority, string> = {
  must_execute: 'Obligatoria',
  preferred:    'Preferida',
  flexible:     'Flexible',
};

const CATEGORY_STYLE: Record<ActivityCategory, string> = {
  'ZONA VERDE':    'bg-green-500/15 text-green-400',
  'ZONA DURA':     'bg-amber-500/15 text-amber-400',
  'ZONA DE PLAYA': 'bg-cyan-500/15 text-cyan-400',
};

function getFrequencyBadge(frecuencia?: number | null): { label: string; color: string } {
  if (!frecuencia || frecuencia <= 0) return { label: 'Ocasional', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30' };
  if (frecuencia === 1) return { label: '1x / mes', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
  if (frecuencia === 2) return { label: 'Quincenal', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' };
  if (frecuencia === 4) return { label: 'Semanal', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' };
  if (frecuencia === 6) return { label: '6x / mes', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' };
  if (frecuencia === 8) return { label: '2x / sem', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' };
  if (frecuencia === 12) return { label: '3x / sem', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' };
  if (frecuencia >= 25) return { label: 'Diaria', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
  if (frecuencia === 0.5) return { label: 'Bimestral', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' };
  if (Math.abs(frecuencia - 0.33) < 0.05 || Math.abs(frecuencia - 1 / 3) < 0.05) return { label: 'Trimestral', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
  return { label: `Frec ${frecuencia.toFixed(1)}`, color: 'bg-slate-500/20 text-slate-300 border-slate-500/30' };
}

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

interface OperationalDayHeader {
  dayName: string;
  dateStr: string;
  dayNumber: number; // 1 = Mon .. 6 = Sat
  isWorkingDay: boolean;
  isHoliday: boolean;
  holidayName: string | null;
}

export default function PlanningTable({ activities, weeklyAvailable, weekStartStr }: Props) {
  // Generate 6 working days (Monday to Saturday) for the week
  const weekDays = useMemo<OperationalDayHeader[]>(() => {
    if (!weekStartStr) {
      return DAY_NAMES.map((name, idx) => ({
        dayName: name,
        dateStr: '',
        dayNumber: idx + 1,
        isWorkingDay: true,
        isHoliday: false,
        holidayName: null,
      }));
    }

    const startDate = new Date(weekStartStr + 'T00:00:00Z');
    return DAY_NAMES.map((name, idx) => {
      const d = new Date(startDate);
      d.setUTCDate(startDate.getUTCDate() + idx);
      const dateStr = d.toISOString().split('T')[0];
      const isHoliday = isColombianHoliday(d);
      const holidayName = getColombianHolidayName(d);
      const isWorkingDay = isOperationalWorkingDay(d);

      return {
        dayName: name,
        dateStr,
        dayNumber: idx + 1,
        isWorkingDay,
        isHoliday,
        holidayName,
      };
    });
  }, [weekStartStr]);

  if (activities.length === 0) return null;

  return (
    <div className="bg-[var(--card-bg)] rounded-[var(--radius-surface)] border border-[var(--border-color)] shadow-[var(--shadow-card)] overflow-hidden">
      {/* Visual Header Indicator */}
      <div className="px-4 py-2 bg-[var(--color-surface-subtle)] border-b border-[var(--border-color)] flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] font-mono">
          <Calendar className="w-3.5 h-3.5 text-[var(--color-primary)] dark:text-[var(--color-accent)]" />
          <span>Calendario Operativo: Lunes – Sábado (Sujeto a festivos Ley Emiliani)</span>
        </div>
        <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest font-bold font-mono">
          {activities.length} Actividad{activities.length === 1 ? '' : 'es'}
        </span>
      </div>

      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-left border-collapse min-w-[760px]">
          <thead>
            <tr className="border-b border-[var(--border-color)] bg-black/20">
              <Th minWidth="w-56">Actividad & Recurrencia</Th>
              <Th width="w-24">Prioridad</Th>
              <Th width="w-24">Cantidad</Th>
              <Th right width="w-20">Rendimiento</Th>

              {/* Day Headers */}
              {weekDays.map((wd) => (
                <th
                  key={wd.dayName}
                  className={`px-2 py-2 text-center border-l border-[var(--border-color)] text-[9px] font-black uppercase tracking-widest ${
                    wd.isHoliday
                      ? 'bg-amber-500/10 text-amber-300'
                      : !wd.isWorkingDay
                      ? 'bg-slate-900/60 text-slate-600'
                      : 'text-slate-400'
                  }`}
                  title={wd.holidayName ? `Festivo Colombia: ${wd.holidayName}` : undefined}
                >
                  <div>{wd.dayName}</div>
                  {wd.dateStr && (
                    <div className="text-[8px] font-mono text-slate-500 font-normal">
                      {wd.dateStr.slice(8, 10)}/{wd.dateStr.slice(5, 7)}
                    </div>
                  )}
                  {wd.isHoliday && (
                    <span className="inline-block mt-0.5 text-[7px] bg-amber-500/20 text-amber-300 px-1 rounded border border-amber-500/30">
                      🇨🇴 {wd.holidayName || 'Festivo'}
                    </span>
                  )}
                </th>
              ))}

              <Th right width="w-24">JR / Sem</Th>
            </tr>
          </thead>
          <tbody>
            {activities.map((a, i) => (
              <ActivityRow
                key={`${a.activity_key}-${i}`}
                activity={a}
                weeklyAvailable={weeklyAvailable}
                weekDays={weekDays}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, right = false, width = '', minWidth = '' }: { children: React.ReactNode; right?: boolean; width?: string; minWidth?: string }) {
  return (
    <th className={`px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-500 ${width} ${minWidth} ${right ? 'text-right' : ''}`}>
      {children}
    </th>
  );
}

function ActivityRow({
  activity: a,
  weeklyAvailable,
  weekDays,
}: {
  activity: PlanningActivity | PlanningTableActivityItem;
  weeklyAvailable: number;
  weekDays: OperationalDayHeader[];
}) {
  const weeklyJR =
    typeof a.theoretical_journals_week === 'number'
      ? a.theoretical_journals_week
      : typeof (a as any).planned_jr === 'number'
      ? (a as any).planned_jr
      : 0;

  const pct = weeklyAvailable > 0
    ? Math.min(100, Math.round((weeklyJR / weeklyAvailable) * 100))
    : 0;

  const freqBadge = getFrequencyBadge(a.frecuencia);

  const dailyJournalsMap = (a as any).dailyJournals as Record<string, number> | undefined;

  return (
    <tr className="border-b border-[var(--border-color)] hover:bg-white/[0.02] transition-colors">
      {/* Activity + Recurrence */}
      <td className="px-4 py-3 min-w-[220px]">
        <p className="text-xs font-bold text-[var(--text-primary)] leading-snug">{a.name}</p>
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${CATEGORY_STYLE[a.category] || 'bg-slate-500/15 text-slate-400'}`}>
            {a.category}
          </span>
          <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${freqBadge.color}`}>
            <Clock className="w-2.5 h-2.5 inline-block mr-0.5" />
            {freqBadge.label}
          </span>
          {a.theoretical_journals_month !== undefined && a.theoretical_journals_month !== null && (
            <span className="text-[9px] font-mono text-[var(--text-secondary)]">
              <span className="text-[var(--text-primary)] font-bold">{a.theoretical_journals_month.toFixed(2)}</span> JR/m
            </span>
          )}
        </div>
      </td>

      {/* Priority */}
      <td className="px-4 py-3">
        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${PRIORITY_STYLE[a.priority] || 'bg-slate-500/20 text-slate-400'}`}>
          {PRIORITY_LABEL[a.priority] || a.priority}
        </span>
      </td>

      {/* Scope Quantity */}
      <td className="px-4 py-3 text-xs text-[var(--text-secondary)] whitespace-nowrap">
        <span className="font-black text-[var(--text-primary)]">{a.qty.toLocaleString('es-CO')}</span>{' '}
        <span className="text-[10px] text-slate-400">{a.unit}</span>
      </td>

      {/* Rendimiento (o N/A si null) */}
      <td className="px-4 py-3 text-right text-xs font-mono font-bold text-[var(--text-primary)]">
        {a.rendimiento !== null && a.rendimiento !== undefined && a.rendimiento > 0
          ? a.rendimiento.toLocaleString('es-CO')
          : '—'}
      </td>

      {/* Days (Mon - Sat) Grid Projection */}
      {weekDays.map((wd) => {
        const isProtected = a.status === 'completed' || a.status === 'in_progress' || a.is_manual_override;

        let dailyJR = 0;
        if (dailyJournalsMap && wd.dateStr) {
          dailyJR = dailyJournalsMap[wd.dateStr] || 0;
        } else if (weeklyJR > 0 && wd.isWorkingDay) {
          dailyJR = weeklyJR / 6;
        }

        return (
          <td
            key={wd.dayName}
            className={`px-2 py-2 text-center border-l border-[var(--border-color)] ${
              wd.isHoliday
                ? 'bg-amber-500/5'
                : !wd.isWorkingDay
                ? 'bg-slate-900/40'
                : ''
            }`}
          >
            {wd.isWorkingDay ? (
              <div className="flex flex-col items-center justify-center gap-0.5">
                <span className="text-xs font-mono font-bold text-[var(--text-primary)]">
                  {dailyJR > 0 ? dailyJR.toFixed(2) : '—'}
                </span>
                {isProtected && (
                  <span
                    className="inline-flex items-center text-[8px] text-amber-400 font-bold bg-amber-500/10 px-1 rounded border border-amber-500/30"
                    title="Protección visual: Actividad con avance de ejecución registrado o protección manual activa."
                  >
                    <Lock className="w-2.5 h-2.5 mr-0.5 text-amber-400" /> 🔒
                  </span>
                )}
              </div>
            ) : (
              <span className="text-[10px] text-slate-600 font-mono">No lab</span>
            )}
          </td>
        );
      })}

      {/* Total Weekly Journals */}
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <div className="w-12 h-1.5 bg-[var(--color-surface-subtle)] rounded-full overflow-hidden hidden sm:block border border-[var(--border-color)]">
            <div className="h-full bg-[var(--color-primary)] dark:bg-[var(--color-accent)] rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-mono font-bold text-[var(--text-primary)] w-10 text-right">
            {weeklyJR.toFixed(2)}
          </span>
        </div>
      </td>
    </tr>
  );
}
