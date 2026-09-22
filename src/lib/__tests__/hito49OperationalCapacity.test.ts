/**
 * Suite 42: Pruebas de Integración y Regresión para Hito 4.9 (Capacidad Operacional de Cuadrilla)
 * Baseline: 98 suites / 713 tests + Suite 42
 *
 * Invariantes a Verificarse:
 * CAP-01: Cuadrilla Vacía en Día Laboral (S=0, D>0) -> CAPACITY_ZERO
 * CAP-02: Personal Compartido (Kp > 1) -> UNDETERMINED_CAPACITY (utilizationRate = undefined)
 * CAP-03: Calendario No Laborable (Domingos/Festivos):
 *   - D=0 -> NON_WORKING_NO_DEMAND
 *   - D>0 -> INVALID_WORKING_CALENDAR_DAY
 * CAP-04: Evaluación Oferta vs Demanda y Tolerancia Corporativa 0.05 JR:
 *   - CAP-04A: D=0, S=0 -> NO_CAPACITY_NO_DEMAND
 *   - CAP-04B: D=0, S=1.0 -> NO_DEMAND
 *   - CAP-04C: S=1.0, D=1.050000 -> BALANCED (Límite tolerancia)
 *   - CAP-04D: S=1.0, D=1.050001 -> OVERLOADED (Supera tolerancia)
 *   - CAP-04E: S=1.0, D=0.70 -> BALANCED
 *   - CAP-04F: S=1.0, D=0.699999 -> UNDERUTILIZED
 *   - CAP-04G: D=0, Kp>1 -> NO_DEMAND (Precedencia D=0 sobre Kp>1)
 * CAP-05: Demanda Temporal ADR-0008 (Sin Prorrateo Arbitrario)
 * CAP-06: Sin Novedades Inventadas (Sin Factor Fantasma)
 */

import {
  evaluateCrewWorkloadV5,
  calculateCrewWorkloads,
  getSovereignCalendarStatus,
} from '../operationalCapacityService';
import { WeeklyPlanItem } from '@/types/weeklyPlan';
import { Crew, PersonnelSiteAssignment } from '@/types/crew';

