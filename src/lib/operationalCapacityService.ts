/**
 * Service: Motor de Capacidad Operativa y Brecha de Personal (Módulo 3)
 * Baseline: 2386465 + ADR-0007..ADR-0012 + Módulo 2 (CLOSED & CERTIFIED)
 *
 * Principios:
 * 1. Lógica determinística de lectura pura (0 mutaciones a BD, 0 reasignaciones).
 * 2. Desacoplamiento estricto: X (Necesidad desde Resource Analysis) vs Y (Asignación desde Módulo 2).
 * 3. Costos es consumidor financiero aguas abajo — NUNCA dicta el personal necesario.
 * 4. Protección contra doble conteo de identidades físicas reales (document_id / personnel_id).
 */

import { calculateTheoreticalJournals, WORKING_DAYS_MONTH } from './schedulerMath';
import { PersonnelSiteAssignment, Crew } from '@/types/crew';
import { WeeklyPlanItem } from '@/types/weeklyPlan';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de Dominio para el Módulo 3
// ─────────────────────────────────────────────────────────────────────────────

export interface MinimalActivityStandard {
  activity_key: string;
  category: string;
  rendimiento: number | null;
  requiere_rendimiento?: boolean;
  frecuencia?: number | null;
}

export interface MinimalScopeMapping {
  activity_key: string;
  scope_key: string;
  weight?: number;
}

export interface ZoneGapDetail {
  zoneKey: string; // 'ZV' | 'ZD' | 'ZP' | 'GENERAL'
  zoneName: string;
  requiredWorkers: number; // X_zona
  assignedWorkers: number; // Y_zona
  deficit: number; // max(0, X - Y)
  excedente: number; // max(0, Y - X)
  status: 'DEFICIT' | 'EXCEDENTE' | 'BALANCED';
}

export interface OperationalGapSummary {
  siteId: string;
  siteName: string;
  totalMonthlyJournals: number; // Suma JR_mes
  totalRequiredWorkers: number; // X = JR_mes / 25
  totalAssignedWorkers: number; // Y = count(assignments)
  uniquePhysicalWorkersCount: number; // Conteo de personas físicas reales (sin doble conteo)
  netDeficit: number; // max(0, X - Y)
  netExcedente: number; // max(0, Y - X)
  status: 'DEFICIT' | 'EXCEDENTE' | 'BALANCED';
  zoneDetails: ZoneGapDetail[];
}

