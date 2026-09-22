/**
 * Service: Pure Rule Evaluator for Workflow Automation Engine (Mantenix v1.2)
 * Baseline Entrada: 117 suites / 955 tests / TS 0 errores
 * 
 * Principios:
 * 1. Función 100% pura y determinista en memoria (0 I/O, 0 efectos secundarios, 0 mutaciones).
 * 2. Catálogo cerrado de operadores tipados (EQUALS, NOT_EQUALS, GREATER_THAN, IN, CONTAINS, IS_NULL, etc.).
 * 3. Resolución segura de FieldPath contra hechos físicos normalizados (retorna false determinista si falta un campo).
 * 4. Aislamiento H8: 🔴 STRICTLY NO-GO (0 imports, 0 llamadas).
 */

import {
  WorkflowCondition,
  WorkflowConditionGroup,
  WorkflowFieldPath,
  DomainEvent,
} from '../types/workflowAutomation';

/**
 * Extrae el valor de un FieldPath desde el payload del evento de dominio de forma segura.
 */
export function extractFieldValue(
  event: DomainEvent<Record<string, unknown>>,
  field: WorkflowFieldPath
): unknown {
  const payload = event.payload || {};

  switch (field) {
    case 'execution.reportedQty':
      return payload.executed_qty ?? payload.reportedQty ?? payload.executedQty;
    case 'execution.workerCount':
      return payload.worker_count ?? payload.workerCount;
    case 'execution.hoursWorked':
      return payload.hours_worked ?? payload.hoursWorked;
    case 'execution.verificationStatus':
      return payload.verification_status ?? payload.verificationStatus;
    case 'execution.rejectionReason':
      return payload.rejection_reason ?? payload.rejectionReason;
    case 'planItem.status':
      return payload.status ?? (payload.planItem as any)?.status;
    case 'planItem.plannedQty':
      return payload.planned_qty ?? payload.plannedQty ?? (payload.planItem as any)?.planned_qty;
    case 'planItem.plannedDate':
      return payload.planned_date ?? payload.plannedDate ?? (payload.planItem as any)?.planned_date;
    case 'crew.crewId':
      return payload.crew_id ?? payload.crewId ?? payload.assigned_crew_id;
    case 'acta.totalCertifiedAmount':
      return payload.total_certified_amount ?? payload.totalCertifiedAmount;
    case 'decision.actionType':
      return payload.action_type ?? payload.actionType;
    default:
      return undefined;
  }
}

/**
 * Evalúa una única condición atómica de forma determinista.
 */
export function evaluateSingleCondition(
  event: DomainEvent<Record<string, unknown>>,
  condition: WorkflowCondition
): boolean {
  const actualValue = extractFieldValue(event, condition.field);
  const targetValue = condition.value;

  switch (condition.operator) {
    case 'IS_NULL':
      return actualValue === null || actualValue === undefined;
    case 'IS_NOT_NULL':
      return actualValue !== null && actualValue !== undefined;
    case 'EQUALS':
      return actualValue === targetValue;
    case 'NOT_EQUALS':
      return actualValue !== targetValue;
    case 'GREATER_THAN':
      if (typeof actualValue !== 'number' || typeof targetValue !== 'number') return false;
      return actualValue > targetValue;
    case 'GREATER_THAN_OR_EQUAL':
      if (typeof actualValue !== 'number' || typeof targetValue !== 'number') return false;
      return actualValue >= targetValue;
    case 'LESS_THAN':
      if (typeof actualValue !== 'number' || typeof targetValue !== 'number') return false;
      return actualValue < targetValue;
    case 'LESS_THAN_OR_EQUAL':
      if (typeof actualValue !== 'number' || typeof targetValue !== 'number') return false;
      return actualValue <= targetValue;
    case 'IN':
      if (!Array.isArray(targetValue)) return false;
      return targetValue.includes(actualValue as any);
    case 'NOT_IN':
      if (!Array.isArray(targetValue)) return false;
      return !targetValue.includes(actualValue as any);
    case 'CONTAINS':
      if (typeof actualValue !== 'string' || typeof targetValue !== 'string') return false;
      return actualValue.includes(targetValue);
    default:
      return false;
  }
}

/**
 * Evalúa recursivamente un grupo de condiciones lógicas (AND / OR).
 */
export function evaluateConditionGroup(
  event: DomainEvent<Record<string, unknown>>,
  group: WorkflowConditionGroup
): boolean {
  if (!group.conditions || group.conditions.length === 0) {
    return true; // Un grupo sin condiciones evalúa a true por defecto
  }

  if (group.operator === 'AND') {
    return group.conditions.every((cond) => {
      if ('operator' in cond && 'conditions' in cond) {
        return evaluateConditionGroup(event, cond as WorkflowConditionGroup);
      }
      return evaluateSingleCondition(event, cond as WorkflowCondition);
    });
  }

  if (group.operator === 'OR') {
    return group.conditions.some((cond) => {
      if ('operator' in cond && 'conditions' in cond) {
        return evaluateConditionGroup(event, cond as WorkflowConditionGroup);
      }
      return evaluateSingleCondition(event, cond as WorkflowCondition);
    });
  }

  return false;
}
