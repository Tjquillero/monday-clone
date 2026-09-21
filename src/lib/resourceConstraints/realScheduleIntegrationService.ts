/**
 * Servicio de Integración Operativa Real y Validación End-to-End (FASE 4 Hito 1)
 *
 * Axiomas Reguladores Fundantes:
 * - R-E2E-01: Soberanía contractual del Excel Maestro K:AOA.
 * - R-E2E-02: Inmutabilidad de la cadena F1-F3 (Hitos 1 a 7 congelados).
 * - R-E2E-03: Conservación granular por tupla (itemId, activityKey, groupId).
 * - R-E2E-04: P0 Histórico Puro sin auto-reparaciones pre-ingesta.
 * - R-E2E-05: Preservación independiente de Operario (Op) vs Maquinaria (Maq).
 * - R-E2E-06: Identidad de sitio soberana por groups (26 sitios).
 * - R-E2E-07: H6/H7 en modo diagnóstico estricto sobre datos reales.
 * - R-E2E-08: Preservación de explicitez 0.00 en la matriz temporal.
 * - R-E2E-09: Calendario F3.1 y rechazo explícito en H6 ante días no hábiles.
 * - R-E2E-10: Cero Solver / Cero Auto-Resolución (El cronograma es evidencia benchmark).
 */

import type { SiteResourceState, FiniteResourceType } from './types';
import type { ScheduleCandidatePlan } from './decisionProblemTypes';
import { evaluateScheduleFeasibility } from './feasibilityEvaluator';
import { evaluateScheduleObjectiveScore } from './objectiveEvaluator';
import { exploreCandidateSearchSpace } from './searchSpaceExplorer';
import type { SearchExplorationLimits, ExploredSearchSpaceResult } from './searchSpaceTypes';
import type { TemporalSchedulePayload, TemporalPayloadActivity } from '../temporalScheduleImport/types';

export interface ActivityConservationVerification {
  readonly itemId: string;
  readonly activityKey: string;
  readonly groupId: string;
  readonly siteName: string;
  readonly np: number | null;
  readonly expectedCantPoa: number;
  readonly sumTemporalCant: number;
  readonly isCantMatched: boolean;
  readonly expectedOperatorJornales: number;
  readonly sumOperatorJornales: number;
  readonly isOperatorJornalesMatched: boolean;
  readonly expectedMachineryJornales: number;
  readonly sumMachineryJornales: number;
  readonly isMachineryJornalesMatched: boolean;
  readonly isFullyPreserved: boolean;
}

export interface EndToEndValidationReport {
  readonly sourceFileName: string;
  readonly totalActivitiesEvaluated: number;
  readonly totalAllocationsInPlan: number;
  readonly unmappedSitesCount: number;
  readonly initialPlanP0: ScheduleCandidatePlan;
  readonly conservationVerifications: ReadonlyArray<ActivityConservationVerification>;
  readonly isGlobalConservationMatched: boolean;
  readonly feasibilityP0: ReturnType<typeof evaluateScheduleFeasibility>;
  readonly objectiveP0: ReturnType<typeof evaluateScheduleObjectiveScore>;
  readonly searchSpaceH7?: ExploredSearchSpaceResult;
}

/**
 * Genera una identidad contractual estable y determinista para cada actividad del cronograma.
 * Evita depender de índices de fila aleatorios en arreglos (R-E2E-04).
 */
export function generateStableActivityItemId(
  groupId: string,
  activityKey: string,
  np: number | null,
  excelRow: number
): string {
  const cleanGroup = groupId || 'UNMAPPED_GROUP';
  const cleanActivity = activityKey || 'UNKNOWN_ACTIVITY';
  const cleanNp = np != null ? `np${np}` : `row${excelRow}`;
  return `act_${cleanGroup}_${cleanActivity}_${cleanNp}`;
}

/**
 * Convierte el Payload de Ingesta Temporal de FASE 2 en el Plan Canónico Inicial P0 de FASE 3.
 * Mantiene la representación exacta AS-IS de la evidencia histórica sin reparaciones pre-ingesta.
 */
