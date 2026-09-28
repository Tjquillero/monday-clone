/**
 * Mantenix - Hito 7.7 Governed Application & Weekly Plan Item Gateway Engine v1.0
 * Motor de Aplicación Gobernada y Modificación Estricta Exclusiva de weekly_plan_items
 *
 * Principios Invariantes:
 * - 0 DDL, 0 migraciones SQL, 0 tablas nuevas, 0 RPCs de escritura nuevas.
 * - H6.2 -> H7.6 READ ONLY: Capas previas son consumidas soberanamente sin modificaciones.
 * - WRITE SOLO EN weekly_plan_items: Estricto aislamiento de base de datos viva.
 * - Compuerta Triple Concurrente: (ALLOW_SANDBOX) AND (RECOVERY_SUCCESS) AND (isHumanAuthorized === true).
 *   La autorización humana es una compuerta adicional de negocio, NUNCA un bypass técnico de la validación objetiva.
 * - Gate de Protección Física: Ítems completados, en progreso o con ejecuciones registradas son estrictamente inmutables.
 * - Idempotencia por applicationMutationId.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { WeeklyPlanItem } from '../types/weeklyPlan';
import {
  ApplicationAuditDiff,
  GovernedApplicationInput,
  GovernedApplicationRecord,
} from '../types/governedApplication';

/**
 * Valida los permisos de rol del actor para aplicar una intervención sobre weekly_plan_items
 */
export function validateApplicationRole(role: string): void {
  const normalizedRole = (role || '').toLowerCase();
  if (
    normalizedRole !== 'supervisor' &&
    normalizedRole !== 'coordinator' &&
    normalizedRole !== 'admin'
  ) {
    throw new Error(
      `UNAUTHORIZED_ROLE: El rol '${role}' no está autorizado para aplicar modificaciones sobre el plan de trabajo. Requiere 'supervisor', 'coordinator' o 'admin'.`
    );
  }
}

/**
 * Store en memoria para deduplicación idempotente de aplicaciones
 */
export class InMemoryGovernedApplicationStore {
  private applicationsByMutationId = new Map<string, GovernedApplicationRecord>();
  private itemsById = new Map<string, WeeklyPlanItem>();

  public getApplication(mutationId: string): GovernedApplicationRecord | undefined {
    return this.applicationsByMutationId.get(mutationId);
  }

  public saveApplication(record: GovernedApplicationRecord): void {
    this.applicationsByMutationId.set(record.applicationMutationId, record);
  }

  public saveItem(item: WeeklyPlanItem): void {
    this.itemsById.set(item.id, { ...item });
  }

  public getItem(id: string): WeeklyPlanItem | undefined {
    const item = this.itemsById.get(id);
    return item ? { ...item } : undefined;
  }
}

/**
 * Helper para resolver el plan_id canónico de un item
 */
function resolvePlanId(item: WeeklyPlanItem): string {
  return item.weekly_plan_id || (item as any).plan_id || 'none';
}

/**
 * Motor Principal de Aplicación Gobernada H7.7
 */
