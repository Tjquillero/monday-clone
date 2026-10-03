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

/**
 * Columnas físicas vivas de public.weekly_plan_items según las migraciones:
 * - 20260709_weekly_plans_nucleus.sql (creación de tabla)
 * - 20260714_poa_domain_schema.sql (poa_activity_zone_id)
 * - 2026091401_restore_weekly_plan_items_schema.sql (planned_date, occurrence_key, is_manual_override, override_reason)
 * - 2026100102_sync_gateway_rendimiento_optional.sql
 *
 * NOTA: La tabla NO posee columna 'status' ni 'theoretical_jr'.
 */
export const PHYSICAL_WEEKLY_PLAN_ITEMS_COLUMNS = [
  'id',
  'plan_id',
  'activity_standard_id',
  'planned_sequence',
  'activity_key',
  'planned_rendimiento',
  'planned_frecuencia',
  'priority',
  'planned_qty',
  'unit',
  'planned_jr',
  'executed_qty',
  'executed_jr',
  'created_at',
  'updated_at',
  'poa_activity_zone_id',
  'planned_date',
  'occurrence_key',
  'is_manual_override',
  'override_reason',
];

export function validateWeeklyPlanItemsSelect(cols: string) {
  if (cols === '*') return null;
  const requested = cols.split(',').map((c) => c.trim()).filter(Boolean);
  for (const col of requested) {
    if (!PHYSICAL_WEEKLY_PLAN_ITEMS_COLUMNS.includes(col)) {
      return { message: `column "${col}" does not exist` };
    }
  }
  return null;
}

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
        status: 'published',
        items: [{ activity_key: '1.01', planned_jr: 36, planned_qty: 360, counts_capacity: true }],
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
    }));

    const existingWithW12 = [
      ...existingInitial,
      {
        week_start: '2026-10-12',
        status: 'published',
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
        status: 'published',
        items: [
          { activity_key: '3.02', planned_qty: 20, planned_jr: 2, counts_capacity: true },
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

  // 11. B2 / FREQ-OP-05c: Exclusión de planes con status = 'cancelled'
  test('11. B2 / FREQ-OP-05c: Planes cancelados (weekly_plans.status = "cancelled") no se cuentan como planificados', () => {
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

    // Semana 1 tiene un plan cancelado de 100 M2
    const existingMonthPlans = [
      {
        week_start: '2026-10-05',
        status: 'cancelled',
        items: [
          { activity_key: '3.02', planned_qty: 100, planned_jr: 10, counts_capacity: true },
        ],
      },
    ];

    const allocation = projectMonthlyLowFrequencyAllocation(templates, '2026-10-12', {
      siteDailyCapacity,
      existingMonthPlans,
    });

    // Como el plan estaba cancelado, la actividad sigue pendiente al 100% (100 M2) y se reparte en las semanas no fijas
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

  // 12. FREQ-OP-05c: Rechazar selects en weekly_plan_items con columnas inexistentes en esquema físico vivo
  test('12. FREQ-OP-05c: Mock de Supabase rechaza columnas inexistentes en weekly_plan_items (ej: status, theoretical_jr)', async () => {
    const createStrictMockSupabase = (customItemSelect?: string) => ({
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
                  in: () => ({
                    data: [
                      { id: 'plan-1', week_start: '2026-10-05', status: 'published' },
                      { id: 'plan-2', week_start: '2026-10-12', status: 'published' },
                      { id: 'plan-3', week_start: '2026-10-19', status: 'published' },
                      { id: 'plan-4', week_start: '2026-10-26', status: 'published' },
                    ],
                    error: null,
                  }),
                  maybeSingle: () => ({ data: null, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'weekly_plan_items') {
          return {
            select: (cols: string) => {
              const err = validateWeeklyPlanItemsSelect(customItemSelect ?? cols);
              if (err) {
                return {
                  in: () => Promise.resolve({ data: null, error: err }),
                };
              }
              return {
                in: () => Promise.resolve({
                  data: [
                    { plan_id: 'plan-1', activity_key: '3.02', planned_qty: 100, planned_jr: 10, planned_rendimiento: 10 },
                  ],
                  error: null,
                }),
              };
            },
          };
        }
        if (table === 'materialization_events') {
          return { insert: () => ({ error: null }) };
        }
        return { select: () => ({ eq: () => ({ data: [], error: null }) }) };
      },
      rpc: () => Promise.resolve({ data: 'ok', error: null }),
    });

    // 1. Columnas válidas solicitadas en scheduleMaterializationService
    expect(validateWeeklyPlanItemsSelect('plan_id, activity_key, planned_qty, planned_jr, planned_rendimiento')).toBeNull();
    expect(validateWeeklyPlanItemsSelect('plan_id, activity_key, planned_qty')).toBeNull();

    // 2. Columna inválida 'status' debe ser rechazada por el validador
    expect(validateWeeklyPlanItemsSelect('plan_id, activity_key, status')).toEqual({
      message: 'column "status" does not exist',
    });

    // 3. Columna inválida 'theoretical_jr' debe ser rechazada por el validador
    expect(validateWeeklyPlanItemsSelect('plan_id, activity_key, theoretical_jr')).toEqual({
      message: 'column "theoretical_jr" does not exist',
    });

    // 4. Servicio ejecutado contra mock estricto: select con 'status' falla con MONTH_PROJECTION_READ_FAILED
    const invalidMock: any = createStrictMockSupabase('plan_id, activity_key, planned_qty, planned_jr, planned_rendimiento, status');
    await expect(
      ensureWeeklyPlanMaterialized(invalidMock, 'board-1', 'group-1', new Date('2026-10-05T00:00:00Z'))
    ).rejects.toThrow('MONTH_PROJECTION_READ_FAILED: column "status" does not exist');
  });

  // 13. FREQ-OP-05d / E1: Visita freq 1 con rendimiento null (jr 0) y capacidad definida se asigna completa a semana no fija y cantidad no es nula
  test('13. E1: Visita freq 1 con rendimiento null (jr 0) se asigna completa a semana no fija y cantidad no es nula', () => {
    const siteDailyCapacity = 8;
    const templates: RoutineBaseTemplate[] = [
      {
        id: 't-e1-1',
        activity_key: '1.13',
        name: 'ACTIVIDAD SIN RENDIMIENTO (D20)',
        zone: 'ZONA 1',
        unit: 'UND',
        cantidad: 15,
        rendimiento: null as any,
        frecuencia: 1,
        counts_capacity: true,
      },
    ];

    const existingMonthPlans = [
      {
        week_start: '2026-10-05',
        status: 'published',
        items: [],
      },
    ];

    const allocation = projectMonthlyLowFrequencyAllocation(templates, '2026-10-05', {
      siteDailyCapacity,
      existingMonthPlans,
    });

    const w12 = allocation.get('2026-10-12') || [];
    const w19 = allocation.get('2026-10-19') || [];
    const w26 = allocation.get('2026-10-26') || [];
    const allAlloc = [...w12, ...w19, ...w26];

    const found = allAlloc.find((i) => i.activity_key === '1.13');
    expect(found).toBeDefined();
    expect(found?.cantidad).toBe(15);
    expect(Number.isNaN(found?.cantidad)).toBe(false);
  });

  // 14. FREQ-OP-05d / E1: Visita freq 2 con rendimiento null: ninguna cantidad es NaN o null; las 2 visitas quedan en las semanas de su par
  test('14. E1: Visita freq 2 con rendimiento null: cantidades no son NaN/null y quedan en semanas de su par', () => {
    const siteDailyCapacity = 8;
    const templates: RoutineBaseTemplate[] = [
      {
        id: 't-e1-2',
        activity_key: '2.10',
        name: 'ACTIVIDAD FREQ 2 SIN RENDIMIENTO',
        zone: 'ZONA 1',
        unit: 'UND',
        cantidad: 10,
        rendimiento: null as any,
        frecuencia: 2,
        counts_capacity: true,
      },
    ];

    const allocation = projectMonthlyLowFrequencyAllocation(templates, '2026-10-05', {
      siteDailyCapacity,
    });

    const w05 = allocation.get('2026-10-05') || [];
    const w12 = allocation.get('2026-10-12') || [];
    const w19 = allocation.get('2026-10-19') || [];
    const w26 = allocation.get('2026-10-26') || [];

    const in05 = w05.find((i) => i.activity_key === '2.10');
    const in19 = w19.find((i) => i.activity_key === '2.10');
    const in12 = w12.find((i) => i.activity_key === '2.10');
    const in26 = w26.find((i) => i.activity_key === '2.10');

    // Debe elegirse el par 13 o 24
    if (in05 || in19) {
      expect(in05?.cantidad).toBe(10);
      expect(in19?.cantidad).toBe(10);
      expect(Number.isNaN(in05?.cantidad)).toBe(false);
      expect(Number.isNaN(in19?.cantidad)).toBe(false);
      expect(in12).toBeUndefined();
      expect(in26).toBeUndefined();
    } else {
      expect(in12?.cantidad).toBe(10);
      expect(in26?.cantidad).toBe(10);
      expect(Number.isNaN(in12?.cantidad)).toBe(false);
      expect(Number.isNaN(in26?.cantidad)).toBe(false);
    }
  });

  // 15. FREQ-OP-05d / E2: Visita única de 0,02 jr con holgura amplia: se asigna completa, no va al arrastre
  test('15. E2: Visita única pequeña de 0.02 JR con holgura amplia se asigna completa y no va a carryover', () => {
    const siteDailyCapacity = 8;
    const templates: RoutineBaseTemplate[] = [
      {
        id: 't-e2-1',
        activity_key: '2.04',
        name: 'VISITA PEQUEÑA',
        zone: 'ZONA 1',
        unit: 'M2',
        cantidad: 0.2, // 0.2 / 10 = 0.02 JR
        rendimiento: 10,
        frecuencia: 1,
        counts_capacity: true,
      },
    ];

    const allocation = projectMonthlyLowFrequencyAllocation(templates, '2026-10-05', {
      siteDailyCapacity,
    });

    let totalAlloc = 0;
    for (const [, items] of allocation.entries()) {
      for (const it of items) {
        if (it.activity_key === '2.04') totalAlloc += it.cantidad;
      }
    }

    const carryover = allocation.carryoverNextMonth?.find((c) => c.activity_key === '2.04')?.qty || 0;
    expect(totalAlloc).toBe(0.2);
    expect(carryover).toBe(0);
  });

  // 16. FREQ-OP-05d / E3: Freq 2 con una semana fija que tiene la mitad de la cantidad: el pendiente se programa en la otra semana del par
  test('16. E3: Freq 2 con semana fija con mitad de cantidad programa el pendiente en la otra semana del par', () => {
    const siteDailyCapacity = 8;
    const templates: RoutineBaseTemplate[] = [
      {
        id: 't-e3-1',
        activity_key: '2.03',
        name: 'FREQ 2 CON CANTIDAD PARCIAL',
        zone: 'ZONA 1',
        unit: 'M2',
        cantidad: 100, // Cada visita es de 100 M2 (Total mes = 200 M2 = 20 JR)
        rendimiento: 10,
        frecuencia: 2,
        counts_capacity: true,
      },
    ];

    // Semana 1 (2026-10-05) fija con solo 50 M2 ejecutados (la mitad de una visita)
    const existingMonthPlans = [
      {
        week_start: '2026-10-05',
        status: 'published',
        items: [
          { activity_key: '2.03', planned_qty: 50, planned_jr: 5, counts_capacity: true },
        ],
      },
    ];

    const allocation = projectMonthlyLowFrequencyAllocation(templates, '2026-10-12', {
      siteDailyCapacity,
      existingMonthPlans,
    });

    // Como semana 1 del par 13 es fija, el resto pendiente (200 - 50 = 150 M2) va a la semana 3 (2026-10-19)
    const w19 = allocation.get('2026-10-19') || [];
    const item19 = w19.find((i) => i.activity_key === '2.03');
    expect(item19).toBeDefined();
    // Capacidad de sem 3 es 8 * 6 = 48 JR (480 M2), por lo que caben los 150 M2 completos
    expect(item19?.cantidad).toBe(150);

    const carryover = allocation.carryoverNextMonth?.find((c) => c.activity_key === '2.03')?.qty || 0;
    expect(carryover).toBe(0);
    // Suma total mes: 50 fija + 150 no fija = 200 M2
    expect(50 + (item19?.cantidad || 0) + carryover).toBe(200);
  });

  // 17. FREQ-OP-05d / E4: Semana objetivo fija con ítems distintos a la proyección da NOOP y 0 escrituras
  test('17. E4: Semana objetivo fija con ítems distintos da NOOP sin error de conflicto y 0 escrituras', async () => {
    const mockRpcCalls: Array<{ fn: string; args: any }> = [];
    const mockSupabaseFixed: any = {
      from: (table: string) => {
        if (table === 'poa') {
          return { select: () => ({ eq: () => ({ data: [{ id: 'poa-1' }], error: null }) }) };
        }
        if (table === 'poa_versions') {
          return { select: () => ({ in: () => ({ eq: () => ({ data: [{ id: 'v-1', poa_id: 'poa-1' }], error: null }) }) }) };
        }
        if (table === 'poa_activities') {
          return { select: () => ({ eq: () => ({ order: () => ({ data: [{ id: 'pa-1', activity_key: '1.01' }], error: null }) }) }) };
        }
        if (table === 'board_activity_standards') {
          return { select: () => ({ eq: () => ({ data: [{ id: 'std-1', activity_key: '1.01', name: 'BARRIDO', category: 'ASEO', rendimiento: 10, unit: 'M2', requiere_rendimiento: true }], error: null }) }) };
        }
        if (table === 'poa_activity_zones') {
          return { select: () => ({ eq: () => ({ in: () => ({ order: () => ({ data: [{ id: 'paz-1', poa_activity_id: 'pa-1', zone_id: 'group-1', cantidad_contratada: 100 }], error: null }) }) }) }) };
        }
        if (table === 'operational_frequencies') {
          return { select: () => ({ eq: () => ({ eq: () => ({ data: [{ activity_key: '1.01', visits_per_month: 25, counts_capacity: true }], error: null }) }) }) };
        }
        if (table === 'site_daily_capacity') {
          return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => ({ data: { jornales_dia: 8 }, error: null }) }) }) }) };
        }
        if (table === 'weekly_plans') {
          const createPlanQuery = (filters: Record<string, any> = {}) => ({
            eq: (col: string, val: any) => createPlanQuery({ ...filters, [col]: val }),
            in: (col: string, dates: string[]) => ({
              data: [
                { id: 'plan-fixed-10-05', week_start: '2026-10-05', status: 'published' },
              ],
              error: null,
            }),
            maybeSingle: () => ({
              data: { id: 'plan-fixed-10-05', status: 'published' },
              error: null,
            }),
          });
          return { select: () => createPlanQuery() };
        }
        if (table === 'weekly_plan_items') {
          return {
            select: () => ({
              eq: () => ({
                data: [
                  // Ítems existentes en la BD con secuencias y claves distintas a la proyección fresca
                  { planned_sequence: 1, activity_key: 'HISTORICAL_1', planned_date: '2026-10-05' },
                  { planned_sequence: 2, activity_key: 'HISTORICAL_2', planned_date: '2026-10-06' },
                ],
                error: null,
              }),
              in: () => ({
                data: [
                  { plan_id: 'plan-fixed-10-05', activity_key: 'HISTORICAL_1', planned_qty: 50, planned_jr: 5, planned_rendimiento: 10 },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === 'materialization_events') {
          return { insert: () => ({ error: null }) };
        }
        return { select: () => ({ eq: () => ({ data: [], error: null }) }) };
      },
      rpc: (fn: string, args: any) => {
        mockRpcCalls.push({ fn, args });
        return Promise.resolve({ data: 'ok', error: null });
      },
    };

    const res = await ensureWeeklyPlanMaterialized(mockSupabaseFixed, 'board-1', 'group-1', new Date('2026-10-05T00:00:00Z'));
    expect(res.weeklyPlan.id).toBe('plan-fixed-10-05');
    expect(res.insertedCount).toBe(0);
    expect(res.protectedCount).toBe(2);

    // 0 llamadas a RPCs de mutación (ensure_weekly_plan_header o sync_weekly_plan_items_rpc)
    const writeRpcCalls = mockRpcCalls.filter((c) => c.fn === 'ensure_weekly_plan_header' || c.fn === 'sync_weekly_plan_items_rpc');
    expect(writeRpcCalls.length).toBe(0);
  });

  // 18. FREQ-OP-05d: Secuencial de mes completo con mock de columnas reales: arrastre M-1 cuadra con proyección
  test('18. Secuencial de mes completo con columnas reales: arrastre M-1 coincide exactamente con proyección del mes anterior', async () => {
    // Definición de base de datos simulada con esquema físico real
    const storedPlans: any[] = [];
    const storedItems: any[] = [];
    let planSeqCounter = 1;

    // Inicializar semana 1 (2026-10-05) como fija
    storedPlans.push({
      id: 'plan-oct-w1',
      board_id: 'board-1',
      group_id: 'group-1',
      week_start: '2026-10-05',
      status: 'published',
    });
    storedItems.push(
      { id: 'item-1', plan_id: 'plan-oct-w1', activity_key: '1.01', planned_sequence: 1, planned_qty: 360, planned_jr: 36, planned_rendimiento: 10, planned_date: '2026-10-05' },
      { id: 'item-2', plan_id: 'plan-oct-w1', activity_key: '3.02', planned_sequence: 2, planned_qty: 40, planned_jr: 4, planned_rendimiento: 10, planned_date: '2026-10-06' }
    );

    const createSimulatedSupabase = () => ({
      from: (table: string) => {
        if (table === 'poa') {
          return { select: () => ({ eq: () => ({ data: [{ id: 'poa-1' }], error: null }) }) };
        }
        if (table === 'poa_versions') {
          return { select: () => ({ in: () => ({ eq: () => ({ data: [{ id: 'v-1', poa_id: 'poa-1' }], error: null }) }) }) };
        }
        if (table === 'poa_activities') {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  data: [
                    { id: 'pa-1', activity_key: '1.01' },
                    { id: 'pa-2', activity_key: '3.02' },
                    { id: 'pa-3', activity_key: '1.13' },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'board_activity_standards') {
          return {
            select: () => ({
              eq: () => ({
                data: [
                  { id: 'std-1', activity_key: '1.01', name: 'BARRIDO', category: 'ASEO', rendimiento: 10, unit: 'M2', requiere_rendimiento: true },
                  { id: 'std-2', activity_key: '3.02', name: 'MARMOL', category: 'PISOS', rendimiento: 10, unit: 'M2', requiere_rendimiento: true },
                  { id: 'std-3', activity_key: '1.13', name: 'INSPECCION', category: 'SUPERVISION', rendimiento: null, unit: 'UND', requiere_rendimiento: false },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === 'poa_activity_zones') {
          return {
            select: () => ({
              eq: () => ({
                in: () => ({
                  order: () => ({
                    data: [
                      { id: 'paz-1', poa_activity_id: 'pa-1', zone_id: 'group-1', cantidad_contratada: 360 },
                      { id: 'paz-2', poa_activity_id: 'pa-2', zone_id: 'group-1', cantidad_contratada: 100 },
                      { id: 'paz-3', poa_activity_id: 'pa-3', zone_id: 'group-1', cantidad_contratada: 10 },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'operational_frequencies') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  data: [
                    { activity_key: '1.01', visits_per_month: 25, counts_capacity: true },
                    { activity_key: '3.02', visits_per_month: 1, counts_capacity: true },
                    { activity_key: '1.13', visits_per_month: 1, counts_capacity: true },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'site_daily_capacity') {
          return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => ({ data: { jornales_dia: 7 }, error: null }) }) }) }) };
        }
        if (table === 'weekly_plans') {
          const createPlanQuery = (filters: Record<string, any> = {}) => ({
            eq: (col: string, val: any) => createPlanQuery({ ...filters, [col]: val }),
            in: (col: string, dates: string[]) => {
              const matched = storedPlans.filter((p) => dates.includes(p.week_start));
              return { data: matched, error: null };
            },
            maybeSingle: () => {
              const matched = storedPlans.find((p) => {
                if (filters.week_start && p.week_start !== filters.week_start) return false;
                if (filters.group_id && p.group_id !== filters.group_id) return false;
                if (filters.board_id && p.board_id !== filters.board_id) return false;
                return true;
              });
              return { data: matched || null, error: null };
            },
          });
          return { select: () => createPlanQuery() };
        }
        if (table === 'weekly_plan_items') {
          return {
            select: (cols: string) => {
              const err = validateWeeklyPlanItemsSelect(cols);
              if (err) {
                return {
                  eq: () => ({ data: null, error: err }),
                  in: () => ({ data: null, error: err }),
                };
              }
              return {
                eq: (col: string, planId: string) => {
                  const items = storedItems.filter((i) => i.plan_id === planId);
                  return { data: items, error: null };
                },
                in: (col: string, planIds: string[]) => {
                  const items = storedItems.filter((i) => planIds.includes(i.plan_id));
                  return { data: items, error: null };
                },
              };
            },
          };
        }
        if (table === 'materialization_events') {
          return { insert: () => ({ error: null }) };
        }
        return { select: () => ({ eq: () => ({ data: [], error: null }) }) };
      },
      rpc: (fn: string, args: any) => {
        if (fn === 'ensure_weekly_plan_header') {
          const newPlanId = `plan-oct-w${++planSeqCounter}`;
          storedPlans.push({
            id: newPlanId,
            board_id: args.p_board_id,
            group_id: args.p_group_id,
            week_start: args.p_week_start,
            status: 'published',
          });
          return Promise.resolve({ data: newPlanId, error: null });
        }
        if (fn === 'sync_weekly_plan_items_rpc') {
          const planId = args.p_plan_id;
          for (const it of args.p_items || []) {
            storedItems.push({
              id: `item-${storedItems.length + 1}`,
              plan_id: planId,
              activity_key: it.activity_key,
              planned_sequence: it.planned_sequence,
              planned_qty: it.planned_qty,
              planned_jr: it.planned_jr,
              planned_rendimiento: it.planned_rendimiento,
              planned_date: it.planned_date,
            });
          }
          return Promise.resolve({ data: args.p_items || [], error: null });
        }
        return Promise.resolve({ data: 'ok', error: null });
      },
    });

    const simSupabase: any = createSimulatedSupabase();

    // Materializar secuencialmente semanas 2, 3 y 4 de Octubre 2026
    const resW12 = await ensureWeeklyPlanMaterialized(simSupabase, 'board-1', 'group-1', new Date('2026-10-12T00:00:00Z'));
    expect(resW12.weeklyPlan).toBeDefined();

    const resW19 = await ensureWeeklyPlanMaterialized(simSupabase, 'board-1', 'group-1', new Date('2026-10-19T00:00:00Z'));
    expect(resW19.weeklyPlan).toBeDefined();

    const resW26 = await ensureWeeklyPlanMaterialized(simSupabase, 'board-1', 'group-1', new Date('2026-10-26T00:00:00Z'));
    expect(resW26.weeklyPlan).toBeDefined();

    // Obtener proyección de arrastre calculada para fin de mes
    const projectedCarryoverNextMonth = resW26.carryoverNextMonth || [];

    // Materializar primera semana de Noviembre 2026 (2026-11-02)
    const resNov = await ensureWeeklyPlanMaterialized(simSupabase, 'board-1', 'group-1', new Date('2026-11-02T00:00:00Z'));
    expect(resNov.weeklyPlan).toBeDefined();

    const novCarryoverIn = resNov.carryoverIn || [];

    // Verificar correspondencia exacta por cantidad (tolerancia 0.05) entre la proyección del mes anterior y carryoverIn
    for (const proj of projectedCarryoverNextMonth) {
      const matchNov = novCarryoverIn.find((c) => c.activity_key === proj.activity_key);
      expect(matchNov).toBeDefined();
      expect(Math.abs((matchNov?.qty || 0) - proj.qty)).toBeLessThanOrEqual(0.05);
    }
  });
});

