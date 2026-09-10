/**
 * Tipos y Contratos de Especificación del Espacio de Búsqueda y Generador Puro de Candidatos (FASE 3 Hito 6)
 *
 * Principio Rector Congelado:
 * APLICAR TRANSFORMACIÓN (1:1) != BUSCAR O EXPLORAR CANDIDATOS
 *
 * Invariantes Rectoras:
 * - R-SOL-01: Aplicador declarativo 1:1 (un único candidato PA + transformación T -> único PB).
 * - R-SOL-02: Soberanía contractual POA (0 alteración de metrado demandado).
 * - R-SOL-03: Variables de decisión autorizadas (Intervalo hábil, recurso equi-rol, vinculación operador).
 * - R-SOL-04: Prohibición de modificación retroactiva de ejecuciones o actas.
 * - R-SOL-05: Respeto del calendario hábil F3.1 (días laborales efectivos, 0 festivos/domingos).
 * - R-SOL-06: Trazabilidad de derivación Padre -> Transformación -> Hijo.
 * - R-SOL-07: Preservación de trazabilidad de origen K:AOA.
 * - R-SOL-08: No inferencia de recursos inexistentes en catálogo Hito 1.
 * - R-SOL-09: No creación de capacidad virtual (0 personas, máquinas o jornales adicionales).
 * - R-SOL-10: Determinismo e inmutabilidad (PA intacto).
 * - R-SOL-11: Prohibición de búsqueda recursiva.
 * - R-SOL-12: Prohibición absoluta de solucionadores, optimizadores o solver.ts.
 */

import type {
  ResourceTemporalAllocation,
  ResourceTimeInterval,
} from './types';
import type { ScheduleCandidatePlan } from './decisionProblemTypes';

export type CandidateTransformationType =
  | 'SHIFT_TIME_INTERVAL'
  | 'REASSIGN_RESOURCE_EQUI_ROLE'
  | 'BIND_OPERATOR_DEPENDENCY';

export interface ShiftTimeIntervalParams {
  newInterval: ResourceTimeInterval;
}

export interface ReassignResourceParams {
  newResourceId: string;
  newResourceCodeOrName: string;
}

export interface BindOperatorParams {
  operatorAllocationId: string;
  operatorId: string;
}

export interface CandidateTransformation {
  transformationId: string;
  transformationType: CandidateTransformationType;
  allocationId: string; // Asignación afectada en el candidato
  shiftParams?: ShiftTimeIntervalParams;
  reassignParams?: ReassignResourceParams;
  bindParams?: BindOperatorParams;
}

export interface DerivationTrace {
  parentCandidateId: string;
  transformationId: string;
  transformationType: CandidateTransformationType;
  changedAllocationId: string;
  previousValue: string;
  newValue: string;
  appliedAtIso: string;
}

export interface CandidateTransformationResult {
  success: boolean;
  derivedCandidate?: ScheduleCandidatePlan;
  derivationTrace?: DerivationTrace;
  rejectionReason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de Contrato Futuro para Hito 7 (Solver Execution Statuses)
// NOTA: Definidos exclusivamente como tipos de contrato. Hito 6 NO los evalúa.
// ─────────────────────────────────────────────────────────────────────────────

export type SolverExecutionStatus =
  | 'SOLUTION_FOUND'
  | 'INFEASIBLE'
  | 'SEARCH_EXHAUSTED'
  | 'TIME_LIMIT'
  | 'NOT_EVALUABLE';

export interface SolverBoundariesSpec {
  maxSearchHorizonDays: number;
  maxCandidatesAllowed: number;
  timeLimitMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos y Contratos del Motor de Exploración del Espacio de Candidatos (FASE 3 Hito 7)
// ─────────────────────────────────────────────────────────────────────────────

export const BASE_SYNTHETIC_TIMESTAMP_ISO = '2026-01-01T00:00:00.000Z';
export const STEP_DELTA_MS = 1000;

export interface CandidateStateFingerprint {
  readonly canonicalString: string;
  readonly hash: string;
}

export interface CandidateNodeTraceEntry {
  readonly transformation: CandidateTransformation;
  readonly stepIndex: number;
  readonly syntheticTimestampIso: string;
}

export type CandidateNodeExpansionStatus =
  | 'EXPANDED'
  | 'PRUNED_MAX_DEPTH'
  | 'PRUNED_DUPLICATE'
  | 'UNEXPANDED';

export interface CandidateNode {
  readonly candidateId: string;
  readonly fingerprint: CandidateStateFingerprint;
  readonly depth: number;
  readonly parentId: string | null;
  readonly deterministicTrace: ReadonlyArray<CandidateNodeTraceEntry>;
  readonly expansionStatus: CandidateNodeExpansionStatus;
  readonly derivedCandidate: ScheduleCandidatePlan;
  readonly feasibilityStatus?: 'FEASIBLE' | 'INFEASIBLE' | 'UNDETERMINED';
}

export interface SearchExplorationLimits {
  readonly maxDepth: number;
  readonly maxVisitedNodes: number; // N_max (incluye P0, N_max >= 1)
}

export type SearchSpaceTerminationStatus =
  | 'EXHAUSTED'
  | 'DEPTH_LIMIT_REACHED'
  | 'CARDINALITY_LIMIT_REACHED'
  | 'ALL_TRANSFORMATIONS_REJECTED';

export interface ExploredSearchSpaceAdjacencyEntry {
  readonly targetCandidateId: string;
  readonly transformation: CandidateTransformation;
}

export interface ExploredSearchSpaceResult {
  readonly rootCandidateId: string;
  readonly totalVisitedNodes: number; // |VisitedStates| (>= 1)
  readonly nodesByCandidateId: ReadonlyMap<string, CandidateNode>;
  readonly adjacencyList: ReadonlyMap<string, ReadonlyArray<ExploredSearchSpaceAdjacencyEntry>>;
  readonly terminationStatus: SearchSpaceTerminationStatus;
  readonly explorationMetadata: {
    readonly limitsApplied: SearchExplorationLimits;
    readonly executionDurationMs: number;
  };
}