export function convertPayloadToCanonicalPlanP0(
  payload: TemporalSchedulePayload,
  catalog: SiteResourceState[]
): {
  planP0: ScheduleCandidatePlan;
  conservationVerifications: ActivityConservationVerification[];
  unmappedSitesCount: number;
} {
  const allocations: ScheduleCandidatePlan['allocations'] = [];
  const conservationVerifications: ActivityConservationVerification[] = [];
  let unmappedSitesCount = 0;

  for (const activity of payload.activities) {
    const isUnmapped = !activity.group_id || activity.group_id === 'UNMAPPED';
    if (isUnmapped) {
      unmappedSitesCount++;
    }

    const activityNp = activity.allocations[0]?.origin?.np ?? null;

    const stableItemId = generateStableActivityItemId(
      activity.group_id || 'UNMAPPED',
      activity.activity_key,
      activityNp,
      activity.excel_row
    );

    let sumCant = 0;
    let sumOpJornales = 0;
    let sumMaqJornales = 0;

    for (const alloc of activity.allocations) {
      // R-E2E-08: Se conservan todos los registros incluyendo 0.00 explícito
      const cant = alloc.quantity != null ? alloc.quantity : 0;
      const opJor = alloc.operator_jornales != null ? alloc.operator_jornales : 0;
      const maqJor = alloc.machinery_jornales != null ? alloc.machinery_jornales : 0;
      const totalJor = alloc.total_jornales != null ? alloc.total_jornales : (opJor + maqJor);

      sumCant += cant;
      sumOpJornales += opJor;
      sumMaqJornales += maqJor;

      // Resolver ID de recurso a partir del catálogo soberano o usar ID de reserva
      const siteGroup = catalog.find((s) => s.siteGroupId === activity.group_id);
      let resourceId = `RES_UNRESOLVED_${alloc.resource_type}_${activity.group_id}`;
      let resourceType: FiniteResourceType = alloc.resource_type === 'machinery' ? 'MACHINERY' : 'PERSON';
      let resourceCodeOrName = `Recurso ${alloc.resource_type} (${activity.excel_site_name})`;

      if (siteGroup) {
        if (alloc.resource_type === 'operator') {
          const matchPerson = siteGroup.persons[0];
          if (matchPerson) {
            resourceId = matchPerson.id;
            resourceCodeOrName = matchPerson.name;
          }
        } else if (alloc.resource_type === 'machinery') {
          const matchMachine = siteGroup.machinery[0];
          if (matchMachine) {
            resourceId = matchMachine.id;
            resourceCodeOrName = matchMachine.name;
          }
        }
      }

      allocations.push({
        allocationId: alloc.id,
        demandId: stableItemId,
        siteGroupId: activity.group_id || 'UNMAPPED_GROUP',
        siteName: activity.excel_site_name,
        activityKey: activity.activity_key,
        activityDescription: activity.activity_description,
        resourceId,
        resourceType,
        resourceCodeOrName,
        interval: {
          dateIso: alloc.date_iso,
          startTime: '08:00',
          endTime: '17:00',
        },
        quantity: cant,
        jornales: totalJor,
        origin: {
          sourceSheet: alloc.origin.sourceSheet,
          sourceRow: alloc.origin.sourceRow,
          colOpLetter: alloc.origin.colOpLetter,
          colCantLetter: alloc.origin.colCantLetter,
          siteName: alloc.origin.siteName,
          np: alloc.origin.np != null ? String(alloc.origin.np) : undefined,
          activityDescription: alloc.origin.activityDescription,
        },
      });
    }

    // R-E2E-03: Verificación Granular Actividad por Actividad
    const expectedCant = activity.sum_quantity != null ? activity.sum_quantity : sumCant;
    const expectedOpJornales = activity.sum_operator_jornales != null ? activity.sum_operator_jornales : sumOpJornales;
    const expectedMaqJornales = activity.sum_machinery_jornales != null ? activity.sum_machinery_jornales : sumMaqJornales;

    const isCantMatched = Math.abs(sumCant - expectedCant) <= 0.001;
    const isOpJorMatched = Math.abs(sumOpJornales - expectedOpJornales) <= 0.001;
    const isMaqJorMatched = Math.abs(sumMaqJornales - expectedMaqJornales) <= 0.001;

    conservationVerifications.push({
      itemId: stableItemId,
      activityKey: activity.activity_key,
      groupId: activity.group_id || 'UNMAPPED',
      siteName: activity.excel_site_name,
      np: activityNp,
      expectedCantPoa: expectedCant,
      sumTemporalCant: sumCant,
      isCantMatched,
      expectedOperatorJornales: expectedOpJornales,
      sumOperatorJornales: sumOpJornales,
      isOperatorJornalesMatched: isOpJorMatched,
      expectedMachineryJornales: expectedMaqJornales,
      sumMachineryJornales: sumMaqJornales,
      isMachineryJornalesMatched: isMaqJorMatched,
      isFullyPreserved: isCantMatched && isOpJorMatched && isMaqJorMatched,
    });
  }

  const planP0: ScheduleCandidatePlan = {
    candidateId: `PLAN_P0_${payload.source_sheet.replace(/\s+/g, '_')}`,
    contractualReference: `POA_REAL_${payload.source_sheet}`,
    allocations,
  };

  return {
    planP0,
    conservationVerifications,
    unmappedSitesCount,
  };
}

/**
 * Ejecuta la Validación End-to-End completa sobre un Payload de Cronograma Temporal Real.
 */
export function executeEndToEndScheduleValidation(
  payload: TemporalSchedulePayload,
  catalog: SiteResourceState[],
  explorationLimits?: SearchExplorationLimits,
  holidaysList: string[] = []
): EndToEndValidationReport {
  const { planP0, conservationVerifications, unmappedSitesCount } = convertPayloadToCanonicalPlanP0(payload, catalog);

  const isGlobalConservationMatched = conservationVerifications.every((v) => v.isFullyPreserved);

  // Diagnóstico H4 (Factibilidad de P0)
  const feasibilityP0 = evaluateScheduleFeasibility(planP0, catalog);

  // Diagnóstico H5 (Vector Objetivo Lexicográfico de P0)
  const objectiveP0 = evaluateScheduleObjectiveScore(planP0, catalog, holidaysList);

  // Diagnóstico H7 (Exploración del Espacio Alcanzable si se especifican límites)
  let searchSpaceH7: ExploredSearchSpaceResult | undefined;
  if (explorationLimits) {
    searchSpaceH7 = exploreCandidateSearchSpace(planP0, catalog, explorationLimits, holidaysList);
  }

  return {
    sourceFileName: payload.source_sheet,
    totalActivitiesEvaluated: payload.activities.length,
    totalAllocationsInPlan: planP0.allocations.length,
    unmappedSitesCount,
    initialPlanP0: planP0,
    conservationVerifications,
    isGlobalConservationMatched,
    feasibilityP0,
    objectiveP0,
    searchSpaceH7,
  };
}
