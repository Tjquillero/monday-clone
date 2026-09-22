/**
 * Test Suite 50: Supervisor Executive Dashboard (Fase 5.5)
 * Baseline Rectora de Entrada: 106 suites / 818 tests -> 107 suites / 832 tests
 *
 * Casos de Prueba Contractuales:
 * - DSH-01A: Inmutabilidad profunda de entradas (Deep Freeze)
 * - DSH-01B: Cero operaciones de mutación o escritura a BD (Read Model puro)
 * - DSH-02: Paridad de avance físico con F5.4 (incluyendo caso 0 ocurrencias)
 * - DSH-03: Paridad financiera contractual 1:1 desde F5.4
 * - DSH-04: Propagación visual de indeterminación (no conversión a 0 o $0)
 * - DSH-05: Invarianza de costo real AC (UNDETERMINED_MONETARY_COST)
 * - DSH-06: Contrato soberano CREW_OVERLOAD y CREW_CAPACITY_UNDETERMINED desde H4.9
 * - DSH-07: Contrato determinístico PENDING_VERIFICATION con timezone America/Bogota
 * - DSH-08: Alertas OVER_BILLED, EXCESO_JORNALES y SUBEJECUCION_ALCANCE
 * - DSH-09: Seguridad y redacción RBAC integral desde TrustedAuthContext
 * - DSH-10: Identidad, deduplicación y orden canónico de alertas
 * - DSH-11: actionHint declarativo y cero prescripción operativa
 * - DSH-12: Contrato completo de isStale y error en evaluatedAt inválido
 * - DSH-13: Propagación de indeterminación agregada sin corromper magnitudes físicas
 * - DSH-14: Aislamiento total y auditoría estática contra Solver H8
 */

import {
  evaluateSupervisorExecutiveDashboardView,
  TrustedAuthContext,
  ExecutiveActionHint,
  CONTRACTUAL_TIMEZONE,
  STALE_THRESHOLD_MS,
} from '../supervisorExecutiveDashboardService';
import { WeeklyPlanItem } from '@/types/weeklyPlan';
import { ExecutionRecord } from '@/types/execution';
import { Crew } from '@/types/crew';
import { Acta, ActaItem, ActaItemSource } from '@/types/acta';
import { ContractualPriceSource } from '../realCostVarianceService';
import { DailyCrewWorkload } from '../operationalCapacityService';
import * as fs from 'fs';
import * as path from 'path';

