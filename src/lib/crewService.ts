import { supabase } from './supabaseClient';
import {
  Crew,
  CrewWithDetails,
  PersonnelVersion,
  PersonnelSiteAssignment,
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
 */
export async function assignCrewToPlanItem(
  planItemId: string,
  crewId: string | null
): Promise<void> {
  const { error } = await supabase
    .from('weekly_plan_items')
    .update({ crew_id: crewId, updated_at: new Date().toISOString() })
    .eq('id', planItemId);

  if (error) throw error;
}

/**
 * Gets or creates an active PersonnelVersion for a board.
 */
export async function getActivePersonnelVersion(boardId: string): Promise<PersonnelVersion> {
  const { data: existing, error: fetchErr } = await supabase
    .from('personnel_versions')
    .select('*')
    .eq('board_id', boardId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (existing) return existing;

  // Auto-create initial version if none exists
  const { data: created, error: createErr } = await supabase
    .from('personnel_versions')
    .insert([{
      board_id: boardId,
      version_name: 'V1 - Inicial',
      is_active: true,
      effective_from: new Date().toISOString().split('T')[0],
    }])
    .select()
    .single();

  if (createErr) throw createErr;
  return created;
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
 * Creates a site assignment for a person under a specific version.
 */
export async function createPersonnelSiteAssignment(input: {
  version_id: string;
  personnel_id: string;
  role_in_site?: string | null;
  zone?: string; // 'ZV' | 'ZD' | 'ZP' | 'GENERAL'
  dedication_percentage?: number;
  daily_rate_override?: number | null;
}): Promise<PersonnelSiteAssignment> {
  const { data, error } = await supabase
    .from('personnel_site_assignments')
    .insert([{
      version_id: input.version_id,
      personnel_id: input.personnel_id,
      role_in_site: input.role_in_site || null,
      zone: input.zone || 'GENERAL',
      dedication_percentage: input.dedication_percentage || 100,
      daily_rate_override: input.daily_rate_override || null,
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}
