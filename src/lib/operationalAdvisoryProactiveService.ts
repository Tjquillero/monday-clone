/**
 * Service: Proactive Advisory Observer & 3D Discrepancy Analyzer (v1.0)
 *
 * Axioma de Gobierno:
 * HECHO != MÉTRICA != PATRÓN != RECOMENDACIÓN != DECISIÓN != RESULTADO
 *
 * Naturaleza:
 * Servicio Analítico Consultivo Puro en Memoria (0 persistencia, 0 DDL, 0 mutaciones Supabase).
 * Aislamiento total de Solver H8 (🔴 STRICTLY NO-GO).
 *
 * Responsabilidad:
 * Analiza la frontera tridimensional:
 * POA Contractual ↔ WeeklyPlan Materializado ↔ ExecutionRecord Observado
 * y detecta P-05_DISCREPANCIA_MATERIALIZADA para proponer R-05_DISCREPANCIA_TRIDIMENSIONAL_MATERIALIZADA.
 */

import {
  OperationalRecommendation,
  OperationalAdvisoryResult,
  AdvisoryOptions,
  TargetEntityReference,
  ProposedAction,
  ProjectedImpact,
  SupportingMetricFact,
} from '@/types/operationalAdvisory';
import {
  ProactiveObserverEvent,
  computePatternFingerprint,
} from '@/types/proactiveAdvisory';
import { DecisionRecord } from '@/types/decisionGovernance';
import { WeeklyPlanItem } from '@/types/weeklyPlan';
import { ExecutionRecord } from '@/types/execution';
import { round2 } from './realCostVarianceService';
import {
  computeRecommendationId,
  computeRecommendationPriority,
} from './operationalAdvisoryService';

export interface POAItemContract {
  activityKey: string;
  name: string;
  zone: string;
  unit: string;
  contractualQty: number;
  contractualFrequency?: number | null;
  unitPrice?: number;
}

export interface ProactiveDiscrepancyEvaluationInput {
  boardId: string;
  poaItems: POAItemContract[];
  weeklyPlanItems: WeeklyPlanItem[];
  executionRecords: ExecutionRecord[];
  priorDecisions?: DecisionRecord[];
  options?: AdvisoryOptions;
}

/**
 * Función Analítica Pura: Evalúa discrepancias tridimensionales POA ↔ WeeklyPlan ↔ Execution
 * y retorna recomendaciones R-05 filtradas por el historial de decisiones registradas.
 */