describe('Hito 4.9: Motor Determinístico de Capacidad Operacional de Cuadrilla (Suite 42)', () => {
  const mockBoardId = 'board-site-001';

  // Helper para generar ítems de prueba
  const createMockItem = (
    id: string,
    crewId: string,
    plannedDate: string,
    theoreticalJr: number
  ): WeeklyPlanItem => ({
    id,
    weekly_plan_id: 'plan-001',
    board_id: mockBoardId,
    activity_key: 'ACT_LIMPIEZA',
    name: 'Limpieza General',
    zone: 'ZV',
    unit: 'm2',
    planned_date: plannedDate,
    planned_qty: 100,
    theoretical_jr: theoreticalJr,
    source_type: 'ROUTINE',
    routine_reference: 'ROUT_01',
    occurrence_key: `key_${id}`,
    crew_id: crewId,
    is_manual_override: false,
    status: 'planned',
  });

  const mondayDate = '2026-09-14'; // Lunes (WORKING_DAY)
  const sundayDate = '2026-09-13'; // Domingo (NON_WORKING_DAY)

  describe('Verificación de Calendario Soberano (F3.1)', () => {
    test('Identifica correctamente días laborables y domingos no laborables', () => {
      expect(getSovereignCalendarStatus(mondayDate)).toBe('WORKING_DAY');
      expect(getSovereignCalendarStatus(sundayDate)).toBe('NON_WORKING_DAY');
    });
  });

  describe('CAP-01: Cuadrilla Vacía en Día Laboral', () => {
    test('Cuadrilla con 0 integrantes y demanda > 0 produce CAPACITY_ZERO', () => {
      const items = [createMockItem('item-1', 'crew-empty', mondayDate, 1.0)];
      const result = evaluateCrewWorkloadV5({
        crewId: 'crew-empty',
        crewName: 'Cuadrilla Vacía',
        plannedDate: mondayDate,
        items,
        crewMembers: [], // Explicítamente vacía (S=0)
      });

      expect(result.calendarStatus).toBe('WORKING_DAY');
      expect(result.capacityStatus).toBe('CAPACITY_ZERO');
      expect(result.applicableDailyCapacity).toBe(0);
      expect(result.totalPlannedJournals).toBe(1.0);
    });
  });

  describe('CAP-02: Personal Compartido (Kp > 1) e Indeterminación', () => {
    test('Detecta Kp > 1 y diagnostica UNDETERMINED_CAPACITY sin calcular utilizationRate', () => {
      const items = [createMockItem('item-2', 'crew-shared-1', mondayDate, 1.2)];

      const crewA: Crew = { id: 'crew-shared-1', board_id: mockBoardId, name: 'Cuadrilla A', is_active: true };
      const crewB: Crew = { id: 'crew-shared-2', board_id: mockBoardId, name: 'Cuadrilla B', is_active: true };
      const allCrews = [crewA, crewB];

      const sharedMemberId = 'assignment-p1';
      const allCrewMembersMap = new Map<string, string[]>([
        ['crew-shared-1', [sharedMemberId]],
        ['crew-shared-2', [sharedMemberId]], // P1 pertenece a 2 cuadrillas activas (Kp=2)
      ]);

      const allSiteAssignmentsMap = new Map<string, PersonnelSiteAssignment>([
        [sharedMemberId, { id: sharedMemberId, version_id: 'v1', personnel_id: 'p1', zone: 'ZV', dedication_percentage: 100 }],
      ]);

      const result = evaluateCrewWorkloadV5({
        crewId: 'crew-shared-1',
        crewName: 'Cuadrilla A',
        plannedDate: mondayDate,
        items,
        crewMembers: [{ personnel_assignment_id: sharedMemberId }],
        allCrews,
        allCrewMembersMap,
        allSiteAssignmentsMap,
      });

      expect(result.capacityStatus).toBe('UNDETERMINED_CAPACITY');
      expect(result.applicableDailyCapacity).toBeUndefined();
      expect(result.utilizationRate).toBeUndefined(); // NUNCA divide D/S cuando la capacidad es indeterminada
    });
  });

  describe('CAP-03: Calendario No Laborable (Domingos/Festivos)', () => {
    test('Domingo con D = 0 resulta en NON_WORKING_NO_DEMAND', () => {
      const items: WeeklyPlanItem[] = [];
      const result = evaluateCrewWorkloadV5({
        crewId: 'crew-1',
        crewName: 'Cuadrilla 1',
        plannedDate: sundayDate,
        items,
      });

      expect(result.calendarStatus).toBe('NON_WORKING_DAY');
      expect(result.capacityStatus).toBe('NON_WORKING_NO_DEMAND');
    });

    test('Domingo con D > 0 resulta en INVALID_WORKING_CALENDAR_DAY', () => {
      const items = [createMockItem('item-domingo', 'crew-1', sundayDate, 1.0)];
      const result = evaluateCrewWorkloadV5({
        crewId: 'crew-1',
        crewName: 'Cuadrilla 1',
        plannedDate: sundayDate,
        items,
      });

      expect(result.calendarStatus).toBe('NON_WORKING_DAY');
      expect(result.capacityStatus).toBe('INVALID_WORKING_CALENDAR_DAY');
    });
  });

  describe('CAP-04: Evaluación Oferta vs Demanda y Tolerancia Corporativa (0.05 JR)', () => {
    test('CAP-04A: D=0, S=0 resulta en NO_CAPACITY_NO_DEMAND', () => {
      const result = evaluateCrewWorkloadV5({
        crewId: 'crew-1',
        crewName: 'Cuadrilla 1',
        plannedDate: mondayDate,
        items: [],
        crewMembers: [], // S=0
      });

      expect(result.calendarStatus).toBe('WORKING_DAY');
      expect(result.capacityStatus).toBe('NO_CAPACITY_NO_DEMAND');
    });

    test('CAP-04B: D=0, S=1.0 resulta en NO_DEMAND', () => {
      const result = evaluateCrewWorkloadV5({
        crewId: 'crew-1',
        crewName: 'Cuadrilla 1',
        plannedDate: mondayDate,
        items: [],
        dailyCapacityOverride: 1.0,
      });

      expect(result.calendarStatus).toBe('WORKING_DAY');
      expect(result.capacityStatus).toBe('NO_DEMAND');
    });

    test('CAP-04C: S=1.0, D=1.050000 resulta en BALANCED (Límite de Tolerancia)', () => {
      const items = [createMockItem('item-tol-1', 'crew-1', mondayDate, 1.050000)];
      const result = evaluateCrewWorkloadV5({
        crewId: 'crew-1',
        crewName: 'Cuadrilla 1',
        plannedDate: mondayDate,
        items,
        dailyCapacityOverride: 1.0,
      });

      expect(result.capacityStatus).toBe('BALANCED');
      expect(result.utilizationRate).toBe(1.05);
    });

    test('CAP-04D: S=1.0, D=1.050001 resulta en OVERLOADED (Supera Tolerancia)', () => {
      const items = [createMockItem('item-tol-2', 'crew-1', mondayDate, 1.050001)];
      const result = evaluateCrewWorkloadV5({
        crewId: 'crew-1',
        crewName: 'Cuadrilla 1',
        plannedDate: mondayDate,
        items,
        dailyCapacityOverride: 1.0,
      });

      expect(result.capacityStatus).toBe('OVERLOADED');
    });

    test('CAP-04E: S=1.0, D=0.70 resulta en BALANCED', () => {
      const items = [createMockItem('item-bal-1', 'crew-1', mondayDate, 0.70)];
      const result = evaluateCrewWorkloadV5({
        crewId: 'crew-1',
        crewName: 'Cuadrilla 1',
        plannedDate: mondayDate,
        items,
        dailyCapacityOverride: 1.0,
      });

      expect(result.capacityStatus).toBe('BALANCED');
      expect(result.utilizationRate).toBe(0.70);
    });

    test('CAP-04F: S=1.0, D=0.699999 resulta en UNDERUTILIZED', () => {
      const items = [createMockItem('item-under-1', 'crew-1', mondayDate, 0.699999)];
      const result = evaluateCrewWorkloadV5({
        crewId: 'crew-1',
        crewName: 'Cuadrilla 1',
        plannedDate: mondayDate,
        items,
        dailyCapacityOverride: 1.0,
      });

      expect(result.capacityStatus).toBe('UNDERUTILIZED');
    });

    test('CAP-04G: D=0 con Kp > 1 resulta en NO_DEMAND (Precedencia de D=0)', () => {
      const sharedMemberId = 'assignment-p1';
      const allCrews: Crew[] = [
        { id: 'crew-1', board_id: mockBoardId, name: 'Cuadrilla 1', is_active: true },
        { id: 'crew-2', board_id: mockBoardId, name: 'Cuadrilla 2', is_active: true },
      ];
      const allCrewMembersMap = new Map([
        ['crew-1', [sharedMemberId]],
        ['crew-2', [sharedMemberId]],
      ]);
      const allSiteAssignmentsMap = new Map([
        [sharedMemberId, { id: sharedMemberId, version_id: 'v1', personnel_id: 'p1', zone: 'ZV', dedication_percentage: 100 }],
      ]);

      const result = evaluateCrewWorkloadV5({
        crewId: 'crew-1',
        crewName: 'Cuadrilla 1',
        plannedDate: mondayDate,
        items: [], // D=0
        crewMembers: [{ personnel_assignment_id: sharedMemberId }],
        allCrews,
        allCrewMembersMap,
        allSiteAssignmentsMap,
      });

      // La demanda cero tiene precedencia absoluta sobre Kp > 1
      expect(result.capacityStatus).toBe('NO_DEMAND');
    });
  });

  describe('CAP-05 & CAP-06: Aislamiento Demanda Temporal y Novedades', () => {
    test('calculateCrewWorkloads agrupa determinísticamente por cuadrilla y fecha sin alterar theoretical_jr', () => {
      const crew1: Crew = { id: 'c1', board_id: mockBoardId, name: 'Cuadrilla Alfa', is_active: true };
      const items = [
        createMockItem('i1', 'c1', mondayDate, 0.5),
        createMockItem('i2', 'c1', mondayDate, 0.4),
      ];

      const workloads = calculateCrewWorkloads(items, [crew1]);
      expect(workloads.length).toBe(1);
      expect(workloads[0].totalPlannedJournals).toBe(0.9);
      expect(workloads[0].assignedItemsCount).toBe(2);
      expect(workloads[0].capacityStatus).toBe('BALANCED');
    });
  });
});
