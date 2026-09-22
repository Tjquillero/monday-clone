/**
 * Servicio de Auditoría de Factibilidad Operacional del Cronograma Real (FASE 4 Hito 2)
 *
 * Axioma Rector:
 * DIAGNOSTICAR CONFLICTOS OPERACIONALES ≠ RESOLVER O AUTO-REPARAR CONFLICTOS
 *
 * Reglas de Gobierno y Contrato Congelado:
 * - R-AUDIT-01: Diagnóstico puro sobre P0 sin modificar asignaciones, metrados ni fechas.
 * - R-AUDIT-02: Inmutabilidad de la cadena F1-F3 y F4 Hito 1 (Hitos 1 a 7 congelados intactos).
 * - R-AUDIT-03: Categorización propia (FINITE_RESOURCE_DENSITY, SIMULTANEITY_OVERLAP, etc.)
 *               mapeada a HardConstraintType nativo de H4 sin alterar la taxonomía nativa.
 * - R-AUDIT-04: Severidad HARD_CONSTRAINT para todas las restricciones duras.
 * - R-AUDIT-05: Alcanzabilidad 1-step H6 aislada (DIRECTLY_MITIGABLE_BY_H6_ONE_STEP).
 *               CERO exploraciones multi-step, cero BFS/DFS, cero H7/H8 o solver.
 * - R-AUDIT-06: Determinismo absoluto de IDs y reporte.
 * - R-AUDIT-07: Sitio no resoluble mapeado a UNRESOLVED_SITE_CONTEXT.
 * - R-AUDIT-08: Cero recomendaciones de solución o planes ganadores.
 * - R-AUDIT-09: Respeto a calendario F3.1 (domingos/festivos ingresan como evidencia de conflicto).
 * - R-AUDIT-10: Cero auto-fix / Cero solver.
 */

import * as crypto from 'crypto';
import type { SiteResourceState } from './types';
import type { HardConstraintType, ScheduleCandidatePlan } from './decisionProblemTypes';
import { evaluateScheduleFeasibility } from './feasibilityEvaluator';
import { applyCandidateTransformation } from './candidateGenerator';
import type { CandidateTransformation } from './searchSpaceTypes';

export type OperationalConflictCategory =
  | 'FINITE_RESOURCE_DENSITY'
  | 'SIMULTANEITY_OVERLAP'
  | 'UNBOUND_OPERATOR_DEPENDENCY'
  | 'INVALID_WORKING_CALENDAR_DAY'
  | 'EXCEEDED_SITE_CAPACITY'
  | 'UNRESOLVED_SITE_CONTEXT';

export type OperationalConflictSeverity = 'HARD_CONSTRAINT' | 'SOFT_PREFERENCE';

export type TransformReachabilityStatus =
  | 'DIRECTLY_MITIGABLE_BY_H6_ONE_STEP'
  | 'NOT_DIRECTLY_MITIGABLE_BY_H6';

export interface OperationalAuditEntry {
  readonly auditEntryId: string;

  // 1. Violación (Categoría y Taxonomía Nativa H4)
  readonly violation: {
    readonly category: OperationalConflictCategory;
    readonly nativeConstraintCode: HardConstraintType;
    readonly severity: OperationalConflictSeverity;
  };

  // 2. Estado de Diagnóstico Operacional
  readonly diagnosticStatus: {
    readonly detected: boolean;
    readonly dateIso: string;
    readonly itemId: string;
    readonly allocationId: string;
    readonly siteGroupId: string;
    readonly siteName: string;
    readonly activityKey: string;
    readonly affectedResourceId: string;
    readonly description: string;
    readonly excessQuantity?: number;
  };

  // 3. Evaluación de Alcanzabilidad One-Step H6
  readonly reachability: {
    readonly status: TransformReachabilityStatus;
    readonly directlyApplicableTransformationsCount: number;
    readonly testedTransformationType?: string;
  };
}

