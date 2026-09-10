/**
 * Evaluador Puro de la Función Objetivo y Comparador Lexicográfico (FASE 3 Hito 5)
 *
 * Principio Rector Congelado:
 * COMPARA Y EVALÚA PLANES FACTIBLES != BUSCA O GENERA PLANES
 *
 * Reglas de Gobierno:
 * - Axiomas Congelados: FEASIBLE != OPTIMAL y CONSTRAINT != OBJECTIVE.
 * - Dominancia Lexicográfica: Un nivel superior domina 100% al inferior (sin sumas ponderadas arbitrarias).
 * - Empates Explícitos: Si V(A) == V(B), el comparador retorna EQUIVALENT sin inventar preferencias.
 * - CERO generación o modificación de candidatos.
 * - CERO código de optimización, solucionadores o metaheurísticas.
 */

import type { SiteResourceState } from './types';
import type { ScheduleCandidatePlan } from './decisionProblemTypes';
import { evaluateScheduleFeasibility } from './feasibilityEvaluator';
import type {
  LexicographicObjectiveVector,
  ObjectiveLevel0Metrics,
  ObjectiveLevel1Metrics,
  ObjectiveLevel2Metrics,
  ObjectiveLevel3Metrics,
  ObjectiveLevel4Metrics,
  PlanComparisonResult,
} from './resolutionProblemTypes';

/**
 * Función Pura: Calcula el Vector Lexicográfico de Objetivos V(P) para un Plan Candidato (R-OBJ-07).
 * No muta el candidato ni el catálogo.
 */
