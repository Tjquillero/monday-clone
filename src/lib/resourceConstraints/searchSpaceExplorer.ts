/**
 * Motor de Exploración del Espacio de Candidatos (FASE 3 Hito 7)
 *
 * Axiomas Rectores Fundantes:
 * - APLICAR TRANSFORMACIÓN (1:1) != BUSCAR / EXPLORAR CANDIDATOS
 * - EXPLORAR != EVALUAR != RESOLVER
 *
 * Invariantes Rectoras:
 * - R-SEARCH-01 a R-SEARCH-25: Especificados formalmente en implementation_plan.md.
 * - R-SEARCH-05: Determinismo absoluto. 0 Math.random(), 0 new Date() en trazabilidad o identidades.
 * - R-SEARCH-07: Aislamiento de la selección. Cero getBestPlan(), optimize(), score(), rank().
 * - R-SEARCH-13: Igualdad canónica pA === pB <=> canonicalSerialize(pA) === canonicalSerialize(pB).
 * - R-SEARCH-16: candidateId determinista "cand_" + hash.substring(0, 16).
 * - R-SEARCH-18: Orden canónico estricto en la expansión de transformaciones.
 * - R-SEARCH-22: Timestamp sintético ordinal determinista t0 + k * Δt.
 * - R-SEARCH-23: Preservación numérica sin truncamiento destructivo.
 * - R-SEARCH-24: Root P0 pertenece a VisitedStates desde t0. N_max = 1 solo permite P0.
 * - R-SEARCH-25: Selección determinista lexicográfica de fullTrace en convergencia de rutas.
 */

import { createHash } from 'crypto';
import type { SiteResourceState } from './types';
import type { ScheduleCandidatePlan } from './decisionProblemTypes';
import {
  applyCandidateTransformation,
} from './candidateGenerator';
import type {
  CandidateTransformation,
  CandidateStateFingerprint,
  CandidateNode,
  CandidateNodeTraceEntry,
  SearchExplorationLimits,
  ExploredSearchSpaceResult,
  ExploredSearchSpaceAdjacencyEntry,
  SearchSpaceTerminationStatus,
} from './searchSpaceTypes';
import {
  BASE_SYNTHETIC_TIMESTAMP_ISO,
  STEP_DELTA_MS,
} from './searchSpaceTypes';

/**
 * R-SEARCH-13 & R-SEARCH-15 & R-SEARCH-23: Serialización Canónica Determinista.
 * Produce la representación ontológica única e inmutable del estado físico del plan.
 */
export function canonicalSerialize(plan: ScheduleCandidatePlan): string {
  const normalizedAssignments = (plan.allocations || [])
    .map((alloc) => {
      const dateIso = alloc.interval.dateIso || '1970-01-01';
      const startTime = alloc.interval.startTime || '08:00';
      const endTime = alloc.interval.endTime || '17:00';
      
      const startUtc = new Date(`${dateIso}T${startTime}:00Z`).toISOString();
      const endUtc = new Date(`${dateIso}T${endTime}:00Z`).toISOString();

      return {
        itemId: alloc.demandId || alloc.activityKey || alloc.allocationId,
        allocationId: alloc.allocationId,
        siteGroupId: alloc.siteGroupId || null,
        activityKey: alloc.activityKey || null,
        startUtc,
        endUtc,
        resourceId: alloc.resourceId,
        resourceType: alloc.resourceType,
        operatorResourceId: alloc.machineryOperatorBinding?.operatorId || null,
        quantity: alloc.quantity != null ? Number(alloc.quantity.toFixed(6)) : null,
        jornales: alloc.jornales != null ? Number(alloc.jornales.toFixed(6)) : null,
      };
    })
    .sort((a, b) => {
      if (a.itemId !== b.itemId) return a.itemId.localeCompare(b.itemId);
      if (a.allocationId !== b.allocationId) return a.allocationId.localeCompare(b.allocationId);
      if (a.resourceId !== b.resourceId) return a.resourceId.localeCompare(b.resourceId);
      return (a.operatorResourceId || '').localeCompare(b.operatorResourceId || '');
    });

  return JSON.stringify({ assignments: normalizedAssignments });
}

/**
 * R-SEARCH-13: SHA-256 Fingerprint de Aceleración del estado canónico.
 */
export function canonicalStateHash(plan: ScheduleCandidatePlan): string {
  const canonicalStr = canonicalSerialize(plan);
  return createHash('sha256').update(canonicalStr, 'utf8').digest('hex');
}

/**
 * R-SEARCH-16: Candidate ID Determinista de 16 caracteres hexadecimales.
 */
