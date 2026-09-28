/**
 * Mantenix - Hito 7.4 Action Planning & Governed Recommendation Engine v1.0
 * Contrato de Tipos e Interfaz Canonical de Planificación Gobernada
 *
 * Principios:
 * - 0 mutaciones BD, 0 DDL, 0 RPCs de escritura, 0 ejecución autónoma en producción.
 * - Invarianza no causal de H7.3: explicaciones factuales y contextuales sin enunciar causalidad.
 * - Invarianza de Gobierno: requiresHumanReview = true obligatorio en todo registro y candidato.
 * - R13 ↔ R23: Cuantificación estricta sin números nulos en candidatos (fail-closed si faltan datos).
 */

import { DiagnosticRecord } from './contextualDiagnosis';
import { AnomalyCategory, AnomalySeverity } from './anomalyDetection';
import { ObservabilityFactRecord } from './observabilityRuntime';

/**
 * Categorías de recomendación/planificación gobernada en H7.4
 */
export type RecommendationCategory =
  | 'REALLOCATE_CREW'             // Reasignación/ajuste de cuadrillas
  | 'ADJUST_MAINTENANCE_SCHEDULE' // Reprogramación de ocurrencia rutinaria
  | 'REBALANCE_RESOURCES'         // Rebalanceo de insumos/recursos
  | 'REVIEW_CONTRACTUAL_TARGET'   // Revisión de meta/alcance contractual POA
  | 'FLAG_FOR_FIELD_INSPECTION'   // Solicitud de inspección física en sitio
  | 'NOTIFY_SUPERVISOR';          // Emisión de alerta de supervisión

/**
 * Nivel de Riesgo de la Acción Recomendada
 */
export type PlanRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Mapeo numérico determinista de nivel de riesgo para ordenamiento lexicográfico (ASC)
 */
export const PLAN_RISK_RANK: Record<PlanRiskLevel, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

/**
 * Matriz de riesgo máximo permitido por categoría (R11)
 */
export const CATEGORY_MAX_ALLOWED_RISK: Record<RecommendationCategory, PlanRiskLevel> = {
  NOTIFY_SUPERVISOR: 'LOW',
  FLAG_FOR_FIELD_INSPECTION: 'LOW',
  ADJUST_MAINTENANCE_SCHEDULE: 'MEDIUM',
  REBALANCE_RESOURCES: 'MEDIUM',
  REALLOCATE_CREW: 'HIGH',
  REVIEW_CONTRACTUAL_TARGET: 'CRITICAL',
};

/**
 * Estado Epistemológico de la Evaluación de Planificación (H7.4)
 */
export type PlanEvaluationStatus =
  | 'RECOMMENDED'        // Se formuló al menos 1 recomendación gobernada válida dentro de los umbrales de riesgo
  | 'NO_ACTION_REQUIRED' // Diagnóstico válido que no requiere intervención o cuya severidad no justifica acción
  | 'RISK_EXCEEDED'      // Las recomendaciones potenciales superan los umbrales de riesgo permitidos
  | 'INDETERMINATE';     // Evidencia o contexto insuficiente en el diagnóstico para formular un plan

/**
 * Cuantificación del Impacto Esperado de la Recomendación (R13)
 * Todos los campos de impacto numérico son requeridos (sin ceros ni nulos inventados).
 */
export interface ExpectedImpact {
  metric: string;
  baselineValue: number;
  projectedValue: number;
  estimatedImprovement: number; // delta o porcentaje de mejora estimado (numérico obligatorio)
  unit: string;
  impactConfidenceScore: number; // 0.0 a 1.0 (cuantificación obligatoria)
}

/**
 * Candidato Individual a Recomendación de Plan de Acción
 */
export interface ActionPlanCandidate {
  candidateId: string;
  category: RecommendationCategory;
  title: string;
  rationale: string; // Explicación factual/contextual (R14, 0 causalidad)
  targetEntityId: string;
  expectedImpact: ExpectedImpact;
  riskLevel: PlanRiskLevel;
  riskJustification: string;
  requiresHumanReview: true; // Invariablemente true
}

/**
 * Registro de Planificación y Recomendación Gobernada (Output Consolidado H7.4)
 */
export interface ActionPlanRecord {
  planId: string;
  diagnosticId: string;
  anomalyId: string;
  boardId?: string;
  siteId?: string;
  category?: AnomalyCategory;
  severity?: AnomalySeverity;
  status: PlanEvaluationStatus;
  primaryRecommendation: ActionPlanCandidate | null;
  alternativeRecommendations: ActionPlanCandidate[];
  evaluatedAt: string; // UTC ISO 8601 (ej. "2026-09-23T01:42:17.381Z")
  timezone: 'America/Bogota'; // Contexto civil/operativo invariable
  evaluatorVersion: 'v1.0';
  requiresHumanReview: true; // Invariablemente true
}

/**
 * Input para el Motor de Planificación H7.4
 */
export interface ActionPlanningInput {
  diagnostic: DiagnosticRecord;
  anomalyCategory?: AnomalyCategory;
  anomalySeverity?: AnomalySeverity;
  boardId?: string;
  siteId?: string;
  facts?: ObservabilityFactRecord[];
  memoryMetrics?: Map<string, number>;
}
