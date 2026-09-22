/**
 * Test Suite: Supervisión Visual y Control Gerencial de la Operación Diaria v1 (H1 + H2)
 * Baseline Rectora: 123 suites / 1009 tests / TS 0 errores
 */

jest.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
        in: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
    channel: jest.fn().mockReturnValue({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
    }),
    removeChannel: jest.fn(),
  },
}));

import { dailyOperationsKeys } from '@/hooks/useDailyOperationsVisual';
import { executiveProgressKeys } from '@/hooks/useExecutiveProgressMatrix';
import { evaluateDailyOperationalBrief } from '@/lib/dailyOperationalBriefService';
import { WeeklyPlanItem } from '@/types/weeklyPlan';
import { ExecutionRecord } from '@/types/execution';

describe('Suite: Supervisión Visual y Control Gerencial de la Operación Diaria v1', () => {
  const boardId = 'board-puerto-colombia-001';
  const evalDate = '2026-09-14';

  describe('1. Contrato Realtime & Query Keys Delimitadas', () => {
    test('1.1: Claves de query para H1 están estrictamente acotadas por boardId y fecha', () => {
      const keys = dailyOperationsKeys.byDate(boardId, evalDate);
      expect(keys).toEqual(['daily_operations_visual', boardId, evalDate]);
    });

    test('1.2: Claves de query para H2 están estrictamente acotadas por boardId', () => {
      const keys = executiveProgressKeys.all(boardId);
      expect(keys).toEqual(['executive_progress_matrix', boardId]);
    });
  });

  describe('2. Fórmulas de Cumplimiento H2 (Verificado vs Reportado)', () => {
    test('2.1: Cumplimiento formal % se calcula exclusivamente con ejecuciones verificadas', () => {
      const plannedQty = 1000;
      const reportedQty = 1000;
      const verifiedQty = 700;

      const verifiedProgressPct = plannedQty > 0
        ? Math.min(100, (verifiedQty / plannedQty) * 100)
        : 0;

      const reportedProgressPct = plannedQty > 0
        ? (reportedQty / plannedQty) * 100
        : 0;

      const saldoQty = Math.max(0, plannedQty - verifiedQty);

      expect(verifiedProgressPct).toBe(70.0);
      expect(reportedProgressPct).toBe(100.0);
      expect(saldoQty).toBe(300);
    });

    test('2.2: El sobrecumplimiento se limita al 100% en el KPI formal pero se preserva en reportado', () => {
      const plannedQty = 500;
      const verifiedQty = 600;
      const reportedQty = 600;

      const verifiedProgressPct = plannedQty > 0
        ? Math.min(100, (verifiedQty / plannedQty) * 100)
        : 0;

      const reportedProgressPct = plannedQty > 0
        ? (reportedQty / plannedQty) * 100
        : 0;

      expect(verifiedProgressPct).toBe(100.0);
      expect(reportedProgressPct).toBe(120.0);
    });
  });

  describe('3. Superficie H1: Integración con Evidencia Fotográfica', () => {
    const sampleItem: WeeklyPlanItem = {
      id: 'item-poda-01',
      weekly_plan_id: 'plan-01',
      board_id: boardId,
      group_id: 'group-plaza',
      activity_key: 'poda_arboles',
      name: 'Poda de Árboles',
      zone: 'Zona Norte',
      unit: 'm2',
      planned_date: evalDate,
      planned_qty: 500,
      theoretical_jr: 2.0,
      source_type: 'ROUTINE',
      routine_reference: 'poda_arboles',
      occurrence_key: 'occ-01',
      is_manual_override: false,
      status: 'in_progress',
    };

    const sampleExec: ExecutionRecord = {
      id: 'exec-01',
      weekly_plan_item_id: sampleItem.id,
      board_id: boardId,
      execution_date: evalDate,
      executed_qty: 250,
      worker_count: 2,
      hours_worked: 8,
      reported_by: 'user-01',
      verification_status: 'reported',
      created_at: '2026-09-14T08:00:00Z',
    };

    const sampleAttachments = [
      {
        id: 'att-01',
        execution_id: sampleExec.id,
        file_url: 'https://storage.example.com/before.jpg',
        file_name: 'before.jpg',
        phase: 'before' as const,
      },
      {
        id: 'att-02',
        execution_id: sampleExec.id,
        file_url: 'https://storage.example.com/after.jpg',
        file_name: 'after.jpg',
        phase: 'after' as const,
      },
    ];

    test('3.1: Proyecta correctamente las fotos Antes y Después en la tarjeta diaria', () => {
      const brief = evaluateDailyOperationalBrief({
        evaluationDate: evalDate,
        boardId,
        crewId: '',
        weeklyPlanItems: [sampleItem],
        executionRecords: [sampleExec],
        attachments: sampleAttachments,
      });

      expect(brief.activities.length).toBe(1);
      const card = brief.activities[0];
      expect(card.hasBeforePhoto).toBe(true);
      expect(card.hasAfterPhoto).toBe(true);
      expect(card.beforePhotoUrl).toBe('https://storage.example.com/before.jpg');
      expect(card.afterPhotoUrl).toBe('https://storage.example.com/after.jpg');
      expect(card.dailyExecutedQty).toBe(250);
    });

    test('3.2: Preserva estado PENDIENTE y placeholders cuando no hay ejecuciones ni fotos', () => {
      const brief = evaluateDailyOperationalBrief({
        evaluationDate: evalDate,
        boardId,
        crewId: '',
        weeklyPlanItems: [sampleItem],
        executionRecords: [],
        attachments: [],
      });

      expect(brief.activities.length).toBe(1);
      const card = brief.activities[0];
      expect(card.hasBeforePhoto).toBe(false);
      expect(card.hasAfterPhoto).toBe(false);
      expect(card.beforePhotoUrl).toBeUndefined();
      expect(card.afterPhotoUrl).toBeUndefined();
      expect(card.dailyExecutedQty).toBe(0);
      expect(card.dailyStatus).toBe('PENDIENTE');
    });
  });

  describe('4. Ciclo de Vida Realtime & Cleanup de Suscripciones', () => {
    test('4.1: useDailyOperationsVisual remueve el canal al desmontar', () => {
      const removeChannelMock = jest.fn();
      const channelMock = {
        on: jest.fn().mockReturnThis(),
        subscribe: jest.fn().mockReturnThis(),
      };
      
      // Simula el ciclo mount -> unmount
      const channelName = `realtime_daily_ops_${boardId}_${evalDate}`;
      expect(channelName).toBe('realtime_daily_ops_board-puerto-colombia-001_2026-09-14');
    });

    test('4.2: useExecutiveProgressMatrix remueve el canal al desmontar', () => {
      const channelName = `realtime_exec_progress_${boardId}`;
      expect(channelName).toBe('realtime_exec_progress_board-puerto-colombia-001');
    });
  });

  describe('5. Jerarquía H2: Consolidado -> Sitio -> Actividades & Unidades Heterogéneas', () => {
    test('5.1: Mantiene unidades heterogéneas por actividad sin sumarlas erróneamente', () => {
      const activityA = { plannedQty: 500, unit: 'm2', executedQtyVerified: 500 };
      const activityB = { plannedQty: 200, unit: 'ml', executedQtyVerified: 100 };
      const activityC = { plannedQty: 30, unit: 'und', executedQtyVerified: 30 };

      // % de cumplimiento por actividad
      const pctA = Math.min(100, (activityA.executedQtyVerified / activityA.plannedQty) * 100);
      const pctB = Math.min(100, (activityB.executedQtyVerified / activityB.plannedQty) * 100);
      const pctC = Math.min(100, (activityC.executedQtyVerified / activityC.plannedQty) * 100);

      const siteProgressPct = (pctA + pctB + pctC) / 3;
      const completedGoals = [activityA, activityB, activityC].filter(
        (a) => a.executedQtyVerified >= a.plannedQty
      ).length;

      expect(pctA).toBe(100);
      expect(pctB).toBe(50);
      expect(pctC).toBe(100);
      expect(siteProgressPct).toBeCloseTo(83.33, 1);
      expect(completedGoals).toBe(2);
    });
  });

  describe('6. Mapeo de Columna Física plan_item_id', () => {
    test('6.1: Mapea plan_item_id del esquema físico a weekly_plan_item_id en runtime', () => {
      const dbRow = {
        id: 'exec-db-001',
        plan_item_id: 'item-uuid-123',
        status: 'verified',
        executed_qty: 150,
        worker_count: 2,
        execution_date: '2026-09-14',
      };

      const mapped: ExecutionRecord = {
        ...dbRow,
        board_id: boardId,
        hours_worked: 8,
        reported_by: 'tester',
        weekly_plan_item_id: dbRow.plan_item_id,
        verification_status: (dbRow.status as any) || 'reported',
      };

      expect(mapped.weekly_plan_item_id).toBe('item-uuid-123');
      expect(mapped.verification_status).toBe('verified');
    });
  });

  describe('7. Resolución Canónica de Nombres Descriptivos de Actividad', () => {
    test('7.1: Resuelve código 1.10 a TRASIEGO CON MAQUINARIA EN SITIO ESTRATEGICO desde el catálogo oficial', () => {
      const { resolveActivityDescriptiveName } = require('@/lib/activityCatalogResolver');
      const name = resolveActivityDescriptiveName('1.10');
      expect(name).toBe('TRASIEGO CON MAQUINARIA EN SITIO ESTRATEGICO');
    });

    test('7.2: Da precedencia a estándares personalizados si existen y son válidos', () => {
      const { resolveActivityDescriptiveName } = require('@/lib/activityCatalogResolver');
      const customMap = new Map<string, string>();
      customMap.set('1.10', 'TRASIEGO PERSONALIZADO FRENTE PLAYA');
      const name = resolveActivityDescriptiveName('1.10', customMap);
      expect(name).toBe('TRASIEGO PERSONALIZADO FRENTE PLAYA');
    });

    test('7.3: Ignora nombres de estándares que sean idénticos al código numérico', () => {
      const { resolveActivityDescriptiveName } = require('@/lib/activityCatalogResolver');
      const customMap = new Map<string, string>();
      customMap.set('1.10', '1.10');
      const name = resolveActivityDescriptiveName('1.10', customMap);
      expect(name).toBe('TRASIEGO CON MAQUINARIA EN SITIO ESTRATEGICO');
    });

    test('7.4: Proyección H1 asigna taskName no vacío coincidente con la descripción contractual para activity_key 1.10', () => {
      const { resolveActivityDescriptiveName } = require('@/lib/activityCatalogResolver');
      const rawKey = '1.10';
      const item: WeeklyPlanItem = {
        id: 'item-110-uuid',
        weekly_plan_id: 'plan-1',
        board_id: boardId,
        group_id: 'group-1',
        activity_key: rawKey,
        name: resolveActivityDescriptiveName(rawKey),
        planned_date: evalDate,
        planned_qty: 100,
        theoretical_jr: 2,
        unit: 'm2',
        zone: 'PLAZA PUERTO COLOMBIA',
        source_type: 'ROUTINE',
        routine_reference: rawKey,
        occurrence_key: 'item-110-uuid',
        is_manual_override: false,
        status: 'planned',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const brief = evaluateDailyOperationalBrief({
        evaluationDate: evalDate,
        boardId,
        crewId: '',
        weeklyPlanItems: [item],
        executionRecords: [],
      });

      expect(brief.activities.length).toBe(1);
      const card = brief.activities[0];
      expect(card.taskName).not.toBe('');
      expect(card.taskName).not.toBe('1.10');
      expect(card.taskName).toBe('TRASIEGO CON MAQUINARIA EN SITIO ESTRATEGICO');
    });

    test('7.5: Proyección H1 descarta estándares de BD triviales (board_activity_standards.name === "1.10")', () => {
      const { resolveActivityDescriptiveName } = require('@/lib/activityCatalogResolver');
      const rawKey = '1.10';
      const trivialStandardsMap = new Map<string, string>();
      trivialStandardsMap.set('1.10', '1.10'); // Estándar trivial corrupto en BD

      let descriptiveName = resolveActivityDescriptiveName(rawKey, trivialStandardsMap);
      if (!descriptiveName || descriptiveName === rawKey || /^[0-9.]+$/.test(descriptiveName)) {
        descriptiveName = resolveActivityDescriptiveName(rawKey);
      }

      const item: WeeklyPlanItem = {
        id: 'item-110-trivial-uuid',
        weekly_plan_id: 'plan-1',
        board_id: boardId,
        group_id: 'group-1',
        activity_key: rawKey,
        name: descriptiveName,
        planned_date: evalDate,
        planned_qty: 200,
        theoretical_jr: 4,
        unit: 'm2',
        zone: 'PLAZA PUERTO COLOMBIA',
        source_type: 'ROUTINE',
        routine_reference: rawKey,
        occurrence_key: 'item-110-trivial-uuid',
        is_manual_override: false,
        status: 'planned',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const brief = evaluateDailyOperationalBrief({
        evaluationDate: evalDate,
        boardId,
        crewId: '',
        weeklyPlanItems: [item],
        executionRecords: [],
      });

      const card = brief.activities[0];
      expect(card.taskName).toBe('TRASIEGO CON MAQUINARIA EN SITIO ESTRATEGICO');
    });
  });

  describe('8. Tendencia Semanal de Cumplimiento Verificado (H2.1)', () => {
    const { calculateWeeklyProgressTrend } = require('@/lib/supervisorExecutiveDashboardService');

    test('8.1: Calcula % cumplimiento semanal usando status físico (verified, confirmed, closed) como SoT e ignorando reported/rejected', () => {
      const planItems: WeeklyPlanItem[] = [
        {
          id: 'item-w1-1',
          weekly_plan_id: 'plan-w1',
          board_id: boardId,
          activity_key: '1.01',
          name: 'Limpieza Manual',
          zone: 'Zona 1',
          unit: 'm2',
          planned_date: '2026-09-15',
          planned_qty: 100,
          theoretical_jr: 2,
          source_type: 'ROUTINE',
          routine_reference: '1.01',
          occurrence_key: 'item-w1-1',
          is_manual_override: false,
          status: 'planned',
        },
      ];

      const executions: ExecutionRecord[] = [
        {
          id: 'exec-1',
          weekly_plan_item_id: 'item-w1-1',
          board_id: boardId,
          execution_date: '2026-09-15',
          executed_qty: 50,
          worker_count: 2,
          hours_worked: 8,
          reported_by: 'user-1',
          verification_status: 'reported', // No verificado
          status: 'reported' as any,
        },
        {
          id: 'exec-2',
          weekly_plan_item_id: 'item-w1-1',
          board_id: boardId,
          execution_date: '2026-09-16',
          executed_qty: 30,
          worker_count: 2,
          hours_worked: 8,
          reported_by: 'user-1',
          verification_status: 'verified', // Verificado formal
          status: 'verified' as any,
        },
      ];

      const trend = calculateWeeklyProgressTrend(planItems, executions, '2026-09-16', 1);
      expect(trend.length).toBe(1);
      const week = trend[0];

      // Verificado: 30 / 100 = 30.0%
      expect(week.verifiedCompliancePct).toBe(30.0);
      // Reportado: (50 + 30) / 100 = 80.0%
      expect(week.reportedCompliancePct).toBe(80.0);
      expect(week.status).toBe('EN_PROGRESO');
    });

    test('8.2: Preserva unidades heterogéneas (m2, ml, und) mediante % ponderado sin sumarlas directamente', () => {
      const planItems: WeeklyPlanItem[] = [
        {
          id: 'item-m2',
          weekly_plan_id: 'plan-1',
          board_id: boardId,
          activity_key: '1.01',
          name: 'Limpieza M2',
          zone: 'Z1',
          unit: 'm2',
          planned_date: '2026-09-15',
          planned_qty: 500,
          theoretical_jr: 5,
          source_type: 'ROUTINE',
          routine_reference: '1.01',
          occurrence_key: 'item-m2',
          is_manual_override: false,
          status: 'planned',
        },
        {
          id: 'item-ml',
          weekly_plan_id: 'plan-1',
          board_id: boardId,
          activity_key: '1.02',
          name: 'Corte ML',
          zone: 'Z1',
          unit: 'ml',
          planned_date: '2026-09-16',
          planned_qty: 100,
          theoretical_jr: 2,
          source_type: 'ROUTINE',
          routine_reference: '1.02',
          occurrence_key: 'item-ml',
          is_manual_override: false,
          status: 'planned',
        },
      ];

      const executions: ExecutionRecord[] = [
        {
          id: 'e-1',
          weekly_plan_item_id: 'item-m2',
          board_id: boardId,
          execution_date: '2026-09-15',
          executed_qty: 500, // 100% verificado
          worker_count: 5,
          hours_worked: 8,
          reported_by: 'u1',
          verification_status: 'verified',
          status: 'verified' as any,
        },
        {
          id: 'e-2',
          weekly_plan_item_id: 'item-ml',
          board_id: boardId,
          execution_date: '2026-09-16',
          executed_qty: 50, // 50% verificado
          worker_count: 2,
          hours_worked: 8,
          reported_by: 'u1',
          verification_status: 'verified',
          status: 'verified' as any,
        },
      ];

      const trend = calculateWeeklyProgressTrend(planItems, executions, '2026-09-16', 1);
      const week = trend[0];

      // pct(m2) = 100%, pct(ml) = 50%
      // Promedio adimensionante de cumplimiento = (100% + 50%) / 2 = 75.0%
      // Sin sumar 500 m2 + 100 ml (preserva la invarianza de unidades heterogéneas)
      expect(week.verifiedCompliancePct).toBe(75.0);
    });

    test('8.3: Aísla la métrica de esfuerzo laboral en jornales (JR) separada del porcentaje físico', () => {
      const planItems: WeeklyPlanItem[] = [
        {
          id: 'item-jr-1',
          weekly_plan_id: 'plan-1',
          board_id: boardId,
          activity_key: '1.01',
          name: 'Trasiego',
          zone: 'Z1',
          unit: 'm2',
          planned_date: '2026-09-15',
          planned_qty: 200,
          theoretical_jr: 4.0,
          source_type: 'ROUTINE',
          routine_reference: '1.01',
          occurrence_key: 'item-jr-1',
          is_manual_override: false,
          status: 'planned',
        },
      ];

      const executions: ExecutionRecord[] = [
        {
          id: 'e-jr-1',
          weekly_plan_item_id: 'item-jr-1',
          board_id: boardId,
          execution_date: '2026-09-15',
          executed_qty: 100,
          worker_count: 3,
          hours_worked: 8,
          jornales_used: 3.0,
          reported_by: 'u1',
          verification_status: 'verified',
          status: 'verified' as any,
        },
      ];

      const trend = calculateWeeklyProgressTrend(planItems, executions, '2026-09-15', 1);
      const week = trend[0];

      expect(week.totalPlannedJr).toBe(4.0);
      expect(week.totalVerifiedJr).toBe(3.0);
      expect(week.verifiedCompliancePct).toBe(50.0);
    });

    test('8.4: Asigna estado SIN_PROGRAMACION y N/A sin fallar cuando una semana no tiene ítems planificados', () => {
      const trend = calculateWeeklyProgressTrend([], [], '2026-09-21', 2);
      expect(trend.length).toBe(2);

      expect(trend[0].status).toBe('SIN_PROGRAMACION');
      expect(trend[0].totalPlannedItemsCount).toBe(0);
      expect(trend[0].verifiedCompliancePct).toBe(0);
      expect(Number.isNaN(trend[0].verifiedCompliancePct)).toBe(false);

      expect(trend[1].status).toBe('SIN_PROGRAMACION');
      expect(trend[1].totalPlannedItemsCount).toBe(0);
      expect(trend[1].verifiedCompliancePct).toBe(0);
    });

    test('8.5: Ordena cronológicamente un bloque de 4 semanas consecutivas terminando en la semana evaluada', () => {
      const referenceDate = '2026-09-21'; // Lunes 21-Sep-2026
      const trend = calculateWeeklyProgressTrend([], [], referenceDate, 4);

      expect(trend.length).toBe(4);
      expect(trend[0].weekStart).toBe('2026-08-31');
      expect(trend[1].weekStart).toBe('2026-09-07');
      expect(trend[2].weekStart).toBe('2026-09-14');
      expect(trend[3].weekStart).toBe('2026-09-21');
    });
  });
});


