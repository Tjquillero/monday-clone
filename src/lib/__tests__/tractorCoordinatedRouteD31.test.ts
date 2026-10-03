/**
 * Test Suite: GATE FREQ-OP-06 — Decisión D31: Un solo tractor coordinado entre playas
 *
 * Pruebas obligatorias:
 * 1. Octubre 2026 (semanas 05, 12, 19, 26): 6 sitios, 1 unidad por día, Country y Sabanilla 2 comparten fecha.
 * 2. Semana 12-oct (festivo lunes, semana par): 5 días hábiles, 5 visitas, 0 déficit.
 * 3. Noviembre 2026 (semana 02-nov, festivo lunes, semana impar): 6 visitas -> se quita 2da visita del par, déficit reportado.
 * 4. Determinismo: entrada en distinto orden produce el mismo resultado exacto.
 * 5. Paquete (1.10, 1.11, 1.12, 1.13, 1.14): caen en tractorDays[0]. Cantidad de visitas inalterada.
 * 6. 1.15 con tractorDays de 2 fechas: exactamente 2 ítems en esas fechas.
 * 7. Sitio sin 1.15: no regresión (salida idéntica con o sin tractorDays).
 * 8. Error leyendo operational_frequencies para la ruta -> evento FAILED en etapa tractor_route_read.
 */

if (typeof (globalThis as any).jest === 'undefined' && typeof (globalThis as any).vi !== 'undefined') {
  (globalThis as any).jest = (globalThis as any).vi;
}
const vi = (globalThis as any).vi || (globalThis as any).jest;

import {
  computeTractorRouteForWeek,
  generateRoutineScheduleForWeek,
  TractorUnit,
  RoutineBaseTemplate,
} from '../routineScheduler';
import { ensureWeeklyPlanMaterialized } from '../scheduleMaterializationService';
import { syncWeeklyPlanForBoard } from '../weeklyPlanService';

vi.mock('../weeklyPlanService', () => ({
  __esModule: true,
  syncWeeklyPlanForBoard: vi.fn().mockResolvedValue({ success: true, count: 1 }),
}));

