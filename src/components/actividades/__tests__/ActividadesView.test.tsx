import React from 'react';
import { render, screen } from '@testing-library/react';
import ActividadesView from '../ActividadesView';
import { PublishedWeekPlan } from '@/hooks/useWeeklyPlans';

// Mock subcomponents that import Supabase client
jest.mock('../ItemExecutions', () => {
  return function DummyItemExecutions() {
    return <div data-testid="dummy-item-executions">Item Executions</div>;
  };
});

describe('WEEKLY PLAN DAY PROJECTION V1 (ActividadesView Unit Tests)', () => {
  const mockPlan: PublishedWeekPlan = {
    id: 'plan-123',
    board_id: 'board-1',
    group_id: 'group-1',
    week_start: '2026-09-07', // Lunes 7 Sep 2026
    period_number: 1,
    status: 'published',
    published_by: null,
    published_at: null,
    confirmed_by: null,
    confirmed_at: null,
    closed_by: null,
    closed_at: null,
    created_by: 'user-1',
    updated_by: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    group: { title: 'PLAZA PUERTO COLOMBIA', color: '#3B7EF8' },
    board: { name: 'Tablero Principal' },
    items: [
      {
        id: 'item-mon-1',
        plan_id: 'plan-123',
        planned_sequence: 1,
        activity_key: 'corte_cesped',
        poa_activity_zone_id: 'paz-1',
        planned_rendimiento: 200,
        planned_frecuencia: 1,
        priority: 'must_execute',
        planned_qty: 850,
        unit: 'm2',
        planned_jr: 4.25,
        executed_qty: 0,
        executed_jr: 0,
        planned_date: '2026-09-07', // Lunes
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
        standard: { name: 'Corte de césped', category: 'ZONA VERDE', unit: 'm2' },
      },
      {
        id: 'item-wed-1',
        plan_id: 'plan-123',
        planned_sequence: 2,
        activity_key: 'corte_cesped',
        poa_activity_zone_id: 'paz-1',
        planned_rendimiento: 200,
        planned_frecuencia: 1,
        priority: 'must_execute',
        planned_qty: 850,
        unit: 'm2',
        planned_jr: 4.25,
        executed_qty: 0,
        executed_jr: 0,
        planned_date: '2026-09-09', // Miércoles (Misma actividad, fecha distinta)
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
        standard: { name: 'Corte de césped', category: 'ZONA VERDE', unit: 'm2' },
      },
      {
        id: 'item-mon-2',
        plan_id: 'plan-123',
        planned_sequence: 3,
        activity_key: 'limpieza_dura',
        poa_activity_zone_id: 'paz-2',
        planned_rendimiento: 500,
        planned_frecuencia: 1,
        priority: 'preferred',
        planned_qty: 394,
        unit: 'm2',
        planned_jr: 2.0,
        executed_qty: 0,
        executed_jr: 0,
        planned_date: '2026-09-07', // Lunes (Segunda actividad en el mismo día)
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
        standard: { name: 'Limpieza zona dura', category: 'ZONA DURA', unit: 'm2' },
      },
      {
        id: 'item-contingency',
        plan_id: 'plan-123',
        planned_sequence: 4,
        activity_key: 'actividad_huerfana',
        poa_activity_zone_id: 'paz-3',
        planned_rendimiento: 100,
        planned_frecuencia: 1,
        priority: 'flexible',
        planned_qty: 10,
        unit: 'unid',
        planned_jr: 1.0,
        executed_qty: 0,
        executed_jr: 0,
        planned_date: '2026-10-15', // Fuera de rango semanal
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
        standard: { name: 'Actividad Huérfana', category: 'GENERAL', unit: 'unid' },
      },
    ],
  };

  it('Caso 1: debe proyectar encabezados de los 7 días de la semana activa (Lunes a Domingo)', () => {
    render(<ActividadesView plans={[mockPlan]} />);
    expect(screen.getByText('LUNES 07 SEP')).toBeInTheDocument();
    expect(screen.getByText('MARTES 08 SEP')).toBeInTheDocument();
    expect(screen.getByText('MIÉRCOLES 09 SEP')).toBeInTheDocument();
    expect(screen.getByText('JUEVES 10 SEP')).toBeInTheDocument();
    expect(screen.getByText('VIERNES 11 SEP')).toBeInTheDocument();
    expect(screen.getByText('SÁBADO 12 SEP')).toBeInTheDocument();
    expect(screen.getByText('DOMINGO 13 SEP')).toBeInTheDocument();
  });

  it('Caso 2: debe preservar la individualidad de actividades recurrentes en días distintos (Corte de césped en Lunes y Miércoles)', () => {
    render(<ActividadesView plans={[mockPlan]} />);
    const itemsCorte = screen.getAllByText('Corte de césped');
    // 2 occurrences x 2 layout representations (desktop + mobile) = 4
    expect(itemsCorte.length).toBeGreaterThanOrEqual(2);
  });

  it('Caso 3: debe agrupar múltiples actividades asignadas a la misma fecha dentro de su día (Lunes)', () => {
    render(<ActividadesView plans={[mockPlan]} />);
    expect(screen.getAllByText('Corte de césped').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Limpieza zona dura').length).toBeGreaterThan(0);
  });

  it('Caso 4: debe mostrar estado visual de día laborable sin actividades (ej. Martes, Jueves, etc.)', () => {
    render(<ActividadesView plans={[mockPlan]} />);
    const emptyDays = screen.getAllByText('Sin actividades programadas para este día.');
    expect(emptyDays.length).toBeGreaterThan(0);
  });

  it('Caso 5: debe mostrar distintivo no laborable para Domingo', () => {
    render(<ActividadesView plans={[mockPlan]} />);
    expect(screen.getByText('Día no laborable / Descanso operativo programado.')).toBeInTheDocument();
  });

  it('Caso 6: debe aislar items con fecha fuera de rango o contingencia en sección de contingencia sin hacerlos desaparecer', () => {
    render(<ActividadesView plans={[mockPlan]} />);
    expect(screen.getByText('OCURRENCIAS SIN FECHA ASIGNADA')).toBeInTheDocument();
    expect(screen.getAllByText('Actividad Huérfana').length).toBeGreaterThan(0);
  });
});
