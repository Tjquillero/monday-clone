/**
 * Suite de Certificación Auditorial del Seleccionador de Candidatos (FASE 4 Hito 3)
 *
 * Pruebas Rectoras Exigidas SEL-01 -> SEL-11:
 * SEL-01: Dominancia Categórica de Factibilidad (FEASIBLE > INFEASIBLE).
 * SEL-02: Respeto a Cascada Lexicográfica H5 (Niveles v0 -> v4).
 * SEL-03: Desempate Determinista Canónico (candidateId UTF-8 ante V(A) == V(B)).
 * SEL-04: Colección Vacía (EMPTY_CANDIDATE_COLLECTION).
 * SEL-05: Inmutabilidad Absoluta (toEqual(copy)).
 * SEL-06: Determinismo Absoluto 100% (Identidad en corridas independientes).
 * SEL-07: Prueba Negativa (Cero Búsqueda / Cero H6/H7 / Cero Solver).
 * SEL-08: Prueba Negativa (Cero Sumas Ponderadas / Cero Weighted Sums).
 * SEL-09: Candidato Incompleto (INVALID_SELECTION_INPUT).
 * SEL-10: Todos los Candidatos Infactibles (NO_FEASIBLE_CANDIDATE_FOUND, selectedCandidate: null).
 * SEL-11: Equivalencia Real + IDs Diferentes (OPTIMAL_EQUIVALENT_TIE_BROKEN).
 */

import {
  selectOptimalScheduleCandidate,
  compareObjectiveVectorsPure,
  EvaluatedCandidateEntry,
} from '../candidateSelectorService';
import type { ScheduleCandidatePlan, ScheduleFeasibilityResult } from '../decisionProblemTypes';
import type { LexicographicObjectiveVector } from '../resolutionProblemTypes';

