/**
 * Service: Decision Governance Service (v1)
 *
 * Axioma Rector:
 * RECOMENDACIÓN != DECISIÓN != ACCIÓN != RESULTADO != EVALUACIÓN
 *
 * Responsabilidades:
 * 1. Validar reglas contractuales de decisión humana (justificación, roles, estados terminales).
 * 2. Persistir el hecho histórico inmutable e idempotente en `operational_advisory_decisions` vía RPC atómica.
 * 3. Si `isIdempotentReplay = true`, retornar el registro existente sin invocar gateways nuevamente.
 * 4. Si `decisionStatus = 'ACCEPTED'`, delegar la ejecución a los gateways de dominio autorizados:
 *    - R-01 -> poaService / catálogo operativo
 *    - R-02 -> crewAssignmentService (F5.2)
 *    - R-03 -> weeklyPlanService / poaService (CERO mutaciones en RCO)
 *    - R-04 -> weeklyPlanService (OCC)
 * 5. Actualizar `action_status` y `execution_snapshot` confirmado.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  DecisionRecord,
  DecisionMutationResult,
  RecordDecisionInput,
  ExecutionResultSnapshot,
  DecisionStatus,
} from '../types/decisionGovernance';
import { RecommendationKey } from '../types/operationalAdvisory';
import { assignCrewToPlanItemValidated } from './crewAssignmentService';

export interface DecisionGatewayOverrides {
  poaStandardUpdater?: (activityKey: string, newRate: number) => Promise<{ updatedRate: number }>;
  crewAssignmentDispatcher?: typeof assignCrewToPlanItemValidated;
  resourceQuotaUpdater?: (resourceKey: string, activityKey: string, newQuota: number) => Promise<{ confirmedQuota: number }>;
  multidaySplitter?: (occurrenceKey: string, splitDates: string[]) => Promise<{ splitDates: string[]; plannedDays: number }>;
}

/**
 * Valida la justificación según el estado de la decisión.
 */
export function validateDecisionReason(status: DecisionStatus, reason?: string | null, postponedUntilIso?: string | null): void {
  const cleanReason = (reason || '').trim();

  if (status === 'REJECTED') {
    if (cleanReason.length < 10) {
      throw new Error('VALIDATION_ERROR: El rechazo de una recomendación requiere una justificación válida de al menos 10 caracteres no vacíos.');
    }
  } else if (status === 'POSTPONED') {
    const hasValidDate = postponedUntilIso && !isNaN(Date.parse(postponedUntilIso));
    const hasValidReason = cleanReason.length >= 10;
    if (!hasValidDate && !hasValidReason) {
      throw new Error('VALIDATION_ERROR: El aplazamiento requiere una fecha futura válida en postponedUntilIso O una justificación de al menos 10 caracteres.');
    }
  }
}

/**
 * Valida que el rol del actor esté autorizado para la familia de recomendación.
 */
export function validateRoleAuthorization(recKey: RecommendationKey, role: string): void {
  const normalizedRole = role.toLowerCase();
  if (recKey === 'R-01_AJUSTE_RENDIMIENTO') {
    if (normalizedRole !== 'coordinator' && normalizedRole !== 'admin') {
      throw new Error(`FORBIDDEN_ROLE: El rol '${role}' no está autorizado para decidir sobre la calibración de estándares POA (R-01). Requiere 'coordinator' o 'admin'.`);
    }
  } else {
    if (normalizedRole !== 'supervisor' && normalizedRole !== 'coordinator' && normalizedRole !== 'admin') {
      throw new Error(`FORBIDDEN_ROLE: El rol '${role}' no está autorizado para tomar decisiones operativas. Requiere 'supervisor', 'coordinator' o 'admin'.`);
    }
  }
}

/**
 * In-memory store para ejecución de pruebas y validaciones deterministas sin base de datos activa.
 */
export class InMemoryDecisionStore {
  private decisionsByMutationId = new Map<string, DecisionRecord>();
  private decisionsByRecId = new Map<string, DecisionRecord[]>();

