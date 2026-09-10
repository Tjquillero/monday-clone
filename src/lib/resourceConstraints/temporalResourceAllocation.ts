/**
 * Modelo y Validador Puro de Asignaciones Temporales de Recursos (FASE 3 Hito 3)
 *
 * Principio Rector Congelado:
 * ASIGNAR != OPTIMIZAR != PROGRAMAR
 *
 * Invariantes Rectoras:
 * - R-ALLOC-01: Identidad estable (resourceId y resourceType estables).
 * - R-ALLOC-02: Asignación temporal explícita en franja [start, end).
 * - R-ALLOC-03: Demanda -> Recurso (separación estricta entre demanda y asignación).
 * - R-ALLOC-04: Dependencias de maquinaria expresadas explícitamente (no auto-resueltas).
 * - R-ALLOC-05: No mutación de fuentes de verdad o capacidades.
 * - R-ALLOC-06: Trazabilidad completa (origin, K:AOA).
 * - R-ALLOC-07: Multi-recurso por actividad.
 * - R-ALLOC-08: Prevención de asignación duplicada por cardinalidad.
 * - R-ALLOC-09: Consumo de restricciones de Hito 2 sin redefinir reglas temporales.
 * - R-ALLOC-10: Determinismo absoluto.
 * - R-ALLOC-11: Inmutabilidad (funciones puras, 0 métodos mutadores).
 * - R-ALLOC-12: Cero persistencia sobre el núcleo congelado.
 * - R-ALLOC-13: Soberanía de asignación (demostración explícita de validez y dependencias).
 */

import type {
  ResourceDemandAllocation,
  ResourceTemporalAllocation,
  MachineryOperatorBinding,
  AllocationTemporalValidationResult,
  AllocationValidationIssue,
  AllocationSovereigntySummary,
  SiteResourceState,
  FinitePerson,
  FiniteCrew,
  FiniteMachinery,
  ResourceTimeInterval,
} from './types';
import {
  validateResourceSimultaneityConstraints,
  intervalsOverlap,
} from './simultaneityConstraints';

/**
 * Constructor Puro: Vincula una demanda de actividad con un recurso del catálogo (R-ALLOC-03).
 * No realiza búsquedas heurísticas ni reprogramación.
 */
export function buildResourceTemporalAllocation(
  demand: ResourceDemandAllocation,
  resource: FinitePerson | FiniteCrew | FiniteMachinery,
  customInterval?: ResourceTimeInterval
): ResourceTemporalAllocation {
  const resourceType =
    'role' in resource ? 'PERSON' : 'code' in resource && 'memberIds' in resource ? 'CREW' : 'MACHINERY';

  const interval = customInterval || demand.interval;

  let machineryOperatorBinding: MachineryOperatorBinding | undefined;

  if (resourceType === 'MACHINERY') {
    const mach = resource as FiniteMachinery;
    if (mach.operatorRequirement) {
      machineryOperatorBinding = {
        machineryAllocationId: `alloc_mach_${demand.allocationId}_${mach.id}`,
        machineryId: mach.id,
        operatorAllocationId: null,
        operatorId: null,
        requiredRole: mach.operatorRequirement.requiredRole,
        isSatisfied: false,
      };
    }
  }

  const allocationId = `alloc_${demand.allocationId}_${resource.id}`;

  return {
    allocationId,
    demandId: demand.allocationId,
    siteGroupId: demand.siteGroupId,
    siteName: demand.siteName,
    activityKey: demand.activityKey,
    activityDescription: demand.activityDescription,
    resourceId: resource.id,
    resourceType,
    resourceCodeOrName: 'code' in resource && resource.code ? resource.code : resource.name,
    interval: { ...interval },
    quantity: demand.quantity,
    jornales: demand.jornales,
    machineryOperatorBinding,
    contractualReference: `REF_POA_${demand.siteGroupId}_${demand.activityKey}`,
    origin: demand.origin ? { ...demand.origin } : undefined,
  };
}

/**
 * Función Pura: Expresa la vinculación explícita de un operador a una asignación de maquinaria (R-ALLOC-04).
 * No busca operadores automáticamente.
 */
export function bindMachineryOperatorAllocation(
  machineryAllocation: ResourceTemporalAllocation,
  operatorAllocation: ResourceTemporalAllocation | null
): ResourceTemporalAllocation {
  if (machineryAllocation.resourceType !== 'MACHINERY' || !machineryAllocation.machineryOperatorBinding) {
    return machineryAllocation;
  }

  const currentBinding = machineryAllocation.machineryOperatorBinding;

  if (!operatorAllocation) {
    return {
      ...machineryAllocation,
      machineryOperatorBinding: {
        ...currentBinding,
        operatorAllocationId: null,
        operatorId: null,
        isSatisfied: false,
      },
    };
  }

  const isSatisfied = operatorAllocation.resourceType === 'PERSON';

  return {
    ...machineryAllocation,
    machineryOperatorBinding: {
      ...currentBinding,
      operatorAllocationId: operatorAllocation.allocationId,
      operatorId: operatorAllocation.resourceId,
      isSatisfied,
    },
  };
}

/**
 * Validador Puro: Valida las asignaciones temporales de recursos verificando las invariantes R-ALLOC-01 a R-ALLOC-13.
 * Delega la verificación de colisiones temporales al motor de Hito 2 (R-ALLOC-09).
 */
