import { resolveSite } from './domainTools/siteResolver';
import { resolveWeekMonday, getMondayOfWeek } from './domainTools/weekResolver';
import { getSiteWeekPlanTool } from './tools/getSiteWeekPlan';
import { getOperationalFrequenciesTool } from './tools/getOperationalFrequencies';
import { getTractorRouteTool } from './tools/getTractorRoute';
import { getMonthCarryoverTool } from './tools/getMonthCarryover';
import { AI_TOOL_REGISTRY } from './tools/registry';
import { computeTractorRouteForWeek, buildTractorUnits, TractorUnit } from '@/lib/routineScheduler';

describe('GATE AI-COPILOT-02 — Copiloto que entiende la planificación (Fase 2)', () => {
  const boardId = '3ea0326f-9999-4444-aaaa-bbbbccccdddd';

  const mockGroups = [
    { id: 'g-country', title: 'PLAYA DEL COUNTRY', position: 1, board_id: boardId },
    { id: 'g-sabanilla', title: 'PLAYA DE SABANILLA 2', position: 2, board_id: boardId },
    { id: 'g-salgar', title: 'PLAYA SALGAR', position: 3, board_id: boardId },
    { id: 'g-pradomar', title: 'PLAYA PRADOMAR', position: 4, board_id: boardId },
    { id: 'g-miramar', title: 'MIRAMAR SECTOR EL FARO', position: 5, board_id: boardId },
    { id: 'g-puerto', title: 'PLAYA PUERTO COLOMBIA', position: 6, board_id: boardId },
  ];

  // 1. siteResolver
  describe('1. siteResolver', () => {
    const createSupabaseMock = (groupsData: any[]) =>
      ({
        from: (table: string) => {
          if (table === 'groups') {
            return {
              select: () => ({
                eq: (col: string, val: string) => ({
                  order: () => Promise.resolve({
                    data: val === boardId ? groupsData : [],
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        },
      } as any);

    test('"miramar" resuelve a "MIRAMAR SECTOR EL FARO"', async () => {
      const supabase = createSupabaseMock(mockGroups);
      const site = await resolveSite(supabase, boardId, 'miramar', null);
      expect(site.id).toBe('g-miramar');
      expect(site.title).toBe('MIRAMAR SECTOR EL FARO');
    });

    test('"playa" con varias coincidencias da error con la lista', async () => {
      const supabase = createSupabaseMock(mockGroups);
      await expect(resolveSite(supabase, boardId, 'playa', null)).rejects.toThrow(
        /coincide con varios sitios:.*PLAYA DEL COUNTRY/
      );
    });

    test('Un sitio inexistente da error con la lista de sitios del tablero', async () => {
      const supabase = createSupabaseMock(mockGroups);
      await expect(resolveSite(supabase, boardId, 'aeropuerto', null)).rejects.toThrow(
        /No se encontró ningún sitio que coincida con "aeropuerto".*Sitios disponibles:.*PLAYA DEL COUNTRY/
      );
    });

    test('Nunca resuelve sitios de otro tablero', async () => {
      const otherBoardId = '99999999-0000-0000-0000-000000000000';
      const supabase = createSupabaseMock(mockGroups);
      await expect(resolveSite(supabase, otherBoardId, 'miramar', null)).rejects.toThrow(
        /El tablero no tiene sitios configurados/
      );
    });
  });

  // 2. get_site_week_plan
  describe('2. get_site_week_plan', () => {
    test('Agrupa por día, suma personal y maquinaria por separado, marca over_limit y normaliza fecha al lunes', async () => {
      const mondayDateStr = '2026-10-12'; // Lunes

      const mockSupabase = {
        from: (table: string) => {
          if (table === 'groups') {
            return {
              select: () => ({
                eq: () => ({
                  order: () => Promise.resolve({ data: mockGroups, error: null }),
                }),
              }),
            };
          }
          if (table === 'weekly_plans') {
            return {
              select: () => ({
                eq: (col1: string, val1: string) => ({
                  eq: (col2: string, val2: string) => ({
                    eq: (col3: string, val3: string) => ({
                      neq: () => ({
                        maybeSingle: () =>
                          Promise.resolve({
                            data:
                              val3 === mondayDateStr
                                ? { id: 'plan-101', status: 'approved' }
                                : null,
                            error: null,
                          }),
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'weekly_plan_items') {
            return {
              select: () => ({
                eq: () => ({
                  order: () =>
                    Promise.resolve({
                      data: [
                        // Lunes 2026-10-12: 1.10 (personal: 3.5 jr), 1.15 (maquinaria: 1.0 jr)
                        { activity_key: '1.10', planned_date: '2026-10-12', planned_qty: 100, planned_jr: 3.5, unit: 'm2' },
                        { activity_key: '1.15', planned_date: '2026-10-12', planned_qty: 1, planned_jr: 1.0, unit: 'ha' },
                        // Martes 2026-10-13: 1.10 (personal: 7.0 jr -> excede capacidad de 5.0)
                        { activity_key: '1.10', planned_date: '2026-10-13', planned_qty: 200, planned_jr: 7.0, unit: 'm2' },
                      ],
                      error: null,
                    }),
                }),
              }),
            };
          }
          if (table === 'poa') {
            return {
              select: () => ({
                eq: () => Promise.resolve({ data: [{ id: 'poa-1' }], error: null }),
              }),
            };
          }
          if (table === 'poa_versions') {
            return {
              select: () => ({
                in: () => ({
                  eq: () => Promise.resolve({ data: [{ id: 'ver-1' }], error: null }),
                }),
              }),
            };
          }
          if (table === 'poa_activities') {
            return {
              select: () => ({
                eq: () =>
                  Promise.resolve({
                    data: [
                      { activity_key: '1.10', description: 'Limpieza manual de playa', unit: 'm2' },
                      { activity_key: '1.15', description: 'Limpieza mecánica de playa con tractor', unit: 'ha' },
                    ],
                    error: null,
                  }),
              }),
            };
          }
          if (table === 'operational_frequencies') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () =>
                    Promise.resolve({
                      data: [
                        { activity_key: '1.10', counts_capacity: true },
                        { activity_key: '1.15', counts_capacity: false },
                      ],
                      error: null,
                    }),
                }),
              }),
            };
          }
          if (table === 'site_daily_capacity') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: () => Promise.resolve({ data: { jornales_dia: 5.0 }, error: null }),
                  }),
                }),
              }),
            };
          }
          return {};
        },
      } as any;

      // Pasamos un miércoles 2026-10-14, debe normalizar al lunes 2026-10-12
      const res = await getSiteWeekPlanTool.execute(
        mockSupabase,
        { site: 'miramar', date: '2026-10-14' },
        { boardId, groupId: null, weekStart: null, todayBogota: '2026-10-03' }
      );

      expect(res.site).toBe('MIRAMAR SECTOR EL FARO');
      expect(res.week_start).toBe('2026-10-12');
      expect(res.plan_status).toBe('approved');
      expect(res.days).toHaveLength(6);

      // Lunes 12: 3.5 personal, 1.0 maquinaria, no excede límite (5.0)
      const monday = res.days.find((d: any) => d.date === '2026-10-12');
      expect(monday).toBeDefined();
      expect(monday?.personnel_jr_total).toBe(3.5);
      expect(monday?.machinery_jr_total).toBe(1.0);
      expect(monday?.over_limit).toBe(false);
      expect(monday?.activities).toHaveLength(2);
      expect(monday?.activities[0].machinery).toBe(false);
      expect(monday?.activities[1].machinery).toBe(true);

      // Martes 13: 7.0 personal, excede límite (5.0)
      const tuesday = res.days.find((d: any) => d.date === '2026-10-13');
      expect(tuesday).toBeDefined();
      expect(tuesday?.personnel_jr_total).toBe(7.0);
      expect(tuesday?.machinery_jr_total).toBe(0);
      expect(tuesday?.over_limit).toBe(true);
    });

    test('Sin plan devuelve plan_status: null y mensaje explícito', async () => {
      const mockSupabase = {
        from: (table: string) => {
          if (table === 'groups') {
            return {
              select: () => ({
                eq: () => ({
                  order: () => Promise.resolve({ data: mockGroups, error: null }),
                }),
              }),
            };
          }
          if (table === 'weekly_plans') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      neq: () => ({
                        maybeSingle: () => Promise.resolve({ data: null, error: null }),
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        },
      } as any;

      const res = await getSiteWeekPlanTool.execute(
        mockSupabase,
        { site: 'miramar', date: '2026-10-12' },
        { boardId, groupId: null, weekStart: null, todayBogota: '2026-10-03' }
      );

      expect(res.plan_status).toBeNull();
      expect(res.message).toBe('No hay plan creado para esa semana');
      expect(res.days).toEqual([]);
    });
  });

  // 3. get_operational_frequencies
  describe('3. get_operational_frequencies', () => {
    test('con activity_key: "1.12" y sin sitio devuelve una fila por cada sitio donde existe', async () => {
      const mockSupabase = {
        from: (table: string) => {
          if (table === 'groups') {
            return {
              select: () => ({
                eq: () => Promise.resolve({ data: mockGroups, error: null }),
              }),
            };
          }
          if (table === 'poa') {
            return {
              select: () => ({
                eq: () => Promise.resolve({ data: [{ id: 'poa-1' }], error: null }),
              }),
            };
          }
          if (table === 'poa_versions') {
            return {
              select: () => ({
                in: () => ({
                  eq: () => Promise.resolve({ data: [{ id: 'ver-1' }], error: null }),
                }),
              }),
            };
          }
          if (table === 'poa_activities') {
            return {
              select: () => ({
                eq: () =>
                  Promise.resolve({
                    data: [{ activity_key: '1.12', description: 'Cuidado y nivelación de arena' }],
                    error: null,
                  }),
              }),
            };
          }
          if (table === 'operational_frequencies') {
            return {
              select: () => ({
                eq: (col1: string, val1: string) => ({
                  eq: (col2: string, val2: string) => {
                    if (val2 === '1.12') {
                      return Promise.resolve({
                        data: [
                          { group_id: 'g-country', activity_key: '1.12', visits_per_month: 4, counts_capacity: true, source: 'contract' },
                          { group_id: 'g-sabanilla', activity_key: '1.12', visits_per_month: 4, counts_capacity: true, source: 'contract' },
                          { group_id: 'g-miramar', activity_key: '1.12', visits_per_month: 6, counts_capacity: true, source: 'contract' },
                        ],
                        error: null,
                      });
                    }
                    return Promise.resolve({ data: [], error: null });
                  },
                }),
              }),
            };
          }
          return {};
        },
      } as any;

      const res = await getOperationalFrequenciesTool.execute(
        mockSupabase,
        { activity_key: '1.12' },
        { boardId, groupId: null, weekStart: null, todayBogota: '2026-10-03' }
      );

      expect(res).toHaveLength(3);
      expect(res[0].key).toBe('1.12');
      expect(res[0].description).toBe('Cuidado y nivelación de arena');
      expect(res.map((r: any) => r.site)).toEqual([
        'MIRAMAR SECTOR EL FARO',
        'PLAYA DE SABANILLA 2',
        'PLAYA DEL COUNTRY',
      ]);
    });
  });

  // 4. get_tractor_route
  describe('4. get_tractor_route', () => {
    test('con las 6 playas de octubre y frecuencias 4/4/4/4/6/6, la semana 2026-10-12 coincide con computeTractorRouteForWeek', async () => {
      const tractorFreqs = [
        { group_id: 'g-country', visits_per_month: 4 },
        { group_id: 'g-sabanilla', visits_per_month: 4 },
        { group_id: 'g-salgar', visits_per_month: 4 },
        { group_id: 'g-pradomar', visits_per_month: 4 },
        { group_id: 'g-miramar', visits_per_month: 6 },
        { group_id: 'g-puerto', visits_per_month: 6 },
      ];

      const { tractorUnits } = buildTractorUnits(mockGroups, tractorFreqs);
      const expectedRoute = computeTractorRouteForWeek(tractorUnits, '2026-10-12');

      const mockSupabase = {
        from: (table: string) => {
          if (table === 'groups') {
            return {
              select: () => ({
                eq: () => Promise.resolve({ data: mockGroups, error: null }),
              }),
            };
          }
          if (table === 'operational_frequencies') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => Promise.resolve({ data: tractorFreqs, error: null }),
                }),
              }),
            };
          }
          if (table === 'weekly_plans') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    neq: () => Promise.resolve({ data: [], error: null }),
                  }),
                }),
              }),
            };
          }
          return {};
        },
      } as any;

      const res = await getTractorRouteTool.execute(
        mockSupabase,
        { date: '2026-10-12' },
        { boardId, groupId: null, weekStart: null, todayBogota: '2026-10-03' }
      );

      expect(res.week_start).toBe('2026-10-12');
      expect(res.route).toHaveLength(6);
      for (const day of res.route) {
        expect(day.sites).toEqual(expectedRoute.routeByDate?.[day.date] || []);
      }
    });

    test('plan simulado con 1.15 en dos playas sueltas el mismo día genera conflicto, pero Country + Sabanilla no', async () => {
      const tractorFreqs = [
        { group_id: 'g-country', visits_per_month: 4 },
        { group_id: 'g-sabanilla', visits_per_month: 4 },
        { group_id: 'g-salgar', visits_per_month: 4 },
        { group_id: 'g-miramar', visits_per_month: 6 },
      ];

      const mockSupabase = {
        from: (table: string) => {
          if (table === 'groups') {
            return {
              select: () => ({
                eq: () => Promise.resolve({ data: mockGroups, error: null }),
              }),
            };
          }
          if (table === 'operational_frequencies') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => Promise.resolve({ data: tractorFreqs, error: null }),
                }),
              }),
            };
          }
          if (table === 'weekly_plans') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    neq: () =>
                      Promise.resolve({
                        data: [
                          { id: 'plan-country', group_id: 'g-country' },
                          { id: 'plan-sabanilla', group_id: 'g-sabanilla' },
                          { id: 'plan-salgar', group_id: 'g-salgar' },
                          { id: 'plan-miramar', group_id: 'g-miramar' },
                        ],
                        error: null,
                      }),
                  }),
                }),
              }),
            };
          }
          if (table === 'weekly_plan_items') {
            return {
              select: () => ({
                in: () => ({
                  eq: () =>
                    Promise.resolve({
                      data: [
                        // Lunes: Country y Sabanilla programadas juntas -> NO conflicto (unidad par)
                        { plan_id: 'plan-country', planned_date: '2026-10-12', activity_key: '1.15' },
                        { plan_id: 'plan-sabanilla', planned_date: '2026-10-12', activity_key: '1.15' },
                        // Martes: Salgar y Miramar programadas juntas -> CONFLICTO (dos unidades distintas)
                        { plan_id: 'plan-salgar', planned_date: '2026-10-13', activity_key: '1.15' },
                        { plan_id: 'plan-miramar', planned_date: '2026-10-13', activity_key: '1.15' },
                      ],
                      error: null,
                    }),
                }),
              }),
            };
          }
          return {};
        },
      } as any;

      const res = await getTractorRouteTool.execute(
        mockSupabase,
        { date: '2026-10-12' },
        { boardId, groupId: null, weekStart: null, todayBogota: '2026-10-03' }
      );

      expect(res.conflicts).toHaveLength(1);
      expect(res.conflicts[0].date).toBe('2026-10-13');
      expect(res.conflicts[0].sites).toEqual(['PLAYA SALGAR', 'MIRAMAR SECTOR EL FARO']);

      // El lunes 12 no debe estar en conflictos
      expect(res.conflicts.some((c: any) => c.date === '2026-10-12')).toBe(false);
    });
  });

  // 5. get_month_carryover
  describe('5. get_month_carryover', () => {
    test('diferencia SIN_INFORMACION, NINGUNA y CON_ACTIVIDADES', async () => {
      const mockSupabase = {
        from: (table: string) => {
          if (table === 'groups') {
            return {
              select: () => ({
                eq: () => ({
                  order: () =>
                    Promise.resolve({
                      data: [
                        { id: 'g-1', title: 'Sitio Sin Info' },
                        { id: 'g-2', title: 'Sitio Sin Arrastre' },
                        { id: 'g-3', title: 'Sitio Con Arrastre' },
                      ],
                      error: null,
                    }),
                }),
              }),
            };
          }
          if (table === 'poa') {
            return {
              select: () => ({
                eq: () => Promise.resolve({ data: [{ id: 'poa-1' }], error: null }),
              }),
            };
          }
          if (table === 'poa_versions') {
            return {
              select: () => ({
                in: () => ({
                  eq: () => Promise.resolve({ data: [{ id: 'ver-1' }], error: null }),
                }),
              }),
            };
          }
          if (table === 'poa_activities') {
            return {
              select: () => ({
                eq: () =>
                  Promise.resolve({
                    data: [{ activity_key: '2.19', description: 'Poda de árboles', unit: 'UND' }],
                    error: null,
                  }),
              }),
            };
          }
          if (table === 'materialization_events') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    neq: () => ({
                      gte: () => ({
                        lte: () => ({
                          order: () => ({
                            order: () =>
                              Promise.resolve({
                                data: [
                                  // g-2: NONE
                                  {
                                    group_id: 'g-2',
                                    week_start: '2026-10-26',
                                    status: 'SUCCESS',
                                    payload: { carryover_next_month_projection: [] },
                                    created_at: '2026-10-26T10:00:00Z',
                                  },
                                  // g-3: ITEMS
                                  {
                                    group_id: 'g-3',
                                    week_start: '2026-10-26',
                                    status: 'SUCCESS',
                                    payload: {
                                      carryover_next_month_projection: [
                                        { activity_key: '2.19', qty: 15, jr: 3.5 },
                                      ],
                                    },
                                    created_at: '2026-10-26T10:00:00Z',
                                  },
                                ],
                                error: null,
                              }),
                          }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        },
      } as any;

      const res = await getMonthCarryoverTool.execute(
        mockSupabase,
        { month: '2026-10' },
        { boardId, groupId: null, weekStart: null, todayBogota: '2026-10-03' }
      );

      expect(res).toHaveLength(3);

      const site1 = res.find((r: any) => r.site === 'Sitio Sin Info');
      expect(site1?.status).toBe('SIN_INFORMACION');
      expect(site1?.items).toEqual([]);

      const site2 = res.find((r: any) => r.site === 'Sitio Sin Arrastre');
      expect(site2?.status).toBe('NINGUNA');
      expect(site2?.items).toEqual([]);

      const site3 = res.find((r: any) => r.site === 'Sitio Con Arrastre');
      expect(site3?.status).toBe('CON_ACTIVIDADES');
      expect(site3?.items).toHaveLength(1);
      expect(site3?.items[0]).toEqual({
        key: '2.19',
        description: 'Poda de árboles',
        qty: 15,
        unit: 'UND',
        jr: 3.5,
      });
    });
  });

  // 6. Ninguna de las 4 herramientas tiene parámetros que sean UUID o terminen en _id
  test('6. Ninguna de las 4 herramientas tiene parámetros UUID o terminados en _id', () => {
    const tools = [
      getSiteWeekPlanTool,
      getOperationalFrequenciesTool,
      getTractorRouteTool,
      getMonthCarryoverTool,
    ];

    for (const tool of tools) {
      const properties = Object.keys(tool.parametersJsonSchema.properties || {});
      for (const prop of properties) {
        expect(prop.endsWith('_id')).toBe(false);
        expect(prop).not.toBe('id');
        expect(prop).not.toBe('board_id');
        expect(prop).not.toBe('group_id');
      }
    }
  });
});
