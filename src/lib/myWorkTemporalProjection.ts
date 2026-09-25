/**
 * Module: MyWork Temporal Projection Service (UX-01)
 *
 * Principios Rectorales (v1.0):
 * 1. Proyección consultiva pura en memoria (0 mutaciones a BD, 0 DDL, 0 SQL).
 * 2. Foco primordial en HOY (planned_date == operationalToday en 'America/Bogota').
 * 3. Segregación del backlog de RESAGADAS (planned_date < operationalToday y no finalizada).
 * 4. Preservación del estado operacional canónico (pending, in_progress, reported, rejected, verified, closed).
 * 5. Divulgación progresiva de actividades FUTURAS (planned_date > operationalToday).
 * 6. Histórico silencioso de actividades pasadas completadas (no aparecen como resagadas).
 * 7. Consumo unificado por SiteListView y ActividadesView para evitar discrepancias.
 */

import { PublishedWeekPlan, PublishedWeekPlanItem } from '@/hooks/useWeeklyPlans';

export type TemporalCategory = 'TODAY' | 'OVERDUE' | 'FUTURE' | 'HISTORICAL_COMPLETED';

export interface MyWorkTemporalBucket {
  todayItems: PublishedWeekPlanItem[];
  overdueItems: PublishedWeekPlanItem[];
  futureItems: PublishedWeekPlanItem[];
  historicalCompletedItems: PublishedWeekPlanItem[];
  allWeekItems: PublishedWeekPlanItem[];
}

export interface OverdueGroupByDate {
  dateIso: string;
  formattedDate: string;
  daysAgo: number;
  items: PublishedWeekPlanItem[];
}

export interface MyWorkTemporalProjectionResult {
  operationalTodayISO: string;
  bucket: MyWorkTemporalBucket;
  overdueGroups: OverdueGroupByDate[];
  counts: {
    todayTotal: number;
    todayPending: number;
    todayInProgress: number;
    todayCompleted: number;
    overdueTotal: number;
    futureTotal: number;
    historicalCompletedTotal: number;
    allWeekTotal: number;
  };
  hasPlanLoaded: boolean;
}

/**
 * Determina si un ítem de planificación semanal se considera completamente cerrado/finalizado.
 * No simplifica a executed_qty >= planned_qty: valida el ciclo operacional completo.
 */
export function isActivityOperationallyFinalized(item: PublishedWeekPlanItem): boolean {
  const itemStatus = ((item as any).status || '').toLowerCase();
  const verifStatus = (item.executionsSummary?.verificationStatus || '').toLowerCase();

  // 1. Estados explícitamente terminales
  if (itemStatus === 'closed' || verifStatus === 'closed') return true;
  if (verifStatus === 'confirmed') return true;

  // 2. Si fue verificado formalmente y cumplió la meta planificada
  const plannedQty = item.planned_qty || 0;
  const executedQty = item.executed_qty || 0;
  if (verifStatus === 'verified' && (plannedQty === 0 || executedQty >= plannedQty)) {
    return true;
  }

  // 3. Si no tiene ejecuciones ni verificación pero el ítem fue formalmente completado en el plan
  if (itemStatus === 'completed' && !verifStatus) {
    return true;
  }

  return false;
}

/**
 * Normaliza la fecha planificada de un ítem a formato YYYY-MM-DD.
 */
export function normalizeItemPlannedDate(item: PublishedWeekPlanItem, fallbackDateISO: string): string {
  if (item.planned_date) {
    if (typeof item.planned_date === 'string') {
      return item.planned_date.substring(0, 10);
    }
    try {
      return new Date(item.planned_date).toISOString().substring(0, 10);
    } catch {
      return fallbackDateISO;
    }
  }
  return fallbackDateISO;
}

/**
 * Clasifica una actividad individual en su categoría temporal respecto al día operativo actual.
 */
export function classifyItemTemporalStatus(
  item: PublishedWeekPlanItem,
  operationalTodayISO: string
): TemporalCategory {
  const itemDate = normalizeItemPlannedDate(item, operationalTodayISO);

  if (itemDate === operationalTodayISO) {
    return 'TODAY';
  }

  if (itemDate > operationalTodayISO) {
    return 'FUTURE';
  }

  // itemDate < operationalTodayISO (Días anteriores)
  if (isActivityOperationallyFinalized(item)) {
    return 'HISTORICAL_COMPLETED';
  }

  return 'OVERDUE';
}