export function validateResourceTemporalAllocations(
  allocations: ResourceTemporalAllocation[],
  catalog: SiteResourceState[]
): AllocationTemporalValidationResult {
  const issues: AllocationValidationIssue[] = [];

  const catalogResourceIds = new Set<string>();
  catalog.forEach((site) => {
    site.persons.forEach((p) => catalogResourceIds.add(p.id));
    site.crews.forEach((c) => catalogResourceIds.add(c.id));
    site.machinery.forEach((m) => catalogResourceIds.add(m.id));
  });

  let satisfiedDependenciesCount = 0;
  let unsatisfiedDependenciesCount = 0;

  // 1. Validar Identidades Estables, Franjas Temporales y Dependencias
  allocations.forEach((alloc) => {
    // R-ALLOC-01: Identidad estable
    if (!alloc.resourceId || alloc.resourceId.trim() === '') {
      issues.push({
        id: `issue_no_identity_${alloc.allocationId}`,
        issueType: 'MISSING_STABLE_IDENTITY',
        allocationId: alloc.allocationId,
        resourceId: alloc.resourceId || 'UNKNOWN',
        reason: `La asignación "${alloc.allocationId}" carece de un resourceId estable.`,
      });
    }

    // R-ALLOC-02: Franja temporal explícita [start, end)
    if (!alloc.interval || !alloc.interval.dateIso) {
      issues.push({
        id: `issue_no_interval_${alloc.allocationId}`,
        issueType: 'MISSING_TIME_INTERVAL',
        allocationId: alloc.allocationId,
        resourceId: alloc.resourceId,
        reason: `La asignación "${alloc.allocationId}" del recurso "${alloc.resourceCodeOrName}" no posee un intervalo temporal válido.`,
      });
    }

    // Registro en catálogo
    if (alloc.resourceId && !catalogResourceIds.has(alloc.resourceId)) {
      issues.push({
        id: `issue_not_in_catalog_${alloc.allocationId}`,
        issueType: 'CATALOG_RESOURCE_NOT_FOUND',
        allocationId: alloc.allocationId,
        resourceId: alloc.resourceId,
        reason: `El recurso "${alloc.resourceCodeOrName}" (ID: ${alloc.resourceId}) asignado no existe en el catálogo de recursos activos.`,
      });
    }

    // R-ALLOC-04: Dependencia de operador en maquinaria
    if (alloc.resourceType === 'MACHINERY' && alloc.machineryOperatorBinding) {
      if (alloc.machineryOperatorBinding.isSatisfied) {
        satisfiedDependenciesCount++;
      } else {
        unsatisfiedDependenciesCount++;
        issues.push({
          id: `issue_unbound_op_${alloc.allocationId}`,
          issueType: 'UNBOUND_OPERATOR_DEPENDENCY',
          allocationId: alloc.allocationId,
          resourceId: alloc.resourceId,
          reason: `La maquinaria "${alloc.resourceCodeOrName}" (ID: ${alloc.resourceId}) requiere un operador de rol "${alloc.machineryOperatorBinding.requiredRole}" pero la dependencia no está vinculada.`,
        });
      }
    }
  });

  // 2. R-ALLOC-08: Regla de Cardinalidad
  for (let i = 0; i < allocations.length; i++) {
    for (let j = i + 1; j < allocations.length; j++) {
      const allocA = allocations[i];
      const allocB = allocations[j];

      if (
        allocA.demandId === allocB.demandId &&
        allocA.resourceId === allocB.resourceId &&
        intervalsOverlap(allocA.interval, allocB.interval).overlaps
      ) {
        issues.push({
          id: `issue_duplication_${allocA.allocationId}_${allocB.allocationId}`,
          issueType: 'CARDINALITY_DUPLICATION',
          allocationId: allocB.allocationId,
          resourceId: allocB.resourceId,
          reason: `Duplicación de asignación por cardinalidad: El recurso "${allocA.resourceCodeOrName}" (ID: ${allocA.resourceId}) fue asignado dos veces a la misma demanda "${allocA.demandId}" en el mismo intervalo.`,
        });
      }
    }
  }

  // 3. R-ALLOC-09: Consumir validador de Hito 2
  const demandsToVerify: ResourceDemandAllocation[] = allocations.map((a) => ({
    allocationId: a.allocationId,
    siteGroupId: a.siteGroupId,
    siteName: a.siteName,
    activityKey: a.activityKey,
    activityDescription: a.activityDescription,
    resourceType: a.resourceType,
    resourceId: a.resourceId,
    resourceCodeOrName: a.resourceCodeOrName,
    interval: a.interval,
    quantity: a.quantity,
    jornales: a.jornales,
  }));

  const simultaneityValidation = validateResourceSimultaneityConstraints(demandsToVerify, catalog);

  if (!simultaneityValidation.isValid) {
    simultaneityValidation.conflicts.forEach((conflict) => {
      issues.push({
        id: `issue_hito2_${conflict.id}`,
        issueType: 'SIMULTANITY_COLLISION_HITO2',
        allocationId: conflict.allocationA.allocationId,
        resourceId: conflict.resourceId,
        reason: `Conflicto temporal Hito 2 [${conflict.conflictType}]: ${conflict.reason}`,
      });
    });
  }

  // 4. R-ALLOC-13: Resumen de Soberanía
  const totalAllocations = allocations.length;
  const invalidAllocationsCount = issues.length;
  const validAllocationsCount = invalidAllocationsCount === 0 ? totalAllocations : Math.max(0, totalAllocations - issues.length);

  const sovereigntySummary: AllocationSovereigntySummary = {
    totalAllocations,
    validAllocationsCount,
    invalidAllocationsCount,
    satisfiedDependenciesCount,
    unsatisfiedDependenciesCount,
    simultaneityConflictsCount: simultaneityValidation.conflictsCount,
  };

  const isValid = issues.length === 0 && simultaneityValidation.isValid;

  return {
    isValid,
    totalAllocationsEvaluated: totalAllocations,
    issuesCount: issues.length,
    issues,
    simultaneityValidation,
    sovereigntySummary,
  };
}
