/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen } from '@testing-library/react';
import WeeklyPlannerView from './WeeklyPlannerView';
import type { WeeklyPlanningContext } from '@/types/scheduler';

// Mock del panel de ciclo de vida — no es lo que este archivo prueba.
jest.mock('./PlanLifecyclePanel', () => () => null);

function basePlan(overrides: Partial<WeeklyPlanningContext> = {}): WeeklyPlanningContext {
  return {
    week: { start: '2026-07-20', end: '2026-07-24', number: 1, working_days: 5 },
    zone: { id: 'zone-1', name: 'Zona Test', daily_capacity: 100, available_capacity: 100 },
    activities: [
      {
        activity_key: '1.01', name: 'Limpieza manual', category: 'ZONA DE PLAYA', priority: 'preferred',
        qty: 100, unit: 'M2', rendimiento: 500, frecuencia: 1,
        theoretical_journals_month: 4, theoretical_journals_week: 1, rules: [],
      },
    ],
    capacity: { weekly_available: 25, weekly_required: 1, feasible: true, deficit: 0 },
    constraints: { incompatible_pairs: [], dependencies: [], weather_sensitive: [] },
    ...overrides,
  };
}

function baseProps(overrides: Partial<React.ComponentProps<typeof WeeklyPlannerView>> = {}) {
  return {
    boardId: 'board-1',
    plan: basePlan(),
    missingStandards: [],
    isLoading: false,
    isError: false,
    error: null,
    group: { id: 'zone-1', title: 'Zona Test' },
    weekStart: new Date('2026-07-20T00:00:00Z'),
    savedPlan: undefined,
    onSave: jest.fn(),
    isSaving: false,
    onPublish: jest.fn(),
    isPublishing: false,
    saveError: null,
    onConfirm: jest.fn(),
    isConfirming: false,
    confirmError: null,
    onClose: jest.fn(),
    isClosing: false,
    closeError: null,
    onGoToCosts: jest.fn(),
    onPrevWeek: jest.fn(),
    onNextWeek: jest.fn(),
    ...overrides,
  };
}

describe('WeeklyPlannerView — generación parcial (2026-07-19)', () => {
  it('con missingStandards vacío, no muestra el banner y el badge dice "Sin guardar" sin sufijo', () => {
    render(<WeeklyPlannerView {...baseProps()} />);
    expect(screen.queryByText('Cronograma parcial')).not.toBeInTheDocument();
    expect(screen.getByText('Sin guardar')).toBeInTheDocument();
  });

  it('con missingStandards no vacío Y actividades configuradas, muestra el banner Y la tabla JUNTOS (no uno en lugar del otro)', () => {
    render(
      <WeeklyPlannerView
        {...baseProps({
          missingStandards: [{ activity_key: '2.04', description: 'Herbicida grama', unit: 'M2-MES' }],
        })}
      />,
    );
    expect(screen.getByText('Cronograma parcial')).toBeInTheDocument();
    expect(screen.getByText(/2\.04/)).toBeInTheDocument();
    // La tabla sigue mostrando la actividad SÍ configurada (1.01), prueba de que no se reemplazó por el banner.
    expect(screen.getByText('Limpieza manual')).toBeInTheDocument();
  });

  it('el badge de estado agrega "· Parcial" cuando falta configuración técnica', () => {
    render(
      <WeeklyPlannerView
        {...baseProps({
          missingStandards: [{ activity_key: '2.04', description: 'Herbicida grama', unit: 'M2-MES' }],
        })}
      />,
    );
    expect(screen.getByText('Sin guardar · Parcial')).toBeInTheDocument();
  });

  it('sin actividades configuradas y sin catálogo pendiente, muestra el banner "Sin estándares configurados" (caso no relacionado)', () => {
    render(
      <WeeklyPlannerView
        {...baseProps({
          plan: basePlan({ activities: [] }),
          missingStandards: [],
        })}
      />,
    );
    expect(screen.getByText('Sin estándares configurados')).toBeInTheDocument();
    expect(screen.queryByText('Cronograma parcial')).not.toBeInTheDocument();
  });
});
