import { supabase } from './supabaseClient';
import {
  evalMachineryEffectiveAvailability,
  getSiteResourceState,
} from './resourceConstraints/finiteResourceCatalog';
import { validateResourceSimultaneityConstraints } from './resourceConstraints/simultaneityConstraints';
import type {
  FiniteMachinery,
  FinitePerson,
  MachineryEffectiveAvailability,
  SimultaneityValidationResult,
  ResourceDemandAllocation,
  SiteResourceState,
} from './resourceConstraints/types';
import { getCrewsForBoard, getActivePersonnelVersion, getPersonnelSiteAssignments } from './crewService';

export interface PersonnelQualification {
  id: string;
  personnel_id: string;
  qualification_role: string;
  created_at: string;
}

/**
 * Lists active machinery registered for a specific board/site.
 */
export async function getMachineryForBoard(boardId: string): Promise<FiniteMachinery[]> {
  const { data, error } = await supabase
    .from('machinery')
    .select('*')
    .eq('board_id', boardId)
    .order('code');

  if (error) throw error;
  if (!data) return [];

  return data.map((m: any) => ({
    id: m.id,
    code: m.code,
    name: m.name,
    category: m.category || 'EQUIPO_MENOR',
    siteGroupId: m.board_id,
    simultaneousLimit: m.simultaneous_limit || 1,
    operatorRequirement: m.operator_required_role
      ? {
          requiredRole: m.operator_required_role,
          operatorCount: m.operator_count || 1,
        }
      : null,
    isAvailable: m.is_available ?? true,
  }));
}

/**
 * Creates a new machinery equipment item for a board/site.
 */
export async function createMachinery(input: {
  board_id: string;
  code: string;
  name: string;
  category?: 'TRACTOR' | 'VOLQUETA' | 'MINICARGADOR' | 'GUADAÑA' | 'EQUIPO_MENOR';
  simultaneous_limit?: number;
  operator_required_role?: string | null;
  operator_count?: number;
}): Promise<FiniteMachinery> {
  const { data, error } = await supabase
    .from('machinery')
    .insert([{
      board_id: input.board_id,
      code: input.code,
      name: input.name,
      category: input.category || 'EQUIPO_MENOR',
      simultaneous_limit: input.simultaneous_limit || 1,
      operator_required_role: input.operator_required_role || null,
      operator_count: input.operator_count || 1,
      is_available: true,
    }])
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    code: data.code,
    name: data.name,
    category: data.category || 'EQUIPO_MENOR',
    siteGroupId: data.board_id,
    simultaneousLimit: data.simultaneous_limit || 1,
    operatorRequirement: data.operator_required_role
      ? {
          requiredRole: data.operator_required_role,
          operatorCount: data.operator_count || 1,
        }
      : null,
    isAvailable: data.is_available ?? true,
  };
}

/**
 * Updates availability state for a machinery item (Soft-Retirement: is_available = false).
 */
export async function setMachineryAvailability(
  machineryId: string,
  isAvailable: boolean
): Promise<void> {
  const { error } = await supabase
    .from('machinery')
    .update({ is_available: isAvailable, updated_at: new Date().toISOString() })
    .eq('id', machineryId);

  if (error) throw error;
}

/**
 * Adds an operator role qualification to a personnel member.
 */
