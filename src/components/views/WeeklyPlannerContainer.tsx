'use client';

import { useState, useMemo } from 'react';
import { Group } from '@/types/monday';
import { useWeeklyPlan } from '@/hooks/useWeeklyPlan';
import WeeklyPlannerView from '@/components/planner/WeeklyPlannerView';

interface Props {
  boardId: string | undefined;
  selectedGroupId: string | null;
  groups: Group[] | undefined;
}

function getMonday(date: Date): Date {
  // Devuelve el lunes UTC de la semana que contiene la fecha.
  const day = date.getUTCDay(); // 0=domingo
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

  const group = useMemo(() => {
    if (!selectedGroupId || !groups) return undefined;
    const g = groups.find(g => g.id === selectedGroupId);
    return g ? { id: g.id, title: g.title } : undefined;
  }, [selectedGroupId, groups]);

  const { plan, isLoading, isError, error } = useWeeklyPlan(boardId, group, weekStart);

  return (
    <WeeklyPlannerView
      plan={plan}
      isLoading={isLoading}
      isError={isError}
      error={error}
      group={group}
      weekStart={weekStart}
      onPrevWeek={() => setWeekStart(d => shiftWeek(d, -1))}
      onNextWeek={() => setWeekStart(d => shiftWeek(d, 1))}
    />
  );
}