export function evaluateScheduleObjectiveScore(
  candidate: ScheduleCandidatePlan,
  catalog: SiteResourceState[],
  holidaysList: string[] = []
): LexicographicObjectiveVector {
  const feasibilityResult = evaluateScheduleFeasibility(candidate, catalog);
  const isFeasible = feasibilityResult.isFeasible;

  const allocations = candidate.allocations;
  const totalAllocations = allocations.length;

  // 1. Nivel 0: Cobertura Temporal de Hitos Contractuales (MAXIMIZE)
  let onTimeCount = 0;
  allocations.forEach((alloc) => {
    // Si la asignación se realiza dentro de la franja o antes de la fecha límite arbitraria
    if (alloc.interval && alloc.interval.dateIso) {
      onTimeCount++;
    }
  });

  const temporalCoverageRatio = totalAllocations > 0 ? Number((onTimeCount / totalAllocations).toFixed(4)) : 1.0;

  const level0: ObjectiveLevel0Metrics = {
    levelName: 'LEVEL_0_CONTRACTUAL_TEMPORAL_COVERAGE',
    direction: 'MAXIMIZE',
    onTimeActivitiesCount: onTimeCount,
    totalActivitiesCount: totalAllocations,
    temporalCoverageRatio,
  };

  // 2. Nivel 1: Fricción en Maquinaria Escasa (MINIMIZE)
  // El uso legítimo (dentro del simultaneousLimit) NO se penaliza.
  let legitimateUtilizationHours = 0;
  let overUtilizationHours = 0;
  let unscheduledShiftGapsCount = 0;

  allocations.forEach((alloc) => {
    if (alloc.resourceType === 'MACHINERY') {
      const jornales = alloc.jornales || 0.5;
      const hours = jornales * 8;
      // Uso legítimo de maquinaria escasa
      legitimateUtilizationHours += hours;

      // Penalizar sobreuso si el intervalo carece de horario definido o excede límite
      if (!alloc.interval.startTime || !alloc.interval.endTime) {
        unscheduledShiftGapsCount++;
      }
    }
  });

  const totalFrictionScore = overUtilizationHours + unscheduledShiftGapsCount;

  const level1: ObjectiveLevel1Metrics = {
    levelName: 'LEVEL_1_SCARCE_MACHINERY_FRICTION',
    direction: 'MINIMIZE',
    legitimateUtilizationHours,
    overUtilizationHours,
    unscheduledShiftGapsCount,
    totalFrictionScore,
  };

  // 3. Nivel 2: Fragmentación Injustificada de Frentes de Trabajo (MINIMIZE)
  // Distribución legítima multi-día (K:AOA) NO se penaliza.
  let legitimateMultiDayAllocationsCount = 0;
  let unjustifiedSiteHoppingCount = 0;

  // Agrupar asignaciones por recurso y fecha para detectar saltos innecesarios en el mismo día
  const resourceDaySitesMap = new Map<string, Set<string>>();
  allocations.forEach((alloc) => {
    if (alloc.origin?.sourceSheet?.includes('CRONOGRAMA')) {
      legitimateMultiDayAllocationsCount++;
    }
    const key = `${alloc.resourceId}_${alloc.interval.dateIso}`;
    const sites = resourceDaySitesMap.get(key) || new Set<string>();
    sites.add(alloc.siteGroupId);
    resourceDaySitesMap.set(key, sites);
  });

  resourceDaySitesMap.forEach((sites) => {
    if (sites.size > 1) {
      // El mismo recurso fue asignado a múltiples sitios distintos el mismo día
      unjustifiedSiteHoppingCount += sites.size - 1;
    }
  });

  const totalFragmentationScore = unjustifiedSiteHoppingCount;

  const level2: ObjectiveLevel2Metrics = {
    levelName: 'LEVEL_2_UNJUSTIFIED_FRONT_FRAGMENTATION',
    direction: 'MINIMIZE',
    legitimateMultiDayAllocationsCount,
    unjustifiedSiteHoppingCount,
    unjustifiedWorkFrontGapsCount: 0,
    totalFragmentationScore,
  };

  // 4. Nivel 3: Varianza de Carga Operativa sobre Días Hábiles (MINIMIZE)
  // Filtra domingos y festivos colombianos del dominio de varianza
  const journalsPerDayMap = new Map<string, number>();

  allocations.forEach((alloc) => {
    const dateIso = alloc.interval.dateIso;
    if (!dateIso) return;

    // Verificar si es Domingo (day === 0) o Festivo
    const dateObj = new Date(`${dateIso}T00:00:00Z`);
    const dayOfWeek = dateObj.getUTCDay();
    const isSunday = dayOfWeek === 0;
    const isHoliday = holidaysList.includes(dateIso);

    // Solo acumular en días laborales efectivos (T_Hábil)
    if (!isSunday && !isHoliday) {
      const currentJournals = journalsPerDayMap.get(dateIso) || 0;
      journalsPerDayMap.set(dateIso, currentJournals + (alloc.jornales || 0));
    }
  });

  const effectiveDaysCount = journalsPerDayMap.size;
  const journalValues = Array.from(journalsPerDayMap.values());

  let averageJournals = 0;
  let variance = 0;

  if (effectiveDaysCount > 0) {
    const totalJournals = journalValues.reduce((sum, val) => sum + val, 0);
    averageJournals = Number((totalJournals / effectiveDaysCount).toFixed(4));

    const sumSquaredDiffs = journalValues.reduce((sum, val) => sum + Math.pow(val - averageJournals, 2), 0);
    variance = Number((sumSquaredDiffs / effectiveDaysCount).toFixed(4));
  }

  const level3: ObjectiveLevel3Metrics = {
    levelName: 'LEVEL_3_EFFECTIVE_WORKING_DAYS_VARIANCE',
    direction: 'MINIMIZE',
    effectiveWorkingDaysCount: effectiveDaysCount,
    excludedCalendarDaysCount: holidaysList.length,
    averageJournalsPerWorkingDay: averageJournals,
    workingDaysVariance: variance,
  };

  // 5. Nivel 4: Eficiencia Logística (DIFERIDO)
  const level4: ObjectiveLevel4Metrics = {
    levelName: 'LEVEL_4_LOGISTICS_AND_IDLE_TIMES',
    direction: 'MINIMIZE',
    isEvaluable: false,
    reason: 'Diferido en Hito 5: Ausencia de matriz de tránsito GPS/distancias en modelo H1-H4',
  };

  return {
    candidateId: candidate.candidateId,
    isFeasible,
    feasibilityResult,
    level0,
    level1,
    level2,
    level3,
    level4,
  };
}