describe('GATE FREQ-OP-06 — Decisión D31: Un solo tractor coordinado entre playas', () => {
  // Configuración canónica de los 6 sitios de D31
  const SITE_MANGLARES = 'g_manglares';
  const SITE_MIRAMAR = 'g_miramar';
  const SITE_PUERTO_COLOMBIA = 'g_puerto_colombia';
  const SITE_SALINAS = 'g_salinas';
  const SITE_COUNTRY = 'g_country';
  const SITE_SABANILLA2 = 'g_sabanilla2';

  const defaultUnits: TractorUnit[] = [
    { unitKey: SITE_MANGLARES, groupIds: [SITE_MANGLARES], visitsPerMonth: 4, groupTitles: ['MANGLARES'] },
    { unitKey: SITE_MIRAMAR, groupIds: [SITE_MIRAMAR], visitsPerMonth: 4, groupTitles: ['MIRAMAR SECTOR EL FARO'] },
    { unitKey: SITE_PUERTO_COLOMBIA, groupIds: [SITE_PUERTO_COLOMBIA], visitsPerMonth: 4, groupTitles: ['PLAZA PUERTO COLOMBIA'] },
    { unitKey: SITE_SALINAS, groupIds: [SITE_SALINAS], visitsPerMonth: 4, groupTitles: ['SALINAS DEL REY'] },
    {
      unitKey: `${SITE_COUNTRY}::${SITE_SABANILLA2}`,
      groupIds: [SITE_COUNTRY, SITE_SABANILLA2],
      visitsPerMonth: 6,
      groupTitles: ['PLAYA DEL COUNTRY', 'PLAYA DE SABANILLA 2'],
      isPair: true,
    },
  ];

  // Helper para imprimir tabla de ruta
  function formatRouteTable(weekStart: string, result: ReturnType<typeof computeTractorRouteForWeek>, units: TractorUnit[]) {
    const titleByGroup = new Map<string, string>();
    for (const u of units) {
      for (let i = 0; i < u.groupIds.length; i++) {
        titleByGroup.set(u.groupIds[i], (u.groupTitles && u.groupTitles[i]) || u.groupIds[i]);
      }
    }
    const daysMap = new Map<string, string[]>();
    for (const [gId, days] of result.daysByGroup.entries()) {
      for (const d of days) {
        const list = daysMap.get(d) || [];
        list.push(titleByGroup.get(gId) || gId);
        daysMap.set(d, list);
      }
    }
    const sortedDates = Array.from(daysMap.keys()).sort();
    return sortedDates.map(d => ({ fecha: d, sitios: (daysMap.get(d) || []).join(' + ') }));
  }

  // ---------------------------------------------------------------------------
  // 1. Octubre 2026, semanas 05, 12, 19 y 26
  // ---------------------------------------------------------------------------
  test('1. Octubre 2026 (semanas 05, 12, 19, 26): 1 unidad por día, Country y Sabanilla 2 comparten fecha, 4/semana tienen 1 fecha', () => {
    const octoberWeeks = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'];
    const printedRoutes: Record<string, any[]> = {};

    for (const weekStart of octoberWeeks) {
      const result = computeTractorRouteForWeek(defaultUnits, weekStart);
      const routeTable = formatRouteTable(weekStart, result, defaultUnits);
      printedRoutes[weekStart] = routeTable;

      // Country y Sabanilla 2 tienen exactamente las mismas fechas
      const countryDays = result.daysByGroup.get(SITE_COUNTRY) ?? [];
      const sabanillaDays = result.daysByGroup.get(SITE_SABANILLA2) ?? [];
      expect(countryDays).toEqual(sabanillaDays);

      // Cada sitio con frecuencia 4 tiene al menos / exactamente 1 fecha (salvo que haya déficit)
      expect(result.daysByGroup.get(SITE_MANGLARES)?.length).toBe(1);
      expect(result.daysByGroup.get(SITE_MIRAMAR)?.length).toBe(1);
      expect(result.daysByGroup.get(SITE_PUERTO_COLOMBIA)?.length).toBe(1);
      expect(result.daysByGroup.get(SITE_SALINAS)?.length).toBe(1);

      // En ninguna fecha hay más de una unidad (o sea, si hay 2 sitios es porque son Country + Sabanilla2)
      const unitsPerDay = new Map<string, Set<string>>();
      for (const [gId, days] of result.daysByGroup.entries()) {
        const u = defaultUnits.find(unit => unit.groupIds.includes(gId))!;
        for (const d of days) {
          if (!unitsPerDay.has(d)) unitsPerDay.set(d, new Set());
          unitsPerDay.get(d)!.add(u.unitKey);
        }
      }
      for (const [day, unitSet] of unitsPerDay.entries()) {
        expect(unitSet.size).toBe(1); // Máximo 1 unidad por día
      }
    }

    // Imprimir ruta de Octubre en consola / resultado
    console.log('=== RUTA DEL TRACTOR — OCTUBRE 2026 ===');
    for (const weekStart of octoberWeeks) {
      console.log(`Semana ${weekStart}:`);
      console.table(printedRoutes[weekStart]);
    }
  });

  // ---------------------------------------------------------------------------
  // 2. Semana 12-oct (festivo lunes, 5 días hábiles, semana par)
  // ---------------------------------------------------------------------------
  test('2. Semana 12-oct (festivo lunes 12-oct, semana par): 5 días hábiles, 5 visitas requeridas, 0 déficit', () => {
    const weekStart = '2026-10-12';
    const result = computeTractorRouteForWeek(defaultUnits, weekStart);

    // 4 unidades simples (1 visita c/u) + 1 unidad par (1 visita en semana par) = 5 visitas
    expect(result.deficits).toHaveLength(0);

    const countryDays = result.daysByGroup.get(SITE_COUNTRY) ?? [];
    expect(countryDays).toHaveLength(1);

    // Días asignados son exactamente 5 días hábiles (martes a sábado)
    const allAssignedDays = new Set<string>();
    for (const days of result.daysByGroup.values()) {
      for (const d of days) allAssignedDays.add(d);
    }
    expect(allAssignedDays.size).toBe(5);
    expect(allAssignedDays.has('2026-10-12')).toBe(false); // Lunes 12 es festivo
  });

  // ---------------------------------------------------------------------------
  // 3. Noviembre 2026, semana 02 (festivo lunes 2-nov, semana impar)
  // ---------------------------------------------------------------------------
  test('3. Noviembre 2026, semana 02-nov (festivo lunes 2-nov, semana impar): par requiere 2 visitas, hay 5 días para 6 visitas -> déficit en par', () => {
    const weekStart = '2026-11-02';
    const result = computeTractorRouteForWeek(defaultUnits, weekStart);

    // Tabla de ruta impresa
    const routeTable = formatRouteTable(weekStart, result, defaultUnits);
    console.log('=== RUTA DEL TRACTOR — SEMANA 02-NOV-2026 ===');
    console.table(routeTable);

    // 6 visitas requeridas (4 de freq 4 + 2 del par en semana impar) en 5 días hábiles
    // Se quita la 2da visita del par
    expect(result.deficits).toHaveLength(1);
    expect(result.deficits[0].missingVisits).toBe(1);
    expect(result.deficits[0].unitKey).toBe(`${SITE_COUNTRY}::${SITE_SABANILLA2}`);

    // El par quedó con 1 sola visita
    const countryDays = result.daysByGroup.get(SITE_COUNTRY) ?? [];
    expect(countryDays).toHaveLength(1);

    // Cada unidad simple tiene su visita
    expect(result.daysByGroup.get(SITE_MANGLARES)).toHaveLength(1);
    expect(result.daysByGroup.get(SITE_MIRAMAR)).toHaveLength(1);
    expect(result.daysByGroup.get(SITE_PUERTO_COLOMBIA)).toHaveLength(1);
    expect(result.daysByGroup.get(SITE_SALINAS)).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // 4. Determinismo: orden de entrada no altera el resultado
  // ---------------------------------------------------------------------------
  test('4. Determinismo: calcular la ruta dos veces y con distinto orden de entrada da el mismo resultado', () => {
    const weekStart = '2026-10-05';
    const result1 = computeTractorRouteForWeek(defaultUnits, weekStart);

    // Reordenar las unidades inversamente
    const reversedUnits = [...defaultUnits].reverse();
    const result2 = computeTractorRouteForWeek(reversedUnits, weekStart);

    expect(Array.from(result1.daysByGroup.entries()).sort()).toEqual(
      Array.from(result2.daysByGroup.entries()).sort()
    );
    expect(result1.deficits).toEqual(result2.deficits);
  });

  // ---------------------------------------------------------------------------
  // 5. Paquete (1.10, 1.11, 1.12, 1.13, 1.14): ubicadas en tractorDays[0]
  // ---------------------------------------------------------------------------
  test('5. Paquete: 1.10, 1.11, 1.12, 1.14 (freq 4) y 1.13 (D30) quedan en tractorDays[0], total visitas inalterado', () => {
    const weekStart = '2026-10-05'; // Lunes 5 de Octubre 2026
    const tractorDays = ['2026-10-07']; // Miércoles 7

    const templates: RoutineBaseTemplate[] = [
      { id: 't_115', activity_key: '1.15', name: 'Tractor', zone: 'Playa', unit: 'M2', rendimiento: 10000, frecuencia: 4, cantidad: 10000 },
      { id: 't_110', activity_key: '1.10', name: 'Recolección', zone: 'Playa', unit: 'M2', rendimiento: 500, frecuencia: 4, cantidad: 500 },
      { id: 't_111', activity_key: '1.11', name: 'Rastrillado', zone: 'Playa', unit: 'M2', rendimiento: 500, frecuencia: 4, cantidad: 500 },
      { id: 't_112', activity_key: '1.12', name: 'Cribado', zone: 'Playa', unit: 'M2', rendimiento: 500, frecuencia: 4, cantidad: 500 },
      { id: 't_113', activity_key: '1.13', name: 'Oxigenación', zone: 'Playa', unit: 'M2', rendimiento: 500, frecuencia: 1, cantidad: 500 },
      { id: 't_114', activity_key: '1.14', name: 'Nivelación', zone: 'Playa', unit: 'M2', rendimiento: 500, frecuencia: 4, cantidad: 500 },
    ];

    // Proyección con tractorDays
    const projection = generateRoutineScheduleForWeek(templates, weekStart, [], {
      tractorDays,
    });

    // 1.15 debe estar exactamente en tractorDays[0]
    const items115 = projection.assignments.filter(a => a.activity_key === '1.15');
    expect(items115).toHaveLength(1);
    expect(items115[0].dateStr).toBe('2026-10-07');

    // Las actividades de frecuencia 4 del paquete deben estar en 2026-10-07
    for (const key of ['1.10', '1.11', '1.12', '1.14']) {
      const items = projection.assignments.filter(a => a.activity_key === key);
      expect(items).toHaveLength(1);
      expect(items[0].dateStr).toBe('2026-10-07');
    }

    // Proyección sin tractorDays para comparar total de visitas
    const baseProjection = generateRoutineScheduleForWeek(templates, weekStart, []);

    expect(projection.assignments.length).toBe(baseProjection.assignments.length);
  });

  // ---------------------------------------------------------------------------
  // 6. 1.15 con tractorDays de 2 fechas
  // ---------------------------------------------------------------------------
  test('6. 1.15 con tractorDays de 2 fechas: exactamente 2 ítems de 1.15 en esas fechas', () => {
    const weekStart = '2026-10-05';
    const tractorDays = ['2026-10-06', '2026-10-08']; // Martes y Jueves

    const templates: RoutineBaseTemplate[] = [
      { id: 't_115', activity_key: '1.15', name: 'Tractor', zone: 'Playa', unit: 'M2', rendimiento: 10000, frecuencia: 8, cantidad: 20000 },
      { id: 't_110', activity_key: '1.10', name: 'Recolección', zone: 'Playa', unit: 'M2', rendimiento: 500, frecuencia: 4, cantidad: 500 },
    ];

    const projection = generateRoutineScheduleForWeek(templates, weekStart, [], {
      tractorDays,
    });

    const items115 = projection.assignments.filter(a => a.activity_key === '1.15');
    expect(items115).toHaveLength(2);
    expect(items115.map(a => a.dateStr).sort()).toEqual(['2026-10-06', '2026-10-08']);

    // El paquete se ubica en tractorDays[0] (2026-10-06)
    const items110 = projection.assignments.filter(a => a.activity_key === '1.10');
    expect(items110).toHaveLength(1);
    expect(items110[0].dateStr).toBe('2026-10-06');
  });

  // ---------------------------------------------------------------------------
  // 7. Sitio sin 1.15 produce exactamente la misma salida (no regresión)
  // ---------------------------------------------------------------------------
  test('7. Sitio sin 1.15: salida idéntica con o sin tractorDays definido', () => {
    const weekStart = '2026-10-05';
    const templates: RoutineBaseTemplate[] = [
      { id: 't_101', activity_key: '1.01', name: 'Limpieza', zone: 'Parque', unit: 'M2', rendimiento: 1000, frecuencia: 25, cantidad: 5000 },
      { id: 't_201', activity_key: '2.01', name: 'Poda', zone: 'Parque', unit: 'M2', rendimiento: 500, frecuencia: 4, cantidad: 2000 },
    ];

    const resWithout = generateRoutineScheduleForWeek(templates, weekStart, []);
    const resWith = generateRoutineScheduleForWeek(templates, weekStart, [], { tractorDays: undefined });

    expect(resWith.assignments).toEqual(resWithout.assignments);
    expect(resWith.totalJournals).toEqual(resWithout.totalJournals);
  });

  // ---------------------------------------------------------------------------
  // 8. Error leyendo operational_frequencies para la ruta -> FAILED en tractor_route_read
  // ---------------------------------------------------------------------------
  test('8. Error leyendo operational_frequencies para la ruta -> evento FAILED en tractor_route_read sin escrituras', async () => {
    function createMockQuery(data: any = null, error: any = null) {
      const obj: any = {};
      obj.select = vi.fn(() => obj);
      obj.eq = vi.fn(() => obj);
      obj.is = vi.fn(() => obj);
      obj.in = vi.fn(() => obj);
      obj.order = vi.fn(() => obj);
      obj.limit = vi.fn(() => obj);
      obj.maybeSingle = vi.fn().mockResolvedValue({ data, error });
      obj.single = vi.fn().mockResolvedValue({ data, error });
      obj.then = (resolve: any) => Promise.resolve({ data, count: Array.isArray(data) ? data.length : 0, error }).then(resolve);
      return obj;
    }

    const loggedEvents: any[] = [];
    let syncRpcCalled = false;

    const mockSupabase: any = {
      from: vi.fn((table: string) => {
        if (table === 'operational_frequencies') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((field1: string, val1: any) => ({
                eq: vi.fn((field2: string, val2: any) => {
                  if (field2 === 'activity_key' && val2 === '1.15') {
                    return createMockQuery(null, { message: 'Database query timeout reading 1.15 frequencies' });
                  }
                  return createMockQuery([
                    { id: 'opf_1', board_id: 'b1', group_id: 'g1', activity_key: '1.15', visits_per_month: 4, source: 'CRONOGRAMA' },
                  ]);
                }),
              })),
            })),
          };
        }
        if (table === 'groups') {
          return createMockQuery([{ id: 'g1', title: 'MANGLARES' }]);
        }
        if (table === 'poa') {
          return createMockQuery([{ id: 'poa_1', board_id: 'b1' }]);
        }
        if (table === 'poa_versions') {
          return createMockQuery([{ id: 'poa_v1', poa_id: 'poa_1', status: 'active' }]);
        }
        if (table === 'poa_activities') {
          return createMockQuery([{ id: 'pa_1', poa_version_id: 'poa_v1', activity_key: '1.15', frecuencia: 4 }]);
        }
        if (table === 'poa_activity_zones') {
          return createMockQuery([{ id: 'paz_1', poa_activity_id: 'pa_1', zone_id: 'g1', cantidad_contratada: 5000 }]);
        }
        if (table === 'board_activity_standards') {
          return createMockQuery([{ id: 'std_1', activity_key: '1.15', name: 'Tractor', unit: 'M2', rendimiento: 10000, requiere_rendimiento: true }]);
        }
        if (table === 'weekly_plan_items') {
          return createMockQuery([]);
        }
        if (table === 'weekly_plans') {
          return createMockQuery(null);
        }
        return createMockQuery([]);
      }),
      rpc: vi.fn((rpcName: string, params: any) => {
        if (rpcName === 'log_materialization_event_rpc') {
          loggedEvents.push(params);
          return Promise.resolve({ data: 'evt_1', error: null });
        }
        if (rpcName === 'sync_weekly_plan_items_rpc') {
          syncRpcCalled = true;
          return Promise.resolve({ data: [], error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    };

    await expect(ensureWeeklyPlanMaterialized(mockSupabase, 'b1', 'g1', '2026-10-05')).rejects.toThrow(
      'TRACTOR_ROUTE_READ_FAILED'
    );

    // No debe haber llamadas al RPC de sincronización / escrituras
    expect(syncRpcCalled).toBe(false);

    // Evento FAILED registrado con etapa tractor_route_read
    const failedEvent = loggedEvents.find(e => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY');
    expect(failedEvent).toBeDefined();
    expect(failedEvent.p_status).toBe('FAILED');
    expect(failedEvent.p_payload.error.stage).toBe('tractor_route_read');
    expect(failedEvent.p_payload.error.code).toBe('TRACTOR_ROUTE_READ_FAILED');
  });

  // ---------------------------------------------------------------------------
  // FREQ-OP-06b: Pruebas de no pérdida de visitas en paquete y días festivos
  // ---------------------------------------------------------------------------
  describe('FREQ-OP-06b — Correcciones C1 y C2', () => {
    // 1. Con tractorDays = [martes], 1.10 con frecuencia 8 tiene 2 visitas (M-J) y aparece en tractor_package_not_aligned
    test('C1.1: 1.10 con frecuencia 8 tiene 2 visitas (M-J) y aparece en tractor_package_not_aligned', () => {
      const weekStart = '2026-10-05'; // Lunes 5 de Octubre 2026
      const tractorDays = ['2026-10-06']; // Martes

      const templates: RoutineBaseTemplate[] = [
        { id: 't_110', activity_key: '1.10', name: 'Recolección', zone: 'Playa', unit: 'M2', rendimiento: 500, frecuencia: 8, cantidad: 1000 },
      ];

      const projection = generateRoutineScheduleForWeek(templates, weekStart, [], { tractorDays });

      const items110 = projection.assignments.filter(a => a.activity_key === '1.10');
      expect(items110).toHaveLength(2);
      expect(items110.map(a => a.dateStr).sort()).toEqual(['2026-10-06', '2026-10-08']); // Martes y Jueves
      expect(projection.tractor_package_not_aligned).toContain('1.10');
    });

    // 2. 1.12 con frecuencia 6: semana impar 2 visitas, semana par 1 visita en tractorDays[0]
    test('C1.2: 1.12 con frecuencia 6: 2 visitas en semana impar, 1 visita en tractorDays[0] en semana par', () => {
      const template6: RoutineBaseTemplate = {
        id: 't_112',
        activity_key: '1.12',
        name: 'Cribado',
        zone: 'Playa',
        unit: 'M2',
        rendimiento: 500,
        frecuencia: 6,
        cantidad: 1000,
      };

      // Semana 1 (impar: 2026-10-05)
      const projOdd = generateRoutineScheduleForWeek([template6], '2026-10-05', [], {
        tractorDays: ['2026-10-07'],
      });
      const itemsOdd = projOdd.assignments.filter(a => a.activity_key === '1.12');
      expect(itemsOdd).toHaveLength(2);
      expect(itemsOdd.map(a => a.dateStr).sort()).toEqual(['2026-10-06', '2026-10-08']);
      expect(projOdd.tractor_package_not_aligned).toContain('1.12');

      // Semana 2 (par: 2026-10-12)
      const projEven = generateRoutineScheduleForWeek([template6], '2026-10-12', [], {
        tractorDays: ['2026-10-14'],
      });
      const itemsEven = projEven.assignments.filter(a => a.activity_key === '1.12');
      expect(itemsEven).toHaveLength(1);
      expect(itemsEven[0].dateStr).toBe('2026-10-14');
      expect(projEven.tractor_package_not_aligned).toBeUndefined();
    });

    // 3. 1.11 con frecuencia 4 tiene 1 visita en tractorDays[0]
    test('C1.3: 1.11 con frecuencia 4 tiene 1 visita en tractorDays[0]', () => {
      const template4: RoutineBaseTemplate = {
        id: 't_111',
        activity_key: '1.11',
        name: 'Rastrillado',
        zone: 'Playa',
        unit: 'M2',
        rendimiento: 500,
        frecuencia: 4,
        cantidad: 1000,
      };

      const projection = generateRoutineScheduleForWeek([template4], '2026-10-05', [], {
        tractorDays: ['2026-10-07'],
      });
      const items = projection.assignments.filter(a => a.activity_key === '1.11');
      expect(items).toHaveLength(1);
      expect(items[0].dateStr).toBe('2026-10-07');
    });

    // 4. Para todas las actividades del paquete con freq 4, 6 y 8: total visitas con tractorDays === sin tractorDays
    test('C1.4: Todas las actividades del paquete (freq 4, 6, 8) en semanas par e impar conservan su número de visitas', () => {
      const packageKeys = ['1.10', '1.11', '1.12', '1.13', '1.14'];
      const weeks = ['2026-10-05', '2026-10-12']; // impar, par
      const frequencies = [4, 6, 8];

      for (const weekStart of weeks) {
        for (const freq of frequencies) {
          const templates: RoutineBaseTemplate[] = packageKeys.map((k, idx) => ({
            id: `t_${idx}`,
            activity_key: k,
            name: `Actividad ${k}`,
            zone: 'Playa',
            unit: 'M2',
            rendimiento: 500,
            frecuencia: freq,
            cantidad: 1000,
          }));

          const withTractor = generateRoutineScheduleForWeek(templates, weekStart, [], {
            tractorDays: ['2026-10-07'],
          });
          const withoutTractor = generateRoutineScheduleForWeek(templates, weekStart, []);

          expect(withTractor.assignments.length).toBe(withoutTractor.assignments.length);

          for (const k of packageKeys) {
            const countWith = withTractor.assignments.filter(a => a.activity_key === k).length;
            const countWithout = withoutTractor.assignments.filter(a => a.activity_key === k).length;
            expect(countWith).toBe(countWithout);
          }
        }
      }
    });

    // 5. Con tractorDays apuntando a un festivo, la 1.10 con frecuencia 4 sigue teniendo 1 visita en otro día
    test('C2.1: Con tractorDays en festivo, 1.10 freq 4 se programa en otro día hábil (0 pérdidas)', () => {
      // 2026-10-12 es festivo lunes en Colombia
      const weekStart = '2026-10-12';
      const tractorDays = ['2026-10-12']; // Día festivo no hábil

      const template4: RoutineBaseTemplate = {
        id: 't_110',
        activity_key: '1.10',
        name: 'Recolección',
        zone: 'Playa',
        unit: 'M2',
        rendimiento: 500,
        frecuencia: 4,
        cantidad: 1000,
      };

      const projection = generateRoutineScheduleForWeek([template4], weekStart, [], { tractorDays });
      const items = projection.assignments.filter(a => a.activity_key === '1.10');

      expect(items).toHaveLength(1);
      expect(items[0].dateStr).not.toBe('2026-10-12'); // No cae en el festivo
      // Debe caer en un día hábil de esa semana (martes 13 a sábado 17)
      expect(['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17']).toContain(items[0].dateStr);
    });
  });
});
