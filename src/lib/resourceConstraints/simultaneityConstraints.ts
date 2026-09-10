/**
 * Validador Puro de Restricciones de Simultaneidad y Exclusividad Temporal (FASE 3 Hito 2)
 *
 * Principio Rector Congelado:
 * VALIDAR CONFLICTO != RESOLVER CONFLICTO (0 auto-resolución, 0 mutación de datos).
 *
 * Invariantes Congeladas:
 * - R-RES-01: Exclusividad por resourceId estable (0 ocupaciones simultáneas).
 * - R-RES-02: Satisfacción de dependencias de maquinaria.
 * - R-RES-03: No sobreposición de operadores en el mismo intervalo.
 * - R-RES-04: Requerimientos multi-recurso por actividad.
 * - R-RES-05: Evaluación sobre intervalos semánticos [start, end) (inicio incluido, fin excluido).
 * - R-RES-06: Conflicto de simultaneidad != déficit de jornales.
 * - R-RES-07: Soberanía de validación actual (K:AOA no resuelve conflictos).
 * - R-RES-08: Validación pura sin mutación de input ni reescritura de datos.
 */

import type {
  ResourceTimeInterval,
  ResourceDemandAllocation,
  ResourceSimultaneityConflict,
  SimultaneityValidationResult,
  SiteResourceState,
  FinitePerson,
  FiniteMachinery,
  FiniteCrew,
} from './types';
import { evalMachineryEffectiveAvailability } from './finiteResourceCatalog';

/**
 * Evalúa la superposición de dos intervalos temporales con semántica [start, end) (R-RES-05).
 * Inicio incluido, fin excluido: [08:00, 10:00) y [10:00, 12:00) NO se solapan.
 */
export function intervalsOverlap(
  intA: ResourceTimeInterval,
  intB: ResourceTimeInterval
): { overlaps: boolean; overlapStart?: string; overlapEnd?: string } {
  // 1. Fechas distintas -> Cero conflicto
  if (intA.dateIso !== intB.dateIso) {
    return { overlaps: false };
  }

  // 2. Exclusividad diaria explícita en el mismo día -> Conflicto en todo el día
  if (intA.isDailyExclusive || intB.isDailyExclusive) {
    return {
      overlaps: true,
      overlapStart: `${intA.dateIso} T00:00`,
      overlapEnd: `${intA.dateIso} T23:59`,
    };
  }

  // 3. Si no hay horarios explícitos y no es exclusivo diariamente -> No asume simultaneidad por sólo coincidir fecha
  if (!intA.startTime || !intA.endTime || !intB.startTime || !intB.endTime) {
    return { overlaps: false };
  }

  // 4. Semántica [start, end)
  const startA = intA.startTime;
  const endA = intA.endTime;
  const startB = intB.startTime;
  const endB = intB.endTime;

  const overlapStart = startA > startB ? startA : startB;
  const overlapEnd = endA < endB ? endA : endB;

  // En semántica [start, end), hay solapamiento si overlapStart < overlapEnd
  if (overlapStart < overlapEnd) {
    return {
      overlaps: true,
      overlapStart: `${intA.dateIso} T${overlapStart}`,
      overlapEnd: `${intA.dateIso} T${overlapEnd}`,
    };
  }

  return { overlaps: false };
}

/**
 * Función Pura: Valida restricciones de simultaneidad y exclusividad temporal sobre demandas de recursos finitos.
 */
