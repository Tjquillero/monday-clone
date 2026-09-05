/**
 * Test Suite 33: Motor de Programación de Rutinas v1 (ADR-0007)
 * Baseline Governance Certification: 2386465
 */

import {
  isOperationalWorkingDay,
  addOperationalWorkingDays,
  generateRoutineScheduleForWeek,
  RoutineBaseTemplate,
  ExecutionRecord,
} from '../routineScheduler';
import { isColombianHoliday, getColombianHolidayName } from '../colombianHolidays';

describe('Test 33 — ADR-0007 Motor de Programación de Rutinas v1', () => {
  // Sample templates for Plaza Puerto Colombia
  const puertoColombiaTemplates: RoutineBaseTemplate[] = [
    {
      id: 'pc-zd-1',
      activity_key: 'limpieza_zona_dura',
      name: 'Limpieza general zonas duras',
      zone: 'Zona Dura',
      unit: 'm2/día',
      rendimiento: 10000,
      frecuencia: 1, // Diario
      cantidad: 17150,
    },
    {
      id: 'pc-zd-2',
      activity_key: 'limpieza_marmol',
      name: 'Limpieza general mármol',
      zone: 'Zona Dura',
      unit: 'm2/día',
      rendimiento: 600,
      frecuencia: 1, // Diario
      cantidad: 1192,
    },
    {
      id: 'pc-zv-1',
      activity_key: 'riego_arbustos_grama',
      name: 'Riego general Arbusto, Cubresuelos y grama',
      zone: 'Zona Verde',
      unit: 'm2/día',
      rendimiento: 3500,
      frecuencia: 2.083, // ~3x semana (L-Mi-V)
      cantidad: 2394.68,
      pattern_offset: 'turn_a',
    },
    {
      id: 'pc-zv-2',
      activity_key: 'limpieza_general_paisajismo',
      name: 'Limpieza General Paisajismo',
      zone: 'Zona Verde',
      unit: 'm2/día',
      rendimiento: 7500,
      frecuencia: 2.083, // ~3x semana (M-J-S)
      cantidad: 2620,
      pattern_offset: 'turn_b',
    },
    {
      id: 'pc-zv-3',
      activity_key: 'poda_arbustos',
      name: 'Poda Arbustos y CS',
      zone: 'Zona Verde',
      unit: 'm2/día',
      rendimiento: 1200,
      frecuencia: 12.5, // Quincenal (Jueves)
      cantidad: 1850,
      preferred_days: [4], // Jueves
    },
    {
      id: 'pc-zv-4',
      activity_key: 'mtto_cama_siembra',
      name: 'Mantenimiento Cama Siembra',
      zone: 'Zona Verde',
      unit: 'm2/día',
      rendimiento: 600,
      frecuencia: 6.25, // Semanal (Viernes)
      cantidad: 2620,
      preferred_days: [5], // Viernes
    },
    {
      id: 'pc-zv-5',
      activity_key: 'plateo_arboles',
      name: 'Plateo de Árboles',
      zone: 'Zona Verde',
      unit: 'Und/día',
      rendimiento: 160,
      frecuencia: 12.5, // Quincenal (Sábado)
      cantidad: 225,
      preferred_days: [6], // Sábado
    },
  ];

  // -------------------------------------------------------------------------
  // Test 33.1: Reproducción Exacta (Plaza Puerto Colombia, 07–13 Septiembre 2026)
  // -------------------------------------------------------------------------
  test('Test 33.1: Reproducción exacta del cronograma de aceptación para Plaza Puerto Colombia (07–13 Septiembre 2026)', () => {
    const weekStart = '2026-09-07'; // Lunes 7 de Septiembre 2026
    const projection = generateRoutineScheduleForWeek(puertoColombiaTemplates, weekStart);

    expect(projection.weekStartStr).toBe('2026-09-07');
    expect(projection.weekEndStr).toBe('2026-09-13');

    // Helper to get assigned activities on a given date
    const getAssignedKeys = (dateStr: string) =>
      projection.assignments.filter((a) => a.dateStr === dateStr).map((a) => a.activity_key);

    // Lunes 7: Limpieza zonas duras, Limpieza mármol, Riego
    const lunes = getAssignedKeys('2026-09-07');
    expect(lunes).toContain('limpieza_zona_dura');
    expect(lunes).toContain('limpieza_marmol');
    expect(lunes).toContain('riego_arbustos_grama');
    expect(lunes).not.toContain('limpieza_general_paisajismo');

    // Martes 8: Limpieza zonas duras, Limpieza mármol, Limpieza paisajismo
    const martes = getAssignedKeys('2026-09-08');
    expect(martes).toContain('limpieza_zona_dura');
    expect(martes).toContain('limpieza_marmol');
    expect(martes).toContain('limpieza_general_paisajismo');
    expect(martes).not.toContain('riego_arbustos_grama');

    // Miércoles 9: Limpieza zonas duras, Limpieza mármol, Riego
    const miercoles = getAssignedKeys('2026-09-09');
    expect(miercoles).toContain('limpieza_zona_dura');
    expect(miercoles).toContain('limpieza_marmol');
    expect(miercoles).toContain('riego_arbustos_grama');

    // Jueves 10: Limpieza zonas duras, Limpieza mármol, Poda de arbustos
    const jueves = getAssignedKeys('2026-09-10');
    expect(jueves).toContain('limpieza_zona_dura');
    expect(jueves).toContain('limpieza_marmol');
    expect(jueves).toContain('poda_arbustos');

    // Viernes 11: Limpieza zonas duras, Limpieza mármol, Mtto Cama Siembra
    const viernes = getAssignedKeys('2026-09-11');
    expect(viernes).toContain('limpieza_zona_dura');
    expect(viernes).toContain('limpieza_marmol');
    expect(viernes).toContain('mtto_cama_siembra');

    // Sábado 12: Limpieza zonas duras, Limpieza mármol, Plateo de árboles
    const sabado = getAssignedKeys('2026-09-12');
    expect(sabado).toContain('limpieza_zona_dura');
    expect(sabado).toContain('limpieza_marmol');
    expect(sabado).toContain('plateo_arboles');

    // Domingo 13: Día No Laborable (0 asignaciones)
    const domingo = getAssignedKeys('2026-09-13');
    expect(domingo).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Test 33.2: Días Laborables y Omisión de Festivos Colombianos (Ley Emiliani)
  // -------------------------------------------------------------------------
  test('Test 33.2: Omisión de Domingos y Festivos Colombianos (Ley Emiliani)', () => {
    // 12 de Octubre de 2026 es festivo nacional en Colombia (Día de la Raza - Lunes)
    expect(isColombianHoliday('2026-10-12')).toBe(true);
    expect(getColombianHolidayName('2026-10-12')).toBe('Día de la Raza');
    expect(isOperationalWorkingDay('2026-10-12')).toBe(false);

    // Semana del 12 al 18 de Octubre de 2026
    const weekStartHoliday = '2026-10-12';
    const projection = generateRoutineScheduleForWeek(puertoColombiaTemplates, weekStartHoliday);

    // Lunes 12 Octubre (festivo): 0 asignaciones
    const lunesFestivo = projection.assignments.filter((a) => a.dateStr === '2026-10-12');
    expect(lunesFestivo).toHaveLength(0);

    // Martes 13 Octubre (hábil): debe recibir las asignaciones desviadas del Lunes
    const martesShifted = projection.assignments.filter((a) => a.dateStr === '2026-10-13').map((a) => a.activity_key);
    expect(martesShifted).toContain('limpieza_zona_dura');
    expect(martesShifted).toContain('riego_arbustos_grama'); // Desviado de Turno A debido al festivo
  });

  // -------------------------------------------------------------------------
  // Test 33.3: Cálculo de Intervalos en Días Hábiles (addOperationalWorkingDays)
  // -------------------------------------------------------------------------
  test('Test 33.3: Cálculo determinista de días hábiles omitiendo festivos y domingos', () => {
    // Viernes 09 de Octubre 2026 + 1 día hábil -> Sábado 10 de Octubre 2026
    const step1 = addOperationalWorkingDays('2026-10-09', 1);
    expect(step1.toISOString().slice(0, 10)).toBe('2026-10-10');

    // Sábado 10 de Octubre 2026 + 1 día hábil -> Martes 13 de Octubre 2026 (salta Domingo 11 y Lunes 12 festivo)
    const step2 = addOperationalWorkingDays('2026-10-10', 1);
    expect(step2.toISOString().slice(0, 10)).toBe('2026-10-13');
  });

  // -------------------------------------------------------------------------
  // Test 33.4: Idempotencia en la Generación de la Agenda
  // -------------------------------------------------------------------------
  test('Test 33.4: Idempotencia estricta — ejecuciones repetidas no duplican asignaciones', () => {
    const weekStart = '2026-09-07';
    const run1 = generateRoutineScheduleForWeek(puertoColombiaTemplates, weekStart);
    const run2 = generateRoutineScheduleForWeek(puertoColombiaTemplates, weekStart);

    expect(run1).toEqual(run2);
    expect(run1.assignments.length).toBe(run2.assignments.length);
  });

  // -------------------------------------------------------------------------
  // Test 33.5: Persistencia de Estado y Reprogramación por Historial Real
  // -------------------------------------------------------------------------
  test('Test 33.5: Respeto del historial de ejecución real (última fecha ejecutada)', () => {
    // Si la poda de arbustos se ejecutó el 03 de Septiembre (hace 4 días hábiles)
    const executionHistory: ExecutionRecord[] = [
      {
        activity_key: 'poda_arbustos',
        execution_date: '2026-09-03',
        status: 'completed',
      },
    ];

    // Para la semana del 07 al 13 de Septiembre, como el intervalo de la poda es 12.5 días hábiles (~14 días calendario),
    // la poda NO debe volver a aparecer en esa misma semana.
    const projection = generateRoutineScheduleForWeek(puertoColombiaTemplates, '2026-09-07', executionHistory);
    const podaAssigned = projection.assignments.filter((a) => a.activity_key === 'poda_arbustos');

    expect(podaAssigned).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Test 33.6: Aislamiento Contractual (Rector)
  // -------------------------------------------------------------------------
  test('Test 33.6: Rector — Aislamiento total del motor de rutinas con respecto al POA y billing', () => {
    const projection = generateRoutineScheduleForWeek(puertoColombiaTemplates, '2026-09-07');

    // Verificar que los objetos generados contienen solo campos de la agenda operativa rutinaria
    projection.assignments.forEach((assignment) => {
      expect(assignment).toHaveProperty('activity_key');
      expect(assignment).toHaveProperty('dateStr');
      expect(assignment).toHaveProperty('theoretical_jr');
      expect(assignment).not.toHaveProperty('poa_id');
      expect(assignment).not.toHaveProperty('billing_id');
      expect(assignment).not.toHaveProperty('acta_id');
    });
  });
});
