import {
  evaluateDailyOperationalBrief,
  DailyBriefEvaluationInput,
  calculateOperationalDayProgress,
} from '../dailyOperationalBriefService';
import { WeeklyPlanItem } from '../../types/weeklyPlan';
import { ExecutionRecord } from '../../types/execution';

/**
 * Test Suite: Daily Operational Brief (DOB) & Flujo Canónico de 3 Días Multi-Jornada
 */
describe('Daily Operational Brief (DOB) Read Model Engine', () => {
  const boardId = 'board-dob-test-uuid';
  const crewId = 'crew-cuadrilla-1-uuid';

  const planItemCunetas: WeeklyPlanItem = {
    id: 'item-cunetas-uuid',
    weekly_plan_id: 'plan-week-uuid',
    board_id: boardId,
    activity_key: 'task-cunetas',
    name: 'Limpieza de Cunetas',
    zone: 'Sector Norte',
    planned_qty: 1000,
    theoretical_jr: 8.0,
    source_type: 'ROUTINE',
    routine_reference: 'REF-001',
    occurrence_key: 'occ_cunetas_001',
    is_manual_override: false,
    unit: 'm',
    planned_date: '2026-09-15',
    crew_id: crewId,
    status: 'planned',
    created_at: '2026-09-10T08:00:00Z',
    updated_at: '2026-09-10T08:00:00Z',
  };

  const planItemSenalizacion: WeeklyPlanItem = {
    id: 'item-senalizacion-uuid',
    weekly_plan_id: 'plan-week-uuid',
    board_id: boardId,
    activity_key: 'task-senalizacion',
    name: 'Instalación de Señalización Vertical',
    zone: 'Sector Norte',
    planned_qty: 18,
    theoretical_jr: 4.0,
    source_type: 'ROUTINE',
    routine_reference: 'REF-002',
    occurrence_key: 'occ_senal_001',
    is_manual_override: false,
    unit: 'unidad',
    planned_date: '2026-09-15',
    crew_id: crewId,
    status: 'planned',
    created_at: '2026-09-10T08:00:00Z',
    updated_at: '2026-09-10T08:00:00Z',
  };

  const activityDatesMap = {
    'item-cunetas-uuid': { startDate: '2026-09-15', endDate: '2026-09-17' }, // 3 días laborales
    'item-senalizacion-uuid': { startDate: '2026-09-15', endDate: '2026-09-16' }, // 2 días laborales
  };

  // DOB-01: Proyección temporal determinística Día N de M con calendario colombiano
  it('DOB-01: Calcula Día N de M correctamente excluyendo festivos/domingos', () => {
    // 2026-10-10 (Sábado) a 2026-10-13 (Martes)
    // 2026-10-11 es Domingo, 2026-10-12 es Festivo (Día de la Raza)
    // Total laborables: 2 (10 y 13)
    const prog1 = calculateOperationalDayProgress('2026-10-10', '2026-10-13', '2026-10-10');
    expect(prog1.totalDays).toBe(2);
    expect(prog1.currentDay).toBe(1);
    expect(prog1.label).toBe('Día 1 de 2');

    const prog2 = calculateOperationalDayProgress('2026-10-10', '2026-10-13', '2026-10-13');
    expect(prog2.currentDay).toBe(2);
    expect(prog2.label).toBe('Día 2 de 2');
  });

  // DOB-02: Flujo Canónico Completo de 3 Días Multi-Jornada con Subejecución y Recursos
  it('DOB-02: Demuestra la secuencia canónica de 3 días con actividades concurrentes y subejecución exacta', () => {
    const allExecutions: ExecutionRecord[] = [];
    const allAttachments: any[] = [];

    // =========================================================================
    // DÍA 1 (2026-09-15)
    // =========================================================================
    // Cunetas: 230 m, Concreto 5 m3
    const execCunetasD1: ExecutionRecord = {
      id: 'exec-cunetas-d1',
      weekly_plan_item_id: planItemCunetas.id,
      board_id: boardId,
      execution_date: '2026-09-15',
      executed_qty: 230,
      worker_count: 2,
      hours_worked: 8,
      jornales_used: 2.0,
      reported_by: 'user-leader-1',
      verification_status: 'reported',
      used_resources: [
        {
          resourceKey: 'MAT_CONCRETO',
          resourceName: 'Concreto Simple',
          category: 'MATERIAL',
          unit: 'm3',
          quantity: 5.0,
        },
      ],
    };
    allExecutions.push(execCunetasD1);
    allAttachments.push(
      { id: 'att-c1-before', execution_id: 'exec-cunetas-d1', file_url: 'https://cdn/c1_before.jpg', file_name: 'c1_before.jpg', phase: 'before' },
      { id: 'att-c1-after', execution_id: 'exec-cunetas-d1', file_url: 'https://cdn/c1_after.jpg', file_name: 'c1_after.jpg', phase: 'after' }
    );

    // Señalización: 6 un, Postes 6 un, Pintura 2 gal
    const execSenalD1: ExecutionRecord = {
      id: 'exec-senal-d1',
      weekly_plan_item_id: planItemSenalizacion.id,
      board_id: boardId,
      execution_date: '2026-09-15',
      executed_qty: 6,
      worker_count: 1,
      hours_worked: 8,
      jornales_used: 1.0,
      reported_by: 'user-leader-1',
      verification_status: 'reported',
      used_resources: [
        {
          resourceKey: 'MAT_POSTE',
          resourceName: 'Poste Tubular',
          category: 'MATERIAL',
          unit: 'unidad',
          quantity: 6,
        },
        {
          resourceKey: 'MAT_PINTURA',
          resourceName: 'Pintura Vial',
          category: 'MATERIAL',
          unit: 'galon',
          quantity: 2,
        },
      ],
    };
    allExecutions.push(execSenalD1);

    // Evaluación DOB Día 1
    const briefD1 = evaluateDailyOperationalBrief({
      evaluationDate: '2026-09-15',
      boardId,
      crewId,
      weeklyPlanItems: [
        { ...planItemCunetas, status: 'in_progress' },
        { ...planItemSenalizacion, status: 'in_progress' },
      ],
      executionRecords: allExecutions,
      attachments: allAttachments,
      activityDatesMap,
    });

    expect(briefD1.activities).toHaveLength(2);
    const cardCunetasD1 = briefD1.activities.find((a) => a.weeklyPlanItemId === planItemCunetas.id)!;
    expect(cardCunetasD1.dailyExecutedQty).toBe(230);
    expect(cardCunetasD1.totalReportedQty).toBe(230);
    expect(cardCunetasD1.dailyStatus).toBe('CONTINUA_MANANA');
    expect(cardCunetasD1.hasBeforePhoto).toBe(true);
    expect(cardCunetasD1.hasAfterPhoto).toBe(true);

    const cardSenalD1 = briefD1.activities.find((a) => a.weeklyPlanItemId === planItemSenalizacion.id)!;
    expect(cardSenalD1.dailyExecutedQty).toBe(6);
    expect(cardSenalD1.dailyStatus).toBe('CONTINUA_MANANA');

    // Cierre Diario Día 1
    expect(briefD1.closureSummary.continuedTomorrowCount).toBe(2);
    expect(briefD1.closureSummary.totalJornalesUsedToday).toBe(3.0);
    expect(briefD1.closureSummary.consolidatedResources).toHaveLength(3);

    // =========================================================================
    // DÍA 2 (2026-09-16)
    // =========================================================================
    // Cunetas: 240 m (CONTINUA), Concreto 5.5 m3
    const execCunetasD2: ExecutionRecord = {
      id: 'exec-cunetas-d2',
      weekly_plan_item_id: planItemCunetas.id,
      board_id: boardId,
      execution_date: '2026-09-16',
      executed_qty: 240,
      worker_count: 2,
      hours_worked: 8,
      jornales_used: 2.0,
      reported_by: 'user-leader-1',
      verification_status: 'reported',
      used_resources: [
        {
          resourceKey: 'MAT_CONCRETO',
          resourceName: 'Concreto Simple',
          category: 'MATERIAL',
          unit: 'm3',
          quantity: 5.5,
        },
      ],
    };
    allExecutions.push(execCunetasD2);

    // Señalización: 12 un (TERMINADA_HOY -> Total = 18 un / 18 un), Postes 12 un, Pintura 4 gal
    const execSenalD2: ExecutionRecord = {
      id: 'exec-senal-d2',
      weekly_plan_item_id: planItemSenalizacion.id,
      board_id: boardId,
      execution_date: '2026-09-16',
      executed_qty: 12,
      worker_count: 1,
      hours_worked: 8,
      jornales_used: 1.0,
      reported_by: 'user-leader-1',
      verification_status: 'reported',
      used_resources: [
        {
          resourceKey: 'MAT_POSTE',
          resourceName: 'Poste Tubular',
          category: 'MATERIAL',
          unit: 'unidad',
          quantity: 12,
        },
        {
          resourceKey: 'MAT_PINTURA',
          resourceName: 'Pintura Vial',
          category: 'MATERIAL',
          unit: 'galon',
          quantity: 4,
        },
      ],
    };
    allExecutions.push(execSenalD2);

    // Evaluación DOB Día 2
    const briefD2 = evaluateDailyOperationalBrief({
      evaluationDate: '2026-09-16',
      boardId,
      crewId,
      weeklyPlanItems: [
        { ...planItemCunetas, status: 'in_progress' },
        { ...planItemSenalizacion, status: 'completed' }, // Señalización terminada
      ],
      executionRecords: allExecutions,
      attachments: allAttachments,
      activityDatesMap,
    });

    const cardCunetasD2 = briefD2.activities.find((a) => a.weeklyPlanItemId === planItemCunetas.id)!;
    expect(cardCunetasD2.previouslyExecutedQty).toBe(230);
    expect(cardCunetasD2.dailyExecutedQty).toBe(240);
    expect(cardCunetasD2.totalReportedQty).toBe(470);
    expect(cardCunetasD2.isContinued).toBe(true);
    expect(cardCunetasD2.dailyStatus).toBe('CONTINUA_MANANA');

    const cardSenalD2 = briefD2.activities.find((a) => a.weeklyPlanItemId === planItemSenalizacion.id)!;
    expect(cardSenalD2.previouslyExecutedQty).toBe(6);
    expect(cardSenalD2.dailyExecutedQty).toBe(12);
    expect(cardSenalD2.totalReportedQty).toBe(18);
    expect(cardSenalD2.plannedQuantitySatisfied).toBe(true);
    expect(cardSenalD2.dailyStatus).toBe('TERMINADA_HOY');

    // =========================================================================
    // DÍA 3 (2026-09-17)
    // =========================================================================
    // Cunetas: 330 m (TERMINADA_HOY -> Total = 800 m de 1000 m), Concreto 7.5 m3
    const execCunetasD3: ExecutionRecord = {
      id: 'exec-cunetas-d3',
      weekly_plan_item_id: planItemCunetas.id,
      board_id: boardId,
      execution_date: '2026-09-17',
      executed_qty: 330,
      worker_count: 3,
      hours_worked: 8,
      jornales_used: 3.0,
      reported_by: 'user-leader-1',
      verification_status: 'reported',
      used_resources: [
        {
          resourceKey: 'MAT_CONCRETO',
          resourceName: 'Concreto Simple',
          category: 'MATERIAL',
          unit: 'm3',
          quantity: 7.5,
        },
      ],
    };
    allExecutions.push(execCunetasD3);

    // Evaluación DOB Día 3
    const briefD3 = evaluateDailyOperationalBrief({
      evaluationDate: '2026-09-17',
      boardId,
      crewId,
      weeklyPlanItems: [
        { ...planItemCunetas, status: 'completed' }, // Cunetas terminada con subejecución
        { ...planItemSenalizacion, status: 'completed' },
      ],
      executionRecords: allExecutions,
      attachments: allAttachments,
      activityDatesMap,
    });

    const cardCunetasD3 = briefD3.activities.find((a) => a.weeklyPlanItemId === planItemCunetas.id)!;
    expect(cardCunetasD3.previouslyExecutedQty).toBe(470); // 230 + 240
    expect(cardCunetasD3.dailyExecutedQty).toBe(330);
    expect(cardCunetasD3.totalReportedQty).toBe(800); // HECHO FÍSICO REAL
    expect(cardCunetasD3.plannedQty).toBe(1000);
    expect(cardCunetasD3.plannedQuantitySatisfied).toBe(false); // Subejecución de 200 m
    expect(cardCunetasD3.dailyStatus).toBe('TERMINADA_HOY');

    // Consolidado final de ejecuciones
    expect(allExecutions).toHaveLength(5); // 3 de Cunetas + 2 de Señalización
  });
});
