/**
 * Test Suite: Operational Memory & Observability Analytics Service (OMA-01 -> OMA-20)
 *
 * Valida:
 * 1. Separación estricta de Hechos -> Métricas -> Patrones.
 * 2. Contratos matemáticos cerrados y propagación de indeterminación.
 * 3. Detección determinista de los 6 patrones canónicos.
 * 4. Compuertas estadísticas de suficiencia (INSUFFICIENT_EVIDENCE ante N < minSampleSize).
 * 5. Inmutabilidad de los hechos de entrada (toEqual(copy)).
 * 6. Aislamiento total del Solver H8.
 */

import {
  evaluateOperationalMemoryAnalytics,
  computeOperationalMetrics,
  detectOperationalPatterns,
  OperationalFactsPayload,
} from '../operationalMemoryAnalyticsService';
import { WeeklyPlanItem } from '@/types/weeklyPlan';
import { ExecutionRecord } from '@/types/execution';
import { AnalyticsScope } from '@/types/operationalMemory';

describe('FASE Observabilidad Operativa / Memoria de Ejecución v1 (Suite OMA-01 a OMA-20)', () => {
  const fixedIsoDate = '2026-09-13T10:00:00.000Z';
  const defaultScope: AnalyticsScope = {
    scopeType: 'BOARD',
    scopeId: 'board_test_1',
  };

  const samplePlanItems: WeeklyPlanItem[] = [
    {
      id: 'item_1',
      weekly_plan_id: 'plan_1',
      board_id: 'board_test_1',
      activity_key: 'PODA_ARBOLES',
      name: 'Poda de Árboles',
      zone: 'Zona Norte',
      unit: 'm2',
      planned_date: '2026-09-10',
      planned_qty: 100,
      theoretical_jr: 2, // R_teo = 50 m2/JR
      source_type: 'ROUTINE',
      routine_reference: 'ROUT_01',
      occurrence_key: 'occ_1',
      crew_id: 'crew_alpha',
      is_manual_override: false,
      status: 'completed',
    },
    {
      id: 'item_2',
      weekly_plan_id: 'plan_1',
      board_id: 'board_test_1',
      activity_key: 'PODA_ARBOLES',
      name: 'Poda de Árboles',
      zone: 'Zona Sur',
      unit: 'm2',
      planned_date: '2026-09-11',
      planned_qty: 200,
      theoretical_jr: 4, // R_teo = 50 m2/JR
      source_type: 'ROUTINE',
      routine_reference: 'ROUT_01',
      occurrence_key: 'occ_2',
      crew_id: 'crew_alpha',
      is_manual_override: false,
      status: 'completed',
    },
    {
      id: 'item_3',
      weekly_plan_id: 'plan_1',
      board_id: 'board_test_1',
      activity_key: 'PODA_ARBOLES',
      name: 'Poda de Árboles',
      zone: 'Zona Centro',
      unit: 'm2',
      planned_date: '2026-09-12',
      planned_qty: 150,
      theoretical_jr: 3, // R_teo = 50 m2/JR
      source_type: 'ROUTINE',
      routine_reference: 'ROUT_01',
      occurrence_key: 'occ_3',
      crew_id: 'crew_alpha',
      is_manual_override: false,
      status: 'completed',
    },
  ];

  const sampleExecutions: ExecutionRecord[] = [
    {
      id: 'exec_1',
      weekly_plan_item_id: 'item_1',
      board_id: 'board_test_1',
      execution_date: '2026-09-10',
      executed_qty: 100,
      worker_count: 2,
      hours_worked: 8,
      jornales_used: 2, // R_real = 50 m2/JR -> IP = 1.0
      reported_by: 'user_1',
      verification_status: 'verified',
      crew_id_snapshot: 'crew_alpha',
      used_resources: [
        { resourceKey: 'MAT_BOLSA', resourceName: 'Bolsa 50kg', category: 'MATERIAL', unit: 'unidad', quantity: 10 },
      ],
      created_at: '2026-09-10T16:00:00.000Z',
      verified_at: '2026-09-10T18:00:00.000Z', // 2h lead time
    },
    {
      id: 'exec_2',
      weekly_plan_item_id: 'item_2',
      board_id: 'board_test_1',
      execution_date: '2026-09-11',
      executed_qty: 200,
      worker_count: 4,
      hours_worked: 8,
      jornales_used: 4, // R_real = 50 m2/JR -> IP = 1.0
      reported_by: 'user_1',
      verification_status: 'verified',
      crew_id_snapshot: 'crew_alpha',
      used_resources: [
        { resourceKey: 'MAT_BOLSA', resourceName: 'Bolsa 50kg', category: 'MATERIAL', unit: 'unidad', quantity: 20 },
      ],
      created_at: '2026-09-11T16:00:00.000Z',
      verified_at: '2026-09-11T18:00:00.000Z', // 2h lead time
    },
    {
      id: 'exec_3',
      weekly_plan_item_id: 'item_3',
      board_id: 'board_test_1',
      execution_date: '2026-09-12',
      executed_qty: 150,
      worker_count: 3,
      hours_worked: 8,
      jornales_used: 3, // R_real = 50 m2/JR -> IP = 1.0
      reported_by: 'user_1',
      verification_status: 'verified',
      crew_id_snapshot: 'crew_alpha',
      used_resources: [
        { resourceKey: 'MAT_BOLSA', resourceName: 'Bolsa 50kg', category: 'MATERIAL', unit: 'unidad', quantity: 15 },
      ],
      created_at: '2026-09-12T16:00:00.000Z',
      verified_at: '2026-09-12T18:00:00.000Z', // 2h lead time
    },
  ];

  // ───────────────────────────────────────────────────────────────────────────
  // OMA-01: Inmutabilidad Absoluta de Hechos
  // ───────────────────────────────────────────────────────────────────────────
  test('OMA-01: Inmutabilidad Absoluta de Hechos de Entrada', () => {
    const plansCopy = JSON.parse(JSON.stringify(samplePlanItems));
    const execsCopy = JSON.parse(JSON.stringify(sampleExecutions));

    evaluateOperationalMemoryAnalytics(
      { boardId: 'board_test_1', evaluatedAt: fixedIsoDate },
      { planItems: samplePlanItems, executions: sampleExecutions }
    );

    expect(samplePlanItems).toEqual(plansCopy);
    expect(sampleExecutions).toEqual(execsCopy);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OMA-02: Determinismo Temporal y de Cálculo
  // ───────────────────────────────────────────────────────────────────────────
  test('OMA-02: Determinismo Absoluto 100% (Mismo Input -> Mismo Resultado)', () => {
    const res1 = evaluateOperationalMemoryAnalytics(
      { boardId: 'board_test_1', evaluatedAt: fixedIsoDate },
      { planItems: samplePlanItems, executions: sampleExecutions }
    );

    const res2 = evaluateOperationalMemoryAnalytics(
      { boardId: 'board_test_1', evaluatedAt: fixedIsoDate },
      { planItems: samplePlanItems, executions: sampleExecutions }
    );

    expect(res1).toEqual(res2);
    expect(res1.totalFactsEvaluated.planItemsCount).toBe(3);
    expect(res1.totalFactsEvaluated.verifiedExecutionsCount).toBe(3);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OMA-03: Cálculo Matemático Cerrado de Productividad (R_real, R_teo, IP)
  // ───────────────────────────────────────────────────────────────────────────
  test('OMA-03: Cálculo Exacto de R_real, R_teo e IP', () => {
    const metrics = computeOperationalMetrics(defaultScope, samplePlanItems, sampleExecutions);

    const rTeo = metrics.find((m) => m.metricKey === 'METRIC_THEORETICAL_PRODUCTIVITY_RATE');
    const rReal = metrics.find((m) => m.metricKey === 'METRIC_PRODUCTIVITY_RATE');
    const ip = metrics.find((m) => m.metricKey === 'METRIC_PRODUCTIVITY_INDEX');

    expect(rTeo?.value).toBe(50); // 450 m2 / 9 JR
    expect(rReal?.value).toBe(50); // 450 m2 / 9 JR
    expect(ip?.value).toBe(1.0); // 50 / 50
    expect(ip?.valueStatus).toBe('DETERMINED');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OMA-04: Exclusión Estricta de Ejecuciones Rechazadas en Productividad
  // ───────────────────────────────────────────────────────────────────────────
  test('OMA-04: Exclusión de Ejecuciones Rejected del Cálculo de R_real', () => {
    const execWithRejected: ExecutionRecord[] = [
      ...sampleExecutions,
      {
        id: 'exec_rejected',
        weekly_plan_item_id: 'item_1',
        board_id: 'board_test_1',
        execution_date: '2026-09-10',
        executed_qty: 1000, // Magnitud anómala rechazada
        worker_count: 10,
        hours_worked: 8,
        jornales_used: 10,
        reported_by: 'user_fake',
        verification_status: 'rejected',
        rejection_reason: 'Foto no corresponde al sitio',
      },
    ];

    const metrics = computeOperationalMetrics(defaultScope, samplePlanItems, execWithRejected);
    const rReal = metrics.find((m) => m.metricKey === 'METRIC_PRODUCTIVITY_RATE');
    const rejRate = metrics.find((m) => m.metricKey === 'METRIC_VERIFICATION_REJECTION_RATE');

    expect(rReal?.value).toBe(50); // Inalterado
    expect(rejRate?.value).toBe(0.25); // 1 rechazada de 4 totales (25%)
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OMA-05: Propagación de Indeterminación ante Cero Esfuerzo / Cero Cantidad
  // ───────────────────────────────────────────────────────────────────────────
  test('OMA-05: Propagación de Estados Indeterminados (Zero JR / Zero Qty)', () => {
    const emptyMetrics = computeOperationalMetrics(defaultScope, [], []);

    const rReal = emptyMetrics.find((m) => m.metricKey === 'METRIC_PRODUCTIVITY_RATE');
    const ip = emptyMetrics.find((m) => m.metricKey === 'METRIC_PRODUCTIVITY_INDEX');

    expect(rReal?.value).toBeNull();
    expect(rReal?.valueStatus).toBe('UNDETERMINED_UNVERIFIED_DATA');
    expect(ip?.value).toBeNull();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OMA-06: Métrica de Duración Multidía y Promedio de Personal
  // ───────────────────────────────────────────────────────────────────────────
  test('OMA-06: Cálculo de Duración Multidía y Promedio de Personal', () => {
    const multidayExecs: ExecutionRecord[] = [
      {
        id: 'e1',
        weekly_plan_item_id: 'item_1',
        board_id: 'board_1',
        execution_date: '2026-09-10',
        executed_qty: 50,
        worker_count: 2,
        hours_worked: 8,
        reported_by: 'u1',
        verification_status: 'verified',
      },
      {
        id: 'e2',
        weekly_plan_item_id: 'item_1',
        board_id: 'board_1',
        execution_date: '2026-09-11',
        executed_qty: 50,
        worker_count: 4,
        hours_worked: 8,
        reported_by: 'u1',
        verification_status: 'verified',
      },
    ];

    const metrics = computeOperationalMetrics(defaultScope, [samplePlanItems[0]], multidayExecs);
    const duration = metrics.find((m) => m.metricKey === 'METRIC_MULTIDAY_DURATION_DAYS');
    const intensity = metrics.find((m) => m.metricKey === 'METRIC_DAILY_EXECUTION_INTENSITY');

    expect(duration?.value).toBe(2); // 2 días distintos
    expect(intensity?.value).toBe(3); // Promedio (2 + 4) / 2 = 3 operarios
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OMA-07: Métrica de Consumo de Recursos POD-01 y Delta
  // ───────────────────────────────────────────────────────────────────────────
  test('OMA-07: Métrica de Ratio de Consumo y Delta de Recursos POD-01', () => {
    const requiredMap = {
      item_1: [{ resourceKey: 'MAT_BOLSA', quantity: 50 }],
    };

    const metrics = computeOperationalMetrics(defaultScope, [samplePlanItems[0]], [sampleExecutions[0]], [], requiredMap);
    const ratio = metrics.find((m) => m.metricKey === 'METRIC_RESOURCE_CONSUMPTION_RATIO');
    const delta = metrics.find((m) => m.metricKey === 'METRIC_RESOURCE_VARIANCE_DELTA');

    expect(ratio?.value).toBe(0.1); // 10 bolsas / 100 m2 = 0.1 bolsa/m2
    expect(delta?.value).toBe(-40); // 10 usadas - 50 requeridas = -40
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OMA-08: Lead Time de Verificación Formal
  // ───────────────────────────────────────────────────────────────────────────
  test('OMA-08: Cálculo de Lead Time de Verificación en Horas', () => {
    const metrics = computeOperationalMetrics(defaultScope, samplePlanItems, sampleExecutions);
    const leadTime = metrics.find((m) => m.metricKey === 'METRIC_VERIFICATION_LEAD_TIME_HOURS');

    expect(leadTime?.value).toBe(2); // 2 horas exactas
    expect(leadTime?.sufficiencyStatus).toBe('SUFFICIENT_EVIDENCE');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OMA-09: Patrón P-01 Subestimación Sistemática (Detección Positiva)
  // ───────────────────────────────────────────────────────────────────────────
  test('OMA-09: Detección Positiva de Patrón P-01 (Subestimación Sistemática IP < 0.85)', () => {
    // 3 ejecuciones con sobreconsumo severo (IP = 25/50 = 0.50 < 0.85 en 100% de los casos)
    const underperformingExecs: ExecutionRecord[] = sampleExecutions.map((e) => ({
      ...e,
      jornales_used: (e.jornales_used || 2) * 2, // Doble de esfuerzo -> IP cae a la mitad
      worker_count: e.worker_count * 2,
    }));

    const metrics = computeOperationalMetrics(defaultScope, samplePlanItems, underperformingExecs);
    const patterns = detectOperationalPatterns(defaultScope, metrics, samplePlanItems, underperformingExecs);

    const p01 = patterns.find((p) => p.patternKey === 'P-01_SYSTEMATIC_UNDERESTIMATION');
    expect(p01?.detectionStatus).toBe('PATTERN_DETECTED');
    expect(p01?.empiricalEvidence.prevalenceRatio).toBe(1.0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OMA-10: Patrón P-01 Suficiencia Estadística (Muestra Insuficiente -> INSUFFICIENT_EVIDENCE)
  // ───────────────────────────────────────────────────────────────────────────
  test('OMA-10: Compuerta Estadística P-01 (Muestra < minSampleSize -> INSUFFICIENT_EVIDENCE)', () => {
    // Solo 1 ejecución (min requerido es 3)
    const singlePlan = [samplePlanItems[0]];
    const singleExec = [sampleExecutions[0]];

    const metrics = computeOperationalMetrics(defaultScope, singlePlan, singleExec);
    const patterns = detectOperationalPatterns(defaultScope, metrics, singlePlan, singleExec);

    const p01 = patterns.find((p) => p.patternKey === 'P-01_SYSTEMATIC_UNDERESTIMATION');
    expect(p01?.detectionStatus).toBe('INSUFFICIENT_EVIDENCE');
    expect(p01?.sampleSize).toBe(1);
    expect(p01?.minRequiredSampleSize).toBe(3);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OMA-11: Patrón P-02 Dispersión de Cuadrillas (Detección Positiva)
  // ───────────────────────────────────────────────────────────────────────────
  test('OMA-11: Detección Positiva de Patrón P-02 (Dispersión entre Cuadrillas)', () => {
    const crewAExecs: ExecutionRecord[] = [
      { id: 'ca1', weekly_plan_item_id: 'i1', board_id: 'b1', execution_date: '2026-09-10', executed_qty: 100, worker_count: 1, hours_worked: 8, jornales_used: 1, reported_by: 'u1', verification_status: 'verified', crew_id_snapshot: 'crew_a' },
      { id: 'ca2', weekly_plan_item_id: 'i2', board_id: 'b1', execution_date: '2026-09-11', executed_qty: 100, worker_count: 1, hours_worked: 8, jornales_used: 1, reported_by: 'u1', verification_status: 'verified', crew_id_snapshot: 'crew_a' },
      { id: 'ca3', weekly_plan_item_id: 'i3', board_id: 'b1', execution_date: '2026-09-12', executed_qty: 100, worker_count: 1, hours_worked: 8, jornales_used: 1, reported_by: 'u1', verification_status: 'verified', crew_id_snapshot: 'crew_a' },
    ];
    const crewBExecs: ExecutionRecord[] = [
      { id: 'cb1', weekly_plan_item_id: 'i4', board_id: 'b1', execution_date: '2026-09-10', executed_qty: 30, worker_count: 1, hours_worked: 8, jornales_used: 1, reported_by: 'u2', verification_status: 'verified', crew_id_snapshot: 'crew_b' },
      { id: 'cb2', weekly_plan_item_id: 'i5', board_id: 'b1', execution_date: '2026-09-11', executed_qty: 30, worker_count: 1, hours_worked: 8, jornales_used: 1, reported_by: 'u2', verification_status: 'verified', crew_id_snapshot: 'crew_b' },
      { id: 'cb3', weekly_plan_item_id: 'i6', board_id: 'b1', execution_date: '2026-09-12', executed_qty: 30, worker_count: 1, hours_worked: 8, jornales_used: 1, reported_by: 'u2', verification_status: 'verified', crew_id_snapshot: 'crew_b' },
    ];

    const allExecs = [...crewAExecs, ...crewBExecs];
    const metrics = computeOperationalMetrics(defaultScope, samplePlanItems, allExecs);
    const patterns = detectOperationalPatterns(defaultScope, metrics, samplePlanItems, allExecs);

    const p02 = patterns.find((p) => p.patternKey === 'P-02_CREW_PERFORMANCE_DISPERSION');
    expect(p02?.detectionStatus).toBe('PATTERN_DETECTED');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OMA-12: Patrón P-04 Arrastre Multidía Oculto
  // ───────────────────────────────────────────────────────────────────────────
  test('OMA-12: Detección Positiva de Patrón P-04 (Arrastre Multidía Oculto)', () => {
    // 3 ítems planificados en 1 día, pero cada uno tiene 2 ejecuciones en fechas distintas
    const multidayExecs: ExecutionRecord[] = [
      { id: 'e1', weekly_plan_item_id: 'item_1', board_id: 'b1', execution_date: '2026-09-10', executed_qty: 50, worker_count: 2, hours_worked: 8, reported_by: 'u1', verification_status: 'verified' },
      { id: 'e2', weekly_plan_item_id: 'item_1', board_id: 'b1', execution_date: '2026-09-11', executed_qty: 50, worker_count: 2, hours_worked: 8, reported_by: 'u1', verification_status: 'verified' },
      { id: 'e3', weekly_plan_item_id: 'item_2', board_id: 'b1', execution_date: '2026-09-10', executed_qty: 100, worker_count: 2, hours_worked: 8, reported_by: 'u1', verification_status: 'verified' },
      { id: 'e4', weekly_plan_item_id: 'item_2', board_id: 'b1', execution_date: '2026-09-11', executed_qty: 100, worker_count: 2, hours_worked: 8, reported_by: 'u1', verification_status: 'verified' },
      { id: 'e5', weekly_plan_item_id: 'item_3', board_id: 'b1', execution_date: '2026-09-10', executed_qty: 75, worker_count: 2, hours_worked: 8, reported_by: 'u1', verification_status: 'verified' },
      { id: 'e6', weekly_plan_item_id: 'item_3', board_id: 'b1', execution_date: '2026-09-11', executed_qty: 75, worker_count: 2, hours_worked: 8, reported_by: 'u1', verification_status: 'verified' },
    ];

    const metrics = computeOperationalMetrics(defaultScope, samplePlanItems, multidayExecs);
    const patterns = detectOperationalPatterns(defaultScope, metrics, samplePlanItems, multidayExecs);

    const p04 = patterns.find((p) => p.patternKey === 'P-04_HIDDEN_MULTIDAY_DRAG');
    expect(p04?.detectionStatus).toBe('PATTERN_DETECTED');
    expect(p04?.empiricalEvidence.prevalenceRatio).toBe(1.0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OMA-13: Patrón P-05 Cuello de Botella Operativo
  // ───────────────────────────────────────────────────────────────────────────
  test('OMA-13: Detección Positiva de Patrón P-05 (Cuello de Botella Operativo por Pendientes)', () => {
    const bottleneckExecs: ExecutionRecord[] = [
      { id: 'e1', weekly_plan_item_id: 'item_1', board_id: 'b1', execution_date: '2026-09-10', executed_qty: 50, worker_count: 2, hours_worked: 8, reported_by: 'u1', verification_status: 'reported' },
      { id: 'e2', weekly_plan_item_id: 'item_2', board_id: 'b1', execution_date: '2026-09-11', executed_qty: 50, worker_count: 2, hours_worked: 8, reported_by: 'u1', verification_status: 'reported' },
      { id: 'e3', weekly_plan_item_id: 'item_3', board_id: 'b1', execution_date: '2026-09-12', executed_qty: 50, worker_count: 2, hours_worked: 8, reported_by: 'u1', verification_status: 'reported' },
    ];

    const metrics = computeOperationalMetrics(defaultScope, samplePlanItems, bottleneckExecs);
    const patterns = detectOperationalPatterns(defaultScope, metrics, samplePlanItems, bottleneckExecs);

    const p05 = patterns.find((p) => p.patternKey === 'P-05_OPERATIONAL_BOTTLENECK');
    expect(p05?.detectionStatus).toBe('PATTERN_DETECTED');
    expect(p05?.empiricalEvidence.prevalenceRatio).toBe(1.0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OMA-14: Patrón P-06 Arrastre por Reprogramación Recurrente
  // ───────────────────────────────────────────────────────────────────────────
  test('OMA-14: Detección Positiva de Patrón P-06 (Arrastre por Reprogramaciones Recurrentes)', () => {
    const reschedules = [
      { occurrence_key: 'occ_1', reschedule_count: 3, last_override_reason: 'Lluvia severa' },
      { occurrence_key: 'occ_2', reschedule_count: 2, last_override_reason: 'Falta de material' },
      { occurrence_key: 'occ_3', reschedule_count: 0 },
    ];

    const metrics = computeOperationalMetrics(defaultScope, samplePlanItems, sampleExecutions, reschedules);
    const patterns = detectOperationalPatterns(defaultScope, metrics, samplePlanItems, sampleExecutions, reschedules);

    const p06 = patterns.find((p) => p.patternKey === 'P-06_RECURRENT_RESCHEDULE_DRAG');
    expect(p06?.detectionStatus).toBe('PATTERN_DETECTED');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OMA-15: Parametrización y Overrides de Umbrales de Patrones
  // ───────────────────────────────────────────────────────────────────────────
  test('OMA-15: Soporte de Overrides Explícitos de Umbrales sin Mutación Global', () => {
    const metrics = computeOperationalMetrics(defaultScope, samplePlanItems, sampleExecutions);
    // Cambiar umbral de subestimación a 1.20 (para forzar detección con IP = 1.0)
    const patterns = detectOperationalPatterns(
      defaultScope,
      metrics,
      samplePlanItems,
      sampleExecutions,
      [],
      { underestimationIpThreshold: 1.20 }
    );

    const p01 = patterns.find((p) => p.patternKey === 'P-01_SYSTEMATIC_UNDERESTIMATION');
    expect(p01?.detectionStatus).toBe('PATTERN_DETECTED');
    expect(p01?.thresholdsApplied.underestimationIpThreshold).toBe(1.20);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OMA-16: Filtrado Temporal y por Ocurrencias en Fachada Principal
  // ───────────────────────────────────────────────────────────────────────────
  test('OMA-16: Filtrado Temporal y por Ocurrencias en evaluateOperationalMemoryAnalytics', () => {
    const result = evaluateOperationalMemoryAnalytics(
      {
        boardId: 'board_test_1',
        dateFrom: '2026-09-11',
        dateTo: '2026-09-12',
        evaluatedAt: fixedIsoDate,
      },
      { planItems: samplePlanItems, executions: sampleExecutions }
    );

    expect(result.totalFactsEvaluated.planItemsCount).toBe(2); // item_2 y item_3
    expect(result.totalFactsEvaluated.executionRecordsCount).toBe(2);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OMA-17: Prueba Negativa (Cero Solvers / Cero H8 / Cero Optimizadores)
  // ───────────────────────────────────────────────────────────────────────────
  test('OMA-17: Prueba Negativa (Cero Solvers H8 / Cero Modificaciones Prescriptivas)', () => {
    const result = evaluateOperationalMemoryAnalytics(
      { boardId: 'board_test_1', evaluatedAt: fixedIsoDate },
      { planItems: samplePlanItems, executions: sampleExecutions }
    );

    expect(result).not.toHaveProperty('solverH8');
    expect(result).not.toHaveProperty('prescriptiveSchedule');
    expect(result).not.toHaveProperty('optimizedAllocation');
  });
});
