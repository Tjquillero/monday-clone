/**
 * Service: Operational Advisory & Recommendation Engine (v1.2)
 *
 * Naturaleza:
 * Read Model / Servicio Consultivo Puro en Memoria (0 persistencia, 0 DDL, 0 mutaciones).
 *
 * Axiomas de Gobierno:
 * 1. HECHO != MÉTRICA != PATRÓN != RECOMENDACIÓN != DECISIÓN != RESULTADO.
 * 2. Cero importaciones de Supabase o acceso a red (100% puro en memoria).
 * 3. Aislamiento total de Solver H8 (🔴 STRICTLY NO-GO).
 * 4. Toda recomendación generada permanece en estado 'PROPOSED'.
 * 5. Determinismo estricto de identidad: recommendationId no depende del timestamp.
 * 6. Honestidad epistemológica: projectedValue es estrictamente null en v1.
 */

import {
  OperationalMemoryAnalyticsResult,
  OperationalPatternResult,
  OperationalMetricResult,
  OperationalMetricKey,
} from '@/types/operationalMemory';
import {
  OperationalRecommendation,
  OperationalAdvisoryResult,
  AdvisoryOptions,
  RecommendationKey,
  RecommendationPriority,
  TargetEntityReference,
  ProposedAction,
  ProjectedImpact,
  SupportingMetricFact,
} from '@/types/operationalAdvisory';
import { round2 } from './realCostVarianceService';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers Puros de Identidad y Prioridad
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcula el ID unívoco determinista de la recomendación independiente del timestamp.
 */
export function computeRecommendationId(
  scopeType: string,
  scopeId: string,
  recommendationKey: RecommendationKey,
  entityId: string
): string {
  return `rec__${scopeType}__${scopeId}__${recommendationKey}__${entityId}`;
}

/**
 * Calcula la prioridad determinista basada exclusivamente en prevalencia y confianza empírica.
 */
export function computeRecommendationPriority(
  prevalenceRatio: number,
  confidenceScore: number
): RecommendationPriority {
  if (prevalenceRatio >= 0.85 || confidenceScore >= 0.80) {
    return 'HIGH';
  }
  if (prevalenceRatio >= 0.60 || confidenceScore >= 0.50) {
    return 'MEDIUM';
  }
  return 'LOW';
}

/**
 * Extrae los hechos métricos que sustentan un patrón desde la colección analítica.
 */
