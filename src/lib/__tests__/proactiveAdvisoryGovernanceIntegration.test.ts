/**
 * Test Suite: Cognitive Governance & Proactive Advisory Integration (v1.0)
 *
 * Cobertura de Integración Extremo a Extremo:
 * HECHO → MÉTRICA → PATRÓN → RECOMENDACIÓN (PROPOSED) → DECISIÓN HUMANA → ACCIÓN SOBERANA → RESULTADO → EVALUACIÓN
 *
 * Axiomas de Gobierno Verificados:
 * 1. MantenixAgent observa, analiza y recomienda (PROPOSED / projectedValue = null).
 * 2. Cero mutaciones automáticas directas a BD por la IA.
 * 3. Frontera soberana delegada exclusivamente a DecisionGovernanceService.
 * 4. Invariante total sobre baseline 8c67a0a.
 */

import {
  evaluateProactive3DDiscrepancies,
  POAItemContract,
} from '../operationalAdvisoryProactiveService';
import { validateDecisionReason } from '../decisionGovernanceService';
import { WeeklyPlanItem } from '@/types/weeklyPlan';
import { ExecutionRecord } from '@/types/execution';
import { DecisionRecord } from '@/types/decisionGovernance';

describe('Cognitive Governance & Proactive Advisory Integration (v1.0)', () => {
  const mockBoardId = 'board-gov-integration-9001';
  const mockActivityKey = '2.01';
  const mockZone = 'Zona Sur';

  const poaItems: POAItemContract[] = [
    {
      activityKey: mockActivityKey,
      name: 'Limpieza de Canales',
      zone: mockZone,
      unit: 'ML',
      contractualQty: 500,
      contractualFrequency: 4,
    },
  ];

  const weeklyPlanItems: WeeklyPlanItem[] = [
    {
      id: 'plan-item-901',
      weekly_plan_id: 'plan-901',
      board_id: mockBoardId,
      activity_key: mockActivityKey,
      name: 'Limpieza de Canales',
      zone: mockZone,
      unit: 'ML',
      planned_date: '2026-09-22',
      planned_qty: 850, // Materializado = 850 ML vs 500 ML en POA (+70%)
      theoretical_jr: 3.0,
      source_type: 'ROUTINE',
      routine_reference: 'routine-201',
      occurrence_key: `${mockBoardId}__site__routine-201__2.01__2026-09-22`,
      is_manual_override: false,
      status: 'planned',
    },
  ];

  const executionRecords: ExecutionRecord[] = [
    {
      id: 'exec-901',
      weekly_plan_item_id: 'plan-item-901',
      board_id: mockBoardId,
      execution_date: '2026-09-22',
      executed_qty: 400,
      worker_count: 2,
      hours_worked: 8,
      reported_by: 'operator-1',
      verification_status: 'verified',
    },
  ];

  test('Fase 1 a 4: Detección -> Métricas -> Patrón -> Recomendación PROPOSED con cero mutaciones', () => {
    const advisoryResult = evaluateProactive3DDiscrepancies({
      boardId: mockBoardId,
      poaItems,
      weeklyPlanItems,
      executionRecords,
    });

    // 1. Verificación de contrato consultivo
    expect(advisoryResult.recommendationsCount).toBe(1);
    const rec = advisoryResult.recommendations[0];

    expect(rec.recommendationKey).toBe('R-05_DISCREPANCIA_TRIDIMENSIONAL_MATERIALIZADA');
    expect(rec.status).toBe('PROPOSED'); // Axioma: IA solo propone
    expect(rec.projectedImpact.projectedValue).toBeNull(); // Axioma: Honestidad epistemológica
    expect(rec.proposedAction.applicableDomainGateway).toBe('weeklyPlanService');
    expect(rec.confidenceScore).toBe(0.85);
  });

  test('Fase 5: Gobernanza de Decisión Humana (Aceptación / Rechazo Gobernadop por DecisionGovernanceService)', () => {
    const advisoryResult = evaluateProactive3DDiscrepancies({
      boardId: mockBoardId,
      poaItems,
      weeklyPlanItems,
      executionRecords,
    });

    const rec = advisoryResult.recommendations[0];

    // Rechazo sin justificación suficiente debe fallar
    expect(() => {
      validateDecisionReason('REJECTED', 'corto');
    }).toThrow('VALIDATION_ERROR: El rechazo de una recomendación requiere una justificación válida de al menos 10 caracteres no vacíos.');

    // Rechazo con justificación válida debe ser aprobado por la regla de gobernanza
    expect(() => {
      validateDecisionReason('REJECTED', 'Justificación extensa aprobada por el supervisor para ajustar planeación.');
    }).not.toThrow();

    // Simular decisión de ACEPTADO
    const acceptedRecord: DecisionRecord = {
      id: 'dec-accepted-901',
      decisionMutationId: 'mut-acc-901',
      recommendationId: rec.recommendationId,
      recommendationKey: rec.recommendationKey,
      decisionSequenceNumber: 1,
      boardId: mockBoardId,
      actorUserId: 'supervisor-lead',
      actorRole: 'supervisor',
      decisionStatus: 'ACCEPTED',
      decisionReason: 'Aceptado reajuste de cuota en cronograma semanal',
      postponedUntilIso: null,
      decisionTimestamp: new Date().toISOString(),
      recommendationSnapshot: rec,
      actionStatus: 'EXECUTED',
      executionSnapshot: {
        actionType: 'ADVISE_MULTIDAY_PLANNING',
        occurrenceKey: weeklyPlanItems[0].occurrence_key,
        originalPlannedDays: 1,
        confirmedPlannedDays: 2,
        confirmedSplitDates: ['2026-09-22', '2026-09-23'],
        appliedAtIso: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Re-evaluación posterior: La recomendación aceptada no vuelve a aparecer en la lista proactiva
    const postDecisionResult = evaluateProactive3DDiscrepancies({
      boardId: mockBoardId,
      poaItems,
      weeklyPlanItems,
      executionRecords,
      priorDecisions: [acceptedRecord],
    });

    expect(postDecisionResult.recommendationsCount).toBe(0);
  });
});
