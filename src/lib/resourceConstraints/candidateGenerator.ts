/**
 * Generador y Aplicador Puro de Transformaciones de Candidatos (FASE 3 Hito 6)
 *
 * Principio Rector Congelado:
 * APLICAR TRANSFORMACIÓN (1:1) != BUSCAR O EXPLORAR CANDIDATOS
 *
 * Reglas de Gobierno:
 * - Toma un único candidato PA y una única transformación declarativa T.
 * - Retorna un único candidato derivado PB con su trazabilidad DerivationTrace, o un rechazo formal.
 * - CERO bucles de exploración, cero pruebas de "posibles fechas/recursos", cero solucionadores o heurísticas.
 * - CERO mutaciones sobre el candidato de entrada PA o el catálogo.
 * - CERO creación de capacidad virtual (no inventa personas, máquinas ni jornales).
 */

import type { SiteResourceState, FinitePerson, FiniteCrew, FiniteMachinery } from './types';
import type { ScheduleCandidatePlan } from './decisionProblemTypes';
import type {
  CandidateTransformation,
  CandidateTransformationResult,
  DerivationTrace,
} from './searchSpaceTypes';

/**
 * Función Pura: Aplica una única transformación declarativa 1:1 a un plan candidato (R-SOL-01).
 * No realiza búsquedas, reintentos ni heurísticas.
 */
