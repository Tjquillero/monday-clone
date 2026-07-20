/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ExecutiveIndicators from './ExecutiveIndicators';
import type { WeeklyPlanningContext, PlanningActivity } from '@/types/scheduler';
import type { BoardSitePlan } from '@/lib/weeklyPlanner';

function activity(overrides: Partial<PlanningActivity> = {}): PlanningActivity {
  return {
    activity_key: '1.09', name: 'Corte de troncos', category: 'ZONA DE PLAYA', priority: 'preferred',
    qty: 300, unit: 'UN', rendimiento: 20, frecuencia: 1,
    theoretical_journals_month: 15, theoretical_journals_week: 3.75, rules: [],
    ...overrides,
  };
}

function sitePlan(groupId: string, title: string, overrides: Partial<WeeklyPlanningContext['capacity']> & { activities?: PlanningActivity[] } = {}): BoardSitePlan {
  const { activities = [activity()], ...capacityOverrides } = overrides;
  const plan: WeeklyPlanningContext = {
    week: { start: '2026-07-13', end: '2026-07-17', number: 2, working_days: 5 },
    zone: { id: groupId, name: title, daily_capacity: 5, available_capacity: 10 },
    activities,
    capacity: { weekly_available: 25, weekly_required: 15, feasible: true, deficit: 0, ...capacityOverrides },
    constraints: { incompatible_pairs: [], dependencies: [], weather_sensitive: [] },
  };
  return { group: { id: groupId, title }, plan };
}

describe('ExecutiveIndicators', () => {
  it('muestra un mensaje explícito cuando no hay ningún sitio con plan, sin inventar datos', () => {
    render(<ExecutiveIndicators sites={[]} onSelectSite={jest.fn()} isLoading={false} />);
    expect(screen.getByText(/ningún sitio tiene un plan/i)).toBeInTheDocument();
  });

  it('lista todos los sitios en el ranking, ordenados por infeasible/déficit primero', () => {
    const sites = [
      sitePlan('a', 'Sitio Factible', { feasible: true, weekly_required: 10, weekly_available: 20 }),
      sitePlan('b', 'Sitio Infactible', { feasible: false, deficit: 5, weekly_required: 25, weekly_available: 20 }),
    ];
    render(<ExecutiveIndicators sites={sites} onSelectSite={jest.fn()} isLoading={false} />);
    const rows = screen.getAllByRole('button');
    expect(rows[0]).toHaveTextContent('Sitio Infactible');
    expect(rows[1]).toHaveTextContent('Sitio Factible');
  });

  it('hacer clic en una fila del ranking llama a onSelectSite con el groupId correcto', () => {
    const onSelectSite = jest.fn();
    const sites = [sitePlan('group-x', 'Sitio X')];
    render(<ExecutiveIndicators sites={sites} onSelectSite={onSelectSite} isLoading={false} />);
    fireEvent.click(screen.getByText('Sitio X'));
    expect(onSelectSite).toHaveBeenCalledWith('group-x');
  });
});
