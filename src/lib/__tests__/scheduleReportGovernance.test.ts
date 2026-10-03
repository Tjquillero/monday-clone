declare const vi: any;

let mockUser: any = null;
let mockBoardMemberResult: any = null;

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: () => [],
    set: () => {},
  }),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn().mockImplementation(() => ({
    auth: {
      getUser: vi.fn().mockImplementation(async () => ({
        data: { user: mockUser },
        error: mockUser ? null : { message: 'No user session' },
      })),
      getSession: vi.fn().mockImplementation(async () => ({
        data: { session: mockUser ? { user: mockUser } : null },
        error: null,
      })),
    },
    from: (table: string) => {
      if (table === 'board_members') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: vi.fn().mockImplementation(async () => ({
                  data: mockBoardMemberResult,
                  error: null,
                })),
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            data: [],
            error: null,
          }),
        }),
      };
    },
  })),
}));

import fs from 'fs';
import path from 'path';

import {
  buildMonthlyScheduleReportData,
  renderMonthlyScheduleReportHtml,
  formatColombianNumber,
  formatCellQuantity,
  formatVisitsPerMonth,
  shortenDescription,
  fetchAllRows,
  MonthlyScheduleReportData,
} from '../monthlyScheduleReportService';
import {
  CONSORCIO_LOGO_DATA_URI,
  MANTENIX_LOGO_DATA_URI,
} from '../reportBrandAssets';
import { generateActaReportHtml } from '../../components/reports/ActaReportTemplate';
import { generateCertifiedActaReportHtml } from '../../components/reports/CertifiedActaReportTemplate';
import { POST } from '../../app/api/reports/schedule-month/route';

