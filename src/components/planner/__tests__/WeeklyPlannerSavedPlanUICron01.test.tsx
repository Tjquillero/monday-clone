/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen } from '@testing-library/react';
import WeeklyPlannerView from '../WeeklyPlannerView';
import CapacitySummary from '../CapacitySummary';
import PlanningTable from '../PlanningTable';
import type { WeeklyPlanningContext, WeeklyPlan, WeeklyPlanItem, ActivityStandard } from '@/types/scheduler';

// Mock del panel de ciclo de vida
jest.mock('../PlanLifecyclePanel', () => () => <div data-testid="plan-lifecycle-panel">Lifecycle Panel</div>);

describe('GATE FREQ-OP-04 — UI-CRON-01: El Cronograma muestra el plan guardado', () => {
  const mockSavedPlan: WeeklyPlan = {
    id: 'plan-123',
    board_id: 'board-1',
    group_id: 'group-1',
    week_start: '2026-09-07',
    period_number: 1,
    status: 'published',
    published_by: 'user-1',
    published_at: '2026-09-07T10:00:00Z',
    confirmed_by: null,
    confirmed_at: null,
    closed_by: null,
    closed_at: null,
    created_by: 'user-1',
    updated_by: null,
    created_at: '2026-09-07T08:00:00Z',
    updated_at: '2026-09-07T10:00:00Z',
  };

  const mockSavedItems: WeeklyPlanItem[] = [
    {
      id: 'item-1',
      plan_id: 'plan-123',
      planned_sequence: 1,
      activity_key: '1.01',
      name: 'Limpieza de Playa',
      poa_activity_zone_id: 'paz-1',
      planned_rendimiento: 500,
      planned_frecuencia: 25,
      priority: 'must_execute',
      planned_qty: 1000,
      unit: 'M²',
      planned_jr: 2.0,
      planned_date: '2026-09-07',
      executed_qty: 0,
      executed_jr: 0,
      created_at: '2026-09-07T08:00:00Z',
      updated_at: '2026-09-07T08:00:00Z',
    },
    {
      id: 'item-2',
      plan_id: 'plan-123',
      planned_sequence: 2,
      activity_key: '1.11', // Máquina (D28)
      name: 'Oxigenación mecánica',
      poa_activity_zone_id: 'paz-2',
      planned_rendimiento: 4000,
      planned_frecuencia: 4,
      priority: 'preferred',
      planned_qty: 4000,
      unit: 'M²',
      planned_jr: 1.0,
      planned_date: '2026-09-08',
      executed_qty: 0,
      executed_jr: 0,
      created_at: '2026-09-07T08:00:00Z',
      updated_at: '2026-09-07T08:00:00Z',
    },
  ];

  const mockStandards: ActivityStandard[] = [
    {
      id: 'std-1',
      board_id: 'board-1',
      group_id: null,
      activity_key: '1.01',
      name: 'Limpieza de Playa',
      category: 'ZONA DE PLAYA',
      unit: 'M²',
      rendimiento: 500,
      requiere_rendimiento: true,
      priority: 'must_execute',
      effective_from: '2026-01-01',
      effective_to: null,
      version: 1,
      source: 'standard',
      created_at: '2026-01-01',
    },
    {
      id: 'std-2',
      board_id: 'board-1',
      group_id: null,
      activity_key: '1.11',
      name: 'Oxigenación mecánica',
      category: 'ZONA DE PLAYA',
      unit: 'M²',
      rendimiento: 4000,
      requiere_rendimiento: true,
      priority: 'preferred',
      effective_from: '2026-01-01',
      effective_to: null,
      version: 1,
      source: 'standard',
      created_at: '2026-01-01',
    },
  ];

  function baseProps(overrides: Partial<React.ComponentProps<typeof WeeklyPlannerView>> = {}) {
    return {
      boardId: 'board-1',
      plan: null,
      missingStandards: [],
      isLoading: false,
      isError: false,
      error: null,
      group: { id: 'group-1', title: 'PLAYA DEL COUNTRY' },
      weekStart: new Date('2026-09-07T00:00:00Z'),
      savedPlan: mockSavedPlan,
      savedPlanItems: mockSavedItems,
      siteDailyCapacity: 5.39,
      standards: mockStandards,
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

  // ---------------------------------------------------------------------------
  // B1: Tabla muestra weekly_plan_items y estado real del plan
  // ---------------------------------------------------------------------------
  describe('B1: Visualización del plan guardado y sus items', () => {
    it('muestra el estado del plan guardado ("Publicado") y NO muestra "Sin guardar"', () => {
      render(<WeeklyPlannerView {...baseProps()} />);
      expect(screen.getByText('Publicado')).toBeInTheDocument();
      expect(screen.queryByText('Sin guardar')).not.toBeInTheDocument();
    });

    it('muestra las actividades guardadas en weekly_plan_items con cantidades y rendimientos', () => {
      render(<WeeklyPlannerView {...baseProps()} />);
      expect(screen.getByText('Limpieza de Playa')).toBeInTheDocument();
      expect(screen.getByText('Oxigenación mecánica')).toBeInTheDocument();
      expect(screen.getByText('1.000')).toBeInTheDocument(); // Qty 1000
      expect(screen.getAllByText('4.000').length).toBeGreaterThanOrEqual(1); // Qty / Rend 4000
      expect(screen.getByText('500')).toBeInTheDocument();   // Rend 500
    });
  });

  // ---------------------------------------------------------------------------
  // B2: Ocultar botón "GUARDAR PLAN" con plan existente
  // ---------------------------------------------------------------------------
  describe('B2: Ocultamiento del botón Guardar Plan', () => {
    it('con plan existente, no renderiza el botón "Guardar plan"', () => {
      render(<WeeklyPlannerView {...baseProps()} />);
      expect(screen.queryByRole('button', { name: /Guardar plan/i })).not.toBeInTheDocument();
    });

    it('sin plan existente (borrador nuevo), sí renderiza el botón "Guardar plan"', () => {
      const draftPlan: WeeklyPlanningContext = {
        week: { start: '2026-09-07', end: '2026-09-11', number: 1, working_days: 6 },
        zone: { id: 'group-1', name: 'PLAYA DEL COUNTRY', daily_capacity: 5.39, available_capacity: 32.34 },
        activities: [
          {
            activity_key: '1.01',
            name: 'Limpieza de Playa',
            category: 'ZONA DE PLAYA',
            priority: 'must_execute',
            qty: 1000,
            unit: 'M²',
            rendimiento: 500,
            frecuencia: 25,
            theoretical_journals_month: 8.0,
            theoretical_journals_week: 2.0,
            rules: [],
          },
        ],
        capacity: { weekly_available: 32.34, weekly_required: 2.0, feasible: true, deficit: 0 },
        constraints: { incompatible_pairs: [], dependencies: [], weather_sensitive: [] },
      };

      render(<WeeklyPlannerView {...baseProps({ savedPlan: undefined, savedPlanItems: undefined, plan: draftPlan })} />);
      expect(screen.getByRole('button', { name: /Guardar plan/i })).toBeInTheDocument();
      expect(screen.getByText('Sin guardar')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // B3: Panel de Capacidad basado en site_daily_capacity × días hábiles
  // ---------------------------------------------------------------------------
  describe('B3: Panel de capacidad y cómputo de jornales', () => {
    it('calcula la capacidad como site_daily_capacity × días hábiles y desglosa máquina vs conteo', () => {
      const dailyDetails = [
        {
          dateStr: '2026-09-07',
          dayName: 'Lun',
          dayNumber: 1,
          isWorking: true,
          countingJournals: 2.0,
          machineJournals: 0.0,
          capacity: 5.39,
          deficit: 0,
          exceeded: false,
        },
        {
          dateStr: '2026-09-08',
          dayName: 'Mar',
          dayNumber: 2,
          isWorking: true,
          countingJournals: 0.0,
          machineJournals: 1.0,
          capacity: 5.39,
          deficit: 0,
          exceeded: false,
        },
        {
          dateStr: '2026-09-09',
          dayName: 'Mié',
          dayNumber: 3,
          isWorking: true,
          countingJournals: 0.0,
          machineJournals: 0.0,
          capacity: 5.39,
          deficit: 0,
          exceeded: false,
        },
        {
          dateStr: '2026-09-10',
          dayName: 'Jue',
          dayNumber: 4,
          isWorking: true,
          countingJournals: 0.0,
          machineJournals: 0.0,
          capacity: 5.39,
          deficit: 0,
          exceeded: false,
        },
        {
          dateStr: '2026-09-11',
          dayName: 'Vie',
          dayNumber: 5,
          isWorking: true,
          countingJournals: 0.0,
          machineJournals: 0.0,
          capacity: 5.39,
          deficit: 0,
          exceeded: false,
        },
        {
          dateStr: '2026-09-12',
          dayName: 'Sáb',
          dayNumber: 6,
          isWorking: true,
          countingJournals: 0.0,
          machineJournals: 0.0,
          capacity: 5.39,
          deficit: 0,
          exceeded: false,
        },
      ];

      render(
        <CapacitySummary
          siteDailyCapacity={5.39}
          workingDaysCount={6}
          dailyDetails={dailyDetails}
          zoneName="PLAYA DEL COUNTRY"
        />
      );

      // 5.39 * 6 = 32.34 JR disponible
      expect(screen.getByText('32.34 JR')).toBeInTheDocument();
      // Requerido: 2.00 JR que cuentan
      expect(screen.getByText('2.00 JR')).toBeInTheDocument();
      // Máquina informada por separado
      expect(screen.getByText(/\+1\.00 JR de máquina/)).toBeInTheDocument();
      // Estado factible
      expect(screen.getByText('Capacidad Factible')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // B4: Tolerancia 0.005 en la verificación de capacidad
  // ---------------------------------------------------------------------------
  describe('B4: Tolerancia de 0.005 en límites de capacidad', () => {
    it('un día exactamente en el límite o con diferencia <= 0.005 NO se considera excedido', () => {
      const dailyDetailsTolerance = [
        {
          dateStr: '2026-09-07',
          dayName: 'Lun',
          dayNumber: 1,
          isWorking: true,
          countingJournals: 5.394, // 5.394 - 5.39 = 0.004 <= 0.005 -> NO excedido
          machineJournals: 0.0,
          capacity: 5.39,
          deficit: 0,
          exceeded: false,
        },
      ];

      render(
        <CapacitySummary
          siteDailyCapacity={5.39}
          workingDaysCount={1}
          dailyDetails={dailyDetailsTolerance}
          zoneName="PLAYA DEL COUNTRY"
        />
      );

      expect(screen.getByText('Capacidad Factible')).toBeInTheDocument();
      expect(screen.queryByText(/Déficit detectado/)).not.toBeInTheDocument();
    });

    it('un día con carga > capacidad + 0.005 SÍ se marca como excedido con déficit', () => {
      const dailyDetailsExceeded = [
        {
          dateStr: '2026-09-07',
          dayName: 'Lun',
          dayNumber: 1,
          isWorking: true,
          countingJournals: 7.0, // 7.0 > 5.39 + 0.005
          machineJournals: 0.0,
          capacity: 5.39,
          deficit: 1.61,
          exceeded: true,
        },
      ];

      render(
        <CapacitySummary
          siteDailyCapacity={5.39}
          workingDaysCount={1}
          dailyDetails={dailyDetailsExceeded}
          zoneName="PLAYA DEL COUNTRY"
        />
      );

      expect(screen.getByText('Déficit de Capacidad')).toBeInTheDocument();
      expect(screen.getByText(/1\.61 JR/)).toBeInTheDocument();
    });
  });
});
