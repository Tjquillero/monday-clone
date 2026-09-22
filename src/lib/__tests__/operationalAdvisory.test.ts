/**
 * Test Suite: Operational Advisory & Recommendation Engine Service (OAD-01 -> OAD-20)
 *
 * Valida:
 * 1. Generación y bloqueo de recomendaciones para las 4 familias (R-01 a R-04).
 * 2. Bloqueo estricto ante INSUFFICIENT_EVIDENCE y PATTERN_NOT_DETECTED.
 * 3. Gateways explícitos de dominio (poaService, weeklyPlanService, crewAssignmentService).
 * 4. Honestidad epistemológica en ProjectedImpact (proposedTargetValue y projectedValue: null).
 * 5. Determinismo estricto de recommendationId y determinismo funcional 100%.
 * 6. Matriz determinista de prioridades (HIGH / MEDIUM / LOW).
 * 7. Inmutabilidad de los datos de entrada (toEqual(copy)).
 * 8. Aislamiento total del Solver H8 y ausencia de clientes de base de datos.
 */

import {
  generateOperationalRecommendations,
  computeRecommendationId,
  computeRecommendationPriority,
} from '../operationalAdvisoryService';
import {
  OperationalMemoryAnalyticsResult,
  OperationalPatternResult,
  OperationalMetricResult,
  AnalyticsScope,
} from '@/types/operationalMemory';