export async function applyGovernedRepairToPlanItem(
  input: GovernedApplicationInput,
  options?: {
    supabase?: SupabaseClient;
    store?: InMemoryGovernedApplicationStore;
  }
): Promise<{
  applicationRecord: GovernedApplicationRecord;
  updatedItem: WeeklyPlanItem | null;
  isIdempotentReplay: boolean;
}> {
  const nowUtc = new Date().toISOString();
  const {
    applicationMutationId,
    proposal,
    recoveryValidation,
    targetItem,
    actorUserId,
    actorRole,
    isHumanAuthorized = false,
    policyDecision = 'ALLOW_SANDBOX',
    simulatedPersistenceFail = false,
  } = input;

  const store = options?.store;
  const supabase = options?.supabase;

  // 1. Verificación de Idempotencia por applicationMutationId
  if (store) {
    const existing = store.getApplication(applicationMutationId);
    if (existing) {
      const storedItem = store.getItem(targetItem.id) || targetItem;
      return {
        applicationRecord: {
          ...existing,
          status: 'IDEMPOTENT_REPLAY',
        },
        updatedItem: storedItem,
        isIdempotentReplay: true,
      };
    }
  }

  // 2. Fail-Closed ante datos nulos o inválidos
  if (!proposal || !targetItem || !applicationMutationId) {
    const indetRecord: GovernedApplicationRecord = {
      applicationId: `app_indet_${Math.random().toString(36).slice(2, 9)}`,
      applicationMutationId: applicationMutationId || 'none',
      proposalId: proposal?.proposalId || 'none',
      recoveryId: recoveryValidation?.recoveryId || 'none',
      planId: targetItem ? resolvePlanId(targetItem) : 'none',
      targetItemId: targetItem?.id || 'none',
      targetTable: 'weekly_plan_items',
      actionType: proposal?.actionType || 'PROPOSE_CREW_REASSIGNMENT',
      status: 'INDETERMINATE',
      policyDecisionUsed: policyDecision,
      isHumanAuthorized,
      actorUserId,
      actorRole,
      appliedDiffs: [],
      beforeSnapshot: targetItem ? { ...targetItem } : null,
      afterSnapshot: null,
      appliedAt: nowUtc,
      timezone: 'America/Bogota',
      evaluatorVersion: 'v1.0',
      requiresHumanReview: true,
    };
    return {
      applicationRecord: indetRecord,
      updatedItem: null,
      isIdempotentReplay: false,
    };
  }

  const targetPlanId = resolvePlanId(targetItem);

  // 3. Verificación de Autorización de Rol
  try {
    validateApplicationRole(actorRole);
  } catch {
    const deniedRecord: GovernedApplicationRecord = {
      applicationId: `app_denied_${proposal.proposalId.slice(0, 8)}`,
      applicationMutationId,
      proposalId: proposal.proposalId,
      recoveryId: recoveryValidation?.recoveryId || 'none',
      planId: targetPlanId,
      targetItemId: targetItem.id,
      targetTable: 'weekly_plan_items',
      actionType: proposal.actionType || 'PROPOSE_CREW_REASSIGNMENT',
      status: 'APPLICATION_DENIED',
      policyDecisionUsed: policyDecision,
      isHumanAuthorized,
      actorUserId,
      actorRole,
      appliedDiffs: [],
      beforeSnapshot: { ...targetItem },
      afterSnapshot: null,
      appliedAt: nowUtc,
      timezone: 'America/Bogota',
      evaluatorVersion: 'v1.0',
      requiresHumanReview: true,
    };
    return {
      applicationRecord: deniedRecord,
      updatedItem: null,
      isIdempotentReplay: false,
    };
  }

  // 4. Gate de Protección Física: Ítems completados, en progreso o con ejecuciones registradas son inmutables
  const isCompleted = targetItem.status === 'completed';
  const isInProgress = targetItem.status === 'in_progress';
  const hasExecutions = Number((targetItem as any).executed_qty || 0) > 0 || Number((targetItem as any).executed_jr || 0) > 0;

  if (isCompleted || isInProgress || hasExecutions) {
    const protectedRecord: GovernedApplicationRecord = {
      applicationId: `app_prot_${proposal.proposalId.slice(0, 8)}`,
      applicationMutationId,
      proposalId: proposal.proposalId,
      recoveryId: recoveryValidation?.recoveryId || 'none',
      planId: targetPlanId,
      targetItemId: targetItem.id,
      targetTable: 'weekly_plan_items',
      actionType: proposal.actionType || 'PROPOSE_CREW_REASSIGNMENT',
      status: 'TARGET_PROTECTED',
      policyDecisionUsed: policyDecision,
      isHumanAuthorized,
      actorUserId,
      actorRole,
      appliedDiffs: [],
      beforeSnapshot: { ...targetItem },
      afterSnapshot: null,
      appliedAt: nowUtc,
      timezone: 'America/Bogota',
      evaluatorVersion: 'v1.0',
      requiresHumanReview: true,
    };
    if (store) store.saveApplication(protectedRecord);
    return {
      applicationRecord: protectedRecord,
      updatedItem: null,
      isIdempotentReplay: false,
    };
  }

  // 5. Compuerta Triple Concurrente Obligatoria:
  // Requiere simultáneamente:
  // A) policyDecision === 'ALLOW_SANDBOX' (H7.1A)
  // B) recoveryValidation.status === 'RECOVERY_SUCCESS' (H7.6)
  // C) isHumanAuthorized === true (autorización humana explícita por rol de gobernanza)
  // Ninguna compuerta sustituye o hace bypass de las otras dos.
  const isRecoveryValid = recoveryValidation !== null && recoveryValidation !== undefined && recoveryValidation.status === 'RECOVERY_SUCCESS';
  const isPolicyAllowed = policyDecision === 'ALLOW_SANDBOX';
  const hasValidHumanAuth = Boolean(isHumanAuthorized) && Boolean(actorUserId && actorUserId.trim().length > 0);

  if (!isPolicyAllowed || !isRecoveryValid || !hasValidHumanAuth) {
    const deniedRecord: GovernedApplicationRecord = {
      applicationId: `app_denied_${proposal.proposalId.slice(0, 8)}`,
      applicationMutationId,
      proposalId: proposal.proposalId,
      recoveryId: recoveryValidation?.recoveryId || 'none',
      planId: targetPlanId,
      targetItemId: targetItem.id,
      targetTable: 'weekly_plan_items',
      actionType: proposal.actionType || 'PROPOSE_CREW_REASSIGNMENT',
      status: 'APPLICATION_DENIED',
      policyDecisionUsed: policyDecision,
      isHumanAuthorized,
      actorUserId,
      actorRole,
      appliedDiffs: [],
      beforeSnapshot: { ...targetItem },
      afterSnapshot: null,
      appliedAt: nowUtc,
      timezone: 'America/Bogota',
      evaluatorVersion: 'v1.0',
      requiresHumanReview: true,
    };
    if (store) store.saveApplication(deniedRecord);
    return {
      applicationRecord: deniedRecord,
      updatedItem: null,
      isIdempotentReplay: false,
    };
  }

  // 6. Evaluación de Tipo de Acción y Mutación Restringida sobre weekly_plan_items
  const beforeSnapshot: Partial<WeeklyPlanItem> = {
    id: targetItem.id,
    weekly_plan_id: targetItem.weekly_plan_id,
    activity_key: targetItem.activity_key,
    crew_id: targetItem.crew_id,
    planned_date: targetItem.planned_date,
    planned_qty: targetItem.planned_qty,
    theoretical_jr: targetItem.theoretical_jr,
    is_manual_override: targetItem.is_manual_override,
    override_reason: targetItem.override_reason,
    status: targetItem.status,
  };

  const workingCopy: WeeklyPlanItem = { ...targetItem };
  const appliedDiffs: ApplicationAuditDiff[] = [];
  const payload = proposal.payload || {};

  switch (proposal.actionType) {
    case 'PROPOSE_CREW_REASSIGNMENT': {
      const newCrewId = (payload.targetCrewId as string) || (payload.proposedTargetCrewId as string);
      if (!newCrewId) {
        const indetRecord: GovernedApplicationRecord = {
          applicationId: `app_indet_${proposal.proposalId.slice(0, 8)}`,
          applicationMutationId,
          proposalId: proposal.proposalId,
          recoveryId: recoveryValidation?.recoveryId || 'none',
          planId: targetPlanId,
          targetItemId: targetItem.id,
          targetTable: 'weekly_plan_items',
          actionType: proposal.actionType,
          status: 'INDETERMINATE',
          policyDecisionUsed: policyDecision,
          isHumanAuthorized,
          actorUserId,
          actorRole,
          appliedDiffs: [],
          beforeSnapshot,
          afterSnapshot: null,
          appliedAt: nowUtc,
          timezone: 'America/Bogota',
          evaluatorVersion: 'v1.0',
          requiresHumanReview: true,
        };
        return { applicationRecord: indetRecord, updatedItem: null, isIdempotentReplay: false };
      }

      appliedDiffs.push({
        fieldName: 'crew_id',
        previousValue: workingCopy.crew_id ?? null,
        newValue: newCrewId,
      });
      workingCopy.crew_id = newCrewId;
      workingCopy.updated_at = nowUtc;
      break;
    }

    case 'PROPOSE_SCHEDULE_OVERRIDE': {
      const newDate = (payload.newPlannedDate as string) || (payload.proposedPlannedDate as string);
      const reason = (payload.overrideReason as string) || (payload.reason as string) || 'GOVERNED_REPAIR_OVERRIDE';

      if (!newDate) {
        const indetRecord: GovernedApplicationRecord = {
          applicationId: `app_indet_${proposal.proposalId.slice(0, 8)}`,
          applicationMutationId,
          proposalId: proposal.proposalId,
          recoveryId: recoveryValidation?.recoveryId || 'none',
          planId: targetPlanId,
          targetItemId: targetItem.id,
          targetTable: 'weekly_plan_items',
          actionType: proposal.actionType,
          status: 'INDETERMINATE',
          policyDecisionUsed: policyDecision,
          isHumanAuthorized,
          actorUserId,
          actorRole,
          appliedDiffs: [],
          beforeSnapshot,
          afterSnapshot: null,
          appliedAt: nowUtc,
          timezone: 'America/Bogota',
          evaluatorVersion: 'v1.0',
          requiresHumanReview: true,
        };
        return { applicationRecord: indetRecord, updatedItem: null, isIdempotentReplay: false };
      }

      appliedDiffs.push({
        fieldName: 'planned_date',
        previousValue: workingCopy.planned_date ?? null,
        newValue: newDate,
      });
      appliedDiffs.push({
        fieldName: 'is_manual_override',
        previousValue: workingCopy.is_manual_override ?? false,
        newValue: true,
      });
      appliedDiffs.push({
        fieldName: 'override_reason',
        previousValue: workingCopy.override_reason ?? null,
        newValue: reason,
      });

      workingCopy.planned_date = newDate;
      workingCopy.is_manual_override = true;
      workingCopy.override_reason = reason;
      workingCopy.updated_at = nowUtc;
      break;
    }

    case 'PROPOSE_RESOURCE_REBALANCE': {
      const adjustedQty = typeof payload.adjustedPlannedQty === 'number' ? payload.adjustedPlannedQty : workingCopy.planned_qty;
      const adjustedJr = typeof payload.adjustedPlannedJr === 'number' ? payload.adjustedPlannedJr : (typeof payload.adjustedTheoreticalJr === 'number' ? payload.adjustedTheoreticalJr : workingCopy.theoretical_jr);

      if (adjustedQty !== workingCopy.planned_qty) {
        appliedDiffs.push({
          fieldName: 'planned_qty',
          previousValue: workingCopy.planned_qty,
          newValue: adjustedQty,
        });
        workingCopy.planned_qty = adjustedQty;
      }
      if (adjustedJr !== undefined && adjustedJr !== workingCopy.theoretical_jr) {
        appliedDiffs.push({
          fieldName: 'theoretical_jr',
          previousValue: workingCopy.theoretical_jr ?? null,
          newValue: adjustedJr,
        });
        workingCopy.theoretical_jr = adjustedJr;
      }
      workingCopy.updated_at = nowUtc;
      break;
    }

    default: {
      // Propuestas consultivas o fuera de scope físico directo (PROPOSE_CONTRACT_TARGET_REVIEW, etc.)
      const deniedRecord: GovernedApplicationRecord = {
        applicationId: `app_denied_${proposal.proposalId.slice(0, 8)}`,
        applicationMutationId,
        proposalId: proposal.proposalId,
        recoveryId: recoveryValidation?.recoveryId || 'none',
        planId: targetPlanId,
        targetItemId: targetItem.id,
        targetTable: 'weekly_plan_items',
        actionType: proposal.actionType || 'PROPOSE_SUPERVISOR_ALERT',
        status: 'APPLICATION_DENIED',
        policyDecisionUsed: policyDecision,
        isHumanAuthorized,
        actorUserId,
        actorRole,
        appliedDiffs: [],
        beforeSnapshot,
        afterSnapshot: null,
        appliedAt: nowUtc,
        timezone: 'America/Bogota',
        evaluatorVersion: 'v1.0',
        requiresHumanReview: true,
      };
      if (store) store.saveApplication(deniedRecord);
      return {
        applicationRecord: deniedRecord,
        updatedItem: null,
        isIdempotentReplay: false,
      };
    }
  }

  // 7. Simulación de Falla de Persistencia o Rollback
  if (simulatedPersistenceFail) {
    const rolledBackRecord: GovernedApplicationRecord = {
      applicationId: `app_roll_${proposal.proposalId.slice(0, 8)}`,
      applicationMutationId,
      proposalId: proposal.proposalId,
      recoveryId: recoveryValidation?.recoveryId || 'none',
      planId: targetPlanId,
      targetItemId: targetItem.id,
      targetTable: 'weekly_plan_items',
      actionType: proposal.actionType!,
      status: 'APPLICATION_ROLLED_BACK',
      policyDecisionUsed: policyDecision,
      isHumanAuthorized,
      actorUserId,
      actorRole,
      appliedDiffs: [],
      beforeSnapshot,
      afterSnapshot: null,
      appliedAt: nowUtc,
      timezone: 'America/Bogota',
      evaluatorVersion: 'v1.0',
      requiresHumanReview: true,
    };
    if (store) store.saveApplication(rolledBackRecord);
    return {
      applicationRecord: rolledBackRecord,
      updatedItem: null,
      isIdempotentReplay: false,
    };
  }

  // 8. Persistencia sobre weekly_plan_items
  const afterSnapshot: Partial<WeeklyPlanItem> = {
    id: workingCopy.id,
    weekly_plan_id: workingCopy.weekly_plan_id,
    activity_key: workingCopy.activity_key,
    crew_id: workingCopy.crew_id,
    planned_date: workingCopy.planned_date,
    planned_qty: workingCopy.planned_qty,
    theoretical_jr: workingCopy.theoretical_jr,
    is_manual_override: workingCopy.is_manual_override,
    override_reason: workingCopy.override_reason,
    status: workingCopy.status,
  };

  if (supabase) {
    const updatePayload: Record<string, unknown> = {
      updated_at: nowUtc,
    };
    if (workingCopy.crew_id !== undefined) updatePayload.crew_id = workingCopy.crew_id;
    if (workingCopy.planned_date !== undefined) updatePayload.planned_date = workingCopy.planned_date;
    if (workingCopy.is_manual_override !== undefined) updatePayload.is_manual_override = workingCopy.is_manual_override;
    if (workingCopy.override_reason !== undefined) updatePayload.override_reason = workingCopy.override_reason;
    if (workingCopy.planned_qty !== undefined) updatePayload.planned_qty = workingCopy.planned_qty;
    if (workingCopy.theoretical_jr !== undefined) updatePayload.theoretical_jr = workingCopy.theoretical_jr;

    const { error: updateErr } = await supabase
      .from('weekly_plan_items')
      .update(updatePayload)
      .eq('id', workingCopy.id);

    if (updateErr) {
      throw new Error(`[GovernedApplication Error]: Failed to update weekly_plan_items: ${updateErr.message}`);
    }
  }

  const successRecord: GovernedApplicationRecord = {
    applicationId: `app_${proposal.proposalId.slice(0, 8)}`,
    applicationMutationId,
    proposalId: proposal.proposalId,
    recoveryId: recoveryValidation?.recoveryId || 'none',
    planId: targetPlanId,
    targetItemId: targetItem.id,
    targetTable: 'weekly_plan_items',
    actionType: proposal.actionType!,
    status: 'APPLICATION_SUCCESS',
    policyDecisionUsed: policyDecision,
    isHumanAuthorized,
    actorUserId,
    actorRole,
    appliedDiffs,
    beforeSnapshot,
    afterSnapshot,
    appliedAt: nowUtc,
    timezone: 'America/Bogota',
    evaluatorVersion: 'v1.0',
    requiresHumanReview: true,
  };

  if (store) {
    store.saveApplication(successRecord);
    store.saveItem(workingCopy);
  }

  return {
    applicationRecord: successRecord,
    updatedItem: workingCopy,
    isIdempotentReplay: false,
  };
}
