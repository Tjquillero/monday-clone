/**
 * Service: Workflow Automation Engine (Mantenix v1.2)
 * Baseline Entrada: 117 suites / 955 tests / TS 0 errores
 * 
 * Principios Arquitectónicos:
 * 1. Separación de autoridad: HECHO OBSERVADO -> DOMAIN EVENT -> TRIGGER -> RULES -> ACTION -> GATEWAY SOBERANO -> NUEVO HECHO.
 * 2. Idempotencia y Replay Seguro: gatewayIdempotencyKey determinista por evento y acción.
 * 3. Loop Guard Determinista: actorType === 'AUTOMATION' o causalityDepth >= 1 descarta ejecución (SKIPPED).
 * 4. Desacoplamiento Transaccional: Post-Commit Durable Event Delivery (fallos de automatización no abortan la mutación primaria).
 * 5. Consumo exclusivo de Gateways Soberanos: crewAssignmentService, maintenanceScheduleService, notificationDispatcherService.
 * 6. Aislamiento Total H8: 🔴 STRICTLY NO-GO (0 imports, 0 llamadas).
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  AutomationDefinition,
  AutomationExecutionRecord,
  DomainEvent,
  TrustedAutomationContext,
  WorkflowActionPayload,
} from '../types/workflowAutomation';
import { evaluateConditionGroup } from './automationRuleEvaluator';
import { evaluateCrewAssignment, assignCrewToPlanItemValidated } from './crewAssignmentService';
import { reschedulePlanItemValidated, ReschedulePlanItemInput, TrustedAuthContext } from './maintenanceScheduleService';

export interface WorkflowEngineEvaluationResult {
  definitionId: string;
  matched: boolean;
  skipped: boolean;
  skipReason?: string;
  executionRecord?: Partial<AutomationExecutionRecord>;
  gatewayResult?: Record<string, unknown>;
  error?: string;
}

/**
 * Calcula la clave de idempotencia del gateway para garantizar replay seguro (WF-C05).
 */
export function computeGatewayIdempotencyKey(
  definitionId: string,
  eventId: string,
  action: WorkflowActionPayload
): string {
  switch (action.actionType) {
    case 'ASSIGN_CREW':
      return `gw_assign__${action.planItemId}__${action.crewId || 'none'}__${eventId}__${definitionId}`;
    case 'RESCHEDULE_OCCURRENCE':
      return `gw_reschedule__${action.planItemId}__${action.targetDate}__${eventId}__${definitionId}`;
    case 'REQUEST_VERIFICATION_REVIEW':
      return `gw_notif_review__${action.planItemId}__${action.executionId}__${eventId}__${definitionId}`;
    default:
      return `gw_action__${eventId}__${definitionId}`;
  }
}

/**
 * Ejecuta una acción delegando exclusivamente al Gateway Soberano correspondiente.
 */
export async function executeSovereignGatewayAction(
  supabase: SupabaseClient,
  action: WorkflowActionPayload,
  trustedContext: TrustedAutomationContext,
  gatewayIdempotencyKey: string
): Promise<{ success: boolean; status: string; data?: Record<string, unknown>; error?: string }> {
  switch (action.actionType) {
    case 'ASSIGN_CREW': {
      const authUserId = trustedContext.userId || undefined;
      const evaluation = await evaluateCrewAssignment(supabase, {
        planItemId: action.planItemId,
        crewId: action.crewId,
        userId: authUserId,
      });

      if (!evaluation.allowed) {
        return {
          success: false,
          status: evaluation.reasonCode,
          error: evaluation.message,
        };
      }

      if (evaluation.action === 'NO_OP') {
        return {
          success: true,
          status: 'IDEMPOTENT_NO_OP',
          data: { message: evaluation.message, planItemId: action.planItemId },
        };
      }

      const result = await assignCrewToPlanItemValidated(supabase, {
        planItemId: action.planItemId,
        crewId: action.crewId,
        userId: authUserId,
      });

      return {
        success: result.success,
        status: result.evaluation.reasonCode,
        data: result.updatedItem ? (result.updatedItem as any) : undefined,
      };
    }

    case 'RESCHEDULE_OCCURRENCE': {
      const authContext: TrustedAuthContext = {
        userId: trustedContext.userId || 'system-automation',
        boardId: trustedContext.boardId,
        userRoles: [{ board_id: trustedContext.boardId, role: 'coordinator' }],
      };

      const input: ReschedulePlanItemInput = {
        planItemId: action.planItemId,
        targetDate: action.targetDate,
        reasonCode: action.reasonCode,
        notes: action.notes || '[AUTOMATION_RULE_TRIGGERED]',
      };

      const result = await reschedulePlanItemValidated(supabase, input, authContext);
      return {
        success: result.success,
        status: result.validation.reasonCode,
        data: result.updatedItem ? (result.updatedItem as any) : undefined,
        error: !result.success ? result.validation.message : undefined,
      };
    }

    case 'REQUEST_VERIFICATION_REVIEW': {
      // Deduplicación física en user_notifications mediante notification_dedup_key
      const notificationsToInsert = action.recipientRoles.map((role) => ({
        board_id: trustedContext.boardId,
        recipient_role: role,
        notification_type: 'VERIFICATION_REVIEW_REQUESTED',
        notification_dedup_key: `${gatewayIdempotencyKey}__${role}`,
        payload: {
          planItemId: action.planItemId,
          executionId: action.executionId,
          message: action.message,
        },
      }));

      const { data, error } = await supabase
        .from('user_notifications')
        .upsert(notificationsToInsert, { onConflict: 'notification_dedup_key', ignoreDuplicates: true })
        .select();

      if (error) {
        return {
          success: false,
          status: 'NOTIFICATION_INSERT_FAILED',
          error: error.message,
        };
      }

      return {
        success: true,
        status: 'NOTIFICATION_DISPATCHED_OR_DEDUPED',
        data: { count: (data || []).length },
      };
    }

    default:
      return {
        success: false,
        status: 'UNSUPPORTED_ACTION_TYPE',
        error: 'Unsupported action type',
      };
  }
}

