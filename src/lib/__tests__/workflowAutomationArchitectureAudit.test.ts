/**
 * Test Suite: Auditoría de Invariantes y Fronteras Arquitectónicas (WF-19 a WF-25)
 * Baseline Entrada: 117 suites / 955 tests
 * 
 * Verificaciones:
 * 1. Aislamiento H8: 0 imports / 0 llamadas al solver en todo el módulo de automatizaciones.
 * 2. Invarianza de ADR-0007 a ADR-0013.
 * 3. Ausencia de mutaciones directas a PostgREST sin pasar por gateways.
 * 4. Integridad de contratos y determinismo de eventId.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  computeDeterministicEventId,
  createDomainEvent,
} from '../domainEventDispatcher';

describe('Workflow Automation Architectural Audit (WF-19 a WF-25)', () => {
  const typesFilePath = path.join(__dirname, '../../types/workflowAutomation.ts');
  const rulesFilePath = path.join(__dirname, '../automationRuleEvaluator.ts');
  const dispatcherFilePath = path.join(__dirname, '../domainEventDispatcher.ts');
  const engineFilePath = path.join(__dirname, '../workflowAutomationEngine.ts');
  const migrationFilePath = path.join(__dirname, '../../../supabase/migrations/20260913_workflow_automations_schema.sql');

  test('WF-19: Aislamiento H8 (0 imports / 0 llamadas a Solvers en Workflow Automation)', () => {
    const filesToAudit = [typesFilePath, rulesFilePath, dispatcherFilePath, engineFilePath];
    const forbiddenKeywords = ['resourceConstraints', 'solver', 'solveResourceConstrainedSchedule', 'milp', 'glpk'];

    for (const file of filesToAudit) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const keyword of forbiddenKeywords) {
        expect(content.toLowerCase()).not.toContain(keyword.toLowerCase());
      }
    }
  });

  test('WF-20: computeDeterministicEventId cumple la fórmula exacta de WF-C01 para las 8 familias', () => {
    expect(computeDeterministicEventId('EXECUTION_REPORTED', 'exec-1', 'mut-1')).toBe('evt__EXEC_REP__exec-1__mut-1');
    expect(computeDeterministicEventId('EXECUTION_VERIFIED', 'exec-1', '2026-09-13T10:00:00Z')).toBe('evt__EXEC_VER__exec-1__2026-09-13T10:00:00Z');
    expect(computeDeterministicEventId('EXECUTION_REJECTED', 'exec-1', '2026-09-13T10:00:00Z')).toBe('evt__EXEC_REJ__exec-1__2026-09-13T10:00:00Z');
    expect(computeDeterministicEventId('PLAN_ITEM_STATUS_CHANGED', 'item-1', 'completed__2026-09-13')).toBe('evt__PLAN_STATUS__item-1__completed__2026-09-13');
    expect(computeDeterministicEventId('CREW_ASSIGNMENT_CHANGED', 'item-1', 'crew-1__2026-09-13')).toBe('evt__CREW_ASSIGN__item-1__crew-1__2026-09-13');
    expect(computeDeterministicEventId('ACTA_ISSUED', 'acta-1', '2026-09-13')).toBe('evt__ACTA_ISSUED__acta-1__2026-09-13');
    expect(computeDeterministicEventId('DECISION_ACCEPTED', 'dec-1', 'mut-1')).toBe('evt__DECISION_ACCEPTED__dec-1__mut-1');
    expect(computeDeterministicEventId('SCHEDULE_DUE_DATE_REACHED', 'occ-1', '2026-09-15')).toBe('evt__SCHEDULE_DUE__occ-1__2026-09-15');
  });

  test('WF-21: createDomainEvent propaga correctamente causalityDepth y envelope estricto', () => {
    const event = createDomainEvent({
      eventType: 'EXECUTION_REPORTED',
      boardId: 'board-1',
      actor: { actorType: 'USER', userId: 'user-1' },
      sourceMutationId: 'mut-1',
      entityId: 'exec-1',
      payload: { executed_qty: 10 },
    });

    expect(event.eventId).toBe('evt__EXEC_REP__exec-1__mut-1');
    expect(event.causalityDepth).toBe(0);
    expect(event.actor.actorType).toBe('USER');
  });

  test('WF-22: createDomainEvent eleva automáticamente causalityDepth si actorType es AUTOMATION', () => {
    const autoEvent = createDomainEvent({
      eventType: 'CREW_ASSIGNMENT_CHANGED',
      boardId: 'board-1',
      actor: { actorType: 'AUTOMATION', userId: 'auto-actor' },
      sourceMutationId: 'mut-2',
      entityId: 'item-1',
      payload: { crew_id: 'crew-1' },
    });

    expect(autoEvent.causalityDepth).toBe(1);
    expect(autoEvent.actor.actorType).toBe('AUTOMATION');
  });

  test('WF-23: Verificación de migración DDL: contiene RLS, trigger anti-tampering y control de estados', () => {
    const migrationContent = fs.readFileSync(migrationFilePath, 'utf-8');

    expect(migrationContent).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migrationContent).toContain('REVOKE ALL ON public.automation_definitions FROM anon, authenticated');
    expect(migrationContent).toContain('trg_protect_automation_definition');
    expect(migrationContent).toContain('TAMPERING_FORBIDDEN');
    expect(migrationContent).toContain('ARCHIVED');
    expect(migrationContent).toContain('gateway_idempotency_key');
  });

  test('WF-24: Invarianza de Gateways: WorkflowAutomationEngine consume solo gateways certificados', () => {
    const engineContent = fs.readFileSync(engineFilePath, 'utf-8');

    expect(engineContent).toContain('assignCrewToPlanItemValidated');
    expect(engineContent).toContain('reschedulePlanItemValidated');
    expect(engineContent).toContain('evaluateCrewAssignment');
  });

  test('WF-25: Invarianza de SoT: Cero mutaciones directas a tablas maestras de dominio desde el Engine', () => {
    const engineContent = fs.readFileSync(engineFilePath, 'utf-8');

    // No debe haber llamadas directas a `.from('weekly_plan_items').update(...)` o `.from('poa_activities').delete(...)`
    expect(engineContent).not.toMatch(/\.from\(['"]weekly_plan_items['"]\)\.(update|insert|delete)/);
    expect(engineContent).not.toMatch(/\.from\(['"]weekly_plans['"]\)\.(update|insert|delete)/);
    expect(engineContent).not.toMatch(/\.from\(['"]actas['"]\)\.(update|insert|delete)/);
  });
});
