'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMachineryForBoard,
  createMachinery,
  setMachineryAvailability,
  addOperatorQualification,
  removeOperatorQualification,
  getPersonnelQualifications,
  evaluateMachineryAvailabilityForBoard,
  assignMachineryToPlanItem,
} from '../lib/machineryService';

/**
 * Hook to fetch machinery catalog for a board.
 */
export function useMachinery(boardId: string | undefined) {
  return useQuery({
    queryKey: ['machinery', boardId],
    queryFn: () => getMachineryForBoard(boardId!),
    enabled: !!boardId,
    staleTime: 30_000,
  });
}

/**
 * Hook to evaluate machinery effective availability on-the-fly for a board.
 */
export function useMachineryAvailability(boardId: string | undefined) {
  return useQuery({
    queryKey: ['machinery_availability', boardId],
    queryFn: () => evaluateMachineryAvailabilityForBoard(boardId!),
    enabled: !!boardId,
    staleTime: 30_000,
  });
}

/**
 * Hook to fetch operator qualifications for a personnel member.
 */
export function usePersonnelQualifications(personnelId: string | undefined) {
  return useQuery({
    queryKey: ['personnel_qualifications', personnelId],
    queryFn: () => getPersonnelQualifications(personnelId!),
    enabled: !!personnelId,
    staleTime: 30_000,
  });
}

/**
 * Hook providing mutations for Machinery and Qualification management.
 */
export function useMachineryMutations(boardId: string | undefined) {
  const queryClient = useQueryClient();

  const createMachineryMutation = useMutation({
    mutationFn: (input: Parameters<typeof createMachinery>[0]) => createMachinery(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['machinery', boardId] });
      queryClient.invalidateQueries({ queryKey: ['machinery_availability', boardId] });
    },
  });

  const setAvailabilityMutation = useMutation({
    mutationFn: ({ machineryId, isAvailable }: { machineryId: string; isAvailable: boolean }) =>
      setMachineryAvailability(machineryId, isAvailable),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['machinery', boardId] });
      queryClient.invalidateQueries({ queryKey: ['machinery_availability', boardId] });
    },
  });

  const addQualificationMutation = useMutation({
    mutationFn: ({ personnelId, role }: { personnelId: string; role: string }) =>
      addOperatorQualification(personnelId, role),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['personnel_qualifications', variables.personnelId] });
      queryClient.invalidateQueries({ queryKey: ['machinery_availability', boardId] });
    },
  });

  const removeQualificationMutation = useMutation({
    mutationFn: ({ personnelId, role }: { personnelId: string; role: string }) =>
      removeOperatorQualification(personnelId, role),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['personnel_qualifications', variables.personnelId] });
      queryClient.invalidateQueries({ queryKey: ['machinery_availability', boardId] });
    },
  });

  const assignMachineryToItemMutation = useMutation({
    mutationFn: ({ planItemId, machineryId }: { planItemId: string; machineryId: string | null }) =>
      assignMachineryToPlanItem(planItemId, machineryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekly_plans'] });
      queryClient.invalidateQueries({ queryKey: ['machinery_availability', boardId] });
    },
  });

  return {
    createMachinery: createMachineryMutation,
    setAvailability: setAvailabilityMutation,
    addQualification: addQualificationMutation,
    removeQualification: removeQualificationMutation,
    assignMachineryToItem: assignMachineryToItemMutation,
  };
}
