import fs from 'fs';
import path from 'path';
import {
  generateRoutineScheduleForWeek,
  RoutineBaseTemplate,
} from '../routineScheduler';
import { classifySiteActivities } from '../materialization/siteActivityClassifier';
import { ensureWeeklyPlanMaterialized } from '../scheduleMaterializationService';

function createMockQuery(data: any, count: number | null = null, error: any = null) {
  const query: any = {
    select: () => query,
    insert: () => query,
    update: () => query,
    delete: () => query,
    eq: () => query,
    in: () => query,
    order: () => query,
    limit: () => query,
    maybeSingle: () => Promise.resolve({ data, error }),
    single: () => Promise.resolve({ data, error }),
    then: (resolve: (val: any) => any) => resolve({ data, count, error }),
  };
  return query;
}

describe('GATE FREQ-OP-03 — D27 Reparto por Carga y D28 Máquinas Fuera de Capacidad', () => {
  const weekStart = '2026-09-07'; // Lunes 7 de Septiembre 2026 (Semana 2)

  describe('1. Migración y Semilla 2026100104_counts_capacity', () => {
    test('Migración 2026100104 agrega columna counts_capacity con default true', () => {
      const migPath = path.resolve(process.cwd(), 'supabase/migrations/2026100104_counts_capacity.sql');
      expect(fs.existsSync(migPath)).toBe(true);
      const sql = fs.readFileSync(migPath, 'utf8');
      expect(sql).toContain('ADD COLUMN IF NOT EXISTS counts_capacity BOOLEAN NOT NULL DEFAULT true');
    });

    test('Semilla 2026100104 desactiva counts_capacity para 1.11, 1.14, 1.15, 2.17', () => {
      const seedPath = path.resolve(process.cwd(), 'supabase/seeds/2026100104_counts_capacity_seed.sql');
      expect(fs.existsSync(seedPath)).toBe(true);
      const sql = fs.readFileSync(seedPath, 'utf8');
      expect(sql).toContain("counts_capacity = false");
      expect(sql).toContain("'1.11', '1.14', '1.15', '2.17'");
      expect(sql).toContain("3ea0326f-6ff7-409f-848a-1f296e6e3cc8");
    });
  });

  describe('2. Reparto de Visitas Únicas a Días de Menor Carga (D27)', () => {
    test('Reparto balanceado: visitas únicas se asignan sucesivamente al día con menor carga acumulada', () => {
      // 3 actividades de 4 visitas/mes (1 visita por semana cada una)
      const t1: RoutineBaseTemplate = {
        id: 't1', activity_key: '1.09', name: 'Troncos', zone: 'Playa', unit: 'UND',
        rendimiento: 30, frecuencia: 4, cantidad: 30, // 1.0 jr
        counts_capacity: true,
      };
      const t2: RoutineBaseTemplate = {
        id: 't2', activity_key: '2.13', name: 'Limpieza Canecas', zone: 'Zona', unit: 'UND',
        rendimiento: 100, frecuencia: 4, cantidad: 100, // 1.0 jr
        counts_capacity: true,
      };
      const t3: RoutineBaseTemplate = {
        id: 't3', activity_key: '3.04', name: 'Vidrios', zone: 'Edificio', unit: 'M2',
        rendimiento: 500, frecuencia: 4, cantidad: 500, // 1.0 jr
        counts_capacity: true,
      };

      const result = generateRoutineScheduleForWeek([t1, t2, t3], weekStart, []);
      const assignedDates = result.assignments.map((a) => a.dateStr);

      // Cada una debe asignarse a un día diferente (Lunes, Martes, Miércoles)
      expect(assignedDates).toEqual(['2026-09-07', '2026-09-08', '2026-09-09']);
    });

    test('Empate de carga: se asigna al día hábil más temprano (Lunes)', () => {
      const t1: RoutineBaseTemplate = {
        id: 't1', activity_key: '1.09', name: 'Troncos', zone: 'Playa', unit: 'UND',
        rendimiento: 30, frecuencia: 4, cantidad: 30, // 1.0 jr
        counts_capacity: true,
      };

      const result = generateRoutineScheduleForWeek([t1], weekStart, []);
      expect(result.assignments.length).toBe(1);
      expect(result.assignments[0].dateStr).toBe('2026-09-07'); // Lunes
      expect(result.assignments[0].dayOfWeek).toBe(1);
    });

    test('Patrones repetidos (12 y 8) se mantienen intactos', () => {
      const t12: RoutineBaseTemplate = {
        id: 't12', activity_key: '2.16', name: 'Lavado', zone: 'Zona', unit: 'M2',
        rendimiento: 1000, frecuencia: 12, cantidad: 1000,
        counts_capacity: true,
      };
      const t8: RoutineBaseTemplate = {
        id: 't8', activity_key: '1.02', name: 'Bordeo', zone: 'Zona', unit: 'ML',
        rendimiento: 500, frecuencia: 8, cantidad: 500,
        counts_capacity: true,
      };

      const result12 = generateRoutineScheduleForWeek([t12], weekStart, []);
      expect(result12.assignments.map((a) => a.dateStr)).toEqual([
        '2026-09-07', // Lun
        '2026-09-09', // Mié
        '2026-09-11', // Vie
      ]);

      const result8 = generateRoutineScheduleForWeek([t8], weekStart, []);
      expect(result8.assignments.map((a) => a.dateStr)).toEqual([
        '2026-09-08', // Mar
        '2026-09-10', // Jue
      ]);
    });
  });

  describe('3. División de Visita por Capacidad y Proporcionalidad (D27 d)', () => {
    test('Visita que no cabe en el mejor día se divide en días consecutivos respetando capacidad libre', () => {
      // Capacidad diaria = 2.0 jornales
      // Actividad única de 3.0 jornales (3000 m² con rend 1000)
      const t: RoutineBaseTemplate = {
        id: 't_heavy', activity_key: '1.09', name: 'Recolección', zone: 'Playa', unit: 'M2',
        rendimiento: 1000, frecuencia: 4, cantidad: 3000, // 3.0 jr total
        counts_capacity: true,
      };

      const result = generateRoutineScheduleForWeek([t], weekStart, [], { siteDailyCapacity: 2.0 });
      expect(result.assignments.length).toBe(2);

      const [part1, part2] = result.assignments;
      expect(part1.dateStr).toBe('2026-09-07'); // Lunes
      expect(part1.cantidad).toBe(2000);
      expect(part1.theoretical_jr).toBe(2.0);

      expect(part2.dateStr).toBe('2026-09-08'); // Martes
      expect(part2.cantidad).toBe(1000);
      expect(part2.theoretical_jr).toBe(1.0);

      // Suma exacta
      const totalQty = result.assignments.reduce((acc, a) => acc + a.cantidad, 0);
      const totalJr = result.assignments.reduce((acc, a) => acc + a.theoretical_jr, 0);
      expect(totalQty).toBe(3000);
      expect(Number(totalJr.toFixed(4))).toBe(3.0);
    });

    test('Sitio sin capacidad (null / undefined): no se divide la visita', () => {
      const t: RoutineBaseTemplate = {
        id: 't_heavy', activity_key: '1.09', name: 'Recolección', zone: 'Playa', unit: 'M2',
        rendimiento: 1000, frecuencia: 4, cantidad: 5000, // 5.0 jr total
        counts_capacity: true,
      };

      const result = generateRoutineScheduleForWeek([t], weekStart, [], { siteDailyCapacity: null });
      expect(result.assignments.length).toBe(1);
      expect(result.assignments[0].dateStr).toBe('2026-09-07');
      expect(result.assignments[0].cantidad).toBe(5000);
      expect(result.assignments[0].theoretical_jr).toBe(5.0);
    });
  });

  describe('4. Gobernanza de Máquinas (D28) y Festivos (D26)', () => {
    test('Actividades de máquina (counts_capacity = false) no cuentan contra la capacidad y no se dividen', () => {
      // Capacidad diaria = 2.0 jornales
      // Actividad de máquina: 4.0 jornales (frec 4, 4000 m2 con rend 1000)
      const tMachine: RoutineBaseTemplate = {
        id: 't_mach', activity_key: '1.15', name: 'Papeleo Mecánico', zone: 'Playa', unit: 'M2',
        rendimiento: 1000, frecuencia: 4, cantidad: 4000,
        counts_capacity: false,
      };

      const result = generateRoutineScheduleForWeek([tMachine], weekStart, [], { siteDailyCapacity: 2.0 });
      expect(result.assignments.length).toBe(1); // No se divide porque counts_capacity = false
      expect(result.assignments[0].dateStr).toBe('2026-09-07');
      expect(result.assignments[0].cantidad).toBe(4000);
      expect(result.assignments[0].counts_capacity).toBe(false);
    });

    test('Festivo + reparto: si Lunes es festivo, se reparte entre Martes a Sábado', () => {
      // Semana del 2026-07-20 (Lunes 20 de Julio es festivo en Colombia)
      const weekWithHoliday = '2026-07-20';
      const t1: RoutineBaseTemplate = {
        id: 't1', activity_key: '1.09', name: 'Troncos', zone: 'Playa', unit: 'UND',
        rendimiento: 30, frecuencia: 4, cantidad: 30,
        counts_capacity: true,
      };

      const result = generateRoutineScheduleForWeek([t1], weekWithHoliday, []);
      expect(result.assignments.length).toBe(1);
      // Debe asignarse a Martes 21 (primer día hábil)
      expect(result.assignments[0].dateStr).toBe('2026-07-21');
    });

    test('Determinismo estricto: dos corridas idénticas producen proyecciones idénticas', () => {
      const templates: RoutineBaseTemplate[] = [
        { id: 't1', activity_key: '1.01', name: 'Corte', zone: 'Zona', unit: 'M2', rendimiento: 1000, frecuencia: 25, cantidad: 1000, counts_capacity: true },
        { id: 't2', activity_key: '2.16', name: 'Lavado', zone: 'Zona', unit: 'M2', rendimiento: 1000, frecuencia: 12, cantidad: 500, counts_capacity: true },
        { id: 't3', activity_key: '1.15', name: 'Máquina', zone: 'Playa', unit: 'M2', rendimiento: 500, frecuencia: 4, cantidad: 1000, counts_capacity: false },
        { id: 't4', activity_key: '3.04', name: 'Vidrios', zone: 'Edificio', unit: 'M2', rendimiento: 200, frecuencia: 4, cantidad: 400, counts_capacity: true },
      ];

      const run1 = generateRoutineScheduleForWeek(templates, weekStart, [], { siteDailyCapacity: 5.0 });
      const run2 = generateRoutineScheduleForWeek(templates, weekStart, [], { siteDailyCapacity: 5.0 });

      expect(run1).toEqual(run2);
    });
  });

  describe('5. Telemetría de Capacidad en Servicio de Materialización (A3)', () => {
    test('Materialization service registra conteo de capacidad, jornales de máquina y detalle diario', async () => {
      let loggedEvents: any[] = [];
      const boardId = '3ea0326f-6ff7-409f-848a-1f296e6e3cc8';
      const siteId = 'site_cap_test';

      const mockSupabase: any = {
        from: (table: string) => {
          if (table === 'poa' || table === 'poas') return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
          if (table === 'poa_versions') {
            return createMockQuery([{ id: 'ver_1', poa_id: 'poa_1', status: 'active', poa: { id: 'poa_1', board_id: boardId } }]);
          }
          if (table === 'poa_activities') {
            return createMockQuery([
              { id: 'pa_101', poa_version_id: 'ver_1', activity_key: '1.01', frecuencia: 25 },
              { id: 'pa_115', poa_version_id: 'ver_1', activity_key: '1.15', frecuencia: 4 },
            ]);
          }
          if (table === 'poa_activity_zones') {
            return createMockQuery([
              { id: 'paz_101', poa_activity_id: 'pa_101', zone_id: siteId, cantidad_contratada: 2000 },
              { id: 'paz_115', poa_activity_id: 'pa_115', zone_id: siteId, cantidad_contratada: 1000 },
            ]);
          }
          if (table === 'board_activity_standards') {
            return createMockQuery([
              { id: 'std_101', activity_key: '1.01', name: 'Corte', unit: 'M2', category: 'Zona', rendimiento: 1000, requiere_rendimiento: true },
              { id: 'std_115', activity_key: '1.15', name: 'Máquina', unit: 'M2', category: 'Zona', rendimiento: 500, requiere_rendimiento: true },
            ]);
          }
          if (table === 'operational_frequencies') {
            return createMockQuery([
              { activity_key: '1.01', visits_per_month: 25, source: 'CRONOGRAMA', qty_mode: 'FULL', rendimiento: 1000, counts_capacity: true },
              { activity_key: '1.15', visits_per_month: 4, source: 'CRONOGRAMA', qty_mode: 'FULL', rendimiento: 500, counts_capacity: false },
            ]);
          }
          if (table === 'site_daily_capacity') {
            return createMockQuery({ jornales_dia: 3.0, source: 'COSTOS GENERALES V3' });
          }
          return createMockQuery([]);
        },
        rpc: (name: string, params: any) => {
          if (name === 'ensure_weekly_plan_header') {
            return Promise.resolve({ data: 'plan_telemetry_test', error: null });
          }
          if (name === 'sync_weekly_plan_items_rpc') {
            return Promise.resolve({ data: params.p_items, error: null });
          }
          if (name === 'log_materialization_event_rpc') {
            loggedEvents.push(params);
            return Promise.resolve({ data: 'evt_1', error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };

      const result = await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStart);
      expect(result.totalItems).toBeGreaterThan(0);

      const summaryEvt = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY');
      expect(summaryEvt).toBeDefined();
      expect(summaryEvt.p_payload.daily_journals).toBeDefined();
      expect(summaryEvt.p_payload.daily_machine_journals).toBeDefined();
      expect(summaryEvt.p_payload.daily_capacity_detail).toBeDefined();
      expect(summaryEvt.p_payload.site_daily_capacity).toBe(3.0);
    });
  });
});
