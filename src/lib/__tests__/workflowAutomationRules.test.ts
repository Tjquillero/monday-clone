/**
 * Test Suite: Evaluador de Reglas de Automatización (WF-01 a WF-08)
 * Baseline Entrada: 117 suites / 955 tests
 */

import {
  evaluateSingleCondition,
  evaluateConditionGroup,
  extractFieldValue,
} from '../automationRuleEvaluator';
import { DomainEvent, WorkflowConditionGroup } from '../../types/workflowAutomation';

describe('WorkflowAutomationRules (WF-01 a WF-08)', () => {
  const baseEvent: DomainEvent<Record<string, unknown>> = {
    eventId: 'evt__EXEC_REP__exec1__mut1',
    eventType: 'EXECUTION_REPORTED',
    boardId: 'board-123',
    occurredAt: '2026-09-13T10:00:00Z',
    actor: { actorType: 'USER', userId: 'user-1' },
    causalityDepth: 0,
    sourceMutationId: 'mut-123',
    payload: {
      executed_qty: 15,
      worker_count: 4,
      hours_worked: 8.5,
      verification_status: 'VERIFIED',
      rejection_reason: null,
      status: 'in_progress',
      planned_qty: 20,
      planned_date: '2026-09-15',
      crew_id: 'crew-alpha',
      total_certified_amount: 5000000,
      action_type: 'RESCHEDULE_PLAN_ITEM',
    },
  };

  test('WF-01: extractFieldValue extrae correctamente columnas físicas de ejecuciones y planes', () => {
    expect(extractFieldValue(baseEvent, 'execution.reportedQty')).toBe(15);
    expect(extractFieldValue(baseEvent, 'execution.workerCount')).toBe(4);
    expect(extractFieldValue(baseEvent, 'execution.hoursWorked')).toBe(8.5);
    expect(extractFieldValue(baseEvent, 'execution.verificationStatus')).toBe('VERIFIED');
    expect(extractFieldValue(baseEvent, 'planItem.status')).toBe('in_progress');
    expect(extractFieldValue(baseEvent, 'crew.crewId')).toBe('crew-alpha');
  });

  test('WF-02: evaluateSingleCondition evalúa operadores numéricos EQUALS, GREATER_THAN, LESS_THAN', () => {
    expect(
      evaluateSingleCondition(baseEvent, {
        field: 'execution.reportedQty',
        operator: 'EQUALS',
        value: 15,
      })
    ).toBe(true);

    expect(
      evaluateSingleCondition(baseEvent, {
        field: 'execution.reportedQty',
        operator: 'GREATER_THAN',
        value: 10,
      })
    ).toBe(true);

    expect(
      evaluateSingleCondition(baseEvent, {
        field: 'execution.reportedQty',
        operator: 'LESS_THAN',
        value: 20,
      })
    ).toBe(true);

    expect(
      evaluateSingleCondition(baseEvent, {
        field: 'execution.reportedQty',
        operator: 'GREATER_THAN',
        value: 100,
      })
    ).toBe(false);
  });

  test('WF-03: evaluateSingleCondition maneja operadores de texto e IN / NOT_IN', () => {
    expect(
      evaluateSingleCondition(baseEvent, {
        field: 'execution.verificationStatus',
        operator: 'EQUALS',
        value: 'VERIFIED',
      })
    ).toBe(true);

    expect(
      evaluateSingleCondition(baseEvent, {
        field: 'crew.crewId',
        operator: 'IN',
        value: ['crew-alpha', 'crew-beta'],
      })
    ).toBe(true);

    expect(
      evaluateSingleCondition(baseEvent, {
        field: 'crew.crewId',
        operator: 'NOT_IN',
        value: ['crew-gamma', 'crew-delta'],
      })
    ).toBe(true);
  });

  test('WF-04: evaluateSingleCondition maneja IS_NULL e IS_NOT_NULL de forma segura', () => {
    expect(
      evaluateSingleCondition(baseEvent, {
        field: 'execution.rejectionReason',
        operator: 'IS_NULL',
      })
    ).toBe(true);

    expect(
      evaluateSingleCondition(baseEvent, {
        field: 'execution.reportedQty',
        operator: 'IS_NOT_NULL',
      })
    ).toBe(true);
  });

  test('WF-05: evaluateConditionGroup resuelve lógica AND correctamente', () => {
    const group: WorkflowConditionGroup = {
      operator: 'AND',
      conditions: [
        { field: 'execution.reportedQty', operator: 'GREATER_THAN', value: 10 },
        { field: 'execution.workerCount', operator: 'EQUALS', value: 4 },
      ],
    };
    expect(evaluateConditionGroup(baseEvent, group)).toBe(true);

    const failingGroup: WorkflowConditionGroup = {
      operator: 'AND',
      conditions: [
        { field: 'execution.reportedQty', operator: 'GREATER_THAN', value: 10 },
        { field: 'execution.workerCount', operator: 'EQUALS', value: 99 },
      ],
    };
    expect(evaluateConditionGroup(baseEvent, failingGroup)).toBe(false);
  });

  test('WF-06: evaluateConditionGroup resuelve lógica OR y anidación compleja', () => {
    const group: WorkflowConditionGroup = {
      operator: 'OR',
      conditions: [
        { field: 'execution.workerCount', operator: 'EQUALS', value: 99 },
        {
          operator: 'AND',
          conditions: [
            { field: 'execution.reportedQty', operator: 'EQUALS', value: 15 },
            { field: 'crew.crewId', operator: 'EQUALS', value: 'crew-alpha' },
          ],
        },
      ],
    };
    expect(evaluateConditionGroup(baseEvent, group)).toBe(true);
  });

  test('WF-07: Un grupo de condiciones vacío evalúa a true', () => {
    const emptyGroup: WorkflowConditionGroup = {
      operator: 'AND',
      conditions: [],
    };
    expect(evaluateConditionGroup(baseEvent, emptyGroup)).toBe(true);
  });

  test('WF-08: Manejo seguro ante tipos incompatibles retorna false sin lanzar excepción', () => {
    expect(
      evaluateSingleCondition(baseEvent, {
        field: 'crew.crewId',
        operator: 'GREATER_THAN',
        value: 10, // Comparar texto con número
      })
    ).toBe(false);
  });
});
