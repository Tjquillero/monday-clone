/**
 * Test Suite 49: Control de Costos Reales y Desviaciones Operativas (Fase 5.4)
 * Baseline Rectoral: 105 suites / 804 tests -> 106 suites / 818 tests
 *
 * Casos de Prueba Contractuales:
 * - RCV-01: Precedencia estricta de alcance físico (subejecución bloquea menor consumo JR)
 * - RCV-02: Eficiencia real en alcance completo (menor consumo JR solo con ALCANCE_COMPLETO)
 * - RCV-03: Exceso de jornales con tolerancia M3 (±0.05 JR)
 * - RCV-04: Aislamiento de sobre-ejecución exacta (tope de certifiable a planned)
 * - RCV-05: Invarianza monetaria real (AC = UNDETERMINED_MONETARY_COST)
 * - RCV-06: Desviación de valor contractual (CVV = EV - PV)
 * - RCV-07: Desacoplamiento de precios POA vs. Snapshot de Acta
 * - RCV-08: Descomposición jerárquica POA vs. Ocurrencia y semántica round2(SUM)
 * - RCV-09: Trazabilidad, conciliación multifuente y múltiples precios de Actas
 * - RCV-10: Detección de sobre-facturación y diagnóstico (OVER_BILLED vs PENDING_BILLING)
 * - RCV-11: Productividad e índice PI con propagación de indeterminación
 * - RCV-12: Agregación por snapshot de cuadrilla (invarianza histórica F5.3)
 * - RCV-13: Independencia estricta por occurrence_key (sin colapso prematuro)
 * - RCV-14: Aislamiento total del Solver H8 e inmutabilidad de entradas
 */

import {
  evaluateOccurrenceVariance,
  evaluateCrewVariance,
  evaluateSiteExecutiveVariance,
  ContractualPriceSource,
  round2,
  TOLERANCE_JR,
} from '../realCostVarianceService';
import { WeeklyPlanItem } from '@/types/weeklyPlan';
import { ExecutionRecord } from '@/types/execution';
import { Acta, ActaItem, ActaItemSource } from '@/types/acta';
import * as fs from 'fs';
import * as path from 'path';