export function generateDeterministicCandidateId(plan: ScheduleCandidatePlan): string {
  const hash = canonicalStateHash(plan);
  return `cand_${hash.substring(0, 16)}`;
}

/**
 * R-SEARCH-18: Ordenamiento Canónico Estricto de Transformaciones.
 * Garantiza reproducibilidad 100% en la secuencia de expansión.
 */
export function sortTransformationsCanonical(
  transformations: ReadonlyArray<CandidateTransformation>
): CandidateTransformation[] {
  return [...transformations].sort((a, b) => {
    if (a.transformationType !== b.transformationType) {
      return a.transformationType.localeCompare(b.transformationType);
    }
    if (a.allocationId !== b.allocationId) {
      return a.allocationId.localeCompare(b.allocationId);
    }
    const targetA = a.reassignParams?.newResourceId || a.bindParams?.operatorId || a.shiftParams?.newInterval.dateIso || '';
    const targetB = b.reassignParams?.newResourceId || b.bindParams?.operatorId || b.shiftParams?.newInterval.dateIso || '';
    if (targetA !== targetB) {
      return targetA.localeCompare(targetB);
    }
    const timeA = a.shiftParams?.newInterval.startTime || '';
    const timeB = b.shiftParams?.newInterval.startTime || '';
    return timeA.localeCompare(timeB);
  });
}

/**
 * R-SEARCH-22: Timestamp sintético ordinal determinista.
 */
export function getSyntheticTimestampIso(
  stepIndex: number,
  baseTimestamp = BASE_SYNTHETIC_TIMESTAMP_ISO
): string {
  const baseMs = new Date(baseTimestamp).getTime();
  return new Date(baseMs + stepIndex * STEP_DELTA_MS).toISOString();
}

/**
 * Generador de Transformaciones Declarativas Posibles (Frontera a 1 Paso)
 */
export function generatePossibleTransformations(
  candidate: ScheduleCandidatePlan,
  catalog: SiteResourceState[]
): CandidateTransformation[] {
  const rawTransformations: CandidateTransformation[] = [];

  for (const alloc of candidate.allocations) {
    const siteGroup = catalog.find((s) => s.siteGroupId === alloc.siteGroupId);
    if (!siteGroup) continue;

    // 1. REASSIGN_RESOURCE_EQUI_ROLE
    if (alloc.resourceType === 'PERSON') {
      const targetRole = siteGroup.persons.find((p) => p.id === alloc.resourceId)?.role;
      if (targetRole) {
        for (const altPerson of siteGroup.persons) {
          if (altPerson.id !== alloc.resourceId && altPerson.role === targetRole && altPerson.isAvailable) {
            rawTransformations.push({
              transformationId: `trans_reassign_${alloc.allocationId}_${altPerson.id}`,
              transformationType: 'REASSIGN_RESOURCE_EQUI_ROLE',
              allocationId: alloc.allocationId,
              reassignParams: {
                newResourceId: altPerson.id,
                newResourceCodeOrName: altPerson.name,
              },
            });
          }
        }
      }
    } else if (alloc.resourceType === 'MACHINERY') {
      const targetCategory = siteGroup.machinery.find((m) => m.id === alloc.resourceId)?.category;
      if (targetCategory) {
        for (const altMachine of siteGroup.machinery) {
          if (altMachine.id !== alloc.resourceId && altMachine.category === targetCategory && altMachine.isAvailable) {
            rawTransformations.push({
              transformationId: `trans_reassign_${alloc.allocationId}_${altMachine.id}`,
              transformationType: 'REASSIGN_RESOURCE_EQUI_ROLE',
              allocationId: alloc.allocationId,
              reassignParams: {
                newResourceId: altMachine.id,
                newResourceCodeOrName: altMachine.name,
              },
            });
          }
        }
      }
    }

    // 2. BIND_OPERATOR_DEPENDENCY
    if (alloc.resourceType === 'MACHINERY' && alloc.machineryOperatorBinding) {
      const reqRole = alloc.machineryOperatorBinding.requiredRole;
      for (const opPerson of siteGroup.persons) {
        if (opPerson.role === reqRole && opPerson.isAvailable && opPerson.id !== alloc.machineryOperatorBinding.operatorId) {
          rawTransformations.push({
            transformationId: `trans_bind_${alloc.allocationId}_${opPerson.id}`,
            transformationType: 'BIND_OPERATOR_DEPENDENCY',
            allocationId: alloc.allocationId,
            bindParams: {
              operatorAllocationId: alloc.machineryOperatorBinding.operatorAllocationId || `op_alloc_${alloc.allocationId}`,
              operatorId: opPerson.id,
            },
          });
        }
      }
    }

    // 3. SHIFT_TIME_INTERVAL (Frontera inmediata +1 día / -1 día)
    const currentDateIso = alloc.interval.dateIso;
    const dateObj = new Date(currentDateIso + 'T00:00:00Z');
    
    // Shift +1 día
    const datePlus1 = new Date(dateObj.getTime() + 86400000).toISOString().split('T')[0];
    rawTransformations.push({
      transformationId: `trans_shift_${alloc.allocationId}_+1d`,
      transformationType: 'SHIFT_TIME_INTERVAL',
      allocationId: alloc.allocationId,
      shiftParams: {
        newInterval: {
          ...alloc.interval,
          dateIso: datePlus1,
        },
      },
    });

    // Shift -1 día
    const dateMinus1 = new Date(dateObj.getTime() - 86400000).toISOString().split('T')[0];
    rawTransformations.push({
      transformationId: `trans_shift_${alloc.allocationId}_-1d`,
      transformationType: 'SHIFT_TIME_INTERVAL',
      allocationId: alloc.allocationId,
      shiftParams: {
        newInterval: {
          ...alloc.interval,
          dateIso: dateMinus1,
        },
      },
    });
  }

  return sortTransformationsCanonical(rawTransformations);
}

