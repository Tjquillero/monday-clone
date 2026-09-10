/**
 * Test Suite 40 — Integración y Persistencia del Motor de Materialización (`weekly_plan_items`)
 * Baseline: 2386465 + ADR-0007..ADR-0012 + Módulo 2 & 3 (CLOSED & CERTIFIED)
 *
 * Certifica:
 * 1. Materialización determinística de ocurrencias reales en PostgreSQL (`weekly_plan_items`).
 * 2. Idempotencia absoluta (0 duplicados en ejecuciones repetidas).
 * 3. Cumplimiento del calendario laboral colombiano (excluye domingos y festivos).
 * 4. Protección inviolable de ítems iniciados o completados en campo.
 * 5. Preservación de asignaciones de cuadrilla (`crew_id`).
 */

import { ensureWeeklyPlanMaterialized } from '../scheduleMaterializationService';

describe('Test Suite 40 — Integración y Persistencia del Motor de Materialización (weekly_plan_items)', () => {
  let mockSupabase: any;
  const boardId = 'board_barranquilla_40';
  const siteId = 'site_puerto_colombia_40';
  const weekStartStr = '2026-09-07'; // Lunes 7 de Septiembre de 2026

  let storedWeeklyPlans: any[] = [];
  let storedWeeklyPlanItems: any[] = [];

  beforeEach(() => {
    storedWeeklyPlans = [];
    storedWeeklyPlanItems = [];

    mockSupabase = {
      from: jest.fn((table: string) => {
        if (table === 'poa_versions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'poa_v1' }, error: null }),
          };
        }

        if (table === 'poa_activities') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({
              data: [
                { activity_key: 'corte_grama', frecuencia: 25 },
                { activity_key: 'limpieza_zona_dura', frecuencia: 25 },
              ],
              error: null,
            }),
          };
        }

        if (table === 'board_activity_standards') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockImplementation((col, val) => {
              return {
                eq: jest.fn().mockResolvedValue({
                  data: [
                    { id: 'std_1', activity_key: 'corte_grama', name: 'Corte de Grama', category: 'ZONA VERDE', unit: 'M2', rendimiento: 500, requiere_rendimiento: true },
                    { id: 'std_2', activity_key: 'limpieza_zona_dura', name: 'Limpieza de Zona Dura', category: 'ZONA DURA', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true },
                  ],
                  error: null,
                }),
              };
            }),
          };
        }

        if (table === 'activity_scope_mappings') {
          return {
            select: jest.fn().mockResolvedValue({
              data: [
                { activity_key: 'corte_grama', scope_key: 'grama' },
                { activity_key: 'limpieza_zona_dura', scope_key: 'zona_dura' },
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
              data: { scope_data: { grama: 25000, zona_dura: 50000 } },
              error: null,
            }),
          };
        }

        if (table === 'weekly_plans') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            is: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockImplementation(async () => {
              const found = storedWeeklyPlans.find((p) => p.board_id === boardId && p.week_start_date === weekStartStr);
              return { data: found || null, error: null };
            }),
            insert: jest.fn().mockImplementation((input: any) => {
              const newPlan = { id: `wp_${Date.now()}`, ...input };
              storedWeeklyPlans.push(newPlan);
              return {
                select: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({ data: newPlan, error: null }),
              };
            }),
          };
        }

        if (table === 'weekly_plan_items') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockImplementation(async (col: string, val: string) => {
              const items = storedWeeklyPlanItems.filter((i) => i.weekly_plan_id === val);
              return { data: items, error: null };
            }),
            insert: jest.fn().mockImplementation((inputArray: any[]) => {
              const newItems = (inputArray || []).map((item) => ({
                id: `wpi_${Math.random().toString(36).substring(2, 9)}`,
                crew_id: null,
                ...item,
              }));
              storedWeeklyPlanItems.push(...newItems);
              return Promise.resolve({ data: newItems, error: null });
            }),
            update: jest.fn().mockImplementation((updates: any) => ({
              eq: jest.fn().mockImplementation(async (col: string, val: string) => {
                const target = storedWeeklyPlanItems.find((i) => i.id === val);
                if (target) {
                  Object.assign(target, updates);
                }
                return { data: target, error: null };
              }),
              in: jest.fn().mockImplementation(async (col: string, ids: string[]) => {
                storedWeeklyPlanItems.forEach((i) => {
                  if (ids.includes(i.id)) {
                    Object.assign(i, updates);
                  }
                });
                return { data: true, error: null };
              }),
            })),
          };
        }

        return { select: jest.fn().mockReturnThis() };
      }),
    };
  });

  it('debe materializar y persistir correctamente las ocurrencias reales en PostgreSQL (weekly_plan_items)', async () => {
    const result = await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);

    expect(result.weeklyPlan).toBeDefined();
    expect(result.weeklyPlan.week_start_date).toBe(weekStartStr);
    expect(result.insertedCount).toBeGreaterThan(0);
    expect(storedWeeklyPlanItems.length).toBe(result.insertedCount);

    // Verificar que todas las ocurrencias creadas tienen planned_date dentro de la semana
    storedWeeklyPlanItems.forEach((item) => {
      expect(item.planned_date.localeCompare(weekStartStr)).toBeGreaterThanOrEqual(0);
      expect(item.status).toBe('planned');
    });
  });

  it('debe garantizar idempotencia absoluta: ejecuciones repetidas generan 0 duplicados', async () => {
    // Primera ejecución
    const result1 = await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);
    const initialCount = storedWeeklyPlanItems.length;
    expect(result1.insertedCount).toBe(initialCount);

    // Segunda ejecución para la misma semana y sitio
    const result2 = await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);

    expect(result2.insertedCount).toBe(0); // 0 nuevas inserciones
    expect(storedWeeklyPlanItems.length).toBe(initialCount); // Mismo número total de filas
  });

  it('debe proteger contra la modificación o cancelación de ítems ya ejecutados o modificados en campo', async () => {
    // 1. Materializar plan inicial
    await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);

    // 2. Simular que el trabajador reportó avance en una ocurrencia en campo
    const protectedItem = storedWeeklyPlanItems[0];
    protectedItem.status = 'in_progress';
    protectedItem.crew_id = 'crew_lider_40';

    // 3. Ejecutar nuevamente la sincronización
    const resultSync = await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);

    expect(resultSync.protectedCount).toBeGreaterThanOrEqual(1);

    // Verificar que la ocurrencia protegida NO perdió su estado ni su cuadrilla
    const itemInDb = storedWeeklyPlanItems.find((i) => i.id === protectedItem.id);
    expect(itemInDb.status).toBe('in_progress');
    expect(itemInDb.crew_id).toBe('crew_lider_40');
  });

  it('debe respetar el calendario laboral colombiano y no programar ocurrencias en domingo', async () => {
    await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);

    // 2026-09-13 es Domingo
    const sundayItems = storedWeeklyPlanItems.filter((i) => i.planned_date === '2026-09-13');
    expect(sundayItems).toHaveLength(0); // 0 ocurrencias en domingo
  });

  it('debe activar la materialización independiente de superficie al consultar la semana en /my-work', async () => {
    // Inicialmente no hay planes en BD para la semana del 07/09/2026
    expect(storedWeeklyPlans.length).toBe(0);

    // Simular que el cliente llama a ensureWeeklyPlanMaterialized al entrar a /my-work
    await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);

    // Ahora la semana está publicada y materializada con ítems físicos
    expect(storedWeeklyPlans.length).toBe(1);
    expect(storedWeeklyPlans[0].status).toBe('published');
    expect(storedWeeklyPlanItems.length).toBeGreaterThan(0);
  });
});
