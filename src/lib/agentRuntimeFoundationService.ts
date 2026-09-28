/**
 * Service: Agent Runtime Foundation & Governed Cognitive Gateway (Hito 7.1A v1.0)
 *
 * Naturaleza:
 * Sistema Nervioso Central del Agente (Lifecycle, Context Manager, Policy Evaluator & Audit Supervisor).
 *
 * Axiomas de Gobierno:
 * 1. El Runtime controla 100% de las transiciones del Lifecycle. El LLM NO controla el estado.
 * 2. Inferencia agnóstica de proveedor vía ModelGateway (por defecto NoOpModelGateway).
 * 3. Policy Engine evalúa la política de seguridad FUERA del modelo.
 * 4. Audit Trail determinista en memoria, preparado para persistencia futura.
 * 5. Fail-Closed Estructural: Ante cualquier excepción o ambigüedad -> ESCALATED / FAILED.
 */

import {
  AgentLifecycleState,
  AgentModelGateway,
  AgentModelRequest,
  AgentModelResponse,
  AuditEventRecord,
  PolicyDecisionRecord,
  AgentRuntimeConfig,
} from '@/types/agentRuntime';
import { EventEnvelope } from '@/types/observabilityRuntime';
import { createNoOpModelGateway } from './agentModelGateway';
import { evaluateActionPolicy } from './agentPolicyEngine';
import { agentToolRegistry } from './agentToolRegistry';
import { getObservabilityBuffer } from './observabilityRuntimeService';

export class GovernedAgentRuntime {
  private agentId: string;
  private state: AgentLifecycleState = 'UNINITIALIZED';
  private modelGateway: AgentModelGateway;
  private auditTrailBuffer: AuditEventRecord[] = [];
  private activeContext: Record<string, unknown> = {};
  private currentObservation: EventEnvelope | null = null;
  private lastPolicyDecision: PolicyDecisionRecord | null = null;

  constructor(config: AgentRuntimeConfig) {
    this.agentId = config.agentId;
    this.modelGateway = config.modelGateway || createNoOpModelGateway();
    this.transitionState('UNINITIALIZED', config.initialState || 'IDLE', 'Runtime Instance Initialized');
  }

