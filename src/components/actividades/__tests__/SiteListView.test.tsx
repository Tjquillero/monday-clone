import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SiteListView, { computeSiteSummaries } from '../SiteListView';
import { PublishedWeekPlan } from '@/hooks/useWeeklyPlans';

describe('SITE LIST VIEW LEVEL 1 (Unit Tests)', () => {
  const mockPlans: PublishedWeekPlan[] = [
    {
      id: 'plan-plaza',
      board_id: 'board-1',
      group_id: 'group-plaza',
      week_start: '2026-09-21',
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
      group: { title: 'PLAZA PUERTO COLOMBIA', color: '#579bfc' },
      board: { name: 'Tablero Principal' },
      items: [
        {
          id: 'item-1',
          plan_id: 'plan-plaza',
          planned_sequence: 1,
          activity_key: 'poda',
          poa_activity_zone_id: 'paz-1',
          planned_rendimiento: 100,
          planned_frecuencia: 1,
          priority: 'must_execute',
          planned_qty: 1850,
          unit: 'M2',
          planned_jr: 9.25,
          executed_qty: 0, // PENDIENTE 🔴
          executed_jr: 0,
          planned_date: '2026-09-22',
          created_at: '2026-09-01T00:00:00Z',
          updated_at: '2026-09-01T00:00:00Z',
          standard: { name: 'Poda y Mantenimiento de Zonas Verdes', category: 'ZONA VERDE', unit: 'M2' },
        },
        {
          id: 'item-2',
          plan_id: 'plan-plaza',
          planned_sequence: 2,
          activity_key: 'luminarias',
          poa_activity_zone_id: 'paz-2',
          planned_rendimiento: 50,
          planned_frecuencia: 1,
          priority: 'preferred',
          planned_qty: 350,
          unit: 'UN',
          planned_jr: 7.0,
          executed_qty: 350, // COMPLETADA 🟢
          executed_jr: 7.0,
          planned_date: '2026-09-22',
          created_at: '2026-09-01T00:00:00Z',
          updated_at: '2026-09-01T00:00:00Z',
          standard: { name: 'Mantenimiento de Luminarias', category: 'ILUMINACIÓN', unit: 'UN' },
        },
      ],
    },
    {
      id: 'plan-parque',
      board_id: 'board-1',
      group_id: 'group-parque',
      week_start: '2026-09-21',
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
      group: { title: 'PARQUE CENTRAL', color: '#00c875' },
      board: { name: 'Tablero Principal' },
      items: [
        {
          id: 'item-parque-1',
          plan_id: 'plan-parque',
          planned_sequence: 1,
          activity_key: 'senderos',
          poa_activity_zone_id: 'paz-3',
          planned_rendimiento: 200,
          planned_frecuencia: 1,
          priority: 'preferred',
          planned_qty: 500,
          unit: 'M2',
          planned_jr: 2.5,
          executed_qty: 500, // COMPLETADA 🟢
          executed_jr: 2.5,
          planned_date: '2026-09-22',
          created_at: '2026-09-01T00:00:00Z',
          updated_at: '2026-09-01T00:00:00Z',
          standard: { name: 'Limpieza de senderos', category: 'ZONA DURA', unit: 'M2' },
        },
      ],
    },
  ];

  it('SLV-01: debe calcular correctamente los contadores de pendientes y completadas por sitio', () => {
    const summaries = computeSiteSummaries(mockPlans);
    expect(summaries.length).toBe(2);

    const plaza = summaries.find((s) => s.groupId === 'group-plaza');
    expect(plaza?.pendingCount).toBe(1);
    expect(plaza?.completedCount).toBe(1);

    const parque = summaries.find((s) => s.groupId === 'group-parque');
    expect(parque?.pendingCount).toBe(0);
    expect(parque?.completedCount).toBe(1);
  });

  it('SLV-02: debe priorizar visualmente en primer lugar los sitios con actividades pendientes', () => {
    const summaries = computeSiteSummaries(mockPlans);
    // Plaza Puerto Colombia tiene pendientes -> debe estar primero que Parque Central (todo completado)
    expect(summaries[0].groupId).toBe('group-plaza');
    expect(summaries[1].groupId).toBe('group-parque');
  });

  it('SLV-03: debe invocar la acción onSelectSite al tocar la tarjeta del sitio o el botón VER SITIO', () => {
    const handleSelectSite = jest.fn();
    render(<SiteListView plans={mockPlans} onSelectSite={handleSelectSite} />);

    expect(screen.getByText('PLAZA PUERTO COLOMBIA')).toBeInTheDocument();
    expect(screen.getByText('PARQUE CENTRAL')).toBeInTheDocument();

    const verSitioButtons = screen.getAllByRole('button', { name: /VER SITIO/i });
    fireEvent.click(verSitioButtons[0]);

    expect(handleSelectSite).toHaveBeenCalledWith('group-plaza');
  });
});
