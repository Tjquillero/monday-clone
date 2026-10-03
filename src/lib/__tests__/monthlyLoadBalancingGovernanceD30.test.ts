/**
 * Test Suite: GATE FREQ-OP-05 — Decisión D30
 * Reparto mensual por holgura, sin pasar el límite diario, y arrastre al mes siguiente.
 */

import {
  generateRoutineScheduleForWeek,
  projectMonthlyLowFrequencyAllocation,
  getMonthlyCandidateWeeks,
  RoutineBaseTemplate,
} from '../routineScheduler';
import {
  ensureWeeklyPlanMaterialized,
  CARRYOVER_START_MONTH,
} from '../scheduleMaterializationService';

describe('GATE FREQ-OP-05 — Decisión D30', () => {
  // 1. Una semana de 5 días con festivo y otra de 6 días con la misma carga diaria:
  // la visita grande va a la semana de mayor holgura, no a la de menor total.
  test('1. Semana de 5 días con festivo vs 6 días: visita va a la semana de mayor holgura, no de menor carga total', () => {
    // Octubre 2026:
    // Sem 1: 2026-10-05 (6 días) -> Fija (plan existente)
    // Sem 2: 2026-10-12 (5 días, festivo 12-oct) -> Cap = 8.32 * 5 = 41.6. Carga diaria 6 JR -> Base load = 30 JR. Holgura = 11.6 JR.
    // Sem 3: 2026-10-19 (6 días) -> Cap = 8.32 * 6 = 49.92. Carga diaria 6 JR -> Base load = 36 JR. Holgura = 13.92 JR.
    // Sem 4: 2026-10-26 (6 días) -> Cap = 8.32 * 6 = 49.92. Carga diaria 7 JR -> Base load = 42 JR. Holgura = 7.92 JR.
    // Aunque Sem 2 tiene menor baseLoad (30 < 36), Sem 3 tiene mayor holgura (13.92 > 11.6).

    const siteDailyCapacity = 8.32;

    const templates: RoutineBaseTemplate[] = [
      // Actividad diaria recurrente (frecuencia 25) de 6 JR/día
      {
        id: 't-1',
        activity_key: '1.01',
        name: 'BARRIDO DIARIO',
        zone: 'ZONA 1',
        unit: 'M2',
        cantidad: 60,
        rendimiento: 10, // 6 JR/día
        frecuencia: 25,
        counts_capacity: true,
      },
      // Actividad de freq 1 con 10 JR (cantidad 10, rendimiento 1)
      {
        id: 't-2',
        activity_key: '3.02',
        name: 'CRISTALIZADO DE PISOS DE MARMOL',
        zone: 'ZONA 1',
        unit: 'M2',
        cantidad: 10,
        rendimiento: 1, // 10 JR
        frecuencia: 1,
        counts_capacity: true,
      },
    ];

    // Semana 1 fija (ya ejecutada/planificada)
    const existingMonthPlans = [
      {
        week_start: '2026-10-05',
        items: [
          { activity_key: '1.01', planned_jr: 36, counts_capacity: true },
        ],
      },
    ];

    const allocation = projectMonthlyLowFrequencyAllocation(templates, '2026-10-05', {
      siteDailyCapacity,
      existingMonthPlans,
    });

    // La visita de 10 JR debe ir a la semana del 19-oct (Sem 3, mayor holgura 13.92), NO al 12-oct (Sem 2, menor carga 30)
    const w12Items = allocation.get('2026-10-12') || [];
    const w19Items = allocation.get('2026-10-19') || [];

    expect(w12Items.find((i) => i.activity_key === '3.02')).toBeUndefined();
    expect(w19Items.find((i) => i.activity_key === '3.02')).toBeDefined();
    expect(w19Items.find((i) => i.activity_key === '3.02')?.cantidad).toBe(10);
  });

  // 2. Visita freq 1 de 17,15 jr con holguras [fija, 7, 12, 12]:
  // se divide en fragmentos; la suma de cantidades es igual a la cantidad original; ninguna semana excede.
  test('2. Visita freq 1 de 17.15 JR se divide entre semanas de mayor holgura; suma de cantidades = original y no excede', () => {
    const siteDailyCapacity = 8;
    // Semanas:
    // Sem 1: 2026-10-05 -> Fija (plan existente con actividades)
    // Sem 2: 2026-10-12 (5 días, cap 40) -> base load 33 (6.6 JR/día) -> holgura 7
    // Sem 3: 2026-10-19 (6 días, cap 48) -> base load 36 (6 JR/día) -> holgura 12
    // Sem 4: 2026-10-26 (6 días, cap 48) -> base load 36 (6 JR/día) -> holgura 12

    const templates: RoutineBaseTemplate[] = [
      // Actividad diaria recurrente (frecuencia 25) de 6 JR/día -> en sem 2 (5 días) da 30 JR (+3 de otra = 33)
      {
        id: 't-3',
        activity_key: '1.01',
        name: 'BARRIDO DIARIO',
        zone: 'ZONA 1',
        unit: 'M2',
        cantidad: 60,
        rendimiento: 10, // 6 JR/día
        frecuencia: 25,
        counts_capacity: true,
      },
      // Visita freq 1 de 17.15 JR
      {
        id: 't-4',
        activity_key: '3.02',
        name: 'CRISTALIZADO DE PISOS DE MARMOL',
        zone: 'ZONA 1',
        unit: 'M2',
        cantidad: 171.5,
        rendimiento: 10, // 171.5 / 10 = 17.15 JR
        frecuencia: 1,
        counts_capacity: true,
      },
    ];

    // Sem 1 es fija
    const existingMonthPlans = [
      {
        week_start: '2026-10-05',
        items: [{ activity_key: '1.01', planned_jr: 48, counts_capacity: true }],
      },
    ];

    const allocation = projectMonthlyLowFrequencyAllocation(templates, '2026-10-05', {
      siteDailyCapacity,
      existingMonthPlans,
    });

    const w19 = allocation.get('2026-10-19') || [];
    const w26 = allocation.get('2026-10-26') || [];
    const w12 = allocation.get('2026-10-12') || [];

    const fragW19 = w19.find((i) => i.activity_key === '3.02');
    const fragW26 = w26.find((i) => i.activity_key === '3.02');
    const fragW12 = w12.find((i) => i.activity_key === '3.02');

    expect(fragW19).toBeDefined();
    expect(fragW26).toBeDefined();
    expect(fragW12).toBeUndefined(); // Cabía entre Sem 3 (12 JR) y Sem 4 (12 JR)

    // Holgura en Sem 3 era 12 JR -> recibe 12 JR * 10 m2/JR = 120 M2
    // Resto 5.15 JR va a Sem 4 -> recibe 5.15 JR * 10 m2/JR = 51.5 M2
    expect(fragW19?.cantidad).toBe(120);
    expect(fragW26?.cantidad).toBe(51.5);

    const totalQty = (fragW19?.cantidad || 0) + (fragW26?.cantidad || 0);
    expect(totalQty).toBe(171.5);
  });

  // 3. Visita que no cabe en el mes: el resto aparece en carryover_next_month y ningún día queda sobre el límite.
  test('3. Visita que no cabe en el mes: resto pasa a carryover_next_month y ningún día queda sobre el límite', () => {
    const siteDailyCapacity = 5; // Semanas de 6 días = 30 JR máx, semana de 5 días = 25 JR máx
    // Supongamos que actividades diarias consumen casi toda la capacidad:
    // Actividad diaria de 4.5 JR/día:
    // Sem 2 (5 días, cap 25): base load = 22.5 JR -> holgura = 2.5 JR (25 M2)
    // Sem 3 (6 días, cap 30): base load = 27.0 JR -> holgura = 3.0 JR (30 M2)
    // Sem 4 (6 días, cap 30): base load = 27.0 JR -> holgura = 3.0 JR (30 M2)
    // Total holgura en el mes = 2.5 + 3.0 + 3.0 = 8.5 JR (85 M2)
    // Visita requiere 20 JR (cantidad 200, rendimiento 10)
    const templates: RoutineBaseTemplate[] = [
      {
        id: 't-5',
        activity_key: '1.01',
        name: 'BARRIDO DIARIO',
        zone: 'ZONA 1',
        unit: 'M2',
        cantidad: 45,
        rendimiento: 10, // 4.5 JR/día
        frecuencia: 25,
        counts_capacity: true,
      },
      {
        id: 't-6',
        activity_key: '3.02',
        name: 'MARMOL',
        zone: 'ZONA 1',
        unit: 'M2',
        cantidad: 200,
        rendimiento: 10,
        frecuencia: 1,
        counts_capacity: true,
      },
    ];

    const existingMonthPlans = [
      {
        week_start: '2026-10-05',
        items: [{ activity_key: '1.01', planned_jr: 30, counts_capacity: true }],
      },
    ];

    const projection = generateRoutineScheduleForWeek(templates, '2026-10-19', [], {
      siteDailyCapacity,
      existingMonthPlans,
    });

    // Total asignado en el mes = 8.5 JR = 85 M2
    // Resto que no cabe = 11.5 JR = 115 M2
    expect(projection.carryoverNextMonth).toBeDefined();
    const carryItem = projection.carryoverNextMonth?.find((c) => c.activity_key === '3.02');
    expect(carryItem).toBeDefined();
    expect(carryItem?.qty).toBe(115);
    expect(carryItem?.jr).toBe(11.5);
    expect(carryItem?.reason).toBe('CAPACITY');

    // En la semana del 19-oct se asignaron 30 M2 = 3 JR de mármol + 27 JR diarias
    // Verificamos que ningún día supere la capacidad diaria (5 JR)
    const dailyTotals: Record<string, number> = {};
    for (const a of projection.assignments) {
      if (a.counts_capacity) {
        dailyTotals[a.dateStr] = (dailyTotals[a.dateStr] || 0) + a.theoretical_jr;
      }
    }
    for (const [date, tot] of Object.entries(dailyTotals)) {
      expect(tot).toBeLessThanOrEqual(siteDailyCapacity + 0.005);
    }
  });

  // 4. Recurrentes que exceden: se marca RECURRENT_EXCEEDS_CAPACITY y no se mueven al arrastre.
  test('4. Recurrentes que exceden: se reportan en recurrentExceedsCapacity y NO se mueven a carryoverNextMonth', () => {
    const siteDailyCapacity = 0.98; // Límite diario bajo (Mercado)
    const templates: RoutineBaseTemplate[] = [
      {
        id: 't-7',
        activity_key: '1.01',
        name: 'BARRIDO DIARIO',
        zone: 'ZONA 1',
        unit: 'M2',
        cantidad: 15,
        rendimiento: 10, // 1.5 JR/día > 0.98 cap
        frecuencia: 25,
        counts_capacity: true,
      },
    ];

    const projection = generateRoutineScheduleForWeek(templates, '2026-10-19', [], {
      siteDailyCapacity,
    });

    // No debe haber carryover_next_month para actividades recurrentes
    expect(projection.carryoverNextMonth?.length).toBe(0);

    // Debe existir recurrentExceedsCapacity reportando los días con déficit
    expect(projection.recurrentExceedsCapacity).toBeDefined();
    expect(projection.recurrentExceedsCapacity!.length).toBeGreaterThan(0);
    for (const rec of projection.recurrentExceedsCapacity!) {
      expect(rec.deficit_jr).toBeCloseTo(1.5 - 0.98, 2);
    }
  });

  // 5. Arrastre de entrada: en M el pendiente se reparte primero; con fuente incompleta falla con CARRYOVER_SOURCE_INCOMPLETE.
  test('5. Arrastre de entrada: fuente incompleta falla con CARRYOVER_SOURCE_INCOMPLETE; cuando está completo se prioriza', async () => {
    // Test A: Fuente incompleta en Noviembre 2026 (falta semana 4 de octubre)
    const mockSupabaseIncomplete: any = {
      from: (table: string) => {
        if (table === 'poa') {
          return { select: () => ({ eq: () => ({ data: [{ id: 'poa-1' }], error: null }) }) };
        }
        if (table === 'poa_versions') {
          return { select: () => ({ in: () => ({ eq: () => ({ data: [{ id: 'v-1', poa_id: 'poa-1' }], error: null }) }) }) };
        }
        if (table === 'poa_activities') {
          return { select: () => ({ eq: () => ({ order: () => ({ data: [{ id: 'pa-1', activity_key: '3.02' }], error: null }) }) }) };
        }
        if (table === 'board_activity_standards') {
          return { select: () => ({ eq: () => ({ data: [{ id: 'std-1', activity_key: '3.02', name: 'MARMOL', category: 'PISOS', rendimiento: 10, unit: 'M2', requiere_rendimiento: true }], error: null }) }) };
        }
        if (table === 'poa_activity_zones') {
          return { select: () => ({ eq: () => ({ in: () => ({ order: () => ({ data: [{ id: 'paz-1', poa_activity_id: 'pa-1', zone_id: 'group-1', cantidad_contratada: 100 }], error: null }) }) }) }) };
        }
        if (table === 'operational_frequencies') {
          return { select: () => ({ eq: () => ({ eq: () => ({ data: [{ activity_key: '3.02', visits_per_month: 1, counts_capacity: true }], error: null }) }) }) };
        }
        if (table === 'site_daily_capacity') {
          return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => ({ data: { jornales_dia: 8 }, error: null }) }) }) }) };
        }
        if (table === 'weekly_plans') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  in: (col: string, val: string[]) => {
                    // Si consultan semanas de octubre (M-1), solo devolvemos 3 de 4 semanas
                    return {
                      data: [
                        { id: 'plan-1', week_start: '2026-10-05', status: 'published' },
                        { id: 'plan-2', week_start: '2026-10-12', status: 'published' },
                        { id: 'plan-3', week_start: '2026-10-19', status: 'published' },
                        // Falta '2026-10-26'
                      ],
                      error: null,
                    };
                  },
                  maybeSingle: () => ({ data: null, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'materialization_events') {
          return { insert: () => ({ error: null }) };
        }
        return { select: () => ({ eq: () => ({ data: [], error: null }) }) };
      },
      rpc: (fn: string) => {
        if (fn === 'persist_materialization_event_p3') return Promise.resolve({ data: 'ok', error: null });
        return Promise.resolve({ data: 'ok', error: null });
      },
    };

    // Intentar materializar 2026-11-02 con octubre incompleto debe fallar
    await expect(
      ensureWeeklyPlanMaterialized(mockSupabaseIncomplete, 'board-1', 'group-1', new Date('2026-11-02T00:00:00Z'))
    ).rejects.toThrow('CARRYOVER_SOURCE_INCOMPLETE');

    // Test B: Prioridad de carryover_in en proyección mensual
    const templates: RoutineBaseTemplate[] = [
      {
        id: 't-8',
        activity_key: '3.02',
        name: 'MARMOL REGULAR DEL MES',
        zone: 'ZONA 1',
        unit: 'M2',
        cantidad: 50,
        rendimiento: 10, // 5 JR
        frecuencia: 1,
        counts_capacity: true,
      },
    ];

    const carryoverIn = [
      {
        activity_key: '3.02',
        qty: 30, // 3 JR pendiente de octubre
        jr: 3,
      },
    ];

    const allocation = projectMonthlyLowFrequencyAllocation(templates, '2026-11-02', {
      siteDailyCapacity: 5,
      carryoverIn,
    });

    // El primer item de arrastre (30 cant = 3 JR) debe ser asignado en la semana de mayor holgura antes que la regular
    const allAllocatedItems: RoutineBaseTemplate[] = [];
    for (const [, items] of allocation.entries()) {
      allAllocatedItems.push(...items);
    }
    expect(allAllocatedItems.length).toBeGreaterThan(0);
    expect(allAllocatedItems[0].cantidad).toBe(30); // Arrastre asignado primero
  });

  // 6. Mes 2026-10: sin arrastre de entrada.
  test('6. Mes 2026-10: CARRYOVER_START_MONTH es 2026-11, por lo que Octubre 2026 no calcula arrastre de entrada', () => {
    expect(CARRYOVER_START_MONTH).toBe('2026-11');
    const octCandidateWeeks = getMonthlyCandidateWeeks(new Date('2026-10-05T00:00:00Z'));
    expect(octCandidateWeeks.length).toBe(4);
  });

  // 7. Determinismo: dos ejecuciones con la misma entrada dan el mismo resultado.
  test('7. Determinismo: dos ejecuciones con la misma entrada generan exactamente la misma asignación y arrastre', () => {
    const templates: RoutineBaseTemplate[] = [
      {
        id: 't-9',
        activity_key: '3.02',
        name: 'CRISTALIZADO',
        zone: 'ZONA 1',
        unit: 'M2',
        cantidad: 150,
        rendimiento: 10,
        frecuencia: 1,
        counts_capacity: true,
      },
      {
        id: 't-10',
        activity_key: '2.05',
        name: 'LIMPIEZA DE VIDRIOS',
        zone: 'ZONA 1',
        unit: 'M2',
        cantidad: 80,
        rendimiento: 20,
        frecuencia: 2,
        counts_capacity: true,
      },
    ];

    const options = {
      siteDailyCapacity: 6,
      existingMonthPlans: [
        {
          week_start: '2026-10-05',
          items: [{ activity_key: '1.01', planned_jr: 30, counts_capacity: true }],
        },
      ],
    };

    const run1 = generateRoutineScheduleForWeek(templates, '2026-10-12', [], options);
    const run2 = generateRoutineScheduleForWeek(templates, '2026-10-12', [], options);

    expect(JSON.stringify(run1.assignments)).toBe(JSON.stringify(run2.assignments));
    expect(JSON.stringify(run1.carryoverNextMonth)).toBe(JSON.stringify(run2.carryoverNextMonth));
    expect(run1.totalJournals).toBe(run2.totalJournals);
  });

  // 8. Maquinaria: no fragmenta, no arrastra, no cuenta en la carga.
  test('8. Maquinaria (counts_capacity = false): no fragmenta, no arrastra, no cuenta en la carga', () => {
    const siteDailyCapacity = 2; // Límite muy bajo
    const templates: RoutineBaseTemplate[] = [
      {
        id: 't-11',
        activity_key: '1.11',
        name: 'HIDROLAVADO CON MAQUINA',
        zone: 'ZONA 1',
        unit: 'M2',
        cantidad: 50,
        rendimiento: 5, // 10 JR (mucho mayor que cap diaria 2)
        frecuencia: 4, // 1 visita por semana
        counts_capacity: false, // Maquinaria
      },
    ];

    const projection = generateRoutineScheduleForWeek(templates, '2026-10-19', [], {
      siteDailyCapacity,
    });

    // 1 sola asignación de 50 M2 (no fragmentada)
    const machineAssigns = projection.assignments.filter((a) => a.activity_key === '1.11');
    expect(machineAssigns.length).toBe(1);
    expect(machineAssigns[0].cantidad).toBe(50);
    expect(machineAssigns[0].counts_capacity).toBe(false);

    // No genera carryover
    expect(projection.carryoverNextMonth?.length).toBe(0);

    // No genera recurrentExceedsCapacity por maquinaria
    expect(projection.recurrentExceedsCapacity).toBeUndefined();
  });

  // 9. B1: Prueba secuencial obligatoria (Semana 1 fija -> Materializar Sem 2 -> Proyectar Sem 3)
  test('9. B1: Secuencia de materialización no pierde fragmentos de actividades de baja frecuencia', () => {
    const siteDailyCapacity = 8;
    // Octubre 2026:
    // Sem 1: 2026-10-05 (6 días) -> fija (carga diaria 6 JR -> base load 36)
    // Sem 2: 2026-10-12 (5 días, cap 40) -> base load 33 (6.6 JR/día) -> holgura 7 (70 M2)
    // Sem 3: 2026-10-19 (6 días, cap 48) -> base load 36 (6 JR/día) -> holgura 12 (120 M2)
    // Sem 4: 2026-10-26 (6 días, cap 48) -> base load 36 (6 JR/día) -> holgura 12 (120 M2)

    const templates: RoutineBaseTemplate[] = [
      {
        id: 't-b1-1',
        activity_key: '1.01',
        name: 'BARRIDO DIARIO',
        zone: 'ZONA 1',
        unit: 'M2',
        cantidad: 60,
        rendimiento: 10, // 6 JR/día
        frecuencia: 25,
        counts_capacity: true,
      },
      {
        id: 't-b1-2',
        activity_key: '3.02',
        name: 'CRISTALIZADO DE PISOS DE MARMOL',
        zone: 'ZONA 1',
        unit: 'M2',
        cantidad: 200, // 20 JR requeridos en el mes
        rendimiento: 10,
        frecuencia: 1,
        counts_capacity: true,
      },
    ];

    // Paso 1: Proyectar el mes con solo la semana 1 fija
    const existingInitial = [
      {
        week_start: '2026-10-05',
        items: [{ activity_key: '1.01', planned_jr: 36, planned_qty: 360, counts_capacity: true, status: 'published' }],
      },
    ];

    const initialAlloc = projectMonthlyLowFrequencyAllocation(templates, '2026-10-05', {
      siteDailyCapacity,
      existingMonthPlans: existingInitial,
    });

    const initW12 = initialAlloc.get('2026-10-12') || [];
    const initW19 = initialAlloc.get('2026-10-19') || [];
    const initW26 = initialAlloc.get('2026-10-26') || [];

    const initQty12 = initW12.find((i) => i.activity_key === '3.02')?.cantidad || 0;
    const initQty19 = initW19.find((i) => i.activity_key === '3.02')?.cantidad || 0;
    const initQty26 = initW26.find((i) => i.activity_key === '3.02')?.cantidad || 0;

    // En holguras [70, 120, 120]:
    // Sem 3 (holgura 120 M2 = 12 JR) toma 120 M2
    // Sem 4 (holgura 120 M2 = 12 JR) toma los 80 M2 restantes
    expect(initQty19).toBe(120);
    expect(initQty26).toBe(80);
    expect(initQty12).toBe(0);
    expect(initQty12 + initQty19 + initQty26).toBe(200);

    // Paso 2: Materializar la semana 2 y convertirla en plan existente
    const projW12 = generateRoutineScheduleForWeek(templates, '2026-10-12', [], {
      siteDailyCapacity,
      existingMonthPlans: existingInitial,
    });

    const w12Items = projW12.assignments.map((a) => ({
      activity_key: a.activity_key,
      planned_qty: a.cantidad,
      planned_jr: a.theoretical_jr,
      counts_capacity: a.counts_capacity,
      status: 'published',
    }));

    const existingWithW12 = [
      ...existingInitial,
      {
        week_start: '2026-10-12',
        items: w12Items,
      },
    ];

    // Paso 3: Proyectar de nuevo para la semana 3 con semanas 1 y 2 fijas
    const nextAlloc = projectMonthlyLowFrequencyAllocation(templates, '2026-10-19', {
      siteDailyCapacity,
      existingMonthPlans: existingWithW12,
    });

    const nextW19 = nextAlloc.get('2026-10-19') || [];
    const nextW26 = nextAlloc.get('2026-10-26') || [];
    const nextQty19 = nextW19.find((i) => i.activity_key === '3.02')?.cantidad || 0;
    const nextQty26 = nextW26.find((i) => i.activity_key === '3.02')?.cantidad || 0;

    // El resultado de la semana 3 coincide con la proyección original
    expect(nextQty19).toBe(initQty19); // 120 M2
    expect(nextQty26).toBe(initQty26); // 80 M2

    // Suma de cantidades en semanas 2, 3, 4 + arrastre = cantidad total del mes (200)
    const carryoverNext = nextAlloc.carryoverNextMonth?.find((c) => c.activity_key === '3.02')?.qty || 0;
    const totalMonthQty = initQty12 + nextQty19 + nextQty26 + carryoverNext;
    expect(totalMonthQty).toBe(200);
  });

  // 10. B1: Arrastre de entrada + visita regular de la misma llave
  test('10. B1: Arrastre de entrada y visita regular de la misma llave se procesan por cantidad sin que ninguna desaparezca', () => {
    const siteDailyCapacity = 6;
    const templates: RoutineBaseTemplate[] = [
      {
        id: 't-b1-3',
        activity_key: '3.02',
        name: 'MARMOL REGULAR',
        zone: 'ZONA 1',
        unit: 'M2',
        cantidad: 50, // 5 JR
        rendimiento: 10,
        frecuencia: 1,
        counts_capacity: true,
      },
    ];

    const carryoverIn = [
      {
        activity_key: '3.02',
        qty: 30, // 3 JR de arrastre
        jr: 3,
      },
    ];

    // Semana 1 fija que ya consumió 20 M2 de arrastre
    const existingMonthPlans = [
      {
        week_start: '2026-11-02',
        items: [
          { activity_key: '3.02', planned_qty: 20, planned_jr: 2, counts_capacity: true, status: 'published' },
        ],
      },
    ];

    const allocation = projectMonthlyLowFrequencyAllocation(templates, '2026-11-09', {
      siteDailyCapacity,
      existingMonthPlans,
      carryoverIn,
    });

    // Total requerido = 30 (arrastre) + 50 (regular) = 80 M2
    // Ya planificado en sem 1 = 20 M2
    // Pendiente a distribuir en semanas no fijas = 60 M2 (10 de arrastre + 50 regular)
    const nonFixedAlloc = (allocation.get('2026-11-09') || [])
      .concat(allocation.get('2026-11-16') || [])
      .concat(allocation.get('2026-11-23') || []);

    const nonFixedQty = nonFixedAlloc
      .filter((it) => it.activity_key === '3.02')
      .reduce((sum, it) => sum + it.cantidad, 0);

    const fixedQty = (allocation.get('2026-11-02') || [])
      .filter((it) => it.activity_key === '3.02')
      .reduce((sum, it) => sum + it.cantidad, 0);

    const carryover = allocation.carryoverNextMonth?.find((c) => c.activity_key === '3.02')?.qty || 0;

    expect(fixedQty).toBe(20);
    expect(nonFixedQty + carryover).toBe(60);
    expect(fixedQty + nonFixedQty + carryover).toBe(80); // Total mes = 80
  });

  // 11. B2: Exclusión de ítems con status = 'cancelled'
  test('11. B2: Ítems cancelados en weekly_plans o weekly_plan_items no se cuentan como planificados', () => {
    const siteDailyCapacity = 8;
    const templates: RoutineBaseTemplate[] = [
      {
        id: 't-b2-1',
        activity_key: '3.02',
        name: 'MARMOL',
        zone: 'ZONA 1',
        unit: 'M2',
        cantidad: 100, // 10 JR
        rendimiento: 10,
        frecuencia: 1,
        counts_capacity: true,
      },
    ];

    // Semana 1 tiene un ítem cancelado de 100 M2
    const existingMonthPlans = [
      {
        week_start: '2026-10-05',
        items: [
          { activity_key: '3.02', planned_qty: 100, planned_jr: 10, counts_capacity: true, status: 'cancelled' },
        ],
      },
    ];

    const allocation = projectMonthlyLowFrequencyAllocation(templates, '2026-10-12', {
      siteDailyCapacity,
      existingMonthPlans,
    });

    // Como el ítem estaba cancelado, la actividad sigue pendiente al 100% (100 M2) y se reparte en las semanas no fijas
    let allocatedTotal = 0;
    for (const [, items] of allocation.entries()) {
      for (const it of items) {
        if (it.activity_key === '3.02') {
          allocatedTotal += it.cantidad;
        }
      }
    }
    const carryover = allocation.carryoverNextMonth?.find((c) => c.activity_key === '3.02')?.qty || 0;
    expect(allocatedTotal + carryover).toBe(100);
  });
});

