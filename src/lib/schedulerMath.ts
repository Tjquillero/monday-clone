/**
 * Maintenance Scheduling Engine — Motor Matemático
 *
 * Librería de funciones puras para el cálculo de planificación operativa.
 * Regla absoluta: este módulo no importa React, Supabase, hooks, IndexedDB
 * ni ninguna variable del proyecto. Solo recibe números y devuelve números.
 *
 * Fuente de verdad: docs/MAINTENANCE_SCHEDULING_ENGINE_v1.md
 */

export const WORKING_DAYS_MONTH = 25;
export const WORKING_DAYS_WEEK = 5;
export const CONTRACT_PERIODS_PER_MONTH = 4;
export const DAYS_PER_CONTRACT_PERIOD = 7;

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de retorno
// ─────────────────────────────────────────────────────────────────────────────

export interface CapacityResult {
  feasible: boolean;
  available: number;
  utilizationRate: number;
  deficit: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Funciones
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Jornales teóricos mensuales para una actividad.
 *
 * Fórmula: qty / (rendimiento × frecuencia / workingDays)
 *
 * ADR-0009 reabierto (2026-07-21, INV-0002): el dueño del proceso confirmó que
 * `COSTOS GENERALES (V2).xlsx` — el Resource Analysis oficial vigente — calcula
 * `CANT JORNALES MES` con esta misma fórmula (`qty × 25 / (rendimiento × frecuencia)`),
 * y que es la correcta. Se revierte el cambio de ADR-0009 (que había eliminado
 * el factor `frecuencia/workingDays`).
 *
 * La frecuencia expresa cuántas veces ocurre la actividad en workingDays.
 *   frec=25 → diaria
 *   frec=4  → semanal
 *   frec=1  → mensual
 *   frec=12.5 → cada dos días aproximadamente
 *   frec=null → actividad contratada sin programación periódica en esta
 *     versión del POA (ADR-0005) — no genera jornales, igual que frec<=0.
 */
export function calculateTheoreticalJournals(
  qty: number,
  rendimiento: number,
  frecuencia: number | null,
  workingDays = WORKING_DAYS_MONTH,
): number {
  if (qty <= 0 || rendimiento <= 0 || frecuencia === null || frecuencia <= 0 || workingDays <= 0) return 0;
  return qty / (rendimiento * (frecuencia / workingDays));
}

/**
 * Jornales por día laboral.
 * Responde: ¿cuántos trabajadores necesito cada día para esta actividad?
 */
export function calculateDailyJournals(
  theoreticalJournals: number,
  workingDays = WORKING_DAYS_MONTH,
): number {
  if (theoreticalJournals <= 0 || workingDays <= 0) return 0;
  return theoreticalJournals / workingDays;
}

/**
 * Distribución semanal de jornales en el mes.
 * Retorna un array de `weeksInMonth` valores que suman theoreticalJournals.
 *
 * v1: distribución uniforme. El optimizador de IA ajusta desde este punto.
 * Frecuencias < 1 (trimestral, anual) son responsabilidad del caller —
 * este función asume que el mes actual es un mes de ejecución.
 */
export function calculateWeeklyDistribution(
  theoreticalJournals: number,
  weeksInMonth = 4,
): number[] {
  if (theoreticalJournals <= 0 || weeksInMonth <= 0) {
    return Array(Math.max(weeksInMonth, 0)).fill(0);
  }
  const perWeek = round2(theoreticalJournals / weeksInMonth);
  const result = Array(weeksInMonth).fill(perWeek);
  // Ajustar el último elemento para que la suma sea exacta
  const accumulated = perWeek * (weeksInMonth - 1);
  result[weeksInMonth - 1] = round2(theoreticalJournals - accumulated);
  return result;
}

/**
 * Factibilidad: ¿caben los jornales requeridos en la capacidad del sitio?
 *
 * utilizationRate > 1 → sobrecarga
 * utilizationRate < 0.7 → capacidad ociosa
 */
export function calculateCapacityUsage(
  totalRequired: number,
  dailyCapacity: number,
  workingDays = WORKING_DAYS_MONTH,
): CapacityResult {
  if (dailyCapacity <= 0 || workingDays <= 0) {
    return { feasible: false, available: 0, utilizationRate: 0, deficit: totalRequired };
  }
  const available = dailyCapacity * workingDays;
  const deficit = Math.max(0, totalRequired - available);
  return {
    feasible: totalRequired <= available,
    available,
    utilizationRate: round4(totalRequired / available),
    deficit: round2(deficit),
  };
}

/**
 * Desviación del rendimiento observado respecto al estándar.
 *
 * Positivo → mejor que el estándar (más productivo).
 * Negativo → por debajo del estándar.
 * ±0.20 (20%) se considera umbral de alerta.
 */
export function calculatePerformanceDeviation(
  standard: number,
  observed: number,
): number {
  if (standard <= 0) return 0;
  return round4((observed - standard) / standard);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
