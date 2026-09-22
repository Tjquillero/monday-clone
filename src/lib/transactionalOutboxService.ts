/**
 * Service: Transactional Outbox & Recovery Service (WF-C08 v1.1)
 * Baseline Entrada: 120 suites / 980 tests / TS 0 errores
 * 
 * Principios Arquitectónicos:
 * 1. Transactional Outbox: Emisión atómica con hechos de dominio soberanos.
 * 2. Claim & Lease: Despacho no bloqueante con token individual y control CAS contra stale workers.
 * 3. Dead Letter Policy: Aislamiento automático tras 5 intentos y requeue explícito conservando event_id.
 * 4. Integración Soberana: Entrega de lotes al WorkflowAutomationEngine con persistencia de resultados.
 * 5. Aislamiento Total H8: 🔴 STRICTLY NO-GO (0 imports, 0 llamadas).
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  ClaimedOutboxEvent,
  ClaimOutboxBatchParams,
  CompleteOutboxEventParams,
  CreateOutboxEventInput,
  DomainEventOutboxRecord,
  OutboxAuditProjection,
} from '../types/transactionalOutbox';
import {
  AutomationDefinition,
  DomainEvent,
  TrustedAutomationContext,
} from '../types/workflowAutomation';
import { processDomainEventAutomations } from './workflowAutomationEngine';

/**
 * Registra atómicamente un evento de dominio en la Outbox (status = 'PENDING').
 */
export async function emitDomainEventToOutbox<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  input: CreateOutboxEventInput<T>
): Promise<{ success: boolean; outboxId?: string; error?: string }> {
  const { data, error } = await supabase
    .from('domain_event_outbox')
    .insert({
      event_id: input.eventId,
      event_type: input.eventType,
      board_id: input.boardId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      source_mutation_id: input.sourceMutationId,
      actor: input.actor || { actorType: 'SYSTEM' },
      causality_depth: input.causalityDepth ?? (input.actor?.actorType === 'AUTOMATION' ? 1 : 0),
      payload: input.payload,
      status: 'PENDING',
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, outboxId: data?.id };
}

/**
 * Reclama un lote de eventos pendientes o expirados mediante la RPC atómica claim_outbox_batch.
 */
export async function claimOutboxBatch(
  supabase: SupabaseClient,
  params: ClaimOutboxBatchParams
): Promise<ClaimedOutboxEvent[]> {
  const { data, error } = await supabase.rpc('claim_outbox_batch', {
    p_worker_id: params.workerId,
    p_batch_size: params.batchSize || 10,
    p_lease_seconds: params.leaseSeconds || 60,
  });

  if (error) {
    throw new Error(`[Outbox Claim Error] ${error.message}`);
  }

  if (!data) return [];

  return (data as any[]).map((row) => ({
    id: row.id,
    eventId: row.event_id,
    eventType: row.event_type,
    boardId: row.board_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    sourceMutationId: row.source_mutation_id,
    actor: row.actor,
    causalityDepth: row.causality_depth,
    payload: row.payload,
    claimToken: row.claim_token,
    attemptCount: row.attempt_count,
  }));
}

/**
 * Completa la transición de estado del evento en la Outbox aplicando CAS estricto.
 */
export async function completeOutboxEvent(
  supabase: SupabaseClient,
  params: CompleteOutboxEventParams
): Promise<boolean> {
  const { data, error } = await supabase.rpc('complete_outbox_event', {
    p_event_id: params.eventId,
    p_claim_token: params.claimToken,
    p_target_status: params.targetStatus,
    p_error_message: params.errorMessage || null,
  });

  if (error) {
    throw new Error(`[Outbox Complete Error] ${error.message}`);
  }

  return Boolean(data);
}

/**
 * Procesa un lote de eventos reclamados entregándolos al WorkflowAutomationEngine y cerrando el ciclo Outbox.
 */
export async function processOutboxBatch(
  supabase: SupabaseClient,
  claimedEvents: ClaimedOutboxEvent[],
  definitions: AutomationDefinition[],
  trustedContext: TrustedAutomationContext
): Promise<{ processedCount: number; failedCount: number }> {
  let processedCount = 0;
  let failedCount = 0;

  for (const claimed of claimedEvents) {
    const domainEvent: DomainEvent<Record<string, unknown>> = {
      eventId: claimed.eventId,
      eventType: claimed.eventType,
      boardId: claimed.boardId,
      occurredAt: new Date().toISOString(),
      actor: claimed.actor,
      causalityDepth: claimed.causalityDepth,
      sourceMutationId: claimed.sourceMutationId,
      payload: claimed.payload,
    };

    try {
      // Entregar al motor de automatización gobernado
      await processDomainEventAutomations(supabase, domainEvent, definitions, trustedContext);

      // Cerrar la Outbox en PROCESSED con CAS
      const completed = await completeOutboxEvent(supabase, {
        eventId: claimed.id,
        claimToken: claimed.claimToken,
        targetStatus: 'PROCESSED',
      });

      if (completed) {
        processedCount++;
      } else {
        // CAS falló porque el lease expiró y otro worker tomó el evento
        failedCount++;
      }
    } catch (err: any) {
      const isDeadLetter = claimed.attemptCount >= 5;
      await completeOutboxEvent(supabase, {
        eventId: claimed.id,
        claimToken: claimed.claimToken,
        targetStatus: isDeadLetter ? 'DEAD_LETTER' : 'PENDING',
        errorMessage: err?.message || 'Processing failed',
      });
      failedCount++;
    }
  }

  return { processedCount, failedCount };
}

/**
 * Consulta la auditoría funcional de eventos outbox para un tablero específico.
 */
export async function getBoardOutboxAuditLog(
  supabase: SupabaseClient,
  boardId: string,
  limit: number = 50
): Promise<OutboxAuditProjection[]> {
  const { data, error } = await supabase.rpc('get_board_outbox_audit_log', {
    p_board_id: boardId,
    p_limit: limit,
  });

  if (error) {
    throw new Error(`[Outbox Audit Error] ${error.message}`);
  }

  if (!data) return [];

  return (data as any[]).map((row) => ({
    eventId: row.event_id,
    eventType: row.event_type,
    boardId: row.board_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    status: row.status,
    attemptCount: row.attempt_count,
    lastErrorMessage: row.last_error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
