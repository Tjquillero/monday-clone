'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Group } from '@/types/monday';
import { useWeeklyPlan } from '@/hooks/useWeeklyPlan';
import { useWeeklyPlans } from '@/hooks/useWeeklyPlans';
import { useWeeklyPlanMutations, PlanItemInput } from '@/hooks/useWeeklyPlanMutations';
import { usePoaActiveCatalog } from '@/hooks/usePoaActivities';
import { WeeklyPlan } from '@/types/scheduler';
import { getMonday } from '@/lib/weeklyPlanner';
import WeeklyPlannerView from '@/components/planner/WeeklyPlannerView';

interface Props {
  boardId: string | undefined;
  selectedGroupId: string | null;
  groups: Group[] | undefined;
}

function shiftWeek(date: Date, direction: -1 | 1): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + direction * 7,
  ));
}

export default function WeeklyPlannerContainer({ boardId, selectedGroupId, groups }: Props) {
  const router = useRouter();
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<Error | null>(null);
  const [closeError, setCloseError] = useState<Error | null>(null);

  const group = useMemo(() => {
    if (!selectedGroupId || !groups) return undefined;
    const g = groups.find(g => g.id === selectedGroupId);
    return g ? { id: g.id, title: g.title } : undefined;
  }, [selectedGroupId, groups]);

  const weekStartISO = useMemo(
    () => weekStart.toISOString().split('T')[0],
    [weekStart],
  );

  // Motor de cálculo — produce WeeklyPlanningContext determinista
  const { plan, isLoading, isError, error } = useWeeklyPlan(boardId, group, weekStart);

  // Planes persistidos para este grupo — cache hit si el board ya cargó
  const { data: savedPlans } = useWeeklyPlans(boardId, selectedGroupId ?? undefined);

  // Catálogo activo del POA (fuente contractual, ADR-0002) — cache hit, useWeeklyPlan ya lo fetcheó
  const { data: poaCatalog } = usePoaActiveCatalog(boardId);

  const { createPlan, savePlanItems, publishPlan, confirmPlan, closePlan } = useWeeklyPlanMutations(boardId);

  // Plan persistido para la semana activa
  const savedPlan = useMemo<WeeklyPlan | undefined>(
    () => savedPlans?.find(p => p.week_start === weekStartISO),
    [savedPlans, weekStartISO],
  );

  const isSaving    = createPlan.isPending || savePlanItems.isPending;
  const isPublishing = publishPlan.isPending;
  const isConfirming = confirmPlan.isPending;
  const isClosing    = closePlan.isPending;

  const handleSave = useCallback(async () => {
    if (!boardId || !group || !plan || !poaCatalog) return;
    if (plan.activities.length === 0) return;
    // Esperar a que savedPlans cargue para evitar crear un plan duplicado
    if (savedPlans === undefined) return;
    setSaveError(null);

    try {
      // 1. Resolver o crear cabecera del plan
      let planId: string;
      if (savedPlan) {
        if (savedPlan.status !== 'draft') {
          setSaveError(`El plan ya fue ${savedPlan.status}. No se puede sobrescribir.`);
          return;
        }
        planId = savedPlan.id;
      } else {
        const created = await createPlan.mutateAsync({
          boardId,
          groupId:      group.id,
          weekStart:    weekStartISO,
          periodNumber: plan.week.number,
        });
        planId = created.id;
      }

      // 2. Resolver poa_activity_zone_id (Actividad del POA vigente + esta zona).
      //    El motor de cálculo ya filtró por cobertura vigente (useWeeklyPlan),
      //    así que aquí solo se resuelve el id para persistir.
      const items: PlanItemInput[] = plan.activities.map((a, i) => {
        const poaActivity = poaCatalog.get(a.activity_key);
        const zoneCoverage = poaActivity?.zones.get(group.id);
        if (!zoneCoverage) throw new Error(`Sin cobertura del POA para "${a.activity_key}" en esta zona`);
        return {
          planned_sequence:      i + 1,
          activity_key:          a.activity_key,
          poa_activity_zone_id:  zoneCoverage.poaActivityZoneId,
          planned_rendimiento:   a.rendimiento,
          planned_frecuencia:    a.frecuencia,
          priority:              a.priority,
          planned_qty:           a.qty,
          unit:                  a.unit,
          planned_jr:            a.theoretical_journals_week,
        };
      });

      // 3. Reemplazo atómico — el RPC valida permisos y reglas de negocio
      await savePlanItems.mutateAsync({ planId, items });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error al guardar el plan');
    }
  }, [boardId, group, plan, poaCatalog, savedPlans, savedPlan, weekStartISO, createPlan, savePlanItems]);

  const handlePublish = useCallback(async () => {
    if (!savedPlan || savedPlan.status !== 'draft') return;
    setSaveError(null);
    try {
      await publishPlan.mutateAsync({ planId: savedPlan.id, groupId: group?.id });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error al publicar el plan');
    }
  }, [savedPlan, publishPlan, group]);

  const handleConfirm = useCallback(async () => {
    if (!savedPlan) return;
    setConfirmError(null);
    try {
      await confirmPlan.mutateAsync({ planId: savedPlan.id, groupId: group?.id });
    } catch (err) {
      setConfirmError(err instanceof Error ? err : new Error('Error al confirmar el plan'));
    }
  }, [savedPlan, confirmPlan, group]);

  const handleClose = useCallback(async () => {
    if (!savedPlan) return;
    setCloseError(null);
    try {
      await closePlan.mutateAsync({ planId: savedPlan.id, groupId: group?.id });
    } catch (err) {
      setCloseError(err instanceof Error ? err : new Error('Error al cerrar el plan'));
    }
  }, [savedPlan, closePlan, group]);

  // Navega a Costos sin generar el acta automáticamente — cerrar un plan no
  // implica que el usuario quiera emitirla de inmediato (puede cerrar varios
  // planes antes de ir a esa pestaña).
  const handleGoToCosts = useCallback(() => {
    if (!boardId) return;
    router.push(`/dashboard?boardId=${boardId}&view=financial`);
  }, [boardId, router]);

  return (
    <WeeklyPlannerView
      plan={plan}
      isLoading={isLoading}
      isError={isError}
      error={error}
      group={group}
      weekStart={weekStart}
      savedPlan={savedPlan}
      onSave={handleSave}
      isSaving={isSaving}
      onPublish={handlePublish}
      isPublishing={isPublishing}
      saveError={saveError}
      onConfirm={handleConfirm}
      isConfirming={isConfirming}
      confirmError={confirmError}
      onClose={handleClose}
      isClosing={isClosing}
      closeError={closeError}
      onGoToCosts={handleGoToCosts}
      onPrevWeek={() => setWeekStart(d => shiftWeek(d, -1))}
      onNextWeek={() => setWeekStart(d => shiftWeek(d, 1))}
    />
  );
}
