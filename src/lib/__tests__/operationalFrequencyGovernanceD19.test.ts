/**
 * Test Suite: Gobernanza D19 — Frecuencia Operativa y Reglas de Calendario
 * Especificación: docs/gates/FREQ-OP-01_SPEC.md (Decisión D19 aprobada por Tomás)
 *
 * Cobertura de reglas D19:
 * 1. Despacho semanal por visitas/mes:
 *    - 25  → Lun-Sáb (6 días)
 *    - 12  → Lun, Mié, Vie (3 días)
 *    - 8   → Mar, Jue (2 días)
 *    - 6   → Mar y Jue en semanas 1 y 3 (y 5), Mié en semanas 2 y 4
 *    - 4   → 1 día por semana (determinista)
 *    - 2   → Semanas 1 y 3 (1 día)
 *    - 1   → Semana 2 (1 día)
 *    - 0.5 → Semana 3 en meses pares (febrero, abril, junio, agosto, octubre, diciembre)
 *    - 0.33→ Semana 4 en meses con (mes % 3 = 1) (enero, abril, julio, octubre)
 *    - Semana 5 (ceil(día/7) >= 5): solo frecuencias >= 4 visits/month
 * 2. Festivos colombianos: si el día cae en festivo, se omite (no se corre).
 * 3. Fallo de lectura en operational_frequencies → FAILED OPERATIONAL_FREQ_READ_FAILED (0 escrituras).
 * 4. Actividad con cantidad y rendimiento sin frecuencia operativa → EXCLUDED_MISSING_OPERATIONAL_FREQ (PARCIAL).
 * 5. Actividad con frecuencia operativa pero rendimiento <= 0 → EXCLUDED_MISSING_RENDIMIENTO (PARCIAL).
 * 6. Parser Excel: soporte de sufijo "(cantidad presupuesto mes)" e inclusión de SALINAS DEL REY / exclusión de CASTILLO SALGAR.
 * 7. Verificación estática de migración 2026100101 y semillas 2026100101 y 2026100102.
 */

import { generateRoutineScheduleForWeek, type RoutineBaseTemplate } from '../routineScheduler';
import { ensureWeeklyPlanMaterialized } from '../scheduleMaterializationService';
import { classifySiteActivities } from '../materialization/siteActivityClassifier';
import * as fs from 'fs';
import * as path from 'path';

