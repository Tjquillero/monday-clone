/**
 * Evaluador Puro de Factibilidad del Problema de Decisión (FASE 3 Hito 4)
 *
 * Principio Rector Congelado:
 * DEFINIR EL PROBLEMA != RESOLVER EL PROBLEMA
 *
 * Reglas de Gobierno:
 * - Evalúa un Plan Candidato de entrada y retorna su factibilidad formal (FEASIBLE / INFEASIBLE / UNDETERMINED).
 * - CERO generación, modificación, búsqueda o recomendación de candidatos alternativos.
 * - CERO algoritmos de optimización, heurísticas, parches automáticos o reprogramación.
 * - CERO mutaciones sobre fuentes de verdad o capas congeladas.
 */

import type { SiteResourceState } from './types';
import type {
  ScheduleCandidatePlan,
  ScheduleFeasibilityResult,
  ConstraintViolation,
  FeasibilityLayerStatus,
  FeasibilityStatus,
} from './decisionProblemTypes';
import { validateResourceSimultaneityConstraints } from './simultaneityConstraints';

/**
 * Función Pura: Evalúa formalmente la factibilidad de un Plan Candidato (R-DEC-03).
 *
 * Clasifica violaciones en tres capas:
 * 1. Estructural: Identidades estables y presencia en catálogo de recursos.
 * 2. Temporal: Franjas [start, end), calendario laboral y colisiones de simultaneidad (Hito 2).
 * 3. Operacional: Satisfacción explícita de dependencias de maquinaria y conservación de cantidades.
 *
 * Retorna tres estados conceptuales: FEASIBLE, INFEASIBLE o UNDETERMINED.
 */
