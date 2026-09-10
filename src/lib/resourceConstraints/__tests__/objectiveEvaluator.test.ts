import {
  evaluateScheduleObjectiveScore,
  compareSchedulePlans,
} from '../objectiveEvaluator';
import { getSiteResourceState } from '../finiteResourceCatalog';
import {
  buildResourceTemporalAllocation,
  bindMachineryOperatorAllocation,
} from '../temporalResourceAllocation';
import type {
  ResourceDemandAllocation,
  SiteResourceState,
  FinitePerson,
  FiniteMachinery,
  FiniteCrew,
} from '../types';
import type { ScheduleCandidatePlan } from '../decisionProblemTypes';

describe('FASE 3 Hito 5: Especificación Formal del Problema de Resolución y Función Objetivo', () => {
  const mockPersons: FinitePerson[] = [
    {
      id: 'pers_tractorista_1',
      documentId: '10982341',
      name: 'Carlos Tractorista',
      role: 'TRACTORISTA',
      isAvailable: true,
      siteGroupId: 'group_country_001',
    },
    {
      id: 'pers_operario_2',
      documentId: '10982342',
      name: 'María Operaria',
      role: 'OPERARIO',
      isAvailable: true,
      siteGroupId: 'group_country_001',
    },
  ];

  const mockCrews: FiniteCrew[] = [
    {
      id: 'crew_001',
      name: 'Cuadrilla Country',
      code: 'CWD-01',
      leaderId: 'pers_tractorista_1',
      memberIds: ['pers_tractorista_1', 'pers_operario_2'],
      siteGroupId: 'group_country_001',
      isAvailable: true,
    },
  ];

  const mockMachinery: FiniteMachinery[] = [
    {
      id: 'mach_tractor_1',
      code: 'TR-001',
      name: 'Tractor Agrícola 1',
      category: 'TRACTOR',
      siteGroupId: 'group_country_001',
      simultaneousLimit: 1,
      operatorRequirement: {
        requiredRole: 'TRACTORISTA',
        operatorCount: 1,
      },
      isAvailable: true,
    },
  ];

  const mockSiteState: SiteResourceState = getSiteResourceState(
    'group_country_001',
    'PLAYA DEL COUNTRY',
    mockPersons,
    mockCrews,
    mockMachinery
  );

  const mockCatalog = [mockSiteState];

  const sampleDemandPerson: ResourceDemandAllocation = {
    allocationId: 'demand_001',
    siteGroupId: 'group_country_001',
    siteName: 'PLAYA DEL COUNTRY',
    activityKey: '1',
    activityDescription: 'Limpieza Manual de Playa',
    resourceType: 'PERSON',
    resourceId: 'pers_operario_2',
    resourceCodeOrName: 'María Operaria',
    interval: { dateIso: '2026-09-10', startTime: '08:00', endTime: '12:00' },
    quantity: 1000,
    jornales: 1,
  };

  const sampleDemandMachinery: ResourceDemandAllocation = {
    allocationId: 'demand_002',
    siteGroupId: 'group_country_001',
    siteName: 'PLAYA DEL COUNTRY',
    activityKey: '2',
    activityDescription: 'Mecanizado con Tractor',
    resourceType: 'MACHINERY',
    resourceId: 'mach_tractor_1',
    resourceCodeOrName: 'TR-001',
    interval: { dateIso: '2026-09-10', startTime: '08:00', endTime: '10:00' },
    quantity: 500,
    jornales: 0.5,
  };

  test('1. FEASIBLE vs INFEASIBLE: Plan Factible Domina Categóricamente (R-OBJ-01)', () => {
    // Plan A: Factible
    const allocPerson = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[1]);
    const allocMach = buildResourceTemporalAllocation(sampleDemandMachinery, mockMachinery[0]);
    const allocOp = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[0]);
    const boundMach = bindMachineryOperatorAllocation(allocMach, allocOp);

    const planFeasible: ScheduleCandidatePlan = {
      candidateId: 'plan_feasible',
      allocations: [allocPerson, boundMach, allocOp],
    };

    // Plan B: Infactible (Maquinaria sin operador vinculado)
    const unboundMach = buildResourceTemporalAllocation(sampleDemandMachinery, mockMachinery[0]);
    const planInfeasible: ScheduleCandidatePlan = {
      candidateId: 'plan_infeasible',
      allocations: [unboundMach],
    };

    const comparison = compareSchedulePlans(planFeasible, planInfeasible, mockCatalog);

    expect(comparison.outcome).toBe('PLAN_A_DOMINATES');
    expect(comparison.dominantLevel).toBe('FEASIBILITY');
    expect(comparison.vectorA.isFeasible).toBe(true);
    expect(comparison.vectorB.isFeasible).toBe(false);
  });

  test('2. Planes Factibles Idénticos Retornan EQUIVALENT (R-OBJ-10)', () => {
    const allocPerson = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[1]);
    const allocMach = buildResourceTemporalAllocation(sampleDemandMachinery, mockMachinery[0]);
    const allocOp = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[0]);
    const boundMach = bindMachineryOperatorAllocation(allocMach, allocOp);

    const planA: ScheduleCandidatePlan = {
      candidateId: 'plan_a',
      allocations: [allocPerson, boundMach, allocOp],
    };

    const planB: ScheduleCandidatePlan = {
      candidateId: 'plan_b',
      allocations: [allocPerson, boundMach, allocOp],
    };

    const comparison = compareSchedulePlans(planA, planB, mockCatalog);

    expect(comparison.outcome).toBe('EQUIVALENT');
    expect(comparison.dominantLevel).toBe('NONE_EQUIVALENT');
  });

  test('3. Jerarquía Lexicográfica: Nivel Superior Domina a Niveles Inferiores (R-OBJ-03 & R-OBJ-06)', () => {
    // Plan A tiene menor fricción en Nivel 1
    const allocPersonA = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[1]);
    const allocMachA = buildResourceTemporalAllocation(sampleDemandMachinery, mockMachinery[0]);
    allocMachA.interval = { dateIso: '2026-09-10', startTime: '08:00', endTime: '10:00' };
    const allocOpA = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[0]);
    const boundMachA = bindMachineryOperatorAllocation(allocMachA, allocOpA);

    const planA: ScheduleCandidatePlan = {
      candidateId: 'plan_a_level1_winner',
      allocations: [allocPersonA, boundMachA, allocOpA],
    };

    // Plan B tiene mayor fricción en Nivel 1 por vacíos en intervalo
    const allocMachB = buildResourceTemporalAllocation(sampleDemandMachinery, mockMachinery[0]);
    allocMachB.interval = { dateIso: '2026-09-10' }; // Sin hora explícita -> Penalización Nivel 1
    const allocOpB = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[0]);
    const boundMachB = bindMachineryOperatorAllocation(allocMachB, allocOpB);

    const planB: ScheduleCandidatePlan = {
      candidateId: 'plan_b_level1_loser',
      allocations: [boundMachB, allocOpB],
    };

    const comparison = compareSchedulePlans(planA, planB, mockCatalog);

    expect(comparison.outcome).toBe('PLAN_A_DOMINATES');
    expect(comparison.dominantLevel).toBe('LEVEL_1');
  });

  test('4. Uso Legítimo de Maquinaria Escasa NO se Penaliza (R-OBJ-07)', () => {
    const allocMach = buildResourceTemporalAllocation(sampleDemandMachinery, mockMachinery[0]);
    allocMach.interval = { dateIso: '2026-09-10', startTime: '08:00', endTime: '10:00' };
    const allocOp = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[0]);
    const boundMach = bindMachineryOperatorAllocation(allocMach, allocOp);

    const candidate: ScheduleCandidatePlan = {
      candidateId: 'plan_legitimate_machinery',
      allocations: [boundMach, allocOp],
    };

    const score = evaluateScheduleObjectiveScore(candidate, mockCatalog);

    expect(score.level1.legitimateUtilizationHours).toBe(4); // 0.5 jornales * 8h
    expect(score.level1.totalFrictionScore).toBe(0); // CERO penalización por uso legítimo
  });

  test('5. Calendario Colombiano Exime Domingos y Festivos de Varianza en Nivel 3 (R-OBJ-07)', () => {
    // Asignaciones en Lunes (2026-09-07) y Domingo (2026-09-13)
    const demandWeekday: ResourceDemandAllocation = {
      ...sampleDemandPerson,
      interval: { dateIso: '2026-09-07', startTime: '08:00', endTime: '12:00' },
      jornales: 1.0,
    };
    const demandSunday: ResourceDemandAllocation = {
      ...sampleDemandPerson,
      interval: { dateIso: '2026-09-13', startTime: '08:00', endTime: '12:00' }, // Domingo
      jornales: 1.0,
    };

    const allocWeekday = buildResourceTemporalAllocation(demandWeekday, mockPersons[1]);
    const allocSunday = buildResourceTemporalAllocation(demandSunday, mockPersons[1]);

    const candidate: ScheduleCandidatePlan = {
      candidateId: 'plan_sunday_exemption',
      allocations: [allocWeekday, allocSunday],
    };

    const score = evaluateScheduleObjectiveScore(candidate, mockCatalog, ['2026-09-07']);

    // El 2026-09-07 es festivo declarado y 2026-09-13 es Domingo -> 0 días hábiles
    expect(score.level3.effectiveWorkingDaysCount).toBe(0);
    expect(score.level3.workingDaysVariance).toBe(0);
  });

  test('6. Nivel 4 Permanece Diferido e Inevaluable (R-OBJ-11)', () => {
    const allocPerson = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[1]);
    const candidate: ScheduleCandidatePlan = {
      candidateId: 'plan_level4_deferred',
      allocations: [allocPerson],
    };

    const score = evaluateScheduleObjectiveScore(candidate, mockCatalog);

    expect(score.level4.isEvaluable).toBe(false);
    expect(score.level4.reason).toContain('Diferido en Hito 5');
  });

  test('7. Inmutabilidad, Determinismo y Cero Generación de Candidatos (R-OBJ-09, R-OBJ-10, R-OBJ-12)', () => {
    const allocPerson = buildResourceTemporalAllocation(sampleDemandPerson, mockPersons[1]);
    const candidateA: ScheduleCandidatePlan = {
      candidateId: 'plan_det_a',
      allocations: [allocPerson],
    };
    const candidateB: ScheduleCandidatePlan = {
      candidateId: 'plan_det_b',
      allocations: [allocPerson],
    };

    const copyA = JSON.parse(JSON.stringify(candidateA));
    const copyB = JSON.parse(JSON.stringify(candidateB));
    const catalogCopy = JSON.parse(JSON.stringify(mockCatalog));

    const resultRun1 = compareSchedulePlans(candidateA, candidateB, mockCatalog);
    const resultRun2 = compareSchedulePlans(candidateA, candidateB, mockCatalog);

    // Inmutabilidad (R-OBJ-09)
    expect(candidateA).toEqual(copyA);
    expect(candidateB).toEqual(copyB);
    expect(mockCatalog).toEqual(catalogCopy);

    // Determinismo (R-OBJ-10)
    expect(resultRun1).toEqual(resultRun2);

    // Cero generación de candidato C (R-OBJ-12)
    expect(resultRun1.outcome).toBe('EQUIVALENT');
    expect(resultRun1).not.toHaveProperty('suggestedCandidate');
  });
});
