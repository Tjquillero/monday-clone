import type { AiToolDefinition } from './types';
import { getCurrentBoardTool } from './getCurrentBoard';

// La whitelist. Si un tool no está aquí, el modelo no puede usarlo — el
// Orchestrator valida el nombre contra este registro independientemente de
// lo que Gemini "prometa" respetar de las tools declaradas (defensa en
// profundidad, no solo confiar en la declaración enviada al modelo).
//
// Hito 0 (infraestructura): solo get_current_board, sin valor de negocio.
// Hito 1 agrega get_acta_totals (adaptador directo de compute_acta_totals()).
// Hito 2 agrega el primer tool "inteligente" (saldo facturable pendiente).
export const AI_TOOL_REGISTRY: Record<string, AiToolDefinition> = {
  [getCurrentBoardTool.name]: getCurrentBoardTool,
};

export function getToolDefinition(name: string): AiToolDefinition | undefined {
  return AI_TOOL_REGISTRY[name];
}

export function listToolDeclarations() {
  return Object.values(AI_TOOL_REGISTRY).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: tool.parametersJsonSchema,
  }));
}