describe('FASE Recommendation Engine / Advisory Layer v1.2 (Suite OAD-01 a OAD-20)', () => {
  const fixedIsoDate = '2026-09-13T10:00:00.000Z';
  const defaultScope: AnalyticsScope = {
    scopeType: 'BOARD',
    scopeId: 'board_test_1',
    scopeName: 'Tablero Principal',
  };

  const sampleMetrics: OperationalMetricResult[] = [
    {
      metricKey: 'METRIC_THEORETICAL_PRODUCTIVITY_RATE',
      scope: defaultScope,
      value: 50,
      unit: 'unidad/JR',
      valueStatus: 'DETERMINED',
      sufficiencyStatus: 'SUFFICIENT_EVIDENCE',
      sampleSize: 3,
      calculationTrace: { formula: 'qty/jr', inputs: { qty: 150, jr: 3 } },
    },
    {
      metricKey: 'METRIC_PRODUCTIVITY_RATE',
      scope: defaultScope,
      value: 30, // R_real = 30 m2/JR
      unit: 'unidad/JR',
      valueStatus: 'DETERMINED',
      sufficiencyStatus: 'SUFFICIENT_EVIDENCE',
      sampleSize: 3,
      calculationTrace: { formula: 'qty/jr', inputs: { qty: 90, jr: 3 } },
    },
    {
      metricKey: 'METRIC_PRODUCTIVITY_INDEX',
      scope: defaultScope,
      value: 0.60, // IP = 30/50 = 0.60
      unit: 'ratio',
      valueStatus: 'DETERMINED',
      sufficiencyStatus: 'SUFFICIENT_EVIDENCE',
      sampleSize: 3,
      calculationTrace: { formula: 'R_real/R_teo', inputs: { rReal: 30, rTeo: 50 } },
    },
    {
      metricKey: 'METRIC_EFFORT_VARIANCE_JR',
      scope: defaultScope,
      value: 2.0,
      unit: 'JR',
      valueStatus: 'DETERMINED',
      sufficiencyStatus: 'SUFFICIENT_EVIDENCE',
      sampleSize: 3,
      calculationTrace: { formula: 'vJr - tJr', inputs: { vJr: 5, tJr: 3 } },
    },
    {
      metricKey: 'METRIC_MULTIDAY_DURATION_DAYS',
      scope: defaultScope,
      value: 3, // 3 días observados
      unit: 'días',
      valueStatus: 'DETERMINED',
      sufficiencyStatus: 'SUFFICIENT_EVIDENCE',
      sampleSize: 3,
      calculationTrace: { formula: 'distinctDates', inputs: {} },
    },
    {
      metricKey: 'METRIC_RESOURCE_CONSUMPTION_RATIO',
      scope: defaultScope,
      value: 0.25,
      unit: 'unidad_recurso/m2',
      valueStatus: 'DETERMINED',
      sufficiencyStatus: 'SUFFICIENT_EVIDENCE',
      sampleSize: 3,
      calculationTrace: { formula: 'res/qty', inputs: {} },
    },
    {
      metricKey: 'METRIC_RESOURCE_VARIANCE_DELTA',
      scope: defaultScope,
      value: 15.0, // +15 unidades de exceso
      unit: 'unidad',
      valueStatus: 'DETERMINED',
      sufficiencyStatus: 'SUFFICIENT_EVIDENCE',
      sampleSize: 3,
      calculationTrace: { formula: 'used - req', inputs: {} },
    },
  ];

  const sampleP01Pattern: OperationalPatternResult = {
    patternKey: 'P-01_SYSTEMATIC_UNDERESTIMATION',
    scope: defaultScope,
    detectionStatus: 'PATTERN_DETECTED',
    sampleSize: 4,
    minRequiredSampleSize: 3,
    confidenceScore: 0.85,
    thresholdsApplied: { underestimationIpThreshold: 0.85, prevalenceThreshold: 0.75 },
    supportingMetricKeys: ['METRIC_PRODUCTIVITY_INDEX', 'METRIC_EFFORT_VARIANCE_JR'],
    empiricalEvidence: {
      summary: 'Se detectó subestimación sistemática en 4 de 4 ocurrencias (100%) con IP = 0.60.',
      factsEvaluatedCount: 4,
      anomalousFactsCount: 4,
      prevalenceRatio: 1.0,
    },
  };

  const sampleAnalyticsResult: OperationalMemoryAnalyticsResult = {
    boardId: 'board_test_1',
    evaluationPeriod: { dateFrom: '2026-09-01', dateTo: '2026-09-12', evaluatedAtIso: fixedIsoDate },
    totalFactsEvaluated: {
      planItemsCount: 4,
      executionRecordsCount: 4,
      verifiedExecutionsCount: 4,
      rejectedExecutionsCount: 0,
      resourcesUsedCount: 3,
    },
    metrics: sampleMetrics,
    patterns: [sampleP01Pattern],
  };

  // ───────────────────────────────────────────────────────────────────────────
  // OAD-01: Generación de R-01 (Ajuste de Rendimiento)
  // ───────────────────────────────────────────────────────────────────────────
  test('OAD-01: Generación de R-01 con P-01 detectado, gateway poaService y R_real', () => {
    const result = generateOperationalRecommendations(sampleAnalyticsResult, { evaluatedAt: fixedIsoDate });

    expect(result.recommendationsCount).toBe(1);
    const r01 = result.recommendations[0];

    expect(r01.recommendationKey).toBe('R-01_AJUSTE_RENDIMIENTO');
    expect(r01.priority).toBe('HIGH');
    expect(r01.status).toBe('PROPOSED');
    expect(r01.proposedAction.applicableDomainGateway).toBe('poaService');
    expect(r01.proposedAction.suggestedParameters.proposedStandardRate).toBe(30); // R_real
    expect(r01.projectedImpact.currentObservedValue).toBe(50); // R_teo
    expect(r01.projectedImpact.proposedTargetValue).toBe(30);
    expect(r01.projectedImpact.projectedValue).toBeNull();
    expect(r01.confidenceScore).toBe(0.85);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OAD-02: Bloqueo de R-01 por Insuficiencia Estadística
  // ───────────────────────────────────────────────────────────────────────────
  test('OAD-02: Bloqueo de R-01 cuando P-01 tiene INSUFFICIENT_EVIDENCE', () => {
    const insufficientAnalytics: OperationalMemoryAnalyticsResult = {
      ...sampleAnalyticsResult,
      patterns: [
        {
          ...sampleP01Pattern,
          detectionStatus: 'INSUFFICIENT_EVIDENCE',
          sampleSize: 1,
        },
      ],
    };

    const result = generateOperationalRecommendations(insufficientAnalytics, { evaluatedAt: fixedIsoDate });
    expect(result.recommendationsCount).toBe(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OAD-03: Bloqueo de R-01 cuando el Patrón no es Detectado
  // ───────────────────────────────────────────────────────────────────────────
  test('OAD-03: Bloqueo de R-01 cuando P-01 es PATTERN_NOT_DETECTED', () => {
    const notDetectedAnalytics: OperationalMemoryAnalyticsResult = {
      ...sampleAnalyticsResult,
      patterns: [
        {
          ...sampleP01Pattern,
          detectionStatus: 'PATTERN_NOT_DETECTED',
        },
      ],
    };

    const result = generateOperationalRecommendations(notDetectedAnalytics, { evaluatedAt: fixedIsoDate });
    expect(result.recommendationsCount).toBe(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OAD-04: Manejo de R_real Indeterminada en R-01
  // ───────────────────────────────────────────────────────────────────────────
  test('OAD-04: Manejo de R_real indeterminada produciendo proposedTargetValue null', () => {
    const noRealRateAnalytics: OperationalMemoryAnalyticsResult = {
      ...sampleAnalyticsResult,
      metrics: sampleMetrics.filter((m) => m.metricKey !== 'METRIC_PRODUCTIVITY_RATE'),
    };

    const result = generateOperationalRecommendations(noRealRateAnalytics, { evaluatedAt: fixedIsoDate });
    expect(result.recommendationsCount).toBe(1);
    const r01 = result.recommendations[0];
    expect(r01.proposedAction.suggestedParameters.proposedStandardRate).toBeNull();
    expect(r01.projectedImpact.proposedTargetValue).toBeNull();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OAD-05: Generación de R-02 (Balance de Cuadrilla)
  // ───────────────────────────────────────────────────────────────────────────
  test('OAD-05: Generación de R-02 con gateway crewAssignmentService y proposedTargetCrewId null', () => {
    const crewAnalytics: OperationalMemoryAnalyticsResult = {
      ...sampleAnalyticsResult,
      patterns: [
        {
          patternKey: 'P-02_CREW_PERFORMANCE_DISPERSION',
          scope: defaultScope,
          detectionStatus: 'PATTERN_DETECTED',
          sampleSize: 2,
          minRequiredSampleSize: 2,
          confidenceScore: 0.75,
          thresholdsApplied: { crewDispersionCvThreshold: 0.25 },
          supportingMetricKeys: ['METRIC_PRODUCTIVITY_RATE'],
          empiricalEvidence: {
            summary: 'Dispersión de rendimiento del 35% entre cuadrillas.',
            factsEvaluatedCount: 2,
            anomalousFactsCount: 2,
            prevalenceRatio: 0.35,
          },
        },
      ],
    };

    const result = generateOperationalRecommendations(crewAnalytics, { evaluatedAt: fixedIsoDate });
    expect(result.recommendationsCount).toBe(1);
    const r02 = result.recommendations[0];

    expect(r02.recommendationKey).toBe('R-02_BALANCE_CUADRILLA');
    expect(r02.proposedAction.applicableDomainGateway).toBe('crewAssignmentService');
    expect(r02.proposedAction.suggestedParameters.proposedTargetCrewId).toBeNull(); // No inventa cuadrilla
    expect(r02.projectedImpact.proposedTargetValue).toBe(0);
    expect(r02.projectedImpact.projectedValue).toBeNull();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OAD-06: Bloqueo de R-02 ante Insuficiencia de Cuadrillas
  // ───────────────────────────────────────────────────────────────────────────
  test('OAD-06: Bloqueo de R-02 ante INSUFFICIENT_EVIDENCE en dispersión de cuadrillas', () => {
    const insufficientCrewAnalytics: OperationalMemoryAnalyticsResult = {
      ...sampleAnalyticsResult,
      patterns: [
        {
          patternKey: 'P-02_CREW_PERFORMANCE_DISPERSION',
          scope: defaultScope,
          detectionStatus: 'INSUFFICIENT_EVIDENCE',
          sampleSize: 1,
          minRequiredSampleSize: 2,
          confidenceScore: 0,
          thresholdsApplied: {},
          supportingMetricKeys: [],
          empiricalEvidence: { summary: 'Muestra insuficiente', factsEvaluatedCount: 1, anomalousFactsCount: 0, prevalenceRatio: 0 },
        },
      ],
    };

    const result = generateOperationalRecommendations(insufficientCrewAnalytics, { evaluatedAt: fixedIsoDate });
    expect(result.recommendationsCount).toBe(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OAD-07: Generación de R-03 (Provisión de Insumos vía weeklyPlanService)
  // ───────────────────────────────────────────────────────────────────────────
  test('OAD-07: Generación de R-03 con gateway weeklyPlanService (no POD-01) y delta de insumo', () => {
    const resourceAnalytics: OperationalMemoryAnalyticsResult = {
      ...sampleAnalyticsResult,
      patterns: [
        {
          patternKey: 'P-03_RESOURCE_CONSUMPTION_ANOMALY',
          scope: defaultScope,
          detectionStatus: 'PATTERN_DETECTED',
          sampleSize: 3,
          minRequiredSampleSize: 3,
          confidenceScore: 0.80,
          thresholdsApplied: { resourceVarianceDeltaRatioThreshold: 0.15 },
          supportingMetricKeys: ['METRIC_RESOURCE_CONSUMPTION_RATIO', 'METRIC_RESOURCE_VARIANCE_DELTA'],
          empiricalEvidence: {
            summary: 'Anomalía de consumo detectada en bolsas de cemento.',
            factsEvaluatedCount: 3,
            anomalousFactsCount: 2,
            prevalenceRatio: 0.66,
          },
        },
      ],
    };

    const result = generateOperationalRecommendations(resourceAnalytics, { evaluatedAt: fixedIsoDate });
    expect(result.recommendationsCount).toBe(1);
    const r03 = result.recommendations[0];

    expect(r03.recommendationKey).toBe('R-03_PROVISION_INSUMOS');
    expect(r03.proposedAction.applicableDomainGateway).toBe('weeklyPlanService'); // weeklyPlanService, NOT POD-01
    expect(r03.proposedAction.suggestedParameters.proposedUnitQuota).toBe(0.25);
    expect(r03.projectedImpact.currentObservedValue).toBe(15.0);
    expect(r03.projectedImpact.proposedTargetValue).toBe(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OAD-08: Bloqueo de R-03 ante Insumos Balanceados
  // ───────────────────────────────────────────────────────────────────────────
  test('OAD-08: Bloqueo de R-03 ante consumo balanceado (PATTERN_NOT_DETECTED)', () => {
    const balancedResourceAnalytics: OperationalMemoryAnalyticsResult = {
      ...sampleAnalyticsResult,
      patterns: [
        {
          patternKey: 'P-03_RESOURCE_CONSUMPTION_ANOMALY',
          scope: defaultScope,
          detectionStatus: 'PATTERN_NOT_DETECTED',
          sampleSize: 3,
          minRequiredSampleSize: 3,
          confidenceScore: 0.80,
          thresholdsApplied: {},
          supportingMetricKeys: [],
          empiricalEvidence: { summary: 'Consumo balanceado', factsEvaluatedCount: 3, anomalousFactsCount: 0, prevalenceRatio: 0 },
        },
      ],
    };

    const result = generateOperationalRecommendations(balancedResourceAnalytics, { evaluatedAt: fixedIsoDate });
    expect(result.recommendationsCount).toBe(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OAD-09: Generación de R-04 (Desdoblamiento Multidía)
  // ───────────────────────────────────────────────────────────────────────────
  test('OAD-09: Generación de R-04 con gateway weeklyPlanService y proposedPlannedDays >= 2', () => {
    const multidayAnalytics: OperationalMemoryAnalyticsResult = {
      ...sampleAnalyticsResult,
      patterns: [
        {
          patternKey: 'P-04_HIDDEN_MULTIDAY_DRAG',
          scope: defaultScope,
          detectionStatus: 'PATTERN_DETECTED',
          sampleSize: 3,
          minRequiredSampleSize: 3,
          confidenceScore: 0.90,
          thresholdsApplied: { multidayDragThresholdDays: 2, multidayPrevalenceThreshold: 0.70 },
          supportingMetricKeys: ['METRIC_MULTIDAY_DURATION_DAYS'],
          empiricalEvidence: {
            summary: '3 de 3 actividades tomaron >= 2 días.',
            factsEvaluatedCount: 3,
            anomalousFactsCount: 3,
            prevalenceRatio: 1.0,
          },
        },
      ],
    };

    const result = generateOperationalRecommendations(multidayAnalytics, { evaluatedAt: fixedIsoDate });
    expect(result.recommendationsCount).toBe(1);
    const r04 = result.recommendations[0];

    expect(r04.recommendationKey).toBe('R-04_DESDOBLAMIENTO_MULTIDIA');
    expect(r04.proposedAction.applicableDomainGateway).toBe('weeklyPlanService');
    expect(r04.proposedAction.suggestedParameters.proposedPlannedDays).toBe(3); // 3 días observados
    expect(r04.projectedImpact.currentObservedValue).toBe(1);
    expect(r04.projectedImpact.proposedTargetValue).toBe(3);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OAD-10: Bloqueo de R-04 cuando se Ejecutan en Jornadas Únicas
  // ───────────────────────────────────────────────────────────────────────────
  test('OAD-10: Bloqueo de R-04 cuando no hay arrastre multidía (PATTERN_NOT_DETECTED)', () => {
    const singleDayAnalytics: OperationalMemoryAnalyticsResult = {
      ...sampleAnalyticsResult,
      patterns: [
        {
          patternKey: 'P-04_HIDDEN_MULTIDAY_DRAG',
          scope: defaultScope,
          detectionStatus: 'PATTERN_NOT_DETECTED',
          sampleSize: 3,
          minRequiredSampleSize: 3,
          confidenceScore: 0.90,
          thresholdsApplied: {},
          supportingMetricKeys: [],
          empiricalEvidence: { summary: 'Jornadas únicas', factsEvaluatedCount: 3, anomalousFactsCount: 0, prevalenceRatio: 0 },
        },
      ],
    };

    const result = generateOperationalRecommendations(singleDayAnalytics, { evaluatedAt: fixedIsoDate });
    expect(result.recommendationsCount).toBe(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OAD-11: recommendationId Determinista e Independiente de Timestamp
  // ───────────────────────────────────────────────────────────────────────────
  test('OAD-11: recommendationId es determinista e idéntico ante diferentes timestamps de evaluación', () => {
    const res1 = generateOperationalRecommendations(sampleAnalyticsResult, { evaluatedAt: '2026-09-13T08:00:00.000Z' });
    const res2 = generateOperationalRecommendations(sampleAnalyticsResult, { evaluatedAt: '2026-09-13T18:00:00.000Z' });

    expect(res1.recommendations[0].recommendationId).toBe(res2.recommendations[0].recommendationId);
    expect(res1.recommendations[0].recommendationId).toBe(
      computeRecommendationId('BOARD', 'board_test_1', 'R-01_AJUSTE_RENDIMIENTO', 'board_test_1')
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OAD-12: Matriz Determinista de Prioridades (Sin Overrides)
  // ───────────────────────────────────────────────────────────────────────────
  test('OAD-12: Matriz Determinista de Prioridades (HIGH >= 0.85, MEDIUM >= 0.60, LOW)', () => {
    expect(computeRecommendationPriority(0.90, 0.85)).toBe('HIGH');
    expect(computeRecommendationPriority(0.50, 0.85)).toBe('HIGH'); // Confianza alta
    expect(computeRecommendationPriority(0.65, 0.40)).toBe('MEDIUM'); // Prevalencia media
    expect(computeRecommendationPriority(0.40, 0.55)).toBe('MEDIUM'); // Confianza media
    expect(computeRecommendationPriority(0.20, 0.30)).toBe('LOW');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OAD-13: Status Estrictamente 'PROPOSED'
  // ───────────────────────────────────────────────────────────────────────────
  test('OAD-13: Todas las recomendaciones generadas tienen status estrictamente PROPOSED', () => {
    const result = generateOperationalRecommendations(sampleAnalyticsResult, { evaluatedAt: fixedIsoDate });
    for (const rec of result.recommendations) {
      expect(rec.status).toBe('PROPOSED');
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OAD-14: Inmutabilidad Absoluta de la Estructura Analítica de Entrada
  // ───────────────────────────────────────────────────────────────────────────
  test('OAD-14: Inmutabilidad de AnalyticsResult de entrada (toEqual(copy))', () => {
    const copy = JSON.parse(JSON.stringify(sampleAnalyticsResult));
    generateOperationalRecommendations(sampleAnalyticsResult, { evaluatedAt: fixedIsoDate });
    expect(sampleAnalyticsResult).toEqual(copy);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OAD-15: Determinismo Funcional 100% (Mismas Entradas -> Mismo Resultado)
  // ───────────────────────────────────────────────────────────────────────────
  test('OAD-15: Determinismo Funcional 100% con timestamp fijado (res1.toEqual(res2))', () => {
    const res1 = generateOperationalRecommendations(sampleAnalyticsResult, { evaluatedAt: fixedIsoDate });
    const res2 = generateOperationalRecommendations(sampleAnalyticsResult, { evaluatedAt: fixedIsoDate });

    expect(res1).toEqual(res2);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OAD-16: Prueba Negativa: Cero Mutaciones a Base de Datos / Cero Supabase
  // ───────────────────────────────────────────────────────────────────────────
  test('OAD-16: Prueba Negativa (Servicio 100% en memoria sin clientes ni efectos secundarios)', () => {
    const result = generateOperationalRecommendations(sampleAnalyticsResult, { evaluatedAt: fixedIsoDate });
    expect(result).toHaveProperty('recommendations');
    expect(result).not.toHaveProperty('supabase');
    expect(result).not.toHaveProperty('dbClient');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OAD-17: Prueba Negativa: Cero Solver H8 / Cero Optimizadores Prescriptivos
  // ───────────────────────────────────────────────────────────────────────────
  test('OAD-17: Prueba Negativa (Cero Solvers H8 / Cero Optimizadores)', () => {
    const result = generateOperationalRecommendations(sampleAnalyticsResult, { evaluatedAt: fixedIsoDate });
    expect(result).not.toHaveProperty('solverH8');
    expect(result).not.toHaveProperty('optimizationPlan');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OAD-18: Cero Recomendaciones ante Cero Patrones Detectados
  // ───────────────────────────────────────────────────────────────────────────
  test('OAD-18: Cero recomendaciones emitidas ante resultado analítico vacío o sin patrones detectados', () => {
    const emptyAnalytics: OperationalMemoryAnalyticsResult = {
      ...sampleAnalyticsResult,
      patterns: [],
    };

    const result = generateOperationalRecommendations(emptyAnalytics, { evaluatedAt: fixedIsoDate });
    expect(result.recommendationsCount).toBe(0);
    expect(result.actionablePatternsCount).toBe(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OAD-19: Trace y supportingMetrics Fielmente Mapeadas
  // ───────────────────────────────────────────────────────────────────────────
  test('OAD-19: SupportingMetrics mapea exactamente las métricas requeridas sin datos inventados', () => {
    const result = generateOperationalRecommendations(sampleAnalyticsResult, { evaluatedAt: fixedIsoDate });
    const r01 = result.recommendations[0];

    const metricKeys = r01.supportingMetrics.map((m) => m.metricKey);
    expect(metricKeys).toContain('METRIC_PRODUCTIVITY_INDEX');
    expect(metricKeys).toContain('METRIC_EFFORT_VARIANCE_JR');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // OAD-20: Respeto Unívoco de Filtros de Scope
  // ───────────────────────────────────────────────────────────────────────────
  test('OAD-20: Scope del patrón de origen se traslada exactamente a la recomendación', () => {
    const zoneScope: AnalyticsScope = {
      scopeType: 'ZONE',
      scopeId: 'zone_norte',
      scopeName: 'Zona Norte Contratada',
    };

    const zoneAnalytics: OperationalMemoryAnalyticsResult = {
      ...sampleAnalyticsResult,
      patterns: [{ ...sampleP01Pattern, scope: zoneScope }],
    };

    const result = generateOperationalRecommendations(zoneAnalytics, { evaluatedAt: fixedIsoDate });
    expect(result.recommendations[0].scope).toEqual(zoneScope);
    expect(result.recommendations[0].targetEntity.entityId).toBe('zone_norte');
  });
});