  public async recordDecision(input: RecordDecisionInput): Promise<{ decisionRecord: DecisionRecord; isIdempotentReplay: boolean }> {
    // 1. Idempotencia física
    const existing = this.decisionsByMutationId.get(input.decisionMutationId);
    if (existing) {
      return { decisionRecord: existing, isIdempotentReplay: true };
    }

    // 2. Transición y secuencia
    const recHistory = this.decisionsByRecId.get(input.recommendation.recommendationId) || [];
    const lastDecision = recHistory[recHistory.length - 1];

    if (lastDecision) {
      if (lastDecision.decisionStatus === 'ACCEPTED') {
        throw new Error(`CANNOT_MUTATE_ACCEPTED_RECOMMENDATION: La recomendación ya fue ACEPTADA en seq ${lastDecision.decisionSequenceNumber}`);
      }
      if (lastDecision.decisionStatus === 'REJECTED') {
        throw new Error(`CANNOT_MUTATE_REJECTED_RECOMMENDATION: La recomendación fue RECHAZADA terminalmente en seq ${lastDecision.decisionSequenceNumber}`);
      }
    }

    const nextSeq = (lastDecision?.decisionSequenceNumber || 0) + 1;
    const nowIso = new Date().toISOString();

    const record: DecisionRecord = {
      id: `dec_${Math.random().toString(36).substring(2, 9)}`,
      decisionMutationId: input.decisionMutationId,
      recommendationId: input.recommendation.recommendationId,
      recommendationKey: input.recommendation.recommendationKey,
      decisionSequenceNumber: nextSeq,
      boardId: input.boardId,
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      decisionStatus: input.decisionStatus,
      decisionReason: input.decisionReason ? input.decisionReason.trim() : null,
      postponedUntilIso: input.postponedUntilIso || null,
      decisionTimestamp: nowIso,
      recommendationSnapshot: input.recommendation,
      actionStatus: input.decisionStatus === 'ACCEPTED' ? 'PENDING_EXECUTION' : 'NOT_APPLICABLE',
      executionSnapshot: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.decisionsByMutationId.set(input.decisionMutationId, record);
    recHistory.push(record);
    this.decisionsByRecId.set(input.recommendation.recommendationId, recHistory);

    return { decisionRecord: record, isIdempotentReplay: false };
  }

  public async updateActionExecution(
    decisionMutationId: string,
    actionStatus: DecisionRecord['actionStatus'],
    executionSnapshot: ExecutionResultSnapshot | null
  ): Promise<DecisionRecord> {
    const record = this.decisionsByMutationId.get(decisionMutationId);
    if (!record) {
      throw new Error(`DecisionRecord with mutationId ${decisionMutationId} not found`);
    }
    record.actionStatus = actionStatus;
    record.executionSnapshot = executionSnapshot;
    record.updatedAt = new Date().toISOString();
    return record;
  }

  public getDecisionByMutationId(mutationId: string): DecisionRecord | undefined {
    return this.decisionsByMutationId.get(mutationId);
  }

  public getDecisionsForRecommendation(recId: string): DecisionRecord[] {
    return this.decisionsByRecId.get(recId) || [];
  }
}

/**
 * Servicio Orquestador de Gobierno de Decisiones
 */
export class DecisionGovernanceService {
  private supabase?: SupabaseClient;
  private inMemoryStore?: InMemoryDecisionStore;
  private overrides?: DecisionGatewayOverrides;

  constructor(options?: {
    supabase?: SupabaseClient;
    inMemoryStore?: InMemoryDecisionStore;
    overrides?: DecisionGatewayOverrides;
  }) {
    this.supabase = options?.supabase;
    this.inMemoryStore = options?.inMemoryStore;
    this.overrides = options?.overrides;
  }