/**
 * Función Pura Principal: Explora el Espacio de Candidatos Alcanzables (FASE 3 Hito 7).
 *
 * Invariante de Gobierno:
 * EXPLORAR EL ESPACIO != RESOLVER EL PROBLEMA
 * Cero evaluadores de superioridad, cero heurísticas, cero optimización.
 */
export function exploreCandidateSearchSpace(
  initialPlan: ScheduleCandidatePlan,
  catalog: SiteResourceState[],
  limits: SearchExplorationLimits,
  holidaysList: string[] = []
): ExploredSearchSpaceResult {
  const startTimeMs = Date.now();

  const rootCanonicalString = canonicalSerialize(initialPlan);
  const rootHash = canonicalStateHash(initialPlan);
  const rootId = generateDeterministicCandidateId(initialPlan);

  const rootFingerprint: CandidateStateFingerprint = {
    canonicalString: rootCanonicalString,
    hash: rootHash,
  };

  // VisitedStates (R-SEARCH-09, R-SEARCH-24):
  // Almacena canonicalString -> { candidateId, trace }
  const visitedStates = new Map<
    string,
    { candidateId: string; fullTrace: ReadonlyArray<CandidateNodeTraceEntry> }
  >();
  visitedStates.set(rootCanonicalString, { candidateId: rootId, fullTrace: [] });

  const nodesByCandidateId = new Map<string, CandidateNode>();
  const adjacencyList = new Map<string, ExploredSearchSpaceAdjacencyEntry[]>();

  // R-SEARCH-24: P0 ocupa la posición 1 en VisitedStates
  const rootNode: CandidateNode = {
    candidateId: rootId,
    fingerprint: rootFingerprint,
    depth: 0,
    parentId: null,
    deterministicTrace: [],
    expansionStatus: 'UNEXPANDED',
    derivedCandidate: initialPlan,
  };

  nodesByCandidateId.set(rootId, rootNode);
  adjacencyList.set(rootId, []);

  // R-SEARCH-24: Si N_max === 1, solo se admite P0 y no se permite explorar nodos nuevos.
  if (limits.maxVisitedNodes <= 1) {
    const finalRootNode: CandidateNode = {
      ...rootNode,
      expansionStatus: 'PRUNED_MAX_DEPTH',
    };
    nodesByCandidateId.set(rootId, finalRootNode);

    return {
      rootCandidateId: rootId,
      totalVisitedNodes: visitedStates.size,
      nodesByCandidateId,
      adjacencyList,
      terminationStatus: 'CARDINALITY_LIMIT_REACHED',
      explorationMetadata: {
        limitsApplied: limits,
        executionDurationMs: Date.now() - startTimeMs,
      },
    };
  }

  // Cola FIFO para expansión paso a paso (BFS)
  interface QueueItem {
    candidate: ScheduleCandidatePlan;
    candidateId: string;
    depth: number;
    trace: ReadonlyArray<CandidateNodeTraceEntry>;
  }

  const queue: QueueItem[] = [
    { candidate: initialPlan, candidateId: rootId, depth: 0, trace: [] },
  ];

  let terminationStatus: SearchSpaceTerminationStatus = 'EXHAUSTED';
  let totalTransformationsApplied = 0;
  let totalTransformationsAttempted = 0;

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentNode = nodesByCandidateId.get(current.candidateId)!;

    // R-SEARCH-08: Acotación de Profundidad (D_max)
    if (current.depth >= limits.maxDepth) {
      nodesByCandidateId.set(current.candidateId, {
        ...currentNode,
        expansionStatus: 'PRUNED_MAX_DEPTH',
      });
      if (terminationStatus === 'EXHAUSTED') {
        terminationStatus = 'DEPTH_LIMIT_REACHED';
      }
      continue;
    }

    const possibleTransformations = generatePossibleTransformations(current.candidate, catalog);
    totalTransformationsAttempted += possibleTransformations.length;

    for (const transformation of possibleTransformations) {
      const applyResult = applyCandidateTransformation(
        current.candidate,
        transformation,
        catalog,
        holidaysList
      );

      if (!applyResult.success || !applyResult.derivedCandidate) {
        continue; // Transformación rechazada por Hito 6
      }

      totalTransformationsApplied++;

      const childPlan = applyResult.derivedCandidate;
      const childCanonicalString = canonicalSerialize(childPlan);
      const childHash = canonicalStateHash(childPlan);
      const childId = generateDeterministicCandidateId(childPlan);

      const newStepIndex = current.trace.length + 1;
      const traceEntry: CandidateNodeTraceEntry = {
        transformation,
        stepIndex: newStepIndex,
        syntheticTimestampIso: getSyntheticTimestampIso(newStepIndex),
      };
      const newTrace = [...current.trace, traceEntry];

      const currentAdjacency = adjacencyList.get(current.candidateId) || [];

      // Detección de Estado Repetido / Convergencia (R-SEARCH-13, R-SEARCH-25)
      if (visitedStates.has(childCanonicalString)) {
        const existing = visitedStates.get(childCanonicalString)!;
        
        // Agregar arista en la lista de adyacencia
        currentAdjacency.push({
          targetCandidateId: existing.candidateId,
          transformation,
        });
        adjacencyList.set(current.candidateId, currentAdjacency);

        // R-SEARCH-25: Comparación Lexicográfica de fullTrace en Convergencia
        const existingTraceStr = JSON.stringify(existing.fullTrace.map((t) => t.transformation.transformationId));
        const newTraceStr = JSON.stringify(newTrace.map((t) => t.transformation.transformationId));

        if (newTraceStr.localeCompare(existingTraceStr) < 0) {
          visitedStates.set(childCanonicalString, {
            candidateId: existing.candidateId,
            fullTrace: newTrace,
          });
          const existingNode = nodesByCandidateId.get(existing.candidateId);
          if (existingNode) {
            nodesByCandidateId.set(existing.candidateId, {
              ...existingNode,
              deterministicTrace: newTrace,
            });
          }
        }
        continue;
      }

      // R-SEARCH-09 & R-SEARCH-24: Control Estricto de Cardinalidad (N_max)
      if (visitedStates.size >= limits.maxVisitedNodes) {
        terminationStatus = 'CARDINALITY_LIMIT_REACHED';
        // Marcar nodo actual como EXPANDED parcialmente e interrumpir la exploración completa
        nodesByCandidateId.set(current.candidateId, {
          ...currentNode,
          expansionStatus: 'EXPANDED',
        });
        queue.length = 0;
        break;
      }

      // Admisión de nuevo estado único
      const childFingerprint: CandidateStateFingerprint = {
        canonicalString: childCanonicalString,
        hash: childHash,
      };

      visitedStates.set(childCanonicalString, {
        candidateId: childId,
        fullTrace: newTrace,
      });

      currentAdjacency.push({
        targetCandidateId: childId,
        transformation,
      });
      adjacencyList.set(current.candidateId, currentAdjacency);

      const childNode: CandidateNode = {
        candidateId: childId,
        fingerprint: childFingerprint,
        depth: current.depth + 1,
        parentId: current.candidateId,
        deterministicTrace: newTrace,
        expansionStatus: 'UNEXPANDED',
        derivedCandidate: childPlan,
      };

      nodesByCandidateId.set(childId, childNode);
      adjacencyList.set(childId, []);

      queue.push({
        candidate: childPlan,
        candidateId: childId,
        depth: current.depth + 1,
        trace: newTrace,
      });
    }

    if (terminationStatus !== 'CARDINALITY_LIMIT_REACHED') {
      nodesByCandidateId.set(current.candidateId, {
        ...currentNode,
        expansionStatus: 'EXPANDED',
      });
    }
  }

  if (totalTransformationsAttempted > 0 && totalTransformationsApplied === 0) {
    terminationStatus = 'ALL_TRANSFORMATIONS_REJECTED';
  }

  return {
    rootCandidateId: rootId,
    totalVisitedNodes: visitedStates.size,
    nodesByCandidateId,
    adjacencyList,
    terminationStatus,
    explorationMetadata: {
      limitsApplied: limits,
      executionDurationMs: Date.now() - startTimeMs,
    },
  };
}