export function validateResourceSimultaneityConstraints(
  demands: ResourceDemandAllocation[],
  catalog: SiteResourceState[]
): SimultaneityValidationResult {
  const conflicts: ResourceSimultaneityConflict[] = [];

  // Aplanar inventario de personas, cuadrillas y maquinaria del catálogo
  const allPersons: FinitePerson[] = [];
  const allCrews: FiniteCrew[] = [];
  const allMachinery: FiniteMachinery[] = [];

  catalog.forEach((site) => {
    site.persons.forEach((p) => allPersons.push(p));
    site.crews.forEach((c) => allCrews.push(c));
    site.machinery.forEach((m) => allMachinery.push(m));
  });

  const resourceMap = new Map<string, { type: string; name: string }>();
  allPersons.forEach((p) => resourceMap.set(p.id, { type: 'PERSON', name: p.name }));
  allCrews.forEach((c) => resourceMap.set(c.id, { type: 'CREW', name: c.name }));
  allMachinery.forEach((m) => resourceMap.set(m.id, { type: 'MACHINERY', name: m.name }));

  let resourceOverlapCount = 0;
  let unsatisfiedDependencyCount = 0;
  let simultaneousLimitExceededCount = 0;
  let unresolvedResourceCount = 0;

  // 1. Validar Recursos Existentes en Catálogo vs No Resueltos
  demands.forEach((d) => {
    if (!resourceMap.has(d.resourceId)) {
      unresolvedResourceCount++;
      conflicts.push({
        id: `conflict_unresolved_${d.resourceId}_${d.allocationId}`,
        conflictType: 'UNRESOLVED_RESOURCE',
        resourceId: d.resourceId,
        allocationA: d,
        reason: `El recurso "${d.resourceCodeOrName}" (ID: ${d.resourceId}) solicitado para la actividad "${d.activityDescription}" no existe en el catálogo de recursos activos.`,
      });
    }
  });

  // 2. Validar Sobreposición Simultánea por resourceId estable (R-RES-01, R-RES-03, R-RES-05)
  // Agrupar demandas por resourceId
  const demandsByResource = new Map<string, ResourceDemandAllocation[]>();
  demands.forEach((d) => {
    const list = demandsByResource.get(d.resourceId) || [];
    list.push(d);
    demandsByResource.set(d.resourceId, list);
  });

  demandsByResource.forEach((resDemands, resId) => {
    if (resDemands.length < 2) return;

    for (let i = 0; i < resDemands.length; i++) {
      for (let j = i + 1; j < resDemands.length; j++) {
        const allocA = resDemands[i];
        const allocB = resDemands[j];

        const overlapResult = intervalsOverlap(allocA.interval, allocB.interval);
        if (overlapResult.overlaps) {
          resourceOverlapCount++;
          const resInfo = resourceMap.get(resId);
          const resName = resInfo ? resInfo.name : allocA.resourceCodeOrName;

          conflicts.push({
            id: `conflict_overlap_${resId}_${allocA.allocationId}_${allocB.allocationId}`,
            conflictType: 'RESOURCE_OVERLAP_COLLISION',
            resourceId: resId,
            conflictingResourceId: resId,
            allocationA: allocA,
            allocationB: allocB,
            overlapStart: overlapResult.overlapStart,
            overlapEnd: overlapResult.overlapEnd,
            reason: `Conflicto de sobreposición temporal: El recurso "${resName}" (ID: ${resId}) tiene dos asignaciones incompatibles simultáneas entre ${overlapResult.overlapStart} y ${overlapResult.overlapEnd} (Actividad A: "${allocA.activityDescription}" en ${allocA.siteName} vs Actividad B: "${allocB.activityDescription}" en ${allocB.siteName}).`,
          });
        }
      }
    }
  });

  // 3. Validar Dependencias de Maquinaria + Operador (R-RES-02 & R-FIN-05)
  demands.forEach((d) => {
    if (d.resourceType === 'MACHINERY') {
      const mach = allMachinery.find((m) => m.id === d.resourceId);
      if (mach) {
        const avail = evalMachineryEffectiveAvailability(mach, allPersons);
        if (avail.effectiveStatus === 'UNAVAILABLE_OPERATOR' || avail.effectiveStatus === 'UNAVAILABLE_MACHINE') {
          unsatisfiedDependencyCount++;
          conflicts.push({
            id: `conflict_dependency_${d.resourceId}_${d.allocationId}`,
            conflictType: 'UNSATISFIED_OPERATOR_DEPENDENCY',
            resourceId: d.resourceId,
            allocationA: d,
            reason: `Dependencia no satisfecha para maquinaria "${mach.code}" (${mach.name}): ${avail.reason}`,
          });
        }
      }
    }
  });

  // Ordenar conflictos determinísticamente
  conflicts.sort((a, b) => a.id.localeCompare(b.id));

  return {
    isValid: conflicts.length === 0,
    totalDemandsEvaluated: demands.length,
    conflictsCount: conflicts.length,
    conflicts,
    summary: {
      resourceOverlapCount,
      unsatisfiedDependencyCount,
      simultaneousLimitExceededCount,
      unresolvedResourceCount,
    },
  };
}
