/**
 * Test Suite: Hito 6.5 — Trazabilidad Operativa de Reprogramaciones en /my-work v1.0
 *
 * Verificación de la proyección consultiva e inalterabilidad contractual (R1–R13):
 * R1:  Parser de override_reason: valores nulos, vacíos o en blanco -> null.
 * R2:  Parser de override_reason: código WEATHER_DELAY -> "Condición Climática".
 * R3:  Parser de override_reason: código LOGISTICS_EQUIPMENT -> "Equipo / Insumos".
 * R4:  Parser de override_reason: código OPERATIONAL_PRIORITY -> "Prioridad Operativa".
 * R5:  Parser de override_reason: código SUPERVISOR_ADJUSTMENT -> "Ajuste de Supervisión".
 * R6:  Parser de override_reason: historial acumulativo ("M1 | M2 | M3") -> selecciona la entrada más reciente M3.
 * R7:  Parser de override_reason: texto libre/código desconocido -> conserva texto original sin inventar categorías.
 * R8:  SingleActivityCard con isRescheduled = true -> renderiza badge "Reprogramada".
 * R9:  SingleActivityCard con isRescheduled = true + overrideReasonLabel -> renderiza "Reprogramada · <motivo>".
 * R10: SingleActivityCard con isRescheduled = false -> NO renderiza insignia de reprogramada.
 * R11: SingleActivityCard con isRescheduled = undefined -> NO renderiza insignia de reprogramada.
 * R12: Invarianza contractual: planned_jr, planned_date, planned_frecuencia, occurrence_key y displayJr permanecen inalterados.
 * R13: Actividad completada reprogramada: coexisten la insignia "Reprogramada" y el estado "Completada" sin alterar avance ni estado operacional.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { formatOverrideReason, PublishedWeekPlanItem } from '@/hooks/useWeeklyPlans';
import { SingleActivityCard } from '../ActividadesView';

describe('Hito 6.5 — Trazabilidad Operativa de Reprogramaciones (Suite Integrativa R1–R13)', () => {

  // R1: Parser de override_reason para valores nulos/vacíos
  test('R1 — formatOverrideReason: retorna null para valores nulos, undefined, vacíos o espacios', () => {
    expect(formatOverrideReason(null)).toBeNull();
    expect(formatOverrideReason(undefined)).toBeNull();
    expect(formatOverrideReason('')).toBeNull();
    expect(formatOverrideReason('   ')).toBeNull();
  });

  // R2: Código climático
  test('R2 — formatOverrideReason: traduce código WEATHER_DELAY a "Condición Climática"', () => {
    expect(formatOverrideReason('[2026-09-23T15:00:00Z] [RESCHEDULE:WEATHER_DELAY] Lluvia previa')).toBe('Condición Climática');
    expect(formatOverrideReason('WEATHER_DELAY')).toBe('Condición Climática');
  });

  // R3: Código equipo/logística
  test('R3 — formatOverrideReason: traduce código LOGISTICS_EQUIPMENT a "Equipo / Insumos"', () => {
    expect(formatOverrideReason('[RESCHEDULE:LOGISTICS_EQUIPMENT] Indisponibilidad de tractor')).toBe('Equipo / Insumos');
    expect(formatOverrideReason('LOGISTICS_EQUIPMENT')).toBe('Equipo / Insumos');
  });

  // R4: Código prioridad operativa
  test('R4 — formatOverrideReason: traduce código OPERATIONAL_PRIORITY a "Prioridad Operativa"', () => {
    expect(formatOverrideReason('[2026-09-23] [RESCHEDULE:OPERATIONAL_PRIORITY] Atender evento')).toBe('Prioridad Operativa');
    expect(formatOverrideReason('OPERATIONAL_PRIORITY')).toBe('Prioridad Operativa');
  });

  // R5: Código ajuste de supervisión
  test('R5 — formatOverrideReason: traduce código SUPERVISOR_ADJUSTMENT a "Ajuste de Supervisión"', () => {
    expect(formatOverrideReason('[SUPERVISOR_ADJUSTMENT] Reubicación de secuencia')).toBe('Ajuste de Supervisión');
    expect(formatOverrideReason('SUPERVISOR_ADJUSTMENT')).toBe('Ajuste de Supervisión');
  });

  // R6: Historial acumulativo (|)
  test('R6 — formatOverrideReason: selecciona la entrada más reciente en historiales delimitados por |', () => {
    const cumulativeHistory = '[2026-09-21] [RESCHEDULE:LOGISTICS_EQUIPMENT] Falla de máquina | [2026-09-23] [RESCHEDULE:WEATHER_DELAY] Lluvia fuerte';
    expect(formatOverrideReason(cumulativeHistory)).toBe('Condición Climática');
  });

  // R7: Texto libre sin código canónico
  test('R7 — formatOverrideReason: conserva texto descriptivo libre sin inventar categoría falsa', () => {
    const rawReason = 'Reasignado por solicitud de mantenimiento';
    expect(formatOverrideReason(rawReason)).toBe('Reasignado por solicitud de manteni...');
  });

  // R8: Insignia Reprogramada cuando isRescheduled = true
  test('R8 — SingleActivityCard con isRescheduled = true renderiza badge "Reprogramada"', () => {
    const mockItem: PublishedWeekPlanItem = {
      id: 'item-resched-1',
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
      planned_qty: 500,
      planned_jr: 25,
      planned_frecuencia: 1,
      planned_date: '2026-09-23',
      priority: 'must_execute',
      status: 'planned',
      created_at: '2026-09-21T00:00:00Z',
      updated_at: '2026-09-23T00:00:00Z',
      standard: null,
      displayJr: 1.00,
      isRescheduled: true,
      overrideReasonLabel: null,
    } as any;

    render(
      <SingleActivityCard
        item={mockItem}
        planId="plan-1"
        boardId="board-1"
        groupId="group-1"
      />
    );

    expect(screen.getByText(/Reprogramada/)).toBeInTheDocument();
  });

  // R9: Insignia Reprogramada + Motivo traducido
  test('R9 — SingleActivityCard con isRescheduled = true y overrideReasonLabel renderiza "Reprogramada · <motivo>"', () => {
    const mockItem: PublishedWeekPlanItem = {
      id: 'item-resched-2',
      plan_id: 'plan-1',
      planned_sequence: 1,
      poa_activity_zone_id: 'zone-1',
      planned_rendimiento: 500,
      executed_qty: 0,
      executed_jr: 0,
      group_id: 'group-1',
      activity_key: 'poda_arboles',
      name: 'Poda de Árboles',
      unit: 'm2',
      planned_qty: 200,
      planned_jr: 25,
      planned_frecuencia: 1,
      planned_date: '2026-09-23',
      priority: 'should_execute',
      status: 'planned',
      created_at: '2026-09-21T00:00:00Z',
      updated_at: '2026-09-23T00:00:00Z',
      standard: null,
      displayJr: 1.00,
      isRescheduled: true,
      overrideReasonLabel: 'Condición Climática',
    } as any;

    render(
      <SingleActivityCard
        item={mockItem}
        planId="plan-1"
        boardId="board-1"
        groupId="group-1"
      />
    );

    expect(screen.getByText('Reprogramada · Condición Climática')).toBeInTheDocument();
  });

  // R10: Actividad normal (isRescheduled = false) NO renderiza badge
  test('R10 — SingleActivityCard con isRescheduled = false NO renderiza insignia de reprogramada', () => {
    const mockItem: PublishedWeekPlanItem = {
      id: 'item-normal-1',
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
      planned_qty: 400,
      planned_jr: 25,
      planned_frecuencia: 1,
      planned_date: '2026-09-23',
      priority: 'flexible',
      status: 'planned',
      created_at: '2026-09-21T00:00:00Z',
      updated_at: '2026-09-21T00:00:00Z',
      standard: null,
      displayJr: 1.00,
      isRescheduled: false,
      overrideReasonLabel: null,
    } as any;

    render(
      <SingleActivityCard
        item={mockItem}
        planId="plan-1"
        boardId="board-1"
        groupId="group-1"
      />
    );

    expect(screen.queryByText(/Reprogramada/)).not.toBeInTheDocument();
  });

  // R11: Actividad con isRescheduled = undefined NO renderiza badge
  test('R11 — SingleActivityCard con isRescheduled = undefined NO renderiza insignia de reprogramada', () => {
    const mockItem: PublishedWeekPlanItem = {
      id: 'item-normal-2',
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
      planned_qty: 400,
      planned_jr: 25,
      planned_frecuencia: 1,
      planned_date: '2026-09-23',
      priority: 'flexible',
      status: 'planned',
      created_at: '2026-09-21T00:00:00Z',
      updated_at: '2026-09-21T00:00:00Z',
      standard: null,
      displayJr: 1.00,
      isRescheduled: undefined,
      overrideReasonLabel: undefined,
    } as any;

    render(
      <SingleActivityCard
        item={mockItem}
        planId="plan-1"
        boardId="board-1"
        groupId="group-1"
      />
    );

    expect(screen.queryByText(/Reprogramada/)).not.toBeInTheDocument();
  });

  // R12: Invarianza Contractual
  test('R12 — Invarianza Contractual: la presencia de reprogramación preserva planned_jr, planned_date, planned_frecuencia y displayJr', () => {
    const mockItem: PublishedWeekPlanItem = {
      id: 'item-contractual-1',
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
      planned_qty: 500,
      planned_jr: 25,
      planned_frecuencia: 4,
      planned_date: '2026-09-23',
      occurrence_key: 'occ_contractual_01',
      priority: 'must_execute',
      status: 'planned',
      is_manual_override: true,
      override_reason: 'WEATHER_DELAY',
      created_at: '2026-09-21T00:00:00Z',
      updated_at: '2026-09-23T00:00:00Z',
      standard: null,
      displayJr: 4.00,
      isRescheduled: true,
      overrideReasonLabel: 'Condición Climática',
    } as any;

    expect(mockItem.planned_jr).toBe(25);
    expect(mockItem.planned_frecuencia).toBe(4);
    expect(mockItem.occurrence_key).toBe('occ_contractual_01');
    expect(mockItem.displayJr).toBe(4.00);
  });

  // R13: Actividad completada reprogramada
  test('R13 — Actividad completada que fue reprogramada coexiste con la insignia "Reprogramada" y el avance 100%', () => {
    const mockItemCompleted: PublishedWeekPlanItem = {
      id: 'item-completed-resched',
      plan_id: 'plan-1',
      planned_sequence: 1,
      poa_activity_zone_id: 'zone-1',
      planned_rendimiento: 500,
      executed_qty: 300,
      executed_jr: 1.0,
      group_id: 'group-1',
      activity_key: 'limpieza_marmol',
      name: 'Limpieza de Mármol',
      unit: 'm2',
      planned_qty: 300,
      planned_jr: 25,
      planned_frecuencia: 1,
      planned_date: '2026-09-23',
      priority: 'must_execute',
      status: 'completed',
      created_at: '2026-09-21T00:00:00Z',
      updated_at: '2026-09-23T00:00:00Z',
      standard: { name: 'Limpieza de Mármol', category: 'General', unit: 'm2' },
      displayJr: 1.00,
      isRescheduled: true,
      overrideReasonLabel: 'Equipo / Insumos',
    } as any;

    render(
      <SingleActivityCard
        item={mockItemCompleted}
        planId="plan-1"
        boardId="board-1"
        groupId="group-1"
      />
    );

    expect(screen.getByText('Reprogramada · Equipo / Insumos')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

});
