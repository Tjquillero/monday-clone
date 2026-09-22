/**
 * Test Suite 44: Supervisor Executive Dashboard (Fase 4 · Módulo 4)
 * Baseline: 100 suites / 734 tests preexistentes + Suite 44 (12 tests)
 *
 * Pruebas determinísticas de los 12 casos obligatorios (DASH-01 a DASH-12).
 */

import {
  buildSupervisorExecutiveDashboard,
  calculateVerifiedPhysicalProgressPct,
  generateExecutiveAlerts,
} from '../supervisorExecutiveDashboardService';
import { WeeklyPlanItem } from '@/types/weeklyPlan';
import { Crew, PersonnelSiteAssignment } from '@/types/crew';
import { MinimalExecutionRecord } from '../resourceConsumptionControlService';

describe('Suite 44: Supervisor Executive Dashboard (Fase 4 · Módulo 4)', () => {
  const mockBoardId = 'board-site-alpha';
  const mockDate = '2026-09-14'; // Lunes

  const baseItem: WeeklyPlanItem = {
    id: 'item-1',
    board_id: mockBoardId,
    weekly_plan_id: 'plan-w1',
    name: 'Corte de Césped ZV',
    activity_key: 'ACT-01',
    zone: 'ZV',
    unit: 'm2',
    planned_date: mockDate,
    planned_qty: 100,
    theoretical_jr: 2.0,
    source_type: 'ROUTINE',
    routine_reference: 'ROUTINE-01',
    occurrence_key: 'board-site-alpha__plan-w1__item-1__occ1',
    crew_id: 'crew-1',
    is_manual_override: false,
    status: 'planned',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const baseCrew: Crew = {
    id: 'crew-1',
    board_id: mockBoardId,
    name: 'Cuadrilla Alfa',
    code: 'C-ALFA',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // DASH-01: Avance Físico Soberano
  test('DASH-01: Mide determinísticamente el % de avance físico verificado', () => {
    const items: WeeklyPlanItem[] = [
      { ...baseItem, id: 'item-1', planned_qty: 100, occurrence_key: 'occ-1' },
      { ...baseItem, id: 'item-2', planned_qty: 200, occurrence_key: 'occ-2' },
    ];

    const executions: MinimalExecutionRecord[] = [
      { id: 'exec-1', occurrence_key: 'occ-1', executed_qty: 50, executed_jr: 1.0, verification_status: 'VERIFIED' },
      { id: 'exec-2', occurrence_key: 'occ-2', executed_qty: 100, executed_jr: 1.0, verification_status: 'VERIFIED' },
    ];

    const metrics = calculateVerifiedPhysicalProgressPct(items, executions);

    expect(metrics.totalPlannedQty).toBe(300);
    expect(metrics.totalVerifiedExecutedQty).toBe(150);
    expect(metrics.progressPct).toBe(50.0);
  });

  // DASH-02: Manejo de planned_qty = 0 (COR-03)
  test('DASH-02: Devuelve 0.0 % de avance cuando planned_qty = 0 sin producir NaN', () => {
    const items: WeeklyPlanItem[] = [
      { ...baseItem, id: 'item-zero', planned_qty: 0, occurrence_key: 'occ-zero' },
    ];

    const executions: MinimalExecutionRecord[] = [
      { id: 'exec-1', occurrence_key: 'occ-zero', executed_qty: 50, executed_jr: 1.0, verification_status: 'VERIFIED' },
    ];

    const metrics = calculateVerifiedPhysicalProgressPct(items, executions);

    expect(metrics.totalPlannedQty).toBe(0);
    expect(metrics.totalVerifiedExecutedQty).toBe(0);
    expect(metrics.progressPct).toBe(0.0);
    expect(Number.isNaN(metrics.progressPct)).toBe(false);
  });

  // DASH-03: Exclusión de Ejecuciones No Verificadas (COR-04)
  test('DASH-03: Ejecuciones en draft, reported, evidence_pending o rejected aportan 0.0 al avance', () => {
    const items: WeeklyPlanItem[] = [
      { ...baseItem, id: 'item-1', planned_qty: 100, occurrence_key: 'occ-1' },
    ];

    const executions: MinimalExecutionRecord[] = [
      { id: 'e1', occurrence_key: 'occ-1', executed_qty: 30, executed_jr: 1.0, verification_status: 'draft' },
      { id: 'e2', occurrence_key: 'occ-1', executed_qty: 30, executed_jr: 1.0, verification_status: 'reported' },
      { id: 'e3', occurrence_key: 'occ-1', executed_qty: 30, executed_jr: 1.0, verification_status: 'evidence_pending' },
      { id: 'e4', occurrence_key: 'occ-1', executed_qty: 30, executed_jr: 1.0, verification_status: 'rejected' },
    ];

    const metrics = calculateVerifiedPhysicalProgressPct(items, executions);

    expect(metrics.totalVerifiedExecutedQty).toBe(0.0);
    expect(metrics.progressPct).toBe(0.0);
  });

  // DASH-04: Aislamiento por occurrence_key (COR-02)
  test('DASH-04: Ejecuciones de una ocurrencia distinta no contribuyen al avance físico', () => {
    const items: WeeklyPlanItem[] = [
      { ...baseItem, id: 'item-1', planned_qty: 100, occurrence_key: 'board1__plan1__item1__w37' },
    ];

    const executions: MinimalExecutionRecord[] = [
      // Mismo plan_item_id pero diferente semana/occurrence_key
      { id: 'e1', weekly_plan_item_id: 'item-1', occurrence_key: 'board1__plan2__item1__w38', executed_qty: 100, executed_jr: 2.0, verification_status: 'VERIFIED' },
    ];

    const dashboard = buildSupervisorExecutiveDashboard({
      boardId: mockBoardId,
      planItems: items,
      executions,
      crews: [baseCrew],
    });

    expect(dashboard.verifiedPhysicalProgressPct).toBe(0.0);
  });

  // DASH-05: Preservación Inalterada de Estados H4.9
  test('DASH-05: Conteo exacto por estado de capacidad soberano H4.9', () => {
    const items: WeeklyPlanItem[] = [
      { ...baseItem, id: 'item-overload-1', theoretical_jr: 5.0, planned_date: '2026-09-14' }, // Lunes
    ];

    const dashboard = buildSupervisorExecutiveDashboard({
      boardId: mockBoardId,
      planItems: items,
      executions: [],
      crews: [baseCrew],
      dailyCapacityByCrew: { 'crew-1': 1.0 }, // Carga 5.0 vs Oferta 1.0 = OVERLOADED
    });

    expect(dashboard.crewCapacityDistribution.OVERLOADED).toBe(1);
  });

  // DASH-06: Preservación Inalterada de Estados Módulo 3
  test('DASH-06: Conteo exacto por estado de consumo físico soberano Módulo 3', () => {
    const items: WeeklyPlanItem[] = [
      { ...baseItem, id: 'item-sub', planned_qty: 100, theoretical_jr: 2.0, occurrence_key: 'occ-sub' },
    ];

    const executions: MinimalExecutionRecord[] = [
      { id: 'e1', occurrence_key: 'occ-sub', executed_qty: 40, executed_jr: 1.0, verification_status: 'VERIFIED' }, // 40 < 100 => SUBEJECUCION_ALCANCE
    ];

    const dashboard = buildSupervisorExecutiveDashboard({
      boardId: mockBoardId,
      planItems: items,
      executions,
      crews: [baseCrew],
    });

    expect(dashboard.consumptionSummary.subexecutionScopeItemsCount).toBe(1);
    expect(dashboard.consumptionSummary.completedScopeItemsCount).toBe(0);
  });

  // DASH-07: Generación de Alertas ALERT-01 y ALERT-02
  test('DASH-07: Genera ALERT-01 y ALERT-02 con severidad CRITICAL y entity_id = crew.id', () => {
    const items: WeeklyPlanItem[] = [
      { ...baseItem, id: 'item-1', crew_id: 'crew-over', theoretical_jr: 5.0, planned_date: '2026-09-14' },
      { ...baseItem, id: 'item-2', crew_id: 'crew-zero', theoretical_jr: 2.0, planned_date: '2026-09-14' },
    ];

    const crews: Crew[] = [
      { ...baseCrew, id: 'crew-over', name: 'Cuadrilla Overload' },
      { ...baseCrew, id: 'crew-zero', name: 'Cuadrilla Zero' },
    ];

    const dashboard = buildSupervisorExecutiveDashboard({
      boardId: mockBoardId,
      planItems: items,
      executions: [],
      crews,
      dailyCapacityByCrew: {
        'crew-over': 1.0, // D=5.0 > S=1.0 => OVERLOADED
        'crew-zero': 0.0, // D=2.0 > S=0.0 => CAPACITY_ZERO
      },
    });

    const alert01 = dashboard.alerts.find((a) => a.alertCode === 'ALERT-01');
    const alert02 = dashboard.alerts.find((a) => a.alertCode === 'ALERT-02');

    expect(alert01).toBeDefined();
    expect(alert01?.severity).toBe('CRITICAL');
    expect(alert01?.entityId).toBe('crew-over');
    expect(alert01?.alertId).toBe(`${mockBoardId}__2026-09-14__crew-over__ALERT-01`);

    expect(alert02).toBeDefined();
    expect(alert02?.severity).toBe('CRITICAL');
    expect(alert02?.entityId).toBe('crew-zero');
    expect(alert02?.alertId).toBe(`${mockBoardId}__2026-09-14__crew-zero__ALERT-02`);
  });

  // DASH-08: Generación de Alertas ALERT-03 y ALERT-04
  test('DASH-08: Genera ALERT-03 (día no laborable F3.1) y ALERT-04 (exceso JR)', () => {
    const sundayDate = '2026-09-13'; // Domingo (NON_WORKING_DAY en F3.1)
    const items: WeeklyPlanItem[] = [
      { ...baseItem, id: 'item-sunday', planned_date: sundayDate, theoretical_jr: 1.0, crew_id: 'crew-1' },
      { ...baseItem, id: 'item-excess', planned_date: '2026-09-14', planned_qty: 100, theoretical_jr: 2.0, occurrence_key: 'occ-excess' },
    ];

    const executions: MinimalExecutionRecord[] = [
      { id: 'e1', occurrence_key: 'occ-excess', executed_qty: 100, executed_jr: 3.5, verification_status: 'VERIFIED' }, // Δjr = 3.5 - 2.0 = 1.5 > 0.05 => EXCESO_CONSUMO_JR
    ];

    const dashboard = buildSupervisorExecutiveDashboard({
      boardId: mockBoardId,
      planItems: items,
      executions,
      crews: [baseCrew],
      dailyCapacityByCrew: { 'crew-1': 1.0 },
    });

    const alert03 = dashboard.alerts.find((a) => a.alertCode === 'ALERT-03');
    const alert04 = dashboard.alerts.find((a) => a.alertCode === 'ALERT-04');

    expect(alert03).toBeDefined();
    expect(alert03?.severity).toBe('HIGH');
    expect(alert03?.entityId).toBe('item-sunday'); // entity_id = weekly_plan_item.id per COR-06.1

    expect(alert04).toBeDefined();
    expect(alert04?.severity).toBe('HIGH');
    expect(alert04?.entityId).toBe('occ-excess'); // entity_id = occurrenceKey per COR-06.1
  });

  // DASH-09: Generación de Alertas ALERT-05 y ALERT-06
  test('DASH-09: Genera ALERT-05 (subejecución) y ALERT-06 (personal compartido Kp>1)', () => {
    const items: WeeklyPlanItem[] = [
      { ...baseItem, id: 'item-sub', planned_qty: 100, occurrence_key: 'occ-sub', crew_id: 'crew-shared' },
    ];

    const crews: Crew[] = [
      { ...baseCrew, id: 'crew-shared', name: 'Cuadrilla Compartida' },
      { ...baseCrew, id: 'crew-other', name: 'Cuadrilla Otra' },
    ];

    const crewMembersMap = new Map<string, Array<{ personnel_assignment_id: string }>>([
      ['crew-shared', [{ personnel_assignment_id: 'assign-1' }]],
      ['crew-other', [{ personnel_assignment_id: 'assign-1' }]], // assign-1 compartida K_p = 2 > 1
    ]);

    const allCrewMembersMap = new Map<string, string[]>([
      ['crew-shared', ['assign-1']],
      ['crew-other', ['assign-1']],
    ]);

    const assignmentObj: PersonnelSiteAssignment = {
      id: 'assign-1',
      version_id: 'v-1',
      personnel_id: 'p-1',
      zone: 'ZV',
      dedication_percentage: 100,
      created_at: new Date().toISOString(),
    };

    const allSiteAssignmentsMap = new Map<string, PersonnelSiteAssignment>([
      ['assign-1', assignmentObj],
    ]);

    const executions: MinimalExecutionRecord[] = [
      { id: 'e1', occurrence_key: 'occ-sub', executed_qty: 50, executed_jr: 1.0, verification_status: 'VERIFIED' },
    ];

    const dashboard = buildSupervisorExecutiveDashboard({
      boardId: mockBoardId,
      planItems: items,
      executions,
      crews,
      crewMembersMap,
      allCrews: crews,
      allCrewMembersMap,
      allSiteAssignmentsMap,
    });

    const alert05 = dashboard.alerts.find((a) => a.alertCode === 'ALERT-05');
    const alert06 = dashboard.alerts.find((a) => a.alertCode === 'ALERT-06');

    expect(alert05).toBeDefined();
    expect(alert05?.severity).toBe('MEDIUM');
    expect(alert05?.entityId).toBe('occ-sub');

    expect(alert06).toBeDefined();
    expect(alert06?.severity).toBe('MEDIUM');
    expect(alert06?.entityId).toBe('crew-shared');
  });

  // DASH-10: Multiplicidad e Identidad Única de Alertas (COR-06)
  test('DASH-10: Genera múltiples alertas simultáneas manteniendo alertId determinista e independiente', () => {
    const items: WeeklyPlanItem[] = [
      // Item 1: Sobrecarga de demanda en cuadrilla + Exceso JR en alcance completo
      { ...baseItem, id: 'item-excess', crew_id: 'crew-multi', planned_qty: 100, theoretical_jr: 5.0, occurrence_key: 'occ-excess', planned_date: '2026-09-14' },
      // Item 2: Subejecución de alcance físico
      { ...baseItem, id: 'item-sub', crew_id: 'crew-multi', planned_qty: 100, theoretical_jr: 1.0, occurrence_key: 'occ-sub', planned_date: '2026-09-14' },
    ];

    const executions: MinimalExecutionRecord[] = [
      { id: 'e1', occurrence_key: 'occ-excess', executed_qty: 100, executed_jr: 6.0, verification_status: 'VERIFIED' }, // Alcance completo + Exceso JR (ALERT-04)
      { id: 'e2', occurrence_key: 'occ-sub', executed_qty: 40, executed_jr: 0.5, verification_status: 'VERIFIED' }, // Subejecución de alcance (ALERT-05)
    ];

    const crews: Crew[] = [
      { ...baseCrew, id: 'crew-multi', name: 'Cuadrilla Multi' },
    ];

    const dashboard = buildSupervisorExecutiveDashboard({
      boardId: mockBoardId,
      planItems: items,
      executions,
      crews,
      dailyCapacityByCrew: { 'crew-multi': 1.0 }, // Overloaded (ALERT-01)
    });

    // Debe generar ALERT-01 (Sobrecarga), ALERT-04 (Exceso JR) y ALERT-05 (Subejecución)
    const alertCodes = dashboard.alerts.map((a) => a.alertCode);
    expect(alertCodes).toContain('ALERT-01');
    expect(alertCodes).toContain('ALERT-04');
    expect(alertCodes).toContain('ALERT-05');

    // Verificar alertIds unívocos
    const alertIds = dashboard.alerts.map((a) => a.alertId);
    const uniqueAlertIds = new Set(alertIds);
    expect(uniqueAlertIds.size).toBe(alertIds.length);
  });

  // DASH-11: Aislamiento por board_id
  test('DASH-11: Filtra estrictamente y solo procesa los ítems del board_id consultado', () => {
    const items: WeeklyPlanItem[] = [
      { ...baseItem, id: 'item-target', board_id: 'board-alpha', planned_qty: 100, occurrence_key: 'occ-alpha' },
      { ...baseItem, id: 'item-other', board_id: 'board-beta', planned_qty: 500, occurrence_key: 'occ-beta' },
    ];

    const executions: MinimalExecutionRecord[] = [
      { id: 'e1', occurrence_key: 'occ-alpha', executed_qty: 100, executed_jr: 2.0, verification_status: 'VERIFIED' },
      { id: 'e2', occurrence_key: 'occ-beta', executed_qty: 500, executed_jr: 10.0, verification_status: 'VERIFIED' },
    ];

    const dashboard = buildSupervisorExecutiveDashboard({
      boardId: 'board-alpha',
      planItems: items,
      executions,
      crews: [baseCrew],
    });

    expect(dashboard.totalPlannedItems).toBe(1);
    expect(dashboard.totalPlannedQty).toBe(100);
    expect(dashboard.totalVerifiedExecutedQty).toBe(100);
    expect(dashboard.verifiedPhysicalProgressPct).toBe(100.0);
  });

  // DASH-12: Invariantes de Aislamiento y Costo Indeterminado
  test('DASH-12: Devuelve siempre monetaryCostStatus = UNDETERMINED_MONETARY_COST y aísla H8', () => {
    const dashboard = buildSupervisorExecutiveDashboard({
      boardId: mockBoardId,
      planItems: [baseItem],
      executions: [],
      crews: [baseCrew],
    });

    expect(dashboard.monetaryCostStatus).toBe('UNDETERMINED_MONETARY_COST');
    expect(dashboard.consumptionSummary.monetaryCostStatus).toBe('UNDETERMINED_MONETARY_COST');
  });
});
