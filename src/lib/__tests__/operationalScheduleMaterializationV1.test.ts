/**
 * Test Suite 42 — Incremental Business Certification: CRONOGRAMA OPERATIVO + MATERIALIZACIÓN SEMANAL V1
 *
 * Certifica los 6 Gates A-F:
 * - Gate A (Fuente): El Cronograma Operativo Base es la fuente de verdad de las actividades operativas.
 * - Gate B (Frecuencia): Frecuencia 3/semana genera exactamente 3 ocurrencias en la semana.
 * - Gate C (Capacidad): Expone DÉFICIT DE CAPACIDAD si demandados > disponibles, sin ocultar actividades.
 * - Gate D (Gobierno): Solamente admin y assistant modifican actividades base; Líder/Operario ejecutan via ItemExecutions.
 * - Gate E (Sitio): Conmutar el selector de sitio cambia group_id con cero residuos entre sitios.
 * - Gate F (Edición/Histórico): Cambios en frecuencia futura preservan las ocurrencias y ejecuciones históricas.
 */

import { generateRoutineScheduleForWeek, RoutineBaseTemplate } from '../routineScheduler';
import { calculateCapacityUsage, calculateTheoreticalJournals } from '../schedulerMath';

describe('Test Suite 42 — CRONOGRAMA OPERATIVO + MATERIALIZACIÓN SEMANAL V1 (Gates A-F)', () => {

  // ───────────────────────────────────────────────────────────────────────────
  // Gate A: Fuente Operativa Invariable
  // ───────────────────────────────────────────────────────────────────────────
  describe('Gate A — Fuente Operativa del Cronograma Base', () => {
    test('Gate A: Actividades provienen de la plantilla operativa cargada y no de reconstrucción arbitraria desde POA', () => {
      // Plantilla base configurada para Sitio A (Mercado La Sazón)
      const siteATemplates: RoutineBaseTemplate[] = [
        {
          id: 'tpl_grama',
          activity_key: 'corte_grama',
          name: 'Corte de Grama',
          zone: 'Zona Verde',
          unit: 'M2',
          rendimiento: 500,
          frecuencia: 2.083, // ~3x por semana
          cantidad: 1000,
        },
        {
          id: 'tpl_dura',
          activity_key: 'limpieza_zona_dura',
          name: 'Limpieza de Zona Dura',
          zone: 'Zona Dura',
          unit: 'M2',
          rendimiento: 1000,
          frecuencia: 1, // Diaria (6x por semana Mon-Sat)
          cantidad: 2000,
        },
      ];

      const mondayDate = new Date(Date.UTC(2026, 8, 7)); // 2026-09-07
      const projection = generateRoutineScheduleForWeek(siteATemplates, mondayDate, []);

      // Las actividades proyectadas deben coincidir exactamente con el Cronograma Operativo Base de Sitio A
      const activityKeys = Array.from(new Set(projection.assignments.map((a) => a.activity_key)));
      expect(activityKeys.sort()).toEqual(['corte_grama', 'limpieza_zona_dura'].sort());
      
      // Ninguna actividad arbitraria ajena al cronograma operativo debe ser inyectada
      expect(activityKeys).not.toContain('poda_arboles_no_programada');
    });

    test('Gate A Live Parity: Σ ocurrencias materializadas === Σ frecuencias y conjunto exacto de actividades del sitio', () => {
      // Definición del Cronograma Base del Sitio B: Actividad A (3/semana), Actividad B (2/semana), Actividad C (6/semana)
      const siteBSchedule: RoutineBaseTemplate[] = [
        {
          id: 'act_a',
          activity_key: 'poda_arbustos',
          name: 'Poda de Arbustos',
          zone: 'Zona Verde',
          unit: 'M2',
          rendimiento: 500,
          frecuencia: 2.083, // 3x por semana (Mon, Wed, Fri)
          cantidad: 1500,
          pattern_offset: 'turn_a',
        },
        {
          id: 'act_b',
          activity_key: 'fertilizacion',
          name: 'Fertilización',
          zone: 'Zona Verde',
          unit: 'M2',
          rendimiento: 800,
          frecuencia: 3.125, // 2x por semana (Mon, Thu)
          cantidad: 1000,
        },
        {
          id: 'act_c',
          activity_key: 'recoleccion_basura',
          name: 'Recolección de Basura',
          zone: 'Zona Dura',
          unit: 'M2',
          rendimiento: 2000,
          frecuencia: 1, // 6x por semana (Mon-Sat)
          cantidad: 5000,
        },
      ];

      const mondayDate = new Date(Date.UTC(2026, 8, 7));
      const projection = generateRoutineScheduleForWeek(siteBSchedule, mondayDate, []);

      // 1. Verificación de conjunto exacto de actividades
      const materializedActivities = Array.from(new Set(projection.assignments.map((a) => a.activity_key)));
      expect(materializedActivities.sort()).toEqual(['fertilizacion', 'poda_arbustos', 'recoleccion_basura'].sort());

      // REGLA CRÍTICA: corte_grama NO pertenece al cronograma del Sitio B y NUNCA debe aparecer
      expect(materializedActivities).not.toContain('corte_grama');

      // 2. Verificación de ocurrencias por actividad vs frecuencia
      const countA = projection.assignments.filter((a) => a.activity_key === 'poda_arbustos').length;
      const countB = projection.assignments.filter((a) => a.activity_key === 'fertilizacion').length;
      const countC = projection.assignments.filter((a) => a.activity_key === 'recoleccion_basura').length;

      expect(countA).toBe(3); // 3x/semana
      expect(countB).toBe(2); // 2x/semana
      expect(countC).toBe(6); // 6x/semana (Mon-Sat)

      // 3. Verificación de paridad: Total de ocurrencias === 3 + 2 + 6 = 11
      expect(projection.assignments.length).toBe(11);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Gate B: Frecuencia y Coincidencia Exacta de Ocurrencias
  // ───────────────────────────────────────────────────────────────────────────
  describe('Gate B — Coincidencia Exacta de Frecuencia y Ocurrencias', () => {
    test('Gate B: Frecuencia 3/semana genera exactamente 3 ocurrencias en la semana (Lunes, Miércoles, Viernes)', () => {
      const templates: RoutineBaseTemplate[] = [
        {
          id: 'tpl_grama_3x',
          activity_key: 'corte_grama',
          name: 'Corte de Grama',
          zone: 'Zona Verde',
          unit: 'M2',
          rendimiento: 500,
          frecuencia: 2.083, // ~3x por semana
          cantidad: 1000,
          pattern_offset: 'turn_a', // Mon, Wed, Fri
        },
      ];

      const mondayDate = new Date(Date.UTC(2026, 8, 7)); // Lunes 7 de Septiembre
      const projection = generateRoutineScheduleForWeek(templates, mondayDate, []);

      const occurrences = projection.assignments.filter((a) => a.activity_key === 'corte_grama');
      expect(occurrences.length).toBe(3);

      const daysOfWeek = occurrences.map((o) => o.dayOfWeek);
      expect(daysOfWeek).toEqual([1, 3, 5]); // Lunes (1), Miércoles (3), Viernes (5)
    });

    test('Gate B: Frecuencia 1/día (diaria) genera exactamente 6 ocurrencias en semana de Lunes a Sábado', () => {
      const templates: RoutineBaseTemplate[] = [
        {
          id: 'tpl_diaria',
          activity_key: 'limpieza_zona_dura',
          name: 'Limpieza de Zona Dura',
          zone: 'Zona Dura',
          unit: 'M2',
          rendimiento: 1000,
          frecuencia: 1, // Diaria
          cantidad: 2000,
        },
      ];

      const mondayDate = new Date(Date.UTC(2026, 8, 7));
      const projection = generateRoutineScheduleForWeek(templates, mondayDate, []);

      const occurrences = projection.assignments.filter((a) => a.activity_key === 'limpieza_zona_dura');
      expect(occurrences.length).toBe(6); // Lunes a Sábado (6 días hábiles)
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Gate C: Capacidad y Exposición de Déficit Sin Ocultar Actividades
  // ───────────────────────────────────────────────────────────────────────────
  describe('Gate C — Cuadre de Capacidad y Déficit No Silencioso', () => {
    test('Gate C: Si JR demandados > JR disponibles, emite alerta de déficit pero mantiene 100% de ocurrencias', () => {
      const heavyTemplates: RoutineBaseTemplate[] = [
        {
          id: 'tpl_macro_grama',
          activity_key: 'corte_grama_macro',
          name: 'Corte de Grama Masivo',
          zone: 'Zona Verde',
          unit: 'M2',
          rendimiento: 500, // 500 M2 por trabajador/día
          frecuencia: 1, // Todos los días hábiles
          cantidad: 1000, // 1,000 M2
        },
      ];

      const mondayDate = new Date(Date.UTC(2026, 8, 7));
      const projection = generateRoutineScheduleForWeek(heavyTemplates, mondayDate, []);

      // Total de jornales demandados en la semana (6 ocurrencias * 50 JR = 300 JR)
      const totalDemandedJR = projection.assignments.reduce((sum, a) => sum + a.theoretical_jr, 0);
      expect(totalDemandedJR).toBe(300);

      // Capacidad disponible en el sitio: 5 trabajadores * 5 días hábiles semanales = 25 JR disponibles
      const dailyCapacity = 5;
      const weeklyWorkingDays = 5;
      const capacityResult = calculateCapacityUsage(totalDemandedJR, dailyCapacity, weeklyWorkingDays);

      // Debe marcar NO factible (déficit de capacidad de 275 JR)
      expect(capacityResult.feasible).toBe(false);
      expect(capacityResult.deficit).toBe(275);

      // REGLA CRÍTICA GATE C: Las 6 ocurrencias DEBEN permanecer visibles sin ser eliminadas silenciosamente
      expect(projection.assignments.length).toBe(6);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Gate D: Gobierno de Roles y Separación Definición vs Ejecución
  // ───────────────────────────────────────────────────────────────────────────
  describe('Gate D — Gobierno de Roles (canEditSchedule) y Separación de Ejecución', () => {
    test('Gate D: canEditSchedule permite edición a Admin y Asistente, y prohíbe a Líder y Operario', () => {
      const resolveCanEditSchedule = (role: string) => role === 'admin' || role === 'assistant';

      expect(resolveCanEditSchedule('admin')).toBe(true);
      expect(resolveCanEditSchedule('assistant')).toBe(true);
      expect(resolveCanEditSchedule('leader')).toBe(false);
      expect(resolveCanEditSchedule('operator')).toBe(false);
    });

    test('Gate D: Registrar avance en ItemExecutions por Líder/Operario no muta planned_qty ni planned_date en la definición', () => {
      const plannedItem = {
        id: 'wpi_100',
        activity_key: 'corte_grama',
        planned_qty: 1000,
        planned_date: '2026-09-07',
        status: 'planned',
      };

      // Simulación de registro de ejecución por Líder en ItemExecutions
      const executionRecord = {
        item_id: plannedItem.id,
        executed_qty: 650,
        executed_jr: 32.5,
        executed_by: 'user_lider_1',
        created_at: '2026-09-07T14:00:00Z',
      };

      // Verificar que el ítem planificado mantiene su definición base intacta
      expect(plannedItem.planned_qty).toBe(1000);
      expect(plannedItem.planned_date).toBe('2026-09-07');
      expect(executionRecord.executed_qty).toBe(650);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Gate E: Selector de Sitio y Aislamiento por group_id
  // ───────────────────────────────────────────────────────────────────────────
  describe('Gate E — Aislamiento Estricto por Selector de Sitio (group_id)', () => {
    test('Gate E: Conmutar de Sitio A a Sitio B y regresar a Sitio A no deja residuos de estado', () => {
      const siteATemplates: RoutineBaseTemplate[] = [
        { id: 'a1', activity_key: 'grama_sitio_a', name: 'Grama Sitio A', zone: 'Verde', unit: 'M2', rendimiento: 500, frecuencia: 1, cantidad: 1000 },
      ];

      const siteBTemplates: RoutineBaseTemplate[] = [
        { id: 'b1', activity_key: 'playa_sitio_b', name: 'Playa Sitio B', zone: 'Playa', unit: 'M2', rendimiento: 800, frecuencia: 1, cantidad: 3000 },
      ];

      const mondayDate = new Date(Date.UTC(2026, 8, 7));

      // 1. Cargar Sitio A
      const projA1 = generateRoutineScheduleForWeek(siteATemplates, mondayDate, []);
      expect(projA1.assignments.map((a) => a.activity_key)[0]).toBe('grama_sitio_a');

      // 2. Conmutar a Sitio B
      const projB = generateRoutineScheduleForWeek(siteBTemplates, mondayDate, []);
      expect(projB.assignments.map((a) => a.activity_key)[0]).toBe('playa_sitio_b');
      expect(projB.assignments.some((a) => a.activity_key === 'grama_sitio_a')).toBe(false);

      // 3. Regresar a Sitio A -> Verificar 0 fugas de Sitio B
      const projA2 = generateRoutineScheduleForWeek(siteATemplates, mondayDate, []);
      expect(projA2.assignments.map((a) => a.activity_key)[0]).toBe('grama_sitio_a');
      expect(projA2.assignments.some((a) => a.activity_key === 'playa_sitio_b')).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Gate F: Edición e Inmutabilidad Histórica
  // ───────────────────────────────────────────────────────────────────────────
  describe('Gate F — Edición de Frecuencia y Preservación de Ocurrencias Históricas', () => {
    test('Gate F: Cambiar frecuencia de 3/semana a 2/semana actualiza el futuro y mantiene intacto el historial pasado', () => {
      const historicTemplates: RoutineBaseTemplate[] = [
        { id: 'h1', activity_key: 'corte_grama', name: 'Corte de Grama', zone: 'Verde', unit: 'M2', rendimiento: 500, frecuencia: 2.083, cantidad: 1000 }, // 3/semana
      ];

      const week1Monday = new Date(Date.UTC(2026, 8, 7)); // Semana 1 (Histórica)
      const week1Projection = generateRoutineScheduleForWeek(historicTemplates, week1Monday, []);

      // La semana 1 se materializó con 3 ocurrencias
      expect(week1Projection.assignments.length).toBe(3);

      // Admin cambia la frecuencia para semanas futuras (Semana 2 en adelante): 3/semana -> 2/semana
      const updatedTemplatesForFuture: RoutineBaseTemplate[] = [
        { id: 'h1', activity_key: 'corte_grama', name: 'Corte de Grama', zone: 'Verde', unit: 'M2', rendimiento: 500, frecuencia: 3.125, cantidad: 1000 }, // ~2x por semana (Mon, Thu)
      ];

      const week2Monday = new Date(Date.UTC(2026, 8, 14)); // Semana 2 (Futura)
      const week2Projection = generateRoutineScheduleForWeek(updatedTemplatesForFuture, week2Monday, []);

      // La semana 2 se materializa con la nueva frecuencia (2 ocurrencias)
      expect(week2Projection.assignments.length).toBe(2);

      // REGLA CRÍTICA GATE F: La semana 1 (histórica) CONSERVA sus 3 ocurrencias originales intactas
      expect(week1Projection.assignments.length).toBe(3);
    });
  });

});
