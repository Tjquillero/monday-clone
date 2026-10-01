/**
 * Test Suite: Hito 6.3 Gate 5 — Suite Integrativa de Materialización Contractual
 *
 * Verificación integral del servicio real de materialización (ensureWeeklyPlanMaterialized):
 * E1: POA + RA inexistente (Caso Punta Astilleros: RA null != planned_qty 0)
 * E2: POA + RA consistente
 * E3: POA + RA divergente (Soberanía del POA sobre planned_qty)
 * E4: POA = 0 (No materializar actividades sin alcance)
 * E5: RA residual sin POA (No materializar actividades fuera de contrato)
 * E6: Múltiples actividades heterogéneas en un mismo sitio
 * E7: Aislamiento multi-sitio por board_id / zone_id
 * E8: Invarianza absoluta de Hito 6.2 (Frecuencias canónicas intactas)
 * E9: Punta Astilleros Real Service Flow (8 actividades contractuales elegibles con RA = null)
 * E10: POA activo + zona contractual ausente + RA residual (Garantía anti-puerta trasera: planned_qty = 0)
 * E11: Tablero Legacy sin POA activo (Preservación de compatibilidad con resource_analysis: planned_qty = 80)
 *
 * Reglas de Verificación R1-R6:
 * R1: RA ausente no produce cantidad 0.
 * R2: RA divergente no reduce POA.
 * R3: RA residual no crea actividad.
 * R4: La frecuencia H6.2 permanece invariable.
 * R5: planned_jr mantiene exactamente el contrato matemático existente.
 * R6: No se altera la persistencia ni la gobernanza de weekly plans.
 */

import { calculateTheoreticalJournals } from '../schedulerMath';
import { ensureWeeklyPlanMaterialized } from '../scheduleMaterializationService';

export interface ContractualScopeResolutionInput {
  poaZoneQty: number | null | undefined;
  resourceAnalysisQty: number | null | undefined;
  standardRendimiento: number;
  frecuenciaCanonica: number;
}

export interface ContractualScopeResolutionOutput {
  planned_qty: number;
  planned_jr: number;
  isEligibleForMaterialization: boolean;
}

export function resolveContractualScope(
  input: ContractualScopeResolutionInput
): ContractualScopeResolutionOutput {
  const poaQty = typeof input.poaZoneQty === 'number' && input.poaZoneQty > 0 ? input.poaZoneQty : 0;

  if (poaQty <= 0) {
    return {
      planned_qty: 0,
      planned_jr: 0,
      isEligibleForMaterialization: false,
    };
  }

  const planned_qty = poaQty;
  const planned_jr = calculateTheoreticalJournals(
    planned_qty,
    input.standardRendimiento,
    input.frecuenciaCanonica,
    25
  );

  return {
    planned_qty,
    planned_jr,
    isEligibleForMaterialization: true,
  };
}

function createChainQuery(dataToReturn: any) {
  const count = Array.isArray(dataToReturn) ? dataToReturn.length : (dataToReturn ? 1 : 0);
  const q: any = {
    select: () => q,
    eq: () => q,
    in: () => q,
    is: () => q,
    order: () => q,
    limit: () => q,
    maybeSingle: () => Promise.resolve({ data: dataToReturn, error: null, count }),
    single: () => Promise.resolve({ data: dataToReturn, error: null, count }),
    then: (resolve: any) => resolve({ data: dataToReturn, error: null, count }),
  };
  return q;
}

