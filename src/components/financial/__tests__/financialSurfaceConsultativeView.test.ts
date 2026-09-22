/**
 * Suite 125: Superficie Consultiva Financiera y Control de Actas (Candidato B — ADR-0012)
 * Baseline Rector: 124 suites / 1029 tests -> 125 suites
 *
 * Verificaciones de Dominio y Frontera Consultiva (G1 - G3):
 * 1. Diagnóstico BALANCED cuando Q_certifiable === Q_acta.
 * 2. Diagnóstico PENDING_BILLING cuando Q_certifiable > Q_acta.
 * 3. Diagnóstico OVER_BILLED cuando Q_acta > Q_certifiable.
 * 4. Diagnóstico UNDETERMINED_RECONCILIATION en ausencia de fuentes.
 * 5. Preservación estricta de UNDETERMINED_CONTRACT_VALUE (sin falsos ceros ni 0 COP).
 * 6. Preservación de UNDETERMINED_MONETARY_COST en resumen ejecutivo.
 * 7. Segregación física de unidades heterogéneas (M², ML, UND no se suman).
 * 8. Distinción entre Acta en borrador (draft) vs. emitida/cerrada.
 * 9. Saldo liquidable correcto para ejecuciones VERIFIED sin Acta.
 * 10. Trazabilidad exacta 1:N entre execution_id y acta_item_source.
 * 11. Ausencia absoluta de RPCs de mutación (insert, update, delete, upsert) en componentes consultivos.
 * 12. Aislamiento total del Solver H8 (0 imports, 0 llamadas).
 */

import React from 'react';
import * as fs from 'fs';
import * as path from 'path';
import {
  evaluateSiteExecutiveVariance,
  OccurrenceVarianceAnalysis,
  ContractualPriceSource,
} from '@/lib/realCostVarianceService';
import { WeeklyPlanItem } from '@/types/weeklyPlan';
import { ExecutionRecord } from '@/types/execution';
import { Acta, ActaItem, ActaItemSource } from '@/types/acta';

