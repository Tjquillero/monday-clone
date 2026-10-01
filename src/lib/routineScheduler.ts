/**
 * Routine Maintenance Scheduling Engine (ADR-0007 / D19)
 * 
 * Computes deterministic weekly and daily projections from operational frequencies (visitas/mes),
 * according to contract and calendar rules (FREQ-OP-01).
 */

import { isColombianHoliday } from './colombianHolidays';

export interface RoutineBaseTemplate {
  id: string;
  activity_key: string;
  name: string;
  zone: string; // 'Zona Verde' | 'Zona Dura' | 'Zona Playa'
  category?: string;
  unit: string;
  rendimiento: number | null; // Rendimiento técnico (> 0 o null si requiere_rendimiento = false)
  frecuencia: number; // Frecuencia operativa en visitas/mes (25, 12, 8, 6, 4, 2, 1, 0.5, 0.33)
  cantidad: number; // Cantidad física contratada de la zona
  priority?: string;
  preferred_days?: number[]; // [1, 3, 5] for Mon, Wed, Fri (1 = Mon, 6 = Sat)
  pattern_offset?: 'turn_a' | 'turn_b';
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
  frequency_interval: number; // visitas/mes
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
 * Retorna de forma determinista el día de la semana (1..5: Lunes..Viernes) para actividades de 1 día semanal.
 */
export function getDeterministicDayOfWeek(activityKey: string, preferredDays?: number[]): number {
  if (preferredDays && preferredDays.length > 0 && preferredDays[0] >= 1 && preferredDays[0] <= 6) {
    return preferredDays[0];
  }
  let hash = 0;
  for (let i = 0; i < activityKey.length; i++) {
    hash = (hash * 31 + activityKey.charCodeAt(i)) >>> 0;
  }
  return (hash % 5) + 1; // 1 = Lunes, 2 = Martes, 3 = Miércoles, 4 = Jueves, 5 = Viernes
}

/**
 * Core Routine Scheduler Engine (FREQ-OP-01 / D19).
 * Generates deterministic daily schedule projections from operational frequency templates (visitas/mes).
 */
export function generateRoutineScheduleForWeek(
  templates: RoutineBaseTemplate[],
  targetWeekStartInput: Date | string,
  _executionHistory: ExecutionRecord[] = [],
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

  // Build map of working days for the week (Monday = index 0 .. Sunday = index 6)
  const weekDays: Array<{ date: Date; dateStr: string; dayOfWeek: number; isWorking: boolean }> = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setUTCDate(weekStart.getUTCDate() + i);
    const dateStr = formatDateISO(d);
    const dayOfWeek = d.getUTCDay();
    const isWorking = isOperationalWorkingDay(d, customNonWorkingDays);
    weekDays.push({ date: d, dateStr, dayOfWeek, isWorking });
  }

  // Reglas de calendario mensual D19
  const mondayDayOfMonth = weekStart.getUTCDate();
  const mondayMonth = weekStart.getUTCMonth() + 1; // 1 = Enero .. 12 = Diciembre
  const weekOfMonth = Math.ceil(mondayDayOfMonth / 7);

