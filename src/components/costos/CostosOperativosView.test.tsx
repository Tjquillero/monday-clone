/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CostosOperativosView from './CostosOperativosView';
import type { WeeklyPlanningContext, PlanningActivity } from '@/types/scheduler';

function basePlan(overrides: Partial<WeeklyPlanningContext> = {}): WeeklyPlanningContext {
  return {
    week: { start: '2026-07-13', end: '2026-07-17', number: 2, working_days: 5 },
    zone: { id: 'zone-1', name: 'Zona Test', daily_capacity: 7, available_capacity: 35 },
    activities: [
      {
        activity_key: '1.09', name: 'Corte de troncos', category: 'ZONA DE PLAYA', priority: 'preferred',
        qty: 300, unit: 'UN', rendimiento: 20, frecuencia: 1,
        theoretical_journals_month: 15, theoretical_journals_week: 3.75, rules: [],
      },
      {
        activity_key: '2.01', name: 'Control de malezas', category: 'ZONA VERDE', priority: 'preferred',
        qty: 1850, unit: 'M2', rendimiento: 600, frecuencia: 1,
        theoretical_journals_month: 3.083, theoretical_journals_week: 0.77, rules: [],
      },
    ],
    capacity: { weekly_available: 35, weekly_required: 4.53, feasible: true, deficit: 0 },
    constraints: { incompatible_pairs: [], dependencies: [], weather_sensitive: [] },
    ...overrides,
  };
}

function baseProps(overrides: Partial<React.ComponentProps<typeof CostosOperativosView>> = {}) {
  return {
    boardId: 'board-1',
    group: { id: 'zone-1', title: 'Zona Test' },
    plan: basePlan(),
    costoJornal: 100000,
    isLoading: false,
    isError: false,
    error: null,
    ...overrides,
  };
}