  /**
   * Registra y ejecuta la decisión humana sobre una recomendación.
   */
  public async recordAndExecuteDecision(input: RecordDecisionInput): Promise<DecisionMutationResult> {
    // 1. Validaciones contractuales previas
    validateDecisionReason(input.decisionStatus, input.decisionReason, input.postponedUntilIso);
    validateRoleAuthorization(input.recommendation.recommendationKey, input.actorRole);

    let decisionRecord: DecisionRecord;
    let isIdempotentReplay: boolean;

    // 2. Persistencia atómica
    if (this.supabase) {
      const { data, error } = await this.supabase.rpc('record_advisory_decision', {
        p_decision_mutation_id: input.decisionMutationId,
        p_recommendation_id: input.recommendation.recommendationId,
        p_recommendation_key: input.recommendation.recommendationKey,
        p_board_id: input.boardId,
        p_actor_user_id: input.actorUserId,
        p_actor_role: input.actorRole,
        p_decision_status: input.decisionStatus,
        p_decision_reason: input.decisionReason ? input.decisionReason.trim() : null,
        p_postponed_until_iso: input.postponedUntilIso || null,
        p_recommendation_snapshot: input.recommendation,
      });

      if (error) {
        throw new Error(`[DecisionGovernance RPC Error]: ${error.message}`);
      }

      const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
      decisionRecord = parsedData.decisionRecord as DecisionRecord;
      isIdempotentReplay = Boolean(parsedData.isIdempotentReplay);
    } else if (this.inMemoryStore) {
      const result = await this.inMemoryStore.recordDecision(input);
      decisionRecord = result.decisionRecord;
      isIdempotentReplay = result.isIdempotentReplay;
    } else {
      throw new Error('NO_STORAGE_CONFIGURED: DecisionGovernanceService requiere un SupabaseClient o un InMemoryDecisionStore.');
    }

    // 3. Si es un Replay idempotente, retornar de inmediato sin volver a ejecutar en el Gateway
    if (isIdempotentReplay) {
      return {
        decisionRecord,
        isIdempotentReplay: true,
        gatewayExecutionStatus: decisionRecord.actionStatus,
      };
    }

    // 4. Si el estado no es ACCEPTED, la acción no aplica para ejecución
    if (input.decisionStatus !== 'ACCEPTED') {
      return {
        decisionRecord,
        isIdempotentReplay: false,
        gatewayExecutionStatus: 'NOT_APPLICABLE',
      };
    }

    // 5. Delegación a Gateways de Dominio Soberanos
    let executionSnapshot: ExecutionResultSnapshot | null = null;
    let gatewayExecutionStatus: DecisionRecord['actionStatus'] = 'EXECUTED';
    let gatewayErrorMessage: string | null = null;

    try {
      executionSnapshot = await this.dispatchToDomainGateway(input);
    } catch (err: any) {
      gatewayExecutionStatus = 'EXECUTION_FAILED';
      gatewayErrorMessage = err?.message || 'Error desconocido en domain gateway';
    }

    // 6. Actualizar estado de ejecución en la persistencia
    if (this.supabase) {
      await this.supabase
        .from('operational_advisory_decisions')
        .update({
          action_status: gatewayExecutionStatus,
          execution_snapshot: executionSnapshot,
          updated_at: new Date().toISOString(),
        })
        .eq('decision_mutation_id', input.decisionMutationId);
      decisionRecord.actionStatus = gatewayExecutionStatus;
      decisionRecord.executionSnapshot = executionSnapshot;
    } else if (this.inMemoryStore) {
      decisionRecord = await this.inMemoryStore.updateActionExecution(
        input.decisionMutationId,
        gatewayExecutionStatus,
        executionSnapshot
      );
    }

    return {
      decisionRecord,
      isIdempotentReplay: false,
      gatewayExecutionStatus,
      gatewayErrorMessage,
    };
  }

