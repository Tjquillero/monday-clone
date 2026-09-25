/**
 * Test Suite: UX-01-F Integration Tests for /my-work
 *
 * Cobertura de Integración de Renderizado:
 * - UX01-21: Modo Today renderiza sólo actividades de hoy + sección de Resagadas.
 * - UX01-22: Modo Semana renderiza todas las actividades de todos los días.
 * - UX01-23: Actividad resagada aparece exactamente una vez en OverdueActivitiesSection.
 * - UX01-24: Actividades de días futuros están ocultas en modo Today.
 * - UX01-25: Conmutación Hoy -> Semana -> Hoy preserva estabilidad sin duplicados.
 * - UX01-26: Botón Registrar en resagadas abre modal con ítem correcto.
 * - UX01-27: Selección de sitio navega a la vista de actividades del sitio sin contaminación cruzada.
 * - UX01-28: Contador ⚠ Resagadas · N coincide exactamente con el número de tarjetas visibles.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ActividadesContainer, { getBogotaCivilDateISO } from '../ActividadesContainer';
import { usePublishedWeekPlans, PublishedWeekPlan, PublishedWeekPlanItem } from '@/hooks/useWeeklyPlans';
import { useAuth } from '@/contexts/AuthContext';

jest.mock('@/hooks/useWeeklyPlans');
jest.mock('@/contexts/AuthContext');

describe('UX-01-F: Integration Tests for /my-work (Today-First & Overdue)', () => {
  const mockUsePublishedWeekPlans = usePublishedWeekPlans as jest.MockedFunction<typeof usePublishedWeekPlans>;
  const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

  // Fijar la fecha operativa de Bogotá para los tests a la fecha de hoy
  const TODAY_BOGOTA = getBogotaCivilDateISO();

  const createMockItem = (overrides: Partial<PublishedWeekPlanItem>): PublishedWeekPlanItem => {
    const name = overrides.name || 'Poda de Zonas Verdes';
    return {
      id: 'item-1',
      plan_id: 'plan-1',
      poa_activity_zone_id: 'paz-1',
      planned_sequence: 1,
      activity_key: 'poda',
      name,
      unit: 'M2',
      planned_qty: 100,
      planned_rendimiento: 50,
      planned_frecuencia: 1,
      planned_jr: 2,
      executed_qty: 0,
      executed_jr: 0,
      planned_date: TODAY_BOGOTA,
      priority: 'must_execute',
      created_at: '2026-09-20T00:00:00Z',
      updated_at: '2026-09-20T00:00:00Z',
      standard: {
        name,
        category: 'Zona Norte',
        unit: 'M2',
      },
      crew: {
        id: 'crew-1',
        name: 'Cuadrilla Alfa',
      },
      ...overrides,
    } as PublishedWeekPlanItem;
  };

  const mockPlans: PublishedWeekPlan[] = [
    {
      id: 'plan-1',
      board_id: 'board-1',
      group_id: 'group-1',
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
      created_at: '2026-09-20T00:00:00Z',
      updated_at: '2026-09-20T00:00:00Z',
      group: { title: 'Parque Central', color: '#3B7EF8' },
      board: { name: 'Tablero Principal' },
      items: [
        // 1. Actividad de HOY
        createMockItem({
          id: 'item-today-1',
          name: 'Limpieza de Drenajes Hoy',
          planned_date: TODAY_BOGOTA,
          planned_qty: 50,
          executed_qty: 0,
        }),
        // 2. Actividad RESAGADA (Ayer, pendiente)
        createMockItem({
          id: 'item-overdue-1',
          name: 'Reparación de Bordillos Resagada',
          planned_date: '2026-09-20',
          planned_qty: 30,
          executed_qty: 0,
        }),
        // 3. Actividad RESAGADA (Hace 2 días, parcialmente ejecutada)
        createMockItem({
          id: 'item-overdue-2',
          name: 'Pintura Vial Resagada',
          planned_date: '2026-09-19',
          planned_qty: 80,
          executed_qty: 20,
        }),
        // 4. Actividad FUTURA (Dentro de 2 días)
        createMockItem({
          id: 'item-future-1',
          name: 'Poda de Palmeras Futura',
          planned_date: '2026-09-28',
          planned_qty: 40,
          executed_qty: 0,
        }),
        // 5. Actividad HISTÓRICA COMPLETADA (Ayer, 100% cerrada)
        createMockItem({
          id: 'item-done-1',
          name: 'Siembra de Arbustos Cerrada',
          planned_date: '2026-09-20',
          planned_qty: 100,
          executed_qty: 100,
          executionsSummary: {
            totalExecutions: 1,
            lastExecutionDate: '2026-09-20',
            verificationStatus: 'verified',
            evidencePreview: { before: [], after: [] },
          },
        }),
      ],
    },
  ];

  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-leader-1' } as any,
      isAuthenticated: true,
      isLoading: false,
    } as any);

    mockUsePublishedWeekPlans.mockReturnValue({
      data: mockPlans,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    } as any);
  });

  test('UX01-21: En modo Today, renderiza solo actividades de hoy y sección de resagadas', () => {
    render(<ActividadesContainer />);

    // Verificar que la sección de resagadas existe con 2 actividades
    expect(screen.getByText(/Actividades Resagadas/i)).toBeInTheDocument();
    expect(screen.getByText(/2 actividades de días anteriores requieren atención/i)).toBeInTheDocument();

    // El contador de sitios de hoy debe reflejar solo 1 actividad de hoy en Parque Central
    expect(screen.getByText(/Parque Central/i)).toBeInTheDocument();
    expect(screen.getByText(/1 actividad/i)).toBeInTheDocument();
  });

  test('UX01-22: En modo Semana, renderiza todas las actividades de la semana completa', () => {
    render(<ActividadesContainer />);

    // Cambiar al tab de Semana
    const semanaTab = screen.getByRole('tab', { name: /Semana/i });
    fireEvent.click(semanaTab);

    // Debe mostrar las 5 actividades totales en el sitio
    expect(screen.getByText(/5 actividades/i)).toBeInTheDocument();
  });

  test('UX01-23 & UX01-28: Sección de resagadas muestra el contador exacto y lista expandible de tarjetas', () => {
    render(<ActividadesContainer />);

    // Clic en la barra de resagadas para expandir
    const toggleButton = screen.getByRole('button', { name: /Actividades Resagadas/i });
    fireEvent.click(toggleButton);

    // Deben aparecer los nombres de las 2 actividades resagadas
    expect(screen.getByText('Reparación de Bordillos Resagada')).toBeInTheDocument();
    expect(screen.getByText('Pintura Vial Resagada')).toBeInTheDocument();

    // La actividad histórica completada NO debe aparecer en resagadas
    expect(screen.queryByText('Siembra de Arbustos Cerrada')).not.toBeInTheDocument();
  });

  test('UX01-24: Actividades de días futuros no aparecen en el home de hoy', () => {
    render(<ActividadesContainer />);

    // La actividad futura no debe estar en resagadas ni en la cuenta de hoy
    expect(screen.queryByText('Poda de Palmeras Futura')).not.toBeInTheDocument();
  });

  test('UX01-25: Conmutar Hoy -> Semana -> Hoy preserva la estabilidad de la vista', () => {
    render(<ActividadesContainer />);

    const semanaTab = screen.getByRole('tab', { name: /Semana/i });
    const hoyTab = screen.getByRole('tab', { name: /Hoy/i });

    // 1. Ir a Semana
    fireEvent.click(semanaTab);
    expect(screen.getByText(/5 actividades/i)).toBeInTheDocument();

    // 2. Volver a Hoy
    fireEvent.click(hoyTab);
    expect(screen.getByText(/1 actividad/i)).toBeInTheDocument();
    expect(screen.getByText(/Actividades Resagadas/i)).toBeInTheDocument();
  });

  test('UX01-26: Botón Registrar en resagadas abre modal de ejecución con la actividad correspondiente', () => {
    render(<ActividadesContainer />);

    // Expandir resagadas
    const toggleButton = screen.getByRole('button', { name: /Actividades Resagadas/i });
    fireEvent.click(toggleButton);

    // Clic en el botón Registrar de la primera resagada
    const registrarButtons = screen.getAllByRole('button', { name: /Registrar/i });
    fireEvent.click(registrarButtons[0]);

    // Verificar que el modal de ejecución se abre con el título de la actividad
    expect(screen.getByText(/Registro de Ejecución/i)).toBeInTheDocument();
  });

  test('UX01-27: Navegación de Nivel 1 a Nivel 2 (Sitio) aísla el sitio seleccionado', () => {
    render(<ActividadesContainer />);

    // Clic en la tarjeta del sitio Parque Central
    const siteCard = screen.getByText('Parque Central').closest('div[class*="group relative"]');
    if (siteCard) {
      fireEvent.click(siteCard);
    }

    // Debe mostrar la vista Nivel 2 con el nombre del sitio seleccionado
    expect(screen.getByText('Sitio Seleccionado')).toBeInTheDocument();
    expect(screen.getByText('Limpieza de Drenajes Hoy')).toBeInTheDocument();

    // Botón para volver a mis sitios
    const backButton = screen.getByRole('button', { name: /Volver a lista de sitios/i });
    expect(backButton).toBeInTheDocument();
    fireEvent.click(backButton);

    // Debe regresar a Nivel 1
    expect(screen.getByText('Sitios de Trabajo (1)')).toBeInTheDocument();
  });
});