  /**
   * Transición determinística del Lifecycle controlada EXCLUSIVAMENTE por el Runtime
   */
  private transitionState(
    from: AgentLifecycleState,
    to: AgentLifecycleState,
    reason: string,
    details: Record<string, unknown> = {}
  ): void {
    const timestamp = new Date().toISOString();
    const auditId = `audit-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;

    this.state = to;

    const record: AuditEventRecord = {
      auditId,
      timestamp,
      eventType: 'STATE_TRANSITION',
      fromState: from,
      toState: to,
      actor: 'RUNTIME',
      details: {
        agentId: this.agentId,
        reason,
        ...details,
      },
    };

    this.auditTrailBuffer.push(record);
  }

  /**
   * Retorna el estado actual del Lifecycle
   */
  getState(): AgentLifecycleState {
    return this.state;
  }

  /**
   * Retorna la copia de auditoría del buffer del Supervisor
   */
  getAuditTrail(): readonly AuditEventRecord[] {
    return [...this.auditTrailBuffer];
  }

  /**
   * Retorna la última decisión tomada por el Policy Engine
   */
  getLastPolicyDecision(): PolicyDecisionRecord | null {
    return this.lastPolicyDecision;
  }

  /**
   * 1. OBSERVE: Procesa una observación (EventEnvelope H7.1)
   */
  processObservation(envelope: EventEnvelope): void {
    if (this.state !== 'IDLE' && this.state !== 'COMPLETED' && this.state !== 'FAILED') {
      throw new Error(`Cannot process observation in state '${this.state}'. Agent must be IDLE.`);
    }

    const prevState = this.state;
    this.currentObservation = envelope;
    this.transitionState(prevState, 'OBSERVING', 'Received H7.1 EventEnvelope Observation', {
      envelopeId: envelope.eventId,
      eventType: envelope.eventType,
    });

    this.assembleContext();
  }

  /**
   * 2. CONTEXTUALIZE: Ensambla el contexto operativo a partir de la observación y el buffer
   */
  private assembleContext(): void {
    this.transitionState('OBSERVING', 'CONTEXTUALIZING', 'Assembling operational context and OMA-01 analytics');

    const observabilityBuffer = getObservabilityBuffer();

    this.activeContext = {
      agentId: this.agentId,
      currentObservation: this.currentObservation,
      recentEventsCount: observabilityBuffer.length,
      assembledAt: new Date().toISOString(),
    };

    this.transitionState('CONTEXTUALIZING', 'REASONING', 'Context assembled successfully. Ready for inference.');
  }

  /**
   * 3. REASON: Invoca al ModelGateway agnóstico
   */
  async triggerReasoning(promptInstruction: string): Promise<AgentModelResponse> {
    if (this.state !== 'REASONING') {
      this.transitionState(this.state, 'FAILED', `Fail-Closed: Trigger reasoning called from invalid state '${this.state}'`);
      throw new Error(`Trigger reasoning called from invalid state '${this.state}'`);
    }

    try {
      const modelRequest: AgentModelRequest = {
        systemPrompt: 'You are MantenixAgent runtime in reasoning mode. Respond with observation context analysis.',
        userPrompt: promptInstruction,
        contextPayload: this.activeContext,
      };

      const response = await this.modelGateway.generate(modelRequest);

      this.transitionState('REASONING', 'PLANNING', 'Model inference completed. Transitioning to planning.', {
        responseId: response.responseId,
        finishReason: response.finishReason,
      });

      if (response.suggestedAction) {
        await this.handleSuggestedAction(response.suggestedAction);
      } else {
        this.transitionState('PLANNING', 'COMPLETED', 'Reasoning completed with no action suggested.');
      }

      return response;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.transitionState('REASONING', 'FAILED', `Fail-Closed: Model inference failed: ${errorMsg}`);
      throw err;
    }
  }

  /**
   * 4. REQUEST ACTION & POLICY CHECK: Solicita una acción y evalúa la política
   */
  async handleSuggestedAction(suggestedAction: { toolName: string; arguments: Record<string, unknown> }): Promise<PolicyDecisionRecord> {
    this.transitionState('PLANNING', 'REQUESTING_ACTION', `Suggested action requested: ${suggestedAction.toolName}`, {
      suggestedAction,
    });

    this.transitionState('REQUESTING_ACTION', 'POLICY_CHECK', `Evaluating Policy Engine for tool: ${suggestedAction.toolName}`);

    const toolDecl = agentToolRegistry.getTool(suggestedAction.toolName);

    const policyDecision = evaluateActionPolicy({
      toolDeclaration: toolDecl,
      proposedActionName: suggestedAction.toolName,
      arguments: suggestedAction.arguments,
      requestedByState: this.state,
    });

    this.lastPolicyDecision = policyDecision;

    if (policyDecision.decision === 'ALLOW_SANDBOX') {
      this.transitionState('POLICY_CHECK', 'COMPLETED', `Action ALLOW_SANDBOX by Policy Engine: ${policyDecision.reason}`);
    } else if (policyDecision.decision === 'ESCALATE_TO_HUMAN') {
      this.transitionState('POLICY_CHECK', 'ESCALATED', `Action ESCALATE_TO_HUMAN by Policy Engine: ${policyDecision.reason}`);
    } else {
      this.transitionState('POLICY_CHECK', 'FAILED', `Action DENY_STRICT by Policy Engine: ${policyDecision.reason}`);
    }

    return policyDecision;
  }

  /**
   * Resetea el agente a IDLE para procesar nuevas observaciones
   */
  resetToIdle(): void {
    const prevState = this.state;
    this.currentObservation = null;
    this.activeContext = {};
    this.lastPolicyDecision = null;
    this.transitionState(prevState, 'IDLE', 'Reset Agent Runtime to IDLE');
  }
}