export interface OperationalFeasibilityAuditReport {
  readonly sourcePlanId: string;
  readonly totalAllocationsEvaluated: number;
  readonly totalConflictsDetected: number;
  readonly feasibleAllocationsCount: number;
  readonly hardConstraintViolationsCount: number;
  readonly reachabilitySummary: {
    readonly directlyMitigableByH6Count: number;
    readonly notDirectlyMitigableCount: number;
  };
  readonly auditEntries: ReadonlyArray<OperationalAuditEntry>;
  readonly overallPlanStatus: 'FULLY_FEASIBLE' | 'PARTIALLY_FEASIBLE' | 'CRITICALLY_INFEASIBLE';
}

/**
 * Genera un ID de auditoría estable y determinista mediante hashing canónico.
 */
function generateAuditEntryId(
  itemId: string,
  allocationId: string,
  category: string,
  dateIso: string
): string {
  const payload = `${itemId}_${allocationId}_${category}_${dateIso}`;
  const hash = crypto.createHash('sha256').update(payload).digest('hex').substring(0, 12);
  return `audit_${hash}`;
}

/**
 * Mapea la restricción nativa de H4 a la categoría propia del reporte de auditoría operacional.
 */
function mapH4ConstraintToAuditCategory(
  nativeCode: HardConstraintType
): OperationalConflictCategory {
  switch (nativeCode) {
    case 'INEXISTENT_CATALOG_RESOURCE':
      return 'FINITE_RESOURCE_DENSITY';
    case 'SIMULTANEITY_TEMPORAL_COLLISION':
    case 'CARDINALITY_DUPLICATION':
      return 'SIMULTANEITY_OVERLAP';
    case 'UNBOUND_OPERATOR_DEPENDENCY':
      return 'UNBOUND_OPERATOR_DEPENDENCY';
    case 'INVALID_WORKING_CALENDAR_DAY':
      return 'INVALID_WORKING_CALENDAR_DAY';
    case 'UNDETERMINED_RESOURCE_CONTEXT':
      return 'UNRESOLVED_SITE_CONTEXT';
    case 'CONTRACTUAL_QUANTITY_MISMATCH':
    default:
      return 'FINITE_RESOURCE_DENSITY';
  }
}

/**
 * Calcula la fecha hábil inmediatamente posterior (1 paso hábil F3.1).
 */
function getNextWorkingDayIso(dateIso: string, holidaysList: string[]): string {
  let current = new Date(`${dateIso}T00:00:00Z`);
  for (let i = 0; i < 7; i++) {
    current.setUTCDate(current.getUTCDate() + 1);
    const nextIso = current.toISOString().substring(0, 10);
    const dayOfWeek = current.getUTCDay();
    if (dayOfWeek !== 0 && !holidaysList.includes(nextIso)) {
      return nextIso;
    }
  }
  return dateIso;
}

/**
 * Evalúa en 1 único paso consultivo si existe una transformación T in H6 que mitiga directamente el conflicto.
 * CERO búsquedas multi-step, cero BFS/DFS, cero H7 exploration loops.
 */
