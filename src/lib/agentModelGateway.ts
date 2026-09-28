/**
 * Model Gateway: Provider-Agnostic Model Interface (Hito 7.1A v1.0)
 *
 * Naturaleza:
 * Abstracción agnóstica de proveedor para inferencia del modelo de lenguaje.
 *
 * Axioma de Gobierno:
 * H7.1A incluye NoOpModelGateway para permitir la ejecución y verificación determinística
 * del Agent Runtime sin depender de APIs o proveedores externos de IA.
 */

import {
  AgentModelGateway,
  AgentModelRequest,
  AgentModelResponse,
} from '@/types/agentRuntime';

/**
 * NoOpModelGateway — Proveedor Determinístico de Prueba
 * Retorna respuestas determinísticas sin realizar llamadas a red ni consumir tokens reales.
 */
export class NoOpModelGateway implements AgentModelGateway {
  readonly gatewayId: string = 'gateway-noop-default';
  readonly provider: 'DETERMINISTIC_NOOP' = 'DETERMINISTIC_NOOP';

  private defaultResponseContent: string;
  private suggestedAction?: { toolName: string; arguments: Record<string, unknown> };

  constructor(
    defaultResponseContent: string = 'NoOp Gateway Reasoning Completed.',
    suggestedAction?: { toolName: string; arguments: Record<string, unknown> }
  ) {
    this.defaultResponseContent = defaultResponseContent;
    this.suggestedAction = suggestedAction;
  }

  async generate(request: AgentModelRequest): Promise<AgentModelResponse> {
    const responseId = `resp-noop-${Date.now().toString(36)}`;

    return {
      responseId,
      modelName: 'noop-deterministic-v1',
      content: `${this.defaultResponseContent} [Echo prompt length: ${request.userPrompt.length}]`,
      finishReason: this.suggestedAction ? 'tool_call' : 'stop',
      tokenUsage: {
        promptTokens: request.userPrompt.length,
        completionTokens: this.defaultResponseContent.length,
        totalTokens: request.userPrompt.length + this.defaultResponseContent.length,
      },
      suggestedAction: this.suggestedAction,
    };
  }
}

/**
 * Factory para instanciar Model Gateways agnósticos
 */
export function createNoOpModelGateway(
  content?: string,
  suggestedAction?: { toolName: string; arguments: Record<string, unknown> }
): AgentModelGateway {
  return new NoOpModelGateway(content, suggestedAction);
}
