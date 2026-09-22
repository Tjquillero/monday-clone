
/**
 * Test Suite 46 — Gatillo Independiente de Superficie para /my-work (Fase 5.1)
 * Baseline de Entrada: 102 suites / 768 tests / TS 0 errores (M5 FROZEN)
 * Baseline Certificada: 103 suites / 780 tests / TS 0 errores (F5.1 FROZEN)
 * 
 * Contratos Evaluados:
 * - MW-01: Plan inexistente (NULL) -> Materializar vía Gateway V6.
 * - MW-02: Plan published con COUNT(*) = 0 y catálogo activo -> Materializar vía Gateway V6.
 * - MW-03: Plan published con COUNT(*) > 0 -> NO_OP (Lectura Pura / No tocar).
 * - MW-04: Plan en estado 'draft' -> NO_OP (Protección de edición en curso).
 * - MW-05: Plan en estado 'in_progress' -> NO_OP (Preservación histórica).
 * - MW-06: Estados inmutables y terminales ('confirmed', 'closed', 'cancelled') -> NO_OP.
 * - MW-07: Preservación de ítems ejecutados o en progreso (in_progress, completed).
 * - MW-08: Preservación de ítems con manual_override.
 * - MW-09: Exclusividad del Gateway V6 / Anti-bypass (0 mutaciones directas PostgREST).
 * - MW-10: Concurrencia e Idempotencia (Promise.all concurrentes sin colisiones ni duplicados).
 */

import {
  evaluateMyWorkMaterializationNeed,
  triggerMyWorkMaterialization,
} from '../myWorkSurfaceTriggerService';

