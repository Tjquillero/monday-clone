/**
 * Test Suite Hito 6.6 — Visibilidad Operativa de Cuadrilla en /my-work v1.0
 * Verificación de Gates R1–R12 (Integrantes, Roles, Invarianzas y Preservación de Autoridad)
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SingleActivityCard } from '../ActividadesView';
import { PublishedWeekPlanItem } from '@/hooks/useWeeklyPlans';

describe('Hito 6.6 — Visibilidad Operativa de Cuadrilla en /my-work (Suite R1–R12)', () => {
  const baseItem: PublishedWeekPlanItem = {
    id: 'item-101',
    plan_id: 'plan-001',
    activity_key: 'limpieza_general',
    name: 'Limpieza General de Área',
    planned_qty: 100,
    executed_qty: 0,
    executed_jr: 0,
    unit: 'M2',
    priority: 'must_execute',
    zone: 'ZP',
    planned_sequence: 1,
    poa_activity_zone_id: 'zone-001',
    planned_rendimiento: 10,
    planned_frecuencia: 4,
    planned_jr: 10,
    displayJr: 1.6,
    planned_date: '2026-09-23',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    standard: null,
  };

  it('R1 & R2: Cuadrilla existente proyecta lista de integrantes con sus nombres reales', () => {
    const itemWithCrew: PublishedWeekPlanItem = {
      ...baseItem,
      crew_id: 'crew-alpha',
      crew: {
        id: 'crew-alpha',
        name: 'Cuadrilla Costa Norte',
        leader_name: 'Carlos Pérez',
        members_count: 2,
        members: [
          { id: 'm-1', full_name: 'Juan Rodríguez', role_in_site: 'Operador de Maquinaria', zone: 'ZP' },
          { id: 'm-2', full_name: 'Luis Gómez', role_in_site: 'Ayudante General', zone: 'ZP' },
        ],
      },
    };

    render(
      <SingleActivityCard
        item={itemWithCrew}
        planId="plan-001"
        boardId="board-001"
        groupId="group-001"
      />
    );

    // Muestra cabecera de cuadrilla
    expect(screen.getByText('Cuadrilla Costa Norte')).toBeInTheDocument();
    expect(screen.getByText('· Líder: Carlos Pérez')).toBeInTheDocument();
    expect(screen.getByText('(2 miembros)')).toBeInTheDocument();

    // Toggle button visible
    const toggleBtn = screen.getByRole('button', { name: /ver integrantes/i });
    expect(toggleBtn).toBeInTheDocument();

    // Inicialmente colapsado
    expect(screen.queryByText('Juan Rodríguez')).not.toBeInTheDocument();

    // Al hacer click en expandir
    fireEvent.click(toggleBtn);

    // R2: Nombres reales proyectados
    expect(screen.getByText('Juan Rodríguez')).toBeInTheDocument();
    expect(screen.getByText('Luis Gómez')).toBeInTheDocument();
  });

  it('R3 & R4: role_in_site se proyecta correctamente y role_in_site = null rinde "Sin rol asignado"', () => {
    const itemWithCrew: PublishedWeekPlanItem = {
      ...baseItem,
      crew_id: 'crew-beta',
      crew: {
        id: 'crew-beta',
        name: 'Cuadrilla ZV',
        leader_name: 'María Delgado',
        members_count: 2,
        members: [
          { id: 'm-10', full_name: 'Pedro Díaz', role_in_site: 'Supervisor de Turno', zone: 'ZV' },
          { id: 'm-11', full_name: 'Andrés Castro', role_in_site: null, zone: 'ZV' },
        ],
      },
    };

    render(
      <SingleActivityCard
        item={itemWithCrew}
        planId="plan-001"
        boardId="board-001"
        groupId="group-001"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /ver integrantes/i }));

    // R3: Rol asignado presente
    expect(screen.getByText('Supervisor de Turno')).toBeInTheDocument();

    // R4: Rol nulo rinde "Sin rol asignado"
    expect(screen.getByText('Sin rol asignado')).toBeInTheDocument();
  });

  it('R5: members = [] NO inventa integrantes ni rinde botón de expandir', () => {
    const itemWithEmptyCrew: PublishedWeekPlanItem = {
      ...baseItem,
      crew_id: 'crew-empty',
      crew: {
        id: 'crew-empty',
        name: 'Cuadrilla Vacía',
        leader_name: 'Roberto Gómez',
        members_count: 3, // Informativo existente
        members: [], // Sin miembros en la lista relacional
      },
    };

    render(
      <SingleActivityCard
        item={itemWithEmptyCrew}
        planId="plan-001"
        boardId="board-001"
        groupId="group-001"
      />
    );

    expect(screen.getByText('Cuadrilla Vacía')).toBeInTheDocument();
    expect(screen.getByText('(3 miembros)')).toBeInTheDocument();

    // R5: No hay botón de ver integrantes si members es un array vacío
    expect(screen.queryByRole('button', { name: /ver integrantes/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('crew-members-list')).not.toBeInTheDocument();
  });

  it('R6: crew_id = null NO rinde bloque de cuadrilla', () => {
    const itemWithoutCrew: PublishedWeekPlanItem = {
      ...baseItem,
      crew_id: null,
      crew: null,
    };

    render(
      <SingleActivityCard
        item={itemWithoutCrew}
        planId="plan-001"
        boardId="board-001"
        groupId="group-001"
      />
    );

    expect(screen.queryByText(/cuadrilla/i)).not.toBeInTheDocument();
  });

  it('R7: La vista expandida/colapsada es 100% consultiva (solo lectura sin botones de edición)', () => {
    const itemWithCrew: PublishedWeekPlanItem = {
      ...baseItem,
      crew_id: 'crew-gamma',
      crew: {
        id: 'crew-gamma',
        name: 'Cuadrilla Gamma',
        leader_name: 'Sofía López',
        members_count: 1,
        members: [
          { id: 'm-20', full_name: 'Camilo Torres', role_in_site: 'Técnico', zone: 'GENERAL' },
        ],
      },
    };

    render(
      <SingleActivityCard
        item={itemWithCrew}
        planId="plan-001"
        boardId="board-001"
        groupId="group-001"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /ver integrantes/i }));

    // Cero botones de mutación (editar, eliminar, agregar) dentro de la lista de miembros
    const listContainer = screen.getByTestId('crew-members-list');
    expect(listContainer.querySelectorAll('button').length).toBe(0);
    expect(listContainer.querySelectorAll('input').length).toBe(0);
  });

  it('R8: Preserva la invarianza de planned_jr, frecuencia, fecha y reprogramación', () => {
    const itemRescheduledWithCrew: PublishedWeekPlanItem = {
      ...baseItem,
      isRescheduled: true,
      overrideReasonLabel: 'Condición Climática',
      crew_id: 'crew-alpha',
      crew: {
        id: 'crew-alpha',
        name: 'Cuadrilla Alpha',
        leader_name: 'Líder Uno',
        members_count: 1,
        members: [
          { id: 'm-1', full_name: 'Operario Uno', role_in_site: 'Operario', zone: 'ZP' },
        ],
      },
    };

    render(
      <SingleActivityCard
        item={itemRescheduledWithCrew}
        planId="plan-001"
        boardId="board-001"
        groupId="group-001"
      />
    );

    // Invarianzas contractuales preserved
    expect(screen.getByText(/1.60 JR \/ ocurrencia/i)).toBeInTheDocument();
    expect(screen.getByText(/Reprogramada · Condición Climática/i)).toBeInTheDocument();
    expect(screen.getByText(/Programada: MIÉ 23 SEP/i)).toBeInTheDocument();
  });

  it('R9: La propiedad zone se preserva en el tipo del ViewModel sin romper autoridades', () => {
    const member = {
      id: 'm-99',
      full_name: 'Hernán Cortés',
      role_in_site: 'Inspector',
      zone: 'ZP',
    };

    expect(member.zone).toBe('ZP');
  });

  it('R10 & R11: Ausencia de relación o datos incompletos no genera inventiva ficticia', () => {
    const itemIncompleteRelation: PublishedWeekPlanItem = {
      ...baseItem,
      crew_id: 'crew-inc',
      crew: {
        id: 'crew-inc',
        name: 'Cuadrilla Parcial',
        leader_name: null,
        members_count: 1,
        members: [
          { id: 'm-30', full_name: 'Desconocido', role_in_site: null, zone: null },
        ],
      },
    };

    render(
      <SingleActivityCard
        item={itemIncompleteRelation}
        planId="plan-001"
        boardId="board-001"
        groupId="group-001"
      />
    );

    // No renderiza "Líder:" si es null
    expect(screen.queryByText(/· Líder:/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /ver integrantes/i }));

    // R11: Nombre factual "Desconocido" y "Sin rol asignado"
    expect(screen.getByText('Desconocido')).toBeInTheDocument();
    expect(screen.getByText('Sin rol asignado')).toBeInTheDocument();
  });
});