/**
 * Evalúa y procesa un evento de dominio contra las definiciones de automatización activas.
 */
export async function processDomainEventAutomations(
  supabase: SupabaseClient,
  event: DomainEvent<Record<string, unknown>>,
  definitions: AutomationDefinition[],
  trustedContext: TrustedAutomationContext
): Promise<WorkflowEngineEvaluationResult[]> {
  const results: WorkflowEngineEvaluationResult[] = [];

  // Loop Guard (WF-C06): Descartar eventos originados por automatizaciones o con causalidad profunda
  if (event.actor.actorType === 'AUTOMATION' || event.causalityDepth >= 1) {
    return definitions.map((def) => ({
      definitionId: def.id,
      matched: false,
      skipped: true,
      skipReason: 'LOOP_GUARD_PREVENTED_EXECUTION',
    }));
  }

  for (const def of definitions) {
    // 1. Filtrar por estado activo y trigger coincidente
    if (def.status !== 'ACTIVE' || def.triggerType !== event.eventType || def.boardId !== event.boardId) {
      continue;
    }

    // 2. Evaluar condiciones deterministas
    const conditionPassed = evaluateConditionGroup(event, def.conditionGroup);
    if (!conditionPassed) {
      results.push({
        definitionId: def.id,
        matched: false,
        skipped: false,
      });
      continue;
    }

    // 3. Clave de idempotencia
    const idempotencyKey = computeGatewayIdempotencyKey(def.id, event.eventId, def.action);

    // 4. Ejecutar Gateway Soberano
    try {
      const gatewayRes = await executeSovereignGatewayAction(
        supabase,
        def.action,
        trustedContext,
        idempotencyKey
      );

      results.push({
        definitionId: def.id,
        matched: true,
        skipped: false,
        gatewayResult: { status: gatewayRes.status, ...(gatewayRes.data || {}) },
        error: gatewayRes.error,
        executionRecord: {
          automationDefinitionId: def.id,
          eventId: event.eventId,
          boardId: event.boardId,
          triggerType: event.eventType,
          executionStatus: gatewayRes.success ? 'SUCCESS' : 'FAILED',
          gatewayIdempotencyKey: idempotencyKey,
          causalityDepth: event.causalityDepth,
          errorMessage: gatewayRes.error || null,
        },
      });
    } catch (err: any) {
      results.push({
        definitionId: def.id,
        matched: true,
        skipped: false,
        error: err?.message || 'Unknown execution failure',
        executionRecord: {
          automationDefinitionId: def.id,
          eventId: event.eventId,
          boardId: event.boardId,
          triggerType: event.eventType,
          executionStatus: 'FAILED',
          gatewayIdempotencyKey: idempotencyKey,
          causalityDepth: event.causalityDepth,
          errorMessage: err?.message || 'Unknown error',
        },
      });
    }
  }

  return results;
}
