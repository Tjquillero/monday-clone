/**
 * Service: Seguimiento y Ejecución de Campo (Fase 5.3)
 * Baseline Entrada: 104 suites / 794 tests / TS 0 errores (F5.2 FROZEN)
 * 
 * Invariantes Contractuales F5.3:
 * - F5.3-INV-01: Soberanía del registro físico (executed_qty_reported jamás es recortado en origen).
 * - F5.3-INV-02: Invarianza total de planificación (planned_qty, planned_jr, theoretical_jr, planned_date inalterados).
 * - F5.3-INV-03: Separación de autoridad operacional (solo supervisor/coordinator/admin pueden transicionar a verified o rejected).
 * - F5.3-INV-04: Inmutabilidad de estados protegidos (confirmed, closed) y Actas emitidas (ADR-0012).
 * - F5.3-INV-05: Idempotencia resiliente con source_mutation_id (0 duplicados en reintentos/offline).
 * - F5.3-INV-06: Compuerta determinista de evidencia (fotos obligatorias faltantes transicionan a evidence_pending).
 * - F5.3-INV-07: Trazabilidad inmutable de cuadrilla (crew_id_snapshot congelado en el registro).
 * - F5.3-INV-08: Aislamiento total del Solver H8 (🔴 STRICTLY NO-GO).
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  ExecutionRecord,
  ExecutionReportInput,
  ExecutionMetrics,
  calculateExecutionMetrics,
  VerificationStatus,
} from '../types/execution';
import { WeeklyPlanItem } from '../types/weeklyPlan';

export interface FieldReportResult {
  executionRecord: ExecutionRecord;
  parentItem: WeeklyPlanItem;
  metrics: ExecutionMetrics;
  isIdempotentReplay: boolean;
}

export interface FieldVerificationInput {
  executionId: string;
  supervisorUserId: string;
  boardId: string;
  attachmentsCount?: number;
  requiredAttachmentsCount?: number;
  noteOrReason?: string;
  expectedCurrentStatus?: VerificationStatus | VerificationStatus[];
  sourceMutationId?: string;
}

export interface FieldRejectionInput {
  executionId: string;
  supervisorUserId: string;
  boardId: string;
  rejectionReason: string;
  expectedCurrentStatus?: VerificationStatus | VerificationStatus[];
  sourceMutationId?: string;
}

export interface FieldEvidenceAttachmentInput {
  executionId: string;
  boardId: string;
  userId: string;
  storagePath: string;
  fileType?: string;
  phase?: 'before' | 'during' | 'after';
  metadata?: Record<string, any>;
}

export interface FieldVerificationResult {
  updatedExecution: ExecutionRecord;
  parentItem: WeeklyPlanItem;
  metrics: ExecutionMetrics;
  statusChanged: boolean;
}

/**
 * Valida los permisos de usuario sobre el board_id consumiendo user_board_roles o board_members.
 */
