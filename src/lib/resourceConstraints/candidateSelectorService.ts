/**
 * Servicio Consultivo de Selección y Ranking Determinista de Candidatos (FASE 4 Hito 3)
 *
 * Axioma Rector:
 * SELECCIONAR ENTRE CANDIDATOS EXISTENTES ≠ GENERAR CANDIDATOS ≠ EXPLORAR EL ESPACIO ≠ RESOLVER EL PROBLEMA
 *
 * Reglas de Gobierno y Contrato Congelado:
 * - R-SELECT-01: Dominancia categórica de factibilidad. FEASIBLE domina 100% a INFEASIBLE y UNDETERMINED.
 *                Si ningún candidato es FEASIBLE, NO SE SELECCIONA GANADOR (NO_FEASIBLE_CANDIDATE_FOUND).
 * - R-SELECT-02: Respeto absoluto a la cascada lexicográfica H5. V(P) = [v0, v1, v2, v3, v4].
 *                Cero sumas ponderadas o promedios flotantes arbitrarios.
 * - R-SELECT-03: Desempate determinista canónico por candidateId UTF-8 ante vectores V(P) idénticos.
 * - R-SELECT-04: Transparencia de equivalencia exponiendo equivalentCandidateIds.
 * - R-SELECT-05: Inmutabilidad absoluta. Cero mutaciones sobre los candidatos de entrada.
 * - R-SELECT-06: Determinismo 100% absoluto.
 * - R-SELECT-07: Cero generación de candidatos, cero transformaciones H6 y cero exploraciones H7.
 * - R-SELECT-08: Preservación de trazabilidad de derivación.
 * - R-SELECT-09: Respuesta explícita ante colecciones vacías (EMPTY_CANDIDATE_COLLECTION) o inválidas (INVALID_SELECTION_INPUT).
 * - R-SELECT-10: H8 Solver BLOQUEADO (Servicio puramente consultivo).
 */

import type { ScheduleCandidatePlan, ScheduleFeasibilityResult } from './decisionProblemTypes';
import type { LexicographicObjectiveVector } from './resolutionProblemTypes';

export type CandidateSelectionStatus =
  | 'OPTIMAL_SINGLE_WINNER'
  | 'OPTIMAL_EQUIVALENT_TIE_BROKEN'
  | 'NO_FEASIBLE_CANDIDATE_FOUND'
  | 'EMPTY_CANDIDATE_COLLECTION'
  | 'INVALID_SELECTION_INPUT';

export interface EvaluatedCandidateEntry {
  readonly candidate: ScheduleCandidatePlan;
  readonly feasibility: ScheduleFeasibilityResult;
  readonly objective: LexicographicObjectiveVector;
}

export interface CandidateSelectionResult {
  readonly selectionStatus: CandidateSelectionStatus;
  readonly totalCandidatesEvaluated: number;
  readonly feasibleCandidatesCount: number;
  readonly infeasibleCandidatesCount: number;
  readonly selectedCandidateId: string | null;
  readonly selectedCandidate: ScheduleCandidatePlan | null;
  readonly equivalentCandidateIds: ReadonlyArray<string>;
  readonly selectionTrace: {
    readonly dominantVector?: ReadonlyArray<number>;
    readonly decisionReason: string;
    readonly evaluatedAtIso: string;
  };
}

/**
 * Función Pura: Compara dos vectores de objetivos lexicográficos V(A) y V(B) sin sumas ponderadas.
 * Retorna 1 si V(A) domina a V(B), -1 si V(B) domina a V(A), o 0 si son lexicográficamente equivalentes.
 */
export function compareObjectiveVectorsPure(
  vecA: LexicographicObjectiveVector,
  vecB: LexicographicObjectiveVector
): number {
  // Nivel 0: Cobertura Temporal POA (MAXIMIZE)
  if (vecA.level0.temporalCoverageRatio > vecB.level0.temporalCoverageRatio) return 1;
  if (vecB.level0.temporalCoverageRatio > vecA.level0.temporalCoverageRatio) return -1;

  // Nivel 1: Fricción de Maquinaria Escasa (MINIMIZE)
  if (vecA.level1.totalFrictionScore < vecB.level1.totalFrictionScore) return 1;
  if (vecB.level1.totalFrictionScore < vecA.level1.totalFrictionScore) return -1;

  // Nivel 2: Fragmentación de Frentes (MINIMIZE)
  if (vecA.level2.totalFragmentationScore < vecB.level2.totalFragmentationScore) return 1;
  if (vecB.level2.totalFragmentationScore < vecA.level2.totalFragmentationScore) return -1;

  // Nivel 3: Varianza en Días Hábiles (MINIMIZE)
  if (vecA.level3.workingDaysVariance < vecB.level3.workingDaysVariance) return 1;
  if (vecB.level3.workingDaysVariance < vecA.level3.workingDaysVariance) return -1;

  // Nivel 4: Diferido / Igualdad
  return 0;
}

/**
 * Convierte el vector lexicográfico V(P) en un arreglo numérico [v0, v1, v2, v3, v4] para trazabilidad.
 */
function extractVectorArray(vec: LexicographicObjectiveVector): number[] {
  return [
    vec.level0.temporalCoverageRatio,
    vec.level1.totalFrictionScore,
    vec.level2.totalFragmentationScore,
    vec.level3.workingDaysVariance,
    0,
  ];
}

/**
 * Función Pura Principal: Selecciona el candidato factible óptimo o el grupo de equivalentes canónicos
 * sobre una colección de candidatos previamente evaluados en H4 y H5.
 */
