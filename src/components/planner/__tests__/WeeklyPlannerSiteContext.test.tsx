/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import WeeklyPlannerContainer from '@/components/views/WeeklyPlannerContainer';
import PlanningSiteSelector from '../PlanningSiteSelector';
import { Group } from '@/types/monday';

// Mocks de hooks de datos para aislar la prueba de contexto de sitio
jest.mock('@/hooks/useWeeklyPlan', () => ({
  useWeeklyPlan: jest.fn(() => ({
    plan: {
      week: { start: '2026-09-21', end: '2026-09-25', number: 1, working_days: 5 },
      zone: { id: 'site-1', name: 'Playa del Country', daily_capacity: 10, available_capacity: 5 },
      activities: [
        {
          activity_key: '1.01',
          name: 'Limpieza manual de playa',
          category: 'ZONA DE PLAYA',
          priority: 'must_execute',
          qty: 500,
          unit: 'M2',
          rendimiento: 250,
          frecuencia: 1,
          theoretical_journals_month: 2,
          theoretical_journals_week: 0.5,
          rules: [],
        },
      ],
      capacity: { weekly_available: 50, weekly_required: 0.5, feasible: true, deficit: 0 },
      constraints: { incompatible_pairs: [], dependencies: [], weather_sensitive: [] },
    },
    missingStandards: [],
    isLoading: false,
    isError: false,
    error: null,
  })),
}));

jest.mock('@/hooks/useWeeklyPlans', () => ({
  useWeeklyPlans: jest.fn(() => ({ data: [] })),
  useWeeklyPlanConfirmationSummary: jest.fn(() => ({ data: null })),
  useWeeklyPlanWithItems: jest.fn(() => ({ data: null })),
  useSiteDailyCapacity: jest.fn(() => ({ data: null })),
}));

jest.mock('@/hooks/usePoaActivities', () => ({
  usePoaActiveCatalog: jest.fn(() => ({ data: new Map() })),
}));

jest.mock('@/hooks/useActivityStandards', () => ({
  useContractStandards: jest.fn(() => ({ data: [] })),
}));

jest.mock('@/hooks/useWeeklyPlanMutations', () => ({
  useWeeklyPlanMutations: jest.fn(() => ({
    createPlan: { isPending: false },
    savePlanItems: { isPending: false },
    publishPlan: { isPending: false },
    confirmPlan: { isPending: false },
    closePlan: { isPending: false },
  })),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => ({
    invalidateQueries: jest.fn(),
  }),
}));

const mockSiteA: Group = {
  id: 'site-1',
  title: 'Playa del Country',
  color: '#3B7EF8',
  items: [{ id: 'item-1', name: 'Actividad 1', values: {} } as any],
};

const mockSiteB: Group = {
  id: 'site-2',
  title: 'Punta Astilleros',
  color: '#E8792F',
  items: [{ id: 'item-2', name: 'Actividad 2', values: {} } as any],
};

const mockFinancialGroup: Group = {
  id: 'fin-1',
  title: 'PRESUPUESTO GENERAL',
  color: '#10B981',
  items: [],
};

describe('CRONOGRAMA-FASE-1.2: Site Context UX & Navigation', () => {
  it('TC-CTX-01: Con 0 sitios operativos, renderiza el empty state informativo sin errores', () => {
    render(
      <WeeklyPlannerContainer
        boardId="board-1"
        selectedGroupId={null}
        groups={[]}
        onSelectGroup={jest.fn()}
      />
    );

    expect(screen.getByText('Sin sitios operativos')).toBeInTheDocument();
    expect(screen.getByText(/Este tablero no cuenta con sitios operativos configurados/i)).toBeInTheDocument();
  });

  it('TC-CTX-02: Con exactamente 1 sitio operativo y sin selección previa, autoselecciona el sitio', () => {
    const handleSelectGroup = jest.fn();
    render(
      <WeeklyPlannerContainer
        boardId="board-1"
        selectedGroupId={null}
        groups={[mockSiteA, mockFinancialGroup]} // mockFinancialGroup se ignora
        onSelectGroup={handleSelectGroup}
      />
    );

    expect(handleSelectGroup).toHaveBeenCalledWith('site-1');
  });

  it('TC-CTX-03: Con múltiples sitios operativos y selectedGroupId nulo, muestra el grid selector de sitios', () => {
    render(
      <WeeklyPlannerContainer
        boardId="board-1"
        selectedGroupId={null}
        groups={[mockSiteA, mockSiteB, mockFinancialGroup]}
        onSelectGroup={jest.fn()}
      />
    );

    expect(screen.getByText('Selecciona un Sitio para Planificar')).toBeInTheDocument();
    expect(screen.getByText('Playa del Country')).toBeInTheDocument();
    expect(screen.getByText('Punta Astilleros')).toBeInTheDocument();
    expect(screen.queryByText('PRESUPUESTO GENERAL')).not.toBeInTheDocument();
  });

  it('TC-CTX-04: Al hacer clic en un sitio del selector, propaga onSelectGroup con su id', () => {
    const handleSelectGroup = jest.fn();
    render(
      <WeeklyPlannerContainer
        boardId="board-1"
        selectedGroupId={null}
        groups={[mockSiteA, mockSiteB]}
        onSelectGroup={handleSelectGroup}
      />
    );

    const siteCardBtn = screen.getByRole('button', { name: /Playa del Country/i });
    fireEvent.click(siteCardBtn);

    expect(handleSelectGroup).toHaveBeenCalledWith('site-1');
  });

  it('TC-CTX-05: Si selectedGroupId es inválido o de otro board, limpia la selección (onSelectGroup(null))', () => {
    const handleSelectGroup = jest.fn();
    render(
      <WeeklyPlannerContainer
        boardId="board-1"
        selectedGroupId="foreign-site-id"
        groups={[mockSiteA, mockSiteB]}
        onSelectGroup={handleSelectGroup}
      />
    );

    expect(handleSelectGroup).toHaveBeenCalledWith(null);
  });

  it('TC-CTX-06: PRESUPUESTO GENERAL nunca es considerado sitio operativo planificable', () => {
    render(
      <PlanningSiteSelector
        sites={[mockSiteA]}
        onSelectSite={jest.fn()}
      />
    );

    expect(screen.getByText('Playa del Country')).toBeInTheDocument();
    expect(screen.queryByText('PRESUPUESTO GENERAL')).not.toBeInTheDocument();
  });

  it('TC-CTX-07: Con selectedGroupId válido, monta WeeklyPlannerView y permite volver al selector con "Cambiar sitio"', () => {
    const handleSelectGroup = jest.fn();
    render(
      <WeeklyPlannerContainer
        boardId="board-1"
        selectedGroupId="site-1"
        groups={[mockSiteA, mockSiteB]}
        onSelectGroup={handleSelectGroup}
      />
    );

    // Muestra la vista del planificador
    expect(screen.getByText('Planificador Semanal')).toBeInTheDocument();
    expect(screen.getByText('Playa del Country')).toBeInTheDocument();

    // Botón para cambiar sitio
    const changeSiteBtn = screen.getByRole('button', { name: /· Cambiar sitio/i });
    expect(changeSiteBtn).toBeInTheDocument();

    fireEvent.click(changeSiteBtn);
    expect(handleSelectGroup).toHaveBeenCalledWith(null);
  });
});