function extractSupportingMetrics(
  metricKeys: OperationalMetricKey[],
  allMetrics: OperationalMetricResult[]
): SupportingMetricFact[] {
  const metricMap = new Map<OperationalMetricKey, OperationalMetricResult>();
  for (const m of allMetrics) {
    metricMap.set(m.metricKey, m);
  }

  const result: SupportingMetricFact[] = [];
  for (const k of metricKeys) {
    const found = metricMap.get(k);
    if (found) {
      result.push({
        metricKey: k,
        value: found.value,
        unit: found.unit,
      });
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Generador Principal de Recomendaciones Consultivas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Función Principal Pura: Transforma los patrones y métricas deterministas en recomendaciones explicables.
 */
export function generateOperationalRecommendations(
  analyticsResult: OperationalMemoryAnalyticsResult,
  options?: AdvisoryOptions
): OperationalAdvisoryResult {
  const evaluatedAtIso = options?.evaluatedAt
    ? (typeof options.evaluatedAt === 'string' ? options.evaluatedAt : options.evaluatedAt.toISOString())
    : new Date().toISOString();

  const boardId = analyticsResult.boardId;
  const allPatterns = analyticsResult.patterns || [];
  const allMetrics = analyticsResult.metrics || [];

  // 1. Filtrar únicamente patrones formalmente detectados con evidencia suficiente
  const actionablePatterns = allPatterns.filter(
    (p) => p.detectionStatus === 'PATTERN_DETECTED'
  );

  const recommendations: OperationalRecommendation[] = [];

  for (const pattern of actionablePatterns) {
    const prevalence = pattern.empiricalEvidence.prevalenceRatio || 0;
    const confidence = pattern.confidenceScore || 0;
    const priority = computeRecommendationPriority(prevalence, confidence);
    const supportingMetrics = extractSupportingMetrics(pattern.supportingMetricKeys, allMetrics);

    // Mapeo por Familia de Recomendación
    switch (pattern.patternKey) {
      // ───────────────────────────────────────────────────────────────────────
      // R-01: AJUSTE_RENDIMIENTO (Disparado por P-01_SYSTEMATIC_UNDERESTIMATION)
      // ───────────────────────────────────────────────────────────────────────
      case 'P-01_SYSTEMATIC_UNDERESTIMATION': {
        const targetEntity: TargetEntityReference = {
          entityType: 'ACTIVITY',
          entityId: pattern.scope.scopeId,
          entityName: pattern.scope.scopeName || `Actividad ${pattern.scope.scopeId}`,
        };

        const rRealMetric = allMetrics.find((m) => m.metricKey === 'METRIC_PRODUCTIVITY_RATE');
        const rTeoMetric = allMetrics.find((m) => m.metricKey === 'METRIC_THEORETICAL_PRODUCTIVITY_RATE');
        const proposedRate = rRealMetric?.value ?? null;

        const proposedAction: ProposedAction = {
          actionType: 'ADVISE_STANDARD_REVISION',
          targetEntity,
          suggestedParameters: {
            proposedStandardRate: proposedRate,
            notes: 'Ajuste consultivo del rendimiento estándar de la actividad en el catálogo de estándares.',
          },
          applicableDomainGateway: 'poaService',
        };

        const projectedImpact: ProjectedImpact = {
          metricKey: 'METRIC_PRODUCTIVITY_RATE',
          currentObservedValue: rTeoMetric?.value ?? null,
          proposedTargetValue: proposedRate,
          projectedValue: null, // Honesto: null en v1
          unit: 'unidad/JR',
          expectedImprovementDescription: `Alinear el estándar técnico teórico (${rTeoMetric?.value ?? 'N/A'}) al rendimiento empírico observado (${proposedRate ?? 'N/A'} unidad/JR) para erradicar la sobreutilización de esfuerzo.`,
        };

        const recId = computeRecommendationId(
          pattern.scope.scopeType,
          pattern.scope.scopeId,
          'R-01_AJUSTE_RENDIMIENTO',
          targetEntity.entityId
        );

        recommendations.push({
          recommendationId: recId,
          recommendationKey: 'R-01_AJUSTE_RENDIMIENTO',
          priority,
          status: 'PROPOSED',
          scope: pattern.scope,
          triggeredPatternKey: pattern.patternKey,
          targetEntity,
          sampleSize: pattern.sampleSize,
          confidenceScore: pattern.confidenceScore,
          rationale: pattern.empiricalEvidence.summary,
          supportingMetrics,
          proposedAction,
          projectedImpact,
          generatedAtIso: evaluatedAtIso,
        });
        break;
      }

      // ───────────────────────────────────────────────────────────────────────
      // R-02: BALANCE_CUADRILLA (Disparado por P-02_CREW_PERFORMANCE_DISPERSION)
      // ───────────────────────────────────────────────────────────────────────
      case 'P-02_CREW_PERFORMANCE_DISPERSION': {
        const targetEntity: TargetEntityReference = {
          entityType: 'CREW',
          entityId: pattern.scope.scopeId,
          entityName: pattern.scope.scopeName || `Cuadrillas ${pattern.scope.scopeId}`,
        };

        // Regla de gobierno: Si P-02 demuestra dispersión general sin selección arbitraria, proposedTargetCrewId es null
        const proposedAction: ProposedAction = {
          actionType: 'ADVISE_CREW_REALLOCATION',
          targetEntity,
          suggestedParameters: {
            proposedTargetCrewId: null, // No se inventa cuadrilla sin ranking respaldado
            notes: 'Revisión y nivelación de asignación de cuadrillas ante dispersión de rendimiento observada.',
          },
          applicableDomainGateway: 'crewAssignmentService',
        };

        const cvObserved = round2(pattern.empiricalEvidence.prevalenceRatio * 100);
        const projectedImpact: ProjectedImpact = {
          metricKey: 'METRIC_PRODUCTIVITY_RATE',
          currentObservedValue: cvObserved,
          proposedTargetValue: 0, // Objetivo normativo: homogenización de rendimientos
          projectedValue: null,
          unit: '%',
          expectedImprovementDescription: 'Redistribuir o nivelar cuadrillas para reducir la dispersión de rendimiento entre frentes operativos.',
        };

        const recId = computeRecommendationId(
          pattern.scope.scopeType,
          pattern.scope.scopeId,
          'R-02_BALANCE_CUADRILLA',
          targetEntity.entityId
        );

        recommendations.push({
          recommendationId: recId,
          recommendationKey: 'R-02_BALANCE_CUADRILLA',
          priority,
          status: 'PROPOSED',
          scope: pattern.scope,
          triggeredPatternKey: pattern.patternKey,
          targetEntity,
          sampleSize: pattern.sampleSize,
          confidenceScore: pattern.confidenceScore,
          rationale: pattern.empiricalEvidence.summary,
          supportingMetrics,
          proposedAction,
          projectedImpact,
          generatedAtIso: evaluatedAtIso,
        });
        break;
      }

      // ───────────────────────────────────────────────────────────────────────
      // R-03: PROVISION_INSUMOS (Disparado por P-03_RESOURCE_CONSUMPTION_ANOMALY)
      // ───────────────────────────────────────────────────────────────────────
      case 'P-03_RESOURCE_CONSUMPTION_ANOMALY': {
        const targetEntity: TargetEntityReference = {
          entityType: 'RESOURCE',
          entityId: pattern.scope.scopeId,
          entityName: pattern.scope.scopeName || `Insumos ${pattern.scope.scopeId}`,
        };

        const ratioMetric = allMetrics.find((m) => m.metricKey === 'METRIC_RESOURCE_CONSUMPTION_RATIO');
        const deltaMetric = allMetrics.find((m) => m.metricKey === 'METRIC_RESOURCE_VARIANCE_DELTA');
        const proposedQuota = ratioMetric?.value ?? null;

        const proposedAction: ProposedAction = {
          actionType: 'ADVISE_RESOURCE_TEMPLATE_UPDATE',
          targetEntity,
          suggestedParameters: {
            proposedUnitQuota: proposedQuota,
            notes: 'Actualización de cuota de insumos planificados en plantilla de planeación semanal.',
          },
          applicableDomainGateway: 'weeklyPlanService', // weeklyPlanService, NO POD-01
        };

        const projectedImpact: ProjectedImpact = {
          metricKey: 'METRIC_RESOURCE_VARIANCE_DELTA',
          currentObservedValue: deltaMetric?.value ?? null,
          proposedTargetValue: 0, // Objetivo normativo: consumo balanceado (delta = 0)
          projectedValue: null,
          unit: deltaMetric?.unit ?? 'unidad',
          expectedImprovementDescription: 'Actualizar la cuota unitaria planificada del insumo conforme a la tasa empírica observada para evitar sobrecostos o desabastecimiento.',
        };

        const recId = computeRecommendationId(
          pattern.scope.scopeType,
          pattern.scope.scopeId,
          'R-03_PROVISION_INSUMOS',
          targetEntity.entityId
        );

        recommendations.push({
          recommendationId: recId,
          recommendationKey: 'R-03_PROVISION_INSUMOS',
          priority,
          status: 'PROPOSED',
          scope: pattern.scope,
          triggeredPatternKey: pattern.patternKey,
          targetEntity,
          sampleSize: pattern.sampleSize,
          confidenceScore: pattern.confidenceScore,
          rationale: pattern.empiricalEvidence.summary,
          supportingMetrics,
          proposedAction,
          projectedImpact,
          generatedAtIso: evaluatedAtIso,
        });
        break;
      }

      // ───────────────────────────────────────────────────────────────────────
      // R-04: DESDOBLAMIENTO_MULTIDIA (Disparado por P-04_HIDDEN_MULTIDAY_DRAG)
      // ───────────────────────────────────────────────────────────────────────
      case 'P-04_HIDDEN_MULTIDAY_DRAG': {
        const targetEntity: TargetEntityReference = {
          entityType: 'OCCURRENCE',
          entityId: pattern.scope.scopeId,
          entityName: pattern.scope.scopeName || `Actividad Multidía ${pattern.scope.scopeId}`,
        };

        const durationMetric = allMetrics.find((m) => m.metricKey === 'METRIC_MULTIDAY_DURATION_DAYS');
        const proposedDays = durationMetric?.value && durationMetric.value >= 2 ? durationMetric.value : 2;

        const proposedAction: ProposedAction = {
          actionType: 'ADVISE_MULTIDAY_PLANNING',
          targetEntity,
          suggestedParameters: {
            proposedPlannedDays: proposedDays,
            notes: 'Desdoblar la planificación de la actividad en múltiples jornadas continuas en el cronograma semanal.',
          },
          applicableDomainGateway: 'weeklyPlanService',
        };

        const projectedImpact: ProjectedImpact = {
          metricKey: 'METRIC_MULTIDAY_DURATION_DAYS',
          currentObservedValue: 1, // Planificado original
          proposedTargetValue: proposedDays,
          projectedValue: null,
          unit: 'días',
          expectedImprovementDescription: 'Planificar la actividad formalmente en múltiples jornadas para eliminar el arrastre operativo no programado y regularizar los jornales diarios.',
        };

        const recId = computeRecommendationId(
          pattern.scope.scopeType,
          pattern.scope.scopeId,
          'R-04_DESDOBLAMIENTO_MULTIDIA',
          targetEntity.entityId
        );

        recommendations.push({
          recommendationId: recId,
          recommendationKey: 'R-04_DESDOBLAMIENTO_MULTIDIA',
          priority,
          status: 'PROPOSED',
          scope: pattern.scope,
          triggeredPatternKey: pattern.patternKey,
          targetEntity,
          sampleSize: pattern.sampleSize,
          confidenceScore: pattern.confidenceScore,
          rationale: pattern.empiricalEvidence.summary,
          supportingMetrics,
          proposedAction,
          projectedImpact,
          generatedAtIso: evaluatedAtIso,
        });
        break;
      }

      // ───────────────────────────────────────────────────────────────────────
      // R-05: DISCREPANCIA_TRIDIMENSIONAL_MATERIALIZADA (P-05_DISCREPANCIA_MATERIALIZADA)
      // ───────────────────────────────────────────────────────────────────────
      case 'P-05_DISCREPANCIA_MATERIALIZADA': {
        const targetEntity: TargetEntityReference = {
          entityType: 'ACTIVITY',
          entityId: pattern.scope.scopeId,
          entityName: pattern.scope.scopeName || `Actividad ${pattern.scope.scopeId}`,
        };

        const ipMetric = allMetrics.find((m) => m.metricKey === 'METRIC_PRODUCTIVITY_INDEX');
        const ratioVal = ipMetric?.value ?? null;

        const proposedAction: ProposedAction = {
          actionType: 'ADVISE_MULTIDAY_PLANNING',
          targetEntity,
          suggestedParameters: {
            proposedUnitQuota: null,
            notes: 'Ajuste consultivo de programación por discrepancia tridimensional POA/Plan/Ejecución.',
          },
          applicableDomainGateway: 'weeklyPlanService',
        };

        const projectedImpact: ProjectedImpact = {
          metricKey: 'METRIC_PRODUCTIVITY_INDEX',
          currentObservedValue: ratioVal,
          proposedTargetValue: 1.0,
          projectedValue: null,
          unit: 'ratio',
          expectedImprovementDescription: 'Reconciliar la diferencia entre la planificación semanal materializada y la cuota contractual POA.',
        };

        const recId = computeRecommendationId(
          pattern.scope.scopeType,
          pattern.scope.scopeId,
          'R-05_DISCREPANCIA_TRIDIMENSIONAL_MATERIALIZADA',
          targetEntity.entityId
        );

        recommendations.push({
          recommendationId: recId,
          recommendationKey: 'R-05_DISCREPANCIA_TRIDIMENSIONAL_MATERIALIZADA',
          priority,
          status: 'PROPOSED',
          scope: pattern.scope,
          triggeredPatternKey: pattern.patternKey,
          targetEntity,
          sampleSize: pattern.sampleSize,
          confidenceScore: pattern.confidenceScore,
          rationale: pattern.empiricalEvidence.summary,
          supportingMetrics,
          proposedAction,
          projectedImpact,
          generatedAtIso: evaluatedAtIso,
        });
        break;
      }

      default:
        // Patrones no asociados a recomendaciones automáticas se ignoran limpiamente
        break;
    }
  }

  return {
    boardId,
    generatedAtIso: evaluatedAtIso,
    totalPatternsEvaluatedCount: allPatterns.length,
    actionablePatternsCount: actionablePatterns.length,
    recommendationsCount: recommendations.length,
    recommendations,
  };
}
