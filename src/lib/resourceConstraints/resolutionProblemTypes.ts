/**
 * Tipos y Contratos de Especificación del Problema de Resolución y Función Objetivo (FASE 3 Hito 5)
 *
 * Principio Rector Congelado:
 * COMPARA Y EVALÚA PLANES FACTIBLES != BUSCA O GENERA PLANES
 *
 * Invariantes Rectoras:
 * - R-OBJ-01: Feasibility Dominance (Un plan infactible jamás domina a uno factible).
 * - R-OBJ-02: No Generación de candidatos.
 * - R-OBJ-03: No Mutación de candidatos evaluados.
 * - R-OBJ-04: Separación Factibilidad / Objetivo (Hito 4 no es recalculado).
 * - R-OBJ-05: Soberanía Contractual POA (0 alteración de cantidades).
 * - R-OBJ-06: Jerarquía Lexicográfica Explícita (Nivel k domina 100% a Nivel k+1).
 * - R-OBJ-07: Métricas Formalmente Definidas (Fórmula, dirección MAXIMIZE/MINIMIZE y unidad).
 * - R-OBJ-08: Sin Pesos Arbitrarios (Vector lexicográfico V(P) en vez de suma ponderada).
 * - R-OBJ-09: Determinismo Absoluto.
 * - R-OBJ-10: Empate Explícito (EQUIVALENT si V(A) == V(B)).
 * - R-OBJ-11: No Datos Inventados (Nivel 4 diferido por ausencia de matriz GPS).
 * - R-OBJ-12: Prohibición Absoluta de Solucionadores / Optimizadores.
 */

import type { ScheduleCandidatePlan, ScheduleFeasibilityResult } from './decisionProblemTypes';

export type MetricDirection = 'MAXIMIZE' | 'MINIMIZE';

export interface ObjectiveLevel0Metrics {
  levelName: 'LEVEL_0_CONTRACTUAL_TEMPORAL_COVERAGE';
  direction: MetricDirection; // MAXIMIZE
  onTimeActivitiesCount: number;
  totalActivitiesCount: number;
  temporalCoverageRatio: number; // Ratio determinista [0.0, 1.0]
}

export interface ObjectiveLevel1Metrics {
  levelName: 'LEVEL_1_SCARCE_MACHINERY_FRICTION';
  direction: MetricDirection; // MINIMIZE
  legitimateUtilizationHours: number; // NO penalizado (uso legítimo de Tractor/Volqueta)
  overUtilizationHours: number; // Penalizado (sobreuso/exceso simultáneo)
  unscheduledShiftGapsCount: number; // Penalizado (fricción por vacíos imprevistos)
  totalFrictionScore: number;
}

export interface ObjectiveLevel2Metrics {
  levelName: 'LEVEL_2_UNJUSTIFIED_FRONT_FRAGMENTATION';
  direction: MetricDirection; // MINIMIZE
  legitimateMultiDayAllocationsCount: number; // NO penalizado (distribución legítima K:AOA)
  unjustifiedSiteHoppingCount: number; // Penalizado (saltos de sitio innecesarios del mismo personal)
  unjustifiedWorkFrontGapsCount: number; // Penalizado (pausas injustificadas)
  totalFragmentationScore: number;
}

export interface ObjectiveLevel3Metrics {
  levelName: 'LEVEL_3_EFFECTIVE_WORKING_DAYS_VARIANCE';
  direction: MetricDirection; // MINIMIZE
  effectiveWorkingDaysCount: number; // Días hábiles T_Hábil (con calendario F3.1)
  excludedCalendarDaysCount: number; // Domingos y festivos colombianos eximidos
  averageJournalsPerWorkingDay: number;
  workingDaysVariance: number; // Varianza sigma^2 sobre días hábiles
}

export interface ObjectiveLevel4Metrics {
  levelName: 'LEVEL_4_LOGISTICS_AND_IDLE_TIMES';
  direction: MetricDirection; // MINIMIZE
  isEvaluable: false; // DIFERIDO por matriz de datos
  reason: string;
}

export interface LexicographicObjectiveVector {
  candidateId: string;
  isFeasible: boolean; // pre-condición Hito 4
  feasibilityResult: ScheduleFeasibilityResult;
  level0: ObjectiveLevel0Metrics;
  level1: ObjectiveLevel1Metrics;
  level2: ObjectiveLevel2Metrics;
  level3: ObjectiveLevel3Metrics;
  level4: ObjectiveLevel4Metrics;
}

export type ComparisonOutcome = 'PLAN_A_DOMINATES' | 'PLAN_B_DOMINATES' | 'EQUIVALENT';

export type DominantLevel =
  | 'FEASIBILITY'
  | 'LEVEL_0'
  | 'LEVEL_1'
  | 'LEVEL_2'
  | 'LEVEL_3'
  | 'LEVEL_4'
  | 'NONE_EQUIVALENT';

export interface PlanComparisonResult {
  candidateAId: string;
  candidateBId: string;
  outcome: ComparisonOutcome;
  dominantLevel: DominantLevel;
  reason: string;
  vectorA: LexicographicObjectiveVector;
  vectorB: LexicographicObjectiveVector;
}
