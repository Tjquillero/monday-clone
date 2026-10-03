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
  counts_capacity?: boolean; // D28: false para maquinaria (no cuenta en capacidad diaria)
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
  counts_capacity?: boolean;
}

export interface CarryoverItem {
  activity_key: string;
  qty: number;
  jr: number;
}

export interface CarryoverNextMonthItem {
  activity_key: string;
  qty: number;
  jr: number;
  reason: 'CAPACITY';
}

export interface RecurrentExceedsCapacityItem {
  dateStr: string;
  deficit_jr: number;
}

export interface RoutineWeeklyProjection {
  weekStartStr: string;
  weekEndStr: string;
  assignments: DailyRoutineAssignment[];
  totalJournals: number;
  carryoverIn?: CarryoverItem[];
  carryoverNextMonth?: CarryoverNextMonthItem[];
  carryoverNextMonthProjection?: CarryoverNextMonthItem[];
  carryoverFromThisWeek?: CarryoverNextMonthItem[];
  recurrentExceedsCapacity?: RecurrentExceedsCapacityItem[];
}

export interface MonthlyPlanInput {
  week_start: string;
  items?: Array<{
    activity_key: string;
    planned_qty?: number;
    planned_jr?: number;
    counts_capacity?: boolean;
    status?: string;
  }>;
}