async function validateUserRole(
  supabase: SupabaseClient,
  userId: string,
  boardId: string,
  allowedRoles: string[]
): Promise<string> {
  // 1. Intentar consultar user_board_roles (M5)
  const { data: rolesData, error: rolesErr } = await supabase
    .from('user_board_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('board_id', boardId);

  if (!rolesErr && rolesData && rolesData.length > 0) {
    const userRole = rolesData[0].role;
    if (allowedRoles.includes(userRole.toLowerCase())) {
      return userRole;
    }
    throw new Error(`[F5.3 RBAC Error] [UNAUTHORIZED_ROLE]: El rol '${userRole}' no tiene autorización para esta operación. Roles requeridos: ${allowedRoles.join(', ')}`);
  }

  // 2. Fallback a board_members (Núcleo canónico)
  const { data: memberData, error: memberErr } = await supabase
    .from('board_members')
    .select('role')
    .eq('user_id', userId)
    .eq('board_id', boardId);

  if (!memberErr && memberData && memberData.length > 0) {
    const userRole = memberData[0].role;
    // Mapeo canónico: leader, supervisor, admin, assistant, viewer
    const normalized = userRole.toLowerCase();
    const isAllowed = allowedRoles.some(r => r.toLowerCase() === normalized) ||
                      (normalized === 'leader' && allowedRoles.includes('crew_leader')) ||
                      (normalized === 'assistant' && allowedRoles.includes('coordinator'));
    if (isAllowed) {
      return userRole;
    }
    throw new Error(`[F5.3 RBAC Error] [UNAUTHORIZED_ROLE]: El rol '${userRole}' no tiene autorización para esta operación. Roles requeridos: ${allowedRoles.join(', ')}`);
  }

  throw new Error(`[F5.3 RBAC Error] [UNAUTHORIZED_USER]: El usuario ${userId} no tiene roles asignados en el tablero ${boardId}`);
}

/**
 * Registra un reporte de avance físico de campo en weekly_plan_item_executions.
 * Garantiza idempotencia con source_mutation_id y captura crew_id_snapshot.
 */
export async function reportFieldExecution(
  supabase: SupabaseClient,
  input: ExecutionReportInput
): Promise<FieldReportResult> {
  const {
    weekly_plan_item_id,
    board_id,
    group_id,
    execution_date,
    executed_qty,
    worker_count = 1,
    hours_worked = 8,
    reported_by,
    source_mutation_id,
  } = input;

  // 1. RBAC: Validar que el usuario que reporta tiene rol permitido en el tablero
  if (reported_by) {
    await validateUserRole(supabase, reported_by, board_id, [
      'worker',
      'crew_leader',
      'supervisor',
      'coordinator',
      'admin',
    ]);
  }

  // 1.1 Validar recursos operativos RCO si están presentes (POD-01 / ADR-0014)
  if (input.used_resources && input.used_resources.length > 0) {
    const { validateOperationalResourceItem } = await import('./resourceConsumptionControlService');
    for (const item of input.used_resources) {
      try {
        validateOperationalResourceItem(item);
      } catch (err: any) {
        throw new Error(`[F5.3 RCO Error] [INVALID_OPERATIONAL_RESOURCE]: ${err.message}`);
      }
    }
  }

  // 2. F5.3-INV-05: Idempotencia con source_mutation_id (Pre-check)
  if (source_mutation_id) {
    const { data: existingExec } = await supabase
      .from('weekly_plan_item_executions')
      .select('*')
      .eq('source_mutation_id', source_mutation_id)
      .maybeSingle();

    if (existingExec) {
      // Reintento / replay idempotente: Retornar registro existente sin reinsertar
      const { data: itemData } = await supabase
        .from('weekly_plan_items')
        .select('*')
        .eq('id', weekly_plan_item_id)
        .single();

      let allExecs: any[] = [];
      const { data: byPlanId } = await supabase
        .from('weekly_plan_item_executions')
        .select('*')
        .eq('plan_item_id', weekly_plan_item_id);

      if (byPlanId && byPlanId.length > 0) {
        allExecs = byPlanId;
      } else {
        const { data: byWeeklyPlanId } = await supabase
          .from('weekly_plan_item_executions')
          .select('*')
          .eq('weekly_plan_item_id', weekly_plan_item_id);
        allExecs = byWeeklyPlanId || [];
      }

      const parentItem = itemData as WeeklyPlanItem;
      const metrics = calculateExecutionMetrics(parentItem.planned_qty, allExecs as ExecutionRecord[]);

      return {
        executionRecord: existingExec as ExecutionRecord,
        parentItem,
        metrics,
        isIdempotentReplay: true,
      };
    }
  }

  // 3. Obtener y validar el ítem padre en weekly_plan_items
  const { data: parentItemData, error: itemErr } = await supabase
    .from('weekly_plan_items')
    .select('*')
    .eq('id', weekly_plan_item_id)
    .single();

  if (itemErr || !parentItemData) {
    throw new Error(`[F5.3 Error] [ITEM_NOT_FOUND]: No se encontró la ocurrencia planificada ${weekly_plan_item_id}`);
  }

  const parentItem = parentItemData as WeeklyPlanItem;

  // Protección de ítem cancelado
  if (parentItem.status === 'cancelled') {
    throw new Error('[F5.3 Error] [ITEM_CANCELLED_LOCKED]: No se puede reportar ejecución sobre una ocurrencia cancelada.');
  }

  // Protección de Acta emitida aguas abajo (ADR-0012)
  const { data: actaItems } = await supabase
    .from('acta_items')
    .select('id, acta:actas(status)')
    .eq('plan_item_id', weekly_plan_item_id);

  const isLockedInActa = (actaItems || []).some(
    (ai: any) =>
      ai.acta &&
      (ai.acta.status === 'issued' || ai.acta.status === 'approved' || ai.acta.status === 'paid')
  );

  if (isLockedInActa) {
    throw new Error('[F5.3 Error] [ACTA_ISSUED_LOCKED]: No se puede reportar ejecución porque la ocurrencia está liquidada en un Acta emitida.');
  }

  // 4. F5.3-INV-07: Snapshot inmutable de cuadrilla reportante
  const crewIdSnapshot = input.crew_id_snapshot || parentItem.crew_id || null;

  // 5. Cálculo operativo de jornales y timestamps
  const jornalesUsed = (worker_count * hours_worked) / 8.0;
  const startedAt = `${execution_date}T08:00:00.000Z`;
  const durationHours = Math.max(1, Math.min(16, Math.round(hours_worked)));
  const finishedHour = Math.min(23, 8 + durationHours);
  const finishedAt = `${execution_date}T${String(finishedHour).padStart(2, '0')}:00:00.000Z`;

  // 6. Insertar registro físico en public.weekly_plan_item_executions (POD-01 / C2 Concurrency Safety)
  const execPayload: Record<string, any> = {
    plan_item_id: weekly_plan_item_id,
    weekly_plan_item_id,
    board_id,
    group_id: group_id || parentItem.group_id || null,
    execution_date,
    executed_qty,
    worker_count,
    hours_worked,
    started_at: startedAt,
    finished_at: finishedAt,
    status: input.verification_status || 'reported',
    created_by: reported_by || null,
    jornales_used: jornalesUsed,
    reported_by,
    source_mutation_id: source_mutation_id || `mut_rep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    crew_id_snapshot: crewIdSnapshot,
    verification_status: input.verification_status || 'reported',
    used_resources: input.used_resources || [],
  };

  let insertedExec: any = null;
  let execErr: any = null;

  const res1 = await supabase
    .from('weekly_plan_item_executions')
    .insert(execPayload)
    .select('*')
    .single();

  insertedExec = res1.data;
  execErr = res1.error;

  // Fallback para esquemas físicos de PostgreSQL que no tengan columnas virtuales/denormalizadas
  if (execErr && execErr.message?.includes('schema cache') && execErr.message?.includes('column')) {
    const physicalPayload: Record<string, any> = {
      plan_item_id: weekly_plan_item_id,
      execution_date,
      executed_qty,
      worker_count,
      started_at: startedAt,
      finished_at: finishedAt,
      status: input.verification_status || 'reported',
      created_by: reported_by || null,
      source_mutation_id: execPayload.source_mutation_id,
      used_resources: input.used_resources || [],
    };

    const res2 = await supabase
      .from('weekly_plan_item_executions')
      .insert(physicalPayload)
      .select('*')
      .single();

    insertedExec = res2.data;
    execErr = res2.error;
  }

  // C2: Manejo de condición de carrera con UNIQUE constraint (uq_wpie_source_mutation_id)
  if (execErr) {
    if (source_mutation_id && (execErr.code === '23505' || execErr.message?.includes('duplicate key') || execErr.message?.includes('unique constraint') || execErr.message?.includes('uq_wpie_source_mutation_id'))) {
      const { data: raceExec } = await supabase
        .from('weekly_plan_item_executions')
        .select('*')
        .eq('source_mutation_id', source_mutation_id)
        .single();

      if (raceExec) {
        let allExecs: any[] = [];
        const { data: byPlanId } = await supabase
          .from('weekly_plan_item_executions')
          .select('*')
          .eq('plan_item_id', weekly_plan_item_id);

        if (byPlanId && byPlanId.length > 0) {
          allExecs = byPlanId;
        } else {
          const { data: byWeeklyPlanId } = await supabase
            .from('weekly_plan_item_executions')
            .select('*')
            .eq('weekly_plan_item_id', weekly_plan_item_id);
          allExecs = byWeeklyPlanId || [];
        }

        const metrics = calculateExecutionMetrics(parentItem.planned_qty, allExecs as ExecutionRecord[]);

        return {
          executionRecord: raceExec as ExecutionRecord,
          parentItem,
          metrics,
          isIdempotentReplay: true,
        };
      }
    }
    throw new Error(`[F5.3 Error] [INSERT_FAILED]: Error al insertar reporte de ejecución: ${execErr.message}`);
  }

  const executionRecord = insertedExec as ExecutionRecord;

  // 7. Actualizar estado del ítem padre según continuation_decision
  const targetStatus = input.continuation_decision === 'TERMINADA_HOY'
    ? 'completed'
    : (parentItem.status === 'planned' ? 'in_progress' : parentItem.status);

  if (targetStatus !== parentItem.status) {
    const { data: updatedItem } = await supabase
      .from('weekly_plan_items')
      .update({
        status: targetStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', parentItem.id)
      .select('*')
      .single();

    if (updatedItem) {
      Object.assign(parentItem, updatedItem);
    }
  }

  // 8. Calcular métricas agregadas
  let allExecsData: any[] = [];
  const { data: byPlanId } = await supabase
    .from('weekly_plan_item_executions')
    .select('*')
    .eq('plan_item_id', weekly_plan_item_id);

  if (byPlanId && byPlanId.length > 0) {
    allExecsData = byPlanId;
  } else {
    const { data: byWeeklyPlanId } = await supabase
      .from('weekly_plan_item_executions')
      .select('*')
      .eq('weekly_plan_item_id', weekly_plan_item_id);
    allExecsData = byWeeklyPlanId || [];
  }

  const metrics = calculateExecutionMetrics(parentItem.planned_qty, allExecsData as ExecutionRecord[]);

  return {
    executionRecord,
    parentItem,
    metrics,
    isIdempotentReplay: false,
  };
}

/**
 * Adjunta una evidencia fotográfica y, si la ejecución estaba en evidence_pending,
 * la retorna al estado reported para revisión de supervisión.
 */
export async function attachFieldEvidence(
  supabase: SupabaseClient,
  input: FieldEvidenceAttachmentInput
): Promise<{ attachmentId: string; executionUpdated: boolean }> {
  const { executionId, boardId, userId, storagePath, fileType, phase = 'after', metadata = {} } = input;

  await validateUserRole(supabase, userId, boardId, [
    'worker',
    'crew_leader',
    'supervisor',
    'coordinator',
    'admin',
  ]);

  // 1. Insertar adjunto respetando el schema canónico de PostgreSQL
  const fileName = storagePath.split('/').pop() || 'photo.jpg';
  let publicUrl = storagePath;
  try {
    const { data } = supabase.storage.from('attachments').getPublicUrl(storagePath);
    if (data?.publicUrl) publicUrl = data.publicUrl;
  } catch {}

  const attachmentPayload = {
    execution_id: executionId,
    file_name: fileName,
    file_url: publicUrl,
    file_type: fileType || 'image/jpeg',
    uploaded_by: userId,
    phase,
  };

  const { data: attData, error: attErr } = await supabase
    .from('execution_attachments')
    .insert(attachmentPayload)
    .select('id')
    .single();

  if (attErr) {
    throw new Error(`[F5.3 Error] [ATTACHMENT_FAILED]: No se pudo guardar la evidencia: ${attErr.message}`);
  }

  // 2. Subsanación: Si el registro estaba en evidence_pending, retornar a reported
  const { data: execData } = await supabase
    .from('weekly_plan_item_executions')
    .select('verification_status')
    .eq('id', executionId)
    .single();

  let executionUpdated = false;
  if (execData?.verification_status === 'evidence_pending') {
    await supabase
      .from('weekly_plan_item_executions')
      .update({
        verification_status: 'reported',
        verification_note: 'Evidencia adjuntada por operario/líder. Lista para verificación.',
        updated_at: new Date().toISOString(),
      })
      .eq('id', executionId);
    executionUpdated = true;
  }

  return {
    attachmentId: attData?.id || '',
    executionUpdated,
  };
}

/**
 * Acción de supervisión técnica: Verifica y aprueba formalmente un reporte de ejecución.
 * Aplica compuerta de evidencia, optimismo concurrente y recalcula métricas.
 */
export async function verifyFieldExecution(
  supabase: SupabaseClient,
  input: FieldVerificationInput
): Promise<FieldVerificationResult> {
  const {
    executionId,
    supervisorUserId,
    boardId,
    attachmentsCount = 0,
    requiredAttachmentsCount = 0,
    noteOrReason,
    expectedCurrentStatus = ['reported', 'evidence_pending'],
  } = input;

  // 1. RBAC: Estrictamente roles de supervisión (prohibido para worker / crew_leader)
  await validateUserRole(supabase, supervisorUserId, boardId, ['supervisor', 'coordinator', 'admin']);

  // 2. Obtener registro objetivo
  const { data: execData, error: fetchErr } = await supabase
    .from('weekly_plan_item_executions')
    .select('*')
    .eq('id', executionId)
    .single();

  if (fetchErr || !execData) {
    throw new Error(`[F5.3 Error] [EXECUTION_NOT_FOUND]: Reporte de ejecución ${executionId} no encontrado.`);
  }

  const execution = execData as ExecutionRecord;

  // Protección de estados terminales / inmutables
  if (execution.verification_status === 'confirmed' || execution.verification_status === 'closed') {
    throw new Error(`[F5.3 Error] [STATE_IMMUTABLE]: No se puede modificar una ejecución en estado inmutable: ${execution.verification_status}`);
  }

  // 3. F5.3-INV-06: Compuerta de evidencia
  const requiresPhotos = requiredAttachmentsCount > 0;
  const isEvidenceMissing = requiresPhotos && attachmentsCount === 0;

  const targetStatus: VerificationStatus = isEvidenceMissing ? 'evidence_pending' : 'verified';
  const nowStr = new Date().toISOString();

  const updatePayload: any = {
    verification_status: targetStatus,
    updated_at: nowStr,
  };

  if (targetStatus === 'verified') {
    updatePayload.verified_by = supervisorUserId;
    updatePayload.verified_at = nowStr;
    updatePayload.verification_note = noteOrReason || null;
  } else {
    updatePayload.verification_note = noteOrReason || 'Compuerta de evidencia: Se requiere fotografía de soporte antes de verificar.';
  }

  // 4. Concurrencia Optimista: Guard de estado previo
  const allowedPrev = Array.isArray(expectedCurrentStatus) ? expectedCurrentStatus : [expectedCurrentStatus];
  
  if (!allowedPrev.includes(execution.verification_status)) {
    throw new Error(`[F5.3 Error] [STATE_TRANSITION_CONFLICT]: Conflicto de concurrencia. El estado actual '${execution.verification_status}' no coincide con el estado esperado.`);
  }

  let updateQuery = supabase
    .from('weekly_plan_item_executions')
    .update(updatePayload)
    .eq('id', executionId);

  // Filtro de condición concurrente
  if (Array.isArray(expectedCurrentStatus)) {
    updateQuery = updateQuery.in('verification_status', expectedCurrentStatus);
  } else {
    updateQuery = updateQuery.eq('verification_status', expectedCurrentStatus);
  }

  const { data: updatedRows, error: updateErr } = await updateQuery.select('*');

  if (updateErr || !updatedRows || updatedRows.length === 0) {
    throw new Error('[F5.3 Error] [STATE_TRANSITION_CONFLICT]: No se pudo actualizar el registro debido a una mutación concurrente.');
  }

  const updatedExecution = updatedRows[0] as ExecutionRecord;

  // 5. Recalcular métricas y transición automática a 'completed' si aplica
  const { data: parentItemData } = await supabase
    .from('weekly_plan_items')
    .select('*')
    .eq('id', execution.weekly_plan_item_id)
    .single();

  const parentItem = parentItemData as WeeklyPlanItem;

  const { data: allExecs } = await supabase
    .from('weekly_plan_item_executions')
    .select('*')
    .eq('weekly_plan_item_id', parentItem.id);

  const metrics = calculateExecutionMetrics(parentItem.planned_qty, (allExecs || []) as ExecutionRecord[]);

  if (metrics.isCompleted && parentItem.status === 'in_progress') {
    const { data: completedItem } = await supabase
      .from('weekly_plan_items')
      .update({
        status: 'completed',
        updated_at: nowStr,
      })
      .eq('id', parentItem.id)
      .select('*')
      .single();

    if (completedItem) {
      Object.assign(parentItem, completedItem);
    }
  }

  return {
    updatedExecution,
    parentItem,
    metrics,
    statusChanged: updatedExecution.verification_status !== execution.verification_status,
  };
}

/**
 * Acción de supervisión técnica: Rechaza formalmente un reporte de ejecución.
 * Exige rejectionReason obligatorio y marca la fila como rechazada terminal.
 */
export async function rejectFieldExecution(
  supabase: SupabaseClient,
  input: FieldRejectionInput
): Promise<FieldVerificationResult> {
  const {
    executionId,
    supervisorUserId,
    boardId,
    rejectionReason,
    expectedCurrentStatus = ['reported', 'evidence_pending'],
  } = input;

  if (!rejectionReason || rejectionReason.trim().length === 0) {
    throw new Error('[F5.3 Error] [REJECTION_REASON_REQUIRED]: Debe especificar un motivo formal para rechazar la ejecución.');
  }

  await validateUserRole(supabase, supervisorUserId, boardId, ['supervisor', 'coordinator', 'admin']);

  const { data: execData, error: fetchErr } = await supabase
    .from('weekly_plan_item_executions')
    .select('*')
    .eq('id', executionId)
    .single();

  if (fetchErr || !execData) {
    throw new Error(`[F5.3 Error] [EXECUTION_NOT_FOUND]: Reporte de ejecución ${executionId} no encontrado.`);
  }

  const execution = execData as ExecutionRecord;

  if (execution.verification_status === 'confirmed' || execution.verification_status === 'closed') {
    throw new Error(`[F5.3 Error] [STATE_IMMUTABLE]: No se puede rechazar una ejecución en estado inmutable: ${execution.verification_status}`);
  }

  const nowStr = new Date().toISOString();
  const updatePayload = {
    verification_status: 'rejected' as VerificationStatus,
    rejected_by: supervisorUserId,
    rejected_at: nowStr,
    rejection_reason: rejectionReason.trim(),
    updated_at: nowStr,
  };

  const allowedPrev = Array.isArray(expectedCurrentStatus) ? expectedCurrentStatus : [expectedCurrentStatus];
  if (!allowedPrev.includes(execution.verification_status)) {
    throw new Error(`[F5.3 Error] [STATE_TRANSITION_CONFLICT]: Conflicto de concurrencia. El estado actual '${execution.verification_status}' no coincide con el estado esperado.`);
  }

  let updateQuery = supabase
    .from('weekly_plan_item_executions')
    .update(updatePayload)
    .eq('id', executionId);

  if (Array.isArray(expectedCurrentStatus)) {
    updateQuery = updateQuery.in('verification_status', expectedCurrentStatus);
  } else {
    updateQuery = updateQuery.eq('verification_status', expectedCurrentStatus);
  }

  const { data: updatedRows, error: updateErr } = await updateQuery.select('*');

  if (updateErr || !updatedRows || updatedRows.length === 0) {
    throw new Error('[F5.3 Error] [STATE_TRANSITION_CONFLICT]: No se pudo rechazar el registro debido a una mutación concurrente.');
  }

  const updatedExecution = updatedRows[0] as ExecutionRecord;

  const { data: parentItemData } = await supabase
    .from('weekly_plan_items')
    .select('*')
    .eq('id', execution.weekly_plan_item_id)
    .single();

  const parentItem = parentItemData as WeeklyPlanItem;

  const { data: allExecs } = await supabase
    .from('weekly_plan_item_executions')
    .select('*')
    .eq('weekly_plan_item_id', parentItem.id);

  const metrics = calculateExecutionMetrics(parentItem.planned_qty, (allExecs || []) as ExecutionRecord[]);

  return {
    updatedExecution,
    parentItem,
    metrics,
    statusChanged: true,
  };
}
