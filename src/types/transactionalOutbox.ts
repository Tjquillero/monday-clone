/**
 * Types & Contracts: Transactional Outbox & Durable Recovery (WF-C08 v1.1)
 * Baseline Entrada: 120 suites / 980 tests / TS 0 errores
 * 
 * Principios Arquitectónicos:
 * 1. Transactional Outbox: El evento de dominio se persiste atómicamente con el hecho soberano (status = 'PENDING').
 * 2. Inmutabilidad Organizativa: board_id con ON DELETE RESTRICT (WF-C08-INV-04).
 * 3. Token Individual & CAS: Cada evento reclamado recibe un claim_token (UUID) único, validado con Compare-And-Swap.
 * 4. Stale Worker Protection: complete_outbox_event exige status === 'CLAIMED' y lease_expires_at > now().
 * 5. Idempotencia en Replay: gateway_idempotency_key calculada con targetEntityId real invariable en retries.
 * 6. Dead Letter Policy: Transición a DEAD_LETTER tras 5 intentos fallidos; requeue administrativo resetea attempt_count a 0 para el nuevo ciclo.
 * 7. Purga Controlada: Solo eventos PROCESSED con antigüedad > 14 días calculada desde updated_at.
 * 8. Aislamiento Total H8: 🔴 STRICTLY NO-GO (0 imports, 0 llamadas).
 */

import { DomainEventActor, WorkflowTriggerType } from './workflowAutomation';

export type OutboxEventStatus =
  | 'PENDING'
  | 'CLAIMED'
  | 'PROCESSED'
  | 'DEAD_LETTER';

export interface DomainEventOutboxRecord<T = Record<string, unknown>> {
  id: string; // UUID físico
  eventId: string; // evt__{type}__{entityId}__{suffix}
  eventType: WorkflowTriggerType;
  boardId: string;
  entityType: string;
  entityId: string;
  sourceMutationId: string;
  actor: DomainEventActor;
  causalityDepth: number;
  payload: T;
  status: OutboxEventStatus;
  claimToken: string | null; // UUID de claim
  claimedBy: string | null; // Worker ID
  claimedAt: string | null; // ISO Timestamp
  leaseExpiresAt: string | null; // ISO Timestamp
  attemptCount: number;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClaimOutboxBatchParams {
  workerId: string;
  batchSize?: number;
  leaseSeconds?: number;
}

export interface ClaimedOutboxEvent<T = Record<string, unknown>> {
  id: string;
  eventId: string;
  eventType: WorkflowTriggerType;
  boardId: string;
  entityType: string;
  entityId: string;
  sourceMutationId: string;
  actor: DomainEventActor;
  causalityDepth: number;
  payload: T;
  claimToken: string; // UUID individual asignado
  attemptCount: number;
}

export interface CompleteOutboxEventParams {
  eventId: string; // UUID de la fila outbox
  claimToken: string; // UUID del token individual de claim
  targetStatus: 'PROCESSED' | 'PENDING' | 'DEAD_LETTER';
  errorMessage?: string | null;
}

export interface OutboxAuditProjection {
  eventId: string;
  eventType: WorkflowTriggerType;
  boardId: string;
  entityType: string;
  entityId: string;
  status: OutboxEventStatus;
  attemptCount: number;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOutboxEventInput<T = Record<string, unknown>> {
  eventId: string;
  eventType: WorkflowTriggerType;
  boardId: string;
  entityType: string;
  entityId: string;
  sourceMutationId: string;
  actor?: DomainEventActor;
  causalityDepth?: number;
  payload: T;
}