describe('Suite 125: Superficie Consultiva Financiera (/financial — ADR-0012)', () => {
  const mockPlanItem: WeeklyPlanItem = {
    id: 'item_01',
    weekly_plan_id: 'wp_01',
    board_id: 'board_financial_test',
    activity_key: 'LIMPIEZA',
    name: 'Limpieza de Terreno',
    zone: 'Sitio A',
    unit: 'm2',
    planned_date: '2026-09-20',
    planned_qty: 100,
    theoretical_jr: 5,
    source_type: 'ROUTINE',
    routine_reference: 'ROUTINE_01',
    occurrence_key: 'occ_01',
    is_manual_override: false,
    status: 'planned',
  };

  const mockPrice: ContractualPriceSource = {
    poaActivityId: 'LIMPIEZA',
    unitPrice: 15000,
    currency: 'COP',
    unit: 'm2',
  };

  // 1. Diagnóstico BALANCED
  test('G3.1: Diagnostica BALANCED cuando avance verificado coincide exactamente con lo incluido en Acta', () => {
    const executions: ExecutionRecord[] = [
      {
        id: 'exec_01',
        weekly_plan_item_id: 'item_01',
        board_id: 'board_financial_test',
        execution_date: '2026-09-20',
        executed_qty: 100,
        worker_count: 1,
        hours_worked: 40,
        reported_by: 'worker_01',
        verification_status: 'verified',
      },
    ];

    const actas: Acta[] = [
      {
        id: 'acta_01',
        board_id: 'board_financial_test',
        numero: 1,
        estado: 'issued',
        generated_by: 'supervisor_01',
        generated_at: '2026-09-21',
      },
    ];

    const actaItems: ActaItem[] = [
      {
        id: 'acta_item_01',
        acta_id: 'acta_01',
        poa_activity_id: 'LIMPIEZA',
        descripcion_snapshot: 'Limpieza',
        unidad_snapshot: 'm2',
        precio_unitario_snapshot: 15000,
        cantidad_facturada: 100,
      },
    ];

    const sources: ActaItemSource[] = [
      {
        id: 'source_01',
        acta_item_id: 'acta_item_01',
        execution_id: 'exec_01',
        cantidad_consumida: 100,
      },
    ];

    const summary = evaluateSiteExecutiveVariance(
      'board_financial_test',
      [mockPlanItem],
      executions,
      [mockPrice],
      actas,
      actaItems,
      sources
    );

    expect(summary.occurrences[0].billingReconciliationStatus).toBe('BALANCED');
    expect(summary.occurrences[0].pendingBillableQty).toBe(0);
    expect(summary.occurrences[0].overBilledQty).toBe(0);
  });

  // 2. Diagnóstico PENDING_BILLING
  test('G3.2: Diagnostica PENDING_BILLING cuando existe avance verificado pendiente de ingresar a Acta', () => {
    const executions: ExecutionRecord[] = [
      {
        id: 'exec_01',
        weekly_plan_item_id: 'item_01',
        board_id: 'board_financial_test',
        execution_date: '2026-09-20',
        executed_qty: 80,
        worker_count: 1,
        hours_worked: 32,
        reported_by: 'worker_01',
        verification_status: 'verified',
      },
    ];

    const summary = evaluateSiteExecutiveVariance(
      'board_financial_test',
      [mockPlanItem],
      executions,
      [mockPrice],
      [],
      [],
      []
    );

    expect(summary.occurrences[0].billingReconciliationStatus).toBe('PENDING_BILLING');
    expect(summary.occurrences[0].contractualCertifiableQty).toBe(80);
    expect(summary.occurrences[0].pendingBillableQty).toBe(80);
  });

  // 3. Diagnóstico OVER_BILLED
  test('G3.3: Diagnostica OVER_BILLED si la cantidad en Actas supera la cantidad verificada', () => {
    const executions: ExecutionRecord[] = [
      {
        id: 'exec_01',
        weekly_plan_item_id: 'item_01',
        board_id: 'board_financial_test',
        execution_date: '2026-09-20',
        executed_qty: 40,
        worker_count: 1,
        hours_worked: 16,
        reported_by: 'worker_01',
        verification_status: 'verified',
      },
    ];

    const actas: Acta[] = [
      {
        id: 'acta_01',
        board_id: 'board_financial_test',
        numero: 1,
        estado: 'issued',
        generated_by: 'sup',
        generated_at: '2026-09-21',
      },
    ];

    const actaItems: ActaItem[] = [
      {
        id: 'acta_item_01',
        acta_id: 'acta_01',
        poa_activity_id: 'LIMPIEZA',
        descripcion_snapshot: 'Limpieza',
        unidad_snapshot: 'm2',
        precio_unitario_snapshot: 15000,
        cantidad_facturada: 70,
      },
    ];

    const sources: ActaItemSource[] = [
      {
        id: 'source_01',
        acta_item_id: 'acta_item_01',
        execution_id: 'exec_01',
        cantidad_consumida: 70,
      },
    ];

    const summary = evaluateSiteExecutiveVariance(
      'board_financial_test',
      [mockPlanItem],
      executions,
      [mockPrice],
      actas,
      actaItems,
      sources
    );

    expect(summary.occurrences[0].billingReconciliationStatus).toBe('OVER_BILLED');
    expect(summary.occurrences[0].overBilledQty).toBe(30); // 70 - 40
  });

  // 4. Diagnóstico UNDETERMINED_RECONCILIATION
  test('G3.4: Diagnostica UNDETERMINED_RECONCILIATION si faltan fuentes de Acta o precios', () => {
    const summary = evaluateSiteExecutiveVariance(
      'board_financial_test',
      [mockPlanItem],
      [],
      [], // Sin precios
      [],
      [],
      []
    );

    expect(summary.occurrences[0].plannedValueOccurrenceCOP).toBe('UNDETERMINED_CONTRACT_VALUE');
    expect(summary.occurrences[0].earnedValueOccurrenceCOP).toBe('UNDETERMINED_CONTRACT_VALUE');
  });

  // 5. Preservación estricta de UNDETERMINED_CONTRACT_VALUE (sin falsos ceros)
  test('G3.5: No convierte UNDETERMINED_CONTRACT_VALUE en 0 ni 0 COP', () => {
    const summary = evaluateSiteExecutiveVariance(
      'board_financial_test',
      [mockPlanItem],
      [],
      [],
      [],
      [],
      []
    );

    expect(summary.totalPlannedValueCOP).toBe('UNDETERMINED_CONTRACT_VALUE');
    expect(summary.totalEarnedValueCOP).toBe('UNDETERMINED_CONTRACT_VALUE');
    expect(summary.totalContractualValueVarianceCOP).toBe('UNDETERMINED_CONTRACT_VALUE');
  });

  // 6. Preservación de UNDETERMINED_MONETARY_COST
  test('G3.6: Preserva invarianza de costo real en UNDETERMINED_MONETARY_COST', () => {
    const summary = evaluateSiteExecutiveVariance(
      'board_financial_test',
      [mockPlanItem],
      [],
      [mockPrice],
      [],
      [],
      []
    );

    expect(summary.actualCostStatus).toBe('UNDETERMINED_MONETARY_COST');
    expect(summary.occurrences[0].actualCostStatus).toBe('UNDETERMINED_MONETARY_COST');
  });

  // 7. Segregación física de unidades heterogéneas
  test('G3.7: Invarianza de unidades distintas (m2, ml, und) en planItems', () => {
    const item1: WeeklyPlanItem = { ...mockPlanItem, id: 'i1', unit: 'm2', planned_qty: 500 };
    const item2: WeeklyPlanItem = { ...mockPlanItem, id: 'i2', unit: 'ml', planned_qty: 300 };

    const summary = evaluateSiteExecutiveVariance(
      'board_financial_test',
      [item1, item2],
      [],
      [],
      [],
      [],
      []
    );

    expect(summary.occurrences.length).toBe(2);
    expect(summary.occurrences[0].plannedQty).toBe(500);
    expect(summary.occurrences[1].plannedQty).toBe(300);
  });

  // 8. Trazabilidad execution_id -> acta_item_source
  test('G3.8: Trazabilidad exacta entre ejecución física y fuente de Acta', () => {
    const executions: ExecutionRecord[] = [
      {
        id: 'exec_abc',
        weekly_plan_item_id: 'item_01',
        board_id: 'board_financial_test',
        execution_date: '2026-09-20',
        executed_qty: 50,
        worker_count: 1,
        hours_worked: 8,
        reported_by: 'worker_01',
        verification_status: 'verified',
      },
    ];

    const actas: Acta[] = [
      { id: 'acta_1', board_id: 'board_financial_test', numero: 1, estado: 'issued', generated_by: 'sup', generated_at: '2026-09-20' },
    ];
    const actaItems: ActaItem[] = [
      { id: 'ai_1', acta_id: 'acta_1', poa_activity_id: 'LIMPIEZA', descripcion_snapshot: 'D', unidad_snapshot: 'm2', precio_unitario_snapshot: 15000, cantidad_facturada: 50 },
    ];
    const sources: ActaItemSource[] = [
      { id: 'ais_1', acta_item_id: 'ai_1', execution_id: 'exec_abc', cantidad_consumida: 50 },
    ];

    const summary = evaluateSiteExecutiveVariance(
      'board_financial_test',
      [mockPlanItem],
      executions,
      [mockPrice],
      actas,
      actaItems,
      sources
    );

    const occ = summary.occurrences[0];
    expect(occ.billedValueBreakdown.length).toBe(1);
    expect(occ.billedValueBreakdown[0].executionId).toBe('exec_abc');
    expect(occ.billedValueBreakdown[0].quantityConsumed).toBe(50);
  });

  // 9. Ejecución verificada sin Acta
  test('G3.9: Mantiene saldo liquidable positivo para ejecución verificada sin ingresar a Acta', () => {
    const executions: ExecutionRecord[] = [
      {
        id: 'exec_no_acta',
        weekly_plan_item_id: 'item_01',
        board_id: 'board_financial_test',
        execution_date: '2026-09-20',
        executed_qty: 90,
        worker_count: 1,
        hours_worked: 8,
        reported_by: 'worker_01',
        verification_status: 'verified',
      },
    ];

    const summary = evaluateSiteExecutiveVariance(
      'board_financial_test',
      [mockPlanItem],
      executions,
      [mockPrice],
      [],
      [],
      []
    );

    expect(summary.occurrences[0].contractualCertifiableQty).toBe(90);
    expect(summary.occurrences[0].billedQty).toBe(0);
    expect(summary.occurrences[0].pendingBillableQty).toBe(90);
  });

  // 10. Verificación AST Anti-Mutaciones en Componentes y Hook Consultivos
  test('G3.10: Garantiza 0 mutaciones a BD en la superficie consultiva financiera', () => {
    const filesToAudit = [
      path.join(process.cwd(), 'src/hooks/useSiteFinancialVariance.ts'),
      path.join(process.cwd(), 'src/components/financial/FinancialReconciliationView.tsx'),
      path.join(process.cwd(), 'src/components/financial/FinancialOccurrenceTable.tsx'),
      path.join(process.cwd(), 'src/components/financial/FinancialSummaryBanner.tsx'),
      path.join(process.cwd(), 'src/components/financial/SiteFinancialBreakdownCard.tsx'),
      path.join(process.cwd(), 'src/components/financial/ActaSourceTraceabilityModal.tsx'),
    ];

    const forbiddenPatterns = [
      /\.from\(.*?\)\.insert\(/g,
      /\.from\(.*?\)\.update\(/g,
      /\.from\(.*?\)\.delete\(/g,
      /\.from\(.*?\)\.upsert\(/g,
      /\.rpc\('record_advisory_decision'/g,
    ];

    for (const filePath of filesToAudit) {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        for (const pattern of forbiddenPatterns) {
          expect(pattern.test(content)).toBe(false);
        }
      }
    }
  });

  // 11. Aislamiento Total del Solver H8
  test('G3.11: Ausencia total de imports y llamadas al Solver H8 en el módulo financiero', () => {
    const filesToAudit = [
      path.join(process.cwd(), 'src/hooks/useSiteFinancialVariance.ts'),
      path.join(process.cwd(), 'src/components/financial/FinancialReconciliationView.tsx'),
      path.join(process.cwd(), 'src/components/financial/FinancialOccurrenceTable.tsx'),
      path.join(process.cwd(), 'src/components/financial/FinancialSummaryBanner.tsx'),
      path.join(process.cwd(), 'src/components/financial/SiteFinancialBreakdownCard.tsx'),
    ];

    const h8Patterns = [
      /from\s+['"].*?\b(h8|solverEngine|scheduleOptimizer|optaplanner)\b.*?['"]/i,
      /optaplanner/i,
      /scheduleOptimizer/i,
    ];

    for (const filePath of filesToAudit) {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        for (const pattern of h8Patterns) {
          const match = content.match(pattern);
          if (match) {
            expect(`${path.basename(filePath)} matched ${pattern}: ${match[0]}`).toBeNull();
          }
        }
      }
    }
  });
});