export function evaluateScheduleFeasibility(
  candidate: ScheduleCandidatePlan,
  catalog: SiteResourceState[]
): ScheduleFeasibilityResult {
  const violations: ConstraintViolation[] = [];
  let undeterminedCount = 0;

  let structuralIssuesCount = 0;
  let temporalIssuesCount = 0;
  let operationalIssuesCount = 0;

  // Mapa de identidades estables del catálogo Hito 1 (R-DEC-05)
  const catalogResourceIds = new Set<string>();
  catalog.forEach((site) => {
    site.persons.forEach((p) => catalogResourceIds.add(p.id));
    site.crews.forEach((c) => catalogResourceIds.add(c.id));
    site.machinery.forEach((m) => catalogResourceIds.add(m.id));
  });

  const isCatalogEmpty = catalog.length === 0;

  // 1. Evaluación Estructural (Identidades estables, catálogo, duplicidad)
  candidate.allocations.forEach((alloc) => {
    // R-DEC-05: Identidad estable del recurso
    if (!alloc.resourceId || alloc.resourceId.trim() === '') {
      structuralIssuesCount++;
      violations.push({
        id: `viol_struct_identity_${alloc.allocationId}`,
        constraintType: 'INEXISTENT_CATALOG_RESOURCE',
        allocationId: alloc.allocationId,
        resourceId: alloc.resourceId || 'UNKNOWN',
        layer: 'STRUCTURAL',
        reason: `La asignación "${alloc.allocationId}" carece de un resourceId estable.`,
      });
    } else if (isCatalogEmpty) {
      // Estado UNDETERMINED: Si el catálogo está incompleto o ausente
      undeterminedCount++;
      structuralIssuesCount++;
      violations.push({
        id: `viol_struct_undet_${alloc.allocationId}`,
        constraintType: 'UNDETERMINED_RESOURCE_CONTEXT',
        allocationId: alloc.allocationId,
        resourceId: alloc.resourceId,
        layer: 'STRUCTURAL',
        reason: `El contexto de catálogo se encuentra ausente o indeterminado para verificar el recurso "${alloc.resourceId}".`,
      });
    } else if (!catalogResourceIds.has(alloc.resourceId)) {
      structuralIssuesCount++;
      violations.push({
        id: `viol_struct_catalog_${alloc.allocationId}`,
        constraintType: 'INEXISTENT_CATALOG_RESOURCE',
        allocationId: alloc.allocationId,
        resourceId: alloc.resourceId,
        layer: 'STRUCTURAL',
        reason: `El recurso "${alloc.resourceCodeOrName}" (ID: ${alloc.resourceId}) no existe en el catálogo activo.`,
      });
    }

    // R-DEC-02 & R-ALLOC-02: Intervalo temporal explícito
    if (!alloc.interval || !alloc.interval.dateIso) {
      temporalIssuesCount++;
      violations.push({
        id: `viol_temp_no_interval_${alloc.allocationId}`,
        constraintType: 'INVALID_WORKING_CALENDAR_DAY',
        allocationId: alloc.allocationId,
        resourceId: alloc.resourceId,
        layer: 'TEMPORAL',
        reason: `La asignación "${alloc.allocationId}" no posee una franja temporal explícita con dateIso.`,
      });
    }

    // R-DEC-07: Dependencia de operador en maquinaria
    if (alloc.resourceType === 'MACHINERY' && alloc.machineryOperatorBinding) {
      if (!alloc.machineryOperatorBinding.isSatisfied) {
        operationalIssuesCount++;
        violations.push({
          id: `viol_op_unbound_${alloc.allocationId}`,
          constraintType: 'UNBOUND_OPERATOR_DEPENDENCY',
          allocationId: alloc.allocationId,
          resourceId: alloc.resourceId,
          layer: 'OPERATIONAL',
          reason: `La maquinaria "${alloc.resourceCodeOrName}" (ID: ${alloc.resourceId}) requiere un operador con rol "${alloc.machineryOperatorBinding.requiredRole}" pero la dependencia no está satisfecha.`,
        });
      }
    }
  });

  // 2. R-DEC-01 & R-DEC-04: Conservación de Cantidades Contractuales (Soberanía POA)
  if (candidate.demands && candidate.demands.length > 0) {
    const totalDemandedQuantity = candidate.demands.reduce((sum, d) => sum + d.quantity, 0);
    const totalAllocatedQuantity = candidate.allocations.reduce((sum, a) => sum + a.quantity, 0);

    // Tolerancia numérica explícita (1e-4)
    if (Math.abs(totalDemandedQuantity - totalAllocatedQuantity) > 1e-4) {
      operationalIssuesCount++;
      violations.push({
        id: `viol_op_quantity_mismatch_${candidate.candidateId}`,
        constraintType: 'CONTRACTUAL_QUANTITY_MISMATCH',
        allocationId: candidate.candidateId,
        resourceId: 'CONTRACT_DEMAND',
        layer: 'OPERATIONAL',
        reason: `Discrepancia en la cantidad contractual: La demanda exige ${totalDemandedQuantity} pero el plan candidato asignó ${totalAllocatedQuantity}.`,
      });
    }
  }

  // 3. R-DEC-06: Consumir Motor de Simultaneidad del Hito 2 (Restricciones temporales duras)
  if (candidate.allocations.length > 0 && !isCatalogEmpty) {
    const demandsToVerify = candidate.allocations.map((a) => ({
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

    const simultaneityResult = validateResourceSimultaneityConstraints(demandsToVerify, catalog);

    if (!simultaneityResult.isValid) {
      simultaneityResult.conflicts.forEach((conflict) => {
        temporalIssuesCount++;
        violations.push({
          id: `viol_temp_simultaneity_${conflict.id}`,
          constraintType: 'SIMULTANEITY_TEMPORAL_COLLISION',
          allocationId: conflict.allocationA.allocationId,
          resourceId: conflict.resourceId,
          layer: 'TEMPORAL',
          reason: `Conflicto temporal de simultaneidad [Hito 2]: ${conflict.reason}`,
        });
      });
    }
  }

  // 4. Determinar Estado Rector de Factibilidad (FEASIBLE / INFEASIBLE / UNDETERMINED)
  let status: FeasibilityStatus = 'FEASIBLE';
  if (undeterminedCount > 0) {
    status = 'UNDETERMINED';
  } else if (violations.length > 0) {
    status = 'INFEASIBLE';
  }

  const layerStatus: FeasibilityLayerStatus = {
    structural: { isFeasible: structuralIssuesCount === 0, issuesCount: structuralIssuesCount },
    temporal: { isFeasible: temporalIssuesCount === 0, issuesCount: temporalIssuesCount },
    operational: { isFeasible: operationalIssuesCount === 0, issuesCount: operationalIssuesCount },
  };

  return {
    candidateId: candidate.candidateId,
    status,
    isFeasible: status === 'FEASIBLE',
    layerStatus,
    violationsCount: violations.length,
    violations,
    undeterminedCount,
    evaluatedAllocationsCount: candidate.allocations.length,
  };
}