/**
 * Calcula la diferencia en días calendario entre dos fechas ISO (YYYY-MM-DD).
 */
export function calculateDaysDifference(pastIso: string, referenceTodayIso: string): number {
  const pParts = pastIso.split('-').map(Number);
  const rParts = referenceTodayIso.split('-').map(Number);
  if (pParts.length !== 3 || rParts.length !== 3) return 0;

  const pUtc = Date.UTC(pParts[0], pParts[1] - 1, pParts[2]);
  const rUtc = Date.UTC(rParts[0], rParts[1] - 1, rParts[2]);
  const diffMs = rUtc - pUtc;
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Formateador de Fecha Amigable en Español (ej: "Miércoles 23 Sep").
 */
export function formatFriendlyDate(dateIso: string): string {
  if (!dateIso || dateIso.length < 10) return dateIso || '';
  const parts = dateIso.substring(0, 10).split('-').map(Number);
  if (parts.length !== 3) return dateIso;

  const [y, m, d] = parts;
  const date = new Date(Date.UTC(y, m - 1, d));
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  const dayName = days[date.getUTCDay()] || '';
  const monthName = months[m - 1] || '';
  return `${dayName} ${d} ${monthName}`;
}

/**
 * Proyecta el conjunto completo de planes publicados agrupándolos en buckets temporales.
 */
export function projectMyWorkTemporalView(
  plans: PublishedWeekPlan[] | undefined | null,
  operationalTodayISO: string
): MyWorkTemporalProjectionResult {
  const bucket: MyWorkTemporalBucket = {
    todayItems: [],
    overdueItems: [],
    futureItems: [],
    historicalCompletedItems: [],
    allWeekItems: [],
  };

  const hasPlanLoaded = Boolean(plans && plans.length > 0);

  if (plans && plans.length > 0) {
    for (const plan of plans) {
      const items = plan.items || [];
      for (const item of items) {
        bucket.allWeekItems.push(item);
        const cat = classifyItemTemporalStatus(item, operationalTodayISO);
        switch (cat) {
          case 'TODAY':
            bucket.todayItems.push(item);
            break;
          case 'OVERDUE':
            bucket.overdueItems.push(item);
            break;
          case 'FUTURE':
            bucket.futureItems.push(item);
            break;
          case 'HISTORICAL_COMPLETED':
            bucket.historicalCompletedItems.push(item);
            break;
        }
      }
    }
  }

  // Agrupar resagadas por fecha planificada (de más reciente a más antigua)
  const overdueMap = new Map<string, PublishedWeekPlanItem[]>();
  for (const item of bucket.overdueItems) {
    const d = normalizeItemPlannedDate(item, operationalTodayISO);
    const list = overdueMap.get(d) || [];
    list.push(item);
    overdueMap.set(d, list);
  }

  const sortedDates = Array.from(overdueMap.keys()).sort((a, b) => b.localeCompare(a));
  const overdueGroups: OverdueGroupByDate[] = sortedDates.map((dateIso) => ({
    dateIso,
    formattedDate: formatFriendlyDate(dateIso),
    daysAgo: calculateDaysDifference(dateIso, operationalTodayISO),
    items: overdueMap.get(dateIso) || [],
  }));

  // Contadores analíticos para HOY
  let todayPending = 0;
  let todayInProgress = 0;
  let todayCompleted = 0;

  for (const item of bucket.todayItems) {
    const plannedQty = item.planned_qty || 0;
    const executedQty = item.executed_qty || 0;
    if (executedQty === 0) {
      todayPending++;
    } else if (executedQty < plannedQty) {
      todayInProgress++;
    } else {
      todayCompleted++;
    }
  }

  return {
    operationalTodayISO,
    bucket,
    overdueGroups,
    counts: {
      todayTotal: bucket.todayItems.length,
      todayPending,
      todayInProgress,
      todayCompleted,
      overdueTotal: bucket.overdueItems.length,
      futureTotal: bucket.futureItems.length,
      historicalCompletedTotal: bucket.historicalCompletedItems.length,
      allWeekTotal: bucket.allWeekItems.length,
    },
    hasPlanLoaded,
  };
}
