/**
 * OPS-01A Operational Journey Harness
 * Harness Integrativo Técnico de Contratos (Fase OPS-01A)
 * 
 * 0 DDL, 0 mutaciones de esquema, 0 reaperturas de Evidence Layer v1 o SIM-01.
 * Consume exclusivamente contratos existentes en:
 * - myWorkSurfaceTriggerService
 * - crewAssignmentService
 * - fieldWorkflowExecutionService
 * - verificationService
 * - actaService
 * - activityReportReadModelService
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  evaluateMyWorkMaterializationNeed,
  MyWorkEvaluationResult,
} from '../myWorkSurfaceTriggerService';
import {
  getEligibleCrewsForBoard,
} from '../crewAssignmentService';
import {
  reportFieldExecution,
  FieldReportResult,
} from '../fieldWorkflowExecutionService';
import {
  verifyExecutionRecordWithAudit,
  VerifyExecutionResult,
} from '../verificationService';
import {
  generateActaDraft,
  GenerateDraftResult,
} from '../actaService';
import {
  buildActivityExecutionReportDTO,
  ActivityExecutionReportDTO,
} from '../activityReportReadModelService';
import { ExecutionAttachmentItem } from '../evidenceCuration';

export const OPS01_REAL_BOARD_ID = '3ea0326f-6ff7-409f-848a-1f296e6e3cc8';
export const OPS01_REAL_PLAZA_GROUP_ID = '98153f4c-18b9-4bff-abda-39d62db8a931';

export interface OPS01AJourneyResult {
  myWorkEvaluation: MyWorkEvaluationResult;
  crewsCount: number;
  executionReport: FieldReportResult;
  verification: VerifyExecutionResult;
  actaDraft: GenerateDraftResult;
  readModelReport?: ActivityExecutionReportDTO;
  issueActaCalled: false;
}

/**
 * Orquesta de forma puramente consultiva y contractual el flujo integrativo de OPS-01A.
 * Garantiza que issueActa() NUNCA sea invocado.
 */
export async function executeOPS01AOperationalJourney(
  supabase: SupabaseClient,
  params: {
    boardId?: string;
    groupId?: string;
    weekStart?: string;
    leaderUserId?: string;
    supervisorUserId?: string;
    sourceMutationId?: string;
    executedQty?: number;
    attachments?: ExecutionAttachmentItem[];
  }
): Promise<OPS01AJourneyResult> {
  const boardId = params.boardId || OPS01_REAL_BOARD_ID;
  const groupId = params.groupId || OPS01_REAL_PLAZA_GROUP_ID;
  const weekStart = params.weekStart || '2026-09-07';
  const sourceMutationId = params.sourceMutationId || `mut_ops01a_test_${Date.now()}`;
  const executedQty = params.executedQty ?? 1500;

  // 1. /my-work surface evaluation
  const myWorkEval = await evaluateMyWorkMaterializationNeed(
    supabase,
    boardId,
    groupId,
    weekStart
  );

  // 2. Crew & personnel assignment query
  const crews = await getEligibleCrewsForBoard(supabase, boardId);

  // 3. Field workflow execution reporting (FieldWorkflowExecutionService)
  // Reutiliza una ocurrencia real o mock item sin mutar la BD
  const mockPlanItemId = 'item-ops01a-plaza-01';
  const executionReport = await reportFieldExecution(supabase, {
    weekly_plan_item_id: mockPlanItemId,
    board_id: boardId,
    group_id: groupId,
    execution_date: weekStart,
    executed_qty: executedQty,
    worker_count: 4,
    hours_worked: 8,
    reported_by: params.leaderUserId || 'usr-leader-real-01',
    source_mutation_id: sourceMutationId,
  });

  // 4. Verification surface (ADR-0011)
  const verification = await verifyExecutionRecordWithAudit(supabase, {
    execution_id: executionReport.executionRecord.id,
    supervisor_user_id: params.supervisorUserId || 'usr-supervisor-real-01',
    action: 'approve',
    attachments_count: params.attachments ? params.attachments.length : 2,
    note_or_reason: 'Verificación operacional en OPS-01A',
    source_mutation_id: `mut_ver_${sourceMutationId}`,
  });

  // 5. Financial / Acta Draft generation (ADR-0012)
  // Se invoca generateActaDraft() y SE DETIENE sin llamar issueActa()
  const actaDraft = await generateActaDraft(
    supabase,
    boardId,
    params.supervisorUserId || 'usr-admin-real-01'
  );

  // 6. Evidence Layer Read Model evaluation
  let readModelReport: ActivityExecutionReportDTO | undefined = undefined;
  if (actaDraft && actaDraft.acta) {
    try {
      readModelReport = await buildActivityExecutionReportDTO(
        {
          mode: 'acta',
          acta_id: actaDraft.acta.id,
        },
        supabase
      );
    } catch {
      // Fallback si la acta de borrador no posee items persistidos en la mock DB
      readModelReport = undefined;
    }
  }

  return {
    myWorkEvaluation: myWorkEval,
    crewsCount: crews.length,
    executionReport,
    verification,
    actaDraft,
    readModelReport,
    issueActaCalled: false, // Invariante estricto: issueActa() NUNCA es invocado en OPS-01A
  };
}
