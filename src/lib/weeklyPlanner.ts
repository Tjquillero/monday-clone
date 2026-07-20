import {
  ActivityStandard,
  ActivityStandardWithFrecuencia,
  ScopeMapping,
  PlanningActivity,
  WeeklyPlanningContext,
  ActivityPriority,
} from '@/types/scheduler';
import {
  WORKING_DAYS_MONTH,
  CONTRACT_PERIODS_PER_MONTH,
  DAYS_PER_CONTRACT_PERIOD,
  calculateTheoreticalJournals,
  calculateWeeklyDistribution,
  calculateCapacityUsage,
} from './schedulerMath';
import { getSiteCapacity } from './siteCapacity';
import type { PoaActiveCatalog } from '@/hooks/usePoaActivities';

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

// Semana del contrato (1–4) para una fecha de inicio de semana.
//
// IMPORTANTE — este NO es el número de semana ISO (ISO 8601).
// Es el número de período de planificación del contrato, basado en el día
// del mes. Siempre CONTRACT_PERIODS_PER_MONTH períodos por mes,
// independiente del año o de cuántos días tenga el mes.
// Usa getUTCDate() para evitar desplazamiento de día en zonas UTC-X.
export function calculateContractWeek(weekStart: Date): number {
  return Math.min(
    CONTRACT_PERIODS_PER_MONTH,
    Math.ceil(weekStart.getUTCDate() / DAYS_PER_CONTRACT_PERIOD),
  );
}

// Lunes (UTC) de la semana a la que pertenece una fecha.
// Misma convención que weekly_plans.week_start.
export function getMonday(date: Date): Date {
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + diff,
  ));
}

// "Hoy" en el día de negocio (America/Bogota), no en UTC ni en la hora local
// del navegador — mismo bug ya corregido una vez en el SQL
// (get_delayed_weekly_plans, 20260819_fix_delayed_weekly_plans_bogota_timezone.sql).
// Entre las 19:00 y las 23:59 hora de Bogotá, `new Date()` en UTC ya rodó al
// día siguiente — sin esto, getMonday(new Date()) salta a la semana
// siguiente ~5 horas antes de tiempo. Todo caller que resuelva "la semana
// actual" por defecto (sin un weekStart explícito) debe usar
// getMonday(getBogotaToday()), nunca getMonday(new Date()) directo.
export function getBogotaToday(): Date {
  const [y, m, d] = new Date()
    .toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    .split('-')
    .map(Number);
  return new Date(Date.UTC(y, m - 1, d));
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

// Catálogo Técnico (board_activity_standards) × POA activo (frecuencia +
// cobertura por zona) → estándares vigentes para UNA zona. Un estándar de
// contrato (group_id null) o de sitio sin cobertura POA vigente en esta
// zona simplemente no se planifica ahí (Regla 13, poa-domain.md: origen
// exclusivo de actividades).
export function mergeStandardsForZone(
  standards: ActivityStandard[],
  poaCatalog: PoaActiveCatalog,
  groupId: string,
): ActivityStandardWithFrecuencia[] {
  const merged: ActivityStandardWithFrecuencia[] = [];
  for (const s of standards) {
    const poaActivity = poaCatalog.get(s.activity_key);
    const zoneCoverage = poaActivity?.zones.get(groupId);
    if (!poaActivity || !zoneCoverage) continue;
    merged.push({
      ...s,
      frecuencia: poaActivity.frecuencia,
      poa_activity_zone_id: zoneCoverage.poaActivityZoneId,
    });
  }
  return merged;
}

export function buildWeeklyPlanningContext(
  standards: ActivityStandardWithFrecuencia[],
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
      // frecuencia === null: actividad contratada sin programación periódica
      // en esta versión del POA (ADR-0005) — no genera un ítem planificable
      // hasta que una versión futura le asigne frecuencia. Se excluye aquí,
      // antes de construir PlanningActivity, no en la capa de persistencia
      // (replace_weekly_plan_items exige planned_frecuencia > 0 — un envío
      // con frecuencia nula sería rechazado por el RPC, no silenciado).
      if (s.frecuencia === null) continue;
      // requiere_rendimiento === false: decisión deliberada de que esta
      // actividad no se planifica por rendimiento (Decisión 4, poa-technical-
      // catalog-decoupling.md) — mismo patrón que frecuencia === null. No
      // entra con "0 jornales" (se confundiría con un error de captura),
      // simplemente no participa del modelo de capacidad semanal.
      if (!s.requiere_rendimiento) continue;
      // Invariante de base de datos (chk_bas_rendimiento_por_requiere): con
      // requiere_rendimiento=true, rendimiento nunca es NULL.
      const rendimiento = s.rendimiento as number;

      const jr_month = calculateTheoreticalJournals(qty, rendimiento, s.frecuencia);
      const distribution = calculateWeeklyDistribution(jr_month, CONTRACT_PERIODS_PER_MONTH);
      const jr_week = distribution[week.number - 1] ?? 0;

      activities.push({
        activity_key: s.activity_key,
        name: s.name,
        category: s.category,
        priority: s.priority,
        qty,
        unit: s.unit,
        rendimiento,
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

export interface BoardSitePlan {
  group: { id: string; title: string };
  plan: WeeklyPlanningContext;
}

// Fan-out de buildWeeklyPlanningContext() a TODAS las zonas de un board — la
// base de datos de los indicadores ejecutivos (ranking de sitios, Pareto de
// JR). Pura: recibe todas las fuentes ya resueltas, sin red ni estado. Sitios
// sin ninguna actividad planificable (catálogo técnico sin cobertura POA en
// esa zona, o sin resource_analysis) se excluyen — no hay señal real de
// utilización que mostrar para ellos.
export function buildBoardPlanningContexts(
  groups: { id: string; title: string }[],
  standards: ActivityStandard[],
  poaCatalog: PoaActiveCatalog,
  scopeMappings: ScopeMapping[],
  scopeDataBySite: Record<string, Record<string, number>>,
  week: WeekInfo,
): BoardSitePlan[] {
  const results: BoardSitePlan[] = [];
  for (const group of groups) {
    const siteCapacity = getSiteCapacity(group.title);
    const zone: ZoneInfo = {
      id: group.id,
      name: group.title,
      daily_capacity: siteCapacity?.daily_capacity ?? 0,
    };
    const mergedStandards = mergeStandardsForZone(standards, poaCatalog, group.id);
    const scopeQuantities = scopeDataBySite[group.id] ?? {};
    const plan = buildWeeklyPlanningContext(mergedStandards, scopeMappings, scopeQuantities, zone, week);
    if (plan.activities.length === 0) continue;
    results.push({ group, plan });
  }
  return results;
}
