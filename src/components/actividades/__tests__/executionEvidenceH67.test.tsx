/**
 * Test Suite Hito 6.7 — Contexto Físico de Ejecución y Evidencia en /my-work v1.0
 * Verificación de Gates R1–R18 (Ejecuciones, Verificación, Curaduría ANTES/DESPUÉS e Invarianzas)
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { SingleActivityCard } from '../ActividadesView';
import { PublishedWeekPlanItem } from '@/hooks/useWeeklyPlans';

describe('Hito 6.7 — Contexto Físico de Ejecución y Evidencia en /my-work (Suite R1–R18)', () => {
  const baseItem: PublishedWeekPlanItem = {
    id: 'item-201',
    plan_id: 'plan-002',
    activity_key: 'corte_grama',
    name: 'Corte de Grama y Orillado',
    planned_qty: 200,
    executed_qty: 100,
    executed_jr: 2.5,
    unit: 'M2',
    priority: 'must_execute',
    zone: 'ZP',
    planned_sequence: 1,
    poa_activity_zone_id: 'zone-002',
    planned_rendimiento: 20,
    planned_frecuencia: 4,
    planned_jr: 10,
    displayJr: 1.6,
    planned_date: '2026-09-23',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    standard: null,
  };

  it('R1 & R11: Actividad sin ejecuciones (executionsSummary = null) NO renderiza bloque de ejecuciones ni fotos', () => {
    const itemNoExec: PublishedWeekPlanItem = {
      ...baseItem,
      executionsSummary: null,
    };

    render(
      <SingleActivityCard
        item={itemNoExec}
        planId="plan-002"
        boardId="board-001"
        groupId="group-001"
      />
    );

    expect(screen.queryByTestId('execution-summary-block')).not.toBeInTheDocument();
  });

  it('R2, R4 & R5: Una ejecución con estado "verified" rinde contador, última fecha y chip "Verificada"', () => {
    const itemVerified: PublishedWeekPlanItem = {
      ...baseItem,
      executionsSummary: {
        totalExecutions: 1,
        lastExecutionDate: '2026-09-21',
        verificationStatus: 'verified',
        evidencePreview: { before: [], after: [] },
      },
    };

    render(
      <SingleActivityCard
        item={itemVerified}
        planId="plan-002"
        boardId="board-001"
        groupId="group-001"
      />
    );

    expect(screen.getByTestId('execution-summary-block')).toBeInTheDocument();
    expect(screen.getByText(/1 ejecución · Última: 2026-09-21/i)).toBeInTheDocument();
    expect(screen.getByText('Verificada')).toBeInTheDocument();
  });

  it('R3: Múltiples ejecuciones muestran el conteo total correcto', () => {
    const itemMultiExec: PublishedWeekPlanItem = {
      ...baseItem,
      executionsSummary: {
        totalExecutions: 3,
        lastExecutionDate: '2026-09-23',
        verificationStatus: 'verified',
        evidencePreview: { before: [], after: [] },
      },
    };

    render(
      <SingleActivityCard
        item={itemMultiExec}
        planId="plan-002"
        boardId="board-001"
        groupId="group-001"
      />
    );

    expect(screen.getByText(/3 ejecuciones · Última: 2026-09-23/i)).toBeInTheDocument();
  });

  it('R6 & R7: Estados "rejected" y "evidence_pending" rinden sus etiquetas explícitas', () => {
    const itemRejected: PublishedWeekPlanItem = {
      ...baseItem,
      executionsSummary: {
        totalExecutions: 1,
        lastExecutionDate: '2026-09-22',
        verificationStatus: 'rejected',
        evidencePreview: { before: [], after: [] },
      },
    };

    const { rerender } = render(
      <SingleActivityCard
        item={itemRejected}
        planId="plan-002"
        boardId="board-001"
        groupId="group-001"
      />
    );

    expect(screen.getByText('Rechazada')).toBeInTheDocument();

    const itemPendingEvidence: PublishedWeekPlanItem = {
      ...baseItem,
      executionsSummary: {
        totalExecutions: 1,
        lastExecutionDate: '2026-09-22',
        verificationStatus: 'evidence_pending',
        evidencePreview: { before: [], after: [] },
      },
    };

    rerender(
      <SingleActivityCard
        item={itemPendingEvidence}
        planId="plan-002"
        boardId="board-001"
        groupId="group-001"
      />
    );

    expect(screen.getByText('Pendiente de Evidencia')).toBeInTheDocument();
  });

  it('R8, R9 & R10: Renderiza vista previa fotográfica curada (máximo 2 ANTES y 2 DESPUÉS) con URLs estables', () => {
    const itemWithEvidence: PublishedWeekPlanItem = {
      ...baseItem,
      executionsSummary: {
        totalExecutions: 2,
        lastExecutionDate: '2026-09-22',
        verificationStatus: 'verified',
        evidencePreview: {
          before: [
            { id: 'att-b1', storage_path: 'https://storage/before1.jpg', phase: 'before' },
            { id: 'att-b2', storage_path: 'https://storage/before2.jpg', phase: 'before' },
          ],
          after: [
            { id: 'att-a1', storage_path: 'https://storage/after1.jpg', phase: 'after' },
            { id: 'att-a2', storage_path: 'https://storage/after2.jpg', phase: 'after' },
          ],
        },
      },
    };

    render(
      <SingleActivityCard
        item={itemWithEvidence}
        planId="plan-002"
        boardId="board-001"
        groupId="group-001"
      />
    );

    expect(screen.getByTestId('evidence-preview-container')).toBeInTheDocument();
    expect(screen.getByText('Antes (2)')).toBeInTheDocument();
    expect(screen.getByText('Después (2)')).toBeInTheDocument();

    const beforeImgs = screen.getAllByAltText('Antes');
    const afterImgs = screen.getAllByAltText('Después');

    expect(beforeImgs.length).toBe(2);
    expect(afterImgs.length).toBe(2);

    expect(beforeImgs[0]).toHaveAttribute('src', 'https://storage/before1.jpg');
    expect(afterImgs[0]).toHaveAttribute('src', 'https://storage/after1.jpg');
  });

  it('R12 & R13: Ejecución sin attachments NO rinde contenedor de fotos y permanece 100% consultivo (solo lectura)', () => {
    const itemNoPhotos: PublishedWeekPlanItem = {
      ...baseItem,
      executionsSummary: {
        totalExecutions: 1,
        lastExecutionDate: '2026-09-22',
        verificationStatus: 'reported',
        evidencePreview: { before: [], after: [] },
      },
    };

    render(
      <SingleActivityCard
        item={itemNoPhotos}
        planId="plan-002"
        boardId="board-001"
        groupId="group-001"
      />
    );

    expect(screen.getByTestId('execution-summary-block')).toBeInTheDocument();
    expect(screen.queryByTestId('evidence-preview-container')).not.toBeInTheDocument();

    const block = screen.getByTestId('execution-summary-block');
    expect(block.querySelectorAll('button').length).toBe(0);
    expect(block.querySelectorAll('input').length).toBe(0);
  });

  it('R14, R15 & R16: Preserva intactas las invariantes H6.4 (displayJr), H6.5 (reprogramación) y H6.6 (cuadrilla)', () => {
    const fullFeaturedItem: PublishedWeekPlanItem = {
      ...baseItem,
      displayJr: 1.6,
      isRescheduled: true,
      overrideReasonLabel: 'Condición Climática',
      crew: {
        id: 'crew-alpha',
        name: 'Cuadrilla Norte',
        leader_name: 'Líder Uno',
        members_count: 2,
        members: [
          { id: 'm1', full_name: 'Juan Pérez', role_in_site: 'Operario' },
        ],
      },
      executionsSummary: {
        totalExecutions: 1,
        lastExecutionDate: '2026-09-22',
        verificationStatus: 'verified',
        evidencePreview: { before: [], after: [] },
      },
    };

    render(
      <SingleActivityCard
        item={fullFeaturedItem}
        planId="plan-002"
        boardId="board-001"
        groupId="group-001"
      />
    );

    // H6.4 Display JR
    expect(screen.getByText(/1.60 JR \/ ocurrencia/i)).toBeInTheDocument();

    // H6.5 Reprogramación
    expect(screen.getByText(/Reprogramada · Condición Climática/i)).toBeInTheDocument();

    // H6.6 Cuadrilla
    expect(screen.getByText('Cuadrilla Norte')).toBeInTheDocument();

    // H6.7 Contexto de Ejecución
    expect(screen.getByTestId('execution-summary-block')).toBeInTheDocument();
  });

  it('R17: Manejo defensivo de datos incompletos en executionsSummary', () => {
    const itemIncomplete: PublishedWeekPlanItem = {
      ...baseItem,
      executionsSummary: {
        totalExecutions: 1,
        lastExecutionDate: null,
        verificationStatus: 'draft',
        evidencePreview: { before: [], after: [] },
      },
    };

    render(
      <SingleActivityCard
        item={itemIncomplete}
        planId="plan-002"
        boardId="board-001"
        groupId="group-001"
      />
    );

    expect(screen.getByText('1 ejecución')).toBeInTheDocument();
    expect(screen.getByText('Borrador')).toBeInTheDocument();
  });
});
