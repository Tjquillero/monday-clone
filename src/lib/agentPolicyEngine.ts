/**
 * Policy Engine: External Governed Policy Evaluator (Hito 7.1A v1.0)
 *
 * Axiomas de Gobierno:
 * 1. La evaluación de políticas de seguridad y riesgo se ejecuta 100% FUERA del LLM.
 * 2. El modelo solicita la acción; el Policy Engine decide (ALLOW_SANDBOX | ESCALATE_TO_HUMAN | DENY_STRICT).
 * 3. Fail-Closed Estructural: Ante cualquier ambigüedad, falta de datos o riesgo no clasificado -> ESCALATE_TO_HUMAN.
 * 4. Las mutaciones contractuales, financieras, de base de datos o DDL resultan en DENY_STRICT o ESCALATE_TO_HUMAN.
 */

import {
  ActionPolicyDecision,
  PolicyDecisionRecord,
  RiskClass,
  ToolDeclaration,
} from '@/types/agentRuntime';

export interface EvaluatePolicyParams {
  toolDeclaration?: ToolDeclaration | null;
  proposedActionName: string;
  arguments?: Record<string, unknown>;
  requestedByState: string;
}

/**
 * Evalúa la política de seguridad para una solicitud de acción del agente.
 * Implementa Fail-Closed estructural.
 */
export function evaluateActionPolicy(
  params: EvaluatePolicyParams
): PolicyDecisionRecord {
  const evaluatedAt = new Date().toISOString();
  const tool = params.toolDeclaration;

  // 1. Fail-Closed: Si la herramienta no existe en el Tool Registry
  if (!tool) {
    return {
      decision: 'DENY_STRICT',
      policyId: 'POL-FAIL-CLOSED-UNREGISTERED-TOOL',
      reason: `Tool '${params.proposedActionName}' is not registered in the ToolRegistry. Action denied structurally.`,
      requiresHumanDecision: false,
      evaluatedAt,
    };
  }

  // 2. Denegación Estricta: Mutaciones de Base de Datos, DDL o Producción
  if (tool.scope === 'INFRASTRUCTURE' || tool.hasProductionSideEffects) {
    return {
      decision: 'DENY_STRICT',
      policyId: 'POL-STRICT-PROHIBITION-INFRASTRUCTURE',
      reason: `Tool '${tool.toolName}' involves infrastructure or direct production side-effects. Prohibited by Constitutional Gate H7.0/H7.1A.`,
      requiresHumanDecision: false,
      evaluatedAt,
    };
  }

  // 3. Escalación a Humano: Escrituras Contractuales o Acciones de Riesgo Alto/Crítico (Clase B)
  if (
    tool.scope === 'CONTRACTUAL_WRITE' ||
    tool.riskClass === 'HIGH' ||
    tool.riskClass === 'CRITICAL' ||
    tool.requiresHumanApproval
  ) {
    return {
      decision: 'ESCALATE_TO_HUMAN',
      policyId: 'POL-CLASS-B-GOVERNED-HUMAN-APPROVAL',
      reason: `Tool '${tool.toolName}' belongs to Class B (Contractual/High Risk). Requires explicit human approval signature.`,
      requiresHumanDecision: true,
      evaluatedAt,
    };
  }

  // 4. Aprobación en Sandbox: Herramientas de lectura o Workspace local de Riesgo Bajo/Medio (Clase A)
  if (tool.scope === 'READ_ONLY' || tool.scope === 'WORKSPACE_SANDBOX') {
    return {
      decision: 'ALLOW_SANDBOX',
      policyId: 'POL-CLASS-A-WORKSPACE-SANDBOX',
      reason: `Tool '${tool.toolName}' belongs to Class A (Workspace Sandbox / Read Only). Permitted for local execution.`,
      requiresHumanDecision: false,
      evaluatedAt,
    };
  }

  // 5. Fallback por defecto Fail-Closed (Ambigüedad)
  return {
    decision: 'ESCALATE_TO_HUMAN',
    policyId: 'POL-FAIL-CLOSED-DEFAULT-FALLBACK',
    reason: `Tool '${tool.toolName}' policy evaluation returned unknown criteria. Escalated structurally to human supervisor.`,
    requiresHumanDecision: true,
    evaluatedAt,
  };
}
