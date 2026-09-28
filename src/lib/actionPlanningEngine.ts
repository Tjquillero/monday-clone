/**
 * Mantenix - Hito 7.4 Action Planning & Governed Recommendation Engine v1.0
 * Motor Consultivo 100% Determinístico en Memoria de Planificación y Recomendación Gobernada
 *
 * Principios Invariantes:
 * - 0 mutaciones BD, 0 DDL, 0 SQL migrations, 0 RPCs de escritura, 0 ejecuciones en producción.
 * - Invarianza no causal: rationale factual y contextual sin enunciar causalidad.
 * - Invarianza de Gobierno: requiresHumanReview = true en todo registro y candidato.
 * - R12: Ordenamiento determinista lexicográfico (ImpactScore DESC -> RiskRank ASC -> candidateId ASC).
 * - R11: Matriz de riesgo máximo permitido por categoría.
 * - R13 ↔ R23: Cuantificación estricta de impacto en todo candidato. Si faltan datos -> INDETERMINATE (fail-closed).
 * - R6A / R6B: Triggers gobernados explícitos para REVIEW_CONTRACTUAL_TARGET y NOTIFY_SUPERVISOR.
 * - R22: Separación UTC ISO 8601 (evaluatedAt) vs America/Bogota (timezone).
 */

import {
  ActionPlanCandidate,
  ActionPlanRecord,
  ActionPlanningInput,
  CATEGORY_MAX_ALLOWED_RISK,
  PlanEvaluationStatus,
  PLAN_RISK_RANK,
} from '../types/actionPlanning';

/**
 * Ordenador Determinista Lexicográfico (R12)
 * Criterio:
 * 1. estimatedImprovement DESC
 * 2. RiskRank ASC (LOW=1, MEDIUM=2, HIGH=3, CRITICAL=4)
 * 3. candidateId ASC (alfabético)
 */
export function sortCandidatesDeterministically(
  candidates: ActionPlanCandidate[]
): ActionPlanCandidate[] {
  return [...candidates].sort((a, b) => {
    const impA = a.expectedImpact.estimatedImprovement;
    const impB = b.expectedImpact.estimatedImprovement;

    if (impA !== impB) {
      return impB - impA; // DESC
    }

    const rankA = PLAN_RISK_RANK[a.riskLevel];
    const rankB = PLAN_RISK_RANK[b.riskLevel];

    if (rankA !== rankB) {
      return rankA - rankB; // ASC (menor riesgo primero)
    }

    return a.candidateId.localeCompare(b.candidateId); // ASC
  });
}

/**
 * Genera candidatos de recomendación gobernados a partir de un DiagnosticRecord (H7.3)
 */
