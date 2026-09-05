/**
 * Routine Maintenance Scheduling Engine (ADR-0007)
 * 
 * Computes dynamic weekly and daily projections from routine schedule baselines (Cronograma Base),
 * completely decoupled from contractual POA catalog.
 */

import { isColombianHoliday } from './colombianHolidays';
import { calculateTheoreticalJournals } from './schedulerMath';

export interface RoutineBaseTemplate {
  id: string;
  activity_key: string;
  name: string;
  zone: string; // 'Zona Verde' | 'Zona Dura' | 'Zona Playa'
  category?: string;
  unit: string;
  rendimiento: number; // Physical output per worker-day
  frecuencia: number; // Interval in working days (1, 2.083, 3.125, 6.25, 12.5, 25)
  cantidad: number; // Total physical scope for the site
  preferred_days?: number[]; // [1, 3, 5] for Mon, Wed, Fri (1 = Mon, 6 = Sat)
  pattern_offset?: 'turn_a' | 'turn_b'; // 'turn_a' (Mon/Wed/Fri), 'turn_b' (Tue/Thu/Sat)
}

export interface ExecutionRecord {
  activity_key: string;
  site_id?: string;
  execution_date: string; // YYYY-MM-DD
  status: 'completed' | 'in_progress' | 'pending';
  executed_qty?: number;
}

export interface DailyRoutineAssignment {
  dateStr: string; // YYYY-MM-DD
  dayOfWeek: number; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  activity_key: string;
  name: string;
  zone: string;
  unit: string;
  cantidad: number;
  theoretical_jr: number;
  frequency_interval: number;
}

export interface RoutineWeeklyProjection {
  weekStartStr: string;
  weekEndStr: string;
  assignments: DailyRoutineAssignment[];
  totalJournals: number;
}

export interface SchedulerOptions {
  customNonWorkingDays?: string[]; // Project-specific exceptions YYYY-MM-DD
  workingDaysPerMonth?: number; // Default 25
}

