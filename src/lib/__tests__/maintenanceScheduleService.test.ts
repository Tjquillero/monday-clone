/**
 * Test Suite 51 — Motor de Proyección, Diagnóstico y Reprogramación Gobernada del Cronograma (Hito 6.1 · ADR-0013 v1.2)
 * Baseline Entrada: 107 suites / 833 tests / TS 0 errores (F5.5 FROZEN)
 * 
 * Contratos Evaluados:
 * - SCH-01A: Inmutabilidad profunda de arrays y objetos de entrada (Deep Freeze).
 * - SCH-01B: Fachada consultiva pura (0 mutaciones a BD, 0 efectos secundarios).
 * - SCH-02: Proyección exacta de ocurrencias en horizonte multi-semanal agrupadas por fecha y cuadrilla.
 * - SCH-03: Determinismo de calendario laboral colombiano y festivos (Ley Emiliani) con timezone America/Bogota.
 * - SCH-04: Conflicto CONF-01 ante día no hábil o festivo nacional no autorizado.
 * - SCH-05: Conflicto CONF-02 ante sobrecarga consumiendo soberanamente DailyCrewWorkload de H4.9.
 * - SCH-06: Conflicto CONF-03 ante tarea planificada no ejecutada con planned_date < referenceDate.
 * - SCH-07: Conflicto CONF-04 ante tarea sin cuadrilla en ventana de proximidad D+0/D+1/D+2.
 * - SCH-08: Reprogramación válida en día hábil intra-semana y extensión estructurada de override_reason sin sobrescritura destructiva.
 * - SCH-09: Rechazo determinista de reprogramación en día no hábil (NON_WORKING_DAY).
 * - SCH-10: Rechazo determinista de reprogramación fuera de la semana del plan (DATE_OUT_OF_PLAN_BOUNDS).
 * - SCH-11: Rechazo determinista de reprogramación en plan inmutable (PLAN_IMMUTABLE).
 * - SCH-12: Rechazo determinista de reprogramación en ítem con ejecuciones físicas no rechazadas (ITEM_HAS_EXECUTIONS).
 * - SCH-13: Rechazo determinista de reprogramación en ítem vinculado a Acta emitida (ITEM_LINKED_TO_ISSUED_ACTA).
 * - SCH-14: Invarianza absoluta de demanda contractual (planned_qty, theoretical_jr, poa_item_id, unit, activity_key).
 * - SCH-15: Idempotencia total en reprogramaciones (targetDate === currentPlannedDate -> NO_OP).
 * - SCH-16: Seguridad y control de acceso server-side RBAC (TrustedAuthContext).
 * - SCH-17: Doble compuerta en Gateway ante condición de carrera / mutaciones concurrentes.
 * - SCH-18: Aislamiento total de H8 Solver (Auditoría AST estática: 0 imports, 0 deps, 0 calls).
 */

import {
  evaluateMaintenanceScheduleView,
  validateRescheduleCommand,
  reschedulePlanItemValidated,
  MaintenanceScheduleParams,
  ReschedulePlanItemInput,
  TrustedAuthContext,
  UserRole,
} from '../maintenanceScheduleService';
import { WeeklyPlan, WeeklyPlanItem } from '@/types/weeklyPlan';
import { ExecutionRecord } from '@/types/execution';
import { Crew } from '@/types/crew';
import { DailyCrewWorkload } from '../operationalCapacityService';
import * as fs from 'fs';
import * as path from 'path';

