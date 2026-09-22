/**
 * Service: Control de Consumo Operativo Físico de Recursos en Campo (Fase 4 · Módulo 3 & Hito Gestión Operativa de Recursos v1)
 * Baseline: 108 suites / 852 tests
 *
 * Principios e Invariantes:
 * 1. Lógica determinística de lectura pura (0 mutaciones a BD, 0 reasignaciones).
 * 2. Precedencia estricta de alcance físico: subejecución física (executed_qty < planned_qty)
 *    NUNCA se clasifica como menor consumo / ahorro de jornales ni de recursos.
 * 3. Filtrado por verificación operacional (ADR-0011): Solo ejecuciones en estado 'VERIFIED'
 *    o 'confirmed'/'completed' acumulan consumo verificado (draft/rejected = 0.0).
 * 4. Agregación determinística por occurrence_key (ADR-0008).
 * 5. Desacoplamiento financiero: El costo monetario COP se declara 'UNDETERMINED_MONETARY_COST'.
 * 6. Distinción ontológica estricta: RECURSO REQUERIDO (Planificación) != RECURSO REALMENTE UTILIZADO (Ejecución F5.3).
 * 7. Mano de obra / jornales permanece bajo su dominio y contrato especializado existente.
 * 8. Recursos adicionales: MATERIAL, EQUIPO_MENOR, EQUIPO_MAYOR con unidad operacional genérica (quantity + unit).
 * 9. Aislamiento total de Solver H8 (STRICTLY NO-GO).
 */

import { WeeklyPlanItem } from '@/types/weeklyPlan';

export type ScopeComplianceStatus = 'ALCANCE_COMPLETO' | 'SUBEJECUCION_ALCANCE';

export type ConsumptionStatus =
  | 'SUBEJECUCION_ALCANCE'
  | 'EXCESO_CONSUMO_JR'
  | 'MENOR_CONSUMO_JR'
  | 'CONSUMO_BALANCEADO';

export type MonetaryCostStatus = 'UNDETERMINED_MONETARY_COST';

export type AdditionalResourceCategory = 'MATERIAL' | 'EQUIPO_MENOR' | 'EQUIPO_MAYOR';

export interface OperationalResourceItem {
  resourceKey: string;      // Identificador canónico (ej: 'MAT_CEMENTO_GRIS', 'EQM_COMPACTADORA', 'EQM_TRACTOR')
  resourceName: string;     // Nombre descriptivo (ej: 'Cemento Gris 50kg', 'Compactadora Manual')
  category: AdditionalResourceCategory;
  unit: string;             // Unidad operacional genérica (ej: 'saco', 'galon', 'unidad', 'hora', 'turno', 'kg')
  quantity: number;         // Magnitud física (>= 0)
}

export type ResourceVarianceStatus =
  | 'BALANCEADO'                 // usedQty === requiredQty (o dentro de tolerancia ±0.001)
  | 'EXCESO_UTILIZACION'        // usedQty > requiredQty
  | 'MENOR_UTILIZACION'         // usedQty < requiredQty (solo en alcance completo)
  | 'NO_UTILIZADO'              // requiredQty > 0 & usedQty === 0
  | 'NO_PLANIFICADO_UTILIZADO'  // requiredQty === 0 & usedQty > 0
  | 'SUBEJECUCION_ALCANCE';     // executed_qty < planned_qty (no se cataloga como ahorro)

export interface ResourceVarianceDetail {
  resourceKey: string;
  resourceName: string;
  category: AdditionalResourceCategory;
  unit: string;
  requiredQty: number;          // Magnitud planificada teórica
  usedQty: number;              // Magnitud real ejecutada y verificada
  deltaQty: number;             // usedQty - requiredQty
  varianceStatus: ResourceVarianceStatus;
}

export interface MinimalExecutionRecord {
  id: string;
  weekly_plan_item_id?: string | null;
  occurrence_key?: string | null;
  executed_qty: number;
  executed_jr: number;
  verification_status?: 'VERIFIED' | 'draft' | 'reported' | 'evidence_pending' | 'rejected' | string | null;
  status?: 'confirmed' | 'completed' | 'planned' | 'draft' | string | null;
  execution_date?: string;
  crew_id?: string | null;
  machinery_id?: string | null;
  // Extensiones Operacionales F5.3 (Opcionales, aditivas)
  usedResources?: OperationalResourceItem[];
}

export interface ItemResourceConsumptionResult {
  planItemId: string;
  occurrenceKey: string;
  activityName: string;
  plannedDate: string;
  plannedQty: number;
  executedQty: number; // Suma verificada
  theoreticalJr: number;
  executedJr: number; // Suma verificada (JR ejecutados verificados)
  deltaJr: number; // executedJr - theoreticalJr
  scopeComplianceStatus: ScopeComplianceStatus;
  consumptionStatus: ConsumptionStatus;
  monetaryCostStatus: MonetaryCostStatus;
  assignedCrewId?: string | null;
  assignedMachineryId?: string | null;
  verifiedExecutionsCount: number;