function formatDateISO(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseUTCDate(dateInput: Date | string): Date {
  if (typeof dateInput === 'string') {
    const parts = dateInput.slice(0, 10).split('-');
    return new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
  }
  return new Date(Date.UTC(dateInput.getUTCFullYear(), dateInput.getUTCMonth(), dateInput.getUTCDate()));
}

/**
 * Evaluates whether a date is an operational working day (Monday..Saturday AND NOT Colombian Holiday AND NOT Project Exception).
 */
export function isOperationalWorkingDay(dateInput: Date | string, customNonWorkingDays: string[] = []): boolean {
  const date = parseUTCDate(dateInput);
  const dayOfWeek = date.getUTCDay();

  // Sunday is non-working
  if (dayOfWeek === 0) return false;

  const dateStr = formatDateISO(date);

  // Check project-specific non-working exceptions
  if (customNonWorkingDays.includes(dateStr)) return false;

  // Check national Colombian holidays
  if (isColombianHoliday(date)) return false;

  return true;
}

/**
 * Adds N operational working days forward starting from a given date.
 */
export function addOperationalWorkingDays(
  startDateInput: Date | string,
  intervalDays: number,
  customNonWorkingDays: string[] = []
): Date {
  let curr = parseUTCDate(startDateInput);
  let daysAdded = 0;
  const targetDays = Math.max(1, Math.round(intervalDays));

  while (daysAdded < targetDays) {
    curr.setUTCDate(curr.getUTCDate() + 1);
    if (isOperationalWorkingDay(curr, customNonWorkingDays)) {
      daysAdded++;
    }
  }

  return curr;
}

/**
 * Core Routine Scheduler Engine for ADR-0007.
 * Generates deterministic daily and weekly schedule projections from routine baseline templates.
 */
export function generateRoutineScheduleForWeek(
  templates: RoutineBaseTemplate[],
  targetWeekStartInput: Date | string,
  executionHistory: ExecutionRecord[] = [],
  options: SchedulerOptions = {}
): RoutineWeeklyProjection {
  const weekStart = parseUTCDate(targetWeekStartInput);
  const weekStartStr = formatDateISO(weekStart);

  // Calculate week end (Sunday = weekStart + 6 days)
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  const weekEndStr = formatDateISO(weekEnd);

  const customNonWorkingDays = options.customNonWorkingDays || [];
  const assignments: DailyRoutineAssignment[] = [];

  // Build map of working days for the week
  const weekDays: Array<{ date: Date; dateStr: string; dayOfWeek: number; isWorking: boolean }> = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setUTCDate(weekStart.getUTCDate() + i);
    const dateStr = formatDateISO(d);
    const dayOfWeek = d.getUTCDay();
    const isWorking = isOperationalWorkingDay(d, customNonWorkingDays);
    weekDays.push({ date: d, dateStr, dayOfWeek, isWorking });
  }

  // Helper to check last execution date of an activity
  const getLastExecutionDate = (activityKey: string): string | null => {
    const matching = executionHistory
      .filter((h) => h.activity_key === activityKey && h.status === 'completed')
      .sort((a, b) => b.execution_date.localeCompare(a.execution_date));
    return matching.length > 0 ? matching[0].execution_date : null;
  };

  templates.forEach((template) => {
    const theoreticalJr = calculateTheoreticalJournals(
      template.cantidad,
      template.rendimiento,
      template.frecuencia,
      options.workingDaysPerMonth || 25
    );

    const freq = template.frecuencia;

    // Pattern 1: FRECUENCIA = 1 (Diaria -> Todos los días hábiles de la semana)
    if (freq === 1) {
      weekDays.forEach((wd) => {
        if (wd.isWorking) {
          assignments.push({
            dateStr: wd.dateStr,
            dayOfWeek: wd.dayOfWeek,
            activity_key: template.activity_key,
            name: template.name,
            zone: template.zone,
            unit: template.unit,
            cantidad: template.cantidad,
            theoretical_jr: theoreticalJr,
            frequency_interval: freq,
          });
        }
      });
      return;
    }

    // Pattern 2: FRECUENCIA = 2.083 (~3x por semana)
    if (Math.abs(freq - 2.083) < 0.1) {
      // Turn A: Lunes (1), Miércoles (3), Viernes (5)
      // Turn B: Martes (2), Jueves (4), Sábado (6)
      const targetDays = template.pattern_offset === 'turn_b' ? [2, 4, 6] : [1, 3, 5];

      targetDays.forEach((targetDow) => {
        const wd = weekDays.find((d) => d.dayOfWeek === targetDow);
        if (wd && wd.isWorking) {
          assignments.push({
            dateStr: wd.dateStr,
            dayOfWeek: wd.dayOfWeek,
            activity_key: template.activity_key,
            name: template.name,
            zone: template.zone,
            unit: template.unit,
            cantidad: template.cantidad,
            theoretical_jr: theoreticalJr,
            frequency_interval: freq,
          });
        } else if (wd && !wd.isWorking) {
          // Shift to next available working day in week
          const fallbackWd = weekDays.find((d) => d.dayOfWeek > targetDow && d.isWorking);
          if (fallbackWd) {
            assignments.push({
              dateStr: fallbackWd.dateStr,
              dayOfWeek: fallbackWd.dayOfWeek,
              activity_key: template.activity_key,
              name: template.name,
              zone: template.zone,
              unit: template.unit,
              cantidad: template.cantidad,
              theoretical_jr: theoreticalJr,
              frequency_interval: freq,
            });
          }
        }
      });
      return;
    }

    // Pattern 3: FRECUENCIA = 3.125 (~2x por semana)
    if (Math.abs(freq - 3.125) < 0.1) {
      const targetDays = [2, 5]; // Martes & Viernes
      targetDays.forEach((targetDow) => {
        const wd = weekDays.find((d) => d.dayOfWeek === targetDow && d.isWorking);
        if (wd) {
          assignments.push({
            dateStr: wd.dateStr,
            dayOfWeek: wd.dayOfWeek,
            activity_key: template.activity_key,
            name: template.name,
            zone: template.zone,
            unit: template.unit,
            cantidad: template.cantidad,
            theoretical_jr: theoreticalJr,
            frequency_interval: freq,
          });
        }
      });
      return;
    }

    // Pattern 4: FRECUENCIA = 6.25 (~Semanal, 1 vez a la semana, ej. Viernes)
    if (Math.abs(freq - 6.25) < 0.1) {
      const preferredDay = template.preferred_days && template.preferred_days.length > 0 ? template.preferred_days[0] : 5; // Default Friday
      let wd = weekDays.find((d) => d.dayOfWeek === preferredDay && d.isWorking);
      if (!wd) {
        // Fallback to first available working day in week
        wd = weekDays.find((d) => d.isWorking);
      }
      if (wd) {
        assignments.push({
          dateStr: wd.dateStr,
          dayOfWeek: wd.dayOfWeek,
          activity_key: template.activity_key,
          name: template.name,
          zone: template.zone,
          unit: template.unit,
          cantidad: template.cantidad,
          theoretical_jr: theoreticalJr,
          frequency_interval: freq,
        });
      }
      return;
    }

    // Pattern 5: FRECUENCIA = 12.5 (~Quincenal, 1 vez cada 2 semanas)
    if (Math.abs(freq - 12.5) < 0.5) {
      const lastExec = getLastExecutionDate(template.activity_key);
      let isDueThisWeek = false;

      if (!lastExec) {
        // If no execution history, check template preferred week or default to week assignment
        isDueThisWeek = true;
      } else {
        const nextEligible = addOperationalWorkingDays(lastExec, freq, customNonWorkingDays);
        const nextEligibleStr = formatDateISO(nextEligible);
        isDueThisWeek = nextEligibleStr <= weekEndStr;
      }

      if (isDueThisWeek) {
        const preferredDay = template.preferred_days && template.preferred_days.length > 0 ? template.preferred_days[0] : 4; // Default Thursday/Saturday
        let wd = weekDays.find((d) => d.dayOfWeek === preferredDay && d.isWorking);
        if (!wd) {
          wd = weekDays.find((d) => d.isWorking);
        }
        if (wd) {
          assignments.push({
            dateStr: wd.dateStr,
            dayOfWeek: wd.dayOfWeek,
            activity_key: template.activity_key,
            name: template.name,
            zone: template.zone,
            unit: template.unit,
            cantidad: template.cantidad,
            theoretical_jr: theoreticalJr,
            frequency_interval: freq,
          });
        }
      }
      return;
    }

    // Pattern 6: FRECUENCIA = 25 (~Mensual, 1 vez al mes)
    if (Math.abs(freq - 25) < 1) {
      const lastExec = getLastExecutionDate(template.activity_key);
      let isDueThisWeek = false;

      if (!lastExec) {
        isDueThisWeek = true;
      } else {
        const nextEligible = addOperationalWorkingDays(lastExec, freq, customNonWorkingDays);
        const nextEligibleStr = formatDateISO(nextEligible);
        isDueThisWeek = nextEligibleStr <= weekEndStr;
      }

      if (isDueThisWeek) {
        const preferredDay = template.preferred_days && template.preferred_days.length > 0 ? template.preferred_days[0] : 1; // Default Monday
        let wd = weekDays.find((d) => d.dayOfWeek === preferredDay && d.isWorking);
        if (!wd) {
          wd = weekDays.find((d) => d.isWorking);
        }
        if (wd) {
          assignments.push({
            dateStr: wd.dateStr,
            dayOfWeek: wd.dayOfWeek,
            activity_key: template.activity_key,
            name: template.name,
            zone: template.zone,
            unit: template.unit,
            cantidad: template.cantidad,
            theoretical_jr: theoreticalJr,
            frequency_interval: freq,
          });
        }
      }
      return;
    }

    // Fallback for custom frequencies: calculate next eligible working day
    const lastExec = getLastExecutionDate(template.activity_key);
    if (!lastExec) {
      const wd = weekDays.find((d) => d.isWorking);
      if (wd) {
        assignments.push({
          dateStr: wd.dateStr,
          dayOfWeek: wd.dayOfWeek,
          activity_key: template.activity_key,
          name: template.name,
          zone: template.zone,
          unit: template.unit,
          cantidad: template.cantidad,
          theoretical_jr: theoreticalJr,
          frequency_interval: freq,
        });
      }
    } else {
      const nextEligible = addOperationalWorkingDays(lastExec, freq, customNonWorkingDays);
      const nextEligibleStr = formatDateISO(nextEligible);
      if (nextEligibleStr >= weekStartStr && nextEligibleStr <= weekEndStr) {
        const wd = weekDays.find((d) => d.dateStr === nextEligibleStr && d.isWorking) || weekDays.find((d) => d.isWorking);
        if (wd) {
          assignments.push({
            dateStr: wd.dateStr,
            dayOfWeek: wd.dayOfWeek,
            activity_key: template.activity_key,
            name: template.name,
            zone: template.zone,
            unit: template.unit,
            cantidad: template.cantidad,
            theoretical_jr: theoreticalJr,
            frequency_interval: freq,
          });
        }
      }
    }
  });

  const totalJournals = assignments.reduce((acc, curr) => acc + curr.theoretical_jr, 0);

  return {
    weekStartStr,
    weekEndStr,
    assignments,
    totalJournals,
  };
}
