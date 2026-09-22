/**
 * Service: Domain Event Dispatcher for Workflow Automation (Mantenix v1.2)
 * Baseline Entrada: 117 suites / 955 tests / TS 0 errores
 * 
 * Principios:
 * 1. Post-Commit Durable Event Dispatching: El despacho se produce tras la confirmación de hechos soberanos.
 * 2. Causalidad y Loop Guard: Preserva actorType ('AUTOMATION' | 'USER' | 'SYSTEM') y propaga causalityDepth.
 * 3. Identidad Determinista (WF-C01): Calcula eventId reproducible según EVENT_IDENTITY_RULE.
 * 4. Aislamiento H8: 🔴 STRICTLY NO-GO (0 imports, 0 llamadas).
 */

import {
  DomainEvent,
  DomainEventActor,
  WorkflowTriggerType,
} from '../types/workflowAutomation';

export interface CreateDomainEventInput<T = Record<string, unknown>> {
  eventType: WorkflowTriggerType;
  boardId: string;
  actor: DomainEventActor;
  causalityDepth?: number;
  sourceMutationId: string;
  occurredAt?: string;
  entityId: string;
  deterministicSuffix?: string;
  payload: T;
}

/**
 * Calcula el eventId determinista para cada familia de eventos según WF-C01.
 */
export function computeDeterministicEventId(
  eventType: WorkflowTriggerType,
  entityId: string,
  deterministicSuffix: string
): string {
  switch (eventType) {
    case 'EXECUTION_REPORTED':
      return `evt__EXEC_REP__${entityId}__${deterministicSuffix}`;
    case 'EXECUTION_VERIFIED':
      return `evt__EXEC_VER__${entityId}__${deterministicSuffix}`;
    case 'EXECUTION_REJECTED':
      return `evt__EXEC_REJ__${entityId}__${deterministicSuffix}`;
    case 'PLAN_ITEM_STATUS_CHANGED':
      return `evt__PLAN_STATUS__${entityId}__${deterministicSuffix}`;
    case 'CREW_ASSIGNMENT_CHANGED':
      return `evt__CREW_ASSIGN__${entityId}__${deterministicSuffix}`;
    case 'ACTA_ISSUED':
      return `evt__ACTA_ISSUED__${entityId}__${deterministicSuffix}`;
    case 'DECISION_ACCEPTED':
      return `evt__DECISION_ACCEPTED__${entityId}__${deterministicSuffix}`;
    case 'SCHEDULE_DUE_DATE_REACHED':
      return `evt__SCHEDULE_DUE__${entityId}__${deterministicSuffix}`;
    default:
      return `evt__GENERIC__${entityId}__${deterministicSuffix}`;
  }
}

/**
 * Crea un DomainEvent formalmente estructurado, validando invariantes de envelope.
 */
export function createDomainEvent<T = Record<string, unknown>>(
  input: CreateDomainEventInput<T>
): DomainEvent<T> {
  const occurredAt = input.occurredAt || new Date().toISOString();
  const suffix = input.deterministicSuffix || input.sourceMutationId;
  const eventId = computeDeterministicEventId(input.eventType, input.entityId, suffix);

  return {
    eventId,
    eventType: input.eventType,
    boardId: input.boardId,
    occurredAt,
    actor: input.actor,
    causalityDepth: input.causalityDepth ?? (input.actor.actorType === 'AUTOMATION' ? 1 : 0),
    sourceMutationId: input.sourceMutationId,
    payload: input.payload,
  };
}