  // NUEVO DESGLOSE MULTI-RECURSO
  resourcesVariance: ResourceVarianceDetail[];
}

export interface SiteResourceConsumptionSummary {
  totalPlanItemsCount: number;
  completedScopeItemsCount: number;
  subexecutionScopeItemsCount: number;
  totalTheoreticalJr: number;
  totalExecutedJrVerified: number;
  overallDeltaJr: number;
  items: ItemResourceConsumptionResult[];
  monetaryCostStatus: MonetaryCostStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validadores de Dominio de Recursos Operativos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valida la integridad estructural y cuantitativa de un ítem de recurso operacional.
 */
export function validateOperationalResourceItem(item: OperationalResourceItem): void {
  if (!item) {
    throw new Error('[ResourceValidationError] El ítem de recurso no puede ser nulo o indefinido');
  }
  if (!item.resourceKey || typeof item.resourceKey !== 'string' || item.resourceKey.trim() === '') {
    throw new Error('[ResourceValidationError] [INVALID_RESOURCE_KEY]: resourceKey es obligatorio');
  }
  if (!item.category || !['MATERIAL', 'EQUIPO_MENOR', 'EQUIPO_MAYOR'].includes(item.category)) {
    throw new Error(`[ResourceValidationError] [INVALID_CATEGORY]: Categoría inválida (${item.category})`);
  }
  if (!item.unit || typeof item.unit !== 'string' || item.unit.trim() === '') {
    throw new Error('[ResourceValidationError] [INVALID_UNIT]: unit es obligatoria');
  }
  if (typeof item.quantity !== 'number' || isNaN(item.quantity) || !isFinite(item.quantity) || item.quantity < 0) {
    throw new Error(`[ResourceValidationError] [INVALID_QUANTITY]: Cantidad inválida (${item.quantity}). Debe ser un número >= 0`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Motor Determinístico de Cálculo de Consumo Físico y Recursos Operativos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evalúa el consumo físico verificado y la variación multirecurso de un WeeklyPlanItem.
 * Soporta de forma aditiva requiredResources opcionales.
 */
export function evaluateItemResourceConsumption(
  planItem: WeeklyPlanItem,
  executions: MinimalExecutionRecord[],
  requiredResources?: OperationalResourceItem[]
): ItemResourceConsumptionResult {
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const targetOccurrenceKey = planItem.occurrence_key || `${planItem.board_id}__${planItem.id}`;

  // 1. Filtrar ejecuciones por clave de agregación y estado de verificación operacional (ADR-0011)
  const validExecutions = executions.filter((e) => {
    // Coincidencia de agregación por occurrence_key o weekly_plan_item_id
    const matchesOccurrence =
      (e.occurrence_key && e.occurrence_key === planItem.occurrence_key) ||
      (e.weekly_plan_item_id && e.weekly_plan_item_id === planItem.id);

    if (!matchesOccurrence) return false;

    // Solo ejecuciones con verificación aceptada acumulan consumo verificado
    const statusNormalized = (e.verification_status || '').toLowerCase();
    const isVerified =
      statusNormalized === 'verified' ||
      statusNormalized === 'confirmed' ||
      statusNormalized === 'closed' ||
      e.status === 'confirmed' ||
      e.status === 'completed';

    return isVerified;
  });

  // 2. Acumular cantidades y jornales ejecutados verificados
  const executedQty = round2(validExecutions.reduce((sum, e) => sum + (e.executed_qty ?? 0), 0));
  const executedJr = round2(validExecutions.reduce((sum, e) => sum + (e.executed_jr ?? 0), 0));
  const theoreticalJr = round2(planItem.theoretical_jr ?? 0);
  const plannedQty = round2(planItem.planned_qty ?? 0);

  const deltaJr = round2(executedJr - theoreticalJr);

  // 3. Etapa 1: Estado de Cumplimiento de Alcance Físico
  const scopeComplianceStatus: ScopeComplianceStatus =
    executedQty >= plannedQty - 0.001 ? 'ALCANCE_COMPLETO' : 'SUBEJECUCION_ALCANCE';

  // 4. Etapa 2: Diagnóstico Físico de Consumo con Precedencia de Alcance
  let consumptionStatus: ConsumptionStatus;

  if (scopeComplianceStatus === 'SUBEJECUCION_ALCANCE') {
    // Prohibición Absoluta: La subejecución física NUNCA se clasifica como MENOR_CONSUMO_JR
    consumptionStatus = 'SUBEJECUCION_ALCANCE';
  } else {
    // ALCANCE_COMPLETO
    const excessOverload = Math.round((executedJr - theoreticalJr) * 1e6) / 1e6;
    if (excessOverload > 0.05) {
      consumptionStatus = 'EXCESO_CONSUMO_JR';
    } else if (excessOverload < -0.05) {
      consumptionStatus = 'MENOR_CONSUMO_JR'; // Eficiencia real en alcance completo
    } else {
      consumptionStatus = 'CONSUMO_BALANCEADO';
    }
  }

  // 5. Etapa 3: Evaluación de Variación Multirecurso (Materiales, Equipo Menor, Equipo Mayor)
  const reqList: OperationalResourceItem[] = [
    ...(requiredResources || []),
    ...((planItem as any).required_resources || []),
  ];

  // Validar requerimientos
  reqList.forEach(validateOperationalResourceItem);

  // Mapeo de recursos requeridos
  const resourceMap: Map<
    string,
    {
      resourceKey: string;
      resourceName: string;
      category: AdditionalResourceCategory;
      unit: string;
      requiredQty: number;
      usedQty: number;
    }
  > = new Map();

  for (const req of reqList) {
    resourceMap.set(req.resourceKey, {
      resourceKey: req.resourceKey,
      resourceName: req.resourceName,
      category: req.category,
      unit: req.unit,
      requiredQty: round2(req.quantity),
      usedQty: 0,
    });
  }

  // Acumular utilización real verificada desde ejecuciones válidas
  for (const exec of validExecutions) {
    if (exec.usedResources && Array.isArray(exec.usedResources)) {
      for (const used of exec.usedResources) {
        validateOperationalResourceItem(used);
        const existing = resourceMap.get(used.resourceKey);
        if (existing) {
          existing.usedQty = round2(existing.usedQty + (used.quantity || 0));
        } else {
          resourceMap.set(used.resourceKey, {
            resourceKey: used.resourceKey,
            resourceName: used.resourceName,
            category: used.category,
            unit: used.unit,
            requiredQty: 0,
            usedQty: round2(used.quantity || 0),
          });
        }
      }
    }
  }

  // Calcular variaciones y estados de desviación
  const resourcesVariance: ResourceVarianceDetail[] = Array.from(resourceMap.values()).map((r) => {
    const deltaQty = round2(r.usedQty - r.requiredQty);
    let varianceStatus: ResourceVarianceStatus;

    if (r.requiredQty === 0 && r.usedQty > 0) {
      varianceStatus = 'NO_PLANIFICADO_UTILIZADO';
    } else if (r.requiredQty > 0 && r.usedQty === 0) {
      varianceStatus = 'NO_UTILIZADO';
    } else if (scopeComplianceStatus === 'SUBEJECUCION_ALCANCE' && r.usedQty < r.requiredQty) {
      // Invariante de Precedencia de Alcance: Subejecución física nunca se cataloga como MENOR_UTILIZACION / ahorro
      varianceStatus = 'SUBEJECUCION_ALCANCE';
    } else if (deltaQty > 0.001) {
      varianceStatus = 'EXCESO_UTILIZACION';
    } else if (deltaQty < -0.001) {
      varianceStatus = 'MENOR_UTILIZACION';
    } else {
      varianceStatus = 'BALANCEADO';
    }

    return {
      resourceKey: r.resourceKey,
      resourceName: r.resourceName,
      category: r.category,
      unit: r.unit,
      requiredQty: r.requiredQty,
      usedQty: r.usedQty,
      deltaQty,
      varianceStatus,
    };
  });

  return {
    planItemId: planItem.id,
    occurrenceKey: targetOccurrenceKey,
    activityName: planItem.name,
    plannedDate: planItem.planned_date,
    plannedQty,
    executedQty,
    theoreticalJr,
    executedJr,
    deltaJr,
    scopeComplianceStatus,
    consumptionStatus,
    monetaryCostStatus: 'UNDETERMINED_MONETARY_COST',
    assignedCrewId: planItem.crew_id,
    assignedMachineryId: (planItem as any).machinery_id ?? null,
    verifiedExecutionsCount: validExecutions.length,
    resourcesVariance,
  };
}

/**
 * Consolida el análisis de consumo físico para un conjunto de ítems de plan semanal.
 */
export function calculateSiteResourceConsumption(
  planItems: WeeklyPlanItem[],
  executions: MinimalExecutionRecord[]
): SiteResourceConsumptionSummary {
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const itemResults = planItems.map((item) => evaluateItemResourceConsumption(item, executions));

  const completedScopeItemsCount = itemResults.filter(
    (r) => r.scopeComplianceStatus === 'ALCANCE_COMPLETO'
  ).length;
  const subexecutionScopeItemsCount = itemResults.filter(
    (r) => r.scopeComplianceStatus === 'SUBEJECUCION_ALCANCE'
  ).length;

  const totalTheoreticalJr = round2(itemResults.reduce((sum, r) => sum + r.theoreticalJr, 0));
  const totalExecutedJrVerified = round2(itemResults.reduce((sum, r) => sum + r.executedJr, 0));
  const overallDeltaJr = round2(totalExecutedJrVerified - totalTheoreticalJr);

  return {
    totalPlanItemsCount: planItems.length,
    completedScopeItemsCount,
    subexecutionScopeItemsCount,
    totalTheoreticalJr,
    totalExecutedJrVerified,
    overallDeltaJr,
    items: itemResults,
    monetaryCostStatus: 'UNDETERMINED_MONETARY_COST',
  };
}

