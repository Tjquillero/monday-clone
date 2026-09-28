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
  resolvePersonnelVersionForDate,
  getPersonnelSiteAssignments,
  reassignPersonnelGoverned,
} from '../lib/crewService';
import { CrewWithDetails, ReassignPersonnelInput } from '../types/crew';

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
 * Hook to resolve canonical PersonnelVersion for a board at a specific date.
 */
export function usePersonnelVersionForDate(boardId: string | undefined, targetDate?: string) {
  return useQuery({
    queryKey: ['personnel_version_date', boardId, targetDate],
    queryFn: () => {
      if (!boardId) return null;
      return resolvePersonnelVersionForDate(boardId, targetDate);
    },
    enabled: !!boardId,
    staleTime: 30_000,
  });
}

/**
 * Hook to query personnel site assignments for a board at a specific date (default: today).
 */
export function usePersonnelAssignments(boardId: string | undefined, targetDate?: string) {
  return useQuery({
    queryKey: ['personnel_assignments', boardId, targetDate],
    queryFn: async () => {
      if (!boardId) return [];
      const version = await resolvePersonnelVersionForDate(boardId, targetDate);
      if (!version) return [];
      return getPersonnelSiteAssignments(version.id);
    },
    enabled: !!boardId,
    staleTime: 30_000,
  });
}

/**
 * Mutations for Crew & Governed Personnel Mobility management.
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
    }) => assignCrewToPlanItem(planItemId, crewId, boardId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekly_plans'] });
      queryClient.invalidateQueries({ queryKey: ['crews', boardId] });
    },
  });

  const reassignPersonnelMutation = useMutation({
    mutationFn: async (input: Omit<ReassignPersonnelInput, 'boardId'>) => {
      if (!boardId) throw new Error('Board ID es requerido');
      return reassignPersonnelGoverned({
        boardId,
        ...input,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personnel_assignments', boardId] });
      queryClient.invalidateQueries({ queryKey: ['personnel_version_date', boardId] });
    },
  });

  return {
    createCrew: createCrewMutation,
    updateCrew: updateCrewMutation,
    deleteCrew: deleteCrewMutation,
    addMember: addMemberMutation,
    removeMember: removeMemberMutation,
    assignCrewToItem: assignCrewToItemMutation,
    reassignPersonnel: reassignPersonnelMutation,
    // createAssignment REMOVED: C1.2 INV-MOB-07 enforcement.
    // Use crewMutations.reassignPersonnel (governed RPC) for all mobility operations.
  };
}