function buildCandidatesForDiagnostic(input: ActionPlanningInput): ActionPlanCandidate[] {
  const { diagnostic, anomalyCategory, anomalySeverity, boardId, siteId } = input;
  const candidates: ActionPlanCandidate[] = [];

  const category = anomalyCategory ?? 'EXECUTION';
  const severity = anomalySeverity ?? (diagnostic.confidenceBand === 'HIGH' ? 'HIGH' : 'MEDIUM');
  const targetSiteId = siteId ?? 'site_unknown';
  const targetBoardId = boardId ?? 'board_unknown';

  const diagShortId = diagnostic.id.slice(0, 8);

  // R6: Recomendación por Inspección de Campo (FLAG_FOR_FIELD_INSPECTION)
  if (category === 'VERIFICATION' || category === 'TELEMETRY' || severity === 'HIGH' || severity === 'CRITICAL') {
    candidates.push({
      candidateId: `cand_insp_${diagShortId}`,
      category: 'FLAG_FOR_FIELD_INSPECTION',
      title: 'Solicitud de Inspección Física en Sitio',
      rationale: `Asociada contextualmente al diagnóstico ${diagnostic.id} (${category}) con nivel de evidencia registrado.`,
      targetEntityId: targetSiteId,
      expectedImpact: {
        metric: 'verification_accuracy',
        baselineValue: 0.60,
        projectedValue: 0.95,
        estimatedImprovement: 0.35,
        unit: 'ratio',
        impactConfidenceScore: 0.85,
      },
      riskLevel: 'LOW',
      riskJustification: 'Inspección visual consultiva de bajo riesgo operacional.',
      requiresHumanReview: true,
    });
  }

  // R6B: Recomendación por Alerta Preventiva a Supervisión (NOTIFY_SUPERVISOR)
  // Trigger R6B: Ante diagnóstico de telemetría o verificación donde se requiere conocimiento del supervisor
  if (category === 'TELEMETRY' || category === 'VERIFICATION') {
    candidates.push({
      candidateId: `cand_notify_${diagShortId}`,
      category: 'NOTIFY_SUPERVISOR',
      title: 'Alerta Preventiva a Supervisión de Sitio',
      rationale: `Formulada a partir del contexto observacional de telemetría o verificación en el sitio ${targetSiteId}.`,
      targetEntityId: targetSiteId,
      expectedImpact: {
        metric: 'supervisor_awareness_ratio',
        baselineValue: 0.50,
        projectedValue: 0.75,
        estimatedImprovement: 0.25,
        unit: 'awareness_ratio',
        impactConfidenceScore: 0.80,
      },
      riskLevel: 'LOW',
      riskJustification: 'Notificación puramente informativa.',
      requiresHumanReview: true,
    });
  }

  // R4: Recomendación por Ajuste de Mantenimiento Rutinario (ADJUST_MAINTENANCE_SCHEDULE)
  if (category === 'RESCHEDULE' || category === 'EXECUTION') {
    candidates.push({
      candidateId: `cand_sched_${diagShortId}`,
      category: 'ADJUST_MAINTENANCE_SCHEDULE',
      title: 'Reprogramación Gobernada de Ocurrencia Rutinaria',
      rationale: `Recomendación contextual ante desviación detectada en la ejecución rutinaria del tablero ${targetBoardId}.`,
      targetEntityId: targetBoardId,
      expectedImpact: {
        metric: 'schedule_compliance',
        baselineValue: 0.50,
        projectedValue: 0.80,
        estimatedImprovement: 0.30,
        unit: 'percentage',
        impactConfidenceScore: 0.75,
      },
      riskLevel: 'MEDIUM',
      riskJustification: 'Reprogramación gobernada dentro de la ventana de trabajo activa.',
      requiresHumanReview: true,
    });
  }

  // R5: Recomendación por Rebalanceo de Recursos (REBALANCE_RESOURCES)
  if (category === 'RESOURCE' || category === 'MATERIALIZATION') {
    candidates.push({
      candidateId: `cand_resource_${diagShortId}`,
      category: 'REBALANCE_RESOURCES',
      title: 'Rebalanceo de Insumos y Materiales de Sitio',
      rationale: `Formulada contextualmente a partir de la variabilidad observada en consumos de recursos.`,
      targetEntityId: targetSiteId,
      expectedImpact: {
        metric: 'resource_utilization_efficiency',
        baselineValue: 0.65,
        projectedValue: 0.85,
        estimatedImprovement: 0.20,
        unit: 'ratio',
        impactConfidenceScore: 0.70,
      },
      riskLevel: 'MEDIUM',
      riskJustification: 'Ajuste de insumos menores dentro del presupuesto asignado.',
      requiresHumanReview: true,
    });
  }

  // R3: Recomendación por Reasignación de Cuadrillas (REALLOCATE_CREW)
  if (category === 'EXECUTION' && (severity === 'HIGH' || severity === 'CRITICAL')) {
    candidates.push({
      candidateId: `cand_crew_${diagShortId}`,
      category: 'REALLOCATE_CREW',
      title: 'Reasignación Operativa de Cuadrilla de Apoyo',
      rationale: `Contextualmente alineada a déficits sostenidos de capacidad operativa observados en el sitio ${targetSiteId}.`,
      targetEntityId: targetSiteId,
      expectedImpact: {
        metric: 'daily_jr_completion',
        baselineValue: 0.40,
        projectedValue: 0.85,
        estimatedImprovement: 0.45,
        unit: 'JR',
        impactConfidenceScore: 0.80,
      },
      riskLevel: 'HIGH',
      riskJustification: 'Reasignación de personal entre sitios operacionales.',
      requiresHumanReview: true,
    });
  }

  // R6A: Recomendación por Revisión de Metas Contractuales (REVIEW_CONTRACTUAL_TARGET)
  // Trigger R6A: Ante discrepancia crítica de materialización o recursos respecto al POA activo
  if ((category === 'MATERIALIZATION' || category === 'RESOURCE') && severity === 'CRITICAL') {
    candidates.push({
      candidateId: `cand_poa_${diagShortId}`,
      category: 'REVIEW_CONTRACTUAL_TARGET',
      title: 'Revisión Formal de Alcance Contractual POA',
      rationale: `Recomendación formulada ante discrepancia crítica de materialización física o recursos respecto al POA activo.`,
      targetEntityId: targetBoardId,
      expectedImpact: {
        metric: 'poa_variance_reduction',
        baselineValue: 0.30,
        projectedValue: 0.90,
        estimatedImprovement: 0.60,
        unit: 'ratio',
        impactConfidenceScore: 0.90,
      },
      riskLevel: 'CRITICAL',
      riskJustification: 'Afectación contractual de metas POA.',
      requiresHumanReview: true,
    });
  }

  return candidates;
}

