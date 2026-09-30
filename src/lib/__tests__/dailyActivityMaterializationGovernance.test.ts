/**
 * Test Suite: Materialización Gobernada de Actividades Rutinarias v1.0
 * 
 * Verificaciones obligatorias del nuevo incremento:
 * 1. La ausencia de resource_analysis (o scope_data vacío/cero) NO impide la materialización de actividades del POA.
 * 2. Una actividad diaria (frecuencia = 1) sin resource_analysis genera sus 6 ocurrencias (L-S) con planned_qty = 0 y planned_jr = 0.
 * 3. Una actividad con resource_analysis > 0 conserva planned_qty = cantidad y planned_jr calculado.
 * 4. Idempotencia y conservación del calendario hábil colombiano.
 */

import { ensureWeeklyPlanMaterialized } from '../scheduleMaterializationService';

describe('Materialización Gobernada de Actividades Rutinarias v1.0', () => {
  let mockSupabase: any;
  const boardId = 'board_puerto_colombia_gov';
  const siteId = 'site_plaza_gov';
  const weekStartStr = '2026-09-21'; // Lunes 21 de Septiembre de 2026

  let storedWeeklyPlans: any[] = [];
  let storedWeeklyPlanItems: any[] = [];
  let scopeDataMock: Record<string, number> = {};

  const createChainQuery = (dataToReturn: any) => {
    const q: any = {
      select: () => q,
      eq: () => q,
      in: () => q,
      is: () => q,
      order: () => q,
      limit: () => q,
      maybeSingle: () => Promise.resolve({ data: dataToReturn, error: null }),
      single: () => Promise.resolve({ data: dataToReturn, error: null }),
      then: (resolve: any) => resolve({ data: dataToReturn, error: null }),
    };
    return q;
  };

  beforeEach(() => {
    storedWeeklyPlans = [];
    storedWeeklyPlanItems = [];
    scopeDataMock = {};

    mockSupabase = {
      from: jest.fn((table: string) => {
        if (table === 'poa' || table === 'poas') {
          return createChainQuery([{ id: 'poa_v1', board_id: boardId }]);
        }

        if (table === 'poa_versions') {
          return createChainQuery([{ id: 'poa_ver_active', poa_id: 'poa_v1', status: 'active' }]);
        }

        if (table === 'poa_activities') {
          return createChainQuery([
            { id: 'pa_1', activity_key: 'limpieza_zonas_duras', frecuencia: 1 },
            { id: 'pa_2', activity_key: 'poda_arboles', frecuencia: 75 },
          ]);
        }

        if (table === 'poa_activity_zones') {
          const qty1 = scopeDataMock['zona_dura'] ?? scopeDataMock['limpieza_zonas_duras'] ?? 5000;
          const qty2 = scopeDataMock['arboles'] ?? scopeDataMock['poda_arboles'] ?? 0;
          return createChainQuery([
            { id: 'paz_1', poa_activity_id: 'pa_1', zone_id: siteId, cantidad_contratada: qty1 },
            { id: 'paz_2', poa_activity_id: 'pa_2', zone_id: siteId, cantidad_contratada: qty2 },
          ]);
        }

        if (table === 'board_activity_standards') {
          return createChainQuery([
            { id: 'std_1', activity_key: 'limpieza_zonas_duras', name: 'Limpieza General zonas duras', category: 'ZONA DURA', unit: 'M2', rendimiento: 1000, frecuencia: 1, requiere_rendimiento: true },
            { id: 'std_2', activity_key: 'poda_arboles', name: 'Poda de Árboles', category: 'ZONA VERDE', unit: 'Und', rendimiento: 200, frecuencia: 75, requiere_rendimiento: true },
          ]);
        }

        if (table === 'activity_scope_mappings') {
          return createChainQuery([
            { activity_key: 'limpieza_zonas_duras', scope_key: 'zona_dura' },
            { activity_key: 'poda_arboles', scope_key: 'arboles' },
          ]);
        }

        if (table === 'resource_analysis') {
          return createChainQuery(
            Object.keys(scopeDataMock).length > 0 ? { scope_data: scopeDataMock } : null
          );
        }

        if (table === 'weekly_plans') {
          const q: any = {
            select: () => q,
            eq: () => q,
            is: () => q,
            maybeSingle: () => {
              const found = storedWeeklyPlans.find((p) => p.board_id === boardId && p.week_start_date === weekStartStr);
              return Promise.resolve({ data: found || null, error: null });
            },
            insert: (input: any) => {
              const newPlan = { id: `wp_${Date.now()}`, ...input };
              storedWeeklyPlans.push(newPlan);
              return createChainQuery(newPlan);
            },
          };
          return q;
        }

        if (table === 'weekly_plan_items') {
          const q: any = {
            select: () => q,
            eq: (col: string, val: string) => {
              const items = storedWeeklyPlanItems.filter((i) => i.weekly_plan_id === val || i.plan_id === val);
              return Promise.resolve({ data: items, error: null });
            },
            insert: (inputArray: any[]) => {
              const newItems = (inputArray || []).map((item) => ({
                id: `wpi_${Math.random().toString(36).substring(2, 9)}`,
                crew_id: null,
                ...item,
              }));
              storedWeeklyPlanItems.push(...newItems);
              return Promise.resolve({ data: newItems, error: null });
            },
            update: (updates: any) => ({
              eq: (col: string, val: string) => {
                const target = storedWeeklyPlanItems.find((i) => i.id === val);
                if (target) {
                  Object.assign(target, updates);
                }
                return Promise.resolve({ data: target, error: null });
              },
            }),
          };
          return q;
        }

        return createChainQuery([]);
      }),
      rpc: jest.fn().mockImplementation((fn: string, params: any) => {
        if (fn === 'ensure_weekly_plan_header') {
          return Promise.resolve({ data: 'wp_test_1', error: null });
        }
        if (fn === 'sync_weekly_plan_items_rpc') {
          const newInserted: any[] = [];
          for (const item of (params.p_items || [])) {
            const exists = storedWeeklyPlanItems.some(
              (x) => (x.plan_id === params.p_plan_id || x.weekly_plan_id === params.p_plan_id) && x.planned_sequence === item.planned_sequence
            );
            if (!exists) {
              const row = {
                id: `wpi_${item.planned_sequence}`,
                plan_id: params.p_plan_id,
                weekly_plan_id: params.p_plan_id,
                ...item,
              };
              storedWeeklyPlanItems.push(row);
              newInserted.push(row);
            }
          }
          return Promise.resolve({ data: newInserted, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    };
  });

  it('1. Debe materializar actividades del POA aun cuando resource_analysis sea null/vacío', async () => {
    scopeDataMock = {}; // Cero registros en resource_analysis

    const result = await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);

    expect(result.weeklyPlan).toBeDefined();
    expect(result.insertedCount).toBeGreaterThan(0);
    expect(storedWeeklyPlanItems.length).toBeGreaterThan(0);
  });

  it('2. Actividad diaria (frecuencia = 1) sin resource_analysis conserva planned_qty de poa_activity_zones y planned_jr calculado (H6.3)', async () => {
    scopeDataMock = {}; // Cero registros en resource_analysis (RA null)

    await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);

    const dailyItems = storedWeeklyPlanItems.filter((i) => i.activity_key === 'limpieza_zonas_duras');
    expect(dailyItems).toHaveLength(6);

    const dates = dailyItems.map((i) => i.planned_date).sort();
    expect(dates).toEqual([
      '2026-09-21', // Lunes
      '2026-09-22', // Martes
      '2026-09-23', // Miércoles
      '2026-09-24', // Jueves
      '2026-09-25', // Viernes
      '2026-09-26', // Sábado
    ]);

    dailyItems.forEach((item) => {
      expect(item.planned_qty).toBe(5000);
      const jr = item.theoretical_jr ?? item.planned_jr ?? 0;
      expect(jr).toBeGreaterThan(0);
    });
  });

  it('3. Actividad con resource_analysis > 0 debe conservar planned_qty = cantidad y planned_jr calculado', async () => {
    scopeDataMock = {
      zona_dura: 5000, // 5.000 m2
    };

    await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);

    const dailyItems = storedWeeklyPlanItems.filter((i) => i.activity_key === 'limpieza_zonas_duras');
    expect(dailyItems).toHaveLength(6);

    dailyItems.forEach((item) => {
      expect(item.planned_qty).toBe(5000);
      const jr = item.theoretical_jr ?? item.planned_jr ?? 0;
      expect(jr).toBeGreaterThan(0);
      expect(Number.isNaN(jr)).toBe(false);
    });
  });

  it('4. Debe garantizar idempotencia absoluta y cero duplicación', async () => {
    scopeDataMock = {};

    const res1 = await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);
    const countAfterFirst = storedWeeklyPlanItems.length;

    const res2 = await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);
    expect(res2.insertedCount).toBe(0);
    expect(storedWeeklyPlanItems.length).toBe(countAfterFirst);
  });
});
