import type { AiToolDefinition } from './types';
import { getCurrentBoardTool } from './getCurrentBoard';
import { getActaTotalsTool } from './getActaTotals';
import { getPendingBillableWorkTool } from './getPendingBillableWork';

// La whitelist. Si un tool no está aquí, el modelo no puede usarlo — el
// Orchestrator valida el nombre contra este registro independientemente de
// lo que Gemini "prometa" respetar de las tools declaradas (defensa en
// profundidad, no solo confiar en la declaración enviada al modelo).
//
// Hito 0 (infraestructura): get_current_board, sin valor de negocio.
// Hito 1: get_acta_totals (adaptador de compute_acta_totals(), vía DomainTools).
// Hito 2: get_pending_billable_work (primer tool "inteligente" — extrae la
//   elegibilidad ya probada de generate_acta_draft(), vía DomainTools).
export const AI_TOOL_REGISTRY: Record<string, AiToolDefinition> = {
  [getCurrentBoardTool.name]: getCurrentBoardTool,
  [getActaTotalsTool.name]: getActaTotalsTool,
  [getPendingBillableWorkTool.name]: getPendingBillableWorkTool,
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