  templates.forEach((template) => {
    // planned_jr = cantidad / rendimiento (D19 / D20: 0 si rendimiento es null o <= 0)
    const theoreticalJr =
      template.rendimiento !== null &&
      template.rendimiento !== undefined &&
      template.rendimiento > 0
        ? template.cantidad / template.rendimiento
        : 0;
    const freq = template.frecuencia; // visitas/mes

    let targetDaysOfWeek: number[] = [];

    // Semana 5 (días 29..31): solo se programan actividades con frecuencia >= 4 visitas/mes
    if (weekOfMonth >= 5 && freq < 4) {
      return;
    }

    // 1. Frecuencia 25 visitas/mes -> Lunes a Sábado (1, 2, 3, 4, 5, 6)
    if (Math.abs(freq - 25) < 0.1) {
      targetDaysOfWeek = [1, 2, 3, 4, 5, 6];
    }
    // 2. Frecuencia 12 visitas/mes -> Lunes, Miércoles, Viernes (1, 3, 5) o Martes, Jueves, Sábado (turn_b)
    else if (Math.abs(freq - 12) < 0.1) {
      targetDaysOfWeek = template.pattern_offset === 'turn_b' ? [2, 4, 6] : [1, 3, 5];
    }
    // 3. Frecuencia 8 visitas/mes -> Martes, Jueves (2, 4)
    else if (Math.abs(freq - 8) < 0.1) {
      targetDaysOfWeek = [2, 4];
    }
    // 4. Frecuencia 6 visitas/mes -> Martes y Jueves (semanas 1, 3, 5) / Miércoles (semanas 2, 4)
    else if (Math.abs(freq - 6) < 0.1) {
      if (weekOfMonth % 2 === 1) {
        targetDaysOfWeek = [2, 4]; // Martes y Jueves en semanas 1, 3, 5
      } else {
        targetDaysOfWeek = [3]; // Miércoles en semanas 2 y 4
      }
    }
    // 5. Frecuencia 4 visitas/mes -> 1 día por semana (todas las semanas)
    else if (Math.abs(freq - 4) < 0.1) {
      targetDaysOfWeek = [getDeterministicDayOfWeek(template.activity_key, template.preferred_days)];
    }
    // 6. Frecuencia 2 visitas/mes -> Semanas 1 y 3
    else if (Math.abs(freq - 2) < 0.1) {
      if (weekOfMonth === 1 || weekOfMonth === 3) {
        targetDaysOfWeek = [getDeterministicDayOfWeek(template.activity_key, template.preferred_days)];
      }
    }
    // 7. Frecuencia 1 visita/mes -> Semana 2
    else if (Math.abs(freq - 1) < 0.1) {
      if (weekOfMonth === 2) {
        targetDaysOfWeek = [getDeterministicDayOfWeek(template.activity_key, template.preferred_days)];
      }
    }
    // 8. Frecuencia 0.5 visitas/mes -> Semana 3 en meses pares
    else if (Math.abs(freq - 0.5) < 0.05) {
      if (weekOfMonth === 3 && mondayMonth % 2 === 0) {
        targetDaysOfWeek = [getDeterministicDayOfWeek(template.activity_key, template.preferred_days)];
      }
    }
    // 9. Frecuencia 0.33 visitas/mes -> Semana 4 en meses con (mes % 3 = 1) (Ene, Abr, Jul, Oct)
    else if (Math.abs(freq - 0.33) < 0.05 || Math.abs(freq - 1 / 3) < 0.05) {
      if (weekOfMonth === 4 && mondayMonth % 3 === 1) {
        targetDaysOfWeek = [getDeterministicDayOfWeek(template.activity_key, template.preferred_days)];
      }
    }
    // Fallback para otras frecuencias >= 4 -> 1 día por semana
    else if (freq >= 4) {
      targetDaysOfWeek = [getDeterministicDayOfWeek(template.activity_key, template.preferred_days)];
    }

    // Programar en los días calculados (D26: no diarias se reubican si caen en festivo; diarias se omiten)
    const isDaily = freq >= 25;

    targetDaysOfWeek.forEach((dow) => {
      const wd = weekDays.find((d) => d.dayOfWeek === dow);
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
      } else if (wd && !wd.isWorking && !isDaily) {
        // D26: Visita no diaria (< 25) que cae en festivo pasa al siguiente día hábil de la misma semana (lun–sáb); si no hay, al anterior
        let targetWorkingDay = weekDays.find((d) => d.dayOfWeek > dow && d.dayOfWeek <= 6 && d.isWorking);
        if (!targetWorkingDay) {
          const prevWorkingDays = weekDays.filter((d) => d.dayOfWeek < dow && d.dayOfWeek >= 1 && d.isWorking);
          if (prevWorkingDays.length > 0) {
            targetWorkingDay = prevWorkingDays[prevWorkingDays.length - 1];
          }
        }
        if (targetWorkingDay) {
          assignments.push({
            dateStr: targetWorkingDay.dateStr,
            dayOfWeek: targetWorkingDay.dayOfWeek,
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
  });

  const totalJournals = assignments.reduce((acc, a) => acc + a.theoretical_jr, 0);

  return {
    weekStartStr,
    weekEndStr,
    assignments,
    totalJournals,
  };
}
