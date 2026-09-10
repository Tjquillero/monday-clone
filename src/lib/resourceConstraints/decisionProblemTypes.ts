/**
 * Tipos y Contratos de Especificación del Problema de Decisión y Modelo de Factibilidad (FASE 3 Hito 4)
 *
 * Principio Rector Congelado:
 * DEFINIR EL PROBLEMA != RESOLVER EL PROBLEMA
 *
 * Invariantes Rectoras:
 * - R-DEC-01: Soberanía contractual (POA inalterable).
 * - R-DEC-02: Separación estricta Restricción Dura (Factibilidad) vs Objetivo (Calidad).
 * - R-DEC-03: Definición formal de factibilidad (100% restricciones duras satisfechas).
 * - R-DEC-04: Conservación de cantidades contractuales.
 * - R-DEC-05: Conservación de recursos finitos.
 * - R-DEC-06: Integración con motor de simultaneidad Hito 2.
 * - R-DEC-07: Expresión y verificación de dependencias recurso-operador.
 * - R-DEC-08: Calendario laboral efectivo y F3.1.
 * - R-DEC-09: Separación histórico K:AOA vs plan actual.
 * - R-DEC-10: Inmutabilidad y 0 mutación de fuentes de verdad.
 * - R-DEC-11: Determinismo absoluto.
 * - R-DEC-12: Prohibición de solucionadores, optimizadores o auto-reprogramaciones.
 */

import type {
  ResourceTemporalAllocation,
  ResourceDemandAllocation,
  SiteResourceState,
} from './types';

export type FeasibilityStatus = 'FEASIBLE' | 'INFEASIBLE' | 'UNDETERMINED';

export type ConstraintLayer = 'STRUCTURAL' | 'TEMPORAL' | 'OPERATIONAL';

export type HardConstraintType =
  | 'CONTRACTUAL_QUANTITY_MISMATCH'
  | 'INEXISTENT_CATALOG_RESOURCE'
  | 'UNBOUND_OPERATOR_DEPENDENCY'
  | 'SIMULTANEITY_TEMPORAL_COLLISION'
  | 'INVALID_WORKING_CALENDAR_DAY'
  | 'CARDINALITY_DUPLICATION'
  | 'UNDETERMINED_RESOURCE_CONTEXT';

export interface ConstraintViolation {
  id: string;
  constraintType: HardConstraintType;
  allocationId: string;
  resourceId: string;
  layer: ConstraintLayer;
  reason: string;
}

export interface FeasibilityLayerStatus {
  structural: { isFeasible: boolean; issuesCount: number };
  temporal: { isFeasible: boolean; issuesCount: number };
  operational: { isFeasible: boolean; issuesCount: number };
}

export interface ScheduleCandidatePlan {
  candidateId: string;
  contractualReference?: string;
  allocations: ResourceTemporalAllocation[];
  demands?: ResourceDemandAllocation[];
}

export interface ScheduleFeasibilityResult {
  candidateId: string;
  status: FeasibilityStatus;
  isFeasible: boolean; // true si status === 'FEASIBLE'
  layerStatus: FeasibilityLayerStatus;
  violationsCount: number;
  violations: ConstraintViolation[];
  undeterminedCount: number;
  evaluatedAllocationsCount: number;
}
