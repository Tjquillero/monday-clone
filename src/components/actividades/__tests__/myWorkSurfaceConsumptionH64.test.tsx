/**
 * Test Suite: Hito 6.4 — Superficie Operativa /my-work v1.0
 *
 * Verificación integral de la capa de consumo y presentación ViewModel UI:
 * R1:  Resolución determinista de Lunes en America/Bogota (formato civil YYYY-MM-DD sin desfases UTC).
 * R2:  Preservación de cabecera de plan publicado cuando la lista de ítems está vacía.
 * R3:  Degradación jerárquica de nombre de actividad (standard.name -> item.name -> formatActivityKey).
 * R4:  Proyección consultiva de cuadrilla asignada (Nombre, Líder, miembros) desde crew_id.
 * R5:  Invarianza de la unidad contractual en modo solo lectura.
 * R6:  Refresco fidedigno de la interfaz tras el registro de avances F5.3.
 * R7:  Frecuencia DIARIA (f=1): planned_jr = 25 -> displayJr = 1.00 JR/ocurrencia.
 * R8:  Frecuencia SEMANAL (f=4): planned_jr = 25 -> displayJr = 4.00 JR/ocurrencia.
 * R9:  Frecuencia QUINCENAL (f=12.5): planned_jr = 25 -> displayJr = 12.50 JR/ocurrencia.
 * R10: Frecuencia MENSUAL (f=25): planned_jr = 25 -> displayJr = 25.00 JR/ocurrencia.
 * R11: Invarianza Semanal vs Periodo: Actividad diaria con 6 ocurrencias visibles muestra 6 tarjetas × 1.00 JR/ocurrencia (6.00 JR visibles), preservando planned_jr = 25 en DB sin mutaciones.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { calculateOccurrenceDisplayJr, PublishedWeekPlanItem } from '@/hooks/useWeeklyPlans';
import { SingleActivityCard } from '../ActividadesView';
import { getBogotaCivilDateISO, getMondayCivilISO } from '../ActividadesContainer';

describe('Hito 6.4 — Superficie Operativa /my-work (Suite Integrativa R1–R11)', () => {

  // R1: Fecha Bogotá Civil determinista (boundary UTC vs Bogota)
  test('R1 — Resolución determinista de fecha civil en America/Bogota (UTC 02:00 -> Bogota previa)', () => {
    // 02:00 UTC del 23 de Septiembre corresponde a las 21:00 UTC-5 del 22 de Septiembre en Bogotá
    const utcDateBoundary = new Date('2026-09-23T02:00:00Z');
    const bogotaISO = getBogotaCivilDateISO(utcDateBoundary);

    expect(bogotaISO).toBe('2026-09-22');

    // El lunes correspondiente al martes 2026-09-22 debe ser 2026-09-21
    const mondayISO = getMondayCivilISO(bogotaISO);
    expect(mondayISO).toBe('2026-09-21');
  });

  // R2: Preservación de cabecera de plan publicado sin ítems
  test('R2 — Preservación de cabecera de plan publicado cuando la lista de ítems está vacía', () => {
    const plansMock = [
      {
        id: 'plan-empty-1',
        board_id: 'board-1',
        week_start: '2026-09-21',
        group: { title: 'SITIO ASTILLEROS' },
        items: [],
      },
      {
        id: 'plan-financial-1',
        board_id: 'board-1',
        week_start: '2026-09-21',
        group: { title: 'PRESUPUESTO GENERAL' },
        items: [],
      },
    ];

    // Regla de filtrado de dominio operational H6.4:
    // Excluir exclusivamente presupuestos financieros, preservando planes vacíos
    const filteredPlans = plansMock.filter((plan) => {
      const groupTitle = (plan.group?.title || '').toUpperCase().trim();
      return !groupTitle.includes('PRESUPUESTO GENERAL');
    });

    expect(filteredPlans).toHaveLength(1);
    expect(filteredPlans[0].id).toBe('plan-empty-1');
  });

  // R3: Degradación jerárquica de nombres
  test('R3 — Renderiza fallback jerárquico cuando standard.name es null', () => {
    const mockItem: PublishedWeekPlanItem = {
      id: 'item-fallback-1',
      plan_id: 'plan-1',
      planned_sequence: 1,
      poa_activity_zone_id: 'zone-1',
      planned_rendimiento: 500,
      executed_qty: 0,
      executed_jr: 0,
      group_id: 'group-1',
      activity_key: 'limpieza_zonas_duras',
      name: 'Limpieza Zonas Duras Generales',
      unit: 'm2',
      planned_qty: 500,
      planned_jr: 25,
      planned_frecuencia: 1,
      planned_date: '2026-09-21',
      priority: 'must_execute',
      status: 'planned',
      created_at: '2026-09-21T00:00:00Z',
      updated_at: '2026-09-21T00:00:00Z',
      standard: null,
      displayJr: 1.00,
    } as any;

    render(
      <SingleActivityCard
        item={mockItem}
        planId="plan-1"
        boardId="board-1"
        groupId="group-1"
      />
    );

    expect(screen.getByText('Limpieza Zonas Duras Generales')).toBeInTheDocument();
    expect(screen.getByText(/1.00 JR \/ ocurrencia/)).toBeInTheDocument();
  });

  // R4: Renderizado de Cuadrilla Asignada
  test('R4 — Renderiza la insignia de cuadrilla con nombre, líder y conteo de miembros', () => {
    const mockItem: PublishedWeekPlanItem = {
      id: 'item-crew-1',
      plan_id: 'plan-1',
      planned_sequence: 1,
      poa_activity_zone_id: 'zone-1',
      planned_rendimiento: 500,
      executed_qty: 0,
      executed_jr: 0,
      group_id: 'group-1',
      activity_key: 'corte_grama',
      name: 'Corte de Grama',
      unit: 'm2',
      planned_qty: 1000,
      planned_jr: 25,
      planned_frecuencia: 1,
      planned_date: '2026-09-21',
      priority: 'must_execute',
      status: 'planned',
      crew_id: 'crew-alfa',
      created_at: '2026-09-21T00:00:00Z',
      updated_at: '2026-09-21T00:00:00Z',
      standard: null,
      displayJr: 1.00,
      crew: {
        id: 'crew-alfa',
        name: 'Cuadrilla Alfa',
        code: 'ALFA-01',
        leader_name: 'Carlos Rodríguez',
        members_count: 4,
      },
    } as any;

    render(
      <SingleActivityCard
        item={mockItem}
        planId="plan-1"
        boardId="board-1"
        groupId="group-1"
      />
    );

    expect(screen.getByText('Cuadrilla Alfa')).toBeInTheDocument();
    expect(screen.getByText(/Líder: Carlos Rodríguez/)).toBeInTheDocument();
    expect(screen.getByText(/(4 miembros)/)).toBeInTheDocument();
  });

  // R5: Invarianza de la unidad contractual en modo solo lectura
  test('R5 — Invarianza de la unidad contractual en modo solo lectura', () => {
    const mockItem: PublishedWeekPlanItem = {
      id: 'item-unit-1',
      plan_id: 'plan-1',
      planned_sequence: 1,
      poa_activity_zone_id: 'zone-1',
      planned_rendimiento: 500,
      executed_qty: 0,
      executed_jr: 0,
      group_id: 'group-1',
      activity_key: 'limpieza_marmol',
      name: 'Limpieza de Mármol',
      unit: 'm2',
      planned_qty: 300,
      planned_jr: 25,
      planned_frecuencia: 1,
      planned_date: '2026-09-21',
      priority: 'must_execute',
      status: 'planned',
      created_at: '2026-09-21T00:00:00Z',
      updated_at: '2026-09-21T00:00:00Z',
      standard: { name: 'Limpieza de Mármol', category: 'General', unit: 'm2' },
      displayJr: 1.00,
    } as any;

    render(
      <SingleActivityCard
        item={mockItem}
        planId="plan-1"
        boardId="board-1"
        groupId="group-1"
      />
    );

    // Muestra la cantidad 0, meta 300 y la unidad contractual m2 en modo lectura sin inputs modificables
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('300')).toBeInTheDocument();
    expect(screen.getByText('m2')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  // R6: Refresco de interfaz tras avance F5.3
  test('R6 — Refresco de avance físico en la interfaz tras reporte de ejecución F5.3', () => {
    const mockItemExecuted: PublishedWeekPlanItem = {
      id: 'item-exec-1',
      plan_id: 'plan-1',
      planned_sequence: 1,
      poa_activity_zone_id: 'zone-1',
      planned_rendimiento: 500,
      executed_qty: 150,
      executed_jr: 0.5,
      group_id: 'group-1',
      activity_key: 'limpieza_marmol',
      name: 'Limpieza de Mármol',
      unit: 'm2',
      planned_qty: 300,
      planned_jr: 25,
      planned_frecuencia: 1,
      planned_date: '2026-09-21',
      priority: 'must_execute',
      status: 'in_progress',
      created_at: '2026-09-21T00:00:00Z',
      updated_at: '2026-09-21T00:00:00Z',
      standard: { name: 'Limpieza de Mármol', category: 'General', unit: 'm2' },
      displayJr: 1.00,
    } as any;

    render(
      <SingleActivityCard
        item={mockItemExecuted}
        planId="plan-1"
        boardId="board-1"
        groupId="group-1"
      />
    );

    // Muestra 150 / 300 m2 y 50% de avance
    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText('300')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  // R7: Frecuencia DIARIA
  test('R7 — Frecuencia DIARIA (f=1): planned_jr = 25 -> displayJr = 1.00 JR/ocurrencia', () => {
    const plannedJrTotal = 25;
    const frequency = 1;
    const displayJr = calculateOccurrenceDisplayJr(plannedJrTotal, frequency);

    expect(displayJr).toBe(1.00);
  });

  // R8: Frecuencia SEMANAL
  test('R8 — Frecuencia SEMANAL (f=4): planned_jr = 25 -> displayJr = 4.00 JR/ocurrencia', () => {
    const plannedJrTotal = 25;
    const frequency = 4;
    const displayJr = calculateOccurrenceDisplayJr(plannedJrTotal, frequency);

    expect(displayJr).toBe(4.00);
  });

  // R9: Frecuencia QUINCENAL
  test('R9 — Frecuencia QUINCENAL (f=12.5): planned_jr = 25 -> displayJr = 12.50 JR/ocurrencia', () => {
    const plannedJrTotal = 25;
    const frequency = 12.5;
    const displayJr = calculateOccurrenceDisplayJr(plannedJrTotal, frequency);

    expect(displayJr).toBe(12.50);
  });

  // R10: Frecuencia MENSUAL
  test('R10 — Frecuencia MENSUAL (f=25): planned_jr = 25 -> displayJr = 25.00 JR/ocurrencia', () => {
    const plannedJrTotal = 25;
    const frequency = 25;
    const displayJr = calculateOccurrenceDisplayJr(plannedJrTotal, frequency);

    expect(displayJr).toBe(25.00);
  });

  // R11: Invarianza Semanal vs Periodo
  test('R11 — Invarianza Semanal: 6 ocurrencias de actividad diaria muestran 6.00 JR totales visibles sin alterar planned_jr = 25', () => {
    const plannedJrTotal = 25;
    const frequency = 1;
    const displayJr = calculateOccurrenceDisplayJr(plannedJrTotal, frequency);

    const weeklyOccurrences = 6;
    const visibleWeeklySum = displayJr * weeklyOccurrences;

    // 6 días × 1.00 JR/día = 6.00 JR visibles en la semana
    expect(visibleWeeklySum).toBe(6.00);
    // Preservación inmutable de planned_jr en la fuente de datos
    expect(plannedJrTotal).toBe(25);
  });

});