export interface DailyCrewWorkload {
  crewId: string;
  crewName: string;
  plannedDate: string; // YYYY-MM-DD
  assignedItemsCount: number;
  totalPlannedJournals: number; // Suma theoretical_jr para esa fecha
  applicableDailyCapacity: number; // Capacidad aplicable por día
  utilizationRate: number; // totalPlannedJournals / applicableDailyCapacity
  status: 'NORMAL' | 'SOBRECARGA';
  items: Array<{
    id: string;
    activityName: string;
    zone: string;
    theoretical_jr: number;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapeo Auxiliar de Zonas
// ─────────────────────────────────────────────────────────────────────────────

const ZONE_NAME_MAP: Record<string, string> = {
  ZV: 'Zona Verde (ZV)',
  ZD: 'Zona Dura (ZD)',
  ZP: 'Zona Playa (ZP)',
  GENERAL: 'General / Mantenimiento',
};

const CATEGORY_TO_ZONE_MAP: Record<string, string> = {
  'ZONA VERDE': 'ZV',
  'ZONA DURA': 'ZD',
  'ZONA DE PLAYA': 'ZP',
};

// ─────────────────────────────────────────────────────────────────────────────
// Motor Determinístico de Cálculo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcula el Análisis Macro de Brecha Operativa (X vs Y).
 *
 * X = Personal Requerido (desde scope_data × rendimientos / 25)
 * Y = Personal Asignado (desde adscripciones activas del Módulo 2)
 */
export function calculateOperationalGap(
  siteId: string,
  siteName: string,
  scopeData: Record<string, number>,
  standards: MinimalActivityStandard[],
  scopeMappings: MinimalScopeMapping[],
  siteAssignments: PersonnelSiteAssignment[]
): OperationalGapSummary {
  // 1. Indexar scopeMappings por activity_key -> scope_keys
  const scopeByKey = new Map<string, string[]>();
  for (const m of scopeMappings) {
    const keys = scopeByKey.get(m.activity_key) ?? [];
    keys.push(m.scope_key);
    scopeByKey.set(m.activity_key, keys);
  }

  // 2. Acumuladores de JR_mes por zona
  const monthlyJournalsByZone: Record<string, number> = {
    ZV: 0,
    ZD: 0,
    ZP: 0,
    GENERAL: 0,
  };
  let totalMonthlyJournals = 0;

  // 3. Recorrer actividades del Catálogo Técnico y calcular JR_mes
  for (const s of standards) {
    if (s.requiere_rendimiento === false || s.rendimiento === null || s.rendimiento <= 0) continue;
    
    const scopeKeys = scopeByKey.get(s.activity_key) ?? [];
    for (const scopeKey of scopeKeys) {
      const qty = scopeData[scopeKey] ?? 0;
      if (qty <= 0) continue;

      const freq = s.frecuencia ?? 25; // Default diaria (25 días/mes)
      const jr_month = calculateTheoreticalJournals(qty, s.rendimiento, freq, WORKING_DAYS_MONTH);
      if (jr_month <= 0) continue;

      totalMonthlyJournals += jr_month;
      const zoneCode = CATEGORY_TO_ZONE_MAP[s.category] ?? 'GENERAL';
      monthlyJournalsByZone[zoneCode] = (monthlyJournalsByZone[zoneCode] ?? 0) + jr_month;
    }
  }

  // 4. Calcular X (Personal Requerido = JR_mes / 25)
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const totalRequiredWorkers = round1(totalMonthlyJournals / WORKING_DAYS_MONTH);

  const requiredByZone: Record<string, number> = {
    ZV: round1((monthlyJournalsByZone['ZV'] ?? 0) / WORKING_DAYS_MONTH),
    ZD: round1((monthlyJournalsByZone['ZD'] ?? 0) / WORKING_DAYS_MONTH),
    ZP: round1((monthlyJournalsByZone['ZP'] ?? 0) / WORKING_DAYS_MONTH),
    GENERAL: round1((monthlyJournalsByZone['GENERAL'] ?? 0) / WORKING_DAYS_MONTH),
  };

  // 5. Calcular Y (Personal Asignado desde Módulo 2)
  const assignedByZone: Record<string, number> = {
    ZV: 0,
    ZD: 0,
    ZP: 0,
    GENERAL: 0,
  };
  const uniquePersonnelSet = new Set<string>();

  for (const a of siteAssignments) {
    const rawZone = (a.zone ?? 'GENERAL').toUpperCase();
    const zoneKey = ['ZV', 'ZD', 'ZP'].includes(rawZone) ? rawZone : 'GENERAL';
    assignedByZone[zoneKey] = (assignedByZone[zoneKey] ?? 0) + 1;
    
    const uniqueId = a.personnel_document_id || a.personnel_id;
    if (uniqueId) {
      uniquePersonnelSet.add(uniqueId);
    }
  }

  const totalAssignedWorkers = siteAssignments.length;
  const uniquePhysicalWorkersCount = uniquePersonnelSet.size;

  // 6. Construir desglose por zonas
  const zoneKeys = ['ZV', 'ZD', 'ZP'];
  if (requiredByZone['GENERAL'] > 0 || assignedByZone['GENERAL'] > 0) {
    zoneKeys.push('GENERAL');
  }

  const zoneDetails: ZoneGapDetail[] = zoneKeys.map((zk) => {
    const req = requiredByZone[zk] ?? 0;
    const ass = assignedByZone[zk] ?? 0;
    const def = Math.max(0, round1(req - ass));
    const exc = Math.max(0, round1(ass - req));
    let status: 'DEFICIT' | 'EXCEDENTE' | 'BALANCED' = 'BALANCED';
    if (req - ass > 0.1) status = 'DEFICIT';
    else if (ass - req > 0.1) status = 'EXCEDENTE';

    return {
      zoneKey: zk,
      zoneName: ZONE_NAME_MAP[zk] ?? zk,
      requiredWorkers: req,
      assignedWorkers: ass,
      deficit: def,
      excedente: exc,
      status,
    };
  });

  // 7. Resumen Total
  const netDeficit = Math.max(0, round1(totalRequiredWorkers - totalAssignedWorkers));
  const netExcedente = Math.max(0, round1(totalAssignedWorkers - totalRequiredWorkers));
  let status: 'DEFICIT' | 'EXCEDENTE' | 'BALANCED' = 'BALANCED';
  if (totalRequiredWorkers - totalAssignedWorkers > 0.1) status = 'DEFICIT';
  else if (totalAssignedWorkers - totalRequiredWorkers > 0.1) status = 'EXCEDENTE';

  return {
    siteId,
    siteName,
    totalMonthlyJournals: round1(totalMonthlyJournals),
    totalRequiredWorkers,
    totalAssignedWorkers,
    uniquePhysicalWorkersCount,
    netDeficit,
    netExcedente,
    status,
    zoneDetails,
  };
}

/**
 * Calcula el Análisis Micro de Carga por Cuadrilla.
 *
 * Agrupa los ítems asignados a cuadrillas por fecha y determina si existe sobrecarga.
 */
export function calculateCrewWorkloads(
  planItems: WeeklyPlanItem[],
  crews: Crew[],
  dailyCapacityByCrew?: Record<string, number>
): DailyCrewWorkload[] {
  const crewMap = new Map<string, Crew>();
  for (const c of crews) {
    crewMap.set(c.id, c);
  }

  // Agrupar items por `${crew_id}__${planned_date}`
  const grouped = new Map<string, WeeklyPlanItem[]>();

  for (const item of planItems) {
    if (!item.crew_id) continue; // Solo ítems asignados a cuadrilla
    const key = `${item.crew_id}__${item.planned_date}`;
    const list = grouped.get(key) ?? [];
    list.push(item);
    grouped.set(key, list);
  }

  const results: DailyCrewWorkload[] = [];
  const round1 = (n: number) => Math.round(n * 10) / 10;

  for (const [key, items] of grouped.entries()) {
    const [crewId, plannedDate] = key.split('__');
    const crew = crewMap.get(crewId);
    const crewName = crew?.name ?? 'Cuadrilla Desconocida';

    const totalPlannedJournals = items.reduce((sum, i) => sum + (i.theoretical_jr ?? 0), 0);
    // Capacidad por defecto: 1.0 jornal por cuadrilla si no se especifica
    const applicableDailyCapacity = dailyCapacityByCrew?.[crewId] ?? 1.0;
    const utilizationRate = applicableDailyCapacity > 0 
      ? Math.round((totalPlannedJournals / applicableDailyCapacity) * 100) / 100
      : 0;

    const status: 'NORMAL' | 'SOBRECARGA' = totalPlannedJournals > applicableDailyCapacity + 0.05
      ? 'SOBRECARGA'
      : 'NORMAL';

    results.push({
      crewId,
      crewName,
      plannedDate,
      assignedItemsCount: items.length,
      totalPlannedJournals: round1(totalPlannedJournals),
      applicableDailyCapacity,
      utilizationRate,
      status,
      items: items.map((i) => ({
        id: i.id,
        activityName: i.name,
        zone: i.zone,
        theoretical_jr: i.theoretical_jr,
      })),
    });
  }

  // Ordenar por fecha y cuadrilla
  return results.sort((a, b) => {
    if (a.plannedDate !== b.plannedDate) {
      return a.plannedDate.localeCompare(b.plannedDate);
    }
    return a.crewName.localeCompare(b.crewName);
  });
}