export async function addOperatorQualification(
  personnelId: string,
  qualificationRole: string
): Promise<PersonnelQualification> {
  const { data, error } = await supabase
    .from('personnel_qualifications')
    .insert([{
      personnel_id: personnelId,
      qualification_role: qualificationRole.toUpperCase().trim(),
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Removes an operator role qualification from a personnel member.
 */
export async function removeOperatorQualification(
  personnelId: string,
  qualificationRole: string
): Promise<void> {
  const { error } = await supabase
    .from('personnel_qualifications')
    .delete()
    .eq('personnel_id', personnelId)
    .eq('qualification_role', qualificationRole.toUpperCase().trim());

  if (error) throw error;
}

/**
 * Lists operator qualifications registered for a personnel member.
 */
export async function getPersonnelQualifications(
  personnelId: string
): Promise<PersonnelQualification[]> {
  const { data, error } = await supabase
    .from('personnel_qualifications')
    .select('*')
    .eq('personnel_id', personnelId);

  if (error) throw error;
  return data || [];
}

/**
 * Evaluates machinery effective availability on-the-fly for a board (Fase 3 H1 adapter).
 */
export async function evaluateMachineryAvailabilityForBoard(
  boardId: string
): Promise<MachineryEffectiveAvailability[]> {
  const machineryList = await getMachineryForBoard(boardId);
  if (machineryList.length === 0) return [];

  // Fetch personnel assignments for site version
  const version = await getActivePersonnelVersion(boardId);
  const assignments = await getPersonnelSiteAssignments(version.id);

  // Fetch qualifications for assigned personnel
  const personnelIds = Array.from(new Set(assignments.map(a => a.personnel_id)));
  const { data: qualData } = await supabase
    .from('personnel_qualifications')
    .select('*')
    .in('personnel_id', personnelIds.length > 0 ? personnelIds : ['00000000-0000-0000-0000-000000000000']);

  const qualMap = new Map<string, string[]>();
  (qualData || []).forEach((q: any) => {
    const list = qualMap.get(q.personnel_id) || [];
    list.push(q.qualification_role);
    qualMap.set(q.personnel_id, list);
  });

  const finitePersons: FinitePerson[] = assignments.map(a => ({
    id: a.personnel_id,
    documentId: a.personnel_document_id || '',
    name: a.personnel_name || 'Desconocido',
    role: (qualMap.get(a.personnel_id) || []).join(',') || a.role_in_site || 'OPERARIO',
    isAvailable: true,
    siteGroupId: boardId,
  }));

  return machineryList.map(m => evalMachineryEffectiveAvailability(m, finitePersons));
}

/**
 * Validates temporal simultaneity constraints over interval [start, end) (Fase 3 H2 adapter).
 */
export function validateBoardResourceSimultaneity(
  demands: ResourceDemandAllocation[],
  catalog: SiteResourceState[]
): SimultaneityValidationResult {
  return validateResourceSimultaneityConstraints(demands, catalog);
}

/**
 * Assigns or unassigns machinery to a weekly plan item.
 * C2 Correction: Signature is assignMachineryToPlanItem(planItemId, machineryId).
 * Derives board_id 100% server-side from DB and verifies machinery.board_id === item.board_id.
 * Invariant: Preserves theoretical_jr, planned_jr, execution history, and certified actas.
 */
export async function assignMachineryToPlanItem(
  planItemId: string,
  machineryId: string | null
): Promise<void> {
  // 1. Fetch plan item board_id from DB
  const { data: item, error: itemErr } = await supabase
    .from('weekly_plan_items')
    .select('id, board_id')
    .eq('id', planItemId)
    .single();

  if (itemErr || !item) {
    throw new Error(`Plan item no encontrado: ${planItemId}`);
  }

  // 2. If machineryId is provided, verify site compatibility from DB
  if (machineryId) {
    const { data: machinery, error: machErr } = await supabase
      .from('machinery')
      .select('id, board_id')
      .eq('id', machineryId)
      .single();

    if (machErr || !machinery || machinery.board_id !== item.board_id) {
      throw new Error(`Incompatibilidad de sitio: La maquinaria no pertenece al sitio ${item.board_id}`);
    }
  }

  // 3. Perform atomic update on machinery_id without modifying theoretical_jr or historical records
  const { error } = await supabase
    .from('weekly_plan_items')
    .update({ machinery_id: machineryId, updated_at: new Date().toISOString() })
    .eq('id', planItemId);

  if (error) throw error;
}