describe('CostosOperativosView', () => {
  it('no inventa ninguna fórmula: JR/mes y costo vienen tal cual del plan (qty/rendimiento, ADR-0009)', () => {
    render(<CostosOperativosView {...baseProps()} />);
    // Corte de troncos: 15 JR × 100.000 = 1.500.000
    expect(screen.getByText('15.00')).toBeInTheDocument();
    expect(screen.getByText(/1\.500\.000/)).toBeInTheDocument();
  });

  it('ordena la tabla por costo mensual descendente', () => {
    render(<CostosOperativosView {...baseProps()} />);
    const rows = screen.getAllByRole('row').slice(1); // sin el header
    expect(rows[0]).toHaveTextContent('1.09'); // 15 JR > 3.08 JR → mayor costo primero
    expect(rows[1]).toHaveTextContent('2.01');
  });

  it('el resumen superior suma JR y costo de todas las actividades', () => {
    render(<CostosOperativosView {...baseProps()} />);
    // Total JR = 15 + 3.083 = 18.083 ≈ 18.1
    expect(screen.getByText('18.1')).toBeInTheDocument();
  });

  it('capacidad disponible = daily_capacity × 25 (WORKING_DAYS_MONTH), sin fórmula nueva', () => {
    render(<CostosOperativosView {...baseProps()} />);
    // zone.daily_capacity = 7 → 7 × 25 = 175 JR
    expect(screen.getByText('175 JR')).toBeInTheDocument();
  });

  it('sin grupo seleccionado, pide elegir un sitio', () => {
    render(<CostosOperativosView {...baseProps({ group: undefined })} />);
    expect(screen.getByText(/Selecciona un sitio/)).toBeInTheDocument();
  });

  it('plan sin actividades muestra el estado vacío, no una tabla vacía', () => {
    render(<CostosOperativosView {...baseProps({ plan: basePlan({ activities: [] }) })} />);
    expect(screen.getByText(/Sin actividades planificadas/)).toBeInTheDocument();
  });

  it('muestra el estado de error cuando isError es true', () => {
    render(<CostosOperativosView {...baseProps({ isError: true, error: new Error('fallo de red') })} />);
    expect(screen.getByText('fallo de red')).toBeInTheDocument();
  });

  it('costoJornal=0 muestra "Costo no disponible" en vez de $0 (nunca comunica costo real cero)', () => {
    render(<CostosOperativosView {...baseProps({ costoJornal: 0 })} />);
    expect(screen.getByText('Costo no disponible')).toBeInTheDocument();
    expect(screen.getAllByText('Pendiente').length).toBeGreaterThan(0);
    expect(screen.queryByText('$ 0')).not.toBeInTheDocument();
  });

  describe('Fase 2 — análisis', () => {
    it('calcula %JR y %Costo sin ninguna fórmula nueva (proporción sobre el total ya calculado)', () => {
      render(<CostosOperativosView {...baseProps()} />);
      // 15/18.083 ≈ 83.0% (%JR) y 1.500.000/1.808.300 ≈ 83.0% (%Costo) — aparece dos veces en la misma fila
      expect(screen.getAllByText('83.0%')).toHaveLength(2);
    });

    it('clic en un encabezado ordenable invierte el orden (asc/desc)', () => {
      render(<CostosOperativosView {...baseProps()} />);
      const rowsBefore = screen.getAllByRole('row').slice(1);
      expect(rowsBefore[0]).toHaveTextContent('1.09'); // desc por defecto

      fireEvent.click(screen.getByRole('button', { name: /Costo mensual/ }));
      const rowsAfter = screen.getAllByRole('row').slice(1);
      expect(rowsAfter[0]).toHaveTextContent('2.01'); // asc tras el clic
    });

    it('ordenar por Código ordena alfanuméricamente, no por costo (cada columna nueva empieza en descendente)', () => {
      render(<CostosOperativosView {...baseProps()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Código' }));
      const rows = screen.getAllByRole('row').slice(1);
      expect(rows[0]).toHaveTextContent('2.01'); // desc: "2.01" > "1.09"
      expect(rows[1]).toHaveTextContent('1.09');

      fireEvent.click(screen.getByRole('button', { name: 'Código' })); // segundo clic → asc
      const rowsAsc = screen.getAllByRole('row').slice(1);
      expect(rowsAsc[0]).toHaveTextContent('1.09');
      expect(rowsAsc[1]).toHaveTextContent('2.01');
    });

    it('marca Top 10 de forma independiente del ordenamiento visible (por impacto real, no por la columna elegida)', () => {
      const manyActivities: PlanningActivity[] = Array.from({ length: 12 }, (_, i) => ({
        activity_key: `9.${String(i).padStart(2, '0')}`,
        name: `Actividad ${i}`,
        category: 'ZONA VERDE',
        priority: 'preferred',
        qty: 100,
        unit: 'M2',
        rendimiento: 10,
        frecuencia: 1,
        theoretical_journals_month: 100 - i, // decreciente: la #11 y #12 quedan fuera del Top 10
        theoretical_journals_week: 0,
        rules: [],
      }));
      render(<CostosOperativosView {...baseProps({ plan: { ...basePlan(), activities: manyActivities } })} />);
      expect(screen.getAllByText('Top 10')).toHaveLength(10);
      expect(screen.queryByText('Actividad 10')).toBeInTheDocument(); // existe la fila...
      const row11 = screen.getByText('Actividad 10').closest('tr');
      expect(row11).not.toHaveTextContent('Top 10'); // ...pero sin la marca
    });

    it('con costoJornal=0, el semáforo y el Top 10 usan %JR en vez de %Costo (columna %Costo muestra "—")', () => {
      render(<CostosOperativosView {...baseProps({ costoJornal: 0 })} />);
      expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    });

    it('con costoJornal=0, el orden por defecto no degenera en un no-op — usa JR (todo costo es 0, ordenar "por costo" sería ordenar por nada)', () => {
      render(<CostosOperativosView {...baseProps({ costoJornal: 0 })} />);
      const rows = screen.getAllByRole('row').slice(1);
      expect(rows[0]).toHaveTextContent('1.09'); // 15 JR > 3.08 JR — sigue siendo el primero aunque el costo sea 0 para ambos
    });

    it('el encabezado de la tabla queda con posición fija (sticky) para desplazamiento largo', () => {
      const { container } = render(<CostosOperativosView {...baseProps()} />);
      const thead = container.querySelector('thead');
      expect(thead).toHaveClass('sticky');
    });
  });
});