export interface SchedulerOptions {
  customNonWorkingDays?: string[]; // Project-specific exceptions YYYY-MM-DD
  workingDaysPerMonth?: number; // Default 25
  siteDailyCapacity?: number | null; // D24 / D27 / D28: Capacidad diaria del sitio en jornales
  existingMonthPlans?: MonthlyPlanInput[];
  skipMonthlyAllocation?: boolean;
  carryoverIn?: CarryoverItem[]; // D30.4: Arrastre de entrada
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

function compareStringsCode(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
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

interface WorkingDayState {
  date: Date;
  dateStr: string;
  dayOfWeek: number;
  isWorking: boolean;
  countingJournals: number;
  machineJournals: number;
}

export interface CandidateWeekInfo {
  weekNumber: number; // 1..4 (or 5)
  mondayDate: Date;
  weekStartStr: string;
}

/**
 * Retorna todos los lunes que caen dentro del mes de la fecha indicada.
 * Semanas candidatas para visitas de baja frecuencia son las semanas 1 a 4.
 */
export function getMonthlyCandidateWeeks(targetMondayInput: Date | string): CandidateWeekInfo[] {
  const dt = parseUTCDate(targetMondayInput);
  const year = dt.getUTCFullYear();
  const month = dt.getUTCMonth(); // 0..11

  const mondays: CandidateWeekInfo[] = [];
  let weekNum = 1;

  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  for (let day = 1; day <= lastDay; day++) {
    const cur = new Date(Date.UTC(year, month, day));
    if (cur.getUTCDay() === 1) {
      mondays.push({
        weekNumber: weekNum++,
        mondayDate: cur,
        weekStartStr: formatDateISO(cur),
      });
    }
  }
  return mondays;
}

interface WeekLoadState {
  weekNumber: number;
  mondayDate: Date;
  weekStartStr: string;
  isFixed: boolean;
  baseLoad: number;
  workingDaysCount: number;
  weekCapacity: number;
  holgura: number;
  presentKeys: Set<string>;
}

/**
 * Calcula la carga base de actividades fijas y recurrentes (25, 12, 8, 6, 4) para una semana dada.
 */
function calculateBaseWeekCountingLoad(
  templates: RoutineBaseTemplate[],
  mondayDate: Date,
  customNonWorkingDays: string[]
): number {
  const recurringTemplates = templates.filter((t) => {
    const f = t.frecuencia;
    return (
      Math.abs(f - 25) < 0.1 ||
      f >= 25 ||
      Math.abs(f - 12) < 0.1 ||
      Math.abs(f - 8) < 0.1 ||
      Math.abs(f - 6) < 0.1 ||
      Math.abs(f - 4) < 0.1
    );
  });

  // Programar solo recurrentes para esta semana
  const proj = generateRoutineScheduleForWeek(recurringTemplates, mondayDate, [], {
    customNonWorkingDays,
    siteDailyCapacity: null,
    skipMonthlyAllocation: true,
  });

  return proj.assignments
    .filter((a) => a.counts_capacity !== false)
    .reduce((sum, a) => sum + a.theoretical_jr, 0);
}

/**
 * Proyección mensual determinista (D29 / D30 / B1): reparte visitas de baja frecuencia (2, 1, 0.5, 0.33)
 * y arrastre de entrada entre las semanas candidatas 1 a 4 del mes según la holgura de capacidad (D30.1).
 * Contabilidad estricta por cantidad física requerida y planificada (B1).
 * Si no cabe en una semana, se divide entre las semanas de mayor holgura (D30.2), y lo que no cabe pasa al arrastre (D30.4).
 */
export function projectMonthlyLowFrequencyAllocation(
  templates: RoutineBaseTemplate[],
  targetMondayInput: Date | string,
  options: SchedulerOptions = {}
): Map<string, RoutineBaseTemplate[]> & { carryoverNextMonth?: CarryoverNextMonthItem[] } {
  const targetMonday = parseUTCDate(targetMondayInput);
  const customNonWorkingDays = options.customNonWorkingDays || [];
  const existingPlans = options.existingMonthPlans || [];
  const siteDailyCapacity =
    typeof options.siteDailyCapacity === 'number' && !isNaN(options.siteDailyCapacity) && options.siteDailyCapacity > 0
      ? options.siteDailyCapacity
      : null;

  const candidateWeeks = getMonthlyCandidateWeeks(targetMonday);
  const eligibleWeeks = candidateWeeks.filter((w) => w.weekNumber <= 4);

  const allocationMap: Map<string, RoutineBaseTemplate[]> & { carryoverNextMonth?: CarryoverNextMonthItem[] } = new Map();
  for (const ew of eligibleWeeks) {
    allocationMap.set(ew.weekStartStr, []);
  }

  // Mapear ya planificado en semanas fijas del mes por actividad (excluyendo items cancelados, B1/B2)
  const alreadyPlannedQtyMap = new Map<string, number>();

  const weekStates: WeekLoadState[] = eligibleWeeks.map((ew) => {
    let workingDaysCount = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(ew.mondayDate);
      d.setUTCDate(ew.mondayDate.getUTCDate() + i);
      const dow = d.getUTCDay();
      if (dow >= 1 && dow <= 6 && isOperationalWorkingDay(d, customNonWorkingDays)) {
        workingDaysCount++;
      }
    }

    const weekCapacity = siteDailyCapacity !== null ? siteDailyCapacity * workingDaysCount : Infinity;
    const existing = existingPlans.find((p) => p.week_start === ew.weekStartStr);

    if (existing) {
      const nonCancelledItems = (existing.items || []).filter((i) => i.status !== 'cancelled');
      const fixedLoad = nonCancelledItems
        .filter((i) => i.counts_capacity !== false)
        .reduce((sum, i) => sum + (i.planned_jr || 0), 0);
      const keys = new Set<string>(nonCancelledItems.map((i) => i.activity_key));

      for (const it of nonCancelledItems) {
        const matched = templates.find((t) => t.activity_key === it.activity_key);
        let q = 0;
        if (it.planned_qty !== undefined) {
          q = Number(it.planned_qty);
        } else if (it.planned_jr !== undefined && matched?.rendimiento && matched.rendimiento > 0) {
          q = Number((it.planned_jr * matched.rendimiento).toFixed(2));
        } else if (matched) {
          q = matched.cantidad;
        }

        if (q > 0) {
          alreadyPlannedQtyMap.set(
            it.activity_key,
            Number(((alreadyPlannedQtyMap.get(it.activity_key) || 0) + q).toFixed(2))
          );
        }
        if (matched && matched.frecuencia <= 2) {
          allocationMap.get(ew.weekStartStr)?.push({
            ...matched,
            cantidad: q,
          });
        }
      }

      const holgura = siteDailyCapacity !== null ? Math.max(0, weekCapacity - fixedLoad) : Infinity;
      return {
        weekNumber: ew.weekNumber,
        mondayDate: ew.mondayDate,
        weekStartStr: ew.weekStartStr,
        isFixed: true,
        baseLoad: fixedLoad,
        workingDaysCount,
        weekCapacity,
        holgura,
        presentKeys: keys,
      };
    } else {
      const baseLoad = calculateBaseWeekCountingLoad(templates, ew.mondayDate, customNonWorkingDays);
      const holgura = siteDailyCapacity !== null ? Math.max(0, weekCapacity - baseLoad) : Infinity;
      return {
        weekNumber: ew.weekNumber,
        mondayDate: ew.mondayDate,
        weekStartStr: ew.weekStartStr,
        isFixed: false,
        baseLoad,
        workingDaysCount,
        weekCapacity,
        holgura,
        presentKeys: new Set<string>(),
      };
    }
  });

  const carryoverNextMonth: CarryoverNextMonthItem[] = [];
  const alreadyPlannedRemainingMap = new Map<string, number>(alreadyPlannedQtyMap);

  // 1. Arrastre de entrada (carryoverIn): prioridad de reparto (D30.4 / B1)
  // La parte del arrastre se consume antes que la parte regular
  const carryoverInItems: Array<{
    template: RoutineBaseTemplate;
    theoreticalJr: number;
    countsCapacity: boolean;
    visitsCount: number;
    isCarryover: boolean;
  }> = [];

  if (options.carryoverIn && options.carryoverIn.length > 0) {
    for (const ci of options.carryoverIn) {
      const matched = templates.find((t) => t.activity_key === ci.activity_key);
      if (matched) {
        const ciQty = ci.qty;
        const alreadyCovered = alreadyPlannedRemainingMap.get(ci.activity_key) || 0;
        const usedByFixed = Math.min(ciQty, alreadyCovered);
        alreadyPlannedRemainingMap.set(
          ci.activity_key,
          Number((alreadyCovered - usedByFixed).toFixed(2))
        );

        const ciPendingQty = Number((ciQty - usedByFixed).toFixed(2));
        if (ciPendingQty > 0.005) {
          const ciJr =
            matched.rendimiento !== null && matched.rendimiento !== undefined && matched.rendimiento > 0
              ? Number((ciPendingQty / matched.rendimiento).toFixed(4))
              : (ci.qty > 0 ? Number((ci.jr * (ciPendingQty / ci.qty)).toFixed(4)) : 0);

          carryoverInItems.push({
            template: {
              ...matched,
              cantidad: ciPendingQty,
            },
            theoreticalJr: ciJr,
            countsCapacity: matched.counts_capacity !== false,
            visitsCount: 1,
            isCarryover: true,
          });
        }
      }
    }
    carryoverInItems.sort((a, b) => {
      const diff = b.theoreticalJr - a.theoreticalJr;
      if (Math.abs(diff) > 1e-6) return diff;
      return compareStringsCode(a.template.activity_key, b.template.activity_key);
    });
  }

  // 2. Visitas regulares del mes (2, 1, 0.5, 0.33)
  const mondayMonth = targetMonday.getUTCMonth() + 1;
  const regularLowFreqItems: Array<{
    template: RoutineBaseTemplate;
    theoreticalJr: number;
    countsCapacity: boolean;
    visitsCount: number;
    isCarryover: boolean;
  }> = [];

  for (const template of templates) {
    const freq = template.frecuencia;
    const theoreticalJrPerVisit =
      template.rendimiento !== null && template.rendimiento !== undefined && template.rendimiento > 0
        ? template.cantidad / template.rendimiento
        : 0;
    const countsCapacity = template.counts_capacity !== false;

    if (Math.abs(freq - 2) < 0.1) {
      // Frecuencia 2
      let fixedVisitsCount = 0;
      for (const w of weekStates) {
        if (w.isFixed && w.presentKeys.has(template.activity_key)) {
          fixedVisitsCount++;
        }
      }
      const pendingVisits = Math.max(0, 2 - fixedVisitsCount);
      if (pendingVisits > 0) {
        regularLowFreqItems.push({
          template,
          theoreticalJr: theoreticalJrPerVisit,
          countsCapacity,
          visitsCount: 2,
          isCarryover: false,
        });
      }
    } else {
      let reqVisits = 0;
      if (Math.abs(freq - 1) < 0.1) {
        reqVisits = 1;
      } else if (Math.abs(freq - 0.5) < 0.05) {
        if (mondayMonth % 2 === 0) reqVisits = 1;
      } else if (Math.abs(freq - 0.33) < 0.05 || Math.abs(freq - 1 / 3) < 0.05) {
        if (mondayMonth % 3 === 1) reqVisits = 1;
      }

      if (reqVisits > 0) {
        const reqQty = Number((reqVisits * template.cantidad).toFixed(2));
        const alreadyCovered = alreadyPlannedRemainingMap.get(template.activity_key) || 0;
        const usedByFixed = Math.min(reqQty, alreadyCovered);
        alreadyPlannedRemainingMap.set(
          template.activity_key,
          Number((alreadyCovered - usedByFixed).toFixed(2))
        );

        const pendingQty = Number((reqQty - usedByFixed).toFixed(2));
        if (pendingQty > 0.005) {
          const pendingJr =
            template.rendimiento !== null && template.rendimiento !== undefined && template.rendimiento > 0
              ? Number((pendingQty / template.rendimiento).toFixed(4))
              : (template.cantidad > 0 ? Number((theoreticalJrPerVisit * (pendingQty / template.cantidad)).toFixed(4)) : 0);

          regularLowFreqItems.push({
            template: {
              ...template,
              cantidad: pendingQty,
            },
            theoreticalJr: pendingJr,
            countsCapacity,
            visitsCount: 1,
            isCarryover: false,
          });
        }
      }
    }
  }

  regularLowFreqItems.sort((a, b) => {
    const diff = b.theoreticalJr - a.theoreticalJr;
    if (Math.abs(diff) > 1e-6) return diff;
    return compareStringsCode(a.template.activity_key, b.template.activity_key);
  });

  const queueToAllocate = [...carryoverInItems, ...regularLowFreqItems];

  for (const item of queueToAllocate) {
    const key = item.template.activity_key;

    if (item.visitsCount === 2) {
      // Frecuencia 2: sus 2 visitas en semanas distintas separadas al menos 2 semanas (pares 1-3 o 2-4)
      const w1 = weekStates.find((w) => w.weekNumber === 1);
      const w2 = weekStates.find((w) => w.weekNumber === 2);
      const w3 = weekStates.find((w) => w.weekNumber === 3);
      const w4 = weekStates.find((w) => w.weekNumber === 4);

      const inW1 = w1?.presentKeys.has(key);
      const inW3 = w3?.presentKeys.has(key);
      const inW2 = w2?.presentKeys.has(key);
      const inW4 = w4?.presentKeys.has(key);

      let chosenPair: 13 | 24 = 13;

      if (inW1 || inW3) {
        chosenPair = 13;
      } else if (inW2 || inW4) {
        chosenPair = 24;
      } else {
        const pair13Blocked = (w1?.isFixed && !inW1) || (w3?.isFixed && !inW3) || !w1 || !w3;
        const pair24Blocked = (w2?.isFixed && !inW2) || (w4?.isFixed && !inW4) || !w2 || !w4;

        if (pair13Blocked && !pair24Blocked) {
          chosenPair = 24;
        } else if (!pair13Blocked && pair24Blocked) {
          chosenPair = 13;
        } else {
          if (siteDailyCapacity !== null) {
            // D30.1: Suma de holguras
            const holgura13 = (w1?.isFixed ? 0 : w1?.holgura || 0) + (w3?.isFixed ? 0 : w3?.holgura || 0);
            const holgura24 = (w2?.isFixed ? 0 : w2?.holgura || 0) + (w4?.isFixed ? 0 : w4?.holgura || 0);
            if (holgura13 >= holgura24) {
              chosenPair = 13;
            } else {
              chosenPair = 24;
            }
          } else {
            const load13 = (w1?.baseLoad || 0) + (w3?.baseLoad || 0);
            const load24 = (w2?.baseLoad || 0) + (w4?.baseLoad || 0);
            if (load13 <= load24) {
              chosenPair = 13;
            } else {
              chosenPair = 24;
            }
          }
        }
      }

      const pairWeeks = chosenPair === 13 ? [w1, w3] : [w2, w4];
      for (const targetW of pairWeeks) {
        if (!targetW) continue;
        if (targetW.isFixed) {
          if (targetW.presentKeys.has(key)) {
            // Ya está presente en esta semana fija
            continue;
          } else {
            // B1: Si el par elegido tiene una semana fija sin la llave, esa visita pasa al arrastre
            carryoverNextMonth.push({
              activity_key: key,
              qty: item.template.cantidad,
              jr: Number(item.theoreticalJr.toFixed(4)),
              reason: 'CAPACITY',
            });
            continue;
          }
        }

        if (siteDailyCapacity === null || !item.countsCapacity) {
          allocationMap.get(targetW.weekStartStr)?.push(item.template);
          if (item.countsCapacity) {
            targetW.baseLoad += item.theoreticalJr;
          }
        } else {
          // D30.2: Frecuencia 2: cada visita se queda en la semana de su par. La parte que no quepa pasa al arrastre.
          const availableInWeek = Math.max(0, targetW.holgura);
          const allocJr = Math.min(item.theoreticalJr, availableInWeek);

          if (allocJr < 0.05 && item.theoreticalJr >= 0.05) {
            const carryoverJr = Number(item.theoreticalJr.toFixed(4));
            const carryoverQty = item.template.cantidad;
            carryoverNextMonth.push({
              activity_key: key,
              qty: carryoverQty,
              jr: carryoverJr,
              reason: 'CAPACITY',
            });
          } else {
            const allocQty = Number((item.template.cantidad * (allocJr / item.theoreticalJr)).toFixed(2));
            allocationMap.get(targetW.weekStartStr)?.push({
              ...item.template,
              cantidad: allocQty,
            });
            targetW.holgura = Math.max(0, targetW.holgura - allocJr);
            targetW.baseLoad += allocJr;

            if (item.theoreticalJr - allocJr > 1e-4) {
              const remJr = Number((item.theoreticalJr - allocJr).toFixed(4));
              const remQty = Number((item.template.cantidad - allocQty).toFixed(2));
              carryoverNextMonth.push({
                activity_key: key,
                qty: remQty,
                jr: remJr,
                reason: 'CAPACITY',
              });
            }
          }
        }
      }
    } else {
      // Visitas ÚNICAS del mes (freq 1, 0.5, 0.33, o carryover_in)
      // Nota: item.template.cantidad ya es el pendiente (descontado lo de semanas fijas)
      const availableWeeks = weekStates.filter((w) => !w.isFixed);

      if (availableWeeks.length === 0) {
        // Todas las semanas están fijas: el pendiente va directo a carryoverNextMonth
        carryoverNextMonth.push({
          activity_key: key,
          qty: item.template.cantidad,
          jr: Number(item.theoreticalJr.toFixed(4)),
          reason: 'CAPACITY',
        });
      } else if (siteDailyCapacity === null) {
        let bestWeek = availableWeeks[0];
        for (let i = 1; i < availableWeeks.length; i++) {
          if (availableWeeks[i].baseLoad < bestWeek.baseLoad - 1e-6) {
            bestWeek = availableWeeks[i];
          }
        }
        if (bestWeek) {
          allocationMap.get(bestWeek.weekStartStr)?.push(item.template);
          if (item.countsCapacity) bestWeek.baseLoad += item.theoreticalJr;
        }
      } else if (!item.countsCapacity) {
        let bestWeek = availableWeeks[0];
        for (let i = 1; i < availableWeeks.length; i++) {
          if (availableWeeks[i].holgura > bestWeek.holgura + 1e-6) {
            bestWeek = availableWeeks[i];
          }
        }
        if (bestWeek) {
          allocationMap.get(bestWeek.weekStartStr)?.push(item.template);
        }
      } else {
        // D30.1 & D30.2: Reparto por holgura y división entre semanas si no cabe
        let remJr = item.theoreticalJr;
        let remQty = item.template.cantidad;
        const allocatedFragments: Array<{ week: WeekLoadState; jr: number; qty: number }> = [];

        while (remJr > 1e-4) {
          const nonFixedWithHolgura = weekStates.filter((w) => !w.isFixed && w.holgura > 1e-4);
          if (nonFixedWithHolgura.length === 0) {
            break;
          }
          nonFixedWithHolgura.sort((a, b) => {
            const diff = b.holgura - a.holgura;
            if (Math.abs(diff) > 1e-6) return diff;
            return a.weekNumber - b.weekNumber;
          });

          const bestWeek = nonFixedWithHolgura[0];
          const allocJr = Math.min(remJr, bestWeek.holgura);

          if (allocJr < 0.05) {
            if (allocatedFragments.length > 0) {
              const prevFrag = allocatedFragments[allocatedFragments.length - 1];
              if (prevFrag.week.holgura >= allocJr - 0.005) {
                prevFrag.jr += allocJr;
                prevFrag.qty += remQty;
                prevFrag.week.holgura = Math.max(0, prevFrag.week.holgura - allocJr);
                prevFrag.week.baseLoad += allocJr;
                remJr = 0;
                remQty = 0;
              }
            }
            break;
          }

          let allocQty = Number((item.template.cantidad * (allocJr / item.theoreticalJr)).toFixed(2));
          if (Math.abs(remJr - allocJr) < 1e-4) {
            allocQty = remQty;
          } else {
            allocQty = Math.min(allocQty, remQty);
          }

          allocatedFragments.push({
            week: bestWeek,
            jr: allocJr,
            qty: allocQty,
          });

          bestWeek.holgura = Math.max(0, bestWeek.holgura - allocJr);
          bestWeek.baseLoad += allocJr;
          remJr = Number((remJr - allocJr).toFixed(4));
          remQty = Number((remQty - allocQty).toFixed(2));
        }

        if (allocatedFragments.length > 0) {
          const totalAllocQty = allocatedFragments.reduce((acc, f) => acc + f.qty, 0);
          const diffQty = Number((item.template.cantidad - (remJr > 1e-4 ? remQty : 0) - totalAllocQty).toFixed(2));
          if (Math.abs(diffQty) > 0) {
            allocatedFragments[allocatedFragments.length - 1].qty = Number(
              (allocatedFragments[allocatedFragments.length - 1].qty + diffQty).toFixed(2)
            );
          }

          for (const frag of allocatedFragments) {
            allocationMap.get(frag.week.weekStartStr)?.push({
              ...item.template,
              cantidad: frag.qty,
            });
          }
        }

        if (remJr > 1e-4 && remQty > 0.005) {
          const carryoverJr =
            item.template.rendimiento !== null && item.template.rendimiento !== undefined && item.template.rendimiento > 0
              ? Number((remQty / item.template.rendimiento).toFixed(4))
              : Number(remJr.toFixed(4));

          carryoverNextMonth.push({
            activity_key: key,
            qty: remQty,
            jr: carryoverJr,
            reason: 'CAPACITY',
          });
        }
      }
    }
  }

  allocationMap.carryoverNextMonth = carryoverNextMonth;
  return allocationMap;
}

/**
 * Core Routine Scheduler Engine (FREQ-OP-01 / FREQ-OP-02 / FREQ-OP-03 / FREQ-OP-04 / D19 / D26 / D27 / D28 / D29).
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
  const siteDailyCapacity = typeof options.siteDailyCapacity === 'number' && !isNaN(options.siteDailyCapacity) && options.siteDailyCapacity > 0
    ? options.siteDailyCapacity
    : null;

  const assignments: DailyRoutineAssignment[] = [];
  const intraWeekCarryover: CarryoverNextMonthItem[] = [];
  let monthlyCarryoverNextMonth: CarryoverNextMonthItem[] = [];

  // Build map of days for the week (Monday = index 0 .. Sunday = index 6)
  const weekDays: WorkingDayState[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setUTCDate(weekStart.getUTCDate() + i);
    const dateStr = formatDateISO(d);
    const dayOfWeek = d.getUTCDay();
    const isWorking = isOperationalWorkingDay(d, customNonWorkingDays);
    weekDays.push({
      date: d,
      dateStr,
      dayOfWeek,
      isWorking,
      countingJournals: 0,
      machineJournals: 0,
    });
  }

  // Working days Monday..Saturday (excluding Sunday and holidays)
  const workingDays = weekDays.filter((d) => d.dayOfWeek >= 1 && d.dayOfWeek <= 6 && d.isWorking);

  // Reglas de calendario mensual D19 / D29 / D30
  const mondayDayOfMonth = weekStart.getUTCDate();
  const weekOfMonth = Math.ceil(mondayDayOfMonth / 7);

  // Clasificar actividades por tipo de programación D27 / D29 / D30:
  // a) Diarias (25)
  // b) Patrones repetidos (12, 8, 6 en semanas impares)
  // c) Visitas únicas de la semana (4, 6 en semanas pares, y baja frecuencia / arrastre asignadas a esta semana por D30)
  const dailyTemplates: RoutineBaseTemplate[] = [];
  const patternTemplates: Array<{ template: RoutineBaseTemplate; targetDows: number[] }> = [];
  const uniqueVisits: Array<{ template: RoutineBaseTemplate; theoreticalJr: number; countsCapacity: boolean }> = [];

  // 1. Actividades recurrentes fijas (25, 12, 8, 6, 4)
  for (const template of templates) {
    const freq = template.frecuencia; // visitas/mes
    const theoreticalJr =
      template.rendimiento !== null &&
      template.rendimiento !== undefined &&
      template.rendimiento > 0
        ? template.cantidad / template.rendimiento
        : 0;
    const countsCapacity = template.counts_capacity !== false;

    // Semana 5 (días 29..31): solo se programan actividades con frecuencia >= 4 visitas/mes
    if (weekOfMonth >= 5 && freq < 4) {
      continue;
    }

    // 1. Frecuencia 25 visitas/mes -> Diaria (Lunes a Sábado)
    if (Math.abs(freq - 25) < 0.1 || freq >= 25) {
      dailyTemplates.push(template);
    }
    // 2. Frecuencia 12 visitas/mes -> Patrón repetido (Lun, Mié, Vie o Mar, Jue, Sáb)
    else if (Math.abs(freq - 12) < 0.1) {
      const targetDows = template.pattern_offset === 'turn_b' ? [2, 4, 6] : [1, 3, 5];
      patternTemplates.push({ template, targetDows });
    }
    // 3. Frecuencia 8 visitas/mes -> Patrón repetido (Mar, Jue)
    else if (Math.abs(freq - 8) < 0.1) {
      patternTemplates.push({ template, targetDows: [2, 4] });
    }
    // 4. Frecuencia 6 visitas/mes -> Semanas impares (1, 3, 5): Mar, Jue / Semanas pares (2, 4): 1 visita
    else if (Math.abs(freq - 6) < 0.1) {
      if (weekOfMonth % 2 === 1) {
        patternTemplates.push({ template, targetDows: [2, 4] });
      } else {
        uniqueVisits.push({ template, theoreticalJr, countsCapacity });
      }
    }
    // 5. Frecuencia 4 visitas/mes -> 1 visita todas las semanas
    else if (Math.abs(freq - 4) < 0.1) {
      uniqueVisits.push({ template, theoreticalJr, countsCapacity });
    }
    // Fallback para otras frecuencias >= 4 -> 1 visita
    else if (freq >= 4) {
      uniqueVisits.push({ template, theoreticalJr, countsCapacity });
    }
  }

  // 2. Actividades de baja frecuencia repartidas por proyección mensual (D30: 2, 1, 0.5, 0.33 y arrastre)
  if (weekOfMonth <= 4 && !options.skipMonthlyAllocation) {
    const monthlyAllocations = projectMonthlyLowFrequencyAllocation(templates, weekStart, options);
    const thisWeekAllocated = monthlyAllocations.get(weekStartStr) || [];
    monthlyCarryoverNextMonth = monthlyAllocations.carryoverNextMonth || [];

    for (const template of thisWeekAllocated) {
      const theoreticalJr =
        template.rendimiento !== null &&
        template.rendimiento !== undefined &&
        template.rendimiento > 0
          ? template.cantidad / template.rendimiento
          : 0;
      const countsCapacity = template.counts_capacity !== false;
      uniqueVisits.push({ template, theoreticalJr, countsCapacity });
    }
  }

  // --- a) Programar DIARIAS (25): Lunes a Sábado, festivo se omite ---
  for (const template of dailyTemplates) {
    const theoreticalJr =
      template.rendimiento !== null &&
      template.rendimiento !== undefined &&
      template.rendimiento > 0
        ? template.cantidad / template.rendimiento
        : 0;
    const countsCapacity = template.counts_capacity !== false;

    for (const wd of workingDays) {
      assignments.push({
        dateStr: wd.dateStr,
        dayOfWeek: wd.dayOfWeek,
        activity_key: template.activity_key,
        name: template.name,
        zone: template.zone,
        unit: template.unit,
        cantidad: template.cantidad,
        theoretical_jr: theoreticalJr,
        frequency_interval: template.frecuencia,
        counts_capacity: countsCapacity,
      });

      if (countsCapacity) {
        wd.countingJournals += theoreticalJr;
      } else {
        wd.machineJournals += theoreticalJr;
      }
    }
  }

  // --- b) Programar PATRONES REPETIDOS (12: lun-mié-vie; 8: mar-jue; 6 en semanas impares: mar-jue) ---
  for (const { template, targetDows } of patternTemplates) {
    const theoreticalJr =
      template.rendimiento !== null &&
      template.rendimiento !== undefined &&
      template.rendimiento > 0
        ? template.cantidad / template.rendimiento
        : 0;
    const countsCapacity = template.counts_capacity !== false;

    for (const dow of targetDows) {
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
          frequency_interval: template.frecuencia,
          counts_capacity: countsCapacity,
        });

        if (countsCapacity) {
          wd.countingJournals += theoreticalJr;
        } else {
          wd.machineJournals += theoreticalJr;
        }
      } else if (wd && !wd.isWorking) {
        // D26: Visita no diaria que cae en festivo pasa al siguiente día hábil de la misma semana; si no hay, al anterior
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
            frequency_interval: template.frecuencia,
            counts_capacity: countsCapacity,
          });

          if (countsCapacity) {
            targetWorkingDay.countingJournals += theoreticalJr;
          } else {
            targetWorkingDay.machineJournals += theoreticalJr;
          }
        }
      }
    }
  }

  // --- c, d, e) Programar VISITAS ÚNICAS de la semana (D27 / D28 / D30) ---
  // Ordenar por jornales de la visita (mayor primero; empate activity_key asc)
  uniqueVisits.sort((a, b) => {
    const diff = b.theoreticalJr - a.theoreticalJr;
    if (Math.abs(diff) > 1e-6) {
      return diff;
    }
    return compareStringsCode(a.template.activity_key, b.template.activity_key);
  });

  for (const { template, theoreticalJr, countsCapacity } of uniqueVisits) {
    if (workingDays.length === 0) continue;

    // Encontrar el día hábil con MENOR carga de jornales que cuentan para capacidad (empate: día más temprano)
    let bestDayIndex = 0;
    let minLoad = workingDays[0].countingJournals;

    for (let i = 1; i < workingDays.length; i++) {
      if (workingDays[i].countingJournals < minLoad - 1e-6) {
        minLoad = workingDays[i].countingJournals;
        bestDayIndex = i;
      }
    }

    const bestDay = workingDays[bestDayIndex];

    // Caso e) o actividad de máquina (D28) o sin capacidad definida:
    // Asignar al día de menor carga sin dividir
    if (siteDailyCapacity === null || !countsCapacity) {
      assignments.push({
        dateStr: bestDay.dateStr,
        dayOfWeek: bestDay.dayOfWeek,
        activity_key: template.activity_key,
        name: template.name,
        zone: template.zone,
        unit: template.unit,
        cantidad: template.cantidad,
        theoretical_jr: theoreticalJr,
        frequency_interval: template.frecuencia,
        counts_capacity: countsCapacity,
      });

      if (countsCapacity) {
        bestDay.countingJournals += theoreticalJr;
      } else {
        bestDay.machineJournals += theoreticalJr;
      }
      continue;
    }

    // Caso con capacidad: verificar si cabe en bestDay sin exceder siteDailyCapacity
    const availableInBest = Math.max(0, siteDailyCapacity - bestDay.countingJournals);

    if (theoreticalJr <= availableInBest + 0.005) {
      // Cabe completo en bestDay
      assignments.push({
        dateStr: bestDay.dateStr,
        dayOfWeek: bestDay.dayOfWeek,
        activity_key: template.activity_key,
        name: template.name,
        zone: template.zone,
        unit: template.unit,
        cantidad: template.cantidad,
        theoretical_jr: theoreticalJr,
        frequency_interval: template.frecuencia,
        counts_capacity: countsCapacity,
      });

      bestDay.countingJournals += theoreticalJr;
    } else {
      // Caso d: No cabe completo en el mejor día -> dividir en partes en días hábiles consecutivos de la misma semana
      // cada parte <= capacidad libre de su día
      const n = workingDays.length;
      let remJr = theoreticalJr;
      let remQty = template.cantidad;
      const parts: Array<{ day: WorkingDayState; jr: number; qty: number }> = [];

      for (let step = 0; step < n && remJr > 1e-4; step++) {
        const idx = (bestDayIndex + step) % n;
        const day = workingDays[idx];
        const freeCap = Math.max(0, siteDailyCapacity - day.countingJournals);

        if (freeCap > 1e-4) {
          const allocJr = Math.min(remJr, freeCap);
          const allocQty = Number((template.cantidad * (allocJr / theoreticalJr)).toFixed(2));
          parts.push({ day, jr: allocJr, qty: allocQty });
          day.countingJournals += allocJr;
          remJr -= allocJr;
          remQty -= allocQty;
        }
      }

      // D30.3: Control de sobrante intra-semana
      if (template.frecuencia <= 2) {
        // Para visitas de frecuencia <= 2, el sobrante que no cabe en ningún día pasa al arrastre.
        // NUNCA se suma al día de menor carga por encima del límite.
        if (remJr > 1e-4 && remQty > 0) {
          const cJr =
            template.rendimiento !== null && template.rendimiento !== undefined && template.rendimiento > 0
              ? Number((remQty / template.rendimiento).toFixed(4))
              : Number(remJr.toFixed(4));

          intraWeekCarryover.push({
            activity_key: template.activity_key,
            qty: remQty,
            jr: cJr,
            reason: 'CAPACITY',
          });
        }
      } else {
        // Actividades recurrentes (freq 4, 6 en sem pares): si sobra, se suma al día de menor carga
        if (remJr > 1e-4) {
          let minOverflowDay = workingDays[0];
          for (const d of workingDays) {
            if (d.countingJournals < minOverflowDay.countingJournals - 1e-6) {
              minOverflowDay = d;
            }
          }
          const existingPart = parts.find((p) => p.day === minOverflowDay);
          if (existingPart) {
            existingPart.jr += remJr;
            existingPart.qty += remQty;
          } else {
            parts.push({ day: minOverflowDay, jr: remJr, qty: remQty });
          }
          minOverflowDay.countingJournals += remJr;
        }
      }

      if (parts.length > 0) {
        const allocatedQtyTotal = template.cantidad - (template.frecuencia <= 2 && remJr > 1e-4 ? remQty : 0);
        const sumQty = parts.reduce((acc, p) => acc + p.qty, 0);
        const diffQty = Number((allocatedQtyTotal - sumQty).toFixed(2));
        if (Math.abs(diffQty) > 0) {
          parts[parts.length - 1].qty = Number((parts[parts.length - 1].qty + diffQty).toFixed(2));
        }

        for (const part of parts) {
          const partJr =
            template.rendimiento !== null && template.rendimiento !== undefined && template.rendimiento > 0
              ? Number((part.qty / template.rendimiento).toFixed(4))
              : (theoreticalJr > 0 ? Number((theoreticalJr * (part.qty / template.cantidad)).toFixed(4)) : 0);

          assignments.push({
            dateStr: part.day.dateStr,
            dayOfWeek: part.day.dayOfWeek,
            activity_key: template.activity_key,
            name: template.name,
            zone: template.zone,
            unit: template.unit,
            cantidad: part.qty,
            theoretical_jr: partJr,
            frequency_interval: template.frecuencia,
            counts_capacity: countsCapacity,
          });
        }
      }
    }
  }

  // D30.3: Calcular excesos de actividades recurrentes
  const recurrentExceedsCapacity: RecurrentExceedsCapacityItem[] = [];
  for (const wd of workingDays) {
    if (siteDailyCapacity !== null && wd.countingJournals > siteDailyCapacity + 0.005) {
      const deficit = Number((wd.countingJournals - siteDailyCapacity).toFixed(4));
      recurrentExceedsCapacity.push({
        dateStr: wd.dateStr,
        deficit_jr: deficit,
      });
    }
  }

  const totalJournals = assignments.reduce((acc, a) => acc + a.theoretical_jr, 0);

  return {
    weekStartStr,
    weekEndStr,
    assignments,
    totalJournals,
    carryoverIn: options.carryoverIn || [],
    carryoverNextMonth: monthlyCarryoverNextMonth, // Alias de carryoverNextMonthProjection para compatibilidad
    carryoverNextMonthProjection: monthlyCarryoverNextMonth,
    carryoverFromThisWeek: intraWeekCarryover,
    recurrentExceedsCapacity: recurrentExceedsCapacity.length > 0 ? recurrentExceedsCapacity : undefined,
  };
}

