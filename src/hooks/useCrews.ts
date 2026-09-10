'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCrewsForBoard,
  createCrew,
  updateCrew,
  deleteCrew,
  addCrewMember,
  removeCrewMember,
  assignCrewToPlanItem,
  getActivePersonnelVersion,
  getPersonnelSiteAssignments,
  createPersonnelSiteAssignment,
} from '../lib/crewService';
import { CrewWithDetails } from '../types/crew';

/**
 * Hook to query active crews for a board.
 */
export function useCrews(boardId: string | undefined) {
  return useQuery<CrewWithDetails[]>({
    queryKey: ['crews', boardId],
    queryFn: () => getCrewsForBoard(boardId!),
    enabled: !!boardId,
    staleTime: 30_000,
  });
}

/**
 * Hook to query personnel site assignments for a board's active version.
 */
export function usePersonnelAssignments(boardId: string | undefined) {
  return useQuery({
    queryKey: ['personnel_assignments', boardId],
    queryFn: async () => {
      if (!boardId) return [];
      const version = await getActivePersonnelVersion(boardId);
      return getPersonnelSiteAssignments(version.id);
    },
    enabled: !!boardId,
    staleTime: 30_000,
  });
}

/**
 * Mutations for Crew management.
 */
export function useCrewMutations(boardId: string | undefined) {
  const queryClient = useQueryClient();

  const createCrewMutation = useMutation({
    mutationFn: (input: { name: string; code?: string | null; leader_id?: string | null }) => {
      if (!boardId) throw new Error('Board ID es requerido');
      return createCrew({ board_id: boardId, ...input });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crews', boardId] });
    },
  });

  const updateCrewMutation = useMutation({
    mutationFn: ({
      crewId,
      updates,
    }: {
      crewId: string;
      updates: Parameters<typeof updateCrew>[1];
    }) => updateCrew(crewId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crews', boardId] });
    },
  });

  const deleteCrewMutation = useMutation({
    mutationFn: (crewId: string) => deleteCrew(crewId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crews', boardId] });
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: ({
      crewId,
      personnelAssignmentId,
    }: {
      crewId: string;
      personnelAssignmentId: string;
    }) => addCrewMember(crewId, personnelAssignmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crews', boardId] });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) => removeCrewMember(memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crews', boardId] });
    },
  });

  const assignCrewToItemMutation = useMutation({
    mutationFn: ({
      planItemId,
      crewId,
    }: {
      planItemId: string;
      crewId: string | null;
    }) => assignCrewToPlanItem(planItemId, crewId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekly_plans'] });
      queryClient.invalidateQueries({ queryKey: ['crews', boardId] });
    },
  });

  const createAssignmentMutation = useMutation({
    mutationFn: async (input: {
      personnel_id: string;
      role_in_site?: string;
      zone?: string;
      dedication_percentage?: number;
      daily_rate_override?: number;
    }) => {
      if (!boardId) throw new Error('Board ID es requerido');
      const version = await getActivePersonnelVersion(boardId);
      return createPersonnelSiteAssignment({
        version_id: version.id,
        ...input,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personnel_assignments', boardId] });
    },
  });

  return {
    createCrew: createCrewMutation,
    updateCrew: updateCrewMutation,
    deleteCrew: deleteCrewMutation,
    addMember: addMemberMutation,
    removeMember: removeMemberMutation,
    assignCrewToItem: assignCrewToItemMutation,
    createAssignment: createAssignmentMutation,
  };
}
