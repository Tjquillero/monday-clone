/**
 * Mantenix - Hito 7.5 Governed Repair & Action Proposal Engine v1.0
 * Motor Consultivo 100% Determinístico en Memoria de Propuestas Declarativas de Reparación
 *
 * Principios Invariantes:
 * - 0 mutaciones BD, 0 DDL, 0 SQL migrations, 0 RPCs de escritura, 0 ejecuciones en producción.
 * - Proponer != Ejecutar: H7.5 jamás invoca GatewayRPC ni muta la base de datos Supabase.
 * - projectedDelta se deriva 100% de H7.4 (0 números inventados por heurística).
 * - Target Declarativo: 'SandboxEngine' (para pruebas aisladas H7.1B) o 'HumanReviewNotice'.
 * - Fingerprint Canónico SHA-256 determinista sobre propiedades estables.
 */

import crypto from 'crypto';
import {
  ACTION_TYPE_TO_TARGET_MAP,
  CATEGORY_TO_ACTION_TYPE_MAP,
  RepairProposalInput,
  RepairProposalRecord,
} from '../types/repairProposal';

/**
 * Calcula el fingerprint SHA-256 determinista del manifiesto declarativo de propuesta (R10)
 * Excluye explícitamente propiedades variables como marcas de tiempo (evaluatedAt) o timezone.
 */
export function computeProposalFingerprintHash(stableData: Record<string, unknown>): string {
  const canonicalJson = JSON.stringify(stableData, Object.keys(stableData).sort());
  return crypto.createHash('sha256').update(canonicalJson).digest('hex');
}

/**
 * Función Principal de Evaluación de Propuestas de Reparación (H7.5)
 */
export function evaluateRepairProposal(input: RepairProposalInput): RepairProposalRecord {
  const nowUtc = new Date().toISOString();
  const { actionPlan } = input;

  // Fail-closed ante input nulo o inexistente
  if (!actionPlan) {
    return {
      proposalId: `prop_indet_${Math.random().toString(36).slice(2, 9)}`,
      planId: 'none',
      diagnosticId: 'none',
      anomalyId: 'none',
      actionType: null,
      targetEntityId: null,
      payload: null,
      expectedOutcome: null,
      status: 'INDETERMINATE',
      evaluationTarget: null,
      evaluatedAt: nowUtc,
      timezone: 'America/Bogota',
      proposalVersion: 'v1.0',
      requiresHumanReview: true,
    };
  }

  // Mapeo R1/R2: Si el plan de acción NO tiene status 'RECOMMENDED' o no hay recomendación primaria
  if (actionPlan.status !== 'RECOMMENDED' || !actionPlan.primaryRecommendation) {
    return {
      proposalId: `prop_norepair_${actionPlan.planId.slice(0, 8)}`,
      planId: actionPlan.planId,
      diagnosticId: actionPlan.diagnosticId,
      anomalyId: actionPlan.anomalyId,
      actionType: null,
      targetEntityId: null,
      payload: null,
      expectedOutcome: null,
      status: 'NO_REPAIR_FEASIBLE',
      evaluationTarget: null,
      evaluatedAt: nowUtc,
      timezone: 'America/Bogota',
      proposalVersion: 'v1.0',
      requiresHumanReview: true,
    };
  }

  const primRec = actionPlan.primaryRecommendation;

  // R17 / R23 Fail-closed: Si estimatedImprovement no existe o es nulo -> INDETERMINATE
  if (
    primRec.expectedImpact === undefined ||
    primRec.expectedImpact === null ||
    primRec.expectedImpact.estimatedImprovement === undefined ||
    primRec.expectedImpact.estimatedImprovement === null ||
    typeof primRec.expectedImpact.estimatedImprovement !== 'number'
  ) {
    return {
      proposalId: `prop_indet_${actionPlan.planId.slice(0, 8)}`,
      planId: actionPlan.planId,
      diagnosticId: actionPlan.diagnosticId,
      anomalyId: actionPlan.anomalyId,
      actionType: null,
      targetEntityId: null,
      payload: null,
      expectedOutcome: null,
      status: 'INDETERMINATE',
      evaluationTarget: null,
      evaluatedAt: nowUtc,
      timezone: 'America/Bogota',
      proposalVersion: 'v1.0',
      requiresHumanReview: true,
    };
  }

  // Mapear categoría a tipo de acción (R3–R8) y target (R9)
  const actionType = CATEGORY_TO_ACTION_TYPE_MAP[primRec.category];
  const evaluationTarget = ACTION_TYPE_TO_TARGET_MAP[actionType];

  // R17: projectedDelta derivado estrictamente de H7.4 (0 números nuevos inventados por H7.5)
  const projectedDelta = primRec.expectedImpact.estimatedImprovement;

  // Generación de payload declarativo 100% serializable según la acción
  const payload: Record<string, unknown> = {
    actionType,
    title: primRec.title,
    rationale: primRec.rationale,
    targetEntityId: primRec.targetEntityId,
    riskLevel: primRec.riskLevel,
    riskJustification: primRec.riskJustification,
    expectedMetric: primRec.expectedImpact.metric,
    expectedBaseline: primRec.expectedImpact.baselineValue,
    expectedProjected: primRec.expectedImpact.projectedValue,
    expectedUnit: primRec.expectedImpact.unit,
  };

  const metricDirection: 'INCREASE' | 'DECREASE' =
    primRec.expectedImpact.projectedValue >= primRec.expectedImpact.baselineValue
      ? 'INCREASE'
      : 'DECREASE';

  const expectedOutcome = {
    targetMetric: primRec.expectedImpact.metric,
    projectedDelta,
    metricDirection,
  };

  // R10: Cálculo del fingerprint SHA-256 canónico determinista
  const stableDataForFingerprint = {
    planId: actionPlan.planId,
    diagnosticId: actionPlan.diagnosticId,
    anomalyId: actionPlan.anomalyId,
    actionType,
    targetEntityId: primRec.targetEntityId,
    payload,
    expectedOutcome,
    evaluationTarget,
  };

  const proposalFingerprintHash = computeProposalFingerprintHash(stableDataForFingerprint);

  return {
    proposalId: `prop_${actionPlan.planId.slice(0, 8)}`,
    planId: actionPlan.planId,
    diagnosticId: actionPlan.diagnosticId,
    anomalyId: actionPlan.anomalyId,
    actionType,
    targetEntityId: primRec.targetEntityId,
    payload,
    expectedOutcome,
    status: 'PROPOSAL_GENERATED',
    evaluationTarget,
    proposalFingerprintHash,
    evaluatedAt: nowUtc,
    timezone: 'America/Bogota',
    proposalVersion: 'v1.0',
    requiresHumanReview: true,
  };
}
