/**
 * Mantenix - Hito 7.7 Governed Application & Weekly Plan Item Gateway Engine v1.0
 * Test Suite Integral de Aplicación Gobernada, Aislamiento y Compatibilidad con /my-work
 *
 * Invariantes Verificadas:
 * - 0 DDL, 0 migraciones SQL, 0 tablas nuevas, 0 RPCs de escritura nuevas.
 * - WRITE SOLO EN weekly_plan_items: Estricto aislamiento de base de datos viva.
 * - H6.2 -> H7.6 READ ONLY: Capas previas intactas y congeladas.
 * - Compuerta Triple Concurrente: (ALLOW_SANDBOX) AND (RECOVERY_SUCCESS) AND (isHumanAuthorized === true).
 *   CERO bypasses técnicos permitidos.
 * - Gate de Protección Física: Ítems completados, en progreso o con ejecuciones son estrictamente inmutables.
 * - Idempotencia total por applicationMutationId.
 */

import {
  applyGovernedRepairToPlanItem,
  InMemoryGovernedApplicationStore,
  validateApplicationRole,
} from '../governedApplicationEngine';
import { RepairProposalRecord } from '../../types/repairProposal';
import { RecoveryValidationRecord } from '../../types/recoveryValidation';
import { WeeklyPlanItem } from '../../types/weeklyPlan';

