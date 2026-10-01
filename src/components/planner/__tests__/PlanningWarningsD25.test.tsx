/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen } from '@testing-library/react';
import PlanningWarnings from '../PlanningWarnings';
import WeeklyPlannerView from '../WeeklyPlannerView';

describe('PlanningWarnings & D25 UI Flow (Sitio sin operación)', () => {
  test('PlanningWarnings renders amber banner when notOperational is true', () => {
    render(
      <PlanningWarnings
        boardId="board-1"
        error={null}
        notOperational={true}
        noGroupSelected={false}
        hasNoActivities={false}
        missingStandards={[]}
      />
    );

    expect(screen.getByText('Sitio sin operación')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Este sitio no cuenta con parámetros en frecuencias operativas y no requiere programación semanal.'
      )
    ).toBeInTheDocument();
  });

  test('PlanningWarnings renders amber banner when error message contains SITE_NOT_OPERATIONAL', () => {
    render(
      <PlanningWarnings
        boardId="board-1"
        error={new Error('SITE_NOT_OPERATIONAL: Sitio no operativo')}
        notOperational={false}
        noGroupSelected={false}
        hasNoActivities={false}
        missingStandards={[]}
      />
    );

    expect(screen.getByText('Sitio sin operación')).toBeInTheDocument();
  });

  test('WeeklyPlannerView renders amber banner without empty draft table when notOperational is true', () => {
    render(
      <WeeklyPlannerView
        boardId="board-1"
        plan={null}
        missingStandards={[]}
        isLoading={false}
        isError={false}
        error={null}
        notOperational={true}
        group={{ id: 'group-astilleros', title: 'Playa Punta Astilleros' }}
        weekStart={new Date('2026-09-28T00:00:00Z')}
        savedPlan={undefined}
        onSave={jest.fn()}
        isSaving={false}
        onPublish={jest.fn()}
        isPublishing={false}
        saveError={null}
        onConfirm={jest.fn()}
        isConfirming={false}
        confirmError={null}
        onClose={jest.fn()}
        isClosing={false}
        closeError={null}
        onGoToCosts={jest.fn()}
        onPrevWeek={jest.fn()}
        onNextWeek={jest.fn()}
      />
    );

    // Banner presente
    expect(screen.getByText('Sitio sin operación')).toBeInTheDocument();
    // No debe haber tabla de actividades ni cabeceras de programación
    expect(screen.queryByText('Actividades a programar')).not.toBeInTheDocument();
    expect(screen.queryByText('Resumen de capacidad')).not.toBeInTheDocument();
  });
});