export function applyCandidateTransformation(
  candidate: ScheduleCandidatePlan,
  transformation: CandidateTransformation,
  catalog: SiteResourceState[],
  holidaysList: string[] = []
): CandidateTransformationResult {
  // 1. Validar existencia de asignación afectada en el candidato
  const targetIndex = candidate.allocations.findIndex(
    (a) => a.allocationId === transformation.allocationId
  );

  if (targetIndex === -1) {
    return {
      success: false,
      rejectionReason: `La asignación objetivo "${transformation.allocationId}" no existe en el candidato "${candidate.candidateId}".`,
    };
  }

  const targetAlloc = candidate.allocations[targetIndex];

  // Copia profunda inmutable de las asignaciones del candidato
  const newAllocations = candidate.allocations.map((a) => JSON.parse(JSON.stringify(a)));

  let derivationTrace: DerivationTrace | undefined;
  const nowIso = new Date().toISOString();

  // 2. Aplicar Transformación según Tipo Declarativo
  switch (transformation.transformationType) {
    case 'SHIFT_TIME_INTERVAL': {
      if (!transformation.shiftParams || !transformation.shiftParams.newInterval) {
        return {
          success: false,
          rejectionReason: 'Parámetros de desplazamiento temporal shiftParams no especificados.',
        };
      }

      const newInterval = transformation.shiftParams.newInterval;
      if (!newInterval.dateIso) {
        return {
          success: false,
          rejectionReason: 'El nuevo intervalo temporal carece de dateIso.',
        };
      }

      // Validar Día Laboral Efectivo F3.1 (R-SOL-05): Rechazar Domingos (day 0) y Festivos
      const dateObj = new Date(`${newInterval.dateIso}T00:00:00Z`);
      const dayOfWeek = dateObj.getUTCDay();

      if (dayOfWeek === 0) {
        return {
          success: false,
          rejectionReason: `Rechazo F3.1: La fecha objetivo "${newInterval.dateIso}" es Domingo (día no hábil).`,
        };
      }

      if (holidaysList.includes(newInterval.dateIso)) {
        return {
          success: false,
          rejectionReason: `Rechazo F3.1: La fecha objetivo "${newInterval.dateIso}" es Festivo colombiano.`,
        };
      }

      const previousValue = `${targetAlloc.interval.dateIso} ${targetAlloc.interval.startTime || ''}-${targetAlloc.interval.endTime || ''}`.trim();

      // Aplicar mutación aislada de intervalo (sin tocar recursos ni cantidades)
      newAllocations[targetIndex].interval = { ...newInterval };

      const newValue = `${newInterval.dateIso} ${newInterval.startTime || ''}-${newInterval.endTime || ''}`.trim();

      derivationTrace = {
        parentCandidateId: candidate.candidateId,
        transformationId: transformation.transformationId,
        transformationType: 'SHIFT_TIME_INTERVAL',
        changedAllocationId: targetAlloc.allocationId,
        previousValue,
        newValue,
        appliedAtIso: nowIso,
      };
      break;
    }

    case 'REASSIGN_RESOURCE_EQUI_ROLE': {
      if (!transformation.reassignParams) {
        return {
          success: false,
          rejectionReason: 'Parámetros de reasignación de recurso reassignParams no especificados.',
        };
      }

      const { newResourceId, newResourceCodeOrName } = transformation.reassignParams;

      // Buscar recurso en catálogo soberano Hito 1 (R-SOL-08)
      let foundResource: FinitePerson | FiniteCrew | FiniteMachinery | undefined;
      catalog.forEach((site) => {
        if (!foundResource) foundResource = site.persons.find((p) => p.id === newResourceId);
        if (!foundResource) foundResource = site.crews.find((c) => c.id === newResourceId);
        if (!foundResource) foundResource = site.machinery.find((m) => m.id === newResourceId);
      });

      if (!foundResource) {
        return {
          success: false,
          rejectionReason: `Rechazo Catálogo Hito 1: El recurso objetivo "${newResourceId}" no existe en el catálogo activo.`,
        };
      }

      const previousValue = `${targetAlloc.resourceType}:${targetAlloc.resourceId} (${targetAlloc.resourceCodeOrName})`;

      // Mutación aislada de recurso
      newAllocations[targetIndex].resourceId = foundResource.id;
      newAllocations[targetIndex].resourceCodeOrName = newResourceCodeOrName || ('code' in foundResource && foundResource.code ? foundResource.code : foundResource.name);

      const newValue = `${newAllocations[targetIndex].resourceType}:${foundResource.id} (${newAllocations[targetIndex].resourceCodeOrName})`;

      derivationTrace = {
        parentCandidateId: candidate.candidateId,
        transformationId: transformation.transformationId,
        transformationType: 'REASSIGN_RESOURCE_EQUI_ROLE',
        changedAllocationId: targetAlloc.allocationId,
        previousValue,
        newValue,
        appliedAtIso: nowIso,
      };
      break;
    }

    case 'BIND_OPERATOR_DEPENDENCY': {
      if (!transformation.bindParams) {
        return {
          success: false,
          rejectionReason: 'Parámetros de vinculación de operador bindParams no especificados.',
        };
      }

      const { operatorAllocationId, operatorId } = transformation.bindParams;

      if (targetAlloc.resourceType !== 'MACHINERY' || !targetAlloc.machineryOperatorBinding) {
        return {
          success: false,
          rejectionReason: `La asignación "${targetAlloc.allocationId}" no es una maquinaria con requerimiento de operador.`,
        };
      }

      // Buscar asignación del operador en las asignaciones
      const opAlloc = newAllocations.find((a) => a.allocationId === operatorAllocationId);
      if (!opAlloc || opAlloc.resourceId !== operatorId) {
        return {
          success: false,
          rejectionReason: `La asignación del operador "${operatorAllocationId}" no existe o no corresponde al operador ID "${operatorId}".`,
        };
      }

      const previousValue = `operatorAllocationId:${targetAlloc.machineryOperatorBinding.operatorAllocationId || 'NONE'}`;

      // Mutación aislada de dependencia de operador
      newAllocations[targetIndex].machineryOperatorBinding = {
        ...targetAlloc.machineryOperatorBinding,
        operatorAllocationId,
        operatorId,
        isSatisfied: true,
      };

      const newValue = `operatorAllocationId:${operatorAllocationId}`;

      derivationTrace = {
        parentCandidateId: candidate.candidateId,
        transformationId: transformation.transformationId,
        transformationType: 'BIND_OPERATOR_DEPENDENCY',
        changedAllocationId: targetAlloc.allocationId,
        previousValue,
        newValue,
        appliedAtIso: nowIso,
      };
      break;
    }

    default:
      return {
        success: false,
        rejectionReason: `Tipo de transformación desconocido o no soportado.`,
      };
  }

  // 3. Generar Candidato Derivado PB Único (R-SOL-01)
  const derivedCandidate: ScheduleCandidatePlan = {
    candidateId: `candidate_derived_${candidate.candidateId}_${transformation.transformationId}`,
    contractualReference: candidate.contractualReference,
    allocations: newAllocations,
    demands: candidate.demands ? JSON.parse(JSON.stringify(candidate.demands)) : undefined,
  };

  return {
    success: true,
    derivedCandidate,
    derivationTrace,
  };
}
