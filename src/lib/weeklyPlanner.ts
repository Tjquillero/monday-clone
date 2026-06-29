import {
  ActivityStandard,
  ScopeMapping,
  PlanningActivity,
  WeeklyPlanningContext,
  ActivityPriority,
} from '@/types/scheduler';
import {
  WORKING_DAYS_MONTH,
  calculateTheoreticalJournals,
  calculateWeeklyDistribution,
  calculateCapacityUsage,
} from './schedulerMath';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de entrada del motor
// ─────────────────────────────────────────────────────────────────────────────

export interface ZoneInfo {
  id: string;
  name: string;
  daily_capacity: number;
}

export interface WeekInfo {
  start: Date;
  number: number;       // 1–4 dentro del mes de planificación
  workingDays: number;  // días hábiles del período (default 5)
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de fechas (privados a este módulo)
// ─────────────────────────────────────────────────────────────────────────────

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers exportados — usados por el hook y testeables por separado
// ─────────────────────────────────────────────────────────────────────────────

// Determina el número de semana de planificación (1–4) a partir del lunes
// de inicio. Semanas del mes: 1–7→1, 8–14→2, 15–21→3, 22+→4.
// Usa getUTCDate() para evitar desplazamiento de día en zonas horarias
// donde UTC midnight se convierte en el día anterior (UTC-X).
export function calculateWeekNumber(weekStart: Date): number {
  return Math.min(4, Math.ceil(weekStart.getUTCDate() / 7));
}

// Devuelve el lunes y el viernes de la semana (ISO date strings).
export function getWeekBounds(weekStart: Date): { start: string; end: string } {
  return {
    start: toISODate(weekStart),
    end: toISODate(addDays(weekStart, 4)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Motor determinista de planificación semanal
//
// No lee de Supabase, no llama a Date.now(), no usa Math.random().
// La misma entrada siempre produce la misma salida.
//
// Flujo:
//   standards + scopeMappings → iterar actividades con qty > 0
//   → calculateTheoreticalJournals → calculateWeeklyDistribution[week.number-1]
//   → ordenar por prioridad (must_execute primero)
//   → calcular capacidad mensual y semanal
//   → devolver WeeklyPlanningContext
// ─────────────────────────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<ActivityPriority, number> = {
  must_execute: 0,
  preferred: 1,
  flexible: 2,
};

export function buildWeeklyPlanningContext(
  standards: ActivityStandard[],
  scopeMappings: ScopeMapping[],
  scopeQuantities: Record<string, number>,
  zone: ZoneInfo,
  week: WeekInfo,
): WeeklyPlanningContext {
  // O(1) lookup: activity_key → lista de scope_keys
  const scopeByKey = new Map<string, string[]>();
  for (const m of scopeMappings) {
    const keys = scopeByKey.get(m.activity_key) ?? [];
    keys.push(m.scope_key);
    scopeByKey.set(m.activity_key, keys);
  }

  const activities: PlanningActivity[] = [];

  for (const s of standards) {
    for (const scopeKey of scopeByKey.get(s.activity_key) ?? []) {
      const qty = scopeQuantities[scopeKey] ?? 0;
      if (qty <= 0) continue;

      const jr_month = calculateTheoreticalJournals(qty, s.rendimiento, s.frecuencia);
      const distribution = calculateWeeklyDistribution(jr_month, 4);
      const jr_week = distribution[week.number - 1] ?? 0;

      activities.push({
        activity_key: s.activity_key,
        name: s.name,
        category: s.category,
        priority: s.priority,
        qty,
        unit: s.unit,
        rendimiento: s.rendimiento,
        frecuencia: s.frecuencia,
        theoretical_journals_month: jr_month,
        theoretical_journals_week: jr_week,
        rules: [],
      });
    }
  }

  // Ordenar por prioridad: must_execute primero, flexible último.
  // Array.sort es estable en V8 (Node.js 11+ / ES2019) — orden reproducible.
  activities.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  const totalJrMonth = activities.reduce((s, a) => s + a.theoretical_journals_month, 0);
  const totalJrWeek = activities.reduce((s, a) => s + a.theoretical_journals_week, 0);
  const weeklyAvailable = zone.daily_capacity * week.workingDays;
  const capacityResult = calculateCapacityUsage(totalJrMonth, zone.daily_capacity, WORKING_DAYS_MONTH);
  const bounds = getWeekBounds(week.start);

  return {
    week: {
      start: bounds.start,
      end: bounds.end,
      number: week.number,
      working_days: week.workingDays,
    },
    zone: {
      id: zone.id,
      name: zone.name,
      daily_capacity: zone.daily_capacity,
      available_capacity: Math.max(0, weeklyAvailable - totalJrWeek),
    },
    activities,
    capacity: {
      weekly_available: weeklyAvailable,
      weekly_required: totalJrWeek,
      feasible: capacityResult.feasible,
      deficit: capacityResult.deficit,
    },
    constraints: {
      incompatible_pairs: [],
      dependencies: [],
      weather_sensitive: [],
    },
  };
}