function evaluateOneStepH6Reachability(
  candidateP0: ScheduleCandidatePlan,
  allocationId: string,
  category: OperationalConflictCategory,
  catalog: SiteResourceState[],
  holidaysList: string[]
): {
  status: TransformReachabilityStatus;
  count: number;
  testedType?: string;
} {
  const targetAlloc = candidateP0.allocations.find((a) => a.allocationId === allocationId);
  if (!targetAlloc) {
    return { status: 'NOT_DIRECTLY_MITIGABLE_BY_H6', count: 0 };
  }

  let candidateTransformation: CandidateTransformation | null = null;

  if (category === 'INVALID_WORKING_CALENDAR_DAY' || category === 'SIMULTANEITY_OVERLAP') {
    const nextDateIso = getNextWorkingDayIso(targetAlloc.interval.dateIso, holidaysList);
    if (nextDateIso !== targetAlloc.interval.dateIso) {
      candidateTransformation = {
        transformationId: `trans_shift_${targetAlloc.allocationId}`,
        transformationType: 'SHIFT_TIME_INTERVAL',
        allocationId: targetAlloc.allocationId,
        shiftParams: {
          newInterval: {
            ...targetAlloc.interval,
            dateIso: nextDateIso,
          },
        },
      };
    }
  } else if (category === 'UNBOUND_OPERATOR_DEPENDENCY') {
    const siteState = catalog.find((s) => s.siteGroupId === targetAlloc.siteGroupId);
    const reqRole = targetAlloc.machineryOperatorBinding?.requiredRole || 'OPERARIO';
    const eligiblePerson = siteState?.persons.find((p) => p.isAvailable && p.role === reqRole);

    if (eligiblePerson) {
      candidateTransformation = {
        transformationId: `trans_bind_${targetAlloc.allocationId}`,
        transformationType: 'BIND_OPERATOR_DEPENDENCY',
        allocationId: targetAlloc.allocationId,
        bindParams: {
          operatorAllocationId: targetAlloc.allocationId,
          operatorId: eligiblePerson.id,
        },
      };
    }
  } else if (category === 'FINITE_RESOURCE_DENSITY') {
    const siteState = catalog.find((s) => s.siteGroupId === targetAlloc.siteGroupId);
    const equivalentResource = siteState?.machinery.find((m) => m.id !== targetAlloc.resourceId && m.isAvailable) ||
      siteState?.persons.find((p) => p.id !== targetAlloc.resourceId && p.isAvailable);

    if (equivalentResource) {
      candidateTransformation = {
        transformationId: `trans_reassign_${targetAlloc.allocationId}`,
        transformationType: 'REASSIGN_RESOURCE_EQUI_ROLE',
        allocationId: targetAlloc.allocationId,
        reassignParams: {
          newResourceId: equivalentResource.id,
          newResourceCodeOrName: 'code' in equivalentResource && equivalentResource.code ? equivalentResource.code : equivalentResource.name,
        },
      };
    }
  }

  if (!candidateTransformation) {
    return { status: 'NOT_DIRECTLY_MITIGABLE_BY_H6', count: 0 };
  }

  // Aplicación consultiva aislada 1:1 H6
  const transformResult = applyCandidateTransformation(
    candidateP0,
    candidateTransformation,
    catalog,
    holidaysList
  );

  if (!transformResult.success || !transformResult.derivedCandidate) {
    return { status: 'NOT_DIRECTLY_MITIGABLE_BY_H6', count: 0, testedType: candidateTransformation.transformationType };
  }

  // Evaluación consultiva aislada H4 sobre el plan derivado en 1 paso
  const feasibilityResultDerived = evaluateScheduleFeasibility(
    transformResult.derivedCandidate,
    catalog
  );

  const hasSameViolation = feasibilityResultDerived.violations.some(
    (v) => v.allocationId === allocationId
  );

  if (!hasSameViolation) {
    return {
      status: 'DIRECTLY_MITIGABLE_BY_H6_ONE_STEP',
      count: 1,
      testedType: candidateTransformation.transformationType,
    };
  }

  return {
    status: 'NOT_DIRECTLY_MITIGABLE_BY_H6',
    count: 0,
    testedType: candidateTransformation.transformationType,
  };
}

/**
 * Función Pura Principal: Genera la Matriz de Auditoría y Diagnóstico de Factibilidad Operacional.
 * Consume P0 real e H1->H7 de forma determinista y 100% inmutable.
 */