export function evaluateProactive3DDiscrepancies(
  input: ProactiveDiscrepancyEvaluationInput
): OperationalAdvisoryResult {
  const {
    boardId,
    poaItems,
    weeklyPlanItems,
    executionRecords,
    priorDecisions = [],
    options,
  } = input;

  const evaluatedAtIso = options?.evaluatedAt
    ? typeof options.evaluatedAt === 'string'
      ? options.evaluatedAt
      : options.evaluatedAt.toISOString()
    : new Date().toISOString();

  // 1. Indexar POA por (activityKey + zone) o por activityKey
  const poaMap = new Map<string, { contractualQty: number; name: string; unit: string; zone: string }>();
  for (const poa of poaItems) {
    const key = `${poa.activityKey}__${poa.zone}`;
    const existing = poaMap.get(key);
    if (existing) {
      existing.contractualQty += poa.contractualQty;
    } else {
      poaMap.set(key, {
        contractualQty: poa.contractualQty,
        name: poa.name,
        unit: poa.unit,
        zone: poa.zone,
      });
    }
  }

  // 2. Indexar WeeklyPlan por (activity_key + zone)
  const planMap = new Map<string, { totalPlannedQty: number; items: WeeklyPlanItem[] }>();
  for (const item of weeklyPlanItems) {
    const key = `${item.activity_key}__${item.zone}`;
    const existing = planMap.get(key);
    if (existing) {
      existing.totalPlannedQty += item.planned_qty;
      existing.items.push(item);
    } else {
      planMap.set(key, {
        totalPlannedQty: item.planned_qty,
        items: [item],
      });
    }
  }

  // 3. Indexar Ejecuciones por weekly_plan_item_id
  const execMap = new Map<string, number>();
  for (const exec of executionRecords) {
    if (exec.verification_status !== 'rejected') {
      const current = execMap.get(exec.weekly_plan_item_id) || 0;
      execMap.set(exec.weekly_plan_item_id, current + exec.executed_qty);
    }
  }

  // 4. Indexar Decisiones Previas para Filtrado de Ciclo de Vida
  const resolvedDecisionFingerprints = new Set<string>();
  const resolvedRecommendationIds = new Set<string>();

  for (const dec of priorDecisions) {
    if (dec.boardId === boardId) {
      // Filtrar decididos: ACCEPTED, REJECTED o POSTPONED activo
      if (dec.decisionStatus === 'ACCEPTED' || dec.decisionStatus === 'REJECTED') {
        resolvedRecommendationIds.add(dec.recommendationId);
        if (dec.recommendationSnapshot) {
          const rec = dec.recommendationSnapshot;
          const fp = computePatternFingerprint(boardId, dec.recommendationKey, rec.targetEntity.entityId);
          resolvedDecisionFingerprints.add(fp);
        }
      } else if (dec.decisionStatus === 'POSTPONED' && dec.postponedUntilIso) {
        if (new Date(dec.postponedUntilIso).getTime() > new Date(evaluatedAtIso).getTime()) {
          resolvedRecommendationIds.add(dec.recommendationId);
          if (dec.recommendationSnapshot) {
            const rec = dec.recommendationSnapshot;
            const fp = computePatternFingerprint(boardId, dec.recommendationKey, rec.targetEntity.entityId);
            resolvedDecisionFingerprints.add(fp);
          }
        }
      }
    }
  }

  const recommendations: OperationalRecommendation[] = [];
  let totalPatternsEvaluatedCount = 0;
  let actionablePatternsCount = 0;

  // 5. Comparar cada clave (activityKey + zone) en el Plan con la cuota POA
  for (const [key, planData] of planMap.entries()) {
    totalPatternsEvaluatedCount++;
    const [activityKey, zone] = key.split('__');
    const poaData = poaMap.get(key) || { contractualQty: 0, name: planData.items[0]?.name || activityKey, unit: planData.items[0]?.unit || 'UND', zone };

    const contractualQty = poaData.contractualQty;
    const materializedQty = planData.totalPlannedQty;

    // Calcular ejecuciones consolidadas para esta actividad/zona
    let executedQty = 0;
    for (const item of planData.items) {
      executedQty += execMap.get(item.id) || 0;
    }

    // Calcular Ratio de Discrepancia Tridimensional D
    const ratioD = contractualQty > 0 ? materializedQty / contractualQty : 1.0;

    // Criterio de Disparador P-05: Plan Materializado excede POA (>1.10 ratio) o discrepancia cuantificable
    const isDiscrepancyDetected = contractualQty > 0 && materializedQty > contractualQty * 1.05;

    if (isDiscrepancyDetected) {
      actionablePatternsCount++;

      const entityId = `${activityKey}__${zone}`;
      const recId = computeRecommendationId('BOARD', boardId, 'R-05_DISCREPANCIA_TRIDIMENSIONAL_MATERIALIZADA', entityId);
      const patternFp = computePatternFingerprint(boardId, 'R-05_DISCREPANCIA_TRIDIMENSIONAL_MATERIALIZADA', entityId);

      // Aplicar compuerta de supresión por decisión previa (G4 / G5)
      if (resolvedRecommendationIds.has(recId) || resolvedDecisionFingerprints.has(patternFp)) {
        continue;
      }

      const priority = computeRecommendationPriority(ratioD >= 1.25 ? 0.90 : 0.70, 0.85);

      const targetEntity: TargetEntityReference = {
        entityType: 'ACTIVITY',
        entityId,
        entityName: `${poaData.name} (${zone})`,
      };

      const supportingMetrics: SupportingMetricFact[] = [
        {
          metricKey: 'METRIC_PRODUCTIVITY_INDEX',
          value: round2(ratioD),
          unit: 'ratio',
        },
        {
          metricKey: 'METRIC_EFFORT_VARIANCE_JR',
          value: round2(materializedQty - contractualQty),
          unit: poaData.unit,
        },
      ];

      const proposedAction: ProposedAction = {
        actionType: 'ADVISE_MULTIDAY_PLANNING',
        targetEntity,
        suggestedParameters: {
          proposedUnitQuota: contractualQty,
          notes: `Reconciliar materialización de ${materializedQty} ${poaData.unit} frente al cupo contractual de ${contractualQty} ${poaData.unit} en POA.`,
        },
        applicableDomainGateway: 'weeklyPlanService',
      };

      const projectedImpact: ProjectedImpact = {
        metricKey: 'METRIC_PRODUCTIVITY_INDEX',
        currentObservedValue: round2(ratioD),
        proposedTargetValue: 1.0,
        projectedValue: null, // Epistemológicamente null en v1
        unit: 'ratio',
        expectedImprovementDescription: `Alinear la programación semanal (${materializedQty} ${poaData.unit}) con la cuota contractual POA (${contractualQty} ${poaData.unit}) para evitar desviaciones operativas.`,
      };

      recommendations.push({
        recommendationId: recId,
        recommendationKey: 'R-05_DISCREPANCIA_TRIDIMENSIONAL_MATERIALIZADA',
        priority,
        status: 'PROPOSED',
        scope: {
          scopeType: 'BOARD',
          scopeId: boardId,
          scopeName: `Tablero ${boardId}`,
        },
        triggeredPatternKey: 'P-05_DISCREPANCIA_MATERIALIZADA',
        targetEntity,
        sampleSize: planData.items.length,
        confidenceScore: 0.85,
        rationale: `Se detectó una discrepancia tridimensional en la actividad ${poaData.name} (${zone}): la cantidad materializada en el plan (${materializedQty} ${poaData.unit}) supera la cuota contractual POA (${contractualQty} ${poaData.unit}) con un ratio de ${round2(ratioD)}. Ejecutado a la fecha: ${executedQty} ${poaData.unit}.`,
        supportingMetrics,
        proposedAction,
        projectedImpact,
        generatedAtIso: evaluatedAtIso,
      });
    }
  }

  return {
    boardId,
    generatedAtIso: evaluatedAtIso,
    totalPatternsEvaluatedCount,
    actionablePatternsCount,
    recommendationsCount: recommendations.length,
    recommendations,
  };
}

/**
 * Dispatcher reactivo / handler de eventos proactivos (sin polling, 0 setInterval).
 */
export function handleProactiveEvent(
  event: ProactiveObserverEvent,
  evaluationInput: Omit<ProactiveDiscrepancyEvaluationInput, 'boardId'>
): OperationalAdvisoryResult {
  const boardId = event.scopeId;
  return evaluateProactive3DDiscrepancies({
    boardId,
    ...evaluationInput,
  });
}