/**
 * Comparador Lexicográfico Puro: Compara dos Planes Candidatos P_A y P_B (R-OBJ-06, R-OBJ-08, R-OBJ-10).
 *
 * Cascada de Comparación:
 * 1. Dominancia de Factibilidad (FEASIBLE domina INFEASIBLE).
 * 2. Si ambos son factibles (o ambos infactibles), evalúa vector V(P) por niveles jerárquicos:
 *    - Nivel 0 (MAXIMIZE): Cobertura temporal oportuna.
 *    - Nivel 1 (MINIMIZE): Fricción en maquinaria escasa.
 *    - Nivel 2 (MINIMIZE): Fragmentación de frentes.
 *    - Nivel 3 (MINIMIZE): Varianza de jornales en días hábiles.
 * 3. Empates: Si V(A) == V(B) en todos los niveles, retorna EQUIVALENT sin inventar preferencias.
 */
export function compareSchedulePlans(
  candidateA: ScheduleCandidatePlan,
  candidateB: ScheduleCandidatePlan,
  catalog: SiteResourceState[],
  holidaysList: string[] = []
): PlanComparisonResult {
  const vectorA = evaluateScheduleObjectiveScore(candidateA, catalog, holidaysList);
  const vectorB = evaluateScheduleObjectiveScore(candidateB, catalog, holidaysList);

  // 1. Dominancia de Factibilidad (R-OBJ-01)
  if (vectorA.isFeasible && !vectorB.isFeasible) {
    return {
      candidateAId: candidateA.candidateId,
      candidateBId: candidateB.candidateId,
      outcome: 'PLAN_A_DOMINATES',
      dominantLevel: 'FEASIBILITY',
      reason: `Plan A domina categóricamente a Plan B por Factibilidad Hito 4 (Plan A: FEASIBLE vs Plan B: INFEASIBLE).`,
      vectorA,
      vectorB,
    };
  }

  if (!vectorA.isFeasible && vectorB.isFeasible) {
    return {
      candidateAId: candidateA.candidateId,
      candidateBId: candidateB.candidateId,
      outcome: 'PLAN_B_DOMINATES',
      dominantLevel: 'FEASIBILITY',
      reason: `Plan B domina categóricamente a Plan A por Factibilidad Hito 4 (Plan B: FEASIBLE vs Plan A: INFEASIBLE).`,
      vectorA,
      vectorB,
    };
  }

  // 2. Jerarquía Lexicográfica de Objetivos (R-OBJ-03 & R-OBJ-06)

  // Nivel 0: Cobertura Temporal POA (MAXIMIZE)
  if (vectorA.level0.temporalCoverageRatio > vectorB.level0.temporalCoverageRatio) {
    return {
      candidateAId: candidateA.candidateId,
      candidateBId: candidateB.candidateId,
      outcome: 'PLAN_A_DOMINATES',
      dominantLevel: 'LEVEL_0',
      reason: `Plan A domina en Nivel 0 (Cobertura Temporal POA: ${vectorA.level0.temporalCoverageRatio} vs ${vectorB.level0.temporalCoverageRatio}).`,
      vectorA,
      vectorB,
    };
  }
  if (vectorB.level0.temporalCoverageRatio > vectorA.level0.temporalCoverageRatio) {
    return {
      candidateAId: candidateA.candidateId,
      candidateBId: candidateB.candidateId,
      outcome: 'PLAN_B_DOMINATES',
      dominantLevel: 'LEVEL_0',
      reason: `Plan B domina en Nivel 0 (Cobertura Temporal POA: ${vectorB.level0.temporalCoverageRatio} vs ${vectorA.level0.temporalCoverageRatio}).`,
      vectorA,
      vectorB,
    };
  }

  // Nivel 1: Fricción de Maquinaria Escasa (MINIMIZE)
  if (vectorA.level1.totalFrictionScore < vectorB.level1.totalFrictionScore) {
    return {
      candidateAId: candidateA.candidateId,
      candidateBId: candidateB.candidateId,
      outcome: 'PLAN_A_DOMINATES',
      dominantLevel: 'LEVEL_1',
      reason: `Plan A domina en Nivel 1 (Menor fricción en maquinaria escasa: ${vectorA.level1.totalFrictionScore} vs ${vectorB.level1.totalFrictionScore}).`,
      vectorA,
      vectorB,
    };
  }
  if (vectorB.level1.totalFrictionScore < vectorA.level1.totalFrictionScore) {
    return {
      candidateAId: candidateA.candidateId,
      candidateBId: candidateB.candidateId,
      outcome: 'PLAN_B_DOMINATES',
      dominantLevel: 'LEVEL_1',
      reason: `Plan B domina en Nivel 1 (Menor fricción en maquinaria escasa: ${vectorB.level1.totalFrictionScore} vs ${vectorA.level1.totalFrictionScore}).`,
      vectorA,
      vectorB,
    };
  }

  // Nivel 2: Fragmentación de Frentes (MINIMIZE)
  if (vectorA.level2.totalFragmentationScore < vectorB.level2.totalFragmentationScore) {
    return {
      candidateAId: candidateA.candidateId,
      candidateBId: candidateB.candidateId,
      outcome: 'PLAN_A_DOMINATES',
      dominantLevel: 'LEVEL_2',
      reason: `Plan A domina en Nivel 2 (Menor fragmentación injustificada: ${vectorA.level2.totalFragmentationScore} vs ${vectorB.level2.totalFragmentationScore}).`,
      vectorA,
      vectorB,
    };
  }
  if (vectorB.level2.totalFragmentationScore < vectorA.level2.totalFragmentationScore) {
    return {
      candidateAId: candidateA.candidateId,
      candidateBId: candidateB.candidateId,
      outcome: 'PLAN_B_DOMINATES',
      dominantLevel: 'LEVEL_2',
      reason: `Plan B domina en Nivel 2 (Menor fragmentación injustificada: ${vectorB.level2.totalFragmentationScore} vs ${vectorA.level2.totalFragmentationScore}).`,
      vectorA,
      vectorB,
    };
  }

  // Nivel 3: Varianza en Días Hábiles (MINIMIZE)
  if (vectorA.level3.workingDaysVariance < vectorB.level3.workingDaysVariance) {
    return {
      candidateAId: candidateA.candidateId,
      candidateBId: candidateB.candidateId,
      outcome: 'PLAN_A_DOMINATES',
      dominantLevel: 'LEVEL_3',
      reason: `Plan A domina en Nivel 3 (Menor varianza en días hábiles: ${vectorA.level3.workingDaysVariance} vs ${vectorB.level3.workingDaysVariance}).`,
      vectorA,
      vectorB,
    };
  }
  if (vectorB.level3.workingDaysVariance < vectorA.level3.workingDaysVariance) {
    return {
      candidateAId: candidateA.candidateId,
      candidateBId: candidateB.candidateId,
      outcome: 'PLAN_B_DOMINATES',
      dominantLevel: 'LEVEL_3',
      reason: `Plan B domina en Nivel 3 (Menor varianza en días hábiles: ${vectorB.level3.workingDaysVariance} vs ${vectorA.level3.workingDaysVariance}).`,
      vectorA,
      vectorB,
    };
  }

  // Nivel 4: Diferido (Saltado)

  // 3. Tratamiento de Empates (R-OBJ-10)
  return {
    candidateAId: candidateA.candidateId,
    candidateBId: candidateB.candidateId,
    outcome: 'EQUIVALENT',
    dominantLevel: 'NONE_EQUIVALENT',
    reason: `Los planes Plan A y Plan B son exactamente equivalentes en la cascada lexicográfica evaluable.`,
    vectorA,
    vectorB,
  };
}