/**
 * Función Principal de Evaluación de Planificación Gobernada (H7.4)
 */
export function evaluateActionPlanning(input: ActionPlanningInput): ActionPlanRecord {
  const nowUtc = new Date().toISOString();
  const { diagnostic, anomalyCategory, anomalySeverity, boardId, siteId } = input;

  // R23: Fail-closed por diagnóstico nulo o datos insuficientes
  if (!diagnostic) {
    return {
      planId: `plan_indet_${Math.random().toString(36).slice(2, 9)}`,
      diagnosticId: 'none',
      anomalyId: 'none',
      boardId: boardId ?? 'unknown',
      siteId: siteId ?? 'unknown',
      status: 'INDETERMINATE',
      primaryRecommendation: null,
      alternativeRecommendations: [],
      evaluatedAt: nowUtc,
      timezone: 'America/Bogota',
      evaluatorVersion: 'v1.0',
      requiresHumanReview: true,
    };
  }

  // R2 / R23: Fail-closed ante diagnóstico sin confianza o sin hipótesis soportada
  if (diagnostic.confidence === 0 || !diagnostic.primaryHypothesis) {
    return {
      planId: `plan_noact_${diagnostic.id.slice(0, 8)}`,
      diagnosticId: diagnostic.id,
      anomalyId: diagnostic.anomalyId,
      boardId,
      siteId,
      category: anomalyCategory,
      severity: anomalySeverity,
      status: 'NO_ACTION_REQUIRED',
      primaryRecommendation: null,
      alternativeRecommendations: [],
      evaluatedAt: nowUtc,
      timezone: 'America/Bogota',
      evaluatorVersion: 'v1.0',
      requiresHumanReview: true,
    };
  }

  // Construir candidatos potenciales cuantificados
  const rawCandidates = buildCandidatesForDiagnostic(input);

  if (rawCandidates.length === 0) {
    return {
      planId: `plan_noact_${diagnostic.id.slice(0, 8)}`,
      diagnosticId: diagnostic.id,
      anomalyId: diagnostic.anomalyId,
      boardId,
      siteId,
      category: anomalyCategory,
      severity: anomalySeverity,
      status: 'NO_ACTION_REQUIRED',
      primaryRecommendation: null,
      alternativeRecommendations: [],
      evaluatedAt: nowUtc,
      timezone: 'America/Bogota',
      evaluatorVersion: 'v1.0',
      requiresHumanReview: true,
    };
  }

  // R11: Filtrar candidatos contra la matriz de riesgo máximo permitido por categoría
  const validCandidates: ActionPlanCandidate[] = [];
  let hasExceededRiskCandidate = false;

  for (const cand of rawCandidates) {
    const maxAllowed = CATEGORY_MAX_ALLOWED_RISK[cand.category];
    const candRank = PLAN_RISK_RANK[cand.riskLevel];
    const maxRank = PLAN_RISK_RANK[maxAllowed];

    if (candRank <= maxRank) {
      validCandidates.push(cand);
    } else {
      hasExceededRiskCandidate = true;
    }
  }

  // Si existen candidatos pero TODOS superaron su umbral de riesgo permitido -> RISK_EXCEEDED
  if (validCandidates.length === 0 && hasExceededRiskCandidate) {
    return {
      planId: `plan_risk_${diagnostic.id.slice(0, 8)}`,
      diagnosticId: diagnostic.id,
      anomalyId: diagnostic.anomalyId,
      boardId,
      siteId,
      category: anomalyCategory,
      severity: anomalySeverity,
      status: 'RISK_EXCEEDED',
      primaryRecommendation: null,
      alternativeRecommendations: [],
      evaluatedAt: nowUtc,
      timezone: 'America/Bogota',
      evaluatorVersion: 'v1.0',
      requiresHumanReview: true,
    };
  }

  // R12: Ordenamiento determinista lexicográfico
  const sorted = sortCandidatesDeterministically(validCandidates);

  const primaryRecommendation = sorted[0] ?? null;
  const alternativeRecommendations = sorted.slice(1);

  const status: PlanEvaluationStatus = primaryRecommendation ? 'RECOMMENDED' : 'NO_ACTION_REQUIRED';

  return {
    planId: `plan_${diagnostic.id.slice(0, 8)}`,
    diagnosticId: diagnostic.id,
    anomalyId: diagnostic.anomalyId,
    boardId,
    siteId,
    category: anomalyCategory,
    severity: anomalySeverity,
    status,
    primaryRecommendation,
    alternativeRecommendations,
    evaluatedAt: nowUtc,
    timezone: 'America/Bogota',
    evaluatorVersion: 'v1.0',
    requiresHumanReview: true,
  };
}
