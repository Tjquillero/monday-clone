import { generateRoutineScheduleForWeek, type RoutineBaseTemplate } from '../routineScheduler';
import { syncWeeklyPlanForBoard } from '../weeklyPlanService';
import { computeOccurrenceKey } from '../../types/weeklyPlan';

describe('Corrección Gobernada de Frecuencias Contractuales v1.0 — Test Suite', () => {
  const weekStart = '2026-09-21';
  const planId = 'plan-test-freq-001';
  const boardId = '3ea0326f-6ff7-409f-848a-1f296e6e3cc8';
  const siteId = 'site-plaza-puerto-colombia';

  it('1. Demostración RoutineScheduler: frecuencia = 4 proyecta exactamente 1 ocurrencia semanal (Lunes)', () => {
    const templates: RoutineBaseTemplate[] = [
      {
        id: 'std-109',
        activity_key: '1.09',
        name: 'Limpieza manual de playa',
        zone: 'Zona de Playa',
        unit: 'M²',
        rendimiento: 5000,
        frecuencia: 4, // Canonicalizada (1x/semana)
        cantidad: 5000,
      },
      {
        id: 'std-110',
        activity_key: '1.10',
        name: 'Trasiego con maquinaria',
        zone: 'Zona de Playa',
        unit: 'M²',
        rendimiento: 3000,
        frecuencia: 4, // Canonicalizada (1x/semana)
        cantidad: 3000,
      },
      {
        id: 'std-111',
        activity_key: '1.11',
        name: 'Oxigenación mecánica de arena',
        zone: 'Zona de Playa',
        unit: 'M²',
        rendimiento: 4000,
        frecuencia: 4, // Canonicalizada (1x/semana)
        cantidad: 4000,
      },
    ];

    const projection = generateRoutineScheduleForWeek(templates, weekStart);

    // 3 actividades x 1 ocurrencia/semana = 3 ocurrencias totales por semana por sitio
    expect(projection.assignments.length).toBe(3);
    const days = projection.assignments.map((p) => p.dayOfWeek);
    expect(days).toEqual([1, 1, 1]); // Todas asignadas al día 1 (Lunes)
  });

  it('2. Comparativa Cuantitativa de Materialización: 18 slots/sitio (errónea) vs 3 slots/sitio (canónica)', () => {
    // Escenario Erróneo (frecuencia = 1 en poa_activities)
    const templatesErroneos: RoutineBaseTemplate[] = [
      { id: '1', activity_key: '1.09', name: 'A1.09', zone: 'Z', unit: 'M²', rendimiento: 1, frecuencia: 1, cantidad: 100 },
      { id: '2', activity_key: '1.10', name: 'A1.10', zone: 'Z', unit: 'M²', rendimiento: 1, frecuencia: 1, cantidad: 100 },
      { id: '3', activity_key: '1.11', name: 'A1.11', zone: 'Z', unit: 'M²', rendimiento: 1, frecuencia: 1, cantidad: 100 },
    ];
    const projErronea = generateRoutineScheduleForWeek(templatesErroneos, weekStart);
    expect(projErronea.assignments.length).toBe(18); // 3 x 6 = 18 slots por sitio/semana

    // Escenario Canónico Corregido (frecuencia = 4 en poa_activities)
    const templatesCanonicos: RoutineBaseTemplate[] = [
      { id: '1', activity_key: '1.09', name: 'A1.09', zone: 'Z', unit: 'M²', rendimiento: 1, frecuencia: 4, cantidad: 100 },
      { id: '2', activity_key: '1.10', name: 'A1.10', zone: 'Z', unit: 'M²', rendimiento: 1, frecuencia: 4, cantidad: 100 },
      { id: '3', activity_key: '1.11', name: 'A1.11', zone: 'Z', unit: 'M²', rendimiento: 1, frecuencia: 4, cantidad: 100 },
    ];
    const projCanonica = generateRoutineScheduleForWeek(templatesCanonicos, weekStart);
    expect(projCanonica.assignments.length).toBe(3); // 3 x 1 = 3 slots por sitio/semana

    const reduccionPorSitio = projErronea.assignments.length - projCanonica.assignments.length;
    expect(reduccionPorSitio).toBe(15); // 15 slots eliminables por sitio por semana

    const total10Sitios = reduccionPorSitio * 10;
    expect(total10Sitios).toBe(150); // 150 slots eliminables en todo el contrato por semana
  });

  it('3. Demostración de Reconciliación e Invariantes en mock de DB: Preservación de completed, in_progress, override y executed_qty > 0', async () => {
    const templatesCanonicos: RoutineBaseTemplate[] = [
      { id: 'std-109', activity_key: '1.09', name: 'A1.09', zone: 'Z', unit: 'M²', rendimiento: 5000, frecuencia: 4, cantidad: 5000 },
    ];
    const newProjection = generateRoutineScheduleForWeek(templatesCanonicos, weekStart);
    const monDate = newProjection.assignments[0].dateStr;

    const monKey = computeOccurrenceKey(boardId, siteId, '1.09', '1.09', monDate);
    const tueKey = computeOccurrenceKey(boardId, siteId, '1.09', '1.09', '2026-09-22');
    const wedKey = computeOccurrenceKey(boardId, siteId, '1.09', '1.09', '2026-09-23');
    const thuKey = computeOccurrenceKey(boardId, siteId, '1.09', '1.09', '2026-09-24');
    const friKey = computeOccurrenceKey(boardId, siteId, '1.09', '1.09', '2026-09-25');

    // Mock DB Store
    const mockPlanItems = [
      // Ocurrencia del Lunes que coincide con la nueva proyección y se mantiene/actualiza
      {
        id: 'item-mon-109',
        plan_id: planId,
        activity_key: '1.09',
        occurrence_key: monKey,
        status: 'planned',
        is_manual_override: false,
        executed_qty: 0,
        planned_qty: 100,
        theoretical_jr: 0.2,
      },
      // Ocurrencia del Martes que está PROTEGIDA porque ya se completó
      {
        id: 'item-tue-109-completed',
        plan_id: planId,
        activity_key: '1.09',
        occurrence_key: tueKey,
        status: 'completed',
        is_manual_override: false,
        executed_qty: 50,
        planned_qty: 100,
        theoretical_jr: 0.2,
      },
      // Ocurrencia del Miércoles que está PROTEGIDA por in_progress
      {
        id: 'item-wed-109-inprogress',
        plan_id: planId,
        activity_key: '1.09',
        occurrence_key: wedKey,
        status: 'in_progress',
        is_manual_override: false,
        executed_qty: 20,
        planned_qty: 100,
        theoretical_jr: 0.2,
      },
      // Ocurrencia del Jueves que está PROTEGIDA por manual_override
      {
        id: 'item-thu-109-override',
        plan_id: planId,
        activity_key: '1.09',
        occurrence_key: thuKey,
        status: 'planned',
        is_manual_override: true,
        executed_qty: 0,
        planned_qty: 100,
        theoretical_jr: 0.2,
      },
      // Ocurrencia del Viernes sobrante (planned, no override, 0 executed) -> DEBE CANCELARSE
      {
        id: 'item-fri-109-obsolete',
        plan_id: planId,
        activity_key: '1.09',
        occurrence_key: friKey,
        status: 'planned',
        is_manual_override: false,
        executed_qty: 0,
        planned_qty: 100,
        theoretical_jr: 0.2,
      },
    ];

    const dbStore = new Map(mockPlanItems.map((it) => [it.id, { ...it }]));

    const createChainableQuery = (data: any) => {
      const builder: any = {
        eq: () => builder,
        is: () => builder,
        maybeSingle: async () => ({ data, error: null }),
        select: () => builder,
      };
      return builder;
    };

    const mockSupabase: any = {
      from: (table: string) => {
        if (table === 'weekly_plans') {
          return createChainableQuery({
            id: planId,
            board_id: boardId,
            group_id: siteId,
            week_start_date: weekStart,
            week_start: weekStart,
            week_end: '2026-09-27',
          });
        }
        if (table === 'weekly_plan_items') {
          return {
            select: (cols: string, opts?: any) => {
              const isHeadCount = opts?.count === 'exact' && opts?.head;
              return {
                eq: (col: string, val: string) => {
                  const list = Array.from(dbStore.values()).filter((i) => (i as any)[col] === val);
                  if (isHeadCount) {
                    return Promise.resolve({ count: list.length, data: null, error: null });
                  }
                  return Promise.resolve({ data: list, error: null });
                },
              };
            },
            update: (payload: any) => ({
              eq: (col: string, val: string) => {
                const item = dbStore.get(val);
                if (item) {
                  Object.assign(item, payload);
                  dbStore.set(val, item);
                }
                return Promise.resolve({ error: null });
              },
            }),
            insert: async (items: any[]) => {
              for (const it of items) dbStore.set(it.id || `item-${Math.random()}`, it);
              return { error: null };
            },
          };
        }
        if (table === 'poa_activity_zones') {
          return createChainableQuery({ id: 'zone-1' });
        }
        return createChainableQuery(null);
      },
    };

    const initialProtected = mockPlanItems.filter(
      (i) => i.status === 'completed' || i.status === 'in_progress' || i.is_manual_override
    );
    expect(initialProtected.length).toBe(3);

    // Ejecutar reconciliación
    const result = await syncWeeklyPlanForBoard(
      mockSupabase,
      boardId,
      siteId,
      weekStart,
      newProjection
    );

    // Invariante 1: Ocurrencia obsoleta del Viernes fue cancelada
    const friItem = dbStore.get('item-fri-109-obsolete');
    expect(friItem?.status).toBe('cancelled');

    // Invariante 2: Ocurrencias protegidas PERMANECEN INTACTAS
    const completedItem = dbStore.get('item-tue-109-completed');
    expect(completedItem?.status).toBe('completed');
    expect(completedItem?.executed_qty).toBe(50);

    const inProgressItem = dbStore.get('item-wed-109-inprogress');
    expect(inProgressItem?.status).toBe('in_progress');
    expect(inProgressItem?.executed_qty).toBe(20);

    const overrideItem = dbStore.get('item-thu-109-override');
    expect(overrideItem?.status).toBe('planned');
    expect(overrideItem?.is_manual_override).toBe(true);

    // Invariante 3: PROTECTED_BEFORE === PROTECTED_AFTER
    const finalProtected = Array.from(dbStore.values()).filter(
      (i) => i.status === 'completed' || i.status === 'in_progress' || i.is_manual_override
    );
    expect(finalProtected.length).toBe(3);
    expect(result.cancelledCount).toBe(1);
  });
});
