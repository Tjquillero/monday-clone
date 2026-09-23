/**
 * Test Suite: Proactive Advisory Observer & 3D Discrepancy Analyzer (v1.0)
 *
 * Cobertura de Gobierno:
 * - G2: Detección proactiva de R-05 sin detectores artificiales ad-hoc.
 * - G3: Respeto a arquitectura offline-first / event-driven sin polling.
 * - G4: Idempotencia determinista vía Fingerprint (SAME EVENT x N).
 * - G5: Respeto al ciclo de vida de decisiones (EVENT -> REJECTED -> SAME EVENT = 0 resurrección).
 */

import {
  evaluateProactive3DDiscrepancies,
  POAItemContract,
} from '../operationalAdvisoryProactiveService';
import { computePatternFingerprint } from '@/types/proactiveAdvisory';
import { WeeklyPlanItem } from '@/types/weeklyPlan';
import { ExecutionRecord } from '@/types/execution';
import { DecisionRecord } from '@/types/decisionGovernance';

describe('Proactive Advisory Observer & 3D Discrepancy Analysis (v1.0)', () => {
  const mockBoardId = 'board-test-1001';
  const mockActivityKey = '1.01';
  const mockZone = 'Zona Norte';

  const mockPoaItems: POAItemContract[] = [
    {
      activityKey: mockActivityKey,
      name: 'Corte de Césped',
      zone: mockZone,
      unit: 'M²',
      contractualQty: 1000,
      contractualFrequency: 4,
    },
  ];

  const mockWeeklyPlanItems: WeeklyPlanItem[] = [
    {
      id: 'plan-item-01',
      weekly_plan_id: 'plan-01',
      board_id: mockBoardId,
      activity_key: mockActivityKey,
      name: 'Corte de Césped',
      zone: mockZone,
      unit: 'M²',
      planned_date: '2026-09-22',
      planned_qty: 1500, // Discrepancia: 1500 M² planificados vs 1000 M² en POA (+50%)
      theoretical_jr: 2.0,
      source_type: 'ROUTINE',
      routine_reference: 'routine-01',
      occurrence_key: `${mockBoardId}__site__routine-01__1.01__2026-09-22`,
      is_manual_override: false,
      status: 'planned',
    },
  ];

  const mockExecutionRecords: ExecutionRecord[] = [
    {
      id: 'exec-01',
      weekly_plan_item_id: 'plan-item-01',
      board_id: mockBoardId,
      execution_date: '2026-09-22',
      executed_qty: 600,
      worker_count: 2,
      hours_worked: 8,
      reported_by: 'user-01',
      verification_status: 'verified',
    },
  ];

  test('G2: Detecta R-05_DISCREPANCIA_TRIDIMENSIONAL_MATERIALIZADA cuando el plan supera la cuota POA', () => {
    const result = evaluateProactive3DDiscrepancies({
      boardId: mockBoardId,
      poaItems: mockPoaItems,
      weeklyPlanItems: mockWeeklyPlanItems,
      executionRecords: mockExecutionRecords,
    });

    expect(result.boardId).toBe(mockBoardId);
    expect(result.recommendationsCount).toBe(1);

    const rec = result.recommendations[0];
    expect(rec.recommendationKey).toBe('R-05_DISCREPANCIA_TRIDIMENSIONAL_MATERIALIZADA');
    expect(rec.status).toBe('PROPOSED');
    expect(rec.triggeredPatternKey).toBe('P-05_DISCREPANCIA_MATERIALIZADA');
    expect(rec.targetEntity.entityId).toBe(`${mockActivityKey}__${mockZone}`);
    expect(rec.projectedImpact.projectedValue).toBeNull(); // Epistemológicamente null en v1
    expect(rec.projectedImpact.currentObservedValue).toBe(1.5); // 1500 / 1000 = 1.5 ratio
  });

  test('G4: Fingerprint determinista e Idempotencia (SAME EVENT x N)', () => {
    const entityId = `${mockActivityKey}__${mockZone}`;
    const fp1 = computePatternFingerprint(mockBoardId, 'R-05_DISCREPANCIA_TRIDIMENSIONAL_MATERIALIZADA', entityId);
    const fp2 = computePatternFingerprint(mockBoardId, 'R-05_DISCREPANCIA_TRIDIMENSIONAL_MATERIALIZADA', entityId);

    expect(fp1).toBe(fp2);
    expect(fp1).toBe(`fp__${mockBoardId}__R-05_DISCREPANCIA_TRIDIMENSIONAL_MATERIALIZADA__${entityId}__v1`);

    // Ejecutar N veces la misma evaluación
    const runs = Array.from({ length: 5 }).map(() =>
      evaluateProactive3DDiscrepancies({
        boardId: mockBoardId,
        poaItems: mockPoaItems,
        weeklyPlanItems: mockWeeklyPlanItems,
        executionRecords: mockExecutionRecords,
      })
    );

    const firstRecId = runs[0].recommendations[0].recommendationId;
    for (const run of runs) {
      expect(run.recommendationsCount).toBe(1);
      expect(run.recommendations[0].recommendationId).toBe(firstRecId);
    }
  });

  test('G5: Supresión de recomendaciones decididas previo (EVENT -> REJECTED -> SAME EVENT)', () => {
    const initialResult = evaluateProactive3DDiscrepancies({
      boardId: mockBoardId,
      poaItems: mockPoaItems,
      weeklyPlanItems: mockWeeklyPlanItems,
      executionRecords: mockExecutionRecords,
    });

    expect(initialResult.recommendationsCount).toBe(1);
    const recToReject = initialResult.recommendations[0];

    // Simular registro de decisión rechazada por el humano
    const priorDecisions: DecisionRecord[] = [
      {
        id: 'dec-uuid-001',
        decisionMutationId: 'mut-001',
        recommendationId: recToReject.recommendationId,
        recommendationKey: 'R-05_DISCREPANCIA_TRIDIMENSIONAL_MATERIALIZADA',
        decisionSequenceNumber: 1,
        boardId: mockBoardId,
        actorUserId: 'user-supervisor',
        actorRole: 'supervisor',
        decisionStatus: 'REJECTED',
        decisionReason: 'Discrepancia planificada fue autorizada por adición de contrato',
        postponedUntilIso: null,
        decisionTimestamp: new Date().toISOString(),
        recommendationSnapshot: recToReject,
        actionStatus: 'NOT_APPLICABLE',
        executionSnapshot: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    // Re-evaluar con el historial de decisiones
    const postRejectionResult = evaluateProactive3DDiscrepancies({
      boardId: mockBoardId,
      poaItems: mockPoaItems,
      weeklyPlanItems: mockWeeklyPlanItems,
      executionRecords: mockExecutionRecords,
      priorDecisions,
    });

    // La recomendación rechazada NO vuelve a sugerirse (0 resurrección)
    expect(postRejectionResult.recommendationsCount).toBe(0);
  });
});