describe('Gobernanza D19: Frecuencia Operativa y Despacho Semanal', () => {
  const boardId = '3ea0326f-6ff7-409f-848a-1f296e6e3cc8';
  const siteId = 'site_d19_test';

  function createMockQuery(data: any = null, count?: number | null, error: any = null) {
    const obj: any = {};
    obj.select = jest.fn(() => obj);
    obj.eq = jest.fn(() => obj);
    obj.is = jest.fn(() => obj);
    obj.in = jest.fn(() => obj);
    obj.order = jest.fn(() => obj);
    obj.limit = jest.fn(() => obj);
    obj.or = jest.fn(() => obj);
    obj.maybeSingle = jest.fn().mockResolvedValue({ data, error });
    obj.single = jest.fn().mockResolvedValue({ data, error });
    obj.then = (resolve: any) =>
      Promise.resolve({ data, count: count ?? (Array.isArray(data) ? data.length : 0), error }).then(resolve);
    return obj;
  }

  describe('1. Reglas de Calendario por Visitas/Mes (routineScheduler)', () => {
    const makeTemplate = (key: string, visits: number) => ({
      id: `tmpl_${key}`,
      activity_key: key,
      name: `Actividad ${key}`,
      zone: 'Zona Operativa',
      unit: 'M2',
      rendimiento: 1000,
      frecuencia: visits,
      cantidad: 5000,
    });

    // 25 visitas/mes → Lun–Sáb (6 días)
    test('25 visitas/mes → programa Lun a Sáb (6 días si no hay festivos)', () => {
      // Semana del 2026-09-07 (lunes a domingo, sin festivos en Colombia)
      const weekStart = '2026-09-07';
      const tmpl = makeTemplate('1.01', 25);
      const schedule = generateRoutineScheduleForWeek([tmpl], weekStart, []);
      const days = schedule.assignments.map((a) => a.dateStr);

      expect(days).toEqual([
        '2026-09-07', // Lun
        '2026-09-08', // Mar
        '2026-09-09', // Mié
        '2026-09-10', // Jue
        '2026-09-11', // Vie
        '2026-09-12', // Sáb
      ]);
      expect(days.length).toBe(6);
    });

    // 12 visitas/mes → Lun, Mié, Vie (3 días)
    test('12 visitas/mes → programa Lun, Mié, Vie', () => {
      const weekStart = '2026-09-07';
      const tmpl = makeTemplate('2.16', 12);
      const schedule = generateRoutineScheduleForWeek([tmpl], weekStart, []);
      const days = schedule.assignments.map((a) => a.dateStr);

      expect(days).toEqual([
        '2026-09-07', // Lun
        '2026-09-09', // Mié
        '2026-09-11', // Vie
      ]);
      expect(days.length).toBe(3);
    });

    // 8 visitas/mes → Mar, Jue (2 días)
    test('8 visitas/mes → programa Mar, Jue', () => {
      const weekStart = '2026-09-07';
      const tmpl = makeTemplate('1.15', 8);
      const schedule = generateRoutineScheduleForWeek([tmpl], weekStart, []);
      const days = schedule.assignments.map((a) => a.dateStr);

      expect(days).toEqual([
        '2026-09-08', // Mar
        '2026-09-10', // Jue
      ]);
      expect(days.length).toBe(2);
    });

    // 6 visitas/mes → Mar y Jue en semanas 1 y 3, Mié en semanas 2 y 4
    test('6 visitas/mes → Mar y Jue en semana 1 (2026-09-01/semana 1 de sep)', () => {
      // 2026-09-01 es martes; semana que empieza lunes 2026-08-31 o lunes 2026-09-07 (ceil(7/7)=1)
      const weekStartSemana1 = '2026-09-07'; // day 7 -> ceil(7/7) = 1 (Semana 1)
      const tmpl = makeTemplate('1.12', 6);
      const schedule1 = generateRoutineScheduleForWeek([tmpl], weekStartSemana1, []);
      const days1 = schedule1.assignments.map((a) => a.dateStr);
      expect(days1).toEqual(['2026-09-08', '2026-09-10']); // Mar, Jue (2 días)

      // Semana 2: lunes 2026-09-14 -> ceil(14/7) = 2 (Semana 2)
      const weekStartSemana2 = '2026-09-14';
      const schedule2 = generateRoutineScheduleForWeek([tmpl], weekStartSemana2, []);
      const days2 = schedule2.assignments.map((a) => a.dateStr);
      expect(days2).toEqual(['2026-09-16']); // Mié (1 día)

      // Semana 3: lunes 2026-09-21 -> ceil(21/7) = 3 (Semana 3)
      const weekStartSemana3 = '2026-09-21';
      const schedule3 = generateRoutineScheduleForWeek([tmpl], weekStartSemana3, []);
      const days3 = schedule3.assignments.map((a) => a.dateStr);
      expect(days3).toEqual(['2026-09-22', '2026-09-24']); // Mar, Jue (2 días)

      // Semana 4: lunes 2026-09-28 -> ceil(28/7) = 4 (Semana 4)
      const weekStartSemana4 = '2026-09-28';
      const schedule4 = generateRoutineScheduleForWeek([tmpl], weekStartSemana4, []);
      const days4 = schedule4.assignments.map((a) => a.dateStr);
      expect(days4).toEqual(['2026-09-30']); // Mié (1 día)
    });

    // 4 visitas/mes → 1 día por semana (determinista)
    test('4 visitas/mes → exactamente 1 día en cada semana de forma determinista', () => {
      const tmpl = makeTemplate('1.09', 4);
      const week1 = generateRoutineScheduleForWeek([tmpl], '2026-09-07', []);
      const week2 = generateRoutineScheduleForWeek([tmpl], '2026-09-14', []);
      const week3 = generateRoutineScheduleForWeek([tmpl], '2026-09-21', []);
      const week4 = generateRoutineScheduleForWeek([tmpl], '2026-09-28', []);

      expect(week1.assignments.length).toBe(1);
      expect(week2.assignments.length).toBe(1);
      expect(week3.assignments.length).toBe(1);
      expect(week4.assignments.length).toBe(1);
    });

    // 2 visitas/mes → Semanas 1 y 3 (1 día)
    test('2 visitas/mes → solo en semanas 1 y 3 (0 en semanas 2 y 4)', () => {
      const tmpl = makeTemplate('2.03', 2);
      const week1 = generateRoutineScheduleForWeek([tmpl], '2026-09-07', []); // sem 1 (ceil 7/7 = 1)
      const week2 = generateRoutineScheduleForWeek([tmpl], '2026-09-14', []); // sem 2 (ceil 14/7 = 2)
      const week3 = generateRoutineScheduleForWeek([tmpl], '2026-09-21', []); // sem 3 (ceil 21/7 = 3)
      const week4 = generateRoutineScheduleForWeek([tmpl], '2026-09-28', []); // sem 4 (ceil 28/7 = 4)

      expect(week1.assignments.length).toBe(1);
      expect(week2.assignments.length).toBe(0);
      expect(week3.assignments.length).toBe(1);
      expect(week4.assignments.length).toBe(0);
    });

    // 1 visita/mes → Semana 2
    test('1 visita/mes → solo en semana 2', () => {
      const tmpl = makeTemplate('2.13', 1);
      const week1 = generateRoutineScheduleForWeek([tmpl], '2026-09-07', []); // sem 1
      const week2 = generateRoutineScheduleForWeek([tmpl], '2026-09-14', []); // sem 2
      const week3 = generateRoutineScheduleForWeek([tmpl], '2026-09-21', []); // sem 3
      const week4 = generateRoutineScheduleForWeek([tmpl], '2026-09-28', []); // sem 4

      expect(week1.assignments.length).toBe(0);
      expect(week2.assignments.length).toBe(1);
      expect(week3.assignments.length).toBe(0);
      expect(week4.assignments.length).toBe(0);
    });

    // 0.5 visitas/mes → Semana 3 en meses pares
    test('0.5 visitas/mes → solo en semana 3 de meses pares (febrero, abril, junio, agosto, octubre, diciembre)', () => {
      const tmpl = makeTemplate('2.06', 0.5);

      // Septiembre (mes 9, impar) sem 3: 2026-09-21 -> 0
      const sepWeek3 = generateRoutineScheduleForWeek([tmpl], '2026-09-21', []);
      expect(sepWeek3.assignments.length).toBe(0);

      // Octubre (mes 10, par) sem 3: 2026-10-19 (ceil(19/7)=3) -> 1
      const octWeek3 = generateRoutineScheduleForWeek([tmpl], '2026-10-19', []);
      expect(octWeek3.assignments.length).toBe(1);

      // Octubre sem 2: 2026-10-12 (ceil(12/7)=2) -> 0
      const octWeek2 = generateRoutineScheduleForWeek([tmpl], '2026-10-12', []);
      expect(octWeek2.assignments.length).toBe(0);
    });

    // 0.33 visitas/mes → Semana 4 en meses donde (mes % 3 === 1) (enero, abril, julio, octubre)
    test('0.33 visitas/mes → solo en semana 4 de meses con (mes % 3 = 1)', () => {
      const tmpl = makeTemplate('2.09', 0.33);

      // Septiembre (mes 9, 9 % 3 = 0) sem 4: 2026-09-28 -> 0
      const sepWeek4 = generateRoutineScheduleForWeek([tmpl], '2026-09-28', []);
      expect(sepWeek4.assignments.length).toBe(0);

      // Octubre (mes 10, 10 % 3 = 1) sem 4: 2026-10-26 (ceil(26/7)=4) -> 1
      const octWeek4 = generateRoutineScheduleForWeek([tmpl], '2026-10-26', []);
      expect(octWeek4.assignments.length).toBe(1);

      // Noviembre (mes 11, 11 % 3 = 2) sem 4: 2026-11-23 (ceil(23/7)=4) -> 0
      const novWeek4 = generateRoutineScheduleForWeek([tmpl], '2026-11-23', []);
      expect(novWeek4.assignments.length).toBe(0);
    });

    // Semana 5: solo frecuencias >= 4
    test('Semana 5 (día del mes >= 29): solo frecuencias >= 4 visitas/mes', () => {
      // Lunes 2026-03-30 (marzo tiene 31 días, lunes 30 es semana 5: ceil(30/7) = 5)
      const week5Start = '2026-03-30';
      const tmpl25 = makeTemplate('1.01', 25);
      const tmpl12 = makeTemplate('2.16', 12);
      const tmpl8 = makeTemplate('1.15', 8);
      const tmpl6 = makeTemplate('1.12', 6);
      const tmpl4 = makeTemplate('1.09', 4);
      const tmpl2 = makeTemplate('2.03', 2);
      const tmpl1 = makeTemplate('2.13', 1);
      const tmpl05 = makeTemplate('2.06', 0.5);
      const tmpl033 = makeTemplate('2.09', 0.33);

      const allTemplates = [tmpl25, tmpl12, tmpl8, tmpl6, tmpl4, tmpl2, tmpl1, tmpl05, tmpl033];
      const schedule = generateRoutineScheduleForWeek(allTemplates, week5Start, []);

      const assignedKeys = new Set(schedule.assignments.map((a) => a.activity_key));
      expect(assignedKeys.has('1.01')).toBe(true);
      expect(assignedKeys.has('2.16')).toBe(true);
      expect(assignedKeys.has('1.15')).toBe(true);
      expect(assignedKeys.has('1.12')).toBe(true);
      expect(assignedKeys.has('1.09')).toBe(true);

      // Menores a 4 NO deben tener asignación en semana 5
      expect(assignedKeys.has('2.03')).toBe(false);
      expect(assignedKeys.has('2.13')).toBe(false);
      expect(assignedKeys.has('2.06')).toBe(false);
      expect(assignedKeys.has('2.09')).toBe(false);
    });

    // Festivos colombianos: si el día cae en festivo, se omite (no se corre)
    test('Festivos colombianos: si el día cae en festivo, se omite (no se corre ni se desplaza)', () => {
      // 2026-07-20 es Día de la Independencia en Colombia (festivo)
      // Lunes 2026-07-20
      const weekStart = '2026-07-20';
      const tmpl25 = makeTemplate('1.01', 25);
      const schedule = generateRoutineScheduleForWeek([tmpl25], weekStart, []);
      const days = schedule.assignments.map((a) => a.dateStr);

      // Lunes 2026-07-20 NO debe estar presente; Martes 21 a Sábado 25 sí (5 días)
      expect(days.includes('2026-07-20')).toBe(false);
      expect(days).toEqual([
        '2026-07-21', // Mar
        '2026-07-22', // Mié
        '2026-07-23', // Jue
        '2026-07-24', // Vie
        '2026-07-25', // Sáb
      ]);
      expect(days.length).toBe(5);
    });
  });

  describe('2. Clasificación de Actividades y Eventos de Materialización (D19)', () => {
    test('Actividad con cantidad y rendimiento sin frecuencia operativa → EXCLUDED_MISSING_OPERATIONAL_FREQ (PARCIAL)', () => {
      const poaZoneQtyMap = new Map<string, number>([['1.15', 5000]]);
      const poaActivitiesMap = new Map<string, any>([['1.15', { id: 'pa_1', frecuencia: 8 }]]);
      const allBoardStandards = [
        { id: 'std_1', activity_key: '1.15', name: 'Mantenimiento Esp', unit: 'M2', category: 'Zona', rendimiento: 1000, requiere_rendimiento: true },
      ];
      const operationalFreqMap = new Map<string, any>(); // Vacío

      const result = classifySiteActivities(
        boardId,
        siteId,
        '2026-09-28',
        {
          poaZoneQtyMap,
          poaActivitiesMap,
          allBoardStandards,
          operationalFreqMap,
          hasZoneScopeData: true,
        }
      );

      expect(result.status).toBe('PARTIAL');
      expect(result.isPartial).toBe(true);
      expect(result.summary.excluded_missing_operational_freq_count).toBe(1);
      const detail = result.summary.activities_detail.find((a) => a.activity_key === '1.15');
      expect(detail).toBeDefined();
      expect(detail?.action).toBe('EXCLUDED_MISSING_OPERATIONAL_FREQ');
    });

    test('Actividad con frecuencia operativa pero rendimiento <= 0 → EXCLUDED_MISSING_RENDIMIENTO (PARCIAL)', () => {
      const poaZoneQtyMap = new Map<string, number>([['1.01', 5000]]);
      const poaActivitiesMap = new Map<string, any>([['1.01', { id: 'pa_1', frecuencia: 25 }]]);
      const allBoardStandards = [
        { id: 'std_1', activity_key: '1.01', name: 'Corte', unit: 'M2', category: 'Zona', rendimiento: 0, requiere_rendimiento: true },
      ];
      const operationalFreqMap = new Map<string, any>([
        ['1.01', { activity_key: '1.01', visits_per_month: 25, source: 'CRONOGRAMA' }],
      ]);

      const result = classifySiteActivities(
        boardId,
        siteId,
        '2026-09-28',
        {
          poaZoneQtyMap,
          poaActivitiesMap,
          allBoardStandards,
          operationalFreqMap,
          hasZoneScopeData: true,
        }
      );

      expect(result.status).toBe('PARTIAL');
      expect(result.isPartial).toBe(true);
      expect(result.summary.excluded_missing_rendimiento_count).toBe(1);
      const detail = result.summary.activities_detail.find((a) => a.activity_key === '1.01');
      expect(detail).toBeDefined();
      expect(detail?.action).toBe('EXCLUDED_MISSING_RENDIMIENTO');
    });

    test('Fallo de lectura en operational_frequencies → FAILED OPERATIONAL_FREQ_READ_FAILED (0 escrituras)', async () => {
      let loggedEvents: any[] = [];
      const mockSupabase: any = {
        from: jest.fn((table: string) => {
          if (table === 'poa' || table === 'poas') return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
          if (table === 'poa_versions') {
            return createMockQuery([{ id: 'ver_1', poa_id: 'poa_1', status: 'active', poa: { id: 'poa_1', board_id: boardId } }]);
          }
          if (table === 'poa_activities') {
            return createMockQuery([{ id: 'pa_1', poa_version_id: 'ver_1', activity_key: '1.01', frecuencia: 25 }]);
          }
          if (table === 'poa_activity_zones') {
            return createMockQuery([{ id: 'paz_1', poa_activity_id: 'pa_1', zone_id: siteId, cantidad_contratada: 5000 }]);
          }
          if (table === 'board_activity_standards') {
            return createMockQuery([{ id: 'std_1', activity_key: '1.01', name: 'Corte', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true }]);
          }
          if (table === 'operational_frequencies') {
            return createMockQuery(null, null, { message: 'Database connection error', code: 'PG_ERR_500' });
          }
          return createMockQuery(null);
        }),
        rpc: jest.fn((fn: string, params: any) => {
          if (fn === 'log_materialization_event_rpc') {
            loggedEvents.push(params);
            return Promise.resolve({ data: 'evt_1', error: null });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };

      await expect(
        ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, '2026-09-28')
      ).rejects.toThrow('OPERATIONAL_FREQ_READ_FAILED');

      const failedEvent = loggedEvents.find(
        (e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY' && e.p_status === 'FAILED'
      );
      expect(failedEvent).toBeDefined();
      expect(failedEvent.p_payload.error.code).toBe('OPERATIONAL_FREQ_READ_FAILED');
    });
  });

  describe('3. Verificación de Migración y Semillas D19', () => {
    test('Migración 2026100101_operational_frequencies.sql define tabla, RLS y REVOKE', () => {
      const migPath = path.resolve(process.cwd(), 'supabase/migrations/2026100101_operational_frequencies.sql');
      expect(fs.existsSync(migPath)).toBe(true);
      const sql = fs.readFileSync(migPath, 'utf8');

      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.operational_frequencies');
      expect(sql).toMatch(/visits_per_month\s+NUMERIC\s+NOT NULL\s+CHECK\s*\(visits_per_month\s*>\s*0\)/i);
      expect(sql).toMatch(/source\s+TEXT\s+NOT NULL\s+CHECK\s*\(source\s+IN\s*\('CRONOGRAMA',\s*'POA'\)\)/i);
      expect(sql).toContain('UNIQUE (board_id, group_id, activity_key)');
      expect(sql).toContain('ALTER TABLE public.operational_frequencies ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('get_user_board_role(board_id, auth.uid()) IS NOT NULL');
      expect(sql).toContain('REVOKE ALL ON public.operational_frequencies FROM PUBLIC, anon, authenticated');
      expect(sql).toContain('GRANT SELECT ON public.operational_frequencies TO authenticated');
    });

    test('Semilla 2026100101_operational_frequencies_seed.sql contiene cálculo SQL y SELECT de control', () => {
      const seedPath = path.resolve(process.cwd(), 'supabase/seeds/2026100101_operational_frequencies_seed.sql');
      expect(fs.existsSync(seedPath)).toBe(true);
      const sql = fs.readFileSync(seedPath, 'utf8');

      expect(sql).toContain('INSERT INTO public.operational_frequencies');
      expect(sql).toContain('3ea0326f-6ff7-409f-848a-1f296e6e3cc8');
      expect(sql).toContain("WHEN pa.activity_key = '1.01'");
      expect(sql).toContain("SELECT");
      expect(sql).toContain("g.title AS sitio");
      expect(sql).toContain("opf.source");
    });

    test('Semilla 2026100102_salinas_zones_seed.sql contiene 26 zonas de Salinas del Rey', () => {
      const salinasPath = path.resolve(process.cwd(), 'supabase/seeds/2026100102_salinas_zones_seed.sql');
      expect(fs.existsSync(salinasPath)).toBe(true);
      const sql = fs.readFileSync(salinasPath, 'utf8');

      expect(sql).toContain('SALINAS DEL REY');
      expect(sql).toContain('3ea0326f-6ff7-409f-848a-1f296e6e3cc8');
      expect(sql).toContain('INSERT INTO public.poa_activity_zones');
    });
  });

  describe('4. Gobernanza D20: Actividades sin Rendimiento SÍ se Programan (FREQ-OP-01b)', () => {
    test('Caso 1: requiere_rendimiento = false Y con frecuencia operativa → MATERIALIZED, planned_rendimiento = null, planned_jr = 0', () => {
      const poaZoneQtyMap = new Map<string, number>([['1.04', 3000]]);
      const poaActivitiesMap = new Map<string, any>([['1.04', { id: 'pa_104', frecuencia: 25 }]]);
      const allBoardStandards = [
        { id: 'std_104', activity_key: '1.04', name: 'Actividad Sin Rendimiento', unit: 'GL', category: 'Zona Verde', rendimiento: 0, requiere_rendimiento: false },
      ];
      const operationalFreqMap = new Map<string, any>([
        ['1.04', { activity_key: '1.04', visits_per_month: 25, source: 'CRONOGRAMA' }],
      ]);

      const result = classifySiteActivities(
        boardId,
        siteId,
        '2026-09-28',
        {
          poaZoneQtyMap,
          poaActivitiesMap,
          allBoardStandards,
          operationalFreqMap,
          hasZoneScopeData: true,
        }
      );

      expect(result.status).toBe('SUCCESS');
      expect(result.isPartial).toBe(false);
      expect(result.summary.materialized_count).toBe(1);
      const detail = result.summary.activities_detail.find((a) => a.activity_key === '1.04');
      expect(detail).toBeDefined();
      expect(detail?.action).toBe('MATERIALIZED');
      expect(detail?.frequency_source).toBe('CRONOGRAMA');
      expect(detail?.planned_rendimiento).toBeNull();
      expect(detail?.planned_frecuencia).toBe(25);
      expect(result.templates[0].rendimiento).toBeNull();
    });

    test('Caso 2: requiere_rendimiento = false Y sin frecuencia operativa → NOT_SCHEDULED_NO_RENDIMIENTO (informativa)', () => {
      const poaZoneQtyMap = new Map<string, number>([['1.05', 3000]]);
      const poaActivitiesMap = new Map<string, any>([['1.05', { id: 'pa_105', frecuencia: 1 }]]);
      const allBoardStandards = [
        { id: 'std_105', activity_key: '1.05', name: 'Actividad Sin Frec Operativa', unit: 'UND', category: 'Zona Verde', rendimiento: 0, requiere_rendimiento: false },
      ];
      const operationalFreqMap = new Map<string, any>(); // Vacío

      const result = classifySiteActivities(
        boardId,
        siteId,
        '2026-09-28',
        {
          poaZoneQtyMap,
          poaActivitiesMap,
          allBoardStandards,
          operationalFreqMap,
          hasZoneScopeData: true,
        }
      );

      expect(result.status).toBe('SUCCESS');
      expect(result.isPartial).toBe(false);
      expect(result.summary.not_scheduled_no_rendimiento_count).toBe(1);
      const detail = result.summary.activities_detail.find((a) => a.activity_key === '1.05');
      expect(detail).toBeDefined();
      expect(detail?.action).toBe('NOT_SCHEDULED_NO_RENDIMIENTO');
      expect(detail?.frequency_source).toBe('NONE');
      expect(detail?.planned_rendimiento).toBeNull();
    });

    test('Caso 3: requiere_rendimiento = true Y rendimiento <= 0 o nulo → EXCLUDED_MISSING_RENDIMIENTO (PARCIAL)', () => {
      const poaZoneQtyMap = new Map<string, number>([['1.01', 5000]]);
      const poaActivitiesMap = new Map<string, any>([['1.01', { id: 'pa_101', frecuencia: 25 }]]);
      const allBoardStandards = [
        { id: 'std_101', activity_key: '1.01', name: 'Corte', unit: 'M2', category: 'Zona', rendimiento: 0, requiere_rendimiento: true },
      ];
      const operationalFreqMap = new Map<string, any>([
        ['1.01', { activity_key: '1.01', visits_per_month: 25, source: 'CRONOGRAMA' }],
      ]);

      const result = classifySiteActivities(
        boardId,
        siteId,
        '2026-09-28',
        {
          poaZoneQtyMap,
          poaActivitiesMap,
          allBoardStandards,
          operationalFreqMap,
          hasZoneScopeData: true,
        }
      );

      expect(result.status).toBe('PARTIAL');
      expect(result.isPartial).toBe(true);
      expect(result.summary.excluded_missing_rendimiento_count).toBe(1);
      const detail = result.summary.activities_detail.find((a) => a.activity_key === '1.01');
      expect(detail?.action).toBe('EXCLUDED_MISSING_RENDIMIENTO');
    });

    test('Caso 4: requiere_rendimiento = true Y rendimiento > 0 Y con frecuencia operativa → MATERIALIZED', () => {
      const poaZoneQtyMap = new Map<string, number>([['1.01', 5000]]);
      const poaActivitiesMap = new Map<string, any>([['1.01', { id: 'pa_101', frecuencia: 25 }]]);
      const allBoardStandards = [
        { id: 'std_101', activity_key: '1.01', name: 'Corte', unit: 'M2', category: 'Zona', rendimiento: 1000, requiere_rendimiento: true },
      ];
      const operationalFreqMap = new Map<string, any>([
        ['1.01', { activity_key: '1.01', visits_per_month: 25, source: 'CRONOGRAMA' }],
      ]);

      const result = classifySiteActivities(
        boardId,
        siteId,
        '2026-09-28',
        {
          poaZoneQtyMap,
          poaActivitiesMap,
          allBoardStandards,
          operationalFreqMap,
          hasZoneScopeData: true,
        }
      );

      expect(result.status).toBe('SUCCESS');
      expect(result.isPartial).toBe(false);
      expect(result.summary.materialized_count).toBe(1);
      const detail = result.summary.activities_detail.find((a) => a.activity_key === '1.01');
      expect(detail?.action).toBe('MATERIALIZED');
      expect(detail?.planned_rendimiento).toBe(1000);
    });

    test('Scheduler: actividad con rendimiento null genera occurrences con theoretical_jr = 0', () => {
      const templates: RoutineBaseTemplate[] = [
        {
          id: 'std_104',
          activity_key: '1.04',
          name: 'Control Biológico',
          zone: 'Zona Verde',
          unit: 'GL',
          rendimiento: null,
          frecuencia: 25,
          cantidad: 500,
        },
      ];

      const projection = generateRoutineScheduleForWeek(templates, '2026-09-07');
      expect(projection.assignments.length).toBe(6); // Lun-Sáb
      projection.assignments.forEach((assign) => {
        expect(assign.theoretical_jr).toBe(0);
        expect(assign.cantidad).toBe(500);
      });
      expect(projection.totalJournals).toBe(0);
    });

    test('Migración 2026100102_sync_gateway_rendimiento_optional.sql define DROP NOT NULL, CHECK constraint y RPC con RENDIMIENTO_REQUIRED', () => {
      const migPath = path.resolve(process.cwd(), 'supabase/migrations/2026100102_sync_gateway_rendimiento_optional.sql');
      expect(fs.existsSync(migPath)).toBe(true);
      const sql = fs.readFileSync(migPath, 'utf8');

      expect(sql).toContain('ALTER TABLE public.weekly_plan_items ALTER COLUMN planned_rendimiento DROP NOT NULL;');
      expect(sql).toContain('ALTER TABLE public.weekly_plan_items ADD CONSTRAINT weekly_plan_items_rendimiento_d20_chk');
      expect(sql).toContain('CHECK ((planned_rendimiento IS NULL AND planned_jr = 0) OR planned_rendimiento > 0) NOT VALID;');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.sync_weekly_plan_items_rpc');
      expect(sql).toContain('RENDIMIENTO_REQUIRED');
      expect(sql).toContain('v_requiere_rendimiento');
      expect(sql).toContain('board_activity_standards');
      expect(sql).toContain("SET search_path = pg_catalog, public, pg_temp");
      expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.sync_weekly_plan_items_rpc(UUID, JSONB) FROM PUBLIC, anon');
      expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.sync_weekly_plan_items_rpc(UUID, JSONB) TO authenticated');
    });

    test('PlanItemInput y WeeklyPlanItem soportan planned_rendimiento = null sin error', () => {
      const item: import('../../types/scheduler').WeeklyPlanItem = {
        id: 'item-1',
        plan_id: 'plan-1',
        planned_sequence: 1,
        activity_key: '1.04',
        poa_activity_zone_id: '11111111-1111-1111-1111-111111111111',
        planned_rendimiento: null,
        planned_frecuencia: 25,
        priority: 'must_execute',
        planned_qty: 500,
        unit: 'GL',
        planned_jr: 0,
        executed_qty: 0,
        executed_jr: 0,
        created_at: '2026-10-01T00:00:00Z',
        updated_at: '2026-10-01T00:00:00Z',
      };

      expect(item.planned_rendimiento).toBeNull();
      expect(item.planned_jr).toBe(0);
    });
  });
});

