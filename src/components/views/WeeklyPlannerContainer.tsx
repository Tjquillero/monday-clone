'use client';

import { useState, useMemo, useCallback } from 'react';
import { Group } from '@/types/monday';
import { useWeeklyPlan } from '@/hooks/useWeeklyPlan';
import { useWeeklyPlans } from '@/hooks/useWeeklyPlans';
import { useWeeklyPlanMutations, PlanItemInput } from '@/hooks/useWeeklyPlanMutations';
import { useContractStandards } from '@/hooks/useActivityStandards';
import { WeeklyPlan } from '@/types/scheduler';
import WeeklyPlannerView from '@/components/planner/WeeklyPlannerView';

interface Props {
  boardId: string | undefined;
  selectedGroupId: string | null;
  groups: Group[] | undefined;
}

function getMonday(date: Date): Date {
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + diff,
  ));
}

function shiftWeek(date: Date, direction: -1 | 1): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + direction * 7,
  ));
}

export default function WeeklyPlannerContainer({ boardId, selectedGroupId, groups }: Props) {
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));
  const [saveError, setSaveError] = useState<string | null>(null);

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

  // Estándares del contrato — cache hit, useWeeklyPlan ya los fetcheó
  const { data: standards } = useContractStandards(boardId);

  const { createPlan, savePlanItems, publishPlan } = useWeeklyPlanMutations(boardId);

  // Plan persistido para la semana activa
  const savedPlan = useMemo<WeeklyPlan | undefined>(
    () => savedPlans?.find(p => p.week_start === weekStartISO),
    [savedPlans, weekStartISO],
  );

  const isSaving    = createPlan.isPending || savePlanItems.isPending;
  const isPublishing = publishPlan.isPending;

  const handleSave = useCallback(async () => {
    if (!boardId || !group || !plan || !standards) return;
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

      // 2. Resolver activity_standard_id (contrato: group_id IS NULL)
      //    El motor de cálculo usa los mismos estándares del contrato.
      const stdMap = new Map(standards.map(s => [s.activity_key, s]));
      const items: PlanItemInput[] = plan.activities.map((a, i) => {
        const std = stdMap.get(a.activity_key);
        if (!std) throw new Error(`Sin estándar activo para "${a.activity_key}"`);
        return {
          planned_sequence:     i + 1,
          activity_key:         a.activity_key,
          activity_standard_id: std.id,
          planned_rendimiento:  a.rendimiento,
          planned_frecuencia:   a.frecuencia,
          priority:             a.priority,
          planned_qty:          a.qty,
          unit:                 a.unit,
          planned_jr:           a.theoretical_journals_week,
        };
      });

      // 3. Reemplazo atómico — el RPC valida permisos y reglas de negocio
      await savePlanItems.mutateAsync({ planId, items });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error al guardar el plan');
    }
  }, [boardId, group, plan, standards, savedPlans, savedPlan, weekStartISO, createPlan, savePlanItems]);

  const handlePublish = useCallback(async () => {
    if (!savedPlan || savedPlan.status !== 'draft') return;
    setSaveError(null);
    try {
      await publishPlan.mutateAsync({ planId: savedPlan.id, groupId: group?.id });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error al publicar el plan');
    }
  }, [savedPlan, publishPlan, group]);

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
      onPrevWeek={() => setWeekStart(d => shiftWeek(d, -1))}
      onNextWeek={() => setWeekStart(d => shiftWeek(d, 1))}
    />
  );
}
