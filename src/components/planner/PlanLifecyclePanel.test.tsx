/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen } from '@testing-library/react';
import PlanLifecyclePanel from './PlanLifecyclePanel';
import { MissingTechnicalConfigError } from '@/types/scheduler';
import type { WeeklyPlanConfirmationSummary } from '@/types/scheduler';

const mockSummary = jest.fn();
jest.mock('@/hooks/useWeeklyPlans', () => ({
  useWeeklyPlanConfirmationSummary: (...args: unknown[]) => mockSummary(...args),
}));

function baseProps(overrides: Partial<React.ComponentProps<typeof PlanLifecyclePanel>> = {}) {
  return {
    planId: 'plan-1',
    status: 'published' as const,
    periodNumber: 1,
    missingStandards: [],
    onConfirm: jest.fn(),
    isConfirming: false,
    confirmError: null,
    onClose: jest.fn(),
    isClosing: false,
    closeError: null,
    onGoToCosts: jest.fn(),
    ...overrides,
  };
}

const FULL_SUMMARY: WeeklyPlanConfirmationSummary = {
  verified_count: 3,
  pending_count: 0,
  rejected_count: 0,
  pending_executions: [],
};

describe('PlanLifecyclePanel — gate de configuración técnica (Confirmar)', () => {
  beforeEach(() => {
    mockSummary.mockReturnValue({ data: FULL_SUMMARY, isLoading: false, refetch: jest.fn(), isFetching: false });
  });

  it('con missingStandards vacío y sin pendientes, el botón Confirmar está habilitado', () => {
    render(<PlanLifecyclePanel {...baseProps()} />);
    expect(screen.getByRole('button', { name: 'Confirmar plan' })).not.toBeDisabled();
  });

  it('con missingStandards no vacío, deshabilita Confirmar PROACTIVAMENTE (sin que el RPC haya fallado todavía)', () => {
    render(
      <PlanLifecyclePanel
        {...baseProps({
          missingStandards: [{ activity_key: '2.04', description: 'Herbicida grama', unit: 'M2-MES' }],
        })}
      />,
    );
    expect(screen.getByRole('button', { name: 'Confirmar plan' })).toBeDisabled();
    expect(screen.getByText(/No se puede confirmar: faltan actividades/)).toBeInTheDocument();
    expect(screen.getByText(/2\.04/)).toBeInTheDocument();
    expect(screen.getByText(/Herbicida grama/)).toBeInTheDocument();
  });

  it('si el RPC ya rechazó con MTCFG, muestra la lista que trae el propio error (respaldo si la prop no llegó a tiempo)', () => {
    const err = new MissingTechnicalConfigError('No es posible confirmar el plan porque faltan 1 actividad(es)...', [
      { activity_key: '3.01', description: 'Pulida de barandas', unit: 'ML-MES' },
    ]);
    render(<PlanLifecyclePanel {...baseProps({ confirmError: err })} />);
    expect(screen.getByText(/3\.01/)).toBeInTheDocument();
    expect(screen.getByText(/Pulida de barandas/)).toBeInTheDocument();
  });

  it('no muestra el banner de configuración técnica cuando todo está completo', () => {
    render(<PlanLifecyclePanel {...baseProps()} />);
    expect(screen.queryByText(/No se puede confirmar: faltan actividades/)).not.toBeInTheDocument();
  });
});
