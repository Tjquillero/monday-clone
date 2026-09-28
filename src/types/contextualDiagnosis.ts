/**
 * Types & Canonical Contracts for Hito 7.3: Contextual Diagnostic Engine v1.0
 *
 * Axiomas de Gobierno y Separación Cognitiva (H7.3):
 * 1. DIAGNÓSTICO != RECOMENDACIÓN != ACCIÓN (H7.3 Explica la evidencia que soporta una hipótesis, NO dice qué hacer ni repara).
 * 2. Un DiagnosticRecord es puramente consultivo y exige revisión humana (`requiresHumanReview: true`).
 * 3. Invariante Canónica: "Una correlación entre hechos no constituye por sí misma evidencia suficiente de causalidad."
 * 4. Confianza Determinística: SupportWeight explícito derivado de componentes ponderados (Direct, Temporal, Spatial, Entity) menos penalización por contradicción.
 * 5. Distinción Epistemológica: 'DIAGNOSED' (evaluado con hipótesis soportadas) vs 'NO_HYPOTHESIS_SUPPORTED' vs 'INDETERMINATE' (evidencia insuficiente).
 */

import { AnomalyRecord } from './anomalyDetection';

export type DiagnosticConfidenceBand = 'LOW' | 'MEDIUM' | 'HIGH';

export interface DiagnosticEvidenceItem {
  sourceId: string;
  sourceType: string;
  description: string;
  isContradictory?: boolean;
}

export interface DiagnosticCorrelation {
  type: 'TEMPORAL' | 'SPATIAL' | 'ENTITY' | 'METRIC';
  description: string;
  weight: number; // 0.0 to 1.0
}

export interface DiagnosticAlternative {
  hypothesis: string;
  confidence: number; // 0.0 to 1.0
  confidenceBand: DiagnosticConfidenceBand;
  factualBasis: string[];
}

/**
 * Componentes Cuantitativos Explícitos para el Cálculo de SupportWeight (0.00 a 1.00)
 */
export interface SupportWeightComponents {
  directEvidenceWeight: number;    // Cap: 0.35
  temporalAlignmentWeight: number; // Cap: 0.25
  spatialAlignmentWeight: number;  // Cap: 0.20
  entityAlignmentWeight: number;   // Cap: 0.20
}

export const SUPPORT_WEIGHT_FACTOR_CAPS = {
  DIRECT_EVIDENCE: 0.35,
  TEMPORAL_ALIGNMENT: 0.25,
  SPATIAL_ALIGNMENT: 0.20,
  ENTITY_ALIGNMENT: 0.20,
};

/**
 * DiagnosticRecord — Contrato Canónico Descriptivo de Diagnóstico Contextual
 *
 * Garantía Cognitiva: NO incluye propiedades de recommendation, remediation, action, ni patch.
 */
export interface DiagnosticRecord {
  id: string;
  diagnosedAt: string; // ISO 8601 UTC Instant
  anomalyId: string;
  primaryHypothesis: string;
  confidence: number; // 0.00 to 1.00
  confidenceBand: DiagnosticConfidenceBand;
  supportWeightComponents: SupportWeightComponents;
  evidence: DiagnosticEvidenceItem[];
  correlations: DiagnosticCorrelation[];
  factualBasis: string[];
  alternatives: DiagnosticAlternative[];
  requiresHumanReview: true; // Invariante Cognitiva Congelada
}

export type DiagnosticEvaluationStatus =
  | 'DIAGNOSED'
  | 'NO_HYPOTHESIS_SUPPORTED'
  | 'INDETERMINATE';

/**
 * Resultado Gobernado de Evaluación Diagnóstica Contextual (H7.3)
 */
export interface DiagnosticEvaluationResult {
  status: DiagnosticEvaluationStatus;
  diagnostics: DiagnosticRecord[];
  evaluatedAt: string; // ISO 8601 UTC Instant
  evaluatedAnomaliesCount: number;
  reason?: string;
}
