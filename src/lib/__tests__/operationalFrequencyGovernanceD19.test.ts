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

  describe('6. Gobernanza D21–D26: Parámetros Operativos por Sitio (GATE FREQ-OP-02)', () => {
    test('D21 (SPLIT): 6726 m² / 25 visitas / rend 300 → planned_qty = 269.04 m² y planned_jr = 0.8968 jr', () => {
      const poaZoneQtyMap = new Map<string, number>([['3.06', 6726]]);
      const poaActivitiesMap = new Map<string, any>([['3.06', { id: 'pa_306', frecuencia: 25 }]]);
      const allBoardStandards = [
        { id: 'std_306', activity_key: '3.06', name: 'Mármol', unit: 'M2', category: 'Zona', rendimiento: 100, requiere_rendimiento: true },
      ];
      const operationalFreqMap = new Map<string, any>([
        ['3.06', { activity_key: '3.06', visits_per_month: 25, source: 'CRONOGRAMA', qty_mode: 'SPLIT', rendimiento: 300 }],
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
      expect(result.summary.materialized_count).toBe(1);
      const detail = result.summary.activities_detail.find((a) => a.activity_key === '3.06');
      expect(detail).toBeDefined();
      expect(detail?.action).toBe('MATERIALIZED');
      expect(detail?.planned_qty).toBe(269.04);
      expect(detail?.planned_rendimiento).toBe(300);
      expect(detail?.planned_jr).toBe(0.8968);
    });

    test('D23: Override de rendimiento por sitio vs catálogo estándar', () => {
      const poaZoneQtyMap = new Map<string, number>([
        ['1.01', 30000],
        ['2.01', 1000],
      ]);
      const poaActivitiesMap = new Map<string, any>([
        ['1.01', { id: 'pa_101', frecuencia: 25 }],
        ['2.01', { id: 'pa_201', frecuencia: 25 }],
      ]);
      const allBoardStandards = [
        { id: 'std_101', activity_key: '1.01', name: 'Corte', unit: 'M2', category: 'Zona', rendimiento: 1000, requiere_rendimiento: true },
        { id: 'std_201', activity_key: '2.01', name: 'Poda', unit: 'M2', category: 'Zona', rendimiento: 500, requiere_rendimiento: true },
      ];
      const operationalFreqMap = new Map<string, any>([
        // 1.01 tiene override a 3000
        ['1.01', { activity_key: '1.01', visits_per_month: 25, source: 'CRONOGRAMA', qty_mode: 'FULL', rendimiento: 3000 }],
        // 2.01 no tiene override (rendimiento null)
        ['2.01', { activity_key: '2.01', visits_per_month: 25, source: 'CRONOGRAMA', qty_mode: 'FULL', rendimiento: null }],
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

      const d101 = result.summary.activities_detail.find((a) => a.activity_key === '1.01');
      expect(d101?.planned_rendimiento).toBe(3000); // Usa override
      expect(d101?.planned_jr).toBe(10); // 30000 / 3000

      const d201 = result.summary.activities_detail.find((a) => a.activity_key === '2.01');
      expect(d201?.planned_rendimiento).toBe(500); // Usa catálogo
      expect(d201?.planned_jr).toBe(2); // 1000 / 500
    });

    test('D25: Sitio sin filas en operational_frequencies produce SITE_NOT_OPERATIONAL sin escrituras', async () => {
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
            return createMockQuery([{ id: 'paz_1', poa_activity_id: 'pa_1', zone_id: 'group_astilleros', cantidad_contratada: 5000 }]);
          }
          if (table === 'board_activity_standards') {
            return createMockQuery([{ id: 'std_1', activity_key: '1.01', name: 'Corte', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true }]);
          }
          if (table === 'operational_frequencies') {
            return createMockQuery([]); // 0 filas para Astilleros
          }
          if (table === 'site_daily_capacity') {
            return createMockQuery(null);
          }
          return createMockQuery([]);
        }),
        rpc: jest.fn((fn: string, params: any) => {
          if (fn === 'log_materialization_event_rpc') {
            loggedEvents.push(params);
            return Promise.resolve({ data: 'evt_1', error: null });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };

      const result = await ensureWeeklyPlanMaterialized(
        mockSupabase,
        boardId,
        'group_astilleros',
        '2026-09-28'
      );

      expect(result.totalItems).toBe(0);
      expect(result.notOperational).toBe(true);
      const summaryEvt = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY');
      expect(summaryEvt).toBeDefined();
      expect(summaryEvt.p_status).toBe('SUCCESS');
      expect(summaryEvt.p_payload.error?.code).toBe('SITE_NOT_OPERATIONAL');
    });

    test('D26: Festivo no diario (< 25 visits) pasa al siguiente día hábil en la misma semana (o anterior); festivo diario se omite', () => {
      // Semana del 2026-06-15 (Lunes 15 de Junio es festivo Sagrado Corazón en Colombia)
      // Días hábiles lun-sáb: Mar 16, Mié 17, Jue 18, Vie 19, Sáb 20.
      const weekStart = '2026-06-15';

      // 1. Actividad NO diaria (12 visitas/mes → normalmente Lun, Mié, Vie)
      // Lunes 15 es festivo → debe moverse al siguiente hábil (Martes 16)
      const tmplNonDaily: RoutineBaseTemplate = {
        id: 'tmpl_12',
        activity_key: '2.16',
        name: 'Lavado',
        zone: 'Zona',
        unit: 'M2',
        rendimiento: 1000,
        frecuencia: 12,
        cantidad: 1000,
      };

      const scheduleNonDaily = generateRoutineScheduleForWeek([tmplNonDaily], weekStart, []);
      const nonDailyDays = scheduleNonDaily.assignments.map((a) => a.dateStr);
      expect(nonDailyDays).toEqual([
        '2026-06-16', // Movido de Lun 15 a Mar 16
        '2026-06-17', // Mié 17
        '2026-06-19', // Vie 19
      ]);
      expect(nonDailyDays.length).toBe(3); // Mantiene las 3 visitas

      // 2. Actividad diaria (25 visitas/mes → Lun-Sáb)
      // Lunes 15 es festivo → se omite (no se corre), quedan 5 días
      const tmplDaily: RoutineBaseTemplate = {
        id: 'tmpl_25',
        activity_key: '1.01',
        name: 'Corte',
        zone: 'Zona',
        unit: 'M2',
        rendimiento: 1000,
        frecuencia: 25,
        cantidad: 1000,
      };

      const scheduleDaily = generateRoutineScheduleForWeek([tmplDaily], weekStart, []);
      const dailyDays = scheduleDaily.assignments.map((a) => a.dateStr);
      expect(dailyDays).toEqual([
        '2026-06-16', // Mar
        '2026-06-17', // Mié
        '2026-06-18', // Jue
        '2026-06-19', // Vie
        '2026-06-20', // Sáb
      ]);
      expect(dailyDays.length).toBe(5); // Omitido el festivo
    });

    test('D24: Capacidad diaria por sitio se evalúa sin bloquear y se reporta en evento de resumen', async () => {
      let loggedEvents: any[] = [];
      const mockSupabase: any = {
        from: jest.fn((table: string) => {
          if (table === 'poa' || table === 'poas') return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
          if (table === 'poa_versions') {
            return createMockQuery([{ id: 'ver_1', poa_id: 'poa_1', status: 'active', poa: { id: 'poa_1', board_id: boardId } }]);
          }
          if (table === 'poa_activities') {
            return createMockQuery([{ id: 'pa_101', poa_version_id: 'ver_1', activity_key: '1.01', frecuencia: 25 }]);
          }
          if (table === 'poa_activity_zones') {
            return createMockQuery([
              { id: 'paz_101', poa_activity_id: 'pa_101', zone_id: 'group_d24_test', cantidad_contratada: 5000 },
            ]);
          }
          if (table === 'board_activity_standards') {
            return createMockQuery([
              { id: 'std_101', activity_key: '1.01', name: 'Corte', unit: 'M2', category: 'Zona', rendimiento: 1000, requiere_rendimiento: true },
            ]);
          }
          if (table === 'operational_frequencies') {
            return createMockQuery([
              { activity_key: '1.01', visits_per_month: 25, source: 'CRONOGRAMA', qty_mode: 'FULL', rendimiento: 1000 },
            ]);
          }
          if (table === 'site_daily_capacity') {
            return createMockQuery({ jornales_dia: 2.0, source: 'COSTOS GENERALES V3' });
          }
          return createMockQuery([]);
        }),
        rpc: jest.fn((name: string, params: any) => {
          if (name === 'ensure_weekly_plan_header') {
            return Promise.resolve({ data: 'plan_d24_test', error: null });
          }
          if (name === 'sync_weekly_plan_items_rpc') {
            return Promise.resolve({
              data: [
                { id: 'item_1', planned_sequence: 1 },
                { id: 'item_2', planned_sequence: 2 },
                { id: 'item_3', planned_sequence: 3 },
                { id: 'item_4', planned_sequence: 4 },
                { id: 'item_5', planned_sequence: 5 },
                { id: 'item_6', planned_sequence: 6 },
              ],
              error: null,
            });
          }
          if (name === 'log_materialization_event_rpc') {
            loggedEvents.push(params);
            return Promise.resolve({ data: 'evt_1', error: null });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };

      const result = await ensureWeeklyPlanMaterialized(
        mockSupabase,
        boardId,
        'group_d24_test',
        '2026-09-28'
      );

      expect(result.totalItems).toBe(6);
      // Cada día tiene 5000 / 1000 = 5.0 jornales > capacidad 2.0
      const summaryEvt = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY');
      expect(summaryEvt).toBeDefined();
      expect(summaryEvt.p_payload.site_daily_capacity).toBe(2.0);
      expect(summaryEvt.p_payload.capacity_exceeded).toBe(true);
      expect(summaryEvt.p_payload.exceeded_capacity_days.length).toBeGreaterThan(0);
    });

    test('D24: Fallo de lectura de site_daily_capacity no bloquea la materialización', async () => {
      let loggedEvents: any[] = [];
      const mockSupabase: any = {
        from: jest.fn((table: string) => {
          if (table === 'poa' || table === 'poas') return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
          if (table === 'poa_versions') {
            return createMockQuery([{ id: 'ver_1', poa_id: 'poa_1', status: 'active', poa: { id: 'poa_1', board_id: boardId } }]);
          }
          if (table === 'poa_activities') {
            return createMockQuery([{ id: 'pa_101', poa_version_id: 'ver_1', activity_key: '1.01', frecuencia: 25 }]);
          }
          if (table === 'poa_activity_zones') {
            return createMockQuery([
              { id: 'paz_101', poa_activity_id: 'pa_101', zone_id: 'group_d24_test', cantidad_contratada: 5000 },
            ]);
          }
          if (table === 'board_activity_standards') {
            return createMockQuery([
              { id: 'std_101', activity_key: '1.01', name: 'Corte', unit: 'M2', category: 'Zona', rendimiento: 1000, requiere_rendimiento: true },
            ]);
          }
          if (table === 'operational_frequencies') {
            return createMockQuery([
              { activity_key: '1.01', visits_per_month: 25, source: 'CRONOGRAMA', qty_mode: 'FULL', rendimiento: 1000 },
            ]);
          }
          if (table === 'site_daily_capacity') {
            return createMockQuery(null, null, { message: 'Connection error' });
          }
          return createMockQuery([]);
        }),
        rpc: jest.fn((name: string, params: any) => {
          if (name === 'ensure_weekly_plan_header') {
            return Promise.resolve({ data: 'plan_d24_test', error: null });
          }
          if (name === 'sync_weekly_plan_items_rpc') {
            return Promise.resolve({
              data: [
                { id: 'item_1', planned_sequence: 1 },
                { id: 'item_2', planned_sequence: 2 },
                { id: 'item_3', planned_sequence: 3 },
                { id: 'item_4', planned_sequence: 4 },
                { id: 'item_5', planned_sequence: 5 },
                { id: 'item_6', planned_sequence: 6 },
              ],
              error: null,
            });
          }
          if (name === 'log_materialization_event_rpc') {
            loggedEvents.push(params);
            return Promise.resolve({ data: 'evt_1', error: null });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };

      const result = await ensureWeeklyPlanMaterialized(
        mockSupabase,
        boardId,
        'group_d24_test',
        '2026-09-28'
      );

      expect(result.totalItems).toBe(6);
      const summaryEvt = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY');
      expect(summaryEvt).toBeDefined();
      expect(summaryEvt.p_payload.capacity_error).toBeDefined();
    });

    test('Migración 2026100103 y Semilla 2026100103 existen y cumplen especificación', () => {
      const migPath = path.resolve(process.cwd(), 'supabase/migrations/2026100103_operational_params.sql');
      const seedPath = path.resolve(process.cwd(), 'supabase/seeds/2026100103_operational_params_seed.sql');
      const seed01Path = path.resolve(process.cwd(), 'supabase/seeds/2026100101_operational_frequencies_seed.sql');

      expect(fs.existsSync(migPath)).toBe(true);
      expect(fs.existsSync(seedPath)).toBe(true);
      expect(fs.existsSync(seed01Path)).toBe(true);

      const migSql = fs.readFileSync(migPath, 'utf8');
      expect(migSql).toContain("qty_mode TEXT NOT NULL DEFAULT 'FULL'");
      expect(migSql).toContain("rendimiento NUMERIC NULL CHECK (rendimiento IS NULL OR rendimiento > 0)");
      expect(migSql).toContain("CREATE TABLE IF NOT EXISTS public.site_daily_capacity");
      expect(migSql).toContain("UNIQUE (board_id, group_id)");
      expect(migSql).toContain("GRANT SELECT ON public.site_daily_capacity TO mantenix_auditor");

      const seedSql = fs.readFileSync(seedPath, 'utf8');
      expect(seedSql).toContain("3ea0326f-6ff7-409f-848a-1f296e6e3cc8");
      expect(seedSql).toContain("qty_mode = 'SPLIT'");
      expect(seedSql).toContain("'1.09', '1.10', '3.06'");
      expect(seedSql).toContain("COSTOS GENERALES V3");
      expect(seedSql).toContain("DELETE FROM public.operational_frequencies");

      // Verificaciones estrictas GATE FREQ-OP-02b
      // 1. Sin FUNCTION dentro del DO
      expect(seedSql).not.toMatch(/DO\s+\$\$[\s\S]*CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i);
      expect(seedSql).not.toMatch(/DO\s+\$\$[\s\S]*\bFUNCTION\b/i);
      // 2. Sin MIN(id) ni MIN( para UUIDs
      expect(seedSql).not.toMatch(/MIN\s*\(\s*id\s*\)/i);
      expect(seedSql).not.toMatch(/MIN\s*\(/i);
      // 3. Uso de translate(...) para coincidencias insensibles a tildes (sin unaccent)
      expect(seedSql).toContain("translate(upper(title), 'ÁÉÍÓÚ', 'AEIOU')");
      expect(seedSql).not.toContain("unaccent");

      const seed01Sql = fs.readFileSync(seed01Path, 'utf8');
      expect(seed01Sql).toContain("NOT ILIKE '%ASTILLERO%'");
    });
  });
});