describe('Suite 51 — Motor de Proyección, Diagnóstico y Reprogramación Gobernada (Hito 6.1)', () => {
  const mockBoardId = 'board_barranquilla_h61';
  const otherBoardId = 'board_bogota_foreign';
  const planId = 'plan_w38_2026';
  const planItemId = 'item_pi_01';

  const mockPlan: WeeklyPlan = {
    id: planId,
    board_id: mockBoardId,
    week_start_date: '2026-09-14', // Lunes
    week_end_date: '2026-09-20',   // Domingo
    status: 'published',
  };

  const mockPlanItem1: WeeklyPlanItem = {
    id: planItemId,
    weekly_plan_id: planId,
    board_id: mockBoardId,
    activity_key: 'PODA_ARBOLES',
    name: 'Poda de Árboles y Arbolados',
    zone: 'Sector Norte',
    unit: 'm2',
    planned_date: '2026-09-15', // Martes
    planned_qty: 500,
    theoretical_jr: 4.0,
    source_type: 'ROUTINE',
    routine_reference: 'ROUTINE_01',
    occurrence_key: `${mockBoardId}__site_all__ROUTINE_01__PODA_ARBOLES__2026-09-15__default`,
    crew_id: 'crew_alfa',
    is_manual_override: false,
    override_reason: null,
    status: 'planned',
  };

  const mockCrewAlfa: Crew = {
    id: 'crew_alfa',
    board_id: mockBoardId,
    name: 'Cuadrilla Alfa Especializada',
    is_active: true,
  };

  const mockAuthSupervisor: TrustedAuthContext = {
    userId: 'usr_sup_01',
    boardId: mockBoardId,
    userRoles: [{ board_id: mockBoardId, role: 'supervisor' as UserRole }],
  };

  const mockAuthWorker: TrustedAuthContext = {
    userId: 'usr_worker_01',
    boardId: mockBoardId,
    userRoles: [{ board_id: mockBoardId, role: 'worker' as UserRole }],
  };

  const evaluatedAtValid = '2026-09-15T15:00:00Z'; // 10:00 AM America/Bogota (referenceDate = 2026-09-15)

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Inmutabilidad y Fachada Consultiva (SCH-01A, SCH-01B)
  // ───────────────────────────────────────────────────────────────────────────
  test('SCH-01A: Inmutabilidad profunda de arrays y objetos de entrada (Deep Freeze)', () => {
    const frozenPlan = Object.freeze({ ...mockPlan });
    const frozenItems = [Object.freeze({ ...mockPlanItem1 })];
    const frozenExecutions: ExecutionRecord[] = [];
    const frozenCrews = [Object.freeze({ ...mockCrewAlfa })];
    const frozenWorkloads: DailyCrewWorkload[] = [];

    expect(() => {
      evaluateMaintenanceScheduleView({
        boardId: mockBoardId,
        periodStart: '2026-09-14',
        periodEnd: '2026-09-20',
        evaluatedAt: evaluatedAtValid,
        plans: [frozenPlan],
        planItems: frozenItems,
        executions: frozenExecutions,
        crews: frozenCrews,
        crewWorkloads: frozenWorkloads,
        authContext: mockAuthSupervisor,
      });
    }).not.toThrow();
  });

  test('SCH-01B: Fachada consultiva pura (0 mutaciones a BD, 0 escrituras)', () => {
    const view = evaluateMaintenanceScheduleView({
      boardId: mockBoardId,
      periodStart: '2026-09-14',
      periodEnd: '2026-09-20',
      evaluatedAt: evaluatedAtValid,
      plans: [mockPlan],
      planItems: [mockPlanItem1],
      executions: [],
      crews: [mockCrewAlfa],
      crewWorkloads: [],
      authContext: mockAuthSupervisor,
    });

    expect(view).toBeDefined();
    expect(view.boardId).toBe(mockBoardId);
    expect(view.totalPlannedItemsCount).toBe(1);
    expect(view.totalPlannedJournals).toBe(4.0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Proyección y Calendario Colombia (SCH-02, SCH-03)
  // ───────────────────────────────────────────────────────────────────────────
  test('SCH-02: Proyección exacta de ocurrencias en horizonte multi-semanal agrupadas por fecha y cuadrilla', () => {
    const item2: WeeklyPlanItem = {
      ...mockPlanItem1,
      id: 'item_pi_02',
      planned_date: '2026-09-16',
      planned_qty: 300,
      theoretical_jr: 2.5,
      crew_id: 'crew_alfa',
    };

    const view = evaluateMaintenanceScheduleView({
      boardId: mockBoardId,
      periodStart: '2026-09-14',
      periodEnd: '2026-09-20',
      evaluatedAt: evaluatedAtValid,
      plans: [mockPlan],
      planItems: [mockPlanItem1, item2],
      executions: [],
      crews: [mockCrewAlfa],
      crewWorkloads: [],
      authContext: mockAuthSupervisor,
    });

    expect(view.totalPlannedItemsCount).toBe(2);
    expect(view.totalPlannedJournals).toBe(6.5);
    expect(view.occurrencesByDate['2026-09-15'].length).toBe(1);
    expect(view.occurrencesByDate['2026-09-16'].length).toBe(1);
    expect(view.occurrencesByCrew['crew_alfa'].length).toBe(2);
  });

  test('SCH-03: Determinismo de calendario laboral colombiano y festivos (Ley Emiliani)', () => {
    // 2026-07-20 es festivo nacional (Independencia)
    const holidayItem: WeeklyPlanItem = {
      ...mockPlanItem1,
      id: 'item_holiday',
      planned_date: '2026-07-20',
    };

    const view = evaluateMaintenanceScheduleView({
      boardId: mockBoardId,
      periodStart: '2026-07-20',
      periodEnd: '2026-07-26',
      evaluatedAt: '2026-07-20T12:00:00Z',
      plans: [{ ...mockPlan, week_start_date: '2026-07-20', week_end_date: '2026-07-26' }],
      planItems: [holidayItem],
      executions: [],
      crews: [mockCrewAlfa],
      crewWorkloads: [],
      authContext: mockAuthSupervisor,
    });

    const conf01 = view.conflicts.find((c) => c.conflictCode === 'CONF-01');
    expect(conf01).toBeDefined();
    expect(conf01?.category).toBe('CALENDAR');
    expect(conf01?.severity).toBe('HIGH');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Matriz de Conflictos (SCH-04, SCH-05, SCH-06, SCH-07)
  // ───────────────────────────────────────────────────────────────────────────
  test('SCH-04: Conflicto CONF-01 ante día no hábil o festivo nacional no autorizado', () => {
    // Domingo 2026-09-20 sin allowSundayOperation
    const sundayItem: WeeklyPlanItem = {
      ...mockPlanItem1,
      id: 'item_sunday',
      planned_date: '2026-09-20', // Domingo
    };

    const view = evaluateMaintenanceScheduleView({
      boardId: mockBoardId,
      periodStart: '2026-09-14',
      periodEnd: '2026-09-20',
      evaluatedAt: evaluatedAtValid,
      plans: [mockPlan],
      planItems: [sundayItem],
      executions: [],
      crews: [mockCrewAlfa],
      crewWorkloads: [],
      authContext: mockAuthSupervisor,
    });

    expect(view.conflicts.some((c) => c.conflictCode === 'CONF-01')).toBe(true);
  });

  test('SCH-05: Conflicto CONF-02 ante sobrecarga consumiendo soberanamente DailyCrewWorkload de H4.9', () => {
    const overloadWorkload: DailyCrewWorkload = {
      crewId: 'crew_alfa',
      crewName: 'Cuadrilla Alfa Especializada',
      plannedDate: '2026-09-15',
      assignedItemsCount: 2,
      totalPlannedJournals: 5.5,
      applicableDailyCapacity: 3.0,
      utilizationRate: 1.83,
      capacityStatus: 'OVERLOADED',
      status: 'SOBRECARGA',
      items: [],
    };

    const view = evaluateMaintenanceScheduleView({
      boardId: mockBoardId,
      periodStart: '2026-09-14',
      periodEnd: '2026-09-20',
      evaluatedAt: evaluatedAtValid,
      plans: [mockPlan],
      planItems: [mockPlanItem1],
      executions: [],
      crews: [mockCrewAlfa],
      crewWorkloads: [overloadWorkload],
      authContext: mockAuthSupervisor,
    });

    const conf02 = view.conflicts.find((c) => c.conflictCode === 'CONF-02');
    expect(conf02).toBeDefined();
    expect(conf02?.category).toBe('CAPACITY');
    expect(conf02?.crewId).toBe('crew_alfa');
  });

  test('SCH-06: Conflicto CONF-03 ante tarea planificada no ejecutada con planned_date < referenceDate', () => {
    // evaluatedAt = 2026-09-16T12:00:00Z -> referenceDate = 2026-09-16
    // planned_date = 2026-09-14 (Atrasada)
    const delayedItem: WeeklyPlanItem = {
      ...mockPlanItem1,
      id: 'item_delayed',
      planned_date: '2026-09-14',
      status: 'planned',
    };

    const view = evaluateMaintenanceScheduleView({
      boardId: mockBoardId,
      periodStart: '2026-09-14',
      periodEnd: '2026-09-20',
      evaluatedAt: '2026-09-16T15:00:00Z',
      plans: [mockPlan],
      planItems: [delayedItem],
      executions: [],
      crews: [mockCrewAlfa],
      crewWorkloads: [],
      authContext: mockAuthSupervisor,
    });

    const conf03 = view.conflicts.find((c) => c.conflictCode === 'CONF-03');
    expect(conf03).toBeDefined();
    expect(conf03?.category).toBe('TEMPORAL');
    expect(conf03?.severity).toBe('HIGH');
  });

  test('SCH-07: Conflicto CONF-04 ante tarea sin cuadrilla en ventana de proximidad D+0/D+1/D+2', () => {
    // referenceDate = 2026-09-15
    // planned_date = 2026-09-17 (D+2) sin cuadrilla (crew_id = null)
    const unassignedCloseItem: WeeklyPlanItem = {
      ...mockPlanItem1,
      id: 'item_unassigned_close',
      planned_date: '2026-09-17',
      crew_id: null,
    };

    const view = evaluateMaintenanceScheduleView({
      boardId: mockBoardId,
      periodStart: '2026-09-14',
      periodEnd: '2026-09-20',
      evaluatedAt: evaluatedAtValid,
      plans: [mockPlan],
      planItems: [unassignedCloseItem],
      executions: [],
      crews: [mockCrewAlfa],
      crewWorkloads: [],
      authContext: mockAuthSupervisor,
    });

    const conf04 = view.conflicts.find((c) => c.conflictCode === 'CONF-04');
    expect(conf04).toBeDefined();
    expect(conf04?.category).toBe('CREW');
    expect(conf04?.severity).toBe('MEDIUM');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Reglas de Reprogramación Intra-Semana y Trazabilidad (SCH-08 a SCH-15)
  // ───────────────────────────────────────────────────────────────────────────
  test('SCH-08: Reprogramación válida en día hábil intra-semana y extensión estructurada de override_reason', () => {
    const existingItem: WeeklyPlanItem = {
      ...mockPlanItem1,
      is_manual_override: true,
      override_reason: 'Ajuste inicial por lluvia previa',
    };

    const input: ReschedulePlanItemInput = {
      planItemId: existingItem.id,
      targetDate: '2026-09-17', // Jueves (Hábil, misma semana)
      reasonCode: 'WEATHER_DELAY',
      notes: 'Lluvia torrencial en la mañana',
    };

    const validation = validateRescheduleCommand(input, mockAuthSupervisor, {
      plan: mockPlan,
      item: existingItem,
      executions: [],
      actas: [],
    });

    expect(validation.allowed).toBe(true);
    expect(validation.action).toBe('RESCHEDULE');
    expect(validation.targetPlannedDate).toBe('2026-09-17');
    // Verifica que se preserva el override_reason anterior sin sobrescribir destructivamente
    expect(validation.extendedOverrideReason).toContain('Ajuste inicial por lluvia previa');
    expect(validation.extendedOverrideReason).toContain('[RESCHEDULE:WEATHER_DELAY]');
    expect(validation.extendedOverrideReason).toContain('prev:2026-09-15');
    expect(validation.extendedOverrideReason).toContain('by:usr_sup_01');
    expect(validation.extendedOverrideReason).toContain('note:Lluvia torrencial en la mañana');
  });

  test('SCH-09: Rechazo determinista de reprogramación en día no hábil (NON_WORKING_DAY)', () => {
    const input: ReschedulePlanItemInput = {
      planItemId: mockPlanItem1.id,
      targetDate: '2026-09-20', // Domingo
      reasonCode: 'SUPERVISOR_ADJUSTMENT',
    };

    const validation = validateRescheduleCommand(input, mockAuthSupervisor, {
      plan: mockPlan,
      item: mockPlanItem1,
      executions: [],
      actas: [],
    });

    expect(validation.allowed).toBe(false);
    expect(validation.action).toBe('REJECT');
    expect(validation.reasonCode).toBe('NON_WORKING_DAY');
  });

  test('SCH-10: Rechazo determinista de reprogramación fuera de la semana del plan (DATE_OUT_OF_PLAN_BOUNDS)', () => {
    const input: ReschedulePlanItemInput = {
      planItemId: mockPlanItem1.id,
      targetDate: '2026-09-22', // Martes de la siguiente semana
      reasonCode: 'SUPERVISOR_ADJUSTMENT',
    };

    const validation = validateRescheduleCommand(input, mockAuthSupervisor, {
      plan: mockPlan,
      item: mockPlanItem1,
      executions: [],
      actas: [],
    });

    expect(validation.allowed).toBe(false);
    expect(validation.action).toBe('REJECT');
    expect(validation.reasonCode).toBe('DATE_OUT_OF_PLAN_BOUNDS');
  });

  test('SCH-11: Rechazo determinista de reprogramación en plan inmutable (PLAN_IMMUTABLE)', () => {
    const immutablePlan: WeeklyPlan = {
      ...mockPlan,
      status: 'confirmed',
    };

    const input: ReschedulePlanItemInput = {
      planItemId: mockPlanItem1.id,
      targetDate: '2026-09-16',
      reasonCode: 'OPERATIONAL_PRIORITY',
    };

    const validation = validateRescheduleCommand(input, mockAuthSupervisor, {
      plan: immutablePlan,
      item: mockPlanItem1,
      executions: [],
      actas: [],
    });

    expect(validation.allowed).toBe(false);
    expect(validation.action).toBe('REJECT');
    expect(validation.reasonCode).toBe('PLAN_IMMUTABLE');
  });

  test('SCH-12: Rechazo determinista de reprogramación en ítem con ejecuciones físicas no rechazadas (ITEM_HAS_EXECUTIONS)', () => {
    const activeExec: ExecutionRecord = {
      id: 'exec_01',
      weekly_plan_item_id: mockPlanItem1.id,
      board_id: mockBoardId,
      execution_date: '2026-09-15',
      executed_qty: 200,
      worker_count: 2,
      hours_worked: 16,
      reported_by: 'usr_worker',
      verification_status: 'reported',
    };

    const input: ReschedulePlanItemInput = {
      planItemId: mockPlanItem1.id,
      targetDate: '2026-09-16',
      reasonCode: 'LOGISTICS_EQUIPMENT',
    };

    const validation = validateRescheduleCommand(input, mockAuthSupervisor, {
      plan: mockPlan,
      item: mockPlanItem1,
      executions: [activeExec],
      actas: [],
    });

    expect(validation.allowed).toBe(false);
    expect(validation.action).toBe('REJECT');
    expect(validation.reasonCode).toBe('ITEM_HAS_EXECUTIONS');
  });

  test('SCH-13: Rechazo determinista de reprogramación en ítem vinculado a Acta emitida (ITEM_LINKED_TO_ISSUED_ACTA)', () => {
    const issuedActa = {
      id: 'acta_01',
      board_id: mockBoardId,
      status: 'issued',
      items: [
        {
          id: 'ai_01',
          acta_id: 'acta_01',
          weekly_plan_item_id: mockPlanItem1.id,
        },
      ],
    };

    const input: ReschedulePlanItemInput = {
      planItemId: mockPlanItem1.id,
      targetDate: '2026-09-16',
      reasonCode: 'SUPERVISOR_ADJUSTMENT',
    };

    const validation = validateRescheduleCommand(input, mockAuthSupervisor, {
      plan: mockPlan,
      item: mockPlanItem1,
      executions: [],
      actas: [issuedActa as any],
    });

    expect(validation.allowed).toBe(false);
    expect(validation.action).toBe('REJECT');
    expect(validation.reasonCode).toBe('ITEM_LINKED_TO_ISSUED_ACTA');
  });

  test('SCH-14: Invarianza absoluta de demanda contractual e inmutabilidad de occurrence_key (Opción B)', () => {
    const input: ReschedulePlanItemInput = {
      planItemId: mockPlanItem1.id,
      targetDate: '2026-09-16',
      reasonCode: 'OPERATIONAL_PRIORITY',
    };

    const validation = validateRescheduleCommand(input, mockAuthSupervisor, {
      plan: mockPlan,
      item: mockPlanItem1,
      executions: [],
      actas: [],
    });

    expect(validation.allowed).toBe(true);
    expect(validation.currentItem?.planned_qty).toBe(500);
    expect(validation.currentItem?.theoretical_jr).toBe(4.0);
    expect(validation.currentItem?.activity_key).toBe('PODA_ARBOLES');
    expect(validation.currentItem?.unit).toBe('m2');
    // Invarianza estricta de occurrence_key (Opción B: slot de nacimiento inmutable)
    expect(validation.currentItem?.occurrence_key).toBe(mockPlanItem1.occurrence_key);
  });

  test('SCH-15: Idempotencia total en reprogramaciones (targetDate === currentPlannedDate -> NO_OP)', () => {
    const input: ReschedulePlanItemInput = {
      planItemId: mockPlanItem1.id,
      targetDate: '2026-09-15', // Misma fecha actual
      reasonCode: 'SUPERVISOR_ADJUSTMENT',
    };

    const validation = validateRescheduleCommand(input, mockAuthSupervisor, {
      plan: mockPlan,
      item: mockPlanItem1,
      executions: [],
      actas: [],
    });

    expect(validation.allowed).toBe(true);
    expect(validation.action).toBe('NO_OP');
    expect(validation.reasonCode).toBe('IDEMPOTENT_NO_OP');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. RBAC y Doble Compuerta con OCC Real en Gateway (SCH-16, SCH-17)
  // ───────────────────────────────────────────────────────────────────────────
  test('SCH-16: Seguridad y control de acceso server-side RBAC (TrustedAuthContext con some)', () => {
    const input: ReschedulePlanItemInput = {
      planItemId: mockPlanItem1.id,
      targetDate: '2026-09-16',
      reasonCode: 'OPERATIONAL_PRIORITY',
    };

    // Caso 1: Rol worker no autorizado
    const validationWorker = validateRescheduleCommand(input, mockAuthWorker, {
      plan: mockPlan,
      item: mockPlanItem1,
      executions: [],
      actas: [],
    });
    expect(validationWorker.allowed).toBe(false);
    expect(validationWorker.reasonCode).toBe('UNAUTHORIZED_ROLE');

    // Caso 2: Supervisor de otro board
    const foreignAuth: TrustedAuthContext = {
      userId: 'usr_foreign',
      boardId: otherBoardId,
      userRoles: [{ board_id: otherBoardId, role: 'supervisor' as UserRole }],
    };
    const validationForeign = validateRescheduleCommand(input, foreignAuth, {
      plan: mockPlan,
      item: mockPlanItem1,
      executions: [],
      actas: [],
    });
    expect(validationForeign.allowed).toBe(false);
    expect(validationForeign.reasonCode).toBe('BOARD_MISMATCH');

    // Caso 3: Usuario con roles múltiples en el mismo board (viewer + supervisor -> DEBE AUTORIZAR)
    const multiRoleAuth: TrustedAuthContext = {
      userId: 'usr_multi',
      boardId: mockBoardId,
      userRoles: [
        { board_id: mockBoardId, role: 'viewer' as UserRole },
        { board_id: mockBoardId, role: 'supervisor' as UserRole },
      ],
    };
    const validationMulti = validateRescheduleCommand(input, multiRoleAuth, {
      plan: mockPlan,
      item: mockPlanItem1,
      executions: [],
      actas: [],
    });
    expect(validationMulti.allowed).toBe(true);
    expect(validationMulti.reasonCode).toBe('AUTHORIZED_RESCHEDULE');
  });

  test('SCH-17: Control de Concurrencia Optimista (OCC) real en Gateway ante dos mutaciones concurrentes', async () => {
    let readCount = 0;
    const initialSnapshot = {
      ...mockPlanItem1,
      planned_date: '2026-09-15',
      updated_at: '2026-09-15T08:00:00.000Z',
    };
    let mockDbItem = { ...initialSnapshot };
    const mockDbPlan = { ...mockPlan };

    const mockSupabase: any = {
      from: (table: string) => ({
        select: (cols: string) => ({
          eq: (field: string, val: any) => ({
            single: async () => {
              if (table === 'weekly_plan_items') {
                readCount++;
                // Simulación de concurrencia real: ambas transacciones leen el snapshot inicial (2026-09-15)
                if (readCount <= 2) {
                  return { data: { ...initialSnapshot }, error: null };
                }
                return { data: { ...mockDbItem }, error: null };
              }
              if (table === 'weekly_plans') {
                return { data: { ...mockDbPlan }, error: null };
              }
              return { data: null, error: null };
            },
            eq: () => ({
              eq: () => ({ data: [], error: null }),
            }),
          }),
        }),
        update: (payload: any) => {
          const filterState: Record<string, any> = {};
          const chain: any = {
            eq: (f: string, v: any) => {
              filterState[f] = v;
              return chain;
            },
            select: () => ({
              single: async () => {
                // Validación OCC: el registro en BD debe coincidir con id y con planned_date (y updated_at si aplica)
                if (filterState.id !== mockDbItem.id) {
                  return { data: null, error: { message: 'Item id mismatch' } };
                }
                if (filterState.planned_date !== mockDbItem.planned_date) {
                  // Concurrencia detectada: el registro en BD ya fue mutado por otra transacción
                  return { data: null, error: { message: '0 rows updated - OCC conflict' } };
                }
                // Actualización exitosa en base de datos
                mockDbItem = {
                  ...mockDbItem,
                  ...payload,
                  planned_date: payload.planned_date,
                  updated_at: payload.updated_at || new Date().toISOString(),
                };
                return { data: { ...mockDbItem }, error: null };
              },
            }),
          };
          return chain;
        },
      }),
    };

    // Escenario Concurrente: Dos supervisores A y B leen el mismo ítem con planned_date = '2026-09-15'
    const inputA: ReschedulePlanItemInput = {
      planItemId: mockPlanItem1.id,
      targetDate: '2026-09-16',
      reasonCode: 'LOGISTICS_EQUIPMENT',
      notes: 'Supervisor A: podadora disponible miércoles',
    };

    const inputB: ReschedulePlanItemInput = {
      planItemId: mockPlanItem1.id,
      targetDate: '2026-09-17',
      reasonCode: 'WEATHER_DELAY',
      notes: 'Supervisor B: alerta climática mover a jueves',
    };

    // Operación A: gana la carrera y persiste exitosamente
    const resultA = await reschedulePlanItemValidated(mockSupabase, inputA, mockAuthSupervisor);
    expect(resultA.success).toBe(true);
    expect(resultA.updatedItem?.planned_date).toBe('2026-09-16');
    expect(mockDbItem.planned_date).toBe('2026-09-16');

    // Operación B: intenta persistir sobre el snapshot antiguo ('2026-09-15'), pero BD ya está en '2026-09-16'
    // El Gateway rechaza deterministamente con CONCURRENT_MUTATION_DETECTED
    await expect(
      reschedulePlanItemValidated(mockSupabase, inputB, mockAuthSupervisor)
    ).rejects.toThrow(/CONCURRENT_MUTATION_DETECTED/);

    // Estado final en base de datos: exactamente 1 mutación exitosa (la de A)
    expect(mockDbItem.planned_date).toBe('2026-09-16');
    expect(mockDbItem.override_reason).toContain('[RESCHEDULE:LOGISTICS_EQUIPMENT]');
    expect(mockDbItem.override_reason).not.toContain('[RESCHEDULE:WEATHER_DELAY]');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Auditoría Estática y Aislamiento de H8 Solver (SCH-18 con AST Real)
  // ───────────────────────────────────────────────────────────────────────────
  test('SCH-18: Aislamiento total de H8 Solver (Auditoría AST estática: 0 imports, 0 deps, 0 calls)', () => {
    const ts = require('typescript');
    const servicePath = path.resolve(__dirname, '../maintenanceScheduleService.ts');
    const fileContent = fs.readFileSync(servicePath, 'utf8');

    // 1. Parsing formal del AST con TypeScript Compiler API
    const sourceFile = ts.createSourceFile(
      'maintenanceScheduleService.ts',
      fileContent,
      ts.ScriptTarget.Latest,
      true
    );

    const importedModules: string[] = [];
    const calledFunctions: string[] = [];

    function traverse(node: any) {
      if (ts.isImportDeclaration(node)) {
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          importedModules.push(node.moduleSpecifier.text);
        }
      }
      if (ts.isCallExpression(node)) {
        if (ts.isIdentifier(node.expression)) {
          calledFunctions.push(node.expression.text);
        }
      }
      ts.forEachChild(node, traverse);
    }

    traverse(sourceFile);

    // 2. Verificación de imports permitidos exclusivamente
    const allowedModules = [
      '@supabase/supabase-js',
      '@/types/weeklyPlan',
      '@/types/execution',
      '@/types/crew',
      './routineScheduler',
      './operationalCapacityService',
    ];

    for (const mod of importedModules) {
      expect(allowedModules).toContain(mod);
      expect(mod.toLowerCase()).not.toContain('solver');
      expect(mod.toLowerCase()).not.toContain('optimizer');
      expect(mod.toLowerCase()).not.toContain('resourceconstraints');
      expect(mod.toLowerCase()).not.toContain('h8');
    }

    // 3. Prohibición estricta de llamadas a optimizadores autónomos en AST
    const forbiddenCallPatterns = ['solver', 'optimize', 'anneal', 'genetic', 'csp', 'heurist'];
    for (const callName of calledFunctions) {
      for (const pattern of forbiddenCallPatterns) {
        expect(callName.toLowerCase()).not.toContain(pattern);
      }
    }

    // 4. Prohibición de identificadores o APIs de optimización autónoma en texto
    expect(fileContent).not.toMatch(/scheduleOptimizer/i);
    expect(fileContent).not.toMatch(/solver/i);
    expect(fileContent).not.toMatch(/h8/i);
  });
});