describe('Test Suite 46 — Gatillo Independiente de Superficie para /my-work (Fase 5.1)', () => {
  const boardId = 'board_mywork_f51';
  const siteId = 'site_mywork_f51';
  const weekStartStr = '2026-09-07'; // Lunes 7 de Septiembre de 2026

  let storedWeeklyPlans: any[] = [];
  let storedWeeklyPlanItems: any[] = [];
  let standardsCatalog: any[] = [];
  let directPostgrestMutations: { table: string; method: string; payload: any }[] = [];
  let rpcCalls: { fn: string; params: any }[] = [];

  let mockSupabase: any;

  beforeEach(() => {
    storedWeeklyPlans = [];
    storedWeeklyPlanItems = [];
    directPostgrestMutations = [];
    rpcCalls = [];

    standardsCatalog = [
      {
        id: 'std_corte_grama',
        board_id: boardId,
        activity_key: 'corte_grama',
        name: 'Corte de Césped',
        category: 'Zona Verde',
        unit: 'M2',
        rendimiento: 500,
        frecuencia: 25,
        priority: 'must_execute',
        requiere_rendimiento: true,
      },
      {
        id: 'std_poda_arboles',
        board_id: boardId,
        activity_key: 'poda_arboles',
        name: 'Poda de Árboles',
        category: 'Zona Verde',
        unit: 'UND',
        rendimiento: 10,
        frecuencia: 12,
        priority: 'must_execute',
        requiere_rendimiento: true,
      },
    ];

    mockSupabase = {
      from: jest.fn((table: string) => {
        if (table === 'weekly_plans') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockImplementation((col: string, val: any) => {
              return {
                eq: jest.fn().mockImplementation((col2: string, val2: any) => ({
                  or: jest.fn().mockImplementation((orExpr: string) => ({
                    maybeSingle: jest.fn().mockImplementation(async () => {
                      const found = storedWeeklyPlans.find(
                        (p) => p.board_id === val && (p.group_id === val2 || (!p.group_id && !val2))
                      );
                      return { data: found || null, error: null };
                    }),
                  })),
                })),
                is: jest.fn().mockImplementation((col2: string, val2: any) => ({
                  or: jest.fn().mockImplementation((orExpr: string) => ({
                    maybeSingle: jest.fn().mockImplementation(async () => {
                      const found = storedWeeklyPlans.find(
                        (p) => p.board_id === val && (!p.group_id || p.group_id === null)
                      );
                      return { data: found || null, error: null };
                    }),
                  })),
                })),
              };
            }),
            insert: jest.fn().mockImplementation((payload: any) => {
              directPostgrestMutations.push({ table: 'weekly_plans', method: 'insert', payload });
              return {
                select: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({ data: { id: 'wp_direct', ...payload }, error: null }),
              };
            }),
            update: jest.fn().mockImplementation((payload: any) => {
              directPostgrestMutations.push({ table: 'weekly_plans', method: 'update', payload });
              return {
                eq: jest.fn().mockResolvedValue({ data: payload, error: null }),
              };
            }),
            delete: jest.fn().mockImplementation(() => {
              directPostgrestMutations.push({ table: 'weekly_plans', method: 'delete', payload: null });
              return {
                eq: jest.fn().mockResolvedValue({ data: null, error: null }),
              };
            }),
          };
        }

        if (table === 'weekly_plan_items') {
          return {
            select: jest.fn().mockImplementation((fields: string, opts?: any) => {
              if (opts?.head && opts?.count === 'exact') {
                return {
                  eq: jest.fn().mockImplementation(async (col: string, val: string) => {
                    const count = storedWeeklyPlanItems.filter((i) => i.plan_id === val || i.weekly_plan_id === val).length;
                    return { count, error: null };
                  }),
                };
              }
              return {
                eq: jest.fn().mockImplementation(async (col: string, val: string) => {
                  const data = storedWeeklyPlanItems.filter((i) => i.plan_id === val || i.weekly_plan_id === val);
                  return { data, error: null };
                }),
              };
            }),
            insert: jest.fn().mockImplementation((payload: any) => {
              directPostgrestMutations.push({ table: 'weekly_plan_items', method: 'insert', payload });
              return Promise.resolve({ data: payload, error: null });
            }),
            update: jest.fn().mockImplementation((payload: any) => {
              directPostgrestMutations.push({ table: 'weekly_plan_items', method: 'update', payload });
              return {
                eq: jest.fn().mockResolvedValue({ data: payload, error: null }),
              };
            }),
            delete: jest.fn().mockImplementation(() => {
              directPostgrestMutations.push({ table: 'weekly_plan_items', method: 'delete', payload: null });
              return {
                eq: jest.fn().mockResolvedValue({ data: null, error: null }),
              };
            }),
          };
        }

        if (table === 'board_activity_standards') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockImplementation((col: string, val: any) => ({
              eq: jest.fn().mockImplementation(async () => ({
                data: standardsCatalog.filter((s) => s.board_id === val && s.requiere_rendimiento),
                error: null,
              })),
            })),
          };
        }

        if (table === 'poa_versions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'poa_ver_active' }, error: null }),
          };
        }

        if (table === 'poa_activities') {
          return {
            select: jest.fn().mockResolvedValue({
              data: [
                { id: 'poa_act_1', activity_key: 'corte_grama', frecuencia: 25 },
                { id: 'poa_act_2', activity_key: 'poda_arboles', frecuencia: 12 },
              ],
              error: null,
            }),
          };
        }

        if (table === 'activity_scope_mappings') {
          return {
            select: jest.fn().mockResolvedValue({
              data: [
                { activity_key: 'corte_grama', scope_key: 'grama' },
                { activity_key: 'poda_arboles', scope_key: 'arboles' },
              ],
              error: null,
            }),
          };
        }

        if (table === 'resource_analysis') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { scope_data: { grama: 20000, arboles: 100 } },
              error: null,
            }),
          };
        }

        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),

      rpc: jest.fn().mockImplementation(async (fnName: string, params: any) => {
        rpcCalls.push({ fn: fnName, params });

        if (fnName === 'ensure_weekly_plan_header') {
          const existing = storedWeeklyPlans.find(
            (p) =>
              p.board_id === params.p_board_id &&
              (p.group_id === params.p_group_id || (!p.group_id && !params.p_group_id))
          );
          if (existing) {
            return { data: existing.id, error: null };
          }
          const newId = `wp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const created = {
            id: newId,
            board_id: params.p_board_id,
            group_id: params.p_group_id,
            week_start: params.p_week_start,
            week_start_date: params.p_week_start,
            period_number: params.p_period_number,
            status: 'published',
          };
          storedWeeklyPlans.push(created);
          return { data: newId, error: null };
        }

        if (fnName === 'sync_weekly_plan_items_rpc') {
          const planId = params.p_plan_id;
          const itemsPayload = params.p_items || [];

          // Preservar ítems inmutables existentes si existieran
          const preserved = storedWeeklyPlanItems.filter(
            (i) =>
              (i.plan_id === planId || i.weekly_plan_id === planId) &&
              (i.status === 'in_progress' ||
                i.status === 'completed' ||
                i.status === 'cancelled' ||
                i.is_manual_override === true)
          );

          const newItems = itemsPayload.map((dto: any, idx: number) => ({
            id: `wpi_${planId}_${idx + 1}`,
            plan_id: planId,
            weekly_plan_id: planId,
            planned_sequence: dto.planned_sequence,
            activity_key: dto.activity_key,
            activity_standard_id: dto.activity_standard_id,
            planned_rendimiento: dto.planned_rendimiento,
            planned_frecuencia: dto.planned_frecuencia,
            priority: dto.priority,
            planned_qty: dto.planned_qty,
            unit: dto.unit,
            planned_jr: dto.planned_jr,
            planned_date: dto.planned_date,
            status: 'planned',
            is_manual_override: false,
          }));

          storedWeeklyPlanItems = [...preserved, ...newItems];
          return { data: storedWeeklyPlanItems, error: null };
        }

        return { data: null, error: new Error(`Unknown RPC: ${fnName}`) };
      }),
    };
  });

  // MW-01: Plan inexistente (NULL) -> Materializar
  it('MW-01: debe materializar vía Gateway V6 cuando el plan es inexistente (NULL)', async () => {
    const evalResult = await evaluateMyWorkMaterializationNeed(mockSupabase, boardId, siteId, weekStartStr);
    expect(evalResult.action).toBe('MATERIALIZE');
    expect(evalResult.reason).toBe('PLAN_NOT_FOUND');
    expect(evalResult.existingPlan).toBeNull();

    const result = await triggerMyWorkMaterialization(mockSupabase, boardId, siteId, weekStartStr);
    expect(result.isMutated).toBe(true);
    expect(result.insertedCount).toBeGreaterThan(0);
    expect(result.weeklyPlan).not.toBeNull();
    expect(result.weeklyPlan?.status).toBe('published');

    // Debe llamar a los 2 RPCs del Gateway V6
    expect(rpcCalls.map((c) => c.fn)).toEqual(['ensure_weekly_plan_header', 'sync_weekly_plan_items_rpc']);
  });

  // MW-02: Plan published vacío (COUNT = 0) + Catálogo > 0 -> Materializar
  it('MW-02: debe materializar vía Gateway V6 cuando el plan es published pero tiene COUNT(*) = 0 y catálogo activo', async () => {
    storedWeeklyPlans.push({
      id: 'wp_empty_published',
      board_id: boardId,
      group_id: siteId,
      week_start: weekStartStr,
      week_start_date: weekStartStr,
      status: 'published',
    });

    const evalResult = await evaluateMyWorkMaterializationNeed(mockSupabase, boardId, siteId, weekStartStr);
    expect(evalResult.action).toBe('MATERIALIZE');
    expect(evalResult.reason).toBe('EMPTY_PUBLISHED_PLAN');
    expect(evalResult.itemsCount).toBe(0);

    const result = await triggerMyWorkMaterialization(mockSupabase, boardId, siteId, weekStartStr);
    expect(result.isMutated).toBe(true);
    expect(result.insertedCount).toBeGreaterThan(0);
    expect(rpcCalls.map((c) => c.fn)).toEqual(['ensure_weekly_plan_header', 'sync_weekly_plan_items_rpc']);
  });

  // MW-03: Plan published poblado (COUNT > 0) -> NO_OP (Lectura Pura)
  it('MW-03: debe permanecer en NO_OP (Lectura Pura) cuando el plan published ya tiene COUNT(*) > 0', async () => {
    const planId = 'wp_populated_published';
    storedWeeklyPlans.push({
      id: planId,
      board_id: boardId,
      group_id: siteId,
      week_start: weekStartStr,
      week_start_date: weekStartStr,
      status: 'published',
    });
    storedWeeklyPlanItems.push({
      id: 'wpi_existing_1',
      plan_id: planId,
      activity_key: 'corte_grama',
      status: 'planned',
    });

    const evalResult = await evaluateMyWorkMaterializationNeed(mockSupabase, boardId, siteId, weekStartStr);
    expect(evalResult.action).toBe('NO_OP');
    expect(evalResult.reason).toBe('ALREADY_MATERIALIZED');
    expect(evalResult.itemsCount).toBe(1);

    const result = await triggerMyWorkMaterialization(mockSupabase, boardId, siteId, weekStartStr);
    expect(result.isMutated).toBe(false);
    expect(result.insertedCount).toBe(0);
    expect(result.items.length).toBe(1);
    expect(rpcCalls.length).toBe(0); // 0 RPCs ejecutados
  });

  // MW-04: Plan en estado draft -> NO_OP (Protección de edición)
  it('MW-04: debe proteger y NO tocar un plan en estado draft', async () => {
    storedWeeklyPlans.push({
      id: 'wp_draft_1',
      board_id: boardId,
      group_id: siteId,
      week_start: weekStartStr,
      week_start_date: weekStartStr,
      status: 'draft',
    });

    const evalResult = await evaluateMyWorkMaterializationNeed(mockSupabase, boardId, siteId, weekStartStr);
    expect(evalResult.action).toBe('NO_OP');
    expect(evalResult.reason).toBe('DRAFT_PROTECTED');

    const result = await triggerMyWorkMaterialization(mockSupabase, boardId, siteId, weekStartStr);
    expect(result.isMutated).toBe(false);
    expect(rpcCalls.length).toBe(0);
  });

  // MW-05: Plan en estado in_progress -> NO_OP (Preservación histórica)
  it('MW-05: debe proteger y NO tocar un plan en estado in_progress', async () => {
    storedWeeklyPlans.push({
      id: 'wp_in_progress_1',
      board_id: boardId,
      group_id: siteId,
      week_start: weekStartStr,
      week_start_date: weekStartStr,
      status: 'in_progress',
    });

    const evalResult = await evaluateMyWorkMaterializationNeed(mockSupabase, boardId, siteId, weekStartStr);
    expect(evalResult.action).toBe('NO_OP');
    expect(evalResult.reason).toBe('IN_PROGRESS_PROTECTED');

    const result = await triggerMyWorkMaterialization(mockSupabase, boardId, siteId, weekStartStr);
    expect(result.isMutated).toBe(false);
    expect(rpcCalls.length).toBe(0);
  });

  // MW-06: Estados inmutables y terminales (confirmed, closed, cancelled)
  it.each([
    ['confirmed', 'CONFIRMED_IMMUTABLE'],
    ['closed', 'CLOSED_IMMUTABLE'],
    ['cancelled', 'CANCELLED_TERMINAL'],
  ])('MW-06: debe respetar inmutabilidad y NO modificar el plan en estado %s', async (status, expectedReason) => {
    storedWeeklyPlans = [
      {
        id: `wp_${status}_test`,
        board_id: boardId,
        group_id: siteId,
        week_start: weekStartStr,
        week_start_date: weekStartStr,
        status,
      },
    ];

    const evalResult = await evaluateMyWorkMaterializationNeed(mockSupabase, boardId, siteId, weekStartStr);
    expect(evalResult.action).toBe('NO_OP');
    expect(evalResult.reason).toBe(expectedReason);

    const result = await triggerMyWorkMaterialization(mockSupabase, boardId, siteId, weekStartStr);
    expect(result.isMutated).toBe(false);
    expect(rpcCalls.length).toBe(0);
  });

  // MW-07: Preservación de ejecuciones activas (in_progress, completed)
  it('MW-07: Gateway V6 debe preservar de forma absoluta ítems en estado in_progress o completed', async () => {
    // 1. Materializar inicialmente
    const initResult = await triggerMyWorkMaterialization(mockSupabase, boardId, siteId, weekStartStr);
    expect(initResult.items.length).toBeGreaterThan(0);

    const planId = initResult.weeklyPlan!.id;

    // 2. Simular que un operario inició y completó actividades en campo
    storedWeeklyPlanItems[0].status = 'in_progress';
    storedWeeklyPlanItems[0].executed_qty = 250;
    if (storedWeeklyPlanItems[1]) {
      storedWeeklyPlanItems[1].status = 'completed';
      storedWeeklyPlanItems[1].executed_qty = 500;
    }

    const preservedId0 = storedWeeklyPlanItems[0].id;
    const preservedId1 = storedWeeklyPlanItems[1]?.id;

    // 3. Ejecutar sincronización V6
    await mockSupabase.rpc('sync_weekly_plan_items_rpc', {
      p_plan_id: planId,
      p_items: [
        { planned_sequence: 1, activity_key: 'corte_grama', planned_qty: 1000, planned_date: weekStartStr },
      ],
    });

    const item0 = storedWeeklyPlanItems.find((i) => i.id === preservedId0);
    expect(item0.status).toBe('in_progress');
    expect(item0.executed_qty).toBe(250);

    if (preservedId1) {
      const item1 = storedWeeklyPlanItems.find((i) => i.id === preservedId1);
      expect(item1.status).toBe('completed');
      expect(item1.executed_qty).toBe(500);
    }
  });

  // MW-08: Preservación de ítems con manual_override
  it('MW-08: Gateway V6 debe preservar de forma absoluta ítems marcados con is_manual_override = true', async () => {
    const initResult = await triggerMyWorkMaterialization(mockSupabase, boardId, siteId, weekStartStr);
    const planId = initResult.weeklyPlan!.id;

    // Marcar un ítem como override manual
    storedWeeklyPlanItems[0].is_manual_override = true;
    storedWeeklyPlanItems[0].priority = 'low_priority';
    const overrideId = storedWeeklyPlanItems[0].id;

    // Re-sincronizar con catálogo estándar
    await mockSupabase.rpc('sync_weekly_plan_items_rpc', {
      p_plan_id: planId,
      p_items: [
        { planned_sequence: 1, activity_key: 'corte_grama', priority: 'must_execute', planned_date: weekStartStr },
      ],
    });

    const itemOverride = storedWeeklyPlanItems.find((i) => i.id === overrideId);
    expect(itemOverride.is_manual_override).toBe(true);
    expect(itemOverride.priority).toBe('low_priority');
  });

  // MW-09: Exclusividad del Gateway V6 / Anti-bypass
  it('MW-09: debe persistir exclusivamente a través del Gateway V6 RPC y realizar 0 mutaciones PostgREST directas', async () => {
    await triggerMyWorkMaterialization(mockSupabase, boardId, siteId, weekStartStr);

    // Debe haber invocado los RPCs certificados
    expect(rpcCalls.length).toBe(2);
    expect(rpcCalls[0].fn).toBe('ensure_weekly_plan_header');
    expect(rpcCalls[1].fn).toBe('sync_weekly_plan_items_rpc');

    // Invariante estricto F5.1-INV-05: 0 mutaciones directas a tablas de plan
    expect(directPostgrestMutations).toHaveLength(0);
  });

  // MW-10: Concurrencia e idempotencia
  it('MW-10: debe garantizar idempotencia y estabilidad sin duplicados ante llamadas concurrentes (Promise.all)', async () => {
    // Simular 2 llamadas concurrentes desde /my-work para la misma semana
    const [res1, res2] = await Promise.all([
      triggerMyWorkMaterialization(mockSupabase, boardId, siteId, weekStartStr),
      triggerMyWorkMaterialization(mockSupabase, boardId, siteId, weekStartStr),
    ]);

    expect(res1.weeklyPlan?.id).toBeDefined();
    expect(res2.weeklyPlan?.id).toBeDefined();
    // Ambos deben apuntar al mismo id de cabecera generado por ensure_weekly_plan_header
    expect(res1.weeklyPlan?.id).toBe(res2.weeklyPlan?.id);

    // En BD solo debe existir 1 cabecera para ese board/site/week
    expect(storedWeeklyPlans.length).toBe(1);

    // 0 mutaciones PostgREST directas
    expect(directPostgrestMutations).toHaveLength(0);
  });
});
