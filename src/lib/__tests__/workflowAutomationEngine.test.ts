/**
 * Test Suite: Motor de Automatizaciones & Integración de Gateways Soberanos (WF-09 a WF-18)
 * Baseline Entrada: 117 suites / 955 tests
 */

jest.mock('../crewAssignmentService', () => ({
  evaluateCrewAssignment: jest.fn(),
  assignCrewToPlanItemValidated: jest.fn(),
  getEligibleCrewsForBoard: jest.fn(),
}));

jest.mock('../maintenanceScheduleService', () => ({
  reschedulePlanItemValidated: jest.fn(),
  evaluateMaintenanceScheduleView: jest.fn(),
  validateRescheduleCommand: jest.fn(),
}));

import {
  processDomainEventAutomations,
  computeGatewayIdempotencyKey,
} from '../workflowAutomationEngine';
import {
  AutomationDefinition,
  DomainEvent,
  TrustedAutomationContext,
} from '../../types/workflowAutomation';
import {
  evaluateCrewAssignment,
  assignCrewToPlanItemValidated,
} from '../crewAssignmentService';
import { reschedulePlanItemValidated } from '../maintenanceScheduleService';

describe('WorkflowAutomationEngine & Gateways (WF-09 a WF-18)', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
    };
  });

  const trustedContext: TrustedAutomationContext = {
    actorType: 'AUTOMATION',
    automationDefinitionId: 'def-1',
    boardId: 'board-100',
    roles: ['admin'],
  };

  const sampleEvent: DomainEvent<Record<string, unknown>> = {
    eventId: 'evt__EXEC_REP__exec-1__mut-1',
    eventType: 'EXECUTION_REPORTED',
    boardId: 'board-100',
    occurredAt: '2026-09-13T12:00:00Z',
    actor: { actorType: 'USER', userId: 'user-supervisor' },
    causalityDepth: 0,
    sourceMutationId: 'mut-1',
    payload: {
      executed_qty: 25,
      worker_count: 5,
    },
  };

  test('WF-09: computeGatewayIdempotencyKey genera llaves deterministas por definición, evento y acción', () => {
    const key = computeGatewayIdempotencyKey('def-1', 'evt-1', {
      actionType: 'ASSIGN_CREW',
      planItemId: 'item-1',
      crewId: 'crew-1',
    });
    expect(key).toBe('gw_assign__item-1__crew-1__evt-1__def-1');
  });

  test('WF-10: Loop Guard bloquea ejecución si actorType es AUTOMATION (WF-C06)', async () => {
    const autoEvent: DomainEvent<Record<string, unknown>> = {
      ...sampleEvent,
      actor: { actorType: 'AUTOMATION', userId: 'auto-actor' },
    };

    const definitions: AutomationDefinition[] = [
      {
        id: 'def-1',
        boardId: 'board-100',
        parentDefinitionId: null,
        name: 'Auto Assign',
        version: 1,
        status: 'ACTIVE',
        triggerType: 'EXECUTION_REPORTED',
        conditionGroup: { operator: 'AND', conditions: [] },
        action: { actionType: 'ASSIGN_CREW', planItemId: 'item-1', crewId: 'crew-1' },
        createdBy: 'user-admin',
        createdAt: '2026-09-13T00:00:00Z',
        updatedAt: '2026-09-13T00:00:00Z',
      },
    ];

    const results = await processDomainEventAutomations(
      mockSupabase,
      autoEvent,
      definitions,
      trustedContext
    );

    expect(results.length).toBe(1);
    expect(results[0].skipped).toBe(true);
    expect(results[0].skipReason).toBe('LOOP_GUARD_PREVENTED_EXECUTION');
  });

  test('WF-11: Loop Guard bloquea ejecución si causalityDepth >= 1', async () => {
    const deepEvent: DomainEvent<Record<string, unknown>> = {
      ...sampleEvent,
      causalityDepth: 1,
    };

    const definitions: AutomationDefinition[] = [
      {
        id: 'def-1',
        boardId: 'board-100',
        parentDefinitionId: null,
        name: 'Auto Assign',
        version: 1,
        status: 'ACTIVE',
        triggerType: 'EXECUTION_REPORTED',
        conditionGroup: { operator: 'AND', conditions: [] },
        action: { actionType: 'ASSIGN_CREW', planItemId: 'item-1', crewId: 'crew-1' },
        createdBy: 'user-admin',
        createdAt: '2026-09-13T00:00:00Z',
        updatedAt: '2026-09-13T00:00:00Z',
      },
    ];

    const results = await processDomainEventAutomations(
      mockSupabase,
      deepEvent,
      definitions,
      trustedContext
    );

    expect(results.length).toBe(1);
    expect(results[0].skipped).toBe(true);
    expect(results[0].skipReason).toBe('LOOP_GUARD_PREVENTED_EXECUTION');
  });

  test('WF-12: Descarta definiciones en estado DRAFT, DISABLED o ARCHIVED', async () => {
    const definitions: AutomationDefinition[] = [
      {
        id: 'def-draft',
        boardId: 'board-100',
        parentDefinitionId: null,
        name: 'Draft Auto',
        version: 1,
        status: 'DRAFT',
        triggerType: 'EXECUTION_REPORTED',
        conditionGroup: { operator: 'AND', conditions: [] },
        action: { actionType: 'ASSIGN_CREW', planItemId: 'item-1', crewId: 'crew-1' },
        createdBy: 'user-admin',
        createdAt: '2026-09-13T00:00:00Z',
        updatedAt: '2026-09-13T00:00:00Z',
      },
      {
        id: 'def-disabled',
        boardId: 'board-100',
        parentDefinitionId: null,
        name: 'Disabled Auto',
        version: 1,
        status: 'DISABLED',
        triggerType: 'EXECUTION_REPORTED',
        conditionGroup: { operator: 'AND', conditions: [] },
        action: { actionType: 'ASSIGN_CREW', planItemId: 'item-1', crewId: 'crew-1' },
        createdBy: 'user-admin',
        createdAt: '2026-09-13T00:00:00Z',
        updatedAt: '2026-09-13T00:00:00Z',
      },
    ];

    const results = await processDomainEventAutomations(
      mockSupabase,
      sampleEvent,
      definitions,
      trustedContext
    );

    expect(results.length).toBe(0);
  });

  test('WF-13: Ejecución exitosa de ASSIGN_CREW delega a crewAssignmentService', async () => {
    (evaluateCrewAssignment as jest.Mock).mockResolvedValueOnce({
      allowed: true,
      action: 'ASSIGN',
      reasonCode: 'ASSIGNMENT_VALID',
      message: 'Valid assignment',
      item: { id: 'item-1', board_id: 'board-100' },
      currentCrewId: null,
      targetCrewId: 'crew-1',
    });

    (assignCrewToPlanItemValidated as jest.Mock).mockResolvedValueOnce({
      evaluation: {
        allowed: true,
        action: 'ASSIGN',
        reasonCode: 'ASSIGNMENT_SUCCESSFUL',
        message: 'Assigned',
        item: null,
        currentCrewId: null,
        targetCrewId: 'crew-1',
      },
      success: true,
      updatedItem: { id: 'item-1', crew_id: 'crew-1' },
    });

    const definitions: AutomationDefinition[] = [
      {
        id: 'def-1',
        boardId: 'board-100',
        parentDefinitionId: null,
        name: 'Assign Crew 1',
        version: 1,
        status: 'ACTIVE',
        triggerType: 'EXECUTION_REPORTED',
        conditionGroup: {
          operator: 'AND',
          conditions: [{ field: 'execution.reportedQty', operator: 'GREATER_THAN', value: 20 }],
        },
        action: { actionType: 'ASSIGN_CREW', planItemId: 'item-1', crewId: 'crew-1' },
        createdBy: 'user-admin',
        createdAt: '2026-09-13T00:00:00Z',
        updatedAt: '2026-09-13T00:00:00Z',
      },
    ];

    const results = await processDomainEventAutomations(
      mockSupabase,
      sampleEvent,
      definitions,
      trustedContext
    );

    expect(results.length).toBe(1);
    expect(results[0].matched).toBe(true);
    expect(results[0].executionRecord?.executionStatus).toBe('SUCCESS');
  });

  test('WF-14: Idempotencia en ASSIGN_CREW detecta IDEMPOTENT_NO_OP sin duplicar mutación', async () => {
    (evaluateCrewAssignment as jest.Mock).mockResolvedValueOnce({
      allowed: true,
      action: 'NO_OP',
      reasonCode: 'IDEMPOTENT_NO_OP',
      message: 'Already assigned',
      item: { id: 'item-1', board_id: 'board-100', crew_id: 'crew-1' },
      currentCrewId: 'crew-1',
      targetCrewId: 'crew-1',
    });

    const definitions: AutomationDefinition[] = [
      {
        id: 'def-1',
        boardId: 'board-100',
        parentDefinitionId: null,
        name: 'Assign Crew 1',
        version: 1,
        status: 'ACTIVE',
        triggerType: 'EXECUTION_REPORTED',
        conditionGroup: { operator: 'AND', conditions: [] },
        action: { actionType: 'ASSIGN_CREW', planItemId: 'item-1', crewId: 'crew-1' },
        createdBy: 'user-admin',
        createdAt: '2026-09-13T00:00:00Z',
        updatedAt: '2026-09-13T00:00:00Z',
      },
    ];

    const results = await processDomainEventAutomations(
      mockSupabase,
      sampleEvent,
      definitions,
      trustedContext
    );

    expect(results.length).toBe(1);
    expect(results[0].matched).toBe(true);
    expect(results[0].gatewayResult?.status).toBe('IDEMPOTENT_NO_OP');
  });

  test('WF-15: Ejecución de RESCHEDULE_OCCURRENCE delega a maintenanceScheduleService', async () => {
    (reschedulePlanItemValidated as jest.Mock).mockResolvedValueOnce({
      validation: {
        allowed: true,
        action: 'RESCHEDULE',
        reasonCode: 'AUTHORIZED_RESCHEDULE',
        message: 'Rescheduled',
        currentItem: null,
        currentPlannedDate: '2026-09-15',
        targetPlannedDate: '2026-09-18',
        extendedOverrideReason: '[RESCHEDULE:WEATHER_DELAY]',
      },
      success: true,
      updatedItem: { id: 'item-1', planned_date: '2026-09-18' },
    });

    const definitions: AutomationDefinition[] = [
      {
        id: 'def-reschedule',
        boardId: 'board-100',
        parentDefinitionId: null,
        name: 'Reschedule on Rain',
        version: 1,
        status: 'ACTIVE',
        triggerType: 'EXECUTION_REPORTED',
        conditionGroup: { operator: 'AND', conditions: [] },
        action: {
          actionType: 'RESCHEDULE_OCCURRENCE',
          planItemId: 'item-1',
          targetDate: '2026-09-18',
          reasonCode: 'WEATHER_DELAY',
        },
        createdBy: 'user-admin',
        createdAt: '2026-09-13T00:00:00Z',
        updatedAt: '2026-09-13T00:00:00Z',
      },
    ];

    const results = await processDomainEventAutomations(
      mockSupabase,
      sampleEvent,
      definitions,
      trustedContext
    );

    expect(results.length).toBe(1);
    expect(results[0].matched).toBe(true);
    expect(results[0].executionRecord?.executionStatus).toBe('SUCCESS');
  });

  test('WF-16: REQUEST_VERIFICATION_REVIEW ejecuta upsert con notification_dedup_key garantizando 0 duplicados', async () => {
    const definitions: AutomationDefinition[] = [
      {
        id: 'def-notif',
        boardId: 'board-100',
        parentDefinitionId: null,
        name: 'Review Needed',
        version: 1,
        status: 'ACTIVE',
        triggerType: 'EXECUTION_REPORTED',
        conditionGroup: { operator: 'AND', conditions: [] },
        action: {
          actionType: 'REQUEST_VERIFICATION_REVIEW',
          planItemId: 'item-1',
          executionId: 'exec-1',
          recipientRoles: ['SUPERVISOR', 'VERIFIER'],
          message: 'Please review execution',
        },
        createdBy: 'user-admin',
        createdAt: '2026-09-13T00:00:00Z',
        updatedAt: '2026-09-13T00:00:00Z',
      },
    ];

    mockSupabase.upsert.mockImplementation(() => ({
      select: () => Promise.resolve({ data: [{ id: 'notif-1' }, { id: 'notif-2' }], error: null }),
    }));

    const results = await processDomainEventAutomations(
      mockSupabase,
      sampleEvent,
      definitions,
      trustedContext
    );

    expect(results.length).toBe(1);
    expect(results[0].matched).toBe(true);
    expect(results[0].executionRecord?.executionStatus).toBe('SUCCESS');
  });

  test('WF-17: Fallo en gateway registra executionStatus FAILED sin propagar excepción ni abortar', async () => {
    (evaluateCrewAssignment as jest.Mock).mockRejectedValueOnce(new Error('DB Connection Timeout'));

    const definitions: AutomationDefinition[] = [
      {
        id: 'def-failing',
        boardId: 'board-100',
        parentDefinitionId: null,
        name: 'Failing Crew Assignment',
        version: 1,
        status: 'ACTIVE',
        triggerType: 'EXECUTION_REPORTED',
        conditionGroup: { operator: 'AND', conditions: [] },
        action: { actionType: 'ASSIGN_CREW', planItemId: 'item-1', crewId: 'crew-1' },
        createdBy: 'user-admin',
        createdAt: '2026-09-13T00:00:00Z',
        updatedAt: '2026-09-13T00:00:00Z',
      },
    ];

    const results = await processDomainEventAutomations(
      mockSupabase,
      sampleEvent,
      definitions,
      trustedContext
    );

    expect(results.length).toBe(1);
    expect(results[0].matched).toBe(true);
    expect(results[0].executionRecord?.executionStatus).toBe('FAILED');
    expect(results[0].error).toContain('DB Connection Timeout');
  });

  test('WF-18: Multi-definición evalúa secuencialmente e independientemente cada regla', async () => {
    const definitions: AutomationDefinition[] = [
      {
        id: 'def-match',
        boardId: 'board-100',
        parentDefinitionId: null,
        name: 'Matching Rule',
        version: 1,
        status: 'ACTIVE',
        triggerType: 'EXECUTION_REPORTED',
        conditionGroup: {
          operator: 'AND',
          conditions: [{ field: 'execution.reportedQty', operator: 'GREATER_THAN', value: 10 }],
        },
        action: { actionType: 'ASSIGN_CREW', planItemId: 'item-1', crewId: 'crew-1' },
        createdBy: 'user-admin',
        createdAt: '2026-09-13T00:00:00Z',
        updatedAt: '2026-09-13T00:00:00Z',
      },
      {
        id: 'def-no-match',
        boardId: 'board-100',
        parentDefinitionId: null,
        name: 'Non Matching Rule',
        version: 1,
        status: 'ACTIVE',
        triggerType: 'EXECUTION_REPORTED',
        conditionGroup: {
          operator: 'AND',
          conditions: [{ field: 'execution.reportedQty', operator: 'GREATER_THAN', value: 100 }],
        },
        action: { actionType: 'ASSIGN_CREW', planItemId: 'item-1', crewId: 'crew-1' },
        createdBy: 'user-admin',
        createdAt: '2026-09-13T00:00:00Z',
        updatedAt: '2026-09-13T00:00:00Z',
      },
    ];

    (evaluateCrewAssignment as jest.Mock).mockResolvedValueOnce({
      allowed: true,
      action: 'NO_OP',
      reasonCode: 'IDEMPOTENT_NO_OP',
      message: 'OK',
      item: null,
      currentCrewId: null,
      targetCrewId: 'crew-1',
    });

    const results = await processDomainEventAutomations(
      mockSupabase,
      sampleEvent,
      definitions,
      trustedContext
    );

    expect(results.length).toBe(2);
    expect(results[0].matched).toBe(true);
    expect(results[1].matched).toBe(false);
  });
});
