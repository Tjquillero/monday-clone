/**
 * Service: Outcome Evaluation Service (v1)
 *
 * Axioma Rector:
 * RECOMENDACIÓN != DECISIÓN != ACCIÓN != RESULTADO != EVALUACIÓN
 *
 * Naturaleza:
 * Read Model / Evaluador Determinista Puro basado en hechos físicos verificados.
 * Desacoplado explícitamente de afirmaciones causales mecanicistas inductivas.
 *
 * Consumo Soberano:
 * - Días laborales y feriados colombianos (ADR-0007 / America/Bogota).
 * - Llaves canónicas de OperationalMetricKey de Analytics v1.
 * - Hechos físicos verificados (verification_status = 'verified').
 */

import { DecisionRecord } from '../types/decisionGovernance';
import {
  OutcomeEvaluationRecord,
  EvaluationStatus,
  EvaluationRuleVersion,
  EvaluationCohort,
  OutcomeEvaluationOptions,
} from '../types/outcomeEvaluation';
import { RecommendationKey } from '../types/operationalAdvisory';
import { isColombianHoliday } from './colombianHolidays';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Tipos de Hechos de Entrada para Evaluación
// ─────────────────────────────────────────────────────────────────────────────

export interface VerifiedExecutionFact {
  executionId: string;
  occurrenceKey: string;
  activityKey: string;
  crewId?: string | null;
  reportedDate: string; // YYYY-MM-DD
  verifiedQty: number;
  verifiedJr: number;
  theoreticalJr: number;
  plannedQty: number;
  verificationStatus: 'verified' | 'rejected' | 'pending';
  usedResources?: Array<{
    resourceKey: string;
    usedQty: number;
    requiredQty?: number | null;
    unit?: string;
  }>;
}

