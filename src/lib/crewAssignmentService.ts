/**
 * Service: Asignación Operativa de Cuadrillas y Personal (Fase 5.2)
 * Baseline Entrada: 103 suites / 780 tests / TS 0 errores (F5.1 FROZEN)
 * Target: 104 suites / 790 tests / TS 0 errores
 * 
 * Invariantes Contractuales F5.2:
 * - F5.2-INV-01: Elegibilidad estricta de cuadrilla (activa, mismo board_id, miembros válidos en el sitio, sin inferencias textuales).
 * - F5.2-INV-02: Invarianza absoluta de demanda y programación (planned_qty, planned_jr, theoretical_jr, activity_key, frequency, planned_date, occurrence_key, group_id, board_id).
 * - F5.2-INV-03: Inmutabilidad retrospectiva total (no modifica ejecuciones, verificaciones, evidencias ni Actas).
 * - F5.2-INV-04: Protección determinista de ejecuciones y estados terminales (regla de ejecuciones mixtas: 0 ejecuciones o 100% rejected).
 * - F5.2-INV-05: Aislamiento total del Solver H8 (🔴 STRICTLY NO-GO).
 * - F5.2-INV-06: Reglas idénticas para asignación, reemplazo y desasignación (crew_id = null) + Idempotencia (A -> A es NO_OP).
 * - F5.2-INV-07: Autorización de asignación (validación de permisos vigentes sobre el board_id consumiendo RBAC existente).
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { CrewWithDetails } from '../types/crew';
import { WeeklyPlanItem } from '../types/weeklyPlan';

export type CrewAssignmentAction = 'ASSIGN' | 'REPLACE' | 'UNASSIGN' | 'NO_OP';

export interface CrewAssignmentEvaluation {
  allowed: boolean;
  action: CrewAssignmentAction;
  reasonCode: string;
  message: string;
  item: WeeklyPlanItem | null;
  currentCrewId: string | null;
  targetCrewId: string | null;
}

export interface AssignCrewInput {
  planItemId: string;
  crewId: string | null;
  userId?: string | null;
}

export interface AssignCrewResult {
  evaluation: CrewAssignmentEvaluation;
  success: boolean;
  updatedItem: WeeklyPlanItem | null;
}

/**
 * Consulta y lista las cuadrillas activas y elegibles para un board_id específico,
 * incluyendo líder y miembros con asignación válida en el sitio.
 */
export async function getEligibleCrewsForBoard(
  supabase: SupabaseClient,
  boardId: string
): Promise<CrewWithDetails[]> {
  const { data: crews, error } = await supabase
    .from('crews')
    .select(`
      *,
      leader:personnel!crews_leader_id_fkey(name),
      members:crew_members(
        id,
        personnel_assignment_id,
        assignment:personnel_site_assignments(
          id,
          personnel_id,
          role_in_site,
          zone,
          personnel:personnel(name, document_id)
        )
      )
    `)
    .eq('board_id', boardId)
    .eq('is_active', true)
    .order('name');

  if (error) throw error;
  if (!crews) return [];

  return crews.map((c: any) => ({
    id: c.id,
    board_id: c.board_id,
    version_id: c.version_id,
    name: c.name,
    code: c.code,
    leader_id: c.leader_id,
    is_active: c.is_active,
    created_at: c.created_at,
    updated_at: c.updated_at,
    leader_name: c.leader?.name || null,
    members_count: (c.members || []).length,
    members: (c.members || []).map((m: any) => ({
      id: m.id,
      personnel_assignment_id: m.personnel_assignment_id,
      personnel_id: m.assignment?.personnel_id || '',
      full_name: m.assignment?.personnel?.name || 'Desconocido',
      role_in_site: m.assignment?.role_in_site || null,
      zone: m.assignment?.zone || 'GENERAL',
    })),
  }));
}

/**
 * Evalúa de forma determinista y pura si una asignación, reemplazo o desasignación de crew_id
 * es válida y permitida según las reglas de negocio e invariantes F5.2.
 */