export function selectOptimalScheduleCandidate(
  evaluatedCandidates: ReadonlyArray<EvaluatedCandidateEntry>,
  evaluatedAt?: Date | string
): CandidateSelectionResult {
  const nowIso = evaluatedAt
    ? (typeof evaluatedAt === 'string' ? evaluatedAt : evaluatedAt.toISOString())
    : new Date().toISOString();

  // 1. Verificación de Colección Vacía
  if (!evaluatedCandidates || evaluatedCandidates.length === 0) {
    return {
      selectionStatus: 'EMPTY_CANDIDATE_COLLECTION',
      totalCandidatesEvaluated: 0,
      feasibleCandidatesCount: 0,
      infeasibleCandidatesCount: 0,
      selectedCandidateId: null,
      selectedCandidate: null,
      equivalentCandidateIds: [],
      selectionTrace: {
        decisionReason: 'La colección de candidatos ingresada está vacía (0 candidatos).',
        evaluatedAtIso: nowIso,
      },
    };
  }

  // 2. Verificación de Integridad de Entrada (V(P) y Feasibility completos)
  for (const entry of evaluatedCandidates) {
    if (
      !entry ||
      !entry.candidate ||
      !entry.candidate.candidateId ||
      !entry.feasibility ||
      typeof entry.feasibility.isFeasible !== 'boolean' ||
      !entry.objective ||
      !entry.objective.level0 ||
      !entry.objective.level1 ||
      !entry.objective.level2 ||
      !entry.objective.level3
    ) {
      return {
        selectionStatus: 'INVALID_SELECTION_INPUT',
        totalCandidatesEvaluated: evaluatedCandidates.length,
        feasibleCandidatesCount: 0,
        infeasibleCandidatesCount: evaluatedCandidates.length,
        selectedCandidateId: null,
        selectedCandidate: null,
        equivalentCandidateIds: [],
        selectionTrace: {
          decisionReason: 'La colección ingresada contiene elementos sin evaluación completa de H4 (factibilidad) o H5 (vector objetivo).',
          evaluatedAtIso: nowIso,
        },
      };
    }
  }

  const totalCandidatesEvaluated = evaluatedCandidates.length;

  // 3. Filtrado Categórico de Factibilidad H4 (R-SELECT-01)
  const feasibleEntries = evaluatedCandidates.filter((e) => e.feasibility.isFeasible);
  const feasibleCandidatesCount = feasibleEntries.length;
  const infeasibleCandidatesCount = totalCandidatesEvaluated - feasibleCandidatesCount;

  if (feasibleCandidatesCount === 0) {
    return {
      selectionStatus: 'NO_FEASIBLE_CANDIDATE_FOUND',
      totalCandidatesEvaluated,
      feasibleCandidatesCount: 0,
      infeasibleCandidatesCount,
      selectedCandidateId: null,
      selectedCandidate: null,
      equivalentCandidateIds: [],
      selectionTrace: {
        decisionReason: `Ningún candidato de los ${totalCandidatesEvaluated} evaluados es factible bajo H4. No se selecciona solución operacional de descarte.`,
        evaluatedAtIso: nowIso,
      },
    };
  }

  // 4. Búsqueda del Subconjunto de Candidatos Factibles Dominantes por H5 Lexicográfico
  let optimalEntries: EvaluatedCandidateEntry[] = [feasibleEntries[0]];

  for (let i = 1; i < feasibleEntries.length; i++) {
    const candidateEntry = feasibleEntries[i];
    const comp = compareObjectiveVectorsPure(candidateEntry.objective, optimalEntries[0].objective);

    if (comp > 0) {
      // El nuevo candidato domina estrictamente a los candidatos óptimos actuales
      optimalEntries = [candidateEntry];
    } else if (comp === 0) {
      // El nuevo candidato es lexicográficamente equivalente a los candidatos óptimos actuales
      optimalEntries.push(candidateEntry);
    }
    // Si comp < 0, es dominado y se ignora
  }

  // Ordenamiento canónico determinista de IDs de candidatos equivalentes por UTF-8 (R-SELECT-03)
  optimalEntries.sort((a, b) => a.candidate.candidateId.localeCompare(b.candidate.candidateId));

  const equivalentCandidateIds = optimalEntries.map((e) => e.candidate.candidateId);
  const selectedWinnerEntry = optimalEntries[0];
  const selectedCandidate = selectedWinnerEntry.candidate;
  const dominantVector = extractVectorArray(selectedWinnerEntry.objective);

  const isSingleWinner = optimalEntries.length === 1;
  const selectionStatus: CandidateSelectionStatus = isSingleWinner
    ? 'OPTIMAL_SINGLE_WINNER'
    : 'OPTIMAL_EQUIVALENT_TIE_BROKEN';

  const decisionReason = isSingleWinner
    ? `Candidato "${selectedCandidate.candidateId}" seleccionado como único ganador factible estrictamente dominante en la cascada lexicográfica H5.`
    : `Se detectaron ${optimalEntries.length} candidatos factibles lexicográficamente equivalentes en V(P). Se aplicó desempate canónico determinista por candidateId UTF-8 seleccionando "${selectedCandidate.candidateId}".`;

  return {
    selectionStatus,
    totalCandidatesEvaluated,
    feasibleCandidatesCount,
    infeasibleCandidatesCount,
    selectedCandidateId: selectedCandidate.candidateId,
    selectedCandidate,
    equivalentCandidateIds,
    selectionTrace: {
      dominantVector,
      decisionReason,
      evaluatedAtIso: nowIso,
    },
  };
}
