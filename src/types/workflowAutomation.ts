/**
 * Types & Contracts: Workflow Automation Engine (Mantenix v1.2)
 * Baseline Entrada: 117 suites / 955 tests / TS 0 errores
 * 
 * Principios Arquitectónicos:
 * 1. Separación estricta: HECHO OBSERVADO -> DOMAIN EVENT -> TRIGGER -> RULES -> ACTION -> GATEWAY SOBERANO -> NUEVO HECHO.
 * 2. Inmutabilidad de Versiones: Ciclo de vida DRAFT -> ACTIVE -> DISABLED -> ARCHIVED.
 * 3. Identidad por Versión: Cada versión física tiene UUID propio y referencia parent_definition_id.
 * 4. Idempotencia y Replay Seguro: gatewayIdempotencyKey determinista por evento y acción.
 * 5. Loop Guard Determinista: actorType === 'AUTOMATION' o causalityDepth >= 1 descarta ejecución (SKIPPED).
 * 6. Desacoplamiento Transaccional: Post-Commit Durable Event Delivery (fallos de automatización no abortan la mutación primaria).
 * 7. Aislamiento Total H8: 🔴 STRICTLY NO-GO (0 imports, 0 llamadas).
 */

export type WorkflowTriggerType =
  | 'EXECUTION_REPORTED'
  | 'EXECUTION_VERIFIED'
  | 'EXECUTION_REJECTED'
  | 'PLAN_ITEM_STATUS_CHANGED'
  | 'CREW_ASSIGNMENT_CHANGED'
  | 'ACTA_ISSUED'
  | 'DECISION_ACCEPTED'
  | 'SCHEDULE_DUE_DATE_REACHED';

export type WorkflowActionType =
  | 'ASSIGN_CREW'
  | 'RESCHEDULE_OCCURRENCE'
  | 'REQUEST_VERIFICATION_REVIEW';

export type AutomationDefinitionStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'DISABLED'
  | 'ARCHIVED';

export type AutomationExecutionStatus =
  | 'PENDING'
  | 'EXECUTING'
  | 'SUCCESS'
  | 'FAILED'
  | 'SKIPPED';

export type RuleOperator =
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'GREATER_THAN'
  | 'GREATER_THAN_OR_EQUAL'
  | 'LESS_THAN'
  | 'LESS_THAN_OR_EQUAL'
  | 'IN'
  | 'NOT_IN'
  | 'CONTAINS'
  | 'IS_NULL'
  | 'IS_NOT_NULL';

export type LogicalOperator = 'AND' | 'OR';

/**
 * Catálogo cerrado de FieldPaths basados en el esquema físico real de Mantenix (WF-C02).
 */
export type WorkflowFieldPath =
  | 'execution.reportedQty'
  | 'execution.workerCount'
  | 'execution.hoursWorked'
  | 'execution.verificationStatus'
  | 'execution.rejectionReason'
  | 'planItem.status'
  | 'planItem.plannedQty'
  | 'planItem.plannedDate'
  | 'crew.crewId'
  | 'acta.totalCertifiedAmount'
  | 'decision.actionType';

export interface WorkflowCondition {
  field: WorkflowFieldPath;
  operator: RuleOperator;
  value?: string | number | boolean | Array<string | number>;
}

export interface WorkflowConditionGroup {
  operator: LogicalOperator;
  conditions: Array<WorkflowCondition | WorkflowConditionGroup>;
}

export type WorkflowActionPayload =
  | {
      actionType: 'ASSIGN_CREW';
      planItemId: string;
      crewId: string | null;
    }
  | {
      actionType: 'RESCHEDULE_OCCURRENCE';
      planItemId: string;
      targetDate: string; // YYYY-MM-DD
      reasonCode: 'WEATHER_DELAY' | 'OPERATIONAL_PRIORITY' | 'LOGISTICS_EQUIPMENT' | 'SUPERVISOR_ADJUSTMENT';
      notes?: string;
    }
  | {
      actionType: 'REQUEST_VERIFICATION_REVIEW';
      planItemId: string;
      executionId: string;
      recipientRoles: Array<'SUPERVISOR' | 'DIRECTOR' | 'ADMIN' | 'VERIFIER'>;
      message: string;
    };

export interface AutomationDefinition {
  id: string; // UUID propio por versión
  boardId: string;
  parentDefinitionId: string | null;
  name: string;
  version: number;
  status: AutomationDefinitionStatus;
  triggerType: WorkflowTriggerType;
  conditionGroup: WorkflowConditionGroup;
  action: WorkflowActionPayload;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DomainEventActor {
  actorType: 'USER' | 'SYSTEM' | 'AUTOMATION';
  userId?: string;
  sourceContext?: string;
}

export interface DomainEvent<T = Record<string, unknown>> {
  eventId: string;
  eventType: WorkflowTriggerType;
  boardId: string;
  occurredAt: string; // ISO Timestamp
  actor: DomainEventActor;
  causalityDepth: number;
  sourceMutationId: string;
  payload: T;
}

export interface AutomationExecutionRecord {
  id: string;
  automationDefinitionId: string;
  eventId: string;
  boardId: string;
  triggerType: WorkflowTriggerType;
  executionStatus: AutomationExecutionStatus;
  gatewayIdempotencyKey: string;
  causalityDepth: number;
  evaluatedConditions: {
    passed: boolean;
    details: Record<string, unknown>;
  };
  gatewayResultSnapshot?: Record<string, unknown> | null;
  errorMessage?: string | null;
  executedAt: string;
  updatedAt: string;
}

export interface TrustedAutomationContext {
  actorType: 'AUTOMATION';
  automationDefinitionId: string;
  boardId: string;
  userId?: string;
  roles: string[];
}
