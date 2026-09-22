/**
 * Types & Domain Contracts for Decision Governance v1
 *
 * Axioma Rector:
 * RECOMENDACIÓN != DECISIÓN != ACCIÓN != RESULTADO != EVALUACIÓN
 *
 * Persistencia:
 * Nuevo SoT Autorizado: public.operational_advisory_decisions (append-only, ON DELETE RESTRICT).
 */

import { OperationalRecommendation, RecommendationKey } from './operationalAdvisory';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Estados de Decisión y Acción
// ─────────────────────────────────────────────────────────────────────────────

export type DecisionStatus = 'ACCEPTED' | 'REJECTED' | 'POSTPONED';

export type ActionExecutionStatus =
  | 'PENDING_EXECUTION'
  | 'EXECUTED'
  | 'EXECUTION_FAILED'
  | 'NOT_APPLICABLE';

export type DecisionActorRole = 'supervisor' | 'coordinator' | 'admin';

// ─────────────────────────────────────────────────────────────────────────────
// 2. Snapshot Tipado de Resultados de Ejecución de Gateways (Cero `any`)
// ─────────────────────────────────────────────────────────────────────────────

export type ExecutionResultSnapshot =
  | {
      actionType: 'ADVISE_STANDARD_REVISION';
      activityKey: string;
      previousStandardRate: number | null;
      confirmedUpdatedRate: number;
      appliedAtIso: string;
    }
  | {
      actionType: 'ADVISE_CREW_REALLOCATION';
      planItemId: string;
      previousCrewId: string | null;
      confirmedCrewId: string;
      appliedAtIso: string;
    }
  | {
      actionType: 'ADVISE_RESOURCE_TEMPLATE_UPDATE';
      resourceKey: string;
      activityKey: string;
      previousQuota: number | null;
      confirmedQuota: number;
      appliedAtIso: string;
    }
  | {
      actionType: 'ADVISE_MULTIDAY_PLANNING';
      occurrenceKey: string;
      originalPlannedDays: number;
      confirmedPlannedDays: number;
      confirmedSplitDates: string[];
      appliedAtIso: string;
    };

// ─────────────────────────────────────────────────────────────────────────────
// 3. Hecho Histórico Inmutable de Decisión Humana (SoT)
// ─────────────────────────────────────────────────────────────────────────────

export interface DecisionRecord {
  id: string; // UUID
  decisionMutationId: string; // Clave única de idempotencia física
  recommendationId: string;
  recommendationKey: RecommendationKey;
  decisionSequenceNumber: number; // 1, 2, ...
  boardId: string;
  actorUserId: string;
  actorRole: DecisionActorRole;
  decisionStatus: DecisionStatus;
  decisionReason: string | null;
  postponedUntilIso: string | null;
  decisionTimestamp: string;
  recommendationSnapshot: OperationalRecommendation;
  actionStatus: ActionExecutionStatus;
  executionSnapshot: ExecutionResultSnapshot | null;
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Entradas y Respuestas de Transporte para Mutación de Decisión
// ─────────────────────────────────────────────────────────────────────────────

export interface RecordDecisionInput {
  decisionMutationId: string;
  recommendation: OperationalRecommendation;
  boardId: string;
  actorUserId: string;
  actorRole: DecisionActorRole;
  decisionStatus: DecisionStatus;
  decisionReason?: string | null;
  postponedUntilIso?: string | null;
}

export interface DecisionMutationResult {
  decisionRecord: DecisionRecord;
  isIdempotentReplay: boolean;
  gatewayExecutionStatus: ActionExecutionStatus;
  gatewayErrorMessage?: string | null;
}
