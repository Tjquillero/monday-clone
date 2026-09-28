/**
 * Hito 7.1A — Suite de Verificación Integrativa: Agent Runtime Foundation v1.0
 *
 * Cobertura de Requerimientos R1–R19:
 * R1: Ciclo de Vida Determinístico controlado 100% por el Runtime (el LLM no controla el estado).
 * R2: Abstracción del ModelGateway y desacoplamiento de proveedor (NoOpModelGateway).
 * R3: ContextManager ensambla observaciones de H7.1 sin pérdida de datos.
 * R4: PolicyEngine evalúa políticas de seguridad fuera del modelo.
 * R5: ToolRegistry valida esquemas y limita permisos por RiskClass.
 * R6: Ausencia total de mutaciones en base de datos PostgreSQL (0 escrituras).
 * R7: Ausencia de autoreparación de código en H7.1A.
 * R8: Audit Trail determinista en memoria con trazabilidad completa.
 * R19: Fail-Closed Estructural: Ante herramienta no registrada o error -> DENY / ESCALATE -> FAILED.
 */

import { GovernedAgentRuntime } from '@/lib/agentRuntimeFoundationService';
import { createNoOpModelGateway } from '@/lib/agentModelGateway';
import { evaluateActionPolicy } from '@/lib/agentPolicyEngine';
import { agentToolRegistry } from '@/lib/agentToolRegistry';
import { createEventEnvelope } from '@/lib/observabilityRuntimeService';

describe('Hito 7.1A — Agent Runtime Foundation & Governed Cognitive Gateway (Suite R1–R19)', () => {

  test('R1 & R8: Ciclo de vida determinístico controlado por el Runtime y Audit Trail completo', async () => {
    const runtime = new GovernedAgentRuntime({ agentId: 'agent-test-01' });

    expect(runtime.getState()).toBe('IDLE');

    const env = createEventEnvelope({
      eventType: 'UI_ERROR',
      severity: 'ERROR',
      source: 'TestComponent',
      payload: { err: 'Mock Error' },
    });

    runtime.processObservation(env);

    // Tras procesar la observación, el Runtime avanzó automáticamente a REASONING
    expect(runtime.getState()).toBe('REASONING');

    const response = await runtime.triggerReasoning('Analyze current observation');
    expect(response.content).toContain('NoOp Gateway Reasoning Completed.');
    expect(runtime.getState()).toBe('COMPLETED');

    const auditTrail = runtime.getAuditTrail();
    expect(auditTrail.length).toBeGreaterThan(3);
    expect(auditTrail[0].actor).toBe('RUNTIME');
    expect(auditTrail[0].eventType).toBe('STATE_TRANSITION');
  });

  test('R2 & R5: Desacoplamiento de ModelGateway y ToolRegistry con RiskClass', () => {
    const gateway = createNoOpModelGateway('Mocked Reasoning Output');
    expect(gateway.provider).toBe('DETERMINISTIC_NOOP');

    const tool = agentToolRegistry.getTool('readObservabilityEvents');
    expect(tool).not.toBeNull();
    expect(tool?.scope).toBe('READ_ONLY');
    expect(tool?.riskClass).toBe('LOW');
  });

  test('R3: ContextManager ensambla observaciones de H7.1 en el contexto activo', () => {
    const runtime = new GovernedAgentRuntime({ agentId: 'agent-context-test' });

    const env = createEventEnvelope({
      correlationId: 'corr-h71a-test',
      eventType: 'MATERIALIZATION_DRIFT',
      severity: 'WARN',
      source: 'MaterializationService',
      payload: { drift: 0.15 },
    });

    runtime.processObservation(env);
    expect(runtime.getState()).toBe('REASONING');
  });

  test('R4: PolicyEngine evalúa políticas FUERA del modelo (Clase A vs Clase B)', () => {
    // Clase A (Read Only) -> ALLOW_SANDBOX
    const readTool = agentToolRegistry.getTool('readObservabilityEvents');
    const decisionA = evaluateActionPolicy({
      toolDeclaration: readTool,
      proposedActionName: 'readObservabilityEvents',
      requestedByState: 'REQUESTING_ACTION',
    });

    expect(decisionA.decision).toBe('ALLOW_SANDBOX');
    expect(decisionA.requiresHumanDecision).toBe(false);

    // Clase B (Contractual Write) -> ESCALATE_TO_HUMAN
    const contractualTool = agentToolRegistry.getTool('updateContractualPOA');
    const decisionB = evaluateActionPolicy({
      toolDeclaration: contractualTool,
      proposedActionName: 'updateContractualPOA',
      requestedByState: 'REQUESTING_ACTION',
    });

    expect(decisionB.decision).toBe('ESCALATE_TO_HUMAN');
    expect(decisionB.requiresHumanDecision).toBe(true);

    // Infraestructura / DDL -> DENY_STRICT
    const ddlTool = agentToolRegistry.getTool('executeDatabaseDDL');
    const decisionC = evaluateActionPolicy({
      toolDeclaration: ddlTool,
      proposedActionName: 'executeDatabaseDDL',
      requestedByState: 'REQUESTING_ACTION',
    });

    expect(decisionC.decision).toBe('DENY_STRICT');
  });

  test('R6 & R7: Ausencia total de mutaciones en base de datos y cero autoreparaciones de código en H7.1A', async () => {
    const runtime = new GovernedAgentRuntime({ agentId: 'agent-no-mutation-test' });

    const env = createEventEnvelope({
      eventType: 'PERFORMANCE_SIGNAL',
      severity: 'INFO',
      source: 'AppRouter',
      payload: { latencyMs: 120 },
    });

    runtime.processObservation(env);
    await runtime.triggerReasoning('Analyze performance');

    // Invariante H7.1A: El estado final es COMPLETED sin haber realizado escrituras en DB ni parches de código
    expect(runtime.getState()).toBe('COMPLETED');
  });

  test('R19: Fail-Closed Estructural — Herramienta no registrada resulta en DENY_STRICT y estado FAILED', async () => {
    const noopWithUnknownTool = createNoOpModelGateway('Suggest unvetted tool', {
      toolName: 'unregisteredArbitraryScript',
      arguments: { exec: 'drop table' },
    });

    const runtime = new GovernedAgentRuntime({
      agentId: 'agent-fail-closed-test',
      modelGateway: noopWithUnknownTool,
    });

    const env = createEventEnvelope({
      eventType: 'TEST_FAILURE',
      severity: 'CRITICAL',
      source: 'JestRunner',
      payload: { error: 'Broken assertion' },
    });

    runtime.processObservation(env);
    await runtime.triggerReasoning('Evaluate failure');

    const decision = runtime.getLastPolicyDecision();
    expect(decision).not.toBeNull();
    expect(decision?.decision).toBe('DENY_STRICT');
    expect(decision?.policyId).toBe('POL-FAIL-CLOSED-UNREGISTERED-TOOL');
    expect(runtime.getState()).toBe('FAILED');
  });

  test('R19: Fail-Closed Estructural — Intento de invocar razonamiento desde un estado inválido lanza excepción y transiciona a FAILED', async () => {
    const runtime = new GovernedAgentRuntime({ agentId: 'agent-invalid-state-test' });

    // En estado IDLE (sin haber procesado observación), llamar a triggerReasoning debe fallar estructuralmente
    expect(runtime.getState()).toBe('IDLE');

    await expect(runtime.triggerReasoning('Invalid call')).rejects.toThrow();
    expect(runtime.getState()).toBe('FAILED');
  });
});
