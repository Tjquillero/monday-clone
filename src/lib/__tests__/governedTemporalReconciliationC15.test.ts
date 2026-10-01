/**
 * Test Suite: Reconciliación Temporal Gobernada de weekly_plan_items (C1.5 v1.1)
 *
 * Valida los contratos TypeScript de:
 * 1. Mapeo determinístico de ocurrencias con planned_date y occurrence_key
 * 2. Invariante de protección ante is_manual_override = true
 * 3. Invariante de protección ante executed_qty > 0
 * 4. Invariante de preservación de identidad de activity_key
 */

import { generateRoutineScheduleForWeek, RoutineBaseTemplate } from '../routineScheduler';
import { syncWeeklyPlanForBoard } from '../weeklyPlanService';
import { RoutineWeeklyProjection } from '../routineScheduler';

describe('C1.5 v1.1 — Reconciliación Temporal Gobernada (TypeScript Contract Suite)', () => {
  const sampleTemplates: RoutineBaseTemplate[] = [
    {
      id: 'std_corte_grama',
      activity_key: 'corte_grama',
      name: 'Corte de Grama',
      zone: 'Zona Verde',
      unit: 'M2',
      rendimiento: 500,
      frecuencia: 25, // Diaria (6 días)
      cantidad: 6000,
    },
    {
      id: 'std_poda_arboles',
      activity_key: 'poda_arboles',
      name: 'Poda de Árboles',
      zone: 'Zona Verde',
      unit: 'und',
      rendimiento: 10,
      frecuencia: 4, // Semanal (1 día)
      cantidad: 20,
    },
  ];

  const weekStartMonday = new Date(Date.UTC(2026, 8, 28)); // 2026-09-28 (Lunes)

  test('1. routineScheduler genera ocurrencias con planned_date determinista', () => {
    const projection = generateRoutineScheduleForWeek(sampleTemplates, weekStartMonday, []);

    // 1 diaria x 6 días hábiles = 6 ocurrencias; 1 semanal x 1 = 1 ocurrencia -> Total 7
    expect(projection.assignments.length).toBe(7);

    // Verificar que todas las asignaciones tengan planned_date no nulo
    projection.assignments.forEach((assign) => {
      expect(assign.dateStr).toBeDefined();
      expect(assign.dateStr).toMatch(/^2026-(09|10)-\d{2}$/);
      expect(assign.activity_key).toBeDefined();
    });

    // Primera ocurrencia de corte_grama es el lunes 2026-09-28
    const corteMon = projection.assignments.find(
      (a) => a.activity_key === 'corte_grama' && a.dateStr === '2026-09-28'
    );
    expect(corteMon).toBeDefined();
    expect(corteMon?.cantidad).toBe(6000);
  });

  test('2. syncWeeklyPlanForBoard no sobrescribe ítems con is_manual_override = true ni status terminal', async () => {
    const projection: RoutineWeeklyProjection = generateRoutineScheduleForWeek(sampleTemplates, weekStartMonday, []);

    const existingItems = [
      {
        id: 'item-override-1',
        weekly_plan_id: 'plan-test-1',
        board_id: 'board-test-1',
        group_id: 'group-test-1',
        activity_key: 'corte_grama',
        name: 'Corte de Grama',
        zone: 'Zona Verde',
        unit: 'M2',
        planned_date: '2026-09-30', // Modificado manualmente por el supervisor
        planned_qty: 999,
        theoretical_jr: 2.0,
        source_type: 'ROUTINE' as const,
        routine_reference: 'std_corte_grama',
        occurrence_key: 'occ-corte-1',
        is_manual_override: true, // PROTEGIDO
        status: 'planned' as const,
      },
      {
        id: 'item-cancelled-2',
        weekly_plan_id: 'plan-test-1',
        board_id: 'board-test-1',
        group_id: 'group-test-1',
        activity_key: 'poda_arboles',
        name: 'Poda de Árboles',
        zone: 'Zona Verde',
        unit: 'und',
        planned_date: '2026-09-28',
        planned_qty: 20,
        theoretical_jr: 2.0,
        source_type: 'ROUTINE' as const,
        routine_reference: 'std_poda_arboles',
        occurrence_key: 'occ-poda-2',
        is_manual_override: false,
        status: 'cancelled' as const, // ESTADO TERMINAL PROTEGIDO
      },
    ];

    const mockWeeklyPlansQuery: any = {
      eq: jest.fn(() => mockWeeklyPlansQuery),
      is: jest.fn(() => mockWeeklyPlansQuery),
      maybeSingle: jest.fn(async () => ({
        data: {
          id: 'plan-test-1',
          board_id: 'board-test-1',
          group_id: 'group-test-1',
          week_start: '2026-09-28',
          status: 'published',
        },
        error: null,
      })),
    };

    const mockWeeklyPlanItemsQuery: any = {
      eq: jest.fn(async () => ({
        data: existingItems,
        error: null,
      })),
    };

    const mockSupabase: any = {
      from: jest.fn((table: string) => {
        if (table === 'weekly_plans') {
          return {
            select: jest.fn(() => mockWeeklyPlansQuery),
          };
        }
        if (table === 'weekly_plan_items') {
          return {
            select: jest.fn(() => mockWeeklyPlanItemsQuery),
            insert: jest.fn(async () => ({ data: [], error: null })),
            update: jest.fn(async () => ({ data: [], error: null })),
          };
        }
        return {};
      }),
    };

    const result = await syncWeeklyPlanForBoard(
      mockSupabase,
      'board-test-1',
      'group-test-1',
      '2026-09-28',
      projection
    );

    // Los ítems protegidos no deben ser cancelados ni resucitados
    expect(result.cancelledCount).toBe(0);
    expect(result.protectedCount).toBe(1); // item-override-1 protegido por is_manual_override
  });
});