describe('Hito 7.7 - Governed Application Engine & Weekly Plan Item Gateway v1.0', () => {
  let store: InMemoryGovernedApplicationStore;

  const samplePlanItem: WeeklyPlanItem = {
    id: 'item-uuid-101',
    weekly_plan_id: 'plan-uuid-501',
    board_id: 'board-uuid-001',
    activity_key: 'poda_arboles',
    name: 'Poda de Arboles',
    zone: 'Zona Norte',
    unit: 'UND',
    planned_date: '2026-09-28',
    planned_qty: 15,
    theoretical_jr: 0.6,
    source_type: 'ROUTINE',
    routine_reference: 'poda_arboles',
    occurrence_key: 'occ_key_101',
    status: 'planned',
    crew_id: 'crew-alpha',
    is_manual_override: false,
    override_reason: undefined,
  };

  const sampleRecoverySuccess: RecoveryValidationRecord = {
    recoveryId: 'rec_succ_101',
    proposalId: 'prop_crew_101',
    planId: 'plan-uuid-501',
    diagnosticId: 'diag_101',
    anomalyId: 'anom_101',
    status: 'RECOVERY_SUCCESS',
    policyDecisionUsed: 'ALLOW_SANDBOX',
    preExecutionSnapshotHash: 'hash-pre',
    postExecutionSnapshotHash: 'hash-post',
    postRollbackSnapshotHash: null,
    validationResult: {
      passed: true,
      metricName: 'METRIC_EXECUTION_COMPLIANCE_RATE',
      expectedDelta: 0.15,
      observedDelta: 0.18,
      metricDirection: 'INCREASE',
      validationScore: 1.0,
      reasoning: 'Objective validation passed',
    },
    rollbackExecuted: false,
    rollbackVerified: false,
    evaluatedAt: '2026-09-24T12:00:00.000Z',
    timezone: 'America/Bogota',
    evaluatorVersion: 'v1.0',
    requiresHumanReview: true,
  };

  beforeEach(() => {
    store = new InMemoryGovernedApplicationStore();
    store.saveItem(samplePlanItem);
  });

  // R1: Circuit Breaker / Table Boundary Invariance
  test('R1: Circuit Breaker - targetTable es estrictamente weekly_plan_items', async () => {
    const proposal: RepairProposalRecord = {
      proposalId: 'prop_crew_101',
      planId: 'plan-uuid-501',
      diagnosticId: 'diag_101',
      anomalyId: 'anom_101',
      actionType: 'PROPOSE_CREW_REASSIGNMENT',
      targetEntityId: 'item-uuid-101',
      payload: { targetCrewId: 'crew-beta' },
      expectedOutcome: { targetMetric: 'METRIC_EXECUTION_COMPLIANCE_RATE', projectedDelta: 0.15, metricDirection: 'INCREASE' },
      status: 'PROPOSAL_GENERATED',
      evaluationTarget: 'SandboxEngine',
      evaluatedAt: '2026-09-24T12:00:00.000Z',
      timezone: 'America/Bogota',
      proposalVersion: 'v1.0',
      requiresHumanReview: true,
    };

    const res = await applyGovernedRepairToPlanItem(
      {
        applicationMutationId: 'mut_app_01',
        proposal,
        recoveryValidation: sampleRecoverySuccess,
        targetItem: samplePlanItem,
        actorUserId: 'user-sup-1',
        actorRole: 'supervisor',
        isHumanAuthorized: true,
        policyDecision: 'ALLOW_SANDBOX',
      },
      { store }
    );

    expect(res.applicationRecord.targetTable).toBe('weekly_plan_items');
    expect(res.applicationRecord.status).toBe('APPLICATION_SUCCESS');
  });

  // R2: Role Authorization Gate
  test('R2: Role Authorization Gate - Rechaza roles no autorizados', async () => {
    expect(() => validateApplicationRole('worker')).toThrow(/UNAUTHORIZED_ROLE/);
    expect(() => validateApplicationRole('viewer')).toThrow(/UNAUTHORIZED_ROLE/);

    const proposal: RepairProposalRecord = {
      proposalId: 'prop_crew_102',
      planId: 'plan-uuid-501',
      diagnosticId: 'diag_101',
      anomalyId: 'anom_101',
      actionType: 'PROPOSE_CREW_REASSIGNMENT',
      targetEntityId: 'item-uuid-101',
      payload: { targetCrewId: 'crew-beta' },
      expectedOutcome: { targetMetric: 'METRIC_EXECUTION_COMPLIANCE_RATE', projectedDelta: 0.15, metricDirection: 'INCREASE' },
      status: 'PROPOSAL_GENERATED',
      evaluationTarget: 'SandboxEngine',
      evaluatedAt: '2026-09-24T12:00:00.000Z',
      timezone: 'America/Bogota',
      proposalVersion: 'v1.0',
      requiresHumanReview: true,
    };

    const res = await applyGovernedRepairToPlanItem(
      {
        applicationMutationId: 'mut_app_02',
        proposal,
        recoveryValidation: sampleRecoverySuccess,
        targetItem: samplePlanItem,
        actorUserId: 'user-worker-1',
        actorRole: 'worker',
        isHumanAuthorized: true,
        policyDecision: 'ALLOW_SANDBOX',
      },
      { store }
    );

    expect(res.applicationRecord.status).toBe('APPLICATION_DENIED');
    expect(res.updatedItem).toBeNull();
  });

  // R3: Physical Protection Gate (completed, in_progress, executed_qty > 0)
  test('R3: Physical Protection Gate - Prohíbe mutación en ítems completados o en progreso', async () => {
    const completedItem: WeeklyPlanItem = {
      ...samplePlanItem,
      id: 'item-completed',
      status: 'completed',
    };

    const inProgressItem: WeeklyPlanItem = {
      ...samplePlanItem,
      id: 'item-inprogress',
      status: 'in_progress',
    };

    const executedItem: WeeklyPlanItem = {
      ...samplePlanItem,
      id: 'item-executed',
      status: 'planned',
      executed_qty: 5,
    } as any;

    const proposal: RepairProposalRecord = {
      proposalId: 'prop_crew_103',
      planId: 'plan-uuid-501',
      diagnosticId: 'diag_101',
      anomalyId: 'anom_101',
      actionType: 'PROPOSE_CREW_REASSIGNMENT',
      targetEntityId: 'item-completed',
      payload: { targetCrewId: 'crew-beta' },
      expectedOutcome: { targetMetric: 'METRIC_EXECUTION_COMPLIANCE_RATE', projectedDelta: 0.15, metricDirection: 'INCREASE' },
      status: 'PROPOSAL_GENERATED',
      evaluationTarget: 'SandboxEngine',
      evaluatedAt: '2026-09-24T12:00:00.000Z',
      timezone: 'America/Bogota',
      proposalVersion: 'v1.0',
      requiresHumanReview: true,
    };

    const res1 = await applyGovernedRepairToPlanItem(
      {
        applicationMutationId: 'mut_app_03a',
        proposal,
        recoveryValidation: sampleRecoverySuccess,
        targetItem: completedItem,
        actorUserId: 'user-sup-1',
        actorRole: 'supervisor',
        isHumanAuthorized: true,
        policyDecision: 'ALLOW_SANDBOX',
      },
      { store }
    );
    expect(res1.applicationRecord.status).toBe('TARGET_PROTECTED');
    expect(res1.updatedItem).toBeNull();

    const res2 = await applyGovernedRepairToPlanItem(
      {
        applicationMutationId: 'mut_app_03b',
        proposal: { ...proposal, targetEntityId: 'item-inprogress' },
        recoveryValidation: sampleRecoverySuccess,
        targetItem: inProgressItem,
        actorUserId: 'user-sup-1',
        actorRole: 'supervisor',
        isHumanAuthorized: true,
        policyDecision: 'ALLOW_SANDBOX',
      },
      { store }
    );
    expect(res2.applicationRecord.status).toBe('TARGET_PROTECTED');

    const res3 = await applyGovernedRepairToPlanItem(
      {
        applicationMutationId: 'mut_app_03c',
        proposal: { ...proposal, targetEntityId: 'item-executed' },
        recoveryValidation: sampleRecoverySuccess,
        targetItem: executedItem,
        actorUserId: 'user-sup-1',
        actorRole: 'supervisor',
        isHumanAuthorized: true,
        policyDecision: 'ALLOW_SANDBOX',
      },
      { store }
    );
    expect(res3.applicationRecord.status).toBe('TARGET_PROTECTED');
  });

  // R4: Triple Concurrent Gate - isHumanAuthorized === false -> DENIED
  test('R4: Triple Concurrent Gate - isHumanAuthorized=false resulta en APPLICATION_DENIED aunque policy y recovery sean válidos', async () => {
    const proposal: RepairProposalRecord = {
      proposalId: 'prop_crew_104',
      planId: 'plan-uuid-501',
      diagnosticId: 'diag_101',
      anomalyId: 'anom_101',
      actionType: 'PROPOSE_CREW_REASSIGNMENT',
      targetEntityId: 'item-uuid-101',
      payload: { targetCrewId: 'crew-beta' },
      expectedOutcome: { targetMetric: 'METRIC_EXECUTION_COMPLIANCE_RATE', projectedDelta: 0.15, metricDirection: 'INCREASE' },
      status: 'PROPOSAL_GENERATED',
      evaluationTarget: 'SandboxEngine',
      evaluatedAt: '2026-09-24T12:00:00.000Z',
      timezone: 'America/Bogota',
      proposalVersion: 'v1.0',
      requiresHumanReview: true,
    };

    const res = await applyGovernedRepairToPlanItem(
      {
        applicationMutationId: 'mut_app_04',
        proposal,
        recoveryValidation: sampleRecoverySuccess,
        targetItem: samplePlanItem,
        actorUserId: 'user-sup-1',
        actorRole: 'supervisor',
        isHumanAuthorized: false, // SIN autorización humana
        policyDecision: 'ALLOW_SANDBOX',
      },
      { store }
    );

    expect(res.applicationRecord.status).toBe('APPLICATION_DENIED');
    expect(res.updatedItem).toBeNull();
  });

  // R4B: Triple Concurrent Gate - isHumanAuthorized === true + policy inválida -> DENIED
  test('R4B: Triple Concurrent Gate - isHumanAuthorized=true + policy inválida resulta en APPLICATION_DENIED (CERO bypass de política)', async () => {
    const proposal: RepairProposalRecord = {
      proposalId: 'prop_crew_104b',
      planId: 'plan-uuid-501',
      diagnosticId: 'diag_101',
      anomalyId: 'anom_101',
      actionType: 'PROPOSE_CREW_REASSIGNMENT',
      targetEntityId: 'item-uuid-101',
      payload: { targetCrewId: 'crew-beta' },
      expectedOutcome: { targetMetric: 'METRIC_EXECUTION_COMPLIANCE_RATE', projectedDelta: 0.15, metricDirection: 'INCREASE' },
      status: 'PROPOSAL_GENERATED',
      evaluationTarget: 'SandboxEngine',
      evaluatedAt: '2026-09-24T12:00:00.000Z',
      timezone: 'America/Bogota',
      proposalVersion: 'v1.0',
      requiresHumanReview: true,
    };

    const res = await applyGovernedRepairToPlanItem(
      {
        applicationMutationId: 'mut_app_04b',
        proposal,
        recoveryValidation: sampleRecoverySuccess,
        targetItem: samplePlanItem,
        actorUserId: 'user-sup-1',
        actorRole: 'supervisor',
        isHumanAuthorized: true,
        policyDecision: 'DENY_STRICT', // Política denegada
      },
      { store }
    );

    expect(res.applicationRecord.status).toBe('APPLICATION_DENIED');
    expect(res.updatedItem).toBeNull();
  });

  // R4C: Triple Concurrent Gate - isHumanAuthorized === true + recovery inválido -> DENIED
  test('R4C: Triple Concurrent Gate - isHumanAuthorized=true + recovery inválido resulta en APPLICATION_DENIED (CERO bypass de validación técnica)', async () => {
    const failedRecovery: RecoveryValidationRecord = {
      ...sampleRecoverySuccess,
      recoveryId: 'rec_failed_101',
      status: 'RECOVERY_FAILED_ROLLED_BACK',
    };

    const proposal: RepairProposalRecord = {
      proposalId: 'prop_crew_104c',
      planId: 'plan-uuid-501',
      diagnosticId: 'diag_101',
      anomalyId: 'anom_101',
      actionType: 'PROPOSE_CREW_REASSIGNMENT',
      targetEntityId: 'item-uuid-101',
      payload: { targetCrewId: 'crew-beta' },
      expectedOutcome: { targetMetric: 'METRIC_EXECUTION_COMPLIANCE_RATE', projectedDelta: 0.15, metricDirection: 'INCREASE' },
      status: 'PROPOSAL_GENERATED',
      evaluationTarget: 'SandboxEngine',
      evaluatedAt: '2026-09-24T12:00:00.000Z',
      timezone: 'America/Bogota',
      proposalVersion: 'v1.0',
      requiresHumanReview: true,
    };

    const res = await applyGovernedRepairToPlanItem(
      {
        applicationMutationId: 'mut_app_04c',
        proposal,
        recoveryValidation: failedRecovery, // Recovery fallido
        targetItem: samplePlanItem,
        actorUserId: 'user-sup-1',
        actorRole: 'supervisor',
        isHumanAuthorized: true,
        policyDecision: 'ALLOW_SANDBOX',
      },
      { store }
    );

    expect(res.applicationRecord.status).toBe('APPLICATION_DENIED');
    expect(res.updatedItem).toBeNull();
  });

  // R5: Triple Concurrent Gate - All 3 valid -> APPLICATION_SUCCESS
  test('R5: Triple Concurrent Gate - ALLOW_SANDBOX + RECOVERY_SUCCESS + isHumanAuthorized=true permite APPLICATION_SUCCESS', async () => {
    const proposal: RepairProposalRecord = {
      proposalId: 'prop_crew_105',
      planId: 'plan-uuid-501',
      diagnosticId: 'diag_101',
      anomalyId: 'anom_101',
      actionType: 'PROPOSE_CREW_REASSIGNMENT',
      targetEntityId: 'item-uuid-101',
      payload: { targetCrewId: 'crew-gamma' },
      expectedOutcome: { targetMetric: 'METRIC_EXECUTION_COMPLIANCE_RATE', projectedDelta: 0.15, metricDirection: 'INCREASE' },
      status: 'PROPOSAL_GENERATED',
      evaluationTarget: 'SandboxEngine',
      evaluatedAt: '2026-09-24T12:00:00.000Z',
      timezone: 'America/Bogota',
      proposalVersion: 'v1.0',
      requiresHumanReview: true,
    };

    const res = await applyGovernedRepairToPlanItem(
      {
        applicationMutationId: 'mut_app_05',
        proposal,
        recoveryValidation: sampleRecoverySuccess,
        targetItem: samplePlanItem,
        actorUserId: 'user-coord-1',
        actorRole: 'coordinator',
        isHumanAuthorized: true,
        policyDecision: 'ALLOW_SANDBOX',
      },
      { store }
    );

    expect(res.applicationRecord.status).toBe('APPLICATION_SUCCESS');
    expect(res.applicationRecord.isHumanAuthorized).toBe(true);
    expect(res.updatedItem?.crew_id).toBe('crew-gamma');
  });

  // R6: Crew Reassignment Action Execution - Modifica estrictamente crew_id
  test('R6: Crew Reassignment - Actualiza exclusivamente crew_id y preserva otros campos intactos', async () => {
    const proposal: RepairProposalRecord = {
      proposalId: 'prop_crew_106',
      planId: 'plan-uuid-501',
      diagnosticId: 'diag_101',
      anomalyId: 'anom_101',
      actionType: 'PROPOSE_CREW_REASSIGNMENT',
      targetEntityId: 'item-uuid-101',
      payload: { targetCrewId: 'crew-delta' },
      expectedOutcome: { targetMetric: 'METRIC_EXECUTION_COMPLIANCE_RATE', projectedDelta: 0.15, metricDirection: 'INCREASE' },
      status: 'PROPOSAL_GENERATED',
      evaluationTarget: 'SandboxEngine',
      evaluatedAt: '2026-09-24T12:00:00.000Z',
      timezone: 'America/Bogota',
      proposalVersion: 'v1.0',
      requiresHumanReview: true,
    };

    const res = await applyGovernedRepairToPlanItem(
      {
        applicationMutationId: 'mut_app_06',
        proposal,
        recoveryValidation: sampleRecoverySuccess,
        targetItem: samplePlanItem,
        actorUserId: 'user-sup-1',
        actorRole: 'supervisor',
        isHumanAuthorized: true,
        policyDecision: 'ALLOW_SANDBOX',
      },
      { store }
    );

    expect(res.applicationRecord.status).toBe('APPLICATION_SUCCESS');
    expect(res.updatedItem?.crew_id).toBe('crew-delta');
    expect(res.updatedItem?.activity_key).toBe(samplePlanItem.activity_key);
    expect(res.updatedItem?.planned_date).toBe(samplePlanItem.planned_date);
    expect(res.updatedItem?.planned_qty).toBe(samplePlanItem.planned_qty);
    expect(res.applicationRecord.appliedDiffs).toEqual([
      {
        fieldName: 'crew_id',
        previousValue: 'crew-alpha',
        newValue: 'crew-delta',
      },
    ]);
  });

  // R7: Schedule Override Action Execution - Modifica estrictamente planned_date, is_manual_override, override_reason
  test('R7: Schedule Override - Actualiza exclusivamente planned_date, is_manual_override y override_reason', async () => {
    const proposal: RepairProposalRecord = {
      proposalId: 'prop_sched_107',
      planId: 'plan-uuid-501',
      diagnosticId: 'diag_101',
      anomalyId: 'anom_101',
      actionType: 'PROPOSE_SCHEDULE_OVERRIDE',
      targetEntityId: 'item-uuid-101',
      payload: {
        newPlannedDate: '2026-09-29',
        overrideReason: 'LLUVIA_FUERTE_SECTOR_NORTE',
      },
      expectedOutcome: { targetMetric: 'METRIC_EXECUTION_COMPLIANCE_RATE', projectedDelta: 0.10, metricDirection: 'INCREASE' },
      status: 'PROPOSAL_GENERATED',
      evaluationTarget: 'SandboxEngine',
      evaluatedAt: '2026-09-24T12:00:00.000Z',
      timezone: 'America/Bogota',
      proposalVersion: 'v1.0',
      requiresHumanReview: true,
    };

    const res = await applyGovernedRepairToPlanItem(
      {
        applicationMutationId: 'mut_app_07',
        proposal,
        recoveryValidation: sampleRecoverySuccess,
        targetItem: samplePlanItem,
        actorUserId: 'user-sup-1',
        actorRole: 'supervisor',
        isHumanAuthorized: true,
        policyDecision: 'ALLOW_SANDBOX',
      },
      { store }
    );

    expect(res.applicationRecord.status).toBe('APPLICATION_SUCCESS');
    expect(res.updatedItem?.planned_date).toBe('2026-09-29');
    expect(res.updatedItem?.is_manual_override).toBe(true);
    expect(res.updatedItem?.override_reason).toBe('LLUVIA_FUERTE_SECTOR_NORTE');
    expect(res.updatedItem?.crew_id).toBe(samplePlanItem.crew_id);
    expect(res.applicationRecord.appliedDiffs).toHaveLength(3);
  });

  // R8: Resource Rebalance Action Execution - Modifica estrictamente planned_qty, theoretical_jr
  test('R8: Resource Rebalance - Ajusta exclusivamente planned_qty y theoretical_jr sobre weekly_plan_items', async () => {
    const proposal: RepairProposalRecord = {
      proposalId: 'prop_res_108',
      planId: 'plan-uuid-501',
      diagnosticId: 'diag_101',
      anomalyId: 'anom_101',
      actionType: 'PROPOSE_RESOURCE_REBALANCE',
      targetEntityId: 'item-uuid-101',
      payload: {
        adjustedPlannedQty: 20,
        adjustedTheoreticalJr: 0.8,
      },
      expectedOutcome: { targetMetric: 'METRIC_EXECUTION_COMPLIANCE_RATE', projectedDelta: 0.05, metricDirection: 'INCREASE' },
      status: 'PROPOSAL_GENERATED',
      evaluationTarget: 'SandboxEngine',
      evaluatedAt: '2026-09-24T12:00:00.000Z',
      timezone: 'America/Bogota',
      proposalVersion: 'v1.0',
      requiresHumanReview: true,
    };

    const res = await applyGovernedRepairToPlanItem(
      {
        applicationMutationId: 'mut_app_08',
        proposal,
        recoveryValidation: sampleRecoverySuccess,
        targetItem: samplePlanItem,
        actorUserId: 'user-sup-1',
        actorRole: 'supervisor',
        isHumanAuthorized: true,
        policyDecision: 'ALLOW_SANDBOX',
      },
      { store }
    );

    expect(res.applicationRecord.status).toBe('APPLICATION_SUCCESS');
    expect(res.updatedItem?.planned_qty).toBe(20);
    expect(res.updatedItem?.theoretical_jr).toBe(0.8);
    expect(res.updatedItem?.activity_key).toBe(samplePlanItem.activity_key);
    expect(res.applicationRecord.targetTable).toBe('weekly_plan_items');
  });

  // R9: Consultative Actions Fail Closed
  test('R9: Consultative Actions - Falla cerrado ante propuestas que no son mutaciones físicas', async () => {
    const proposal: RepairProposalRecord = {
      proposalId: 'prop_rev_109',
      planId: 'plan-uuid-501',
      diagnosticId: 'diag_101',
      anomalyId: 'anom_101',
      actionType: 'PROPOSE_CONTRACT_TARGET_REVIEW',
      targetEntityId: 'item-uuid-101',
      payload: { ticketSummary: 'Revisión contractual de rendimientos' },
      expectedOutcome: { targetMetric: 'METRIC_VARIANCE_RATE', projectedDelta: -0.10, metricDirection: 'DECREASE' },
      status: 'PROPOSAL_GENERATED',
      evaluationTarget: 'HumanReviewNotice',
      evaluatedAt: '2026-09-24T12:00:00.000Z',
      timezone: 'America/Bogota',
      proposalVersion: 'v1.0',
      requiresHumanReview: true,
    };

    const res = await applyGovernedRepairToPlanItem(
      {
        applicationMutationId: 'mut_app_09',
        proposal,
        recoveryValidation: sampleRecoverySuccess,
        targetItem: samplePlanItem,
        actorUserId: 'user-sup-1',
        actorRole: 'supervisor',
        isHumanAuthorized: true,
        policyDecision: 'ALLOW_SANDBOX',
      },
      { store }
    );

    expect(res.applicationRecord.status).toBe('APPLICATION_DENIED');
    expect(res.updatedItem).toBeNull();
  });

  // R10: Idempotency by applicationMutationId
  test('R10: Idempotencia - Re-ejecución con el mismo applicationMutationId produce IDEMPOTENT_REPLAY sin doble mutación', async () => {
    const proposal: RepairProposalRecord = {
      proposalId: 'prop_crew_110',
      planId: 'plan-uuid-501',
      diagnosticId: 'diag_101',
      anomalyId: 'anom_101',
      actionType: 'PROPOSE_CREW_REASSIGNMENT',
      targetEntityId: 'item-uuid-101',
      payload: { targetCrewId: 'crew-omega' },
      expectedOutcome: { targetMetric: 'METRIC_EXECUTION_COMPLIANCE_RATE', projectedDelta: 0.15, metricDirection: 'INCREASE' },
      status: 'PROPOSAL_GENERATED',
      evaluationTarget: 'SandboxEngine',
      evaluatedAt: '2026-09-24T12:00:00.000Z',
      timezone: 'America/Bogota',
      proposalVersion: 'v1.0',
      requiresHumanReview: true,
    };

    const res1 = await applyGovernedRepairToPlanItem(
      {
        applicationMutationId: 'mut_idempotent_10',
        proposal,
        recoveryValidation: sampleRecoverySuccess,
        targetItem: samplePlanItem,
        actorUserId: 'user-sup-1',
        actorRole: 'supervisor',
        isHumanAuthorized: true,
        policyDecision: 'ALLOW_SANDBOX',
      },
      { store }
    );
    expect(res1.applicationRecord.status).toBe('APPLICATION_SUCCESS');
    expect(res1.isIdempotentReplay).toBe(false);

    const res2 = await applyGovernedRepairToPlanItem(
      {
        applicationMutationId: 'mut_idempotent_10',
        proposal,
        recoveryValidation: sampleRecoverySuccess,
        targetItem: samplePlanItem,
        actorUserId: 'user-sup-1',
        actorRole: 'supervisor',
        isHumanAuthorized: true,
        policyDecision: 'ALLOW_SANDBOX',
      },
      { store }
    );
    expect(res2.applicationRecord.status).toBe('IDEMPOTENT_REPLAY');
    expect(res2.isIdempotentReplay).toBe(true);
    expect(res2.updatedItem?.crew_id).toBe('crew-omega');
  });

  // R11: Persistence Failure & Rollback
  test('R11: Rollback - Simulación de falla en persistencia produce APPLICATION_ROLLED_BACK y no muta el ítem', async () => {
    const proposal: RepairProposalRecord = {
      proposalId: 'prop_crew_111',
      planId: 'plan-uuid-501',
      diagnosticId: 'diag_101',
      anomalyId: 'anom_101',
      actionType: 'PROPOSE_CREW_REASSIGNMENT',
      targetEntityId: 'item-uuid-101',
      payload: { targetCrewId: 'crew-fail' },
      expectedOutcome: { targetMetric: 'METRIC_EXECUTION_COMPLIANCE_RATE', projectedDelta: 0.15, metricDirection: 'INCREASE' },
      status: 'PROPOSAL_GENERATED',
      evaluationTarget: 'SandboxEngine',
      evaluatedAt: '2026-09-24T12:00:00.000Z',
      timezone: 'America/Bogota',
      proposalVersion: 'v1.0',
      requiresHumanReview: true,
    };

    const res = await applyGovernedRepairToPlanItem(
      {
        applicationMutationId: 'mut_app_11',
        proposal,
        recoveryValidation: sampleRecoverySuccess,
        targetItem: samplePlanItem,
        actorUserId: 'user-sup-1',
        actorRole: 'supervisor',
        isHumanAuthorized: true,
        policyDecision: 'ALLOW_SANDBOX',
        simulatedPersistenceFail: true,
      },
      { store }
    );

    expect(res.applicationRecord.status).toBe('APPLICATION_ROLLED_BACK');
    expect(res.updatedItem).toBeNull();
  });

  // R12: Fail-Closed on Malformed Input / Missing Payload
  test('R12: Fail-Closed ante payload nulo o datos insuficientes -> INDETERMINATE', async () => {
    const proposal: RepairProposalRecord = {
      proposalId: 'prop_crew_112',
      planId: 'plan-uuid-501',
      diagnosticId: 'diag_101',
      anomalyId: 'anom_101',
      actionType: 'PROPOSE_CREW_REASSIGNMENT',
      targetEntityId: 'item-uuid-101',
      payload: {}, // Payload vacío sin targetCrewId
      expectedOutcome: { targetMetric: 'METRIC_EXECUTION_COMPLIANCE_RATE', projectedDelta: 0.15, metricDirection: 'INCREASE' },
      status: 'PROPOSAL_GENERATED',
      evaluationTarget: 'SandboxEngine',
      evaluatedAt: '2026-09-24T12:00:00.000Z',
      timezone: 'America/Bogota',
      proposalVersion: 'v1.0',
      requiresHumanReview: true,
    };

    const res = await applyGovernedRepairToPlanItem(
      {
        applicationMutationId: 'mut_app_12',
        proposal,
        recoveryValidation: sampleRecoverySuccess,
        targetItem: samplePlanItem,
        actorUserId: 'user-sup-1',
        actorRole: 'supervisor',
        isHumanAuthorized: true,
        policyDecision: 'ALLOW_SANDBOX',
      },
      { store }
    );

    expect(res.applicationRecord.status).toBe('INDETERMINATE');
    expect(res.updatedItem).toBeNull();
  });

  // R13: /my-work Read Model Parity
  test('R13: Paridad con /my-work - El ítem actualizado cumple estrictamente con el contrato de WeeklyPlanItem', async () => {
    const proposal: RepairProposalRecord = {
      proposalId: 'prop_sched_113',
      planId: 'plan-uuid-501',
      diagnosticId: 'diag_101',
      anomalyId: 'anom_101',
      actionType: 'PROPOSE_SCHEDULE_OVERRIDE',
      targetEntityId: 'item-uuid-101',
      payload: {
        newPlannedDate: '2026-09-30',
        overrideReason: 'REPROGRAMACION_LOGISTICA',
      },
      expectedOutcome: { targetMetric: 'METRIC_EXECUTION_COMPLIANCE_RATE', projectedDelta: 0.10, metricDirection: 'INCREASE' },
      status: 'PROPOSAL_GENERATED',
      evaluationTarget: 'SandboxEngine',
      evaluatedAt: '2026-09-24T12:00:00.000Z',
      timezone: 'America/Bogota',
      proposalVersion: 'v1.0',
      requiresHumanReview: true,
    };

    const res = await applyGovernedRepairToPlanItem(
      {
        applicationMutationId: 'mut_app_13',
        proposal,
        recoveryValidation: sampleRecoverySuccess,
        targetItem: samplePlanItem,
        actorUserId: 'user-sup-1',
        actorRole: 'supervisor',
        isHumanAuthorized: true,
        policyDecision: 'ALLOW_SANDBOX',
      },
      { store }
    );

    const updated = res.updatedItem!;
    expect(updated).toBeDefined();
    expect(typeof updated.id).toBe('string');
    expect(typeof updated.weekly_plan_id).toBe('string');
    expect(typeof updated.activity_key).toBe('string');
    expect(typeof updated.planned_qty).toBe('number');
    expect(updated.planned_date).toBe('2026-09-30');
    expect(updated.is_manual_override).toBe(true);
    expect(updated.override_reason).toBe('REPROGRAMACION_LOGISTICA');
  });
});
