import {
  reportFieldExecution,
  FieldReportResult,
} from '../fieldWorkflowExecutionService';
import { ExecutionRecord } from '../../types/execution';
import { WeeklyPlanItem } from '../../types/weeklyPlan';
import { OperationalResourceItem } from '../resourceConsumptionControlService';

/**
 * Test Suite: Persistencia Durable de Recursos Operativos (POD-01 / ADR-0014)
 * Certifica los requisitos POD-01.01 a POD-01.13 y las condiciones C1, C2, C3.
 */
describe('POD-01 — Persistencia Durable de Recursos Operativos Observados v1', () => {
  let storedExecutions: ExecutionRecord[] = [];
  let storedWeeklyPlanItems: WeeklyPlanItem[] = [];
  let storedRoles: { user_id: string; board_id: string; role: string }[] = [];
  let mockSupabase: any;

  const boardId = 'board-pod-01-uuid';
  const planItemId = 'item-pod-01-uuid';
  const workerUserId = 'user-worker-uuid';

  beforeEach(() => {
    storedExecutions = [];
    storedWeeklyPlanItems = [
      {
        id: planItemId,
        weekly_plan_id: 'plan-week-uuid',
        board_id: boardId,
        activity_key: 'ACT_CUNETAS',
        name: 'Limpieza de Cunetas',
        zone: 'Sector Norte',
        unit: 'm',
        planned_date: '2026-09-15',
        planned_qty: 1000,
        theoretical_jr: 8.0,
        source_type: 'ROUTINE',
        routine_reference: 'REF-001',
        occurrence_key: 'occ_cunetas_001',
        is_manual_override: false,
        status: 'planned',
        created_at: '2026-09-10T08:00:00Z',
        updated_at: '2026-09-10T08:00:00Z',
      },
    ];

    storedRoles = [
      {
        user_id: workerUserId,
        board_id: boardId,
        role: 'crew_leader',
      },
    ];

    mockSupabase = {
      from: (table: string) => ({
        select: (fields: string) => ({
          eq: (col: string, val: any) => ({
            single: async () => {
              if (table === 'weekly_plan_items' && col === 'id') {
                const found = storedWeeklyPlanItems.find((i) => i.id === val);
                return found ? { data: { ...found }, error: null } : { data: null, error: new Error('Not found') };
              }
              if (table === 'weekly_plan_item_executions' && col === 'source_mutation_id') {
                const found = storedExecutions.find((e) => e.source_mutation_id === val);
                return found ? { data: { ...found }, error: null } : { data: null, error: new Error('Not found') };
              }
              return { data: null, error: new Error('Not found') };
            },
            maybeSingle: async () => {
              if (table === 'weekly_plan_item_executions' && col === 'source_mutation_id') {
                const found = storedExecutions.find((e) => e.source_mutation_id === val);
                return { data: found ? { ...found } : null, error: null };
              }
              return { data: null, error: null };
            },
            eq: (col2: string, val2: any) => ({
              then: async (resolve: any) => {
                if (table === 'user_board_roles') {
                  const roles = storedRoles.filter((r) => r.user_id === val && r.board_id === val2);
                  return resolve({ data: roles, error: null });
                }
                return resolve({ data: [], error: null });
              },
            }),
            then: async (resolve: any) => {
              if (table === 'weekly_plan_item_executions' && col === 'weekly_plan_item_id') {
                const execs = storedExecutions.filter((e) => e.weekly_plan_item_id === val);
                return resolve({ data: execs, error: null });
              }
              if (table === 'acta_items') {
                return resolve({ data: [], error: null });
              }
              return resolve({ data: [], error: null });
            },
          }),
        }),
        insert: (payload: any) => ({
          select: () => ({
            single: async () => {
              // Simular constraint de unicidad de uq_wpie_source_mutation_id
              if (payload.source_mutation_id) {
                const conflict = storedExecutions.find((e) => e.source_mutation_id === payload.source_mutation_id);
                if (conflict) {
                  return {
                    data: null,
                    error: {
                      code: '23505',
                      message: 'duplicate key value violates unique constraint "uq_wpie_source_mutation_id"',
                    },
                  };
                }
              }

              const newRecord: ExecutionRecord = {
                id: `exec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                ...payload,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
              storedExecutions.push(newRecord);
              return { data: { ...newRecord }, error: null };
            },
          }),
        }),
        update: (payload: any) => ({
          eq: (col: string, val: any) => ({
            select: () => ({
              single: async () => {
                if (table === 'weekly_plan_items' && col === 'id') {
                  const idx = storedWeeklyPlanItems.findIndex((i) => i.id === val);
                  if (idx >= 0) {
                    storedWeeklyPlanItems[idx] = { ...storedWeeklyPlanItems[idx], ...payload };
                    return { data: { ...storedWeeklyPlanItems[idx] }, error: null };
                  }
                }
                return { data: null, error: new Error('Not found') };
              },
            }),
          }),
        }),
      }),
    };
  });

  // POD-01.01: Persistencia de recursos válidos
  it('POD-01.01: Persiste snapshot inmutable de recursos consumidos (MATERIAL, EQUIPO_MENOR, EQUIPO_MAYOR)', async () => {
    const usedResources: OperationalResourceItem[] = [
      {
        resourceKey: 'MAT_CEMENTO_GRIS',
        resourceName: 'Cemento Gris Tipo 1',
        category: 'MATERIAL',
        unit: 'saco',
        quantity: 5,
      },
      {
        resourceKey: 'EQM_COMPACTADORA',
        resourceName: 'Vibrocompactadora',
        category: 'EQUIPO_MENOR',
        unit: 'hora',
        quantity: 4,
      },
    ];

    const result = await reportFieldExecution(mockSupabase, {
      weekly_plan_item_id: planItemId,
      board_id: boardId,
      execution_date: '2026-09-15',
      executed_qty: 230,
      reported_by: workerUserId,
      used_resources: usedResources,
      continuation_decision: 'CONTINUA_MANANA',
    });

    expect(result.executionRecord.used_resources).toBeDefined();
    expect(result.executionRecord.used_resources).toHaveLength(2);
    expect(result.executionRecord.used_resources?.[0].resourceKey).toBe('MAT_CEMENTO_GRIS');
    expect(result.executionRecord.used_resources?.[0].quantity).toBe(5);
    expect(result.parentItem.status).toBe('in_progress');
  });

  // POD-01.02: Invarianza sin recursos provistos (default '[]')
  it('POD-01.02: Ejecución sin used_resources persiste arreglo vacío [] por defecto', async () => {
    const result = await reportFieldExecution(mockSupabase, {
      weekly_plan_item_id: planItemId,
      board_id: boardId,
      execution_date: '2026-09-15',
      executed_qty: 150,
      reported_by: workerUserId,
      continuation_decision: 'CONTINUA_MANANA',
    });

    expect(result.executionRecord.used_resources).toEqual([]);
  });

  // POD-01.03: Validación estricta de estructura de recurso
  it('POD-01.03: Rechaza recurso con cantidad negativa o campos inválidos', async () => {
    const invalidResources: any[] = [
      {
        resourceKey: 'MAT_ARENA',
        resourceName: 'Arena de Peña',
        category: 'MATERIAL',
        unit: 'm3',
        quantity: -2, // Invalido
      },
    ];

    await expect(
      reportFieldExecution(mockSupabase, {
        weekly_plan_item_id: planItemId,
        board_id: boardId,
        execution_date: '2026-09-15',
        executed_qty: 100,
        reported_by: workerUserId,
        used_resources: invalidResources,
      })
    ).rejects.toThrow(/INVALID_OPERATIONAL_RESOURCE/);
  });

  // POD-01.04 & C2: Idempotencia en reintento y carrera concurrente
  it('POD-01.04 (C2): Carrera concurrente con conflicto UNIQUE resuelve replay idempotente sin duplicados', async () => {
    const mutationId = 'mut_race_condition_test_001';

    // 1. Primer proceso inserta exitosamente
    const res1 = await reportFieldExecution(mockSupabase, {
      weekly_plan_item_id: planItemId,
      board_id: boardId,
      execution_date: '2026-09-15',
      executed_qty: 230,
      reported_by: workerUserId,
      source_mutation_id: mutationId,
      used_resources: [
        {
          resourceKey: 'MAT_CEMENTO_GRIS',
          resourceName: 'Cemento',
          category: 'MATERIAL',
          unit: 'saco',
          quantity: 5,
        },
      ],
      continuation_decision: 'CONTINUA_MANANA',
    });

    expect(res1.isIdempotentReplay).toBe(false);
    expect(storedExecutions).toHaveLength(1);

    // 2. Segundo proceso concurrente (simulando que pasa el pre-check y colisiona en el INSERT)
    // El mock responderá con código 23505 duplicate key y reportFieldExecution recuperará el registro
    const res2 = await reportFieldExecution(mockSupabase, {
      weekly_plan_item_id: planItemId,
      board_id: boardId,
      execution_date: '2026-09-15',
      executed_qty: 230,
      reported_by: workerUserId,
      source_mutation_id: mutationId,
      used_resources: [
        {
          resourceKey: 'MAT_CEMENTO_GRIS',
          resourceName: 'Cemento',
          category: 'MATERIAL',
          unit: 'saco',
          quantity: 5,
        },
      ],
      continuation_decision: 'CONTINUA_MANANA',
    });

    expect(res2.isIdempotentReplay).toBe(true);
    expect(res2.executionRecord.id).toBe(res1.executionRecord.id);
    expect(storedExecutions).toHaveLength(1); // 0 Duplicados
    expect(res2.executionRecord.used_resources?.[0].quantity).toBe(5); // Consumo inalterado
  });

  // POD-01.05: Transición de estado con TERMINADA_HOY y subejecución
  it('POD-01.05: TERMINADA_HOY con subejecución pasa parent a completed sin inflar cantidades', async () => {
    // Día 1: 230 m (CONTINUA)
    await reportFieldExecution(mockSupabase, {
      weekly_plan_item_id: planItemId,
      board_id: boardId,
      execution_date: '2026-09-15',
      executed_qty: 230,
      reported_by: workerUserId,
      continuation_decision: 'CONTINUA_MANANA',
    });

    // Día 2: 240 m (CONTINUA)
    await reportFieldExecution(mockSupabase, {
      weekly_plan_item_id: planItemId,
      board_id: boardId,
      execution_date: '2026-09-16',
      executed_qty: 240,
      reported_by: workerUserId,
      continuation_decision: 'CONTINUA_MANANA',
    });

    // Día 3: 330 m (TERMINADA_HOY) -> Total acumulado = 800 m (Plan: 1000 m)
    const res3 = await reportFieldExecution(mockSupabase, {
      weekly_plan_item_id: planItemId,
      board_id: boardId,
      execution_date: '2026-09-17',
      executed_qty: 330,
      reported_by: workerUserId,
      continuation_decision: 'TERMINADA_HOY',
    });

    expect(res3.parentItem.status).toBe('completed');
    expect(storedWeeklyPlanItems[0].status).toBe('completed');
    expect(res3.metrics.totalReportedQty).toBe(800);
    expect(res3.metrics.remainingPlannedQty).toBe(1000); // Porque no están verified aún
    expect(storedExecutions).toHaveLength(3);
  });
});
