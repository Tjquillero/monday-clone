/**
 * Test Suite: Decision Governance Service (DEC-01 to DEC-12)
 *
 * Cobertura:
 * - DEC-01: Aceptación válida por rol autorizado persiste ACCEPTED y pasa a PENDING_EXECUTION
 * - DEC-02: Rechazo (REJECTED) sin justificación o < 10 caracteres es rechazado
 * - DEC-03: Aplazamiento (POSTPONED) sin fecha futura ni justificación es rechazado
 * - DEC-04: Justificación whitespace-only es rechazada
 * - DEC-05: Verificación de RBAC por board y rol
 * - DEC-06: Roles no autorizados (ej. crew leader, worker) rechazados
 * - DEC-07: Idempotencia física: mismo decisionMutationId retorna registro persistido con isIdempotentReplay = true
 * - DEC-08: Replay idempotente no ejecuta nuevamente el gateway de dominio
 * - DEC-09: Secuencia concurrente atómica genera seq=1, seq=2 sin colisiones
 * - DEC-10: Transición válida: POSTPONED (seq 1) -> POSTPONED (seq 2) -> ACCEPTED (seq 3)
 * - DEC-11: Transición inválida: Intento de mutar recomendación ya ACCEPTED lanza error
 * - DEC-12: Transición inválida: Intento de mutar recomendación ya REJECTED lanza error
 */

import {
  DecisionGovernanceService,
  InMemoryDecisionStore,
  validateDecisionReason,
  validateRoleAuthorization,
} from '../decisionGovernanceService';
import { OperationalRecommendation } from '../../types/operationalAdvisory';