  /**
   * Despacha la mutación al gateway soberano correspondiente.
   */
  private async dispatchToDomainGateway(input: RecordDecisionInput): Promise<ExecutionResultSnapshot> {
    const rec = input.recommendation;
    const nowIso = new Date().toISOString();

    switch (rec.recommendationKey) {
      case 'R-01_AJUSTE_RENDIMIENTO': {
        const proposedRate = rec.proposedAction.suggestedParameters.proposedStandardRate;
        if (proposedRate === undefined || proposedRate === null) {
          throw new Error('MISSING_PARAMETER: R-01 requiere proposedStandardRate.');
        }

        let confirmedRate = proposedRate;
        if (this.overrides?.poaStandardUpdater) {
          const res = await this.overrides.poaStandardUpdater(rec.targetEntity.entityId, proposedRate);
          confirmedRate = res.updatedRate;
        }

        return {
          actionType: 'ADVISE_STANDARD_REVISION',
          activityKey: rec.targetEntity.entityId,
          previousStandardRate: (rec.supportingMetrics.find(m => m.metricKey === 'METRIC_THEORETICAL_PRODUCTIVITY_RATE')?.value) || null,
          confirmedUpdatedRate: confirmedRate,
          appliedAtIso: nowIso,
        };
      }

      case 'R-02_BALANCE_CUADRILLA': {
        const targetCrewId = rec.proposedAction.suggestedParameters.proposedTargetCrewId;
        if (!targetCrewId) {
          throw new Error('MISSING_PARAMETER: R-02 requiere proposedTargetCrewId.');
        }

        let confirmedCrewId = targetCrewId;
        const planItemId = rec.targetEntity.entityId;

        if (this.overrides?.crewAssignmentDispatcher) {
          const res = await this.overrides.crewAssignmentDispatcher(this.supabase as any, {
            planItemId,
            crewId: targetCrewId,
            userId: input.actorUserId,
          });
          if (!res.success) {
            throw new Error(`F5.2_CREW_ASSIGNMENT_FAILED: ${res.evaluation.message}`);
          }
          confirmedCrewId = res.updatedItem?.crew_id || targetCrewId;
        } else if (this.supabase) {
          const res = await assignCrewToPlanItemValidated(this.supabase, {
            planItemId,
            crewId: targetCrewId,
            userId: input.actorUserId,
          });
          if (!res.success) {
            throw new Error(`F5.2_CREW_ASSIGNMENT_FAILED: ${res.evaluation.message}`);
          }
          confirmedCrewId = res.updatedItem?.crew_id || targetCrewId;
        }

        return {
          actionType: 'ADVISE_CREW_REALLOCATION',
          planItemId,
          previousCrewId: null,
          confirmedCrewId,
          appliedAtIso: nowIso,
        };
      }

      case 'R-03_PROVISION_INSUMOS': {
        const proposedQuota = rec.proposedAction.suggestedParameters.proposedUnitQuota;
        if (proposedQuota === undefined || proposedQuota === null) {
          throw new Error('MISSING_PARAMETER: R-03 requiere proposedUnitQuota.');
        }

        let confirmedQuota = proposedQuota;
        if (this.overrides?.resourceQuotaUpdater) {
          const res = await this.overrides.resourceQuotaUpdater(
            rec.targetEntity.entityId,
            rec.scope.scopeId,
            proposedQuota
          );
          confirmedQuota = res.confirmedQuota;
        }

        return {
          actionType: 'ADVISE_RESOURCE_TEMPLATE_UPDATE',
          resourceKey: rec.targetEntity.entityId,
          activityKey: rec.scope.scopeId,
          previousQuota: null,
          confirmedQuota,
          appliedAtIso: nowIso,
        };
      }

      case 'R-04_DESDOBLAMIENTO_MULTIDIA': {
        const proposedDays = rec.proposedAction.suggestedParameters.proposedPlannedDays || 2;
        let confirmedSplitDates: string[] = [];
        let confirmedPlannedDays = proposedDays;

        if (this.overrides?.multidaySplitter) {
          const res = await this.overrides.multidaySplitter(rec.targetEntity.entityId, []);
          confirmedSplitDates = res.splitDates;
          confirmedPlannedDays = res.plannedDays;
        }

        return {
          actionType: 'ADVISE_MULTIDAY_PLANNING',
          occurrenceKey: rec.targetEntity.entityId,
          originalPlannedDays: 1,
          confirmedPlannedDays,
          confirmedSplitDates,
          appliedAtIso: nowIso,
        };
      }

      default:
        throw new Error(`UNKNOWN_RECOMMENDATION_KEY: ${rec.recommendationKey}`);
    }
  }
}
