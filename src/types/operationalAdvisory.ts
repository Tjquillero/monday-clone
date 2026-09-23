/**
 * Types & Domain Contracts for Operational Advisory & Recommendation Engine (v1.2)
 *
 * Axioma Rector:
 * HECHO != MÉTRICA != PATRÓN != RECOMENDACIÓN != DECISIÓN != RESULTADO
 *
 * Naturaleza:
 * Read Model / Servicio Consultivo Puro en Memoria (0 persistencia, 0 DDL, 0 mutaciones).
 */

import {
  AnalyticsScope,
  OperationalMetricKey,
  OperationalPatternKey,
  OperationalMemoryAnalyticsResult,
} from './operationalMemory';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Familias Canónicas de Recomendación (R-01 a R-04)
// ─────────────────────────────────────────────────────────────────────────────

export type RecommendationKey =
  | 'R-01_AJUSTE_RENDIMIENTO'
  | 'R-02_BALANCE_CUADRILLA'
  | 'R-03_PROVISION_INSUMOS'
  | 'R-04_DESDOBLAMIENTO_MULTIDIA'
  | 'R-05_DISCREPANCIA_TRIDIMENSIONAL_MATERIALIZADA';

export type RecommendationPriority = 'HIGH' | 'MEDIUM' | 'LOW';

// El estado de toda recomendación generada por el Advisory es estrictamente PROPOSED
export type RecommendationStatus = 'PROPOSED';

// ─────────────────────────────────────────────────────────────────────────────
// 2. Entidad Objetivo y Acción Propuesta
// ─────────────────────────────────────────────────────────────────────────────

export interface TargetEntityReference {
  entityType: 'ACTIVITY' | 'CREW' | 'OCCURRENCE' | 'ZONE' | 'RESOURCE';
  entityId: string;
  entityName?: string;
}

export interface ProposedAction {
  actionType:
    | 'ADVISE_STANDARD_REVISION'
    | 'ADVISE_CREW_REALLOCATION'
    | 'ADVISE_RESOURCE_TEMPLATE_UPDATE'
    | 'ADVISE_MULTIDAY_PLANNING';
  targetEntity: TargetEntityReference;
  suggestedParameters: {
    proposedStandardRate?: number | null;
    proposedTargetCrewId?: string | null;
    proposedUnitQuota?: number | null;
    proposedPlannedDays?: number | null;
    notes?: string;
  };
  applicableDomainGateway:
    | 'poaService'
    | 'weeklyPlanService'
    | 'crewAssignmentService'
    | 'scheduleMaterializationService';
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Separación Epistemológica de Impactos
// ─────────────────────────────────────────────────────────────────────────────

export interface ProjectedImpact {
  metricKey: OperationalMetricKey | string;
  currentObservedValue: number | null; // Valor actualmente medido
  proposedTargetValue: number | null;  // Valor objetivo propuesto por la recomendación
  projectedValue?: number | null;      // Valor cuantitativo proyectado (null en v1)
  unit: string;
  expectedImprovementDescription: string;
}

export interface SupportingMetricFact {
  metricKey: OperationalMetricKey;
  value: number | null;
  unit: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Estructura Canónica de Recomendación y Resultado
// ─────────────────────────────────────────────────────────────────────────────

export interface OperationalRecommendation {
  recommendationId: string; // rec__{scopeType}__{scopeId}__{recKey}__{entityId}
  recommendationKey: RecommendationKey;
  priority: RecommendationPriority;
  status: RecommendationStatus; // Siempre 'PROPOSED'
  scope: AnalyticsScope;
  triggeredPatternKey: OperationalPatternKey;
  targetEntity: TargetEntityReference;
  sampleSize: number;
  confidenceScore: number; // Consumido directamente de pattern.confidenceScore
  rationale: string;       // Justificación explícita cuantitativa
  supportingMetrics: SupportingMetricFact[];
  proposedAction: ProposedAction;
  projectedImpact: ProjectedImpact;
  generatedAtIso: string;
}

export interface OperationalAdvisoryResult {
  boardId: string;
  generatedAtIso: string;
  totalPatternsEvaluatedCount: number;
  actionablePatternsCount: number;
  recommendationsCount: number;
  recommendations: OperationalRecommendation[];
}

export interface AdvisoryOptions {
  evaluatedAt?: Date | string;
}
