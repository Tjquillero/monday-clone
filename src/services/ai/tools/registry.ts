import type { AiToolDefinition } from './types';
import { getCurrentBoardTool } from './getCurrentBoard';
import { getActaTotalsTool } from './getActaTotals';
import { getPendingBillableWorkTool } from './getPendingBillableWork';
import { getBoardSummaryTool } from './getBoardSummary';
import { getDelayedWeeklyPlansTool } from './getDelayedWeeklyPlans';
import { getExecutionSummaryTool } from './getExecutionSummary';
import { getPoaVersionDiffTool } from './getPoaVersionDiff';
import { getExecutionsWithoutEvidenceTool } from './getExecutionsWithoutEvidence';
import { evaluateExecutionEvidenceTool } from './evaluateExecutionEvidence';
import { compareBeforeAfterEvidenceTool } from './compareBeforeAfterEvidence';
import { getDuplicateAttachmentsTool } from './getDuplicateAttachments';
import { findPossibleVisualDuplicatesTool } from './findPossibleVisualDuplicates';

// La whitelist. Si un tool no está aquí, el modelo no puede usarlo — el
// Orchestrator valida el nombre contra este registro independientemente de
// lo que Gemini "prometa" respetar de las tools declaradas (defensa en
// profundidad, no solo confiar en la declaración enviada al modelo).
//
// Hito 0 (infraestructura): get_current_board, sin valor de negocio.
// Hito 1+2: get_acta_totals, get_pending_billable_work (vía DomainTools).
// Catálogo mínimo (prioridad del usuario): get_board_summary (punto de
//   entrada), get_delayed_weekly_plans (lo más preguntado operativamente),
//   get_execution_summary (estado de certificaciones).
export const AI_TOOL_REGISTRY: Record<string, AiToolDefinition> = {
  [getCurrentBoardTool.name]: getCurrentBoardTool,
  [getActaTotalsTool.name]: getActaTotalsTool,
  [getPendingBillableWorkTool.name]: getPendingBillableWorkTool,
  [getBoardSummaryTool.name]: getBoardSummaryTool,
  [getDelayedWeeklyPlansTool.name]: getDelayedWeeklyPlansTool,
  [getExecutionSummaryTool.name]: getExecutionSummaryTool,
  [getPoaVersionDiffTool.name]: getPoaVersionDiffTool,
  [getExecutionsWithoutEvidenceTool.name]: getExecutionsWithoutEvidenceTool,
  [evaluateExecutionEvidenceTool.name]: evaluateExecutionEvidenceTool,
  [compareBeforeAfterEvidenceTool.name]: compareBeforeAfterEvidenceTool,
  [getDuplicateAttachmentsTool.name]: getDuplicateAttachmentsTool,
  [findPossibleVisualDuplicatesTool.name]: findPossibleVisualDuplicatesTool,
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
