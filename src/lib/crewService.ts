import { supabase } from './supabaseClient';
import {
  Crew,
  CrewWithDetails,
  PersonnelVersion,
  PersonnelSiteAssignment,
  ReassignPersonnelInput,
} from '../types/crew';

/**
 * Fetches active crews for a specific board.
 */
export async function getCrewsForBoard(boardId: string): Promise<CrewWithDetails[]> {
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
    members_count: c.members?.length || 0,
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
 * Creates a new crew for a board.
 */
export async function createCrew(input: {
  board_id: string;
  version_id?: string | null;
  name: string;
  code?: string | null;
  leader_id?: string | null;
}): Promise<Crew> {
  const { data, error } = await supabase
    .from('crews')
    .insert([{
      board_id: input.board_id,
      version_id: input.version_id || null,
      name: input.name,
      code: input.code || null,
      leader_id: input.leader_id || null,
      is_active: true,
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Updates an existing crew.
 */
export async function updateCrew(
  crewId: string,
  updates: Partial<Pick<Crew, 'name' | 'code' | 'leader_id' | 'is_active'>>
): Promise<Crew> {
  const { data, error } = await supabase
    .from('crews')
    .update(updates)
    .eq('id', crewId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Deletes a crew (soft-delete via is_active = false or hard delete).
 */
export async function deleteCrew(crewId: string): Promise<void> {
  const { error } = await supabase
    .from('crews')
    .update({ is_active: false })
    .eq('id', crewId);

  if (error) throw error;
}

/**
 * Adds a member (personnel_site_assignment) to a crew.
 */
export async function addCrewMember(
  crewId: string,
  personnelAssignmentId: string
): Promise<void> {
  const { error } = await supabase
    .from('crew_members')
    .insert([{
      crew_id: crewId,
      personnel_assignment_id: personnelAssignmentId,
    }]);

  if (error) throw error;
}

/**
 * Removes a member from a crew.
 */
export async function removeCrewMember(memberId: string): Promise<void> {
  const { error } = await supabase
    .from('crew_members')
    .delete()
    .eq('id', memberId);

  if (error) throw error;
}

/**
 * Assigns a crew to a weekly_plan_item for a specific planning week.
 * Enforces CUAD-03 (site compatibility) when boardId is provided.
 */
export async function assignCrewToPlanItem(
  planItemId: string,
  crewId: string | null,
  boardId?: string
): Promise<void> {
  if (crewId && boardId) {
    const { data: crew, error: crewErr } = await supabase
      .from('crews')
      .select('id, board_id')
      .eq('id', crewId)
      .single();

    if (crewErr || !crew || crew.board_id !== boardId) {
      throw new Error(`Incompatibilidad de sitio: La cuadrilla no pertenece al sitio ${boardId}`);
    }
  }

  const { error } = await supabase
    .from('weekly_plan_items')
    .update({ crew_id: crewId, updated_at: new Date().toISOString() })
    .eq('id', planItemId);

  if (error) throw error;
}

/**
 * Retorna la fecha actual civil en America/Bogota (UTC-5) en formato YYYY-MM-DD.
 */
export function getBogotaTodayISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Resolves the canonically active PersonnelVersion for a board at a specific target date.
 * SOT Rule (ADR-C1.2C): status = 'PUBLISHED' AND effective_from <= targetDate ORDER BY effective_from DESC, created_at DESC LIMIT 1
 */
export async function resolvePersonnelVersionForDate(
  boardId: string,
  targetDate?: string
): Promise<PersonnelVersion | null> {
  const dateStr = targetDate || getBogotaTodayISO();

  const { data, error } = await supabase
    .from('personnel_versions')
    .select('*')
    .eq('board_id', boardId)
    .eq('status', 'PUBLISHED')
    .lte('effective_from', dateStr)
    .order('effective_from', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    board_id: data.board_id,
    version_name: data.version_name,
    status: data.status,
    is_active: data.is_active,
    effective_from: data.effective_from,
    change_reason: data.change_reason,
    created_by: data.created_by,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

/**
 * Gets the canonical active PersonnelVersion for a board at today's date (Bogotá).
 * Redirects to resolvePersonnelVersionForDate.
 *
 * NOTE (C1.2 INV-MOB-07): Auto-creation of initial versions via direct PostgREST
 * INSERT has been REMOVED. Authenticated clients no longer have INSERT on
 * personnel_versions. Initial version creation must occur via admin tooling
 * or the governed RPC. If no PUBLISHED version exists, this returns null.
 */
export async function getActivePersonnelVersion(boardId: string): Promise<PersonnelVersion | null> {
  return resolvePersonnelVersionForDate(boardId);
}

/**
 * Executes a governed personnel reassignment creating a new snapshot version atomically.
 * Gate C1.2: Invokes PostgreSQL RPC reassign_personnel_governed_xact.
 */
export async function reassignPersonnelGoverned(
  input: ReassignPersonnelInput
): Promise<{ newVersionId: string }> {
  if (!input.boardId || !input.sourceVersionId || !input.personnelId) {
    throw new Error('boardId, sourceVersionId y personnelId son requeridos para la reasignación');
  }

  if (!input.changeReason || input.changeReason.trim().length < 5) {
    throw new Error('changeReason debe contener al menos 5 caracteres');
  }

  const { data: newVersionId, error } = await supabase.rpc(
    'reassign_personnel_governed_xact',
    {
      p_board_id: input.boardId,
      p_source_version_id: input.sourceVersionId,
      p_personnel_id: input.personnelId,
      p_target_group_id: input.targetGroupId || null,
      p_target_zone: input.targetZone || 'GENERAL',
      p_effective_from: input.effectiveFrom,
      p_change_reason: input.changeReason.trim(),
      p_actor_user_id: input.actorUserId || null,
    }
  );

  if (error) throw error;
  return { newVersionId };
}

/**
 * Lists personnel site assignments for a specific version.
 */
export async function getPersonnelSiteAssignments(
  versionId: string
): Promise<PersonnelSiteAssignment[]> {
  const { data, error } = await supabase
    .from('personnel_site_assignments')
    .select(`
      *,
      personnel:personnel(name, document_id)
    `)
    .eq('version_id', versionId)
    .order('created_at');

  if (error) throw error;
  if (!data) return [];

  return data.map((a: any) => ({
    id: a.id,
    version_id: a.version_id,
    personnel_id: a.personnel_id,
    role_in_site: a.role_in_site,
    zone: a.zone,
    dedication_percentage: Number(a.dedication_percentage || 100),
    daily_rate_override: a.daily_rate_override ? Number(a.daily_rate_override) : null,
    created_at: a.created_at,
    updated_at: a.updated_at,
    personnel_name: a.personnel?.name || 'Desconocido',
    personnel_document_id: a.personnel?.document_id || '',
  }));
}

/**
 * @deprecated RETIRED — C1.2 INV-MOB-07 ENFORCEMENT
 *
 * Direct PostgREST mutation on personnel_site_assignments is no longer permitted
 * for authenticated clients. The `authenticated` role has had INSERT/UPDATE/DELETE
 * REVOKED on both `personnel_versions` and `personnel_site_assignments`.
 *
 * All reassignments must go through: reassignPersonnelGoverned → reassign_personnel_governed_xact (RPC)
 *
 * This function is preserved only to avoid breaking existing import references while
 * callers are migrated. It throws unconditionally and MUST NOT be invoked.
 *
 * Callers identified during audit:
 *   - useCrews.ts / createAssignmentMutation: REMOVED
 *   - PersonnelManagement.tsx / handleCreateAssignment: REMOVED
 *
 * Bootstrap path (personnelIngestionService.ts) is documented separately as
 * BOOTSTRAP_ONLY / NOT_OPERATIONAL_MOBILITY. See section below.
 */
export async function createPersonnelSiteAssignment(
  _input: {
    version_id: string;
    personnel_id: string;
    role_in_site?: string | null;
    zone?: string;
    dedication_percentage?: number;
    daily_rate_override?: number | null;
  }
): Promise<never> {
  throw new Error(
    'RETIRED_PATH: createPersonnelSiteAssignment is no longer executable. ' +
    'C1.2 INV-MOB-07: authenticated clients have no direct write access to ' +
    'personnel_site_assignments. Use reassignPersonnelGoverned instead.'
  );
}