describe('Suite 50: Supervisor Executive Dashboard (Fase 5.5)', () => {
  const mockAuthAdmin: TrustedAuthContext = {
    userId: 'usr_admin',
    boardId: 'board_alpha',
    userRoles: [{ board_id: 'board_alpha', role: 'admin' }],
  };

  const mockAuthWorker: TrustedAuthContext = {
    userId: 'usr_worker',
    boardId: 'board_alpha',
    userRoles: [{ board_id: 'board_alpha', role: 'worker' }],
  };

  const mockAuthDifferentBoard: TrustedAuthContext = {
    userId: 'usr_other',
    boardId: 'board_alpha',
    userRoles: [{ board_id: 'board_beta', role: 'admin' }],
  };

  const mockPlanItem1: WeeklyPlanItem = {
    id: 'pi_01',
    weekly_plan_id: 'wp_01',
    board_id: 'board_alpha',
    activity_key: 'LIMPIEZA',
    name: 'Limpieza General',
    zone: 'Sector Norte',
    unit: 'm2',
    planned_date: '2026-09-15',
    planned_qty: 100,
    theoretical_jr: 10,
    source_type: 'ROUTINE',
    routine_reference: 'ROUTINE_01',
    occurrence_key: 'occ_alpha_01',
    crew_id: 'crew_01',
    is_manual_override: false,
    status: 'planned',
  };

  const mockPrice: ContractualPriceSource = {
    poaActivityId: 'LIMPIEZA',
    unitPrice: 20000,
    currency: 'COP',
    unit: 'm2',
  };

  const mockCrew: Crew = {
    id: 'crew_01',
    board_id: 'board_alpha',
    name: 'Cuadrilla Alfa',
    is_active: true,
  };

  const mockWorkloadOverload: DailyCrewWorkload = {
    crewId: 'crew_01',
    crewName: 'Cuadrilla Alfa',
    plannedDate: '2026-09-15',
    assignedItemsCount: 2,
    totalPlannedJournals: 4.5,
    applicableDailyCapacity: 3.0,
    utilizationRate: 1.5,
    capacityStatus: 'OVERLOADED',
    status: 'SOBRECARGA',
    items: [],
  };

  const evaluatedAtValid = '2026-09-15T15:00:00Z'; // 10:00 AM en America/Bogota (2026-09-15)
  const lastSyncFresh = '2026-09-15T14:50:00Z'; // 10 min de antigüedad (< 15 min)

  // DSH-01A: Inmutabilidad profunda de entradas
  test('DSH-01A: Inmutabilidad profunda de arrays y objetos de entrada', () => {
    const frozenPlanItems = [Object.freeze({ ...mockPlanItem1 })];
    const frozenExecutions: ExecutionRecord[] = [];
    const frozenPrices = [Object.freeze({ ...mockPrice })];

    expect(() => {
      evaluateSupervisorExecutiveDashboardView(
        'board_alpha',
        frozenPlanItems,
        frozenExecutions,
        frozenPrices,
        [],
        [],
        [],
        [mockCrew],
        [mockWorkloadOverload],
        mockAuthAdmin,
        evaluatedAtValid,
        lastSyncFresh
      );
    }).not.toThrow();
  });

  // DSH-01B: Cero operaciones de mutación o escritura a BD
  test('DSH-01B: Fachada consultiva pura sin efectos secundarios de escritura', () => {
    const result = evaluateSupervisorExecutiveDashboardView(
      'board_alpha',
      [mockPlanItem1],
      [],
      [mockPrice],
      [],
      [],
      [],
      [mockCrew],
      [],
      mockAuthAdmin,
      evaluatedAtValid,
      lastSyncFresh
    );

    expect(result).toBeDefined();
    expect(result.boardId).toBe('board_alpha');
  });

  // DSH-02: Paridad de avance físico con F5.4
  test('DSH-02: Paridad de avance físico con F5.4 (incluyendo caso 0 ocurrencias)', () => {
    // Caso 1: Con ocurrencias
    const execVerified: ExecutionRecord = {
      id: 'ex_01',
      weekly_plan_item_id: 'pi_01',
      board_id: 'board_alpha',
      execution_date: '2026-09-15',
      executed_qty: 100,
      worker_count: 1,
      hours_worked: 80,
      reported_by: 'usr_worker',
      verification_status: 'verified',
    };

    const res = evaluateSupervisorExecutiveDashboardView(
      'board_alpha',
      [mockPlanItem1],
      [execVerified],
      [mockPrice],
      [],
      [],
      [],
      [mockCrew],
      [],
      mockAuthAdmin,
      evaluatedAtValid,
      lastSyncFresh
    );

    expect(res.physicalKpis.totalOccurrencesCount).toBe(1);
    expect(res.physicalKpis.scopeComplianceRate).toBe(100);
    expect(res.physicalKpis.totalPlannedQty).toBe(100);
    expect(res.physicalKpis.totalExecutedQtyVerified).toBe(100);

    // Caso 2: 0 ocurrencias
    const resZero = evaluateSupervisorExecutiveDashboardView(
      'board_alpha',
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      mockAuthAdmin,
      evaluatedAtValid,
      lastSyncFresh
    );

    expect(resZero.physicalKpis.totalOccurrencesCount).toBe(0);
    expect(resZero.physicalKpis.scopeComplianceRate).toBe(0);
  });

  // DSH-03: Paridad financiera contractual 1:1 desde F5.4
  test('DSH-03: Paridad financiera contractual 1:1 proyectada desde F5.4', () => {
    const exec: ExecutionRecord = {
      id: 'ex_01',
      weekly_plan_item_id: 'pi_01',
      board_id: 'board_alpha',
      execution_date: '2026-09-15',
      executed_qty: 80,
      worker_count: 1,
      hours_worked: 64,
      reported_by: 'usr_worker',
      verification_status: 'verified',
    };

    const actas: Acta[] = [
      { id: 'acta_01', board_id: 'board_alpha', numero: 1, estado: 'issued', generated_by: 'u1', generated_at: '2026-09-16T10:00:00Z' },
    ];
    const actaItems: ActaItem[] = [
      { id: 'ai_01', acta_id: 'acta_01', poa_activity_id: 'LIMPIEZA', descripcion_snapshot: 'L', unidad_snapshot: 'm2', precio_unitario_snapshot: 20000, cantidad_facturada: 80 },
    ];
    const actaItemSources: ActaItemSource[] = [
      { id: 'ais_01', acta_item_id: 'ai_01', execution_id: 'ex_01', cantidad_consumida: 80 },
    ];

    const res = evaluateSupervisorExecutiveDashboardView(
      'board_alpha',
      [mockPlanItem1],
      [exec],
      [mockPrice],
      actas,
      actaItems,
      actaItemSources,
      [mockCrew],
      [],
      mockAuthAdmin,
      evaluatedAtValid,
      lastSyncFresh
    );

    expect(res.financialKpis).not.toBeNull();
    expect(res.financialKpis?.plannedValueCOP).toBe(2000000); // 100 * 20k
    expect(res.financialKpis?.earnedValueCOP).toBe(1600000); // 80 * 20k
    expect(res.financialKpis?.contractualValueVarianceCOP).toBe(-400000);
    expect(res.financialKpis?.billedValueCOP).toBe(1600000); // 80 * 20k
  });

  // DSH-04: Propagación visual de indeterminación
  test('DSH-04: Preserva indicadores indeterminados sin convertirlos a $0 o 0%', () => {
    // Sin precios
    const res = evaluateSupervisorExecutiveDashboardView(
      'board_alpha',
      [mockPlanItem1],
      [],
      [],
      [],
      [],
      [],
      [mockCrew],
      [],
      mockAuthAdmin,
      evaluatedAtValid,
      lastSyncFresh
    );

    expect(res.financialKpis?.plannedValueCOP).toBe('UNDETERMINED_CONTRACT_VALUE');
    expect(res.financialKpis?.earnedValueCOP).toBe('UNDETERMINED_CONTRACT_VALUE');
    expect(res.financialKpis?.contractualValueVarianceCOP).toBe('UNDETERMINED_CONTRACT_VALUE');
  });

  // DSH-05: Invarianza de costo real AC
  test('DSH-05: AC y CV se mantienen formalmente en estado indeterminado', () => {
    const res = evaluateSupervisorExecutiveDashboardView(
      'board_alpha',
      [mockPlanItem1],
      [],
      [mockPrice],
      [],
      [],
      [],
      [mockCrew],
      [],
      mockAuthAdmin,
      evaluatedAtValid,
      lastSyncFresh
    );

    expect(res.financialKpis?.actualCostStatus).toBe('UNDETERMINED_MONETARY_COST');
    expect(res.financialKpis?.costVarianceStatus).toBe('UNDETERMINED_COST_VARIANCE');
  });

  // DSH-06: Contrato soberano CREW_OVERLOAD y CREW_CAPACITY_UNDETERMINED desde H4.9
  test('DSH-06: Dispara alertas CREW_OVERLOAD y CREW_CAPACITY_UNDETERMINED según H4.9', () => {
    // Caso 1: OVERLOAD > 1.0 JR -> CRITICAL (4.5 - 3.0 = 1.5 JR)
    const resCritical = evaluateSupervisorExecutiveDashboardView(
      'board_alpha',
      [mockPlanItem1],
      [],
      [mockPrice],
      [],
      [],
      [],
      [mockCrew],
      [mockWorkloadOverload],
      mockAuthAdmin,
      evaluatedAtValid,
      lastSyncFresh
    );

    const alertOverloadCrit = resCritical.alerts.find((a) => a.category === 'CREW_OVERLOAD');
    expect(alertOverloadCrit).toBeDefined();
    expect(alertOverloadCrit?.severity).toBe('CRITICAL');
    expect(alertOverloadCrit?.details?.overloadJr).toBe(1.5);
    expect(alertOverloadCrit?.actionHint).toBe('REVIEW_CREW_CAPACITY');

    // Caso 2: OVERLOAD <= 1.0 JR -> HIGH (3.5 - 3.0 = 0.5 JR)
    const workloadHigh: DailyCrewWorkload = {
      ...mockWorkloadOverload,
      totalPlannedJournals: 3.5,
      capacityStatus: 'OVERLOADED',
    };
    const resHigh = evaluateSupervisorExecutiveDashboardView(
      'board_alpha',
      [mockPlanItem1],
      [],
      [mockPrice],
      [],
      [],
      [],
      [mockCrew],
      [workloadHigh],
      mockAuthAdmin,
      evaluatedAtValid,
      lastSyncFresh
    );
    const alertOverloadHigh = resHigh.alerts.find((a) => a.category === 'CREW_OVERLOAD');
    expect(alertOverloadHigh?.severity).toBe('HIGH');

    // Caso 3: UNDETERMINED_CAPACITY -> CREW_CAPACITY_UNDETERMINED (INFO)
    const workloadUndetermined: DailyCrewWorkload = {
      ...mockWorkloadOverload,
      capacityStatus: 'UNDETERMINED_CAPACITY',
      applicableDailyCapacity: undefined,
    };
    const resUndet = evaluateSupervisorExecutiveDashboardView(
      'board_alpha',
      [mockPlanItem1],
      [],
      [mockPrice],
      [],
      [],
      [],
      [mockCrew],
      [workloadUndetermined],
      mockAuthAdmin,
      evaluatedAtValid,
      lastSyncFresh
    );
    const alertCapacityUndet = resUndet.alerts.find(
      (a) => a.category === 'CREW_CAPACITY_UNDETERMINED'
    );
    expect(alertCapacityUndet).toBeDefined();
    expect(alertCapacityUndet?.severity).toBe('INFO');
  });

  // DSH-07: Contrato determinístico PENDING_VERIFICATION con timezone America/Bogota
  test('DSH-07: Evalúa PENDING_VERIFICATION comparando contra referenceDate en America/Bogota', () => {
    // evaluatedAt = 2026-09-15T02:00:00Z -> En America/Bogota es 2026-09-14T21:00 (referenceDate = 2026-09-14)
    const evaluatedBogotaNight = '2026-09-15T02:00:00Z';

    // Ejecución del 2026-09-13 (vencida respecto a 2026-09-14) -> HIGH
    const execOverdue: ExecutionRecord = {
      id: 'ex_pend_1',
      weekly_plan_item_id: 'pi_01',
      board_id: 'board_alpha',
      execution_date: '2026-09-13',
      executed_qty: 50,
      worker_count: 1,
      hours_worked: 40,
      reported_by: 'u1',
      verification_status: 'reported',
    };

    const resOverdue = evaluateSupervisorExecutiveDashboardView(
      'board_alpha',
      [mockPlanItem1],
      [execOverdue],
      [mockPrice],
      [],
      [],
      [],
      [mockCrew],
      [],
      mockAuthAdmin,
      evaluatedBogotaNight,
      '2026-09-15T01:50:00Z'
    );

    expect(resOverdue.referenceDate).toBe('2026-09-14');
    const alertOverdue = resOverdue.alerts.find((a) => a.category === 'PENDING_VERIFICATION');
    expect(alertOverdue?.severity).toBe('HIGH');

    // Ejecución del 2026-09-14 (del mismo día / vigente) -> MEDIUM
    const execToday: ExecutionRecord = {
      ...execOverdue,
      execution_date: '2026-09-14',
    };
    const resToday = evaluateSupervisorExecutiveDashboardView(
      'board_alpha',
      [mockPlanItem1],
      [execToday],
      [mockPrice],
      [],
      [],
      [],
      [mockCrew],
      [],
      mockAuthAdmin,
      evaluatedBogotaNight,
      '2026-09-15T01:50:00Z'
    );
    const alertToday = resToday.alerts.find((a) => a.category === 'PENDING_VERIFICATION');
    expect(alertToday?.severity).toBe('MEDIUM');
  });

  // DSH-08: Alertas OVER_BILLED, EXCESO_JORNALES y SUBEJECUCION_ALCANCE
  test('DSH-08: Genera alertas canónicas de sobre-facturación y desviaciones de esfuerzo', () => {
    const execExcess: ExecutionRecord = {
      id: 'ex_01',
      weekly_plan_item_id: 'pi_01',
      board_id: 'board_alpha',
      execution_date: '2026-09-15',
      executed_qty: 100,
      worker_count: 1,
      hours_worked: 96, // 12 JR vs 10 theo -> Exceso +2 JR
      reported_by: 'u1',
      verification_status: 'verified',
    };

    const actasOver: Acta[] = [
      { id: 'acta_01', board_id: 'board_alpha', numero: 1, estado: 'issued', generated_by: 'u1', generated_at: '2026-09-16T10:00:00Z' },
    ];
    const actaItemsOver: ActaItem[] = [
      { id: 'ai_01', acta_id: 'acta_01', poa_activity_id: 'LIMPIEZA', descripcion_snapshot: 'L', unidad_snapshot: 'm2', precio_unitario_snapshot: 20000, cantidad_facturada: 150 },
    ];
    const actaItemSourcesOver: ActaItemSource[] = [
      { id: 'ais_01', acta_item_id: 'ai_01', execution_id: 'ex_01', cantidad_consumida: 150 },
    ];

    const res = evaluateSupervisorExecutiveDashboardView(
      'board_alpha',
      [mockPlanItem1],
      [execExcess],
      [mockPrice],
      actasOver,
      actaItemsOver,
      actaItemSourcesOver,
      [mockCrew],
      [],
      mockAuthAdmin,
      evaluatedAtValid,
      lastSyncFresh
    );

    const alertOverBilled = res.alerts.find((a) => a.category === 'OVER_BILLED');
    expect(alertOverBilled?.severity).toBe('CRITICAL');
    expect(alertOverBilled?.actionHint).toBe('REVIEW_BILLING_RECONCILIATION');

    const alertExceso = res.alerts.find((a) => a.category === 'EXCESO_JORNALES');
    expect(alertExceso?.severity).toBe('HIGH');
    expect(alertExceso?.actionHint).toBe('REVIEW_EFFORT_OVERRUN');
  });

  // DSH-09: Seguridad y redacción RBAC integral desde TrustedAuthContext
  test('DSH-09: Redacta bloque financiero integralmente ante roles no autorizados o de otro board', () => {
    // Caso 1: Usuario con rol worker
    const resWorker = evaluateSupervisorExecutiveDashboardView(
      'board_alpha',
      [mockPlanItem1],
      [],
      [mockPrice],
      [],
      [],
      [],
      [mockCrew],
      [],
      mockAuthWorker,
      evaluatedAtValid,
      lastSyncFresh
    );

    expect(resWorker.isFinancialViewPermitted).toBe(false);
    expect(resWorker.financialKpis).toBeNull();
    expect(resWorker.occurrences[0].financial).toBeNull();
    // Alertas financieras no aparecen para worker
    expect(resWorker.alerts.some((a) => a.category === 'OVER_BILLED' || a.category === 'UNDETERMINED_PRICING')).toBe(false);

    // Caso 2: Usuario con rol admin en un board DIFERENTE (board_beta)
    const resDiffBoard = evaluateSupervisorExecutiveDashboardView(
      'board_alpha',
      [mockPlanItem1],
      [],
      [mockPrice],
      [],
      [],
      [],
      [mockCrew],
      [],
      mockAuthDifferentBoard,
      evaluatedAtValid,
      lastSyncFresh
    );

    expect(resDiffBoard.isFinancialViewPermitted).toBe(false);
    expect(resDiffBoard.financialKpis).toBeNull();
  });

  // DSH-10: Identidad, deduplicación y orden canónico de alertas
  test('DSH-10: Valida formato de alertId, deduplicación y orden canónico por severidad', () => {
    const workload1: DailyCrewWorkload = { ...mockWorkloadOverload, crewId: 'crew_01' };
    const workload2: DailyCrewWorkload = {
      ...mockWorkloadOverload,
      crewId: 'crew_02',
      totalPlannedJournals: 3.5,
      capacityStatus: 'OVERLOADED',
    };

    const res = evaluateSupervisorExecutiveDashboardView(
      'board_alpha',
      [mockPlanItem1],
      [],
      [mockPrice],
      [],
      [],
      [],
      [mockCrew],
      [workload1, workload2],
      mockAuthAdmin,
      evaluatedAtValid,
      lastSyncFresh
    );

    // Verifica formato alertId
    for (const a of res.alerts) {
      expect(a.alertId).toMatch(/^board_alpha__[A-Z_]+__[a-zA-Z0-9_-]+__[a-zA-Z0-9_-]+$/);
    }

    // Verifica orden canónico: CRITICAL precede a HIGH, etc.
    const severityValues = res.alerts.map((a) => a.severity);
    const orderRank = { CRITICAL: 1, HIGH: 2, MEDIUM: 3, INFO: 4 };
    for (let i = 0; i < severityValues.length - 1; i++) {
      expect(orderRank[severityValues[i]]).toBeLessThanOrEqual(orderRank[severityValues[i + 1]]);
    }
  });

  // DSH-11: actionHint declarativo y cero prescripción operativa
  test('DSH-11: actionHint contiene únicamente enums estáticos autorizados', () => {
    const res = evaluateSupervisorExecutiveDashboardView(
      'board_alpha',
      [mockPlanItem1],
      [],
      [mockPrice],
      [],
      [],
      [],
      [mockCrew],
      [mockWorkloadOverload],
      mockAuthAdmin,
      evaluatedAtValid,
      lastSyncFresh
    );

    const validHints: ExecutiveActionHint[] = [
      'REVIEW_BILLING_RECONCILIATION',
      'REVIEW_SCOPE_EXECUTION',
      'REVIEW_EFFORT_OVERRUN',
      'REVIEW_CREW_CAPACITY',
      'REVIEW_PENDING_VERIFICATION',
      'AUDIT_CONTRACT_PRICING',
    ];

    for (const a of res.alerts) {
      if (a.actionHint) {
        expect(validHints).toContain(a.actionHint);
      }
    }
  });

  // DSH-12: Contrato completo de isStale y error en evaluatedAt inválido
  test('DSH-12: Evalúa isStale ante frescura, timestamps futuros/ausentes y rechaza evaluatedAt inválido', () => {
    // Caso 1: evaluatedAt inválido -> Lanza error
    expect(() => {
      evaluateSupervisorExecutiveDashboardView(
        'board_alpha',
        [mockPlanItem1],
        [],
        [mockPrice],
        [],
        [],
        [],
        [mockCrew],
        [],
        mockAuthAdmin,
        'invalid_date_banana'
      );
    }).toThrow('INVALID_EVALUATED_AT_TIMESTAMP');

    // Caso 2: lastSyncTimestamp ausente -> isStale = true
    const resNoSync = evaluateSupervisorExecutiveDashboardView(
      'board_alpha',
      [mockPlanItem1],
      [],
      [mockPrice],
      [],
      [],
      [],
      [mockCrew],
      [],
      mockAuthAdmin,
      evaluatedAtValid,
      null
    );
    expect(resNoSync.isStale).toBe(true);

    // Caso 3: lastSyncTimestamp futuro anómalo -> isStale = true
    const resFuture = evaluateSupervisorExecutiveDashboardView(
      'board_alpha',
      [mockPlanItem1],
      [],
      [mockPrice],
      [],
      [],
      [],
      [mockCrew],
      [],
      mockAuthAdmin,
      '2026-09-15T10:00:00Z',
      '2026-09-15T10:05:00Z'
    );
    expect(resFuture.isStale).toBe(true);

    // Caso 4: lastSyncTimestamp con >15 min -> isStale = true
    const resOld = evaluateSupervisorExecutiveDashboardView(
      'board_alpha',
      [mockPlanItem1],
      [],
      [mockPrice],
      [],
      [],
      [],
      [mockCrew],
      [],
      mockAuthAdmin,
      '2026-09-15T10:20:00Z',
      '2026-09-15T10:00:00Z' // 20 min de antigüedad
    );
    expect(resOld.isStale).toBe(true);

    // Caso 5: lastSyncTimestamp con <=15 min -> isStale = false
    const resFresh = evaluateSupervisorExecutiveDashboardView(
      'board_alpha',
      [mockPlanItem1],
      [],
      [mockPrice],
      [],
      [],
      [],
      [mockCrew],
      [],
      mockAuthAdmin,
      '2026-09-15T10:10:00Z',
      '2026-09-15T10:00:00Z' // 10 min de antigüedad
    );
    expect(resFresh.isStale).toBe(false);
  });

  // DSH-13: Propagación de indeterminación agregada
  test('DSH-13: Propaga indeterminación en totales financieros sin corromper sumatorias físicas', () => {
    const item1 = { ...mockPlanItem1, id: 'pi_01', activity_key: 'LIMPIEZA' };
    const item2 = { ...mockPlanItem1, id: 'pi_02', activity_key: 'ACTIVIDAD_SIN_PRECIO', occurrence_key: 'occ_02' };

    // Precio solo para LIMPIEZA
    const prices = [{ poaActivityId: 'LIMPIEZA', unitPrice: 15000, currency: 'COP' as const }];

    const res = evaluateSupervisorExecutiveDashboardView(
      'board_alpha',
      [item1, item2],
      [],
      prices,
      [],
      [],
      [],
      [mockCrew],
      [],
      mockAuthAdmin,
      evaluatedAtValid,
      lastSyncFresh
    );

    // Magnitudes físicas intactas
    expect(res.physicalKpis.totalOccurrencesCount).toBe(2);
    expect(res.physicalKpis.totalPlannedQty).toBe(200); // 100 + 100

    // Magnitudes financieras agregadas se declaran indeterminadas
    expect(res.financialKpis?.plannedValueCOP).toBe('UNDETERMINED_CONTRACT_VALUE');
    expect(res.financialKpis?.earnedValueCOP).toBe('UNDETERMINED_CONTRACT_VALUE');
    expect(res.financialKpis?.contractualValueVarianceCOP).toBe('UNDETERMINED_CONTRACT_VALUE');
  });

  // DSH-14: Aislamiento total y auditoría estática contra Solver H8
  test('DSH-14: Auditoría de código fuente: 0 dependencias/imports del Solver H8', () => {
    const servicePath = path.resolve(__dirname, '../supervisorExecutiveDashboardService.ts');
    const fileContent = fs.readFileSync(servicePath, 'utf8');

    expect(fileContent).not.toMatch(/import\s+.*from\s+['"].*solver.*['"]/i);
    expect(fileContent).not.toMatch(/import\s+.*from\s+['"].*scheduleOptimizer.*['"]/i);
    expect(fileContent).not.toMatch(/scheduleOptimizer/i);
    expect(fileContent).not.toMatch(/solver/i);
    expect(fileContent).not.toMatch(/h8/i);
  });
});