export interface OutcomeEvaluationInput {
  decisionRecord: DecisionRecord;
  executions: VerifiedExecutionFact[];
  options?: OutcomeEvaluationOptions;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Utilidades de Calendario Laboral Soberano (ADR-0007 / America/Bogota)
// ─────────────────────────────────────────────────────────────────────────────

export function isOperationalWorkingDay(dateInput: Date | string): boolean {
  const d = typeof dateInput === 'string' ? new Date(dateInput.slice(0, 10) + 'T12:00:00Z') : dateInput;
  const dayOfWeek = d.getUTCDay(); // 0 = Domingo, 6 = Sábado
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  return !isColombianHoliday(d);
}

export function addOperationalWorkingDays(startDateIso: string, workingDays: number): string {
  let curr = new Date(startDateIso.slice(0, 10) + 'T12:00:00Z');
  let added = 0;

  if (workingDays === 0) {
    while (!isOperationalWorkingDay(curr)) {
      curr.setUTCDate(curr.getUTCDate() + 1);
    }
    return curr.toISOString().slice(0, 10);
  }

  while (added < workingDays) {
    curr.setUTCDate(curr.getUTCDate() + 1);
    if (isOperationalWorkingDay(curr)) {
      added++;
    }
  }

  return curr.toISOString().slice(0, 10);
}

export function subtractOperationalWorkingDays(endDateIso: string, workingDays: number): string {
  let curr = new Date(endDateIso.slice(0, 10) + 'T12:00:00Z');
  let subtracted = 0;

  while (subtracted < workingDays) {
    curr.setUTCDate(curr.getUTCDate() - 1);
    if (isOperationalWorkingDay(curr)) {
      subtracted++;
    }
  }

  return curr.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Ventanas Temporales y Parámetros por Familia de Recomendación
// ─────────────────────────────────────────────────────────────────────────────

export interface FamilyWindowConfig {
  baselineWorkingDays: number;
  lagWorkingDays: number;
  evaluationWorkingDays: number;
  minSampleSize: number;
  ruleVersion: EvaluationRuleVersion;
}

export const FAMILY_WINDOW_CONFIGS: Record<RecommendationKey, FamilyWindowConfig> = {
  'R-01_AJUSTE_RENDIMIENTO': {
    baselineWorkingDays: 20,
    lagWorkingDays: 2,
    evaluationWorkingDays: 20,
    minSampleSize: 3,
    ruleVersion: 'R01_IP_TARGET_OR_DELTA@v1.0',
  },
  'R-02_BALANCE_CUADRILLA': {
    baselineWorkingDays: 15,
    lagWorkingDays: 1,
    evaluationWorkingDays: 15,
    minSampleSize: 4, // 2 cuadrillas * 2 ejecuciones min
    ruleVersion: 'R02_CREW_CV_REDUCTION_AND_THRESHOLD@v1.0',
  },
  'R-03_PROVISION_INSUMOS': {
    baselineWorkingDays: 15,
    lagWorkingDays: 1,
    evaluationWorkingDays: 15,
    minSampleSize: 3,
    ruleVersion: 'R03_RESOURCE_VARIANCE_CONVERGENCE@v1.0',
  },
  'R-04_DESDOBLAMIENTO_MULTIDIA': {
    baselineWorkingDays: 20,
    lagWorkingDays: 0,
    evaluationWorkingDays: 20,
    minSampleSize: 3,
    ruleVersion: 'R04_UNPLANNED_OVERRUN_ELIMINATION@v1.0',
  },
  'R-05_DISCREPANCIA_TRIDIMENSIONAL_MATERIALIZADA': {
    baselineWorkingDays: 20,
    lagWorkingDays: 1,
    evaluationWorkingDays: 20,
    minSampleSize: 3,
    ruleVersion: 'R05_3D_DISCREPANCY_RECONCILIATION@v1.0',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. Servicio Evaluador Determinista
// ─────────────────────────────────────────────────────────────────────────────

export class OutcomeEvaluationService {
  /**
   * Evalúa de forma pura y determinista el resultado observado de una decisión humana.
   */
  public static evaluateOutcome(input: OutcomeEvaluationInput): OutcomeEvaluationRecord {
    const { decisionRecord, executions, options } = input;
    const rec = decisionRecord.recommendationSnapshot;
    const recKey = rec.recommendationKey;
    const config = FAMILY_WINDOW_CONFIGS[recKey];
    const evaluatedAtIso = options?.evaluatedAt
      ? (typeof options.evaluatedAt === 'string' ? options.evaluatedAt : options.evaluatedAt.toISOString())
      : (decisionRecord.executionSnapshot?.appliedAtIso || decisionRecord.decisionTimestamp);

    const baseRecord: Partial<OutcomeEvaluationRecord> = {
      evaluationId: `eval__${decisionRecord.id}__${config.ruleVersion}`,
      decisionId: decisionRecord.id,
      recommendationId: rec.recommendationId,
      recommendationKey: recKey,
      ruleVersion: config.ruleVersion,
      evaluatedAtIso,
      causalDisclaimer: 'Observed delta reflects empirical difference between cohorts; does not constitute inductive causal proof.',
    };

    // 1. Validar No-Aplicabilidad por Estado de Decisión o Acción
    if (decisionRecord.decisionStatus === 'REJECTED') {
      return {
        ...baseRecord,
        evaluationStatus: 'NOT_APPLICABLE',
        nonApplicableReason: 'DECISION_REJECTED',
        cohort: this.buildEmptyCohort(decisionRecord),
        metricComparison: {
          metricKey: rec.projectedImpact.metricKey as any,
          preObservedValue: null,
          postObservedValue: null,
          observedDelta: null,
          unit: rec.projectedImpact.unit,
        },
        sampleMetrics: { baselineSampleSize: 0, postSampleSize: 0 },
      } as OutcomeEvaluationRecord;
    }

    if (decisionRecord.decisionStatus === 'POSTPONED') {
      return {
        ...baseRecord,
        evaluationStatus: 'NOT_APPLICABLE',
        nonApplicableReason: 'DECISION_POSTPONED',
        cohort: this.buildEmptyCohort(decisionRecord),
        metricComparison: {
          metricKey: rec.projectedImpact.metricKey as any,
          preObservedValue: null,
          postObservedValue: null,
          observedDelta: null,
          unit: rec.projectedImpact.unit,
        },
        sampleMetrics: { baselineSampleSize: 0, postSampleSize: 0 },
      } as OutcomeEvaluationRecord;
    }

    if (decisionRecord.actionStatus === 'EXECUTION_FAILED') {
      return {
        ...baseRecord,
        evaluationStatus: 'NOT_APPLICABLE',
        nonApplicableReason: 'ACTION_EXECUTION_FAILED',
        cohort: this.buildEmptyCohort(decisionRecord),
        metricComparison: {
          metricKey: rec.projectedImpact.metricKey as any,
          preObservedValue: null,
          postObservedValue: null,
          observedDelta: null,
          unit: rec.projectedImpact.unit,
        },
        sampleMetrics: { baselineSampleSize: 0, postSampleSize: 0 },
      } as OutcomeEvaluationRecord;
    }

    if (decisionRecord.actionStatus === 'PENDING_EXECUTION') {
      return {
        ...baseRecord,
        evaluationStatus: 'NOT_APPLICABLE',
        nonApplicableReason: 'ACTION_PENDING',
        cohort: this.buildEmptyCohort(decisionRecord),
        metricComparison: {
          metricKey: rec.projectedImpact.metricKey as any,
          preObservedValue: null,
          postObservedValue: null,
          observedDelta: null,
          unit: rec.projectedImpact.unit,
        },
        sampleMetrics: { baselineSampleSize: 0, postSampleSize: 0 },
      } as OutcomeEvaluationRecord;
    }

    // 2. Construcción Determinista de Ventanas Operativas
    const actionDateIso = (decisionRecord.executionSnapshot?.appliedAtIso || decisionRecord.decisionTimestamp).slice(0, 10);
    const baselineEndIso = actionDateIso;
    const baselineStartIso = subtractOperationalWorkingDays(baselineEndIso, config.baselineWorkingDays);
    const evaluationStartIso = addOperationalWorkingDays(actionDateIso, config.lagWorkingDays);
    const evaluationEndIso = addOperationalWorkingDays(evaluationStartIso, config.evaluationWorkingDays);

    // 3. Filtrado de Hechos Físicos Verificados y Asignación de Cohortes
    const verifiedExecs = executions.filter(e => e.verificationStatus === 'verified');
    const targetEntityId = rec.targetEntity.entityId;
    const resourceKey = recKey === 'R-03_PROVISION_INSUMOS' ? targetEntityId : null;

    const relevantExecs = verifiedExecs.filter(e => {
      if (recKey === 'R-01_AJUSTE_RENDIMIENTO') return e.activityKey === targetEntityId;
      if (recKey === 'R-02_BALANCE_CUADRILLA') return e.activityKey === rec.scope.scopeId || e.crewId === targetEntityId;
      if (recKey === 'R-03_PROVISION_INSUMOS') {
        return e.activityKey === rec.scope.scopeId && (e.usedResources || []).some(r => r.resourceKey === resourceKey);
      }
      if (recKey === 'R-04_DESDOBLAMIENTO_MULTIDIA') return e.occurrenceKey === targetEntityId || e.activityKey === rec.scope.scopeId;
      return true;
    });

    const baselineCohortExecs = relevantExecs.filter(e => e.reportedDate >= baselineStartIso && e.reportedDate <= baselineEndIso);
    const postCohortExecs = relevantExecs.filter(e => e.reportedDate >= evaluationStartIso && e.reportedDate <= evaluationEndIso);

    const cohort: EvaluationCohort = {
      cohortDefinitionVersion: 'COHORT_V1.0',
      baselineExecutionIds: baselineCohortExecs.map(e => e.executionId),
      postExecutionIds: postCohortExecs.map(e => e.executionId),
      baselineOccurrencesCount: new Set(baselineCohortExecs.map(e => e.occurrenceKey)).size,
      postOccurrencesCount: new Set(postCohortExecs.map(e => e.occurrenceKey)).size,
      selectionCriteria: {
        boardId: decisionRecord.boardId,
        targetEntity: rec.targetEntity,
        resourceKey,
        baselineWindow: { startIso: baselineStartIso, endIso: baselineEndIso },
        evaluationWindow: { startIso: evaluationStartIso, endIso: evaluationEndIso },
        verificationFilter: 'VERIFIED_ONLY',
      },
    };

    // 4. Evaluación de Reglas Matemáticas Específicas
    switch (recKey) {
      case 'R-01_AJUSTE_RENDIMIENTO':
        return this.evaluateR01(baseRecord, cohort, baselineCohortExecs, postCohortExecs, config);

      case 'R-02_BALANCE_CUADRILLA':
        return this.evaluateR02(baseRecord, cohort, baselineCohortExecs, postCohortExecs, config);

      case 'R-03_PROVISION_INSUMOS':
        return this.evaluateR03(baseRecord, cohort, baselineCohortExecs, postCohortExecs, resourceKey!, config);

      case 'R-04_DESDOBLAMIENTO_MULTIDIA':
        return this.evaluateR04(baseRecord, cohort, baselineCohortExecs, postCohortExecs, config);

      default:
        throw new Error(`UNKNOWN_RECOMMENDATION_KEY: ${recKey}`);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Regla R-01: Ajuste de Rendimiento (IP >= 0.90 OR Delta >= +0.20)
  // ───────────────────────────────────────────────────────────────────────────
  private static evaluateR01(
    base: Partial<OutcomeEvaluationRecord>,
    cohort: EvaluationCohort,
    baselineExecs: VerifiedExecutionFact[],
    postExecs: VerifiedExecutionFact[],
    config: FamilyWindowConfig
  ): OutcomeEvaluationRecord {
    const postSample = postExecs.length;

    if (postSample < config.minSampleSize) {
      return {
        ...base,
        cohort,
        evaluationStatus: 'INCONCLUSIVE',
        inconclusiveReason: 'INSUFFICIENT_POST_SAMPLE_SIZE',
        metricComparison: {
          metricKey: 'METRIC_PRODUCTIVITY_INDEX',
          preObservedValue: this.calcIp(baselineExecs),
          postObservedValue: this.calcIp(postExecs),
          observedDelta: null,
          unit: 'adimensional',
        },
        sampleMetrics: { baselineSampleSize: baselineExecs.length, postSampleSize: postSample },
      } as OutcomeEvaluationRecord;
    }

    const preIp = this.calcIp(baselineExecs);
    const postIp = this.calcIp(postExecs)!;
    const delta = preIp !== null ? Number((postIp - preIp).toFixed(4)) : null;

    const isEffective = postIp >= 0.90 || (delta !== null && delta >= 0.20);

    return {
      ...base,
      cohort,
      evaluationStatus: isEffective ? 'EFFECTIVE' : 'INEFFECTIVE',
      metricComparison: {
        metricKey: 'METRIC_PRODUCTIVITY_INDEX',
        preObservedValue: preIp,
        postObservedValue: postIp,
        observedDelta: delta,
        unit: 'adimensional',
      },
      sampleMetrics: { baselineSampleSize: baselineExecs.length, postSampleSize: postSample },
    } as OutcomeEvaluationRecord;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Regla R-02: Balance de Cuadrilla (CV < 0.15 AND Delta CV >= 40%)
  // ───────────────────────────────────────────────────────────────────────────
  private static evaluateR02(
    base: Partial<OutcomeEvaluationRecord>,
    cohort: EvaluationCohort,
    baselineExecs: VerifiedExecutionFact[],
    postExecs: VerifiedExecutionFact[],
    config: FamilyWindowConfig
  ): OutcomeEvaluationRecord {
    const crewsPost = this.groupExecsByCrew(postExecs);
    const distinctCrewsCount = Object.keys(crewsPost).length;
    const hasMinExecsPerCrew = Object.values(crewsPost).every(execs => execs.length >= 2);

    if (distinctCrewsCount < 2 || !hasMinExecsPerCrew) {
      return {
        ...base,
        cohort,
        evaluationStatus: 'INCONCLUSIVE',
        inconclusiveReason: distinctCrewsCount < 2 ? 'INSUFFICIENT_CREW_COUNT' : 'INSUFFICIENT_EXECUTIONS_PER_CREW',
        metricComparison: {
          metricKey: 'METRIC_PRODUCTIVITY_RATE',
          preObservedValue: this.calcCrewCv(baselineExecs),
          postObservedValue: this.calcCrewCv(postExecs),
          observedDelta: null,
          unit: 'CV',
        },
        sampleMetrics: {
          baselineSampleSize: baselineExecs.length,
          postSampleSize: postExecs.length,
          distinctCrewsEvaluatedCount: distinctCrewsCount,
        },
      } as OutcomeEvaluationRecord;
    }

    const preCv = this.calcCrewCv(baselineExecs);
    const postCv = this.calcCrewCv(postExecs)!;
    const delta = preCv !== null ? Number((postCv - preCv).toFixed(4)) : null;

    const cvReductionRatio = preCv !== null && preCv > 0 ? (preCv - postCv) / preCv : null;
    const isEffective = postCv < 0.15 && cvReductionRatio !== null && cvReductionRatio >= 0.40;

    return {
      ...base,
      cohort,
      evaluationStatus: isEffective ? 'EFFECTIVE' : 'INEFFECTIVE',
      metricComparison: {
        metricKey: 'METRIC_PRODUCTIVITY_RATE',
        preObservedValue: preCv,
        postObservedValue: postCv,
        observedDelta: delta,
        unit: 'CV',
      },
      sampleMetrics: {
        baselineSampleSize: baselineExecs.length,
        postSampleSize: postExecs.length,
        distinctCrewsEvaluatedCount: distinctCrewsCount,
      },
    } as OutcomeEvaluationRecord;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Regla R-03: Provisión de Insumos (|Delta post| <= 5% OR Delta Reducido >= 50%)
  // ───────────────────────────────────────────────────────────────────────────
  private static evaluateR03(
    base: Partial<OutcomeEvaluationRecord>,
    cohort: EvaluationCohort,
    baselineExecs: VerifiedExecutionFact[],
    postExecs: VerifiedExecutionFact[],
    resourceKey: string,
    config: FamilyWindowConfig
  ): OutcomeEvaluationRecord {
    const postSample = postExecs.length;

    if (postSample < config.minSampleSize) {
      return {
        ...base,
        cohort,
        evaluationStatus: 'INCONCLUSIVE',
        inconclusiveReason: 'INSUFFICIENT_POST_SAMPLE_SIZE',
        metricComparison: {
          metricKey: 'METRIC_RESOURCE_VARIANCE_DELTA',
          preObservedValue: this.calcResourceVariance(baselineExecs, resourceKey),
          postObservedValue: this.calcResourceVariance(postExecs, resourceKey),
          observedDelta: null,
          unit: 'recurso_unit',
        },
        sampleMetrics: { baselineSampleSize: baselineExecs.length, postSampleSize: postSample },
      } as OutcomeEvaluationRecord;
    }

    const preVariance = this.calcResourceVariance(baselineExecs, resourceKey);
    const postVariance = this.calcResourceVariance(postExecs, resourceKey)!;
    const delta = preVariance !== null ? Number((postVariance - preVariance).toFixed(4)) : null;

    // Tolerancia 5% o reducción del 50% de la desviación observada previa
    const isEffective = Math.abs(postVariance) <= 0.05 || (preVariance !== null && Math.abs(postVariance) <= 0.50 * Math.abs(preVariance));

    return {
      ...base,
      cohort,
      evaluationStatus: isEffective ? 'EFFECTIVE' : 'INEFFECTIVE',
      metricComparison: {
        metricKey: 'METRIC_RESOURCE_VARIANCE_DELTA',
        preObservedValue: preVariance,
        postObservedValue: postVariance,
        observedDelta: delta,
        unit: 'recurso_unit',
      },
      sampleMetrics: { baselineSampleSize: baselineExecs.length, postSampleSize: postSample },
    } as OutcomeEvaluationRecord;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Regla R-04: Desdoblamiento Multidía (unplannedOverrunDays = 0 en 100% post)
  // ───────────────────────────────────────────────────────────────────────────
  private static evaluateR04(
    base: Partial<OutcomeEvaluationRecord>,
    cohort: EvaluationCohort,
    baselineExecs: VerifiedExecutionFact[],
    postExecs: VerifiedExecutionFact[],
    config: FamilyWindowConfig
  ): OutcomeEvaluationRecord {
    const postOccurrences = this.groupExecsByOccurrence(postExecs);
    const postOccurrencesCount = Object.keys(postOccurrences).length;

    if (postOccurrencesCount < config.minSampleSize) {
      return {
        ...base,
        cohort,
        evaluationStatus: 'INCONCLUSIVE',
        inconclusiveReason: 'INSUFFICIENT_POST_SAMPLE_SIZE',
        metricComparison: {
          metricKey: 'METRIC_MULTIDAY_DURATION_DAYS',
          preObservedValue: this.calcAvgOverrun(baselineExecs),
          postObservedValue: this.calcAvgOverrun(postExecs),
          observedDelta: null,
          unit: 'días_overrun',
        },
        sampleMetrics: {
          baselineSampleSize: Object.keys(this.groupExecsByOccurrence(baselineExecs)).length,
          postSampleSize: postOccurrencesCount,
        },
      } as OutcomeEvaluationRecord;
    }

    const preAvgOverrun = this.calcAvgOverrun(baselineExecs);
    const postAvgOverrun = this.calcAvgOverrun(postExecs)!;
    const delta = preAvgOverrun !== null ? Number((postAvgOverrun - preAvgOverrun).toFixed(4)) : null;

    // Efectivo si el 100% de las ocurrencias post tuvieron overrun = 0
    let allZeroOverrun = true;
    for (const occKey of Object.keys(postOccurrences)) {
      const execs = postOccurrences[occKey];
      const distinctDays = new Set(execs.map(e => e.reportedDate)).size;
      const plannedDays = execs[0]?.plannedQty ? 2 : 1; // 2 días planificados tras desdoblamiento
      const overrun = Math.max(0, distinctDays - plannedDays);
      if (overrun > 0) {
        allZeroOverrun = false;
        break;
      }
    }

    return {
      ...base,
      cohort,
      evaluationStatus: allZeroOverrun ? 'EFFECTIVE' : 'INEFFECTIVE',
      metricComparison: {
        metricKey: 'METRIC_MULTIDAY_DURATION_DAYS',
        preObservedValue: preAvgOverrun,
        postObservedValue: postAvgOverrun,
        observedDelta: delta,
        unit: 'días_overrun',
      },
      sampleMetrics: {
        baselineSampleSize: Object.keys(this.groupExecsByOccurrence(baselineExecs)).length,
        postSampleSize: postOccurrencesCount,
      },
    } as OutcomeEvaluationRecord;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Cálculos Matemáticos Auxiliares
  // ───────────────────────────────────────────────────────────────────────────

  private static calcIp(execs: VerifiedExecutionFact[]): number | null {
    if (execs.length === 0) return null;
    const totalVerifiedQty = execs.reduce((sum, e) => sum + e.verifiedQty, 0);
    const totalVerifiedJr = execs.reduce((sum, e) => sum + e.verifiedJr, 0);
    const totalTheoreticalJr = execs.reduce((sum, e) => sum + e.theoreticalJr, 0);

    if (totalVerifiedJr === 0 || totalTheoreticalJr === 0) return null;

    const rReal = totalVerifiedQty / totalVerifiedJr;
    const rTeo = totalVerifiedQty / totalTheoreticalJr;
    return Number((rReal / rTeo).toFixed(4));
  }

  private static calcCrewCv(execs: VerifiedExecutionFact[]): number | null {
    const crews = this.groupExecsByCrew(execs);
    const rates: number[] = [];

    for (const crewId of Object.keys(crews)) {
      const crewExecs = crews[crewId];
      const totalQty = crewExecs.reduce((sum, e) => sum + e.verifiedQty, 0);
      const totalJr = crewExecs.reduce((sum, e) => sum + e.verifiedJr, 0);
      if (totalJr > 0) {
        rates.push(totalQty / totalJr);
      }
    }

    if (rates.length < 2) return null;

    const mean = rates.reduce((sum, r) => sum + r, 0) / rates.length;
    if (mean === 0) return 0;

    const variance = rates.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / rates.length;
    const stdDev = Math.sqrt(variance);
    return Number((stdDev / mean).toFixed(4));
  }

  private static calcResourceVariance(execs: VerifiedExecutionFact[], resourceKey: string): number | null {
    if (execs.length === 0) return null;
    let totalUsed = 0;
    let totalReq = 0;

    for (const e of execs) {
      const res = (e.usedResources || []).find(r => r.resourceKey === resourceKey);
      if (res) {
        totalUsed += res.usedQty;
        totalReq += (res.requiredQty || 0);
      }
    }

    if (totalReq === 0 && totalUsed === 0) return 0;
    if (totalReq === 0) return Number(totalUsed.toFixed(4));
    return Number(((totalUsed - totalReq) / totalReq).toFixed(4));
  }

  private static calcAvgOverrun(execs: VerifiedExecutionFact[]): number | null {
    const occs = this.groupExecsByOccurrence(execs);
    const occKeys = Object.keys(occs);
    if (occKeys.length === 0) return null;

    let totalOverrun = 0;
    for (const k of occKeys) {
      const occExecs = occs[k];
      const distinctDays = new Set(occExecs.map(e => e.reportedDate)).size;
      const plannedDays = 1;
      totalOverrun += Math.max(0, distinctDays - plannedDays);
    }

    return Number((totalOverrun / occKeys.length).toFixed(4));
  }

  private static groupExecsByCrew(execs: VerifiedExecutionFact[]): Record<string, VerifiedExecutionFact[]> {
    const map: Record<string, VerifiedExecutionFact[]> = {};
    for (const e of execs) {
      const crewId = e.crewId || 'UNASSIGNED';
      if (!map[crewId]) map[crewId] = [];
      map[crewId].push(e);
    }
    return map;
  }

  private static groupExecsByOccurrence(execs: VerifiedExecutionFact[]): Record<string, VerifiedExecutionFact[]> {
    const map: Record<string, VerifiedExecutionFact[]> = {};
    for (const e of execs) {
      if (!map[e.occurrenceKey]) map[e.occurrenceKey] = [];
      map[e.occurrenceKey].push(e);
    }
    return map;
  }

  private static buildEmptyCohort(decisionRecord: DecisionRecord): EvaluationCohort {
    const rec = decisionRecord.recommendationSnapshot;
    return {
      cohortDefinitionVersion: 'COHORT_V1.0',
      baselineExecutionIds: [],
      postExecutionIds: [],
      baselineOccurrencesCount: 0,
      postOccurrencesCount: 0,
      selectionCriteria: {
        boardId: decisionRecord.boardId,
        targetEntity: rec.targetEntity,
        resourceKey: null,
        baselineWindow: { startIso: '', endIso: '' },
        evaluationWindow: { startIso: '', endIso: '' },
        verificationFilter: 'VERIFIED_ONLY',
      },
    };
  }
}