describe('GATE UI-CRON-02 / UI-CRON-02b — Informe PDF del Cronograma Mensual', () => {
  const boardId = 'board-cron-test';

  function createMockSupabase(overrides: {
    board?: any;
    boardError?: any;
    boardMembers?: any[];
    poa?: any[];
    poaError?: any;
    poaVersions?: any[];
    poaVersionsError?: any;
    poaActivities?: any[];
    poaActivitiesError?: any;
    groups?: any[];
    groupsError?: any;
    opFreqs?: any[];
    opFreqsError?: any;
    capacities?: any[];
    capacitiesError?: any;
    plans?: any[];
    plansError?: any;
    planItems?: any[];
    planItemsError?: any;
    matEvents?: any[];
    matEventsError?: any;
  } = {}) {
    const board = overrides.board ?? {
      id: boardId,
      name: 'Proyecto Costero Mantenix',
    };

    const boardMembers = overrides.boardMembers ?? [
      { user_id: 'user-member-1', role: 'admin' },
    ];

    const poa = overrides.poa ?? [
      { id: 'poa-1', board_id: boardId, name: 'POA 2026' },
    ];

    const poaVersions = overrides.poaVersions ?? [
      { id: 'pv-12', poa_id: 'poa-1', version_number: 12, status: 'active' },
    ];

    const poaActivities = overrides.poaActivities ?? [
      {
        id: 'pa-1',
        poa_version_id: 'pv-12',
        activity_key: '1.01',
        description: 'LIMPIEZA GENERAL DE PLAYAS Y RETIRO DE RESIDUOS SOLIDOS, INCLUYE TRANSPORTE',
        unit: 'M2',
      },
      {
        id: 'pa-2',
        poa_version_id: 'pv-12',
        activity_key: '1.14',
        description: 'CORTE MECANIZADO DE GRAMA EN TALUDES CON GUADAÑADORA',
        unit: 'M2',
      },
      {
        id: 'pa-3',
        poa_version_id: 'pv-12',
        activity_key: '3.02',
        description: 'CRISTALIZADO DE PISOS DE MARMOL Y PROTECCION SELLANTE',
        unit: 'M2',
      },
    ];

    const groups = overrides.groups ?? [
      { id: 'grp-mercado', title: 'Mercado', position: 1 },
      { id: 'grp-plaza', title: 'Plaza', position: 2 },
      { id: 'grp-astilleros', title: 'Punta Astilleros', position: 3 }, // Sin operational_frequencies
    ];

    const opFreqs = overrides.opFreqs ?? [
      { board_id: boardId, group_id: 'grp-mercado', activity_key: '1.01', visits_per_month: 25, counts_capacity: true },
      { board_id: boardId, group_id: 'grp-plaza', activity_key: '1.01', visits_per_month: 25, counts_capacity: true },
      { board_id: boardId, group_id: 'grp-plaza', activity_key: '1.14', visits_per_month: 1, counts_capacity: false }, // Maquinaria
      { board_id: boardId, group_id: 'grp-plaza', activity_key: '3.02', visits_per_month: 1, counts_capacity: true },
    ];

    const capacities = overrides.capacities ?? [
      { board_id: boardId, group_id: 'grp-mercado', jornales_dia: 8.5 },
      { board_id: boardId, group_id: 'grp-plaza', jornales_dia: 7.0 },
    ];

    const plans = overrides.plans ?? [
      { id: 'plan-w1-plaza', board_id: boardId, group_id: 'grp-plaza', week_start: '2026-10-05', status: 'published' },
      { id: 'plan-w2-plaza', board_id: boardId, group_id: 'grp-plaza', week_start: '2026-10-12', status: 'published' },
      { id: 'plan-w3-cancelled', board_id: boardId, group_id: 'grp-plaza', week_start: '2026-10-19', status: 'cancelled' }, // Cancelado
      { id: 'plan-w4-plaza', board_id: boardId, group_id: 'grp-plaza', week_start: '2026-10-26', status: 'published' },
    ];

    const planItems = overrides.planItems ?? [
      // Semana 1: 2026-10-05 a 2026-10-10
      { id: 'it-1', plan_id: 'plan-w1-plaza', activity_key: '1.01', planned_date: '2026-10-05', planned_qty: 60, planned_jr: 6.0 },
      { id: 'it-2', plan_id: 'plan-w1-plaza', activity_key: '1.01', planned_date: '2026-10-06', planned_qty: 60, planned_jr: 6.0 },
      { id: 'it-3', plan_id: 'plan-w1-plaza', activity_key: '1.14', planned_date: '2026-10-07', planned_qty: 100, planned_jr: 2.5 },
      // Fecha fuera del mes de octubre (debe ser ignorada)
      { id: 'it-out', plan_id: 'plan-w1-plaza', activity_key: '1.01', planned_date: '2026-09-30', planned_qty: 60, planned_jr: 6.0 },
      // Item de plan cancelado (debe ser ignorado)
      { id: 'it-canc', plan_id: 'plan-w3-cancelled', activity_key: '1.01', planned_date: '2026-10-19', planned_qty: 60, planned_jr: 6.0 },
      // Semana 4: 3.02
      { id: 'it-4', plan_id: 'plan-w4-plaza', activity_key: '3.02', planned_date: '2026-10-27', planned_qty: 80, planned_jr: 8.0 },
    ];

    const matEvents = overrides.matEvents ?? [
      {
        id: 'me-1',
        board_id: boardId,
        group_id: 'grp-plaza',
        week_start: '2026-10-26',
        event_type: 'SITE_MATERIALIZATION_SUMMARY',
        created_at: '2026-10-02T10:00:00Z',
        payload: {
          carryover_next_month_projection: [
            { activity_key: '3.02', qty: 120, jr: 12.0 },
          ],
        },
      },
    ];

    return {
      from: (table: string) => {
        if (table === 'boards') {
          if (overrides.boardError) {
            return { select: () => ({ eq: () => ({ single: () => ({ data: null, error: overrides.boardError }) }) }) };
          }
          return { select: () => ({ eq: () => ({ single: () => ({ data: board, error: null }) }) }) };
        }
        if (table === 'board_members') {
          const createQuery = (filters: any = {}) => ({
            eq: (col: string, val: any) => createQuery({ ...filters, [col]: val }),
            maybeSingle: () => {
              const match = boardMembers.find((m) => {
                if (filters.board_id && m.board_id && m.board_id !== filters.board_id) return false;
                if (filters.user_id && m.user_id !== filters.user_id) return false;
                return true;
              });
              return { data: match || null, error: null };
            },
          });
          return { select: () => createQuery() };
        }
        if (table === 'poa') {
          if (overrides.poaError) {
            return { select: () => ({ eq: () => ({ data: null, error: overrides.poaError }) }) };
          }
          return { select: () => ({ eq: () => ({ data: poa, error: null }) }) };
        }
        if (table === 'poa_versions') {
          if (overrides.poaVersionsError) {
            return { select: () => ({ in: () => ({ eq: () => ({ data: null, error: overrides.poaVersionsError }) }) }) };
          }
          return {
            select: () => ({
              in: (col: string, vals: any[]) => ({
                eq: (col2: string, val2: any) => {
                  const filtered = poaVersions.filter(
                    (pv) => vals.includes(pv.poa_id) && pv.status === val2
                  );
                  return { data: filtered, error: null };
                },
              }),
            }),
          };
        }
        if (table === 'poa_activities') {
          if (overrides.poaActivitiesError) {
            return { select: () => ({ eq: () => ({ data: null, error: overrides.poaActivitiesError }) }) };
          }
          return {
            select: () => ({
              eq: (col: string, val: any) => {
                const filtered = poaActivities.filter((pa) => pa.poa_version_id === val);
                return { data: filtered, error: null };
              },
            }),
          };
        }
        if (table === 'groups') {
          if (overrides.groupsError) {
            return { select: () => ({ eq: () => ({ order: () => ({ data: null, error: overrides.groupsError }) }) }) };
          }
          return { select: () => ({ eq: () => ({ order: () => ({ data: groups, error: null }) }) }) };
        }
        if (table === 'operational_frequencies') {
          if (overrides.opFreqsError) {
            return { select: () => ({ eq: () => ({ data: null, error: overrides.opFreqsError }) }) };
          }
          return { select: () => ({ eq: () => ({ data: opFreqs, error: null }) }) };
        }
        if (table === 'site_daily_capacity') {
          if (overrides.capacitiesError) {
            return { select: () => ({ eq: () => ({ data: null, error: overrides.capacitiesError }) }) };
          }
          return { select: () => ({ eq: () => ({ data: capacities, error: null }) }) };
        }
        if (table === 'weekly_plans') {
          if (overrides.plansError) {
            return {
              select: () => ({
                eq: () => ({
                  gte: () => ({
                    lte: () => ({
                      neq: () => ({ data: null, error: overrides.plansError }),
                    }),
                  }),
                }),
              }),
            };
          }
          return {
            select: () => ({
              eq: () => ({
                gte: (colGte: string, valGte: string) => ({
                  lte: (colLte: string, valLte: string) => ({
                    neq: (colNeq: string, valNeq: string) => {
                      const filtered = plans.filter(
                        (p) =>
                          p.week_start >= valGte &&
                          p.week_start <= valLte &&
                          p.status !== valNeq
                      );
                      return { data: filtered, error: null };
                    },
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'weekly_plan_items') {
          if (overrides.planItemsError) {
            return {
              select: () => ({
                in: () => ({
                  order: () => ({
                    range: () => ({ data: null, error: overrides.planItemsError }),
                  }),
                }),
              }),
            };
          }
          return {
            select: () => ({
              in: (col: string, vals: any[]) => ({
                order: (colOrd: string, opt: any) => ({
                  range: (from: number, to: number) => {
                    const filtered = planItems.filter((it) => vals.includes(it.plan_id));
                    const sliced = filtered.slice(from, to + 1);
                    return { data: sliced, error: null };
                  },
                }),
              }),
            }),
          };
        }
        if (table === 'materialization_events') {
          if (overrides.matEventsError) {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    neq: () => ({
                      gte: () => ({
                        lte: () => ({
                          order: () => ({
                            order: () => ({ data: null, error: overrides.matEventsError }),
                          }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          return {
            select: () => ({
              eq: (col1: string, val1: any) => ({
                eq: (col2: string, val2: any) => ({
                  neq: (colNeq: string, valNeq: any) => ({
                    gte: (col3: string, val3: any) => ({
                      lte: (col4: string, val4: any) => ({
                        order: (ord1: string, opt1: any) => ({
                          order: (ord2: string, opt2: any) => {
                            const filtered = matEvents.filter(
                              (e) =>
                                e.board_id === val1 &&
                                e.event_type === val2 &&
                                e[colNeq] !== valNeq &&
                                e.week_start >= val3 &&
                                e.week_start <= val4
                            );
                            // Ordenar por week_start DESC, created_at DESC
                            filtered.sort((a, b) => {
                              if (a.week_start !== b.week_start) {
                                return b.week_start.localeCompare(a.week_start);
                              }
                              return (b.created_at || '').localeCompare(a.created_at || '');
                            });
                            return { data: filtered, error: null };
                          },
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return { select: () => ({ data: [], error: null }) };
      },
    } as any;
  }

  // 1. Descripciones desde la versión activa del POA
  test('1. Se cargan las descripciones desde la versión activa del POA. Ninguna fila muestra el activity_key como descripción', async () => {
    const supabase = createMockSupabase();
    const data = await buildMonthlyScheduleReportData(supabase, {
      boardId,
      month: '2026-10',
      groupId: 'grp-plaza',
      version: 'full',
    });

    expect(data.poaVersionLabel).toBe('POA V.12');
    const plaza = data.sites[0];
    expect(plaza.activities.length).toBeGreaterThan(0);

    const act101 = plaza.activities.find((a) => a.activity_key === '1.01');
    expect(act101).toBeDefined();
    expect(act101?.description).toBe('LIMPIEZA GENERAL DE PLAYAS Y RETIRO DE RESIDUOS SOLIDOS, INCLUYE TRANSPORTE');
    expect(act101?.description).not.toBe('1.01');

    const html = renderMonthlyScheduleReportHtml(data);
    expect(html).toContain('LIMPIEZA GENERAL DE PLAYAS');
  });

  // 2. Paginación: 1.149 ítems simulados -> el informe suma los 1.149
  test('2. Paginación: 1.149 ítems simulados -> el informe suma los 1.149', async () => {
    const largePlanItems: any[] = [];
    for (let i = 1; i <= 1149; i++) {
      largePlanItems.push({
        id: `item-${i}`,
        plan_id: 'plan-w1-plaza',
        activity_key: '1.01',
        planned_date: '2026-10-05',
        planned_qty: 10,
        planned_jr: 1.0,
      });
    }

    const supabase = createMockSupabase({ planItems: largePlanItems });
    const data = await buildMonthlyScheduleReportData(supabase, {
      boardId,
      month: '2026-10',
      groupId: 'grp-plaza',
      version: 'full',
    });

    const plaza = data.sites[0];
    const act101 = plaza.activities.find((a) => a.activity_key === '1.01');
    expect(act101?.total_qty).toBe(11490);
    expect(act101?.total_jr).toBe(1149);
  });

  // 3. Error en consulta lanza SCHEDULE_REPORT_READ_FAILED y la ruta responde 500
  test('3. Una consulta con error lanza SCHEDULE_REPORT_READ_FAILED y la ruta responde 500', async () => {
    const supabase = createMockSupabase({
      plansError: { message: 'connection timeout in weekly_plans' },
    });

    await expect(
      buildMonthlyScheduleReportData(supabase, {
        boardId,
        month: '2026-10',
        groupId: 'grp-plaza',
        version: 'full',
      })
    ).rejects.toThrow('SCHEDULE_REPORT_READ_FAILED: weekly_plans: connection timeout in weekly_plans');
  });

  // 4. Semanas de borde: noviembre 2026 (semana 30-nov) y enero 2027 (plan 28-dic con días 1 y 2 de enero)
  test('4. Noviembre de 2026 incluye los ítems de la semana del 30-nov. Enero de 2027 incluye los ítems del 1 y 2 de enero que vienen del plan del 28-dic', async () => {
    // Caso Noviembre 2026
    const supabaseNov = createMockSupabase({
      plans: [
        { id: 'plan-nov-30', board_id: boardId, group_id: 'grp-plaza', week_start: '2026-11-30', status: 'published' },
      ],
      planItems: [
        { id: 'it-nov-1', plan_id: 'plan-nov-30', activity_key: '1.01', planned_date: '2026-11-30', planned_qty: 50, planned_jr: 5.0 },
      ],
    });

    const dataNov = await buildMonthlyScheduleReportData(supabaseNov, {
      boardId,
      month: '2026-11',
      groupId: 'grp-plaza',
      version: 'full',
    });
    expect(dataNov.sites[0].activities[0].total_qty).toBe(50);

    // Caso Enero 2027
    const supabaseJan = createMockSupabase({
      plans: [
        { id: 'plan-dec-28', board_id: boardId, group_id: 'grp-plaza', week_start: '2026-12-28', status: 'published' },
      ],
      planItems: [
        // Días de diciembre (deben ignorarse en reporte de enero)
        { id: 'it-dec-30', plan_id: 'plan-dec-28', activity_key: '1.01', planned_date: '2026-12-30', planned_qty: 40, planned_jr: 4.0 },
        // Días de enero (deben incluirse en reporte de enero)
        { id: 'it-jan-1', plan_id: 'plan-dec-28', activity_key: '1.01', planned_date: '2027-01-01', planned_qty: 40, planned_jr: 4.0 },
        { id: 'it-jan-2', plan_id: 'plan-dec-28', activity_key: '1.01', planned_date: '2027-01-02', planned_qty: 40, planned_jr: 4.0 },
      ],
    });

    const dataJan = await buildMonthlyScheduleReportData(supabaseJan, {
      boardId,
      month: '2027-01',
      groupId: 'grp-plaza',
      version: 'full',
    });
    expect(dataJan.sites[0].activities[0].total_qty).toBe(80);
  });

  // 5. Leyenda dinámica de días sin programar
  test('5. La leyenda de un mes sin días previos sin programar no contiene "Gris claro". La de octubre dice "del 1 al 3" y no contiene "28-sep" ni "anulada"', async () => {
    // Octubre con primer plan el 5 de octubre
    const supabaseOct = createMockSupabase();
    const dataOct = await buildMonthlyScheduleReportData(supabaseOct, {
      boardId,
      month: '2026-10',
      groupId: 'grp-plaza',
      version: 'full',
    });

    const htmlOct = renderMonthlyScheduleReportHtml(dataOct);
    expect(htmlOct).toContain('Gris claro: del 1 al 3 de octubre, días sin programación en Mantenix.');
    expect(htmlOct).not.toContain('28-sep');
    expect(htmlOct).not.toContain('anulada');

    // Mes donde el primer plan empieza el día 1 (ej: 2026-10-01)
    const supabaseOct1 = createMockSupabase({
      plans: [{ id: 'p-1', board_id: boardId, group_id: 'grp-plaza', week_start: '2026-10-01', status: 'published' }],
      planItems: [{ id: 'i-1', plan_id: 'p-1', activity_key: '1.01', planned_date: '2026-10-01', planned_qty: 10, planned_jr: 1.0 }],
    });
    const dataOct1 = await buildMonthlyScheduleReportData(supabaseOct1, {
      boardId,
      month: '2026-10',
      groupId: 'grp-plaza',
      version: 'full',
    });
    const htmlOct1 = renderMonthlyScheduleReportHtml(dataOct1);
    expect(htmlOct1).not.toContain('Gris claro:');
  });

  // 6. Diferenciación de carryover: sin evento vs lista vacía vs evento FAILED vs mes anterior (UI-CRON-02c C1 & C2)
  test('6a. Sin evento -> "Sin información de reprogramación". Evento con lista vacía -> "Ninguna"', async () => {
    // a) Sin evento
    const supabaseNoEv = createMockSupabase({ matEvents: [] });
    const dataNoEv = await buildMonthlyScheduleReportData(supabaseNoEv, {
      boardId,
      month: '2026-10',
      groupId: 'grp-plaza',
      version: 'full',
    });
    const htmlNoEv = renderMonthlyScheduleReportHtml(dataNoEv);
    expect(htmlNoEv).toContain('Sin información de reprogramación.');

    // b) Evento con lista vacía
    const supabaseEmptyEv = createMockSupabase({
      matEvents: [
        {
          id: 'me-empty',
          board_id: boardId,
          group_id: 'grp-plaza',
          week_start: '2026-10-26',
          status: 'SUCCESS',
          event_type: 'SITE_MATERIALIZATION_SUMMARY',
          created_at: '2026-10-02T10:00:00Z',
          payload: { carryover_next_month_projection: [] },
        },
      ],
    });
    const dataEmptyEv = await buildMonthlyScheduleReportData(supabaseEmptyEv, {
      boardId,
      month: '2026-10',
      groupId: 'grp-plaza',
      version: 'full',
    });
    const htmlEmptyEv = renderMonthlyScheduleReportHtml(dataEmptyEv);
    expect(htmlEmptyEv).toContain('Ninguna.');
  });

  test('6b. Hay un evento SUCCESS en 26-oct con 2 reprogramadas y otro FAILED más reciente en 26-oct sin el campo. El informe muestra las 2 (C1)', async () => {
    const supabase = createMockSupabase({
      matEvents: [
        // Evento FAILED más reciente (no debe borrar las reprogramadas válidas)
        {
          id: 'me-failed-recent',
          board_id: boardId,
          group_id: 'grp-plaza',
          week_start: '2026-10-26',
          status: 'FAILED',
          event_type: 'SITE_MATERIALIZATION_SUMMARY',
          created_at: '2026-10-02T12:00:00Z',
          payload: { error: 'MONTH_PROJECTION_READ_FAILED' },
        },
        // Evento anterior válido con 2 reprogramadas
        {
          id: 'me-success-older',
          board_id: boardId,
          group_id: 'grp-plaza',
          week_start: '2026-10-26',
          status: 'SUCCESS',
          event_type: 'SITE_MATERIALIZATION_SUMMARY',
          created_at: '2026-10-02T10:00:00Z',
          payload: {
            carryover_next_month_projection: [
              { activity_key: '1.01', qty: 30, jr: 3.0 },
              { activity_key: '3.02', qty: 50, jr: 5.0 },
            ],
          },
        },
      ],
    });

    const data = await buildMonthlyScheduleReportData(supabase, {
      boardId,
      month: '2026-10',
      groupId: 'grp-plaza',
      version: 'full',
    });

    const plaza = data.sites[0];
    expect(plaza.carryoverStatus).toBe('ITEMS');
    expect(plaza.carryoverItems.length).toBe(2);
    expect(plaza.carryoverItems.map((c) => c.activity_key)).toEqual(['1.01', '3.02']);

    const html = renderMonthlyScheduleReportHtml(data);
    expect(html).toContain('Pendiente por capacidad');
    expect(html).toContain('LIMPIEZA GENERAL DE PLAYAS');
    expect(html).toContain('CRISTALIZADO DE PISOS');
  });

  test('6c. Solo hay un evento FAILED -> "Sin información de reprogramación" (C1)', async () => {
    const supabase = createMockSupabase({
      matEvents: [
        {
          id: 'me-only-failed',
          board_id: boardId,
          group_id: 'grp-plaza',
          week_start: '2026-10-26',
          status: 'FAILED',
          event_type: 'SITE_MATERIALIZATION_SUMMARY',
          created_at: '2026-10-02T10:00:00Z',
          payload: { error: 'MONTH_PROJECTION_READ_FAILED' },
        },
      ],
    });

    const data = await buildMonthlyScheduleReportData(supabase, {
      boardId,
      month: '2026-10',
      groupId: 'grp-plaza',
      version: 'full',
    });

    const plaza = data.sites[0];
    expect(plaza.carryoverStatus).toBe('NO_DATA');
    expect(plaza.carryoverItems.length).toBe(0);

    const html = renderMonthlyScheduleReportHtml(data);
    expect(html).toContain('Sin información de reprogramación.');
  });

  test('6d. Solo hay evento en 28-sep con reprogramadas, y el informe es de octubre -> "Sin información de reprogramación" (C2)', async () => {
    const supabase = createMockSupabase({
      matEvents: [
        {
          id: 'me-sep-28',
          board_id: boardId,
          group_id: 'grp-plaza',
          week_start: '2026-09-28', // Semana del mes anterior
          status: 'SUCCESS',
          event_type: 'SITE_MATERIALIZATION_SUMMARY',
          created_at: '2026-09-25T10:00:00Z',
          payload: {
            carryover_next_month_projection: [
              { activity_key: '1.01', qty: 99, jr: 9.9 },
            ],
          },
        },
      ],
    });

    const data = await buildMonthlyScheduleReportData(supabase, {
      boardId,
      month: '2026-10',
      groupId: 'grp-plaza',
      version: 'full',
    });

    const plaza = data.sites[0];
    expect(plaza.carryoverStatus).toBe('NO_DATA');
    expect(plaza.carryoverItems.length).toBe(0);

    const html = renderMonthlyScheduleReportHtml(data);
    expect(html).toContain('Sin información de reprogramación.');
  });

  // 7. Estilos @font-face de IBM Plex
  test('7. El HTML contiene la regla @font-face de IBM Plex', async () => {
    const supabase = createMockSupabase();
    const data = await buildMonthlyScheduleReportData(supabase, {
      boardId,
      month: '2026-10',
      groupId: 'grp-plaza',
      version: 'external',
    });
    const html = renderMonthlyScheduleReportHtml(data);
    expect(html).toContain('@font-face');
    expect(html).toContain('IBM Plex Sans');
    expect(html).toContain('IBM Plex Mono');
  });

  // 8. Versión externa estricta: sin jornales, cantidades ni totales
  test('8. Versión externa: HTML no contiene cantidades ni menciones de "jr" o "Jornal", solo marcas limpias', async () => {
    const supabase = createMockSupabase();
    const data = await buildMonthlyScheduleReportData(supabase, {
      boardId,
      month: '2026-10',
      groupId: 'grp-plaza',
      version: 'external',
    });

    const html = renderMonthlyScheduleReportHtml(data);
    expect(html).toContain('<span class="mk"></span>');
    expect(html).not.toContain('<span class="q">');
    expect(html).not.toContain('<span class="j">');
    expect(html).not.toContain('Cant. programada');
    expect(html).not.toContain('Jornales mes');

    // Regla estricta: Prohibición de "jr" o "jornal"
    expect(html).not.toMatch(/\bjr\b/i);
    expect(html).not.toMatch(/\bjornal(es)?\b/i);
  });

  // 9. "Todos los sitios": orden alfabético y exclusión de Punta Astilleros
  test('9. "Todos los sitios": incluye Mercado y Plaza en orden alfabético y excluye Punta Astilleros', async () => {
    const supabase = createMockSupabase();
    const data = await buildMonthlyScheduleReportData(supabase, {
      boardId,
      month: '2026-10',
      groupId: 'ALL',
      version: 'full',
    });

    expect(data.sites.length).toBe(2);
    expect(data.sites[0].siteName).toBe('Mercado');
    expect(data.sites[1].siteName).toBe('Plaza');
    expect(data.sites.some((s) => s.siteName === 'Punta Astilleros')).toBe(false);
  });

  // 10. Seguridad y validaciones en la ruta POST
  test('10. POST /api/reports/schedule-month valida month regex, auth 401 y membresía 403', async () => {
    // a) Month inválido
    const reqInvalidMonth = new Request('http://localhost/api/reports/schedule-month', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        boardId,
        month: '2026-13', // Mes inválido
        groupId: 'grp-plaza',
        version: 'external',
      }),
    });
    const resInvalidMonth = await POST(reqInvalidMonth as any);
    expect(resInvalidMonth.status).toBe(400);

    // b) No autenticado -> 401
    mockUser = null;
    mockBoardMemberResult = null;
    const reqUnauth = new Request('http://localhost/api/reports/schedule-month', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        boardId,
        month: '2026-10',
        groupId: 'grp-plaza',
        version: 'external',
      }),
    });
    const resUnauth = await POST(reqUnauth as any);
    expect(resUnauth.status).toBe(401);

    // c) Autenticado pero no miembro -> 403
    mockUser = { id: 'user-intruder' };
    mockBoardMemberResult = null;
    const reqForbidden = new Request('http://localhost/api/reports/schedule-month', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        boardId,
        month: '2026-10',
        groupId: 'grp-plaza',
        version: 'external',
      }),
    });
    const resForbidden = await POST(reqForbidden as any);
    expect(resForbidden.status).toBe(403);
  });

  // 11. Helpers de formato
  test('11. Helpers de formato numérico, recorte y visitas cumplen especificación', () => {
    expect(formatColombianNumber(17200)).toBe('17.200');
    expect(formatColombianNumber(12.5, 1)).toBe('12,5');
    expect(formatColombianNumber(0.37, 2)).toBe('0,37');

    expect(formatCellQuantity(17200)).toBe('17,2k');
    expect(formatCellQuantity(60)).toBe('60,0');

    expect(formatVisitsPerMonth(0.33)).toBe('1/3');
    expect(formatVisitsPerMonth(0.5)).toBe('1/2');
    expect(formatVisitsPerMonth(25)).toBe('25');

    expect(shortenDescription('LIMPIEZA Y DESHIERBE DE PLAYAS, INCLUYE TRANSPORTE')).toBe('LIMPIEZA Y DESHIERBE DE PLAYAS');
    expect(shortenDescription('ACTIVIDAD CORTO')).toBe('ACTIVIDAD CORTO');
  });

  // UI-CRON-03: Pruebas específicas
  // 12. HTML completo: no contiene "Límite diario" ni "límite jornales", ni el valor de jornales_dia del mock
  test('12. UI-CRON-03: HTML completo no contiene "Límite diario" ni "límite jornales" ni el valor de jornales_dia. Sí contiene "Uso del límite"', async () => {
    const supabase = createMockSupabase();
    const data = await buildMonthlyScheduleReportData(supabase, {
      boardId,
      month: '2026-10',
      groupId: 'grp-plaza',
      version: 'full',
    });

    const html = renderMonthlyScheduleReportHtml(data);
    expect(html).not.toContain('Límite diario');
    expect(html).not.toContain('límite jornales');
    // Plaza tiene jornales_dia = 7.0
    expect(html).not.toContain('7,00 jr');
    expect(html).not.toContain('7,0 jr');
    // Sí debe contener Uso del límite
    expect(html).toContain('Uso del límite');
    expect(html).toContain('días hábiles programados');
    expect(html).toContain('jornales programados (personal)');
    expect(html).toContain('uso de capacidad del mes');
  });

  // 13. HTML externo y completo contienen data URIs y no contienen localhost ni http://
  test('13. UI-CRON-03b: HTML externo y completo contienen data URIs base64 embebidos (JPEG/SVG) y no contienen localhost ni http://', async () => {
    const supabase = createMockSupabase();
    const dataExt = await buildMonthlyScheduleReportData(supabase, {
      boardId,
      month: '2026-10',
      groupId: 'grp-plaza',
      version: 'external',
    });
    const htmlExt = renderMonthlyScheduleReportHtml(dataExt);
    expect(htmlExt).toContain('data:image/jpeg;base64,');
    expect(htmlExt).toContain('data:image/svg+xml;base64,');
    expect(htmlExt).not.toContain('localhost');
    expect(htmlExt).not.toContain('http://');
    expect(htmlExt).toContain('CONSORCIO CONSERVACIÓN COSTERA');

    const dataFull = await buildMonthlyScheduleReportData(supabase, {
      boardId,
      month: '2026-10',
      groupId: 'grp-plaza',
      version: 'full',
    });
    const htmlFull = renderMonthlyScheduleReportHtml(dataFull);
    expect(htmlFull).toContain('data:image/jpeg;base64,');
    expect(htmlFull).toContain('data:image/svg+xml;base64,');
    expect(htmlFull).not.toContain('localhost');
    expect(htmlFull).not.toContain('http://');
    expect(htmlFull).toContain('CONSORCIO CONSERVACIÓN COSTERA');
  });

  // 14. Plantillas de acta y acta certificada no contienen localhost
  test('14. UI-CRON-03b: Plantillas de acta y acta certificada no contienen localhost y usan el logo embebido (JPEG)', () => {
    const dummyActa = {
      id: 'acta-1',
      name: 'Acta de Pago 01',
      numero: 1,
      date: '2026-10-15',
      issued_at: '2026-10-15T12:00:00Z',
      items: [],
    };

    const dummyTotals = {
      subtotal: 1000000,
      administracion: 200000,
      imprevistos: 50000,
      utilidad: 50000,
      total_pagar: 1300000,
    };

    const actaHtml = generateActaReportHtml(dummyActa, []);
    expect(actaHtml).not.toContain('localhost');
    expect(actaHtml).toContain('data:image/jpeg;base64,');

    const certHtml = generateCertifiedActaReportHtml(dummyActa as any, dummyTotals);
    expect(certHtml).not.toContain('localhost');
    expect(certHtml).toContain('data:image/jpeg;base64,');
  });

  // 15. CONSORCIO_LOGO_DATA_URI decodificado tiene firma JPEG (FF D8 FF)
  test('15. UI-CRON-03b: CONSORCIO_LOGO_DATA_URI decodificado tiene la firma JPEG (FF D8 FF)', () => {
    expect(CONSORCIO_LOGO_DATA_URI).toMatch(/^data:image\/jpeg;base64,/);
    const base64Data = CONSORCIO_LOGO_DATA_URI.replace(/^data:image\/jpeg;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const signature = buffer.slice(0, 3);

    expect(signature[0]).toBe(0xff);
    expect(signature[1]).toBe(0xd8);
    expect(signature[2]).toBe(0xff);
  });

  // 16. CONSORCIO_LOGO_DATA_URI decodificado es idéntico byte a byte al archivo public/logo-consorcio-hd.png
  test('16. UI-CRON-03b: el base64 decodificado de CONSORCIO_LOGO_DATA_URI es idéntico byte a byte a public/logo-consorcio-hd.png', () => {
    const base64Data = CONSORCIO_LOGO_DATA_URI.replace(/^data:image\/jpeg;base64,/, '');
    const bufferFromUri = Buffer.from(base64Data, 'base64');
    const originalFileBuffer = fs.readFileSync(path.resolve(process.cwd(), 'public/logo-consorcio-hd.png'));

    expect(bufferFromUri.equals(originalFileBuffer)).toBe(true);
  });
});