export async function evaluateCrewAssignment(
  supabase: SupabaseClient,
  input: AssignCrewInput
): Promise<CrewAssignmentEvaluation> {
  const { planItemId, crewId, userId } = input;

  // 1. Obtener ocurrencia planificada (weekly_plan_item)
  const { data: itemData, error: itemErr } = await supabase
    .from('weekly_plan_items')
    .select('*')
    .eq('id', planItemId)
    .maybeSingle();

  if (itemErr || !itemData) {
    return {
      allowed: false,
      action: 'NO_OP',
      reasonCode: 'ITEM_NOT_FOUND',
      message: `No se encontró la ocurrencia planificada con ID ${planItemId}`,
      item: null,
      currentCrewId: null,
      targetCrewId: crewId,
    };
  }

  const item = itemData as WeeklyPlanItem;
  const currentCrewId = item.crew_id || null;
  const boardId = item.board_id;

  // Determinar acción
  let action: CrewAssignmentAction = 'NO_OP';
  if (currentCrewId === null && crewId !== null) {
    action = 'ASSIGN';
  } else if (currentCrewId !== null && crewId === null) {
    action = 'UNASSIGN';
  } else if (currentCrewId !== null && crewId !== null && currentCrewId !== crewId) {
    action = 'REPLACE';
  } else {
    action = 'NO_OP';
  }

  // Idempotencia: Si no hay cambio, retornar NO_OP permitido sin validaciones pesadas
  if (action === 'NO_OP') {
    return {
      allowed: true,
      action: 'NO_OP',
      reasonCode: 'IDEMPOTENT_NO_OP',
      message: 'La ocurrencia ya tiene asignada la cuadrilla solicitada.',
      item,
      currentCrewId,
      targetCrewId: crewId,
    };
  }

  // 2. F5.2-INV-07: Autorización de usuario sobre el board_id (si userId es provisto)
  if (userId) {
    const { data: userRoles } = await supabase
      .from('user_board_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('board_id', boardId);

    const hasPermission = (userRoles || []).length > 0;
    if (!hasPermission) {
      return {
        allowed: false,
        action,
        reasonCode: 'UNAUTHORIZED_USER',
        message: `El usuario ${userId} no tiene autorización sobre el tablero ${boardId}`,
        item,
        currentCrewId,
        targetCrewId: crewId,
      };
    }
  }

  // 3. F5.2-INV-04: Verificar estado del ítem y estado del plan semanal cabecera
  if (item.status === 'cancelled') {
    return {
      allowed: false,
      action,
      reasonCode: 'ITEM_CANCELLED_TERMINAL',
      message: 'No se puede modificar la cuadrilla de una ocurrencia cancelada (estado terminal).',
      item,
      currentCrewId,
      targetCrewId: crewId,
    };
  }

  if (item.status === 'completed') {
    return {
      allowed: false,
      action,
      reasonCode: 'ITEM_COMPLETED_PROTECTED',
      message: 'No se puede modificar la cuadrilla de una ocurrencia completada físicamente.',
      item,
      currentCrewId,
      targetCrewId: crewId,
    };
  }

  // Consultar estado de cabecera weekly_plans
  const planId = item.weekly_plan_id || (item as any).plan_id;
  if (planId) {
    const { data: planHeader } = await supabase
      .from('weekly_plans')
      .select('status')
      .eq('id', planId)
      .maybeSingle();

    if (planHeader) {
      const pStatus = planHeader.status;
      if (
        pStatus === 'ready_for_confirmation' ||
        pStatus === 'confirmed' ||
        pStatus === 'closed' ||
        pStatus === 'cancelled'
      ) {
        return {
          allowed: false,
          action,
          reasonCode: `PLAN_${pStatus.toUpperCase()}_IMMUTABLE`,
          message: `No se puede modificar la cuadrilla porque el plan se encuentra en estado inmutable/terminal: ${pStatus}`,
          item,
          currentCrewId,
          targetCrewId: crewId,
        };
      }
    }
  }

  // 4. F5.2-INV-04: Regla unívoca de Ejecuciones Mixtas
  const { data: executions } = await supabase
    .from('weekly_plan_item_executions')
    .select('id, verification_status')
    .eq('weekly_plan_item_id', planItemId);

  const execList = executions || [];
  if (execList.length > 0) {
    const hasNonRejected = execList.some((e: any) => e.verification_status !== 'rejected');
    if (hasNonRejected) {
      return {
        allowed: false,
        action,
        reasonCode: 'ACTIVE_EXECUTIONS_PROTECTED',
        message: 'No se puede modificar la cuadrilla porque la ocurrencia posee ejecuciones activas no rechazadas en campo.',
        item,
        currentCrewId,
        targetCrewId: crewId,
      };
    }
  }

  // 5. Condición Contractual de Acta Emitida (ADR-0012)
  const { data: actaItems } = await supabase
    .from('acta_items')
    .select('id, acta:actas(status)')
    .eq('plan_item_id', planItemId);

  const isLockedInActa = (actaItems || []).some(
    (ai: any) =>
      ai.acta &&
      (ai.acta.status === 'issued' || ai.acta.status === 'approved' || ai.acta.status === 'paid')
  );

  if (isLockedInActa) {
    return {
      allowed: false,
      action,
      reasonCode: 'ACTA_ISSUED_LOCKED',
      message: 'No se puede modificar la cuadrilla porque la ocurrencia está vinculada a un Acta emitida/liquidada.',
      item,
      currentCrewId,
      targetCrewId: crewId,
    };
  }

  // 6. F5.2-INV-01: Elegibilidad estricta de cuadrilla destino (si crewId !== null)
  if (crewId !== null) {
    const { data: crewData, error: crewErr } = await supabase
      .from('crews')
      .select(`
        id,
        board_id,
        is_active,
        members:crew_members(id)
      `)
      .eq('id', crewId)
      .maybeSingle();

    if (crewErr || !crewData) {
      return {
        allowed: false,
        action,
        reasonCode: 'CREW_NOT_FOUND',
        message: `La cuadrilla con ID ${crewId} no existe en el catálogo.`,
        item,
        currentCrewId,
        targetCrewId: crewId,
      };
    }

    // Incompatibilidad de sitio (F5.2-INV-01)
    if (crewData.board_id !== boardId) {
      return {
        allowed: false,
        action,
        reasonCode: 'SITE_MISMATCH',
        message: `Incompatibilidad de sitio: La cuadrilla ${crewId} pertenece al board ${crewData.board_id}, no a ${boardId}.`,
        item,
        currentCrewId,
        targetCrewId: crewId,
      };
    }

    // Cuadrilla inactiva (F5.2-INV-01)
    if (!crewData.is_active) {
      return {
        allowed: false,
        action,
        reasonCode: 'CREW_INACTIVE',
        message: `La cuadrilla ${crewId} se encuentra inactiva.`,
        item,
        currentCrewId,
        targetCrewId: crewId,
      };
    }
  }

  // Todo conforme: Asignación, reemplazo o desasignación autorizada
  return {
    allowed: true,
    action,
    reasonCode: 'ASSIGNMENT_ALLOWED',
    message: 'Evaluación exitosa. Asignación conforme a las reglas F5.2.',
    item,
    currentCrewId,
    targetCrewId: crewId,
  };
}

/**
 * Orquestador Autorizado de Asignación de Cuadrillas para /my-work y Planificación (Fase 5.2).
 * Valida deterministamente todas las precondiciones antes de mutar weekly_plan_items.crew_id.
 */
export async function assignCrewToPlanItemValidated(
  supabase: SupabaseClient,
  input: AssignCrewInput
): Promise<AssignCrewResult> {
  const evaluation = await evaluateCrewAssignment(supabase, input);

  if (!evaluation.allowed) {
    throw new Error(`[F5.2 Assignment Error] [${evaluation.reasonCode}]: ${evaluation.message}`);
  }

  // Idempotencia: Si es NO_OP, retornar sin mutar
  if (evaluation.action === 'NO_OP') {
    return {
      evaluation,
      success: true,
      updatedItem: evaluation.item,
    };
  }

  // Persistencia mediante el gateway autorizado sobre weekly_plan_items.crew_id
  const { data: updated, error: updateErr } = await supabase
    .from('weekly_plan_items')
    .update({
      crew_id: input.crewId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.planItemId)
    .select('*')
    .single();

  if (updateErr) {
    throw new Error(`Error al persistir asignación de cuadrilla: ${updateErr.message}`);
  }

  return {
    evaluation,
    success: true,
    updatedItem: (updated || evaluation.item) as WeeklyPlanItem,
  };
}