export function auditOperationalFeasibility(
  candidateP0: ScheduleCandidatePlan,
  catalog: SiteResourceState[],
  holidaysList: string[] = []
): OperationalFeasibilityAuditReport {
  // 1. Invocación al Evaluador Consultivo H4 sobre P0 intacto
  const feasibilityP0 = evaluateScheduleFeasibility(candidateP0, catalog);

  const auditEntries: OperationalAuditEntry[] = [];
  const affectedAllocationIds = new Set<string>();

  // Map existing H4 violations to prevent duplicates
  const processedViolationsKeys = new Set<string>();

  // 2. Procesar Violaciones Directas de H4
  for (const viol of feasibilityP0.violations) {
    const category = mapH4ConstraintToAuditCategory(viol.constraintType);
    const alloc = candidateP0.allocations.find((a) => a.allocationId === viol.allocationId);

    const itemId = alloc?.activityKey ? `act_${alloc.siteGroupId}_${alloc.activityKey}` : viol.allocationId;
    const allocationId = viol.allocationId;
    const dateIso = alloc?.interval?.dateIso || 'UNKNOWN_DATE';
    const siteGroupId = alloc?.siteGroupId || 'UNMAPPED_SITE';
    const siteName = alloc?.siteName || 'Sitio No Especificado';
    const activityKey = alloc?.activityKey || 'UNKNOWN_ACTIVITY';
    const affectedResourceId = viol.resourceId || alloc?.resourceId || 'UNKNOWN_RESOURCE';

    const key = `${allocationId}_${category}_${dateIso}`;
    processedViolationsKeys.add(key);

    const auditEntryId = generateAuditEntryId(itemId, allocationId, category, dateIso);

    affectedAllocationIds.add(allocationId);

    const reachabilityEval = evaluateOneStepH6Reachability(
      candidateP0,
      allocationId,
      category,
      catalog,
      holidaysList
    );

    auditEntries.push({
      auditEntryId,
      violation: {
        category,
        nativeConstraintCode: viol.constraintType,
        severity: 'HARD_CONSTRAINT',
      },
      diagnosticStatus: {
        detected: true,
        dateIso,
        itemId,
        allocationId,
        siteGroupId,
        siteName,
        activityKey,
        affectedResourceId,
        description: viol.reason,
      },
      reachability: {
        status: reachabilityEval.status,
        directlyApplicableTransformationsCount: reachabilityEval.count,
        testedTransformationType: reachabilityEval.testedType,
      },
    });
  }

  // 3. Auditoría de Calendario Laboral F3.1 (Domingos y Festivos)
  for (const alloc of candidateP0.allocations) {
    if (!alloc.interval || !alloc.interval.dateIso) continue;

    const dateIso = alloc.interval.dateIso;
    const dateObj = new Date(`${dateIso}T00:00:00Z`);
    const isSunday = dateObj.getUTCDay() === 0;
    const isHoliday = holidaysList.includes(dateIso);

    if (isSunday || isHoliday) {
      const category: OperationalConflictCategory = 'INVALID_WORKING_CALENDAR_DAY';
      const key = `${alloc.allocationId}_${category}_${dateIso}`;

      if (!processedViolationsKeys.has(key)) {
        processedViolationsKeys.add(key);

        const itemId = `act_${alloc.siteGroupId}_${alloc.activityKey}`;
        const auditEntryId = generateAuditEntryId(itemId, alloc.allocationId, category, dateIso);

        affectedAllocationIds.add(alloc.allocationId);

        const reachabilityEval = evaluateOneStepH6Reachability(
          candidateP0,
          alloc.allocationId,
          category,
          catalog,
          holidaysList
        );

        auditEntries.push({
          auditEntryId,
          violation: {
            category,
            nativeConstraintCode: 'INVALID_WORKING_CALENDAR_DAY',
            severity: 'HARD_CONSTRAINT',
          },
          diagnosticStatus: {
            detected: true,
            dateIso,
            itemId,
            allocationId: alloc.allocationId,
            siteGroupId: alloc.siteGroupId,
            siteName: alloc.siteName,
            activityKey: alloc.activityKey,
            affectedResourceId: alloc.resourceId,
            description: `La asignación "${alloc.allocationId}" está programada en ${isSunday ? 'Domingo' : 'Festivo'} ("${dateIso}"), día no hábil según el calendario F3.1.`,
          },
          reachability: {
            status: reachabilityEval.status,
            directlyApplicableTransformationsCount: reachabilityEval.count,
            testedTransformationType: reachabilityEval.testedType,
          },
        });
      }
    }
  }

  // 4. Auditoría de Capacidad Operacional Diaria por Sitio (EXCEEDED_SITE_CAPACITY)
  const siteDailyDemand = new Map<string, Map<string, number>>();

  for (const alloc of candidateP0.allocations) {
    const siteId = alloc.siteGroupId;
    const dateIso = alloc.interval.dateIso;
    if (!siteDailyDemand.has(siteId)) {
      siteDailyDemand.set(siteId, new Map());
    }
    const dateMap = siteDailyDemand.get(siteId)!;
    const currentDemand = dateMap.get(dateIso) || 0;
    dateMap.set(dateIso, currentDemand + (alloc.jornales || alloc.quantity || 1));
  }

  for (const [siteGroupId, dateMap] of siteDailyDemand.entries()) {
    const siteState = catalog.find((s) => s.siteGroupId === siteGroupId);
    if (!siteState) continue;

    const capacityMax = siteState.totalAvailablePersonsCount || siteState.persons.length;

    for (const [dateIso, totalDemand] of dateMap.entries()) {
      const excess = totalDemand - capacityMax;
      if (excess > 1e-6) {
        const allocsAtDate = candidateP0.allocations.filter(
          (a) => a.siteGroupId === siteGroupId && a.interval.dateIso === dateIso
        );

        const sampleAlloc = allocsAtDate[0];
        const allocationId = sampleAlloc ? sampleAlloc.allocationId : `site_${siteGroupId}_${dateIso}`;
        const itemId = sampleAlloc ? `act_${siteGroupId}_${sampleAlloc.activityKey}` : `site_${siteGroupId}`;

        const auditEntryId = generateAuditEntryId(itemId, allocationId, 'EXCEEDED_SITE_CAPACITY', dateIso);

        affectedAllocationIds.add(allocationId);

        auditEntries.push({
          auditEntryId,
          violation: {
            category: 'EXCEEDED_SITE_CAPACITY',
            nativeConstraintCode: 'SIMULTANEITY_TEMPORAL_COLLISION',
            severity: 'HARD_CONSTRAINT',
          },
          diagnosticStatus: {
            detected: true,
            dateIso,
            itemId,
            allocationId,
            siteGroupId,
            siteName: siteState.siteName,
            activityKey: sampleAlloc?.activityKey || 'VARIOUS_ACTIVITIES',
            affectedResourceId: `SITE_CAPACITY_${siteGroupId}`,
            description: `Exceso de capacidad operacional en el sitio "${siteState.siteName}": Demanda=${totalDemand} jornales vs Capacidad Máxima=${capacityMax} (Exceso=${excess}).`,
            excessQuantity: excess,
          },
          reachability: {
            status: 'NOT_DIRECTLY_MITIGABLE_BY_H6',
            directlyApplicableTransformationsCount: 0,
          },
        });
      }
    }
  }

  // Orden canónico determinista de audit entries por auditEntryId
  auditEntries.sort((a, b) => a.auditEntryId.localeCompare(b.auditEntryId));

  // 5. Métricas y Consolidación del Reporte
  const totalAllocationsEvaluated = candidateP0.allocations.length;
  const totalConflictsDetected = auditEntries.length;
  const hardConstraintViolationsCount = auditEntries.filter(
    (e) => e.violation.severity === 'HARD_CONSTRAINT'
  ).length;

  const directlyMitigableCount = auditEntries.filter(
    (e) => e.reachability.status === 'DIRECTLY_MITIGABLE_BY_H6_ONE_STEP'
  ).length;
  const notDirectlyMitigableCount = totalConflictsDetected - directlyMitigableCount;

  const feasibleAllocationsCount = Math.max(
    0,
    totalAllocationsEvaluated - affectedAllocationIds.size
  );

  let overallPlanStatus: OperationalFeasibilityAuditReport['overallPlanStatus'] = 'FULLY_FEASIBLE';
  if (totalConflictsDetected > 0) {
    overallPlanStatus = feasibleAllocationsCount > 0 ? 'PARTIALLY_FEASIBLE' : 'CRITICALLY_INFEASIBLE';
  }

  return {
    sourcePlanId: candidateP0.candidateId,
    totalAllocationsEvaluated,
    totalConflictsDetected,
    feasibleAllocationsCount,
    hardConstraintViolationsCount,
    reachabilitySummary: {
      directlyMitigableByH6Count: directlyMitigableCount,
      notDirectlyMitigableCount: notDirectlyMitigableCount,
    },
    auditEntries,
    overallPlanStatus,
  };
}
