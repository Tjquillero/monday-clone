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

describe('SITE ACTIVITIES VIEW LEVEL 2 (ActividadesView Unit Tests)', () => {
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
        executed_qty: 0, // PENDIENTE 🔴
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
        executed_qty: 0, // PENDIENTE 🔴
        executed_jr: 0,
        planned_date: '2026-09-09', // Miércoles
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
        executed_qty: 100, // EN EJECUCIÓN 🟠
        executed_jr: 0.5,
        planned_date: '2026-09-07',
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
        executed_qty: 10, // COMPLETADA 🟢
        executed_jr: 1.0,
        planned_date: '2026-10-15',
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
        standard: { name: 'Actividad Huérfana', category: 'GENERAL', unit: 'unid' },
      },
    ],
  };

  it('Caso 1: debe renderizar la cabecera del sitio aislado con el total de actividades', () => {
    render(<ActividadesView plans={[mockPlan]} selectedGroupId="group-1" />);
    expect(screen.getByText('PLAZA PUERTO COLOMBIA')).toBeInTheDocument();
    expect(screen.getByText('4 actividades totales')).toBeInTheDocument();
  });

  it('Caso 2: debe ordenar y clasificar las actividades en 3 secciones estrictas: Pendientes, En Ejecución, Completadas', () => {
    render(<ActividadesView plans={[mockPlan]} selectedGroupId="group-1" />);
    expect(screen.getByText('Pendientes (2)')).toBeInTheDocument();
    expect(screen.getByText('En Ejecución (1)')).toBeInTheDocument();
    expect(screen.getByText('Completadas (1)')).toBeInTheDocument();
  });

  it('Caso 3: debe renderizar el botón principal explícito REGISTRAR EJECUCIÓN para actividades pendientes', () => {
    render(<ActividadesView plans={[mockPlan]} selectedGroupId="group-1" />);
    const registrarButtons = screen.getAllByRole('button', { name: /REGISTRAR EJECUCIÓN/i });
    expect(registrarButtons.length).toBe(2);
  });

  it('Caso 4: debe renderizar el botón CONTINUAR REGISTRO para la actividad en ejecución', () => {
    render(<ActividadesView plans={[mockPlan]} selectedGroupId="group-1" />);
    expect(screen.getByRole('button', { name: /CONTINUAR REGISTRO/i })).toBeInTheDocument();
  });

  it('Caso 5: debe renderizar el botón VER REGISTRO para la actividad completada', () => {
    render(<ActividadesView plans={[mockPlan]} selectedGroupId="group-1" />);
    expect(screen.getByRole('button', { name: /VER REGISTRO/i })).toBeInTheDocument();
  });

  it('Caso 6: debe mostrar la fecha programada en cada tarjeta de actividad sin perder la Actividad Huérfana', () => {
    render(<ActividadesView plans={[mockPlan]} selectedGroupId="group-1" />);
    expect(screen.getByText('Actividad Huérfana')).toBeInTheDocument();
    expect(screen.getAllByText('Corte de césped').length).toBe(2);
  });
});
