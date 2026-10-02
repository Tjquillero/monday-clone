import {
  generateRoutineScheduleForWeek,
  projectMonthlyLowFrequencyAllocation,
  getMonthlyCandidateWeeks,
  RoutineBaseTemplate,
} from '../routineScheduler';
import { ensureWeeklyPlanMaterialized } from '../scheduleMaterializationService';

describe('GATE FREQ-OP-04 — Decisión D29: Reparto Mensual entre Semanas', () => {
  const baseDailyTemplate: RoutineBaseTemplate = {
    id: 'std-daily',
    activity_key: '1.01',
    name: 'Limpieza Diaria',
    zone: 'Zona Playa',
    unit: 'M²',
    rendimiento: 1000,
    frecuencia: 25, // Diaria (Lun-Sáb) -> ~1.5 jr/día
    cantidad: 1500,
    counts_capacity: true,
  };

  const lowFreqTemplates: RoutineBaseTemplate[] = [
    {
      id: 'std-f1',
      activity_key: '1.08',
      name: 'Limpieza Profunda Mensual',
      zone: 'Zona Playa',
      unit: 'M²',
      rendimiento: 500,
      frecuencia: 1, // 1x/mes -> 4.0 jr
      cantidad: 2000,
      counts_capacity: true,
    },
    {
      id: 'std-f2',
      activity_key: '1.02',
      name: 'Desmalezado Quincenal',
      zone: 'Zona Playa',
      unit: 'M²',
      rendimiento: 500,
      frecuencia: 2, // 2x/mes -> 3.0 jr por visita
      cantidad: 1500,
      counts_capacity: true,
    },
    {
      id: 'std-f05',
      activity_key: '1.05',
      name: 'Mantenimiento Bimestral',
      zone: 'Zona Playa',
      unit: 'M²',
      rendimiento: 200,
      frecuencia: 0.5, // Bimestral (meses pares) -> 2.5 jr
      cantidad: 500,
      counts_capacity: true,
    },
    {
      id: 'std-f033',
      activity_key: '1.07',
      name: 'Tratamiento Trimestral',
      zone: 'Zona Playa',
      unit: 'M²',
      rendimiento: 100,
      frecuencia: 0.33, // Trimestral (mes % 3 = 1) -> 2.0 jr
      cantidad: 200,
      counts_capacity: true,
    },
  ];

  const allTemplates = [baseDailyTemplate, ...lowFreqTemplates];

  // ---------------------------------------------------------------------------
  // A1: Aplicabilidad de Frecuencias
  // ---------------------------------------------------------------------------
  describe('A1: Frecuencias 2, 1, 0.5 y 0.33', () => {
    it('programa 0.5 solo en meses pares (ej. Febrero = 2, Octubre = 10)', () => {
      // Octubre 2026 (mes 10: par)
      const weekStartOct = '2026-10-05'; // Semana 1 Octubre
      const allocOct = projectMonthlyLowFrequencyAllocation(allTemplates, weekStartOct);
      const allOctActivities = Array.from(allocOct.values()).flat();
      expect(allOctActivities.some((t) => t.activity_key === '1.05')).toBe(true);

      // Septiembre 2026 (mes 9: impar)
      const weekStartSep = '2026-09-07'; // Semana 1 Septiembre
      const allocSep = projectMonthlyLowFrequencyAllocation(allTemplates, weekStartSep);
      const allSepActivities = Array.from(allocSep.values()).flat();
      expect(allSepActivities.some((t) => t.activity_key === '1.05')).toBe(false);
    });

    it('programa 0.33 solo en meses donde (mes % 3 === 1) (ej. Octubre = 10, Enero = 1, Abril = 4)', () => {
      // Octubre 2026 (10 % 3 = 1) -> SÍ
      const allocOct = projectMonthlyLowFrequencyAllocation(allTemplates, '2026-10-05');
      const allOctActivities = Array.from(allocOct.values()).flat();
      expect(allOctActivities.some((t) => t.activity_key === '1.07')).toBe(true);

      // Septiembre 2026 (9 % 3 = 0) -> NO
      const allocSep = projectMonthlyLowFrequencyAllocation(allTemplates, '2026-09-07');
      const allSepActivities = Array.from(allocSep.values()).flat();
      expect(allSepActivities.some((t) => t.activity_key === '1.07')).toBe(false);

      // Noviembre 2026 (11 % 3 = 2) -> NO
      const allocNov = projectMonthlyLowFrequencyAllocation(allTemplates, '2026-11-02');
      const allNovActivities = Array.from(allocNov.values()).flat();
      expect(allNovActivities.some((t) => t.activity_key === '1.07')).toBe(false);
    });

    it('las frecuencias 25, 12, 8, 6 y 4 se programan normalmente en sus semanas', () => {
      const recurringTemplate4: RoutineBaseTemplate = {
        id: 'std-f4',
        activity_key: '1.04',
        name: 'Actividad Semanal',
        zone: 'Zona',
        unit: 'M²',
        rendimiento: 500,
        frecuencia: 4,
        cantidad: 500,
        counts_capacity: true,
      };

      const projW1 = generateRoutineScheduleForWeek([recurringTemplate4], '2026-09-07');
      const projW2 = generateRoutineScheduleForWeek([recurringTemplate4], '2026-09-14');
      const projW3 = generateRoutineScheduleForWeek([recurringTemplate4], '2026-09-21');
      const projW4 = generateRoutineScheduleForWeek([recurringTemplate4], '2026-09-28');

      expect(projW1.assignments.some((a) => a.activity_key === '1.04')).toBe(true);
      expect(projW2.assignments.some((a) => a.activity_key === '1.04')).toBe(true);
      expect(projW3.assignments.some((a) => a.activity_key === '1.04')).toBe(true);
      expect(projW4.assignments.some((a) => a.activity_key === '1.04')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // A2: Semanas Candidatas 1 a 4 y Exclusión de Semana 5
  // ---------------------------------------------------------------------------
  describe('A2: Semanas candidatas y semana 5', () => {
    it('identifica correctamente las semanas candidatas cuyo lunes cae en el mes (semanas 1 a 4)', () => {
      // Septiembre 2026: Lunes 7, 14, 21, 28 (4 semanas)
      const candSep = getMonthlyCandidateWeeks('2026-09-07');
      expect(candSep.length).toBe(4);
      expect(candSep.map((c) => c.weekStartStr)).toEqual([
        '2026-09-07',
        '2026-09-14',
        '2026-09-21',
        '2026-09-28',
      ]);
    });

    it('la semana 5 no recibe visitas de baja frecuencia (freq < 4)', () => {
      // Agosto 2026 tiene 5 lunes: 3, 10, 17, 24, 31 (Lunes 31 es semana 5)
      const candAug = getMonthlyCandidateWeeks('2026-08-31');
      expect(candAug.length).toBe(5);

      const projW5 = generateRoutineScheduleForWeek(allTemplates, '2026-08-31');
      // Solo deben programarse actividades con freq >= 4
      const nonDailyInW5 = projW5.assignments.filter(
        (a) => a.frequency_interval < 4
      );
      expect(nonDailyInW5).toHaveLength(0);
    });

    it('si una semana fija existente ya tiene el plan con la actividad, cuenta como realizada', () => {
      // Simulamos que la semana 2 (2026-09-14) ya tiene plan existente con '1.08' (freq 1)
      const existingPlans = [
        {
          week_start: '2026-09-14',
          items: [
            { activity_key: '1.01', planned_jr: 9.0, counts_capacity: true },
            { activity_key: '1.08', planned_jr: 4.0, counts_capacity: true },
          ],
        },
      ];

      const alloc = projectMonthlyLowFrequencyAllocation(allTemplates, '2026-09-07', {
        existingMonthPlans: existingPlans,
      });

      // '1.08' debe estar en 2026-09-14 y NO duplicarse en otra semana
      expect(alloc.get('2026-09-14')?.some((t) => t.activity_key === '1.08')).toBe(true);
      expect(alloc.get('2026-09-07')?.some((t) => t.activity_key === '1.08')).toBe(false);
      expect(alloc.get('2026-09-21')?.some((t) => t.activity_key === '1.08')).toBe(false);
      expect(alloc.get('2026-09-28')?.some((t) => t.activity_key === '1.08')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // A3: Proyección Mensual Determinista y Selección de Pares para Frecuencia 2
  // ---------------------------------------------------------------------------
  describe('A3: Proyección determinista y balanceo de carga', () => {
    it('frecuencia 2 asigna sus 2 visitas al par de menor carga (1-3 o 2-4)', () => {
      // Septiembre 2026: sin festivos en semanas 1..4, cargas base iguales (9 JR c/u)
      // Actividad de freq 1 (1.08, 4 JR) va a semana 1 por empate (menor semana).
      // Al quedar Semana 1 con 13 JR, el par (1,3) tiene carga 13+9 = 22 JR.
      // El par (2,4) tiene carga 9+9 = 18 JR.
      // Por tanto, la actividad de freq 2 (1.02) DEBE ir al par (2, 4).
      const alloc = projectMonthlyLowFrequencyAllocation(allTemplates, '2026-09-07');

      const w1 = alloc.get('2026-09-07') || [];
      const w2 = alloc.get('2026-09-14') || [];
      const w3 = alloc.get('2026-09-21') || [];
      const w4 = alloc.get('2026-09-28') || [];

      // 1.08 (freq 1) en semana 1
      expect(w1.some((t) => t.activity_key === '1.08')).toBe(true);

      // 1.02 (freq 2) en semanas 2 y 4 (par 2-4)
      expect(w2.some((t) => t.activity_key === '1.02')).toBe(true);
      expect(w4.some((t) => t.activity_key === '1.02')).toBe(true);
      expect(w1.some((t) => t.activity_key === '1.02')).toBe(false);
      expect(w3.some((t) => t.activity_key === '1.02')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // A4: Dentro de la semana elegida, D27 se mantiene
  // ---------------------------------------------------------------------------
  describe('A4: D27 dentro de la semana elegida', () => {
    it('asigna la visita única al día hábil de menor carga acumulada dentro de la semana', () => {
      // Semana 1 Septiembre 2026: Lunes 7 a Sábado 12
      const projW1 = generateRoutineScheduleForWeek(allTemplates, '2026-09-07');
      const assign108 = projW1.assignments.filter((a) => a.activity_key === '1.08');
      expect(assign108.length).toBeGreaterThan(0);
      // Asignado al primer día de menor carga (Lunes 7)
      expect(assign108[0].dateStr).toBe('2026-09-07');
    });

    it('divide la visita si no cabe en el día de menor carga según siteDailyCapacity', () => {
      // Template con 6 JR y capacidad de 3 JR/día
      const bigTemplate: RoutineBaseTemplate = {
        id: 'std-big',
        activity_key: '1.08',
        name: 'Gran Limpieza Mensual',
        zone: 'Zona',
        unit: 'M²',
        rendimiento: 500,
        frecuencia: 1,
        cantidad: 3000, // 6 JR
        counts_capacity: true,
      };

      const proj = generateRoutineScheduleForWeek([bigTemplate], '2026-09-07', [], {
        siteDailyCapacity: 3.0,
      });

      const parts = proj.assignments.filter((a) => a.activity_key === '1.08');
      expect(parts.length).toBeGreaterThanOrEqual(2);
      const totalQty = parts.reduce((sum, p) => sum + p.cantidad, 0);
      const totalJr = parts.reduce((sum, p) => sum + p.theoretical_jr, 0);
      expect(Math.round(totalQty)).toBe(3000);
      expect(Number(totalJr.toFixed(2))).toBe(6.0);
    });
  });

  // ---------------------------------------------------------------------------
  // A5: Invarianza del Orden de Materialización
  // ---------------------------------------------------------------------------
  describe('A5: Invarianza del Orden de Materialización', () => {
    it('materializar semana 3 antes que semana 2 produce exactamente el mismo resultado que en orden cronológico', () => {
      // Caso 1: Cronológico (semana 2, luego semana 3)
      const projW2_order1 = generateRoutineScheduleForWeek(allTemplates, '2026-09-14');
      const existingAfterW2 = [
        {
          week_start: '2026-09-14',
          items: projW2_order1.assignments.map((a) => ({
            activity_key: a.activity_key,
            planned_jr: a.theoretical_jr,
            counts_capacity: a.counts_capacity,
          })),
        },
      ];
      const projW3_order1 = generateRoutineScheduleForWeek(allTemplates, '2026-09-21', [], {
        existingMonthPlans: existingAfterW2,
      });

      // Caso 2: Inverso (semana 3, luego semana 2)
      const projW3_order2 = generateRoutineScheduleForWeek(allTemplates, '2026-09-21');
      const existingAfterW3 = [
        {
          week_start: '2026-09-21',
          items: projW3_order2.assignments.map((a) => ({
            activity_key: a.activity_key,
            planned_jr: a.theoretical_jr,
            counts_capacity: a.counts_capacity,
          })),
        },
      ];
      const projW2_order2 = generateRoutineScheduleForWeek(allTemplates, '2026-09-14', [], {
        existingMonthPlans: existingAfterW3,
      });

      // Comparación estricta de asignaciones
      expect(projW2_order1.assignments.map((a) => ({ key: a.activity_key, date: a.dateStr, jr: a.theoretical_jr })))
        .toEqual(projW2_order2.assignments.map((a) => ({ key: a.activity_key, date: a.dateStr, jr: a.theoretical_jr })));

      expect(projW3_order1.assignments.map((a) => ({ key: a.activity_key, date: a.dateStr, jr: a.theoretical_jr })))
        .toEqual(projW3_order2.assignments.map((a) => ({ key: a.activity_key, date: a.dateStr, jr: a.theoretical_jr })));
    });
  });

  // ---------------------------------------------------------------------------
  // A6: Error de lectura de planes mensuales → MONTH_PROJECTION_READ_FAILED
  // ---------------------------------------------------------------------------
  describe('A6: Gobernanza de error en lectura de planes del mes', () => {
    it('falla cerrado con MONTH_PROJECTION_READ_FAILED si la consulta de planes existentes del mes falla', async () => {
      const mockSupabase: any = {
        from: (table: string) => {
          if (table === 'poa') {
            return {
              select: () => ({ eq: () => Promise.resolve({ data: [{ id: 'poa-1' }], error: null }) }),
            };
          }
          if (table === 'poa_versions') {
            return {
              select: () => ({
                in: () => ({ eq: () => Promise.resolve({ data: [{ id: 'v-1', poa_id: 'poa-1' }], error: null }) }),
              }),
            };
          }
          if (table === 'poa_activities') {
            return {
              select: () => ({
                eq: () => ({
                  order: () => Promise.resolve({ data: [{ id: 'pa-1', activity_key: '1.01' }], error: null }),
                }),
              }),
            };
          }
          if (table === 'poa_activity_zones') {
            return {
              select: () => ({
                eq: () => ({
                  in: () => ({
                    order: () => Promise.resolve({ data: [{ id: 'paz-1', poa_activity_id: 'pa-1', cantidad_contratada: 100 }], error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === 'operational_frequencies') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => Promise.resolve({
                    data: [{ activity_key: '1.01', visits_per_month: 25, source: 'CRONOGRAMA', counts_capacity: true }],
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'resource_analysis') {
            return {
              select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: { scope_data: { '1.01': 100 } }, error: null }) }) }),
            };
          }
          if (table === 'site_daily_capacity') {
            return {
              select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: { jornales_dia: 8.32 }, error: null }) }) }),
            };
          }
          if (table === 'board_activity_standards') {
            return {
              select: () => ({
                eq: () => Promise.resolve({
                  data: [{ id: 'std-1', activity_key: '1.01', name: 'Limpieza', unit: 'M²', rendimiento: 100, requiere_rendimiento: true, priority: 'must_execute' }],
                  error: null,
                }),
              }),
            };
          }
          if (table === 'weekly_plans') {
            return {
              select: () => ({
                eq: () => ({ eq: () => ({ in: () => Promise.resolve({ data: null, error: { message: 'Database query timeout' } }) }) }),
              }),
            };
          }
          if (table === 'materialization_events') {
            return {
              insert: () => Promise.resolve({ data: null, error: null }),
            };
          }
          return {
            select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
          };
        },
      };

      await expect(
        ensureWeeklyPlanMaterialized(mockSupabase, 'board-test', 'group-test', '2026-09-07')
      ).rejects.toThrow(/MONTH_PROJECTION_READ_FAILED/);
    });
  });
});