describe('Suite 49: Control de Costos Reales y Desviaciones Operativas (Fase 5.4)', () => {
  const mockPlanItem: WeeklyPlanItem = {
    id: 'plan_item_01',
    weekly_plan_id: 'wp_01',
    board_id: 'board_alpha',
    activity_key: 'LIMPIEZA_PINTURA',
    name: 'Limpieza y Pintura',
    zone: 'Sector Norte',
    unit: 'm2',
    planned_date: '2026-09-15',
    planned_qty: 100,
    theoretical_jr: 10,
    source_type: 'ROUTINE',
    routine_reference: 'ROUTINE_01',
    occurrence_key: 'occ_alpha_01',
    crew_id: 'crew_alfa',
    is_manual_override: false,
    status: 'planned',
  };

  const mockPricePOA: ContractualPriceSource = {
    poaActivityId: 'LIMPIEZA_PINTURA',
    unitPrice: 25000,
    currency: 'COP',
    unit: 'm2',
  };

  // RCV-01: Precedencia estricta de alcance físico
  test('RCV-01: Sub-ejecución física bloquea falso menor consumo de jornales', () => {
    const executions: ExecutionRecord[] = [
      {
        id: 'exec_01',
        weekly_plan_item_id: 'plan_item_01',
        board_id: 'board_alpha',
        execution_date: '2026-09-15',
        executed_qty: 60, // Sub-ejecución (60 < 100)
        worker_count: 1,
        hours_worked: 32, // 4 JR (< 10 theoretical JR)
        reported_by: 'user_worker',
        verification_status: 'verified',
      },
    ];

    const result = evaluateOccurrenceVariance(mockPlanItem, executions, [mockPricePOA]);

    expect(result.scopeStatus).toBe('SUBEJECUCION_ALCANCE');
    expect(result.effortStatus).toBe('SUBEJECUCION_ALCANCE');
    expect(result.executedQtyVerified).toBe(60);
    expect(result.deltaJr).toBe(-6); // 4 - 10 = -6 JR
  });

  // RCV-02: Eficiencia real en alcance completo
  test('RCV-02: MENOR_CONSUMO_JORNALES solo se diagnostica en ALCANCE_COMPLETO', () => {
    const executions: ExecutionRecord[] = [
      {
        id: 'exec_01',
        weekly_plan_item_id: 'plan_item_01',
        board_id: 'board_alpha',
        execution_date: '2026-09-15',
        executed_qty: 100, // Alcance exacto
        worker_count: 1,
        hours_worked: 64, // 8 JR (< 10 theoretical JR, delta -2 < -0.05)
        reported_by: 'user_worker',
        verification_status: 'verified',
      },
    ];

    const result = evaluateOccurrenceVariance(mockPlanItem, executions, [mockPricePOA]);

    expect(result.scopeStatus).toBe('ALCANCE_COMPLETO');
    expect(result.effortStatus).toBe('MENOR_CONSUMO_JORNALES');
    expect(result.deltaJr).toBe(-2);
  });

  // RCV-03: Exceso de jornales con tolerancia M3 (±0.05 JR)
  test('RCV-03: Evalúa tolerancia corporativa M3 (0.05 JR) en diagnóstico de esfuerzo', () => {
    // Caso 1: deltaJr = +0.05 -> JORNALES_BALANCEADOS
    const execBalanced: ExecutionRecord = {
      id: 'exec_b',
      weekly_plan_item_id: 'plan_item_01',
      board_id: 'board_alpha',
      execution_date: '2026-09-15',
      executed_qty: 100,
      worker_count: 1,
      hours_worked: 80.4, // 10.05 JR -> delta +0.05
      reported_by: 'user_worker',
      verification_status: 'verified',
    };

    const resBalanced = evaluateOccurrenceVariance(mockPlanItem, [execBalanced], [mockPricePOA]);
    expect(resBalanced.deltaJr).toBe(0.05);
    expect(resBalanced.effortStatus).toBe('JORNALES_BALANCEADOS');

    // Caso 2: deltaJr = +0.06 -> EXCESO_JORNALES
    const execExcess: ExecutionRecord = {
      id: 'exec_e',
      weekly_plan_item_id: 'plan_item_01',
      board_id: 'board_alpha',
      execution_date: '2026-09-15',
      executed_qty: 100,
      worker_count: 1,
      hours_worked: 80.48, // 10.06 JR -> delta +0.06
      reported_by: 'user_worker',
      verification_status: 'verified',
    };

    const resExcess = evaluateOccurrenceVariance(mockPlanItem, [execExcess], [mockPricePOA]);
    expect(resExcess.deltaJr).toBe(0.06);
    expect(resExcess.effortStatus).toBe('EXCESO_JORNALES');
  });

  // RCV-04: Aislamiento de sobre-ejecución exacta
  test('RCV-04: Sobre-ejecución física no incrementa EV_occurrence más allá del valor planificado', () => {
    const executions: ExecutionRecord[] = [
      {
        id: 'exec_01',
        weekly_plan_item_id: 'plan_item_01',
        board_id: 'board_alpha',
        execution_date: '2026-09-15',
        executed_qty: 150, // 150 verified vs 100 planned
        worker_count: 1,
        hours_worked: 80,
        reported_by: 'user_worker',
        verification_status: 'verified',
      },
    ];

    const result = evaluateOccurrenceVariance(mockPlanItem, executions, [mockPricePOA]);

    expect(result.scopeStatus).toBe('SOBRE_EJECUCION');
    expect(result.executedQtyVerified).toBe(150);
    expect(result.contractualCertifiableQty).toBe(100); // Tope contractual
    expect(result.overExecutionQty).toBe(50);
    expect(result.plannedValueOccurrenceCOP).toBe(2500000); // 100 * 25000
    expect(result.earnedValueOccurrenceCOP).toBe(2500000); // 100 * 25000 (topado)
  });

  // RCV-05: Invarianza monetaria real (AC)
  test('RCV-05: AC y CV permanecen estrictamente indeterminados (UNDETERMINED_MONETARY_COST)', () => {
    const executions: ExecutionRecord[] = [
      {
        id: 'exec_01',
        weekly_plan_item_id: 'plan_item_01',
        board_id: 'board_alpha',
        execution_date: '2026-09-15',
        executed_qty: 100,
        worker_count: 2,
        hours_worked: 40,
        reported_by: 'user_worker',
        verification_status: 'verified',
      },
    ];

    const result = evaluateOccurrenceVariance(mockPlanItem, executions, [mockPricePOA]);

    expect(result.actualCostStatus).toBe('UNDETERMINED_MONETARY_COST');
    expect(result.costVarianceStatus).toBe('UNDETERMINED_COST_VARIANCE');
  });

  // RCV-06: Desviación de valor contractual (CVV)
  test('RCV-06: CVV = EV - PV calculado en moneda COP sin pretender ser Schedule Variance', () => {
    const executions: ExecutionRecord[] = [
      {
        id: 'exec_01',
        weekly_plan_item_id: 'plan_item_01',
        board_id: 'board_alpha',
        execution_date: '2026-09-15',
        executed_qty: 80, // EV = 80 * 25k = 2.000.000 COP
        worker_count: 1,
        hours_worked: 64,
        reported_by: 'user_worker',
        verification_status: 'verified',
      },
    ];

    const result = evaluateOccurrenceVariance(mockPlanItem, executions, [mockPricePOA]);

    expect(result.plannedValueOccurrenceCOP).toBe(2500000); // 100 * 25k
    expect(result.earnedValueOccurrenceCOP).toBe(2000000); // 80 * 25k
    expect(result.contractualValueVarianceCOP).toBe(-500000); // 2.000.000 - 2.500.000
  });

  // RCV-07: Desacoplamiento de precios POA vs. Snapshot de Acta
  test('RCV-07: Ausencia de precio POA no destruye valor facturado con snapshot de Acta válido', () => {
    const executions: ExecutionRecord[] = [
      {
        id: 'exec_01',
        weekly_plan_item_id: 'plan_item_01',
        board_id: 'board_alpha',
        execution_date: '2026-09-15',
        executed_qty: 100,
        worker_count: 1,
        hours_worked: 80,
        reported_by: 'user_worker',
        verification_status: 'verified',
      },
    ];

    const actas: Acta[] = [
      {
        id: 'acta_01',
        board_id: 'board_alpha',
        numero: 1,
        estado: 'issued',
        generated_by: 'supervisor_01',
        generated_at: '2026-09-16T10:00:00Z',
      },
    ];

    const actaItems: ActaItem[] = [
      {
        id: 'ai_01',
        acta_id: 'acta_01',
        poa_activity_id: 'LIMPIEZA_PINTURA',
        descripcion_snapshot: 'Limpieza',
        unidad_snapshot: 'm2',
        precio_unitario_snapshot: 28000, // Snapshot histórico de acta
        cantidad_facturada: 100,
      },
    ];

    const actaItemSources: ActaItemSource[] = [
      {
        id: 'ais_01',
        acta_item_id: 'ai_01',
        execution_id: 'exec_01',
        cantidad_consumida: 100,
      },
    ];

    // Sin precio POA (prices = [])
    const result = evaluateOccurrenceVariance(
      mockPlanItem,
      executions,
      [],
      actas,
      actaItems,
      actaItemSources
    );

    expect(result.poaUnitPrice).toBe('UNDETERMINED_CONTRACT_VALUE');
    expect(result.plannedValueOccurrenceCOP).toBe('UNDETERMINED_CONTRACT_VALUE');
    expect(result.earnedValueOccurrenceCOP).toBe('UNDETERMINED_CONTRACT_VALUE');
    expect(result.contractualValueVarianceCOP).toBe('UNDETERMINED_CONTRACT_VALUE');

    // Pero el valor facturado sí está determinado por el snapshot de Acta
    expect(result.billedQty).toBe(100);
    expect(result.billedValueCOP).toBe(2800000); // 100 * 28.000 COP
    expect(result.billedValueBreakdown).toHaveLength(1);
    expect(result.billedValueBreakdown[0].unitPriceSnapshot).toBe(28000);
  });

  // RCV-08: Descomposición jerárquica POA vs. Ocurrencia y semántica round2(SUM)
  test('RCV-08: Aplica semántica round2(SUM) sobre hechos físicos crudos acumulados', () => {
    const executions: ExecutionRecord[] = [
      {
        id: 'exec_a',
        weekly_plan_item_id: 'plan_item_01',
        board_id: 'board_alpha',
        execution_date: '2026-09-15',
        executed_qty: 33.333,
        worker_count: 1,
        hours_worked: 26.666,
        reported_by: 'u1',
        verification_status: 'verified',
      },
      {
        id: 'exec_b',
        weekly_plan_item_id: 'plan_item_01',
        board_id: 'board_alpha',
        execution_date: '2026-09-15',
        executed_qty: 33.333,
        worker_count: 1,
        hours_worked: 26.666,
        reported_by: 'u1',
        verification_status: 'verified',
      },
      {
        id: 'exec_c',
        weekly_plan_item_id: 'plan_item_01',
        board_id: 'board_alpha',
        execution_date: '2026-09-15',
        executed_qty: 33.334,
        worker_count: 1,
        hours_worked: 26.668,
        reported_by: 'u1',
        verification_status: 'verified',
      },
    ];

    const result = evaluateOccurrenceVariance(mockPlanItem, executions, [mockPricePOA]);

    // 33.333 + 33.333 + 33.334 = 100.000 -> round2 = 100.00 exacto
    expect(result.executedQtyVerified).toBe(100);
    expect(result.scopeStatus).toBe('ALCANCE_COMPLETO');
  });

  // RCV-09: Trazabilidad, conciliación multifuente y múltiples precios de Actas
  test('RCV-09: Concilia Actas multifuente, múltiples precios y segrega ocurrencias homónimas', () => {
    // Ocurrencia A y Ocurrencia B con la misma actividad
    const planItemA = { ...mockPlanItem, id: 'plan_item_A', occurrence_key: 'occ_A' };
    const planItemB = { ...mockPlanItem, id: 'plan_item_B', occurrence_key: 'occ_B' };

    const execA1: ExecutionRecord = {
      id: 'exec_A1',
      weekly_plan_item_id: 'plan_item_A',
      board_id: 'board_alpha',
      execution_date: '2026-09-15',
      executed_qty: 40,
      worker_count: 1,
      hours_worked: 32,
      reported_by: 'u1',
      verification_status: 'verified',
    };

    const execA2: ExecutionRecord = {
      id: 'exec_A2',
      weekly_plan_item_id: 'plan_item_A',
      board_id: 'board_alpha',
      execution_date: '2026-09-16',
      executed_qty: 60,
      worker_count: 1,
      hours_worked: 48,
      reported_by: 'u1',
      verification_status: 'verified',
    };

    const execB: ExecutionRecord = {
      id: 'exec_B',
      weekly_plan_item_id: 'plan_item_B',
      board_id: 'board_alpha',
      execution_date: '2026-09-15',
      executed_qty: 100,
      worker_count: 1,
      hours_worked: 80,
      reported_by: 'u1',
      verification_status: 'verified',
    };

    const actas: Acta[] = [
      { id: 'acta_1', board_id: 'board_alpha', numero: 1, estado: 'issued', generated_by: 'sup', generated_at: '2026-09-16T10:00:00Z' },
      { id: 'acta_2', board_id: 'board_alpha', numero: 2, estado: 'closed', generated_by: 'sup', generated_at: '2026-09-17T10:00:00Z' },
      { id: 'acta_draft', board_id: 'board_alpha', numero: 3, estado: 'draft', generated_by: 'sup', generated_at: '2026-09-18T10:00:00Z' },
    ];

    const actaItems: ActaItem[] = [
      { id: 'ai_1', acta_id: 'acta_1', poa_activity_id: 'LIMPIEZA_PINTURA', descripcion_snapshot: 'Item 1', unidad_snapshot: 'm2', precio_unitario_snapshot: 10000, cantidad_facturada: 40 },
      { id: 'ai_2', acta_id: 'acta_2', poa_activity_id: 'LIMPIEZA_PINTURA', descripcion_snapshot: 'Item 2', unidad_snapshot: 'm2', precio_unitario_snapshot: 11000, cantidad_facturada: 60 },
      { id: 'ai_draft', acta_id: 'acta_draft', poa_activity_id: 'LIMPIEZA_PINTURA', descripcion_snapshot: 'Item Draft', unidad_snapshot: 'm2', precio_unitario_snapshot: 15000, cantidad_facturada: 100 },
    ];

    const actaItemSources: ActaItemSource[] = [
      { id: 'ais_1', acta_item_id: 'ai_1', execution_id: 'exec_A1', cantidad_consumida: 40 },
      { id: 'ais_2', acta_item_id: 'ai_2', execution_id: 'exec_A2', cantidad_consumida: 60 },
      { id: 'ais_draft', acta_item_id: 'ai_draft', execution_id: 'exec_B', cantidad_consumida: 100 }, // En acta draft -> ignorar
    ];

    const allExecs = [execA1, execA2, execB];

    // Ocurrencia A: tiene 2 fuentes en actas emitidas con precios $10k y $11k
    const resA = evaluateOccurrenceVariance(planItemA, allExecs, [mockPricePOA], actas, actaItems, actaItemSources);
    expect(resA.billedQty).toBe(100);
    // 40 * 10.000 + 60 * 11.000 = 400.000 + 660.000 = 1.060.000 COP
    expect(resA.billedValueCOP).toBe(1060000);
    expect(resA.billedValueBreakdown).toHaveLength(2);
    expect(resA.billingReconciliationStatus).toBe('BALANCED');

    // Ocurrencia B: solo vinculada a acta draft -> billedQty = 0
    const resB = evaluateOccurrenceVariance(planItemB, allExecs, [mockPricePOA], actas, actaItems, actaItemSources);
    expect(resB.billedQty).toBe(0);
    expect(resB.billedValueCOP).toBe(0);
    expect(resB.pendingBillableQty).toBe(100);
    expect(resB.billingReconciliationStatus).toBe('PENDING_BILLING');
  });

  // RCV-10: Detección de sobre-facturación y diagnóstico
  test('RCV-10: Detecta sobre-facturación (OVER_BILLED) y facturación pendiente (PENDING_BILLING)', () => {
    const executions: ExecutionRecord[] = [
      {
        id: 'exec_01',
        weekly_plan_item_id: 'plan_item_01',
        board_id: 'board_alpha',
        execution_date: '2026-09-15',
        executed_qty: 100,
        worker_count: 1,
        hours_worked: 80,
        reported_by: 'u1',
        verification_status: 'verified',
      },
    ];

    const actas: Acta[] = [
      { id: 'acta_over', board_id: 'board_alpha', numero: 1, estado: 'issued', generated_by: 'sup', generated_at: '2026-09-16T10:00:00Z' },
    ];

    const actaItemsOver: ActaItem[] = [
      { id: 'ai_over', acta_id: 'acta_over', poa_activity_id: 'LIMPIEZA_PINTURA', descripcion_snapshot: 'Over', unidad_snapshot: 'm2', precio_unitario_snapshot: 10000, cantidad_facturada: 120 },
    ];

    const actaItemSourcesOver: ActaItemSource[] = [
      { id: 'ais_over', acta_item_id: 'ai_over', execution_id: 'exec_01', cantidad_consumida: 120 },
    ];

    const resOver = evaluateOccurrenceVariance(
      mockPlanItem,
      executions,
      [mockPricePOA],
      actas,
      actaItemsOver,
      actaItemSourcesOver
    );

    expect(resOver.contractualCertifiableQty).toBe(100);
    expect(resOver.billedQty).toBe(120);
    expect(resOver.pendingBillableQty).toBe(0);
    expect(resOver.overBilledQty).toBe(20);
    expect(resOver.billingReconciliationStatus).toBe('OVER_BILLED');
  });

  // RCV-11: Productividad e índice PI con propagación de indeterminación
  test('RCV-11: Propaga UNDETERMINED_PRODUCTIVITY cuando hay denominadores cero', () => {
    // Caso 1: theoretical_jr = 0
    const planZeroJr = { ...mockPlanItem, theoretical_jr: 0 };
    const execValid: ExecutionRecord = {
      id: 'exec_01',
      weekly_plan_item_id: 'plan_item_01',
      board_id: 'board_alpha',
      execution_date: '2026-09-15',
      executed_qty: 100,
      worker_count: 1,
      hours_worked: 80,
      reported_by: 'u1',
      verification_status: 'verified',
    };

    const resZeroTheo = evaluateOccurrenceVariance(planZeroJr, [execValid], [mockPricePOA]);
    expect(resZeroTheo.theoreticalProductivityRate).toBe('UNDETERMINED_PRODUCTIVITY');
    expect(resZeroTheo.productivityIndex).toBe('UNDETERMINED_PRODUCTIVITY');

    // Caso 2: executed_jr_verified = 0
    const execZeroJr: ExecutionRecord = {
      id: 'exec_02',
      weekly_plan_item_id: 'plan_item_01',
      board_id: 'board_alpha',
      execution_date: '2026-09-15',
      executed_qty: 100,
      worker_count: 0,
      hours_worked: 0,
      reported_by: 'u1',
      verification_status: 'verified',
    };

    const resZeroExec = evaluateOccurrenceVariance(mockPlanItem, [execZeroJr], [mockPricePOA]);
    expect(resZeroExec.realProductivityRate).toBe('UNDETERMINED_PRODUCTIVITY');
    expect(resZeroExec.productivityIndex).toBe('UNDETERMINED_PRODUCTIVITY');

    // Caso 3: Normal
    const execNormal: ExecutionRecord = {
      id: 'exec_03',
      weekly_plan_item_id: 'plan_item_01',
      board_id: 'board_alpha',
      execution_date: '2026-09-15',
      executed_qty: 100,
      worker_count: 1,
      hours_worked: 40, // 5 JR -> Real Rate = 100 / 5 = 20
      reported_by: 'u1',
      verification_status: 'verified',
    };

    const resNormal = evaluateOccurrenceVariance(mockPlanItem, [execNormal], [mockPricePOA]);
    expect(resNormal.theoreticalProductivityRate).toBe(10); // 100 / 10 = 10
    expect(resNormal.realProductivityRate).toBe(20); // 100 / 5 = 20
    expect(resNormal.productivityIndex).toBe(2); // 20 / 10 = 2.0
  });

  // RCV-12: Agregación por snapshot de cuadrilla
  test('RCV-12: Agrupación por cuadrilla respeta crew_id_snapshot de ejecuciones físicas', () => {
    const planItemReassigned = { ...mockPlanItem, crew_id: 'crew_beta' }; // Cuadrilla actual modificada

    const executionHistorical: ExecutionRecord = {
      id: 'exec_hist',
      weekly_plan_item_id: 'plan_item_01',
      board_id: 'board_alpha',
      execution_date: '2026-09-15',
      executed_qty: 100,
      worker_count: 1,
      hours_worked: 80, // 10 JR
      reported_by: 'u1',
      verification_status: 'verified',
      crew_id_snapshot: 'crew_alfa', // Snapshot histórico fijado en F5.3
    };

    const occAnalysis = evaluateOccurrenceVariance(planItemReassigned, [executionHistorical], [mockPricePOA]);
    expect(occAnalysis.assignedCrewId).toBe('crew_alfa'); // Mantiene snapshot histórico

    const crewSummaries = evaluateCrewVariance([occAnalysis]);
    expect(crewSummaries).toHaveLength(1);
    expect(crewSummaries[0].crewId).toBe('crew_alfa');
    expect(crewSummaries[0].totalExecutedJrVerified).toBe(10);
  });

  // RCV-13: Independencia estricta por occurrence_key
  test('RCV-13: Dos ocurrencias con la misma actividad mantienen entidades de análisis independientes', () => {
    const planItem1: WeeklyPlanItem = {
      ...mockPlanItem,
      id: 'pi_1',
      occurrence_key: 'occ_sem_1',
      planned_date: '2026-09-15',
      planned_qty: 50,
      theoretical_jr: 5,
    };

    const planItem2: WeeklyPlanItem = {
      ...mockPlanItem,
      id: 'pi_2',
      occurrence_key: 'occ_sem_2',
      planned_date: '2026-09-22',
      planned_qty: 50,
      theoretical_jr: 5,
    };

    const exec1: ExecutionRecord = {
      id: 'ex_1',
      weekly_plan_item_id: 'pi_1',
      board_id: 'board_alpha',
      execution_date: '2026-09-15',
      executed_qty: 50,
      worker_count: 1,
      hours_worked: 40,
      reported_by: 'u1',
      verification_status: 'verified',
    };

    const exec2: ExecutionRecord = {
      id: 'ex_2',
      weekly_plan_item_id: 'pi_2',
      board_id: 'board_alpha',
      execution_date: '2026-09-22',
      executed_qty: 30, // Sub-ejecución en semana 2
      worker_count: 1,
      hours_worked: 40,
      reported_by: 'u1',
      verification_status: 'verified',
    };

    const summary = evaluateSiteExecutiveVariance(
      'board_alpha',
      [planItem1, planItem2],
      [exec1, exec2],
      [mockPricePOA]
    );

    expect(summary.totalOccurrencesCount).toBe(2);
    expect(summary.occurrences[0].occurrenceKey).toBe('occ_sem_1');
    expect(summary.occurrences[0].scopeStatus).toBe('ALCANCE_COMPLETO');

    expect(summary.occurrences[1].occurrenceKey).toBe('occ_sem_2');
    expect(summary.occurrences[1].scopeStatus).toBe('SUBEJECUCION_ALCANCE');

    expect(summary.scopeComplianceRate).toBe(50); // 1 de 2 = 50%
  });

  // RCV-14: Aislamiento total del Solver H8 e inmutabilidad de entradas
  test('RCV-14: No muta objetos de entrada y mantiene 0 dependencias/imports del Solver H8', () => {
    const originalPlanItem = { ...mockPlanItem };
    const originalExecutions = [
      {
        id: 'exec_imm',
        weekly_plan_item_id: 'plan_item_01',
        board_id: 'board_alpha',
        execution_date: '2026-09-15',
        executed_qty: 100,
        worker_count: 1,
        hours_worked: 80,
        reported_by: 'u1',
        verification_status: 'verified' as const,
      },
    ];

    evaluateOccurrenceVariance(originalPlanItem, originalExecutions, [mockPricePOA]);

    // Inmutabilidad
    expect(originalPlanItem).toEqual(mockPlanItem);

    // Auditoría AST/código fuente contra Solver H8
    const servicePath = path.resolve(__dirname, '../realCostVarianceService.ts');
    const fileContent = fs.readFileSync(servicePath, 'utf8');

    expect(fileContent).not.toMatch(/import\s+.*from\s+['"].*solver.*['"]/i);
    expect(fileContent).not.toMatch(/import\s+.*from\s+['"].*scheduleOptimizer.*['"]/i);
    expect(fileContent).not.toMatch(/scheduleOptimizer/i);
    expect(fileContent).not.toMatch(/solver/i);
    expect(fileContent).not.toMatch(/h8/i);
  });
});