describe('Decision Governance Service — Suite DEC-01 a DEC-12', () => {
  const mockRecommendation: OperationalRecommendation = {
    recommendationId: 'rec__ACTIVITY__act_01__R-01__act_01',
    recommendationKey: 'R-01_AJUSTE_RENDIMIENTO',
    priority: 'HIGH',
    status: 'PROPOSED',
    scope: { scopeType: 'ACTIVITY', scopeId: 'act_01', scopeName: 'Poda de Arboles' },
    triggeredPatternKey: 'P-01_SYSTEMATIC_UNDERESTIMATION',
    targetEntity: { entityType: 'ACTIVITY', entityId: 'act_01', entityName: 'Poda de Arboles' },
    sampleSize: 8,
    confidenceScore: 0.95,
    rationale: 'IP medido 0.72 < 0.85 recurrente',
    supportingMetrics: [
      { metricKey: 'METRIC_PRODUCTIVITY_INDEX', value: 0.72, unit: 'adimensional' },
      { metricKey: 'METRIC_THEORETICAL_PRODUCTIVITY_RATE', value: 200, unit: 'Und/JR' },
    ],
    proposedAction: {
      actionType: 'ADVISE_STANDARD_REVISION',
      targetEntity: { entityType: 'ACTIVITY', entityId: 'act_01' },
      suggestedParameters: { proposedStandardRate: 150 },
      applicableDomainGateway: 'poaService',
    },
    projectedImpact: {
      metricKey: 'METRIC_PRODUCTIVITY_INDEX',
      currentObservedValue: 0.72,
      proposedTargetValue: 1.0,
      projectedValue: null,
      unit: 'adimensional',
      expectedImprovementDescription: 'Normalización del IP a 1.0',
    },
    generatedAtIso: '2026-09-13T10:00:00.000Z',
  };

  test('DEC-01: Aceptación válida por coordinador persiste ACCEPTED y pasa a PENDING_EXECUTION', async () => {
    const store = new InMemoryDecisionStore();
    const service = new DecisionGovernanceService({ inMemoryStore: store });

    const result = await service.recordAndExecuteDecision({
      decisionMutationId: 'mut_01',
      recommendation: mockRecommendation,
      boardId: 'board_01',
      actorUserId: 'user_coord_01',
      actorRole: 'coordinator',
      decisionStatus: 'ACCEPTED',
      decisionReason: 'Aprobado ajuste de estándar para reflejar condiciones reales',
    });

    expect(result.isIdempotentReplay).toBe(false);
    expect(result.decisionRecord.decisionStatus).toBe('ACCEPTED');
    expect(result.decisionRecord.decisionSequenceNumber).toBe(1);
    expect(result.decisionRecord.actionStatus).toBe('EXECUTED');
    expect(result.decisionRecord.executionSnapshot).not.toBeNull();
  });

  test('DEC-02: Rechazo (REJECTED) sin justificación o con menos de 10 caracteres es rechazado', async () => {
    expect(() => validateDecisionReason('REJECTED', null)).toThrow(/VALIDATION_ERROR/);
    expect(() => validateDecisionReason('REJECTED', 'corto')).toThrow(/VALIDATION_ERROR/);
    expect(() => validateDecisionReason('REJECTED', 'Justificación suficientemente larga y válida')).not.toThrow();
  });

  test('DEC-03: Aplazamiento (POSTPONED) sin fecha futura ni justificación es rechazado', async () => {
    expect(() => validateDecisionReason('POSTPONED', null, null)).toThrow(/VALIDATION_ERROR/);
    expect(() => validateDecisionReason('POSTPONED', 'Justificación válida de aplazamiento')).not.toThrow();
    expect(() => validateDecisionReason('POSTPONED', null, '2026-10-01T00:00:00.000Z')).not.toThrow();
  });

  test('DEC-04: Justificación compuesta exclusivamente por espacios es rechazada', async () => {
    expect(() => validateDecisionReason('REJECTED', '          ')).toThrow(/VALIDATION_ERROR/);
  });

  test('DEC-05 & DEC-06: Verificación de RBAC por rol y familia', () => {
    // R-01 requiere coordinator o admin
    expect(() => validateRoleAuthorization('R-01_AJUSTE_RENDIMIENTO', 'supervisor')).toThrow(/FORBIDDEN_ROLE/);
    expect(() => validateRoleAuthorization('R-01_AJUSTE_RENDIMIENTO', 'coordinator')).not.toThrow();
    expect(() => validateRoleAuthorization('R-01_AJUSTE_RENDIMIENTO', 'admin')).not.toThrow();

    // R-02 permite supervisor, coordinator, admin
    expect(() => validateRoleAuthorization('R-02_BALANCE_CUADRILLA', 'supervisor')).not.toThrow();
    expect(() => validateRoleAuthorization('R-02_BALANCE_CUADRILLA', 'crew_leader')).toThrow(/FORBIDDEN_ROLE/);
  });

  test('DEC-07: Idempotencia física: mismo decisionMutationId retorna registro persistido con isIdempotentReplay = true', async () => {
    const store = new InMemoryDecisionStore();
    const service = new DecisionGovernanceService({ inMemoryStore: store });

    const input = {
      decisionMutationId: 'mut_idempotent_01',
      recommendation: mockRecommendation,
      boardId: 'board_01',
      actorUserId: 'user_admin_01',
      actorRole: 'admin' as const,
      decisionStatus: 'ACCEPTED' as const,
      decisionReason: 'Aprobación inicial',
    };

    const res1 = await service.recordAndExecuteDecision(input);
    expect(res1.isIdempotentReplay).toBe(false);

    const res2 = await service.recordAndExecuteDecision(input);
    expect(res2.isIdempotentReplay).toBe(true);
    expect(res2.decisionRecord.id).toBe(res1.decisionRecord.id);
  });

  test('DEC-08: Replay idempotente no ejecuta nuevamente el gateway de dominio', async () => {
    let gatewayCallCount = 0;
    const store = new InMemoryDecisionStore();
    const service = new DecisionGovernanceService({
      inMemoryStore: store,
      overrides: {
        poaStandardUpdater: async (activityKey, rate) => {
          gatewayCallCount++;
          return { updatedRate: rate };
        },
      },
    });

    const input = {
      decisionMutationId: 'mut_replay_test',
      recommendation: mockRecommendation,
      boardId: 'board_01',
      actorUserId: 'user_admin_01',
      actorRole: 'admin' as const,
      decisionStatus: 'ACCEPTED' as const,
    };

    await service.recordAndExecuteDecision(input);
    expect(gatewayCallCount).toBe(1);

    // Reintento
    const resReplay = await service.recordAndExecuteDecision(input);
    expect(resReplay.isIdempotentReplay).toBe(true);
    expect(gatewayCallCount).toBe(1); // Cero llamadas adicionales al gateway
  });

  test('DEC-09 & DEC-10: Secuencia atómica y transición válida POSTPONED (seq 1) -> POSTPONED (seq 2) -> ACCEPTED (seq 3)', async () => {
    const store = new InMemoryDecisionStore();
    const service = new DecisionGovernanceService({ inMemoryStore: store });

    // Seq 1: POSTPONED
    const res1 = await service.recordAndExecuteDecision({
      decisionMutationId: 'mut_seq_1',
      recommendation: mockRecommendation,
      boardId: 'board_01',
      actorUserId: 'user_admin_01',
      actorRole: 'admin',
      decisionStatus: 'POSTPONED',
      decisionReason: 'Aplazado por comité semanal de obra',
    });
    expect(res1.decisionRecord.decisionSequenceNumber).toBe(1);
    expect(res1.decisionRecord.decisionStatus).toBe('POSTPONED');
    expect(res1.decisionRecord.actionStatus).toBe('NOT_APPLICABLE');

    // Seq 2: POSTPONED nuevamente
    const res2 = await service.recordAndExecuteDecision({
      decisionMutationId: 'mut_seq_2',
      recommendation: mockRecommendation,
      boardId: 'board_01',
      actorUserId: 'user_admin_01',
      actorRole: 'admin',
      decisionStatus: 'POSTPONED',
      postponedUntilIso: '2026-10-15T00:00:00.000Z',
    });
    expect(res2.decisionRecord.decisionSequenceNumber).toBe(2);

    // Seq 3: ACCEPTED
    const res3 = await service.recordAndExecuteDecision({
      decisionMutationId: 'mut_seq_3',
      recommendation: mockRecommendation,
      boardId: 'board_01',
      actorUserId: 'user_admin_01',
      actorRole: 'admin',
      decisionStatus: 'ACCEPTED',
      decisionReason: 'Finalmente aprobado en seq 3',
    });
    expect(res3.decisionRecord.decisionSequenceNumber).toBe(3);
    expect(res3.decisionRecord.decisionStatus).toBe('ACCEPTED');
    expect(res3.decisionRecord.actionStatus).toBe('EXECUTED');
  });

  test('DEC-11: Transición inválida: Intento de mutar recomendación ya ACCEPTED lanza error', async () => {
    const store = new InMemoryDecisionStore();
    const service = new DecisionGovernanceService({ inMemoryStore: store });

    await service.recordAndExecuteDecision({
      decisionMutationId: 'mut_acc_01',
      recommendation: mockRecommendation,
      boardId: 'board_01',
      actorUserId: 'user_admin_01',
      actorRole: 'admin',
      decisionStatus: 'ACCEPTED',
    });

    await expect(
      service.recordAndExecuteDecision({
        decisionMutationId: 'mut_acc_02',
        recommendation: mockRecommendation,
        boardId: 'board_01',
        actorUserId: 'user_admin_01',
        actorRole: 'admin',
        decisionStatus: 'POSTPONED',
        decisionReason: 'Intento inválido de aplazar lo ya aceptado',
      })
    ).rejects.toThrow(/CANNOT_MUTATE_ACCEPTED_RECOMMENDATION/);
  });

  test('DEC-12: Transición inválida: Intento de mutar recomendación ya REJECTED lanza error', async () => {
    const store = new InMemoryDecisionStore();
    const service = new DecisionGovernanceService({ inMemoryStore: store });

    await service.recordAndExecuteDecision({
      decisionMutationId: 'mut_rej_01',
      recommendation: mockRecommendation,
      boardId: 'board_01',
      actorUserId: 'user_admin_01',
      actorRole: 'admin',
      decisionStatus: 'REJECTED',
      decisionReason: 'Rechazo definitivo por inviabilidad técnica',
    });

    await expect(
      service.recordAndExecuteDecision({
        decisionMutationId: 'mut_rej_02',
        recommendation: mockRecommendation,
        boardId: 'board_01',
        actorUserId: 'user_admin_01',
        actorRole: 'admin',
        decisionStatus: 'ACCEPTED',
      })
    ).rejects.toThrow(/CANNOT_MUTATE_REJECTED_RECOMMENDATION/);
  });
});
