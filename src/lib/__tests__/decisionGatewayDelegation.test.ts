/**
 * Test Suite: Decision Gateway Delegation (GAT-01 to GAT-05)
 *
 * Cobertura:
 * - GAT-01: R-01 ACCEPTED despacha calibración de estándar a poaService
 * - GAT-02: R-02 ACCEPTED despacha asignación de cuadrilla a crewAssignmentService (F5.2)
 * - GAT-03: R-03 ACCEPTED despacha actualización de plantilla a weeklyPlanService/poaService
 * - GAT-04: R-04 ACCEPTED despacha desdoblamiento con OCC a weeklyPlanService
 * - GAT-05: Frontera RCO: resourceConsumptionControlService jamás es invocado para mutaciones
 */

import { DecisionGovernanceService, InMemoryDecisionStore } from '../decisionGovernanceService';
import { OperationalRecommendation } from '../../types/operationalAdvisory';

describe('Decision Gateway Delegation — Suite GAT-01 a GAT-05', () => {
  test('GAT-01: R-01 ACCEPTED despacha calibración de estándar normativo', async () => {
    let calibratedActivity = '';
    let calibratedRate = 0;

    const store = new InMemoryDecisionStore();
    const service = new DecisionGovernanceService({
      inMemoryStore: store,
      overrides: {
        poaStandardUpdater: async (activityKey, rate) => {
          calibratedActivity = activityKey;
          calibratedRate = rate;
          return { updatedRate: rate };
        },
      },
    });

    const recR01: OperationalRecommendation = {
      recommendationId: 'rec__R01',
      recommendationKey: 'R-01_AJUSTE_RENDIMIENTO',
      priority: 'HIGH',
      status: 'PROPOSED',
      scope: { scopeType: 'ACTIVITY', scopeId: 'poda_arboles' },
      triggeredPatternKey: 'P-01_SYSTEMATIC_UNDERESTIMATION',
      targetEntity: { entityType: 'ACTIVITY', entityId: 'poda_arboles' },
      sampleSize: 5,
      confidenceScore: 0.9,
      rationale: 'Rendimiento real 150 < 200',
      supportingMetrics: [],
      proposedAction: {
        actionType: 'ADVISE_STANDARD_REVISION',
        targetEntity: { entityType: 'ACTIVITY', entityId: 'poda_arboles' },
        suggestedParameters: { proposedStandardRate: 150 },
        applicableDomainGateway: 'poaService',
      },
      projectedImpact: {
        metricKey: 'METRIC_PRODUCTIVITY_INDEX',
        currentObservedValue: 0.75,
        proposedTargetValue: 1.0,
        projectedValue: null,
        unit: 'adimensional',
        expectedImprovementDescription: 'Calibración a 150 Und/JR',
      },
      generatedAtIso: '2026-09-13T10:00:00.000Z',
    };

    const res = await service.recordAndExecuteDecision({
      decisionMutationId: 'mut_gat_01',
      recommendation: recR01,
      boardId: 'board_01',
      actorUserId: 'user_admin',
      actorRole: 'admin',
      decisionStatus: 'ACCEPTED',
    });

    expect(res.gatewayExecutionStatus).toBe('EXECUTED');
    expect(calibratedActivity).toBe('poda_arboles');
    expect(calibratedRate).toBe(150);
    expect(res.decisionRecord.executionSnapshot).toEqual({
      actionType: 'ADVISE_STANDARD_REVISION',
      activityKey: 'poda_arboles',
      previousStandardRate: null,
      confirmedUpdatedRate: 150,
      appliedAtIso: expect.any(String),
    });
  });

  test('GAT-02: R-02 ACCEPTED despacha reasignación de cuadrilla a crewAssignmentService (F5.2)', async () => {
    let assignedPlanItemId = '';
    let assignedCrewId = '';

    const store = new InMemoryDecisionStore();
    const service = new DecisionGovernanceService({
      inMemoryStore: store,
      overrides: {
        crewAssignmentDispatcher: async (_supabase, input) => {
          assignedPlanItemId = input.planItemId;
          assignedCrewId = input.crewId!;
          return {
            evaluation: {
              allowed: true,
              action: 'REPLACE',
              reasonCode: 'ASSIGNMENT_ALLOWED',
              message: 'Ok',
              item: null,
              currentCrewId: 'crew_old',
              targetCrewId: input.crewId,
            },
            success: true,
            updatedItem: { crew_id: input.crewId } as any,
          };
        },
      },
    });

    const recR02: OperationalRecommendation = {
      recommendationId: 'rec__R02',
      recommendationKey: 'R-02_BALANCE_CUADRILLA',
      priority: 'HIGH',
      status: 'PROPOSED',
      scope: { scopeType: 'ACTIVITY', scopeId: 'limpieza_general' },
      triggeredPatternKey: 'P-02_CREW_PERFORMANCE_DISPERSION',
      targetEntity: { entityType: 'CREW', entityId: 'plan_item_123' },
      sampleSize: 6,
      confidenceScore: 0.92,
      rationale: 'Dispersión CV > 25%',
      supportingMetrics: [],
      proposedAction: {
        actionType: 'ADVISE_CREW_REALLOCATION',
        targetEntity: { entityType: 'CREW', entityId: 'plan_item_123' },
        suggestedParameters: { proposedTargetCrewId: 'crew_target_01' },
        applicableDomainGateway: 'crewAssignmentService',
      },
      projectedImpact: {
        metricKey: 'METRIC_PRODUCTIVITY_RATE',
        currentObservedValue: 0.28,
        proposedTargetValue: 0.12,
        projectedValue: null,
        unit: 'CV',
        expectedImprovementDescription: 'Reasignación de cuadrilla balanceada',
      },
      generatedAtIso: '2026-09-13T10:00:00.000Z',
    };

    const res = await service.recordAndExecuteDecision({
      decisionMutationId: 'mut_gat_02',
      recommendation: recR02,
      boardId: 'board_01',
      actorUserId: 'user_supervisor',
      actorRole: 'supervisor',
      decisionStatus: 'ACCEPTED',
    });

    expect(res.gatewayExecutionStatus).toBe('EXECUTED');
    expect(assignedPlanItemId).toBe('plan_item_123');
    expect(assignedCrewId).toBe('crew_target_01');
    expect(res.decisionRecord.executionSnapshot).toEqual({
      actionType: 'ADVISE_CREW_REALLOCATION',
      planItemId: 'plan_item_123',
      previousCrewId: null,
      confirmedCrewId: 'crew_target_01',
      appliedAtIso: expect.any(String),
    });
  });

  test('GAT-03: R-03 ACCEPTED despacha calibración de cuota a weeklyPlanService / poaService', async () => {
    let updatedResource = '';
    let updatedQuota = 0;

    const store = new InMemoryDecisionStore();
    const service = new DecisionGovernanceService({
      inMemoryStore: store,
      overrides: {
        resourceQuotaUpdater: async (resourceKey, _actKey, quota) => {
          updatedResource = resourceKey;
          updatedQuota = quota;
          return { confirmedQuota: quota };
        },
      },
    });

    const recR03: OperationalRecommendation = {
      recommendationId: 'rec__R03',
      recommendationKey: 'R-03_PROVISION_INSUMOS',
      priority: 'MEDIUM',
      status: 'PROPOSED',
      scope: { scopeType: 'ACTIVITY', scopeId: 'siembra_arbustos' },
      triggeredPatternKey: 'P-03_RESOURCE_CONSUMPTION_ANOMALY',
      targetEntity: { entityType: 'RESOURCE', entityId: 'MAT_FERTILIZANTE' },
      sampleSize: 4,
      confidenceScore: 0.85,
      rationale: 'Sobredemanda recurrente de fertilizante',
      supportingMetrics: [],
      proposedAction: {
        actionType: 'ADVISE_RESOURCE_TEMPLATE_UPDATE',
        targetEntity: { entityType: 'RESOURCE', entityId: 'MAT_FERTILIZANTE' },
        suggestedParameters: { proposedUnitQuota: 2.5 },
        applicableDomainGateway: 'weeklyPlanService',
      },
      projectedImpact: {
        metricKey: 'METRIC_RESOURCE_VARIANCE_DELTA',
        currentObservedValue: 0.8,
        proposedTargetValue: 0.0,
        projectedValue: null,
        unit: 'kg/und',
        expectedImprovementDescription: 'Ajuste de cuota en plantilla planificada',
      },
      generatedAtIso: '2026-09-13T10:00:00.000Z',
    };

    const res = await service.recordAndExecuteDecision({
      decisionMutationId: 'mut_gat_03',
      recommendation: recR03,
      boardId: 'board_01',
      actorUserId: 'user_supervisor',
      actorRole: 'supervisor',
      decisionStatus: 'ACCEPTED',
    });

    expect(res.gatewayExecutionStatus).toBe('EXECUTED');
    expect(updatedResource).toBe('MAT_FERTILIZANTE');
    expect(updatedQuota).toBe(2.5);
  });

  test('GAT-04: R-04 ACCEPTED despacha desdoblamiento con OCC a weeklyPlanService', async () => {
    let targetOccurrence = '';

    const store = new InMemoryDecisionStore();
    const service = new DecisionGovernanceService({
      inMemoryStore: store,
      overrides: {
        multidaySplitter: async (occurrenceKey) => {
          targetOccurrence = occurrenceKey;
          return { splitDates: ['2026-09-20', '2026-09-21'], plannedDays: 2 };
        },
      },
    });

    const recR04: OperationalRecommendation = {
      recommendationId: 'rec__R04',
      recommendationKey: 'R-04_DESDOBLAMIENTO_MULTIDIA',
      priority: 'HIGH',
      status: 'PROPOSED',
      scope: { scopeType: 'OCCURRENCE', scopeId: 'occ_poda_compleja' },
      triggeredPatternKey: 'P-04_HIDDEN_MULTIDAY_DRAG',
      targetEntity: { entityType: 'OCCURRENCE', entityId: 'occ_poda_compleja' },
      sampleSize: 4,
      confidenceScore: 0.88,
      rationale: 'Arrastre oculto de 2 días en actividad prevista para 1 día',
      supportingMetrics: [],
      proposedAction: {
        actionType: 'ADVISE_MULTIDAY_PLANNING',
        targetEntity: { entityType: 'OCCURRENCE', entityId: 'occ_poda_compleja' },
        suggestedParameters: { proposedPlannedDays: 2 },
        applicableDomainGateway: 'weeklyPlanService',
      },
      projectedImpact: {
        metricKey: 'METRIC_MULTIDAY_DURATION_DAYS',
        currentObservedValue: 2.0,
        proposedTargetValue: 2.0,
        projectedValue: null,
        unit: 'días',
        expectedImprovementDescription: 'Desdoblamiento en 2 jornadas planificadas',
      },
      generatedAtIso: '2026-09-13T10:00:00.000Z',
    };

    const res = await service.recordAndExecuteDecision({
      decisionMutationId: 'mut_gat_04',
      recommendation: recR04,
      boardId: 'board_01',
      actorUserId: 'user_supervisor',
      actorRole: 'supervisor',
      decisionStatus: 'ACCEPTED',
    });

    expect(res.gatewayExecutionStatus).toBe('EXECUTED');
    expect(targetOccurrence).toBe('occ_poda_compleja');
    expect(res.decisionRecord.executionSnapshot).toEqual({
      actionType: 'ADVISE_MULTIDAY_PLANNING',
      occurrenceKey: 'occ_poda_compleja',
      originalPlannedDays: 1,
      confirmedPlannedDays: 2,
      confirmedSplitDates: ['2026-09-20', '2026-09-21'],
      appliedAtIso: expect.any(String),
    });
  });

  test('GAT-05: Frontera RCO: resourceConsumptionControlService no posee funciones de mutación de demanda', async () => {
    const rcoModule = await import('../resourceConsumptionControlService');
    const exports = Object.keys(rcoModule);

    // RCO solo exporta funciones evaluativas/observacionales de lectura
    const mutationKeywords = ['update', 'insert', 'delete', 'mutate', 'create', 'set'];
    for (const exp of exports) {
      const lower = exp.toLowerCase();
      const isMutationFunction = mutationKeywords.some(k => lower.startsWith(k));
      expect(isMutationFunction).toBe(false);
    }
  });
});