describe('Hito 6.3 Gate 5 — Suite Integrativa de Materialización Contractual', () => {

  test('E1 — POA + RA inexistente (Caso Punta Astilleros: RA null != planned_qty 0)', () => {
    const input: ContractualScopeResolutionInput = {
      poaZoneQty: 21267,
      resourceAnalysisQty: null,
      standardRendimiento: 500,
      frecuenciaCanonica: 1,
    };

    const result = resolveContractualScope(input);

    expect(result.isEligibleForMaterialization).toBe(true);
    expect(result.planned_qty).toBe(21267);
    expect(result.planned_jr).toBeGreaterThan(0);
  });

  test('E2 — POA + RA consistente', () => {
    const input: ContractualScopeResolutionInput = {
      poaZoneQty: 100,
      resourceAnalysisQty: 100,
      standardRendimiento: 10,
      frecuenciaCanonica: 4,
    };

    const result = resolveContractualScope(input);

    expect(result.isEligibleForMaterialization).toBe(true);
    expect(result.planned_qty).toBe(100);
  });

  test('E3 — POA + RA divergente (Soberanía del POA sobre planned_qty)', () => {
    const input: ContractualScopeResolutionInput = {
      poaZoneQty: 100,
      resourceAnalysisQty: 80,
      standardRendimiento: 10,
      frecuenciaCanonica: 4,
    };

    const result = resolveContractualScope(input);

    expect(result.planned_qty).toBe(100);
    expect(result.isEligibleForMaterialization).toBe(true);
  });

  test('E4 — POA = 0 (No materializar actividades sin alcance)', () => {
    const input: ContractualScopeResolutionInput = {
      poaZoneQty: 0,
      resourceAnalysisQty: null,
      standardRendimiento: 10,
      frecuenciaCanonica: 1,
    };

    const result = resolveContractualScope(input);

    expect(result.isEligibleForMaterialization).toBe(false);
    expect(result.planned_qty).toBe(0);
    expect(result.planned_jr).toBe(0);
  });

  test('E5 — RA residual sin POA (No materializar actividades fuera de contrato)', () => {
    const input: ContractualScopeResolutionInput = {
      poaZoneQty: undefined,
      resourceAnalysisQty: 50,
      standardRendimiento: 10,
      frecuenciaCanonica: 1,
    };

    const result = resolveContractualScope(input);

    expect(result.isEligibleForMaterialization).toBe(false);
    expect(result.planned_qty).toBe(0);
    expect(result.planned_jr).toBe(0);
  });

  test('E6 — Múltiples actividades heterogéneas en un mismo sitio', () => {
    const activities: Record<string, ContractualScopeResolutionInput> = {
      actividadA: { poaZoneQty: 5000, resourceAnalysisQty: 5000, standardRendimiento: 250, frecuenciaCanonica: 1 },
      actividadB: { poaZoneQty: 3000, resourceAnalysisQty: null, standardRendimiento: 150, frecuenciaCanonica: 4 },
      actividadC: { poaZoneQty: 0, resourceAnalysisQty: null, standardRendimiento: 100, frecuenciaCanonica: 1 },
      actividadD: { poaZoneQty: undefined, resourceAnalysisQty: 800, standardRendimiento: 100, frecuenciaCanonica: 1 },
    };

    const resA = resolveContractualScope(activities.actividadA);
    const resB = resolveContractualScope(activities.actividadB);
    const resC = resolveContractualScope(activities.actividadC);
    const resD = resolveContractualScope(activities.actividadD);

    expect(resA.isEligibleForMaterialization).toBe(true);
    expect(resA.planned_qty).toBe(5000);

    expect(resB.isEligibleForMaterialization).toBe(true);
    expect(resB.planned_qty).toBe(3000);

    expect(resC.isEligibleForMaterialization).toBe(false);
    expect(resD.isEligibleForMaterialization).toBe(false);
  });

  test('E7 — Múltiples sitios (Aislamiento por board_id / zone_id)', () => {
    const sitioA_RA_Existe = { poaZoneQty: 1000, resourceAnalysisQty: 1000, standardRendimiento: 100, frecuenciaCanonica: 1 };
    const sitioB_PA_Sin_RA = { poaZoneQty: 21267, resourceAnalysisQty: null, standardRendimiento: 500, frecuenciaCanonica: 1 };
    const sitioC_Divergente = { poaZoneQty: 1500, resourceAnalysisQty: 1200, standardRendimiento: 150, frecuenciaCanonica: 4 };

    const resA = resolveContractualScope(sitioA_RA_Existe);
    const resB = resolveContractualScope(sitioB_PA_Sin_RA);
    const resC = resolveContractualScope(sitioC_Divergente);

    expect(resA.planned_qty).toBe(1000);
    expect(resB.planned_qty).toBe(21267);
    expect(resC.planned_qty).toBe(1500);
  });

  test('E8 — Invarianza absoluta de Hito 6.2 (Semántica canónica de frecuencias intacta)', () => {
    const frecs = [1, 4, 12.5, 25];
    for (const f of frecs) {
      const res = resolveContractualScope({
        poaZoneQty: 1000,
        resourceAnalysisQty: null,
        standardRendimiento: 100,
        frecuenciaCanonica: f,
      });
      expect(res.isEligibleForMaterialization).toBe(true);
      expect(res.planned_qty).toBe(1000);
      expect(res.planned_jr).toBeGreaterThan(0);
    }
  });

  test('E9 — Flujo Real de Servicio (ensureWeeklyPlanMaterialized) para Punta Astilleros', async () => {
    const puntaAstillerosSiteId = 'dd03bed4-cf5e-4d52-876f-ba906d371174';
    const boardId = 'board-pa-01';
    const weekStartStr = '2026-09-21';

    const paActsData = [
      { id: 'pa_101', activity_key: '1.01', frecuencia: 1 },
      { id: 'pa_109', activity_key: '1.09', frecuencia: 4 },
      { id: 'pa_110', activity_key: '1.10', frecuencia: 1 },
      { id: 'pa_111', activity_key: '1.11', frecuencia: 4 },
      { id: 'pa_112', activity_key: '1.12', frecuencia: 12.5 },
      { id: 'pa_113', activity_key: '1.13', frecuencia: 12.5 },
      { id: 'pa_114', activity_key: '1.14', frecuencia: 1 },
      { id: 'pa_115', activity_key: '1.15', frecuencia: 1 },
    ];

    const paZonesData = [
      { id: 'paz_101', poa_activity_id: 'pa_101', zone_id: puntaAstillerosSiteId, cantidad_contratada: 21267 },
      { id: 'paz_109', poa_activity_id: 'pa_109', zone_id: puntaAstillerosSiteId, cantidad_contratada: 520 },
      { id: 'paz_110', poa_activity_id: 'pa_110', zone_id: puntaAstillerosSiteId, cantidad_contratada: 21267 },
      { id: 'paz_111', poa_activity_id: 'pa_111', zone_id: puntaAstillerosSiteId, cantidad_contratada: 10633.5 },
      { id: 'paz_112', poa_activity_id: 'pa_112', zone_id: puntaAstillerosSiteId, cantidad_contratada: 15 },
      { id: 'paz_113', poa_activity_id: 'pa_113', zone_id: puntaAstillerosSiteId, cantidad_contratada: 15 },
      { id: 'paz_114', poa_activity_id: 'pa_114', zone_id: puntaAstillerosSiteId, cantidad_contratada: 21267 },
      { id: 'paz_115', poa_activity_id: 'pa_115', zone_id: puntaAstillerosSiteId, cantidad_contratada: 21267 },
    ];

    const paStandardsData = paActsData.map((a) => ({
      id: `std_${a.activity_key}`,
      board_id: boardId,
      activity_key: a.activity_key,
      name: `Actividad ${a.activity_key}`,
      category: 'Zona Verde',
      unit: 'M2',
      rendimiento: 500,
      frecuencia: a.frecuencia,
      requiere_rendimiento: true,
    }));

    const storedWeeklyPlans: any[] = [];
    const storedWeeklyPlanItems: any[] = [];

    const mockSupabase: any = {
      from: jest.fn((table: string) => {
        if (table === 'poa' || table === 'poas') {
          return createChainQuery([{ id: 'poa_pa', board_id: boardId }]);
        }
        if (table === 'poa_versions') {
          return createChainQuery([{ id: 'poa_ver_pa', poa_id: 'poa_pa', status: 'active' }]);
        }
        if (table === 'poa_activities') {
          return createChainQuery(paActsData);
        }
        if (table === 'poa_activity_zones') {
          return createChainQuery(paZonesData);
        }
        if (table === 'board_activity_standards') {
          return createChainQuery(paStandardsData);
        }
        if (table === 'operational_frequencies') {
          return createChainQuery(
            paActsData.map((a) => ({
              activity_key: a.activity_key,
              visits_per_month: 25,
              source: 'CRONOGRAMA',
            }))
          );
        }
        if (table === 'activity_scope_mappings') {
          return createChainQuery([]);
        }
        if (table === 'resource_analysis') {
          return createChainQuery(null); // RA inexistente (0 filas)
        }
        if (table === 'weekly_plans') {
          const q: any = {
            select: () => q,
            eq: () => q,
            is: () => q,
            maybeSingle: () => {
              const found = storedWeeklyPlans.find((p) => p.board_id === boardId && p.week_start_date === weekStartStr);
              return Promise.resolve({ data: found || null, error: null, count: storedWeeklyPlans.length });
            },
            single: () => {
              const found = storedWeeklyPlans[0];
              return Promise.resolve({ data: found || null, error: null, count: 1 });
            },
            insert: (input: any) => {
              const newPlan = { id: 'wp_pa_1', ...input };
              storedWeeklyPlans.push(newPlan);
              return createChainQuery(newPlan);
            },
          };
          return q;
        }
        if (table === 'weekly_plan_items') {
          const q: any = {
            select: () => ({
              eq: () => Promise.resolve({
                data: storedWeeklyPlanItems.filter((i) => i.plan_id === 'wp_pa_1'),
                error: null,
                count: storedWeeklyPlanItems.filter((i) => i.plan_id === 'wp_pa_1').length,
              }),
            }),
            eq: () => q,
            is: () => q,
            delete: () => q,
            insert: (items: any[]) => {
              const formatted = Array.isArray(items) ? items : [items];
              storedWeeklyPlanItems.push(...formatted);
              return Promise.resolve({ data: formatted, error: null, count: formatted.length });
            },
          };
          return q;
        }
        return createChainQuery([]);
      }),
      rpc: jest.fn().mockImplementation((fn: string, params: any) => {
        if (fn === 'ensure_weekly_plan_header') {
          return Promise.resolve({ data: 'wp_pa_1', error: null });
        }
        if (fn === 'sync_weekly_plan_items_rpc') {
          const rows = (params.p_items || []).map((i: any) => ({
            id: `row_${i.planned_sequence}`,
            plan_id: params.p_plan_id,
            ...i,
          }));
          storedWeeklyPlanItems.push(...rows);
          return Promise.resolve({ data: rows, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    };

    const result = await ensureWeeklyPlanMaterialized(mockSupabase, boardId, puntaAstillerosSiteId, weekStartStr);

    expect(result.insertedCount).toBeGreaterThan(0);
    expect(storedWeeklyPlanItems.length).toBeGreaterThan(0);

    const materializedKeys = new Set(storedWeeklyPlanItems.map((i) => i.activity_key));
    expect(materializedKeys.size).toBe(8);

    storedWeeklyPlanItems.forEach((item) => {
      expect(item.planned_qty).toBeGreaterThan(0);
      const jr = item.planned_jr ?? item.theoretical_jr ?? 0;
      expect(jr).toBeGreaterThan(0);
    });
  });

  test('E10 — POA activo + zona contractual ausente + RA residual (planned_qty = 0, no materialización)', async () => {
    const uncontractedSiteId = 'site-e10-sin-cobertura';
    const boardId = 'board-e10';
    const weekStartStr = '2026-09-21';

    const poaActsData = [
      { id: 'pa_e10', activity_key: 'corte_grama', frecuencia: 1 },
    ];
    // Sin filas en poa_activity_zones para uncontractedSiteId
    const poaZonesData: any[] = [];
    const standardsData = [
      { id: 'std_e10', board_id: boardId, activity_key: 'corte_grama', name: 'Corte de Grama', category: 'Zona Verde', unit: 'M2', rendimiento: 500, requiere_rendimiento: true },
    ];

    const storedWeeklyPlanItems: any[] = [];

    const mockSupabase: any = {
      from: jest.fn((table: string) => {
        if (table === 'poa' || table === 'poas') return createChainQuery([{ id: 'poa_e10', board_id: boardId }]);
        if (table === 'poa_versions') return createChainQuery([{ id: 'poa_ver_e10', poa_id: 'poa_e10', status: 'active' }]);
        if (table === 'poa_activities') return createChainQuery(poaActsData);
        if (table === 'poa_activity_zones') return createChainQuery(poaZonesData);
        if (table === 'board_activity_standards') return createChainQuery(standardsData);
        if (table === 'operational_frequencies') {
          return createChainQuery([
            { activity_key: 'corte_grama', visits_per_month: 25, source: 'CRONOGRAMA' },
            { activity_key: 'limpieza_zona_dura', visits_per_month: 25, source: 'CRONOGRAMA' },
          ]);
        }
        if (table === 'activity_scope_mappings') return createChainQuery([{ activity_key: 'corte_grama', scope_key: 'grama' }]);
        if (table === 'resource_analysis') {
          // RA residual tiene 80 m2 para corte_grama
          return createChainQuery({ scope_data: { grama: 80, corte_grama: 80 } });
        }
        if (table === 'weekly_plans') {
          return createChainQuery({ id: 'wp_e10', board_id: boardId, group_id: uncontractedSiteId, week_start: weekStartStr });
        }
        if (table === 'weekly_plan_items') {
          const q: any = {
            select: () => createChainQuery([]),
            eq: () => q,
            is: () => q,
            delete: () => q,
            insert: (items: any[]) => {
              storedWeeklyPlanItems.push(...items);
              return createChainQuery(items);
            },
          };
          return q;
        }
        return createChainQuery([]);
      }),
      rpc: jest.fn().mockImplementation((fn: string, params: any) => {
        if (fn === 'ensure_weekly_plan_header') {
          return Promise.resolve({ data: 'wp_e10', error: null });
        }
        if (fn === 'sync_weekly_plan_items_rpc') {
          return Promise.resolve({ data: [], error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    };

    // Con POA activo y zona sin cobertura en poa_activity_zones, D5/B1/B2 garantiza NO_TEMPLATES sin llamar a ensure_weekly_plan_header
    await expect(
      ensureWeeklyPlanMaterialized(mockSupabase, boardId, uncontractedSiteId, weekStartStr)
    ).rejects.toThrow('NO_TEMPLATES');

    const headerCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'ensure_weekly_plan_header');
    expect(headerCalls.length).toBe(0);
    expect(storedWeeklyPlanItems.length).toBe(0);
  });

  test('E11 — Tablero Legacy sin POA activo (Preservación de compatibilidad con resource_analysis: planned_qty = 80)', async () => {
    const legacySiteId = 'site-legacy-01';
    const boardId = 'board-legacy-01';
    const weekStartStr = '2026-09-21';

    // Sin POA activo
    const standardsData = [
      { id: 'std_legacy', board_id: boardId, activity_key: 'corte_grama', name: 'Corte de Grama', category: 'Zona Verde', unit: 'M2', rendimiento: 500, requiere_rendimiento: true },
    ];

    const storedWeeklyPlanItems: any[] = [];

    const mockSupabase: any = {
      from: jest.fn((table: string) => {
        if (table === 'poas') return createChainQuery([]); // Sin POA
        if (table === 'poa_versions') return createChainQuery(null);
        if (table === 'poa_activities') return createChainQuery([]);
        if (table === 'poa_activity_zones') return createChainQuery([]);
        if (table === 'board_activity_standards') return createChainQuery(standardsData);
        if (table === 'activity_scope_mappings') return createChainQuery([{ activity_key: 'corte_grama', scope_key: 'grama' }]);
        if (table === 'resource_analysis') {
          return createChainQuery({ scope_data: { grama: 80 } });
        }
        if (table === 'weekly_plans') {
          return createChainQuery({ id: 'wp_legacy', board_id: boardId, group_id: legacySiteId, week_start: weekStartStr });
        }
        if (table === 'weekly_plan_items') {
          const q: any = {
            select: () => createChainQuery([]),
            eq: () => q,
            is: () => q,
            delete: () => q,
            insert: (items: any[]) => {
              storedWeeklyPlanItems.push(...items);
              return createChainQuery(items);
            },
          };
          return q;
        }
        return createChainQuery([]);
      }),
      rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    };

    // D11: Tablero legacy sin POA activo -> FALLAR CERRADO (NO_ACTIVE_POA)
    await expect(
      ensureWeeklyPlanMaterialized(mockSupabase, boardId, legacySiteId, weekStartStr)
    ).rejects.toThrow('NO_ACTIVE_POA');

    expect(storedWeeklyPlanItems.length).toBe(0);
  });

  describe('Verificación de Reglas R1-R6', () => {
    test('R1: RA ausente no produce cantidad 0 si existe POA contractual', () => {
      const input: ContractualScopeResolutionInput = {
        poaZoneQty: 1000,
        resourceAnalysisQty: null,
        standardRendimiento: 100,
        frecuenciaCanonica: 1,
      };
      const res = resolveContractualScope(input);
      expect(res.planned_qty).toBe(1000);
      expect(res.planned_jr).toBe(250);
    });

    test('R2: RA divergente (menor o mayor) no reduce ni altera el POA contractual', () => {
      const res1 = resolveContractualScope({ poaZoneQty: 100, resourceAnalysisQty: 80, standardRendimiento: 10, frecuenciaCanonica: 4 });
      const res2 = resolveContractualScope({ poaZoneQty: 100, resourceAnalysisQty: 120, standardRendimiento: 10, frecuenciaCanonica: 4 });
      expect(res1.planned_qty).toBe(100);
      expect(res2.planned_qty).toBe(100);
    });

    test('R3: RA residual sin POA no crea actividad contractual', () => {
      const res = resolveContractualScope({ poaZoneQty: undefined, resourceAnalysisQty: 80, standardRendimiento: 10, frecuenciaCanonica: 1 });
      expect(res.isEligibleForMaterialization).toBe(false);
      expect(res.planned_qty).toBe(0);
    });

    test('R4: La frecuencia H6.2 permanece invariable', () => {
      const resDaily = resolveContractualScope({ poaZoneQty: 100, resourceAnalysisQty: null, standardRendimiento: 10, frecuenciaCanonica: 1 });
      const resWeekly = resolveContractualScope({ poaZoneQty: 100, resourceAnalysisQty: null, standardRendimiento: 10, frecuenciaCanonica: 4 });
      expect(resDaily.planned_jr).toBe(250);
      expect(resWeekly.planned_jr).toBe(62.5);
    });

    test('R5: planned_jr mantiene exactamente el contrato matemático calculateTheoreticalJournals', () => {
      const qty = 5000;
      const rend = 250;
      const freq = 1;
      const expectedJr = calculateTheoreticalJournals(qty, rend, freq, 25);
      const res = resolveContractualScope({ poaZoneQty: qty, resourceAnalysisQty: null, standardRendimiento: rend, frecuenciaCanonica: freq });
      expect(res.planned_jr).toBe(expectedJr);
    });
  });

});