describe('FASE 4 Hito 3: Candidate Selector Service Suite (SEL-01 -> SEL-11)', () => {
  let mockFeasibleResult: ScheduleFeasibilityResult;
  let mockInfeasibleResult: ScheduleFeasibilityResult;

  let baseVector: LexicographicObjectiveVector;
  let betterVectorL0: LexicographicObjectiveVector;
  let betterVectorL1: LexicographicObjectiveVector;

  beforeEach(() => {
    mockFeasibleResult = {
      candidateId: 'cand_test',
      status: 'FEASIBLE',
      isFeasible: true,
      layerStatus: {
        structural: { isFeasible: true, issuesCount: 0 },
        temporal: { isFeasible: true, issuesCount: 0 },
        operational: { isFeasible: true, issuesCount: 0 },
      },
      violationsCount: 0,
      violations: [],
      undeterminedCount: 0,
      evaluatedAllocationsCount: 1,
    };

    mockInfeasibleResult = {
      candidateId: 'cand_infeasible',
      status: 'INFEASIBLE',
      isFeasible: false,
      layerStatus: {
        structural: { isFeasible: false, issuesCount: 1 },
        temporal: { isFeasible: true, issuesCount: 0 },
        operational: { isFeasible: true, issuesCount: 0 },
      },
      violationsCount: 1,
      violations: [
        {
          id: 'v1',
          constraintType: 'INEXISTENT_CATALOG_RESOURCE',
          allocationId: 'alloc_01',
          resourceId: 'res_unknown',
          layer: 'STRUCTURAL',
          reason: 'Recurso no existe',
        },
      ],
      undeterminedCount: 0,
      evaluatedAllocationsCount: 1,
    };

    baseVector = {
      candidateId: 'cand_base',
      isFeasible: true,
      feasibilityResult: mockFeasibleResult,
      level0: {
        levelName: 'LEVEL_0_CONTRACTUAL_TEMPORAL_COVERAGE',
        direction: 'MAXIMIZE',
        onTimeActivitiesCount: 10,
        totalActivitiesCount: 10,
        temporalCoverageRatio: 1.0,
      },
      level1: {
        levelName: 'LEVEL_1_SCARCE_MACHINERY_FRICTION',
        direction: 'MINIMIZE',
        legitimateUtilizationHours: 8,
        overUtilizationHours: 0,
        unscheduledShiftGapsCount: 0,
        totalFrictionScore: 10.0,
      },
      level2: {
        levelName: 'LEVEL_2_UNJUSTIFIED_FRONT_FRAGMENTATION',
        direction: 'MINIMIZE',
        legitimateMultiDayAllocationsCount: 0,
        unjustifiedSiteHoppingCount: 0,
        unjustifiedWorkFrontGapsCount: 0,
        totalFragmentationScore: 5.0,
      },
      level3: {
        levelName: 'LEVEL_3_EFFECTIVE_WORKING_DAYS_VARIANCE',
        direction: 'MINIMIZE',
        effectiveWorkingDaysCount: 5,
        excludedCalendarDaysCount: 2,
        averageJournalsPerWorkingDay: 2,
        workingDaysVariance: 2.0,
      },
      level4: {
        levelName: 'LEVEL_4_LOGISTICS_AND_IDLE_TIMES',
        direction: 'MINIMIZE',
        isEvaluable: false,
        reason: 'Diferido por matriz GPS',
      },
    };

    betterVectorL0 = JSON.parse(JSON.stringify(baseVector));
    betterVectorL0.level0.temporalCoverageRatio = 1.0;

    betterVectorL1 = JSON.parse(JSON.stringify(baseVector));
    betterVectorL1.level1.totalFrictionScore = 2.0; // Menor fricción = Mejor en L1
  });

  function createCandidateEntry(
    id: string,
    isFeasible: boolean,
    objectiveVector: LexicographicObjectiveVector
  ): EvaluatedCandidateEntry {
    const feas = isFeasible ? { ...mockFeasibleResult, candidateId: id } : { ...mockInfeasibleResult, candidateId: id };
    return {
      candidate: {
        candidateId: id,
        contractualReference: 'POA-TEST',
        allocations: [
          {
            allocationId: `alloc_${id}`,
            demandId: `dem_${id}`,
            siteGroupId: 'grp_test',
            siteName: 'Sitio Test',
            activityKey: 'ACTIVIDAD_TEST',
            activityDescription: 'Descripción Test',
            resourceType: 'PERSON',
            resourceId: 'res_001',
            resourceCodeOrName: 'Operador 1',
            interval: {
              dateIso: '2025-06-02',
            },
            quantity: 1,
            jornales: 1,
          },
        ],
      },
      feasibility: feas,
      objective: {
        ...objectiveVector,
        candidateId: id,
        feasibilityResult: feas,
      },
    };
  }

  test('SEL-01: Dominancia Categórica de Factibilidad (FEASIBLE domina 100% a INFEASIBLE)', () => {
    const entryFeasible = createCandidateEntry('cand_feasible', true, baseVector);
    const entryInfeasible = createCandidateEntry('cand_infeasible', false, betterVectorL1);

    const result = selectOptimalScheduleCandidate([entryInfeasible, entryFeasible]);

    expect(result.selectionStatus).toBe('OPTIMAL_SINGLE_WINNER');
    expect(result.selectedCandidateId).toBe('cand_feasible');
    expect(result.feasibleCandidatesCount).toBe(1);
    expect(result.infeasibleCandidatesCount).toBe(1);
  });

  test('SEL-02: Respeto a Cascada Lexicográfica H5 (Niveles v0 -> v4)', () => {
    const entryBase = createCandidateEntry('cand_base', true, baseVector);
    const entryBetterL1 = createCandidateEntry('cand_better_l1', true, betterVectorL1);

    const result = selectOptimalScheduleCandidate([entryBase, entryBetterL1]);

    expect(result.selectionStatus).toBe('OPTIMAL_SINGLE_WINNER');
    expect(result.selectedCandidateId).toBe('cand_better_l1');
  });

  test('SEL-03: Desempate Determinista Canónico por candidateId UTF-8 ante V(A) == V(B)', () => {
    const entryB = createCandidateEntry('cand_bbb', true, baseVector);
    const entryA = createCandidateEntry('cand_aaa', true, baseVector);

    const result = selectOptimalScheduleCandidate([entryB, entryA]);

    expect(result.selectionStatus).toBe('OPTIMAL_EQUIVALENT_TIE_BROKEN');
    expect(result.selectedCandidateId).toBe('cand_aaa');
    expect(result.equivalentCandidateIds).toEqual(['cand_aaa', 'cand_bbb']);
  });

  test('SEL-04: Colección Vacía (EMPTY_CANDIDATE_COLLECTION)', () => {
    const result = selectOptimalScheduleCandidate([]);

    expect(result.selectionStatus).toBe('EMPTY_CANDIDATE_COLLECTION');
    expect(result.selectedCandidateId).toBeNull();
    expect(result.selectedCandidate).toBeNull();
  });

  test('SEL-05: Inmutabilidad Absoluta (toEqual(copy))', () => {
    const entryA = createCandidateEntry('cand_aaa', true, baseVector);
    const entryCopy = JSON.parse(JSON.stringify(entryA));

    selectOptimalScheduleCandidate([entryA]);

    expect(entryA).toEqual(entryCopy);
  });

  test('SEL-06: Determinismo Absoluto 100% (Mismo Input -> Mismo Resultado)', () => {
    const entryA = createCandidateEntry('cand_aaa', true, baseVector);
    const entryB = createCandidateEntry('cand_bbb', true, betterVectorL1);

    const fixedDate = '2026-09-13T10:00:00.000Z';
    const res1 = selectOptimalScheduleCandidate([entryA, entryB], fixedDate);
    const res2 = selectOptimalScheduleCandidate([entryA, entryB], fixedDate);

    expect(res1).toEqual(res2);
    expect(res1.selectedCandidateId).toBe(res2.selectedCandidateId);
  });

  test('SEL-07: Prueba Negativa (Cero Búsqueda / Cero H6/H7 / Cero Solver)', () => {
    const entryA = createCandidateEntry('cand_aaa', true, baseVector);
    const result = selectOptimalScheduleCandidate([entryA]);

    expect(result).not.toHaveProperty('searchSpaceH7');
    expect(result).not.toHaveProperty('exploredNodes');
    expect(result).not.toHaveProperty('appliedTransformations');
  });

  test('SEL-08: Prueba Negativa (Cero Sumas Ponderadas / Cero Weighted Sums)', () => {
    const vecA = JSON.parse(JSON.stringify(baseVector));
    vecA.level0.temporalCoverageRatio = 1.0;
    vecA.level1.totalFrictionScore = 100.0;

    const vecB = JSON.parse(JSON.stringify(baseVector));
    vecB.level0.temporalCoverageRatio = 0.5;
    vecB.level1.totalFrictionScore = 0.0;

    const entryA = createCandidateEntry('cand_win_l0', true, vecA);
    const entryB = createCandidateEntry('cand_win_l1', true, vecB);

    const result = selectOptimalScheduleCandidate([entryB, entryA]);

    expect(result.selectedCandidateId).toBe('cand_win_l0');
    expect(compareObjectiveVectorsPure(vecA, vecB)).toBe(1);
  });

  test('SEL-09: Candidato con Vector H5 Incompleto (INVALID_SELECTION_INPUT)', () => {
    const invalidEntry = {
      candidate: { candidateId: 'cand_invalid', allocations: [] },
      feasibility: mockFeasibleResult,
      objective: null as unknown as LexicographicObjectiveVector,
    };

    const result = selectOptimalScheduleCandidate([invalidEntry]);

    expect(result.selectionStatus).toBe('INVALID_SELECTION_INPUT');
    expect(result.selectedCandidateId).toBeNull();
    expect(result.selectedCandidate).toBeNull();
  });

  test('SEL-10: Todos los Candidatos Infactibles (NO_FEASIBLE_CANDIDATE_FOUND)', () => {
    const entryInf1 = createCandidateEntry('cand_inf_1', false, baseVector);
    const entryInf2 = createCandidateEntry('cand_inf_2', false, betterVectorL1);

    const result = selectOptimalScheduleCandidate([entryInf1, entryInf2]);

    expect(result.selectionStatus).toBe('NO_FEASIBLE_CANDIDATE_FOUND');
    expect(result.selectedCandidateId).toBeNull();
    expect(result.selectedCandidate).toBeNull();
    expect(result.feasibleCandidatesCount).toBe(0);
    expect(result.infeasibleCandidatesCount).toBe(2);
  });

  test('SEL-11: Equivalencia Real + IDs Diferentes (OPTIMAL_EQUIVALENT_TIE_BROKEN)', () => {
    const entryA = createCandidateEntry('cand_aaa', true, baseVector);
    const entryB = createCandidateEntry('cand_bbb', true, baseVector);

    const result = selectOptimalScheduleCandidate([entryB, entryA]);

    expect(result.selectionStatus).toBe('OPTIMAL_EQUIVALENT_TIE_BROKEN');
    expect(result.selectedCandidateId).toBe('cand_aaa');
    expect(result.equivalentCandidateIds).toEqual(['cand_aaa', 'cand_bbb']);
  });
});
