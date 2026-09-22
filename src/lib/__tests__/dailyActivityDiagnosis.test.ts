import { OPERATIONAL_STANDARDS_CATALOG_V3 } from '../operationalStandards';
import { generateRoutineScheduleForWeek } from '../routineScheduler';
import { ensureWeeklyPlanMaterialized } from '../scheduleMaterializationService';
import { computeSiteSummaries } from '@/components/actividades/SiteListView';
import { PublishedWeekPlan } from '@/hooks/useWeeklyPlans';

describe('DIAGNÓSTICO COMPLETO: Trazabilidad de Actividades Diarias (Frecuencia = 1)', () => {
  it('Etapa 1 & 2: Identificación de actividades diarias en catálogo', () => {
    const dailyStandards = OPERATIONAL_STANDARDS_CATALOG_V3.filter(
      (s) => Number(s.frecuencia) === 1
    );
    console.log('[DIAGNÓSTICO ETAPA 1 & 2] Actividades con frecuencia === 1 (Diaria):', dailyStandards.map(s => ({
      site_key: s.site_key,
      activity_key: s.activity_key,
      name: s.name,
      frecuencia: s.frecuencia
    })));
    expect(dailyStandards.length).toBeGreaterThan(0);
  });

  it('Etapa 3: Generación de ocurrencias en Scheduler para la semana 2026-09-21', () => {
    const templates = OPERATIONAL_STANDARDS_CATALOG_V3.map((std) => ({
      id: std.id,
      activity_key: std.activity_key,
      name: std.name,
      zone: std.category,
      unit: std.unit,
      rendimiento: std.rendimiento,
      frecuencia: std.frecuencia,
      cantidad: 1000,
    }));

    const projection = generateRoutineScheduleForWeek(templates, '2026-09-21', []);
    const dailyAssignments = projection.assignments.filter((a) => a.frequency_interval === 1);

    console.log(`[DIAGNÓSTICO ETAPA 3] Asignaciones diarias generadas por el scheduler (${dailyAssignments.length}):`);
    const dateMap = new Map<string, number>();
    dailyAssignments.forEach((a) => {
      const count = dateMap.get(a.dateStr) || 0;
      dateMap.set(a.dateStr, count + 1);
    });
    console.log('  Conteo de asignaciones diarias por fecha en la semana:', Object.fromEntries(dateMap));

    expect(dailyAssignments.length).toBeGreaterThan(0);
  });

  it('Etapa 4, 5, 6 & 7: Trazabilidad en DTOs de WeeklyPlan e Integración con UI', async () => {
    const mockWeeklyPlanStore: any[] = [];
    const mockItemsStore: any[] = [];

    const createChainableQuery = (dataToReturn: any) => {
      const query: any = {
        eq: () => query,
        is: () => query,
        in: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: () => Promise.resolve({ data: dataToReturn }),
        single: () => Promise.resolve({ data: dataToReturn }),
        select: () => query,
        then: (resolve: any) => resolve({ data: dataToReturn, error: null }),
      };
      return query;
    };

    const mockSupabase: any = {
      from: (table: string) => {
        if (table === 'poas') {
          return createChainableQuery([{ id: 'poa-1', board_id: 'board-1' }]);
        }
        if (table === 'poa_versions') {
          return createChainableQuery({ id: 'ver-1' });
        }
        if (table === 'poa_activities') {
          return createChainableQuery([
            { id: 'pa-1', activity_key: 'limpieza_zonas_duras', frecuencia: 1 },
            { id: 'pa-2', activity_key: 'limpieza_marmol', frecuencia: 1 },
            { id: 'pa-3', activity_key: 'poda_arboles', frecuencia: 75 },
          ]);
        }
        if (table === 'board_activity_standards') {
          return createChainableQuery([
            { id: 'std-1', board_id: 'board-1', activity_key: 'limpieza_zonas_duras', name: 'Limpieza General zonas duras', category: 'ZONA DURA', unit: 'm2/día', rendimiento: 10000, frecuencia: 1, requiere_rendimiento: true },
            { id: 'std-2', board_id: 'board-1', activity_key: 'limpieza_marmol', name: 'Limpieza general mármol', category: 'ZONA DURA', unit: 'm2/día', rendimiento: 600, frecuencia: 1, requiere_rendimiento: true },
            { id: 'std-3', board_id: 'board-1', activity_key: 'poda_arboles', name: 'Poda Arboles y Palmas', category: 'ZONA VERDE', unit: 'Und/día', rendimiento: 200, frecuencia: 75, requiere_rendimiento: true },
          ]);
        }
        if (table === 'activity_scope_mappings') {
          return createChainableQuery([
            { activity_key: 'limpieza_zonas_duras', scope_key: 'zona_dura' },
            { activity_key: 'limpieza_marmol', scope_key: 'limpieza_marmol' },
            { activity_key: 'poda_arboles', scope_key: 'arboles' },
          ]);
        }
        if (table === 'resource_analysis') {
          return createChainableQuery({
            scope_data: {
              zona_dura: 5000,
              limpieza_marmol: 300,
              arboles: 50,
            },
          });
        }
        if (table === 'weekly_plans') {
          const q: any = {
            eq: () => q,
            is: () => q,
            maybeSingle: () => Promise.resolve({ data: mockWeeklyPlanStore[0] || null }),
            insert: (planInput: any) => {
              const created = { id: `plan-${Date.now()}`, ...planInput };
              mockWeeklyPlanStore.push(created);
              return createChainableQuery(created);
            },
            select: () => q,
          };
          return q;
        }
        if (table === 'weekly_plan_items') {
          const q: any = {
            eq: () => Promise.resolve({ data: mockItemsStore }),
            insert: (itemsInput: any) => {
              const arr = Array.isArray(itemsInput) ? itemsInput : [itemsInput];
              const createdArr = arr.map((i, idx) => ({ id: `item-${Date.now()}-${idx}`, ...i }));
              mockItemsStore.push(...createdArr);
              return Promise.resolve({ data: createdArr, error: null });
            },
            select: () => q,
          };
          return q;
        }
        return createChainableQuery([]);
      },
      rpc: () => Promise.resolve({ data: null, error: new Error('RPC disabled') }),
    };

    const res = await ensureWeeklyPlanMaterialized(mockSupabase, 'board-1', 'group-plaza', '2026-09-21');
    console.log('[DIAGNÓSTICO ETAPA 4] Resultado de ensureWeeklyPlanMaterialized:', {
      totalItems: res.totalItems,
      insertedCount: res.insertedCount,
    });

    console.log('[DIAGNÓSTICO ETAPA 4] Items guardados en mockItemsStore:', mockItemsStore.map(i => ({
      activity_key: i.activity_key,
      planned_date: i.planned_date,
      planned_frecuencia: i.planned_frecuencia,
      occurrence_key: i.occurrence_key
    })));

    // Probar ETAPA 5 & 6: Construcción de PublishedWeekPlan DTO
    const mockPublishedPlan: PublishedWeekPlan = {
      id: res.weeklyPlan.id,
      board_id: 'board-1',
      group_id: 'group-plaza',
      week_start: '2026-09-21',
      period_number: 1,
      status: 'published',
      published_by: null,
      published_at: null,
      confirmed_by: null,
      confirmed_at: null,
      closed_by: null,
      closed_at: null,
      created_by: 'user-1',
      updated_by: null,
      created_at: '2026-09-21T00:00:00Z',
      updated_at: '2026-09-21T00:00:00Z',
      group: { title: 'PLAZA PUERTO COLOMBIA', color: '#3B7EF8' },
      board: { name: 'Tablero Principal' },
      items: mockItemsStore,
    };

    // ETAPA 7: Cómputo de resúmenes de sitios para SiteListView y ActividadesView
    const summaries = computeSiteSummaries([mockPublishedPlan]);
    console.log('[DIAGNÓSTICO ETAPA 7] Resumen del sitio generado en SiteListView:', {
      siteName: summaries[0]?.siteName,
      totalCount: summaries[0]?.totalCount,
      pendingCount: summaries[0]?.pendingCount,
    });

    const dailyItemsInPlan = mockPublishedPlan.items.filter((i) => i.activity_key === 'limpieza_zonas_duras' || i.activity_key === 'limpieza_marmol');
    console.log('[DIAGNÓSTICO FINAL] Ocurrencias diarias en DTO entregado a /my-work:', dailyItemsInPlan.map(i => ({
      key: i.activity_key,
      planned_date: i.planned_date,
      status: (i as any).status
    })));

    expect(dailyItemsInPlan.length).toBe(12); // 6 días x 2 actividades diarias = 12 ocurrencias
  });
});
