/**
 * Types & Canonical Contracts for Hito 7.1A: Agent Runtime Foundation & Governed Cognitive Gateway v1.0
 *
 * Axioma de Gobierno Cognitivo (H7.1A):
 * - El Lifecycle del Agente es 100% determinístico y controlado por el Runtime (el LLM NO controla el estado).
 * - La evaluación de políticas ocurre FUERA del LLM (PolicyEngine decide ALLOW_SANDBOX | ESCALATE_TO_HUMAN | DENY).
 * - Estructuralmente Fail-Closed: Ante ambigüedad o error -> NO_ACTION -> ESCALATE_TO_HUMAN.
 */

export type AgentLifecycleState =
  | 'UNINITIALIZED'
  | 'IDLE'
  | 'OBSERVING'
  | 'CONTEXTUALIZING'
  | 'REASONING'
  | 'PLANNING'
  | 'REQUESTING_ACTION'
  | 'POLICY_CHECK'
  | 'ESCALATED'
  | 'COMPLETED'
  | 'FAILED';

export type RiskClass = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ActionPolicyDecision =
  | 'ALLOW_SANDBOX'
  | 'ESCALATE_TO_HUMAN'
  | 'DENY_STRICT';

export interface PolicyDecisionRecord {
  decision: ActionPolicyDecision;
  policyId: string;
  reason: string;
  requiresHumanDecision: boolean;
  evaluatedAt: string;
}

export interface ToolDeclaration<TInput = unknown, TOutput = unknown> {
  toolName: string;
  description: string;
  scope: 'READ_ONLY' | 'WORKSPACE_SANDBOX' | 'CONTRACTUAL_WRITE' | 'INFRASTRUCTURE';
  riskClass: RiskClass;
  allowedLifecycleStates: AgentLifecycleState[];
  requiresHumanApproval: boolean;
  hasProductionSideEffects: boolean;
  validateInput?: (input: TInput) => boolean;
  execute?: (input: TInput) => Promise<TOutput>;
}

export interface AgentModelRequest {
  systemPrompt: string;
  userPrompt: string;
  contextPayload?: Record<string, unknown>;
  maxTokens?: number;
  temperature?: number;
}

export interface AgentModelResponse {
  responseId: string;
  modelName: string;
  content: string;
  finishReason: 'stop' | 'length' | 'tool_call' | 'error';
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  suggestedAction?: {
    toolName: string;
    arguments: Record<string, unknown>;
  };
}

export interface AgentModelGateway {
  gatewayId: string;
  provider: 'DETERMINISTIC_NOOP' | 'OLLAMA' | 'GEMINI' | 'ANTHROPIC' | 'OPENAI';
  generate(request: AgentModelRequest): Promise<AgentModelResponse>;
}

export interface AuditEventRecord {
  auditId: string;
  timestamp: string; // ISO 8601 UTC
  eventType: string;
  fromState: AgentLifecycleState;
  toState: AgentLifecycleState;
  actor: 'RUNTIME' | 'MODEL_GATEWAY' | 'POLICY_ENGINE' | 'TOOL_REGISTRY' | 'HUMAN';
  details: Record<string, unknown>;
}

export interface AgentRuntimeConfig {
  agentId: string;
  modelGateway?: AgentModelGateway;
  initialState?: AgentLifecycleState;
  failClosedDefault?: boolean;
}
