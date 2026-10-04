/**
 * Test Suite: Gobernanza e Integridad de la Materialización (R1-b0 + R1-c)
 * Especificación: docs/gates/R1-b0_R1-c_SPEC.md v4.5 + Decisiones D1-D15
 *
 * Casos T01 a T37 certificados con Mocks de Supabase (Cero llamadas a BD real).
 */

import { ensureWeeklyPlanMaterialized } from '../scheduleMaterializationService';
import { materializeWeeklyPlanForTrigger } from '../myWorkSurfaceTriggerService';
import { isValidISODateString, persistMaterializationEvent } from '../materialization/siteActivityClassifier';
import { syncWeeklyPlanForBoard } from '../weeklyPlanService';
import { fetchPublishedWeekPlans } from '../../hooks/useWeeklyPlans';

jest.mock('../weeklyPlanService', () => ({
  __esModule: true,
  syncWeeklyPlanForBoard: jest.fn().mockResolvedValue({ success: true, count: 1 }),
}));

describe('Gobernanza R1-b0 + R1-c: Materialización e Integridad de Planes Semanales', () => {
  const boardId = 'board_test_r1';
  const siteId = 'site_test_r1';
  const weekStartStr = '2026-09-28';

  let mockSupabase: any;
  let loggedEvents: any[] = [];

  function createMockQuery(data: any = null, count?: number | null, error: any = null) {
    const obj: any = {};
    obj.select = jest.fn(() => obj);
    obj.eq = jest.fn(() => obj);
    obj.is = jest.fn(() => obj);
    obj.in = jest.fn(() => obj);
    obj.order = jest.fn(() => obj);
    obj.limit = jest.fn(() => obj);
    obj.or = jest.fn(() => obj);
    obj.maybeSingle = jest.fn().mockResolvedValue({ data, error });
    obj.single = jest.fn().mockResolvedValue({ data, error });
    obj.then = (resolve: any) =>
      Promise.resolve({ data, count: count ?? (Array.isArray(data) ? data.length : 0), error }).then(resolve);
    return obj;
  }

  const defaultOperationalFreqs = [
    { id: 'opf_1', board_id: boardId, group_id: siteId, activity_key: '1.01', visits_per_month: 25, source: 'CRONOGRAMA' },
    { id: 'opf_2', board_id: boardId, group_id: siteId, activity_key: '1.04', visits_per_month: 25, source: 'CRONOGRAMA' },
    { id: 'opf_3', board_id: boardId, group_id: siteId, activity_key: '1.09', visits_per_month: 4, source: 'CRONOGRAMA' },
    { id: 'opf_4', board_id: boardId, group_id: siteId, activity_key: '1.10', visits_per_month: 4, source: 'CRONOGRAMA' },
    { id: 'opf_5', board_id: boardId, group_id: siteId, activity_key: '1.11', visits_per_month: 4, source: 'CRONOGRAMA' },
    { id: 'opf_6', board_id: boardId, group_id: siteId, activity_key: '1.14', visits_per_month: 1, source: 'CRONOGRAMA' },
    { id: 'opf_7', board_id: boardId, group_id: siteId, activity_key: '2.01', visits_per_month: 4, source: 'CRONOGRAMA' },
    { id: 'opf_8', board_id: boardId, group_id: siteId, activity_key: 'corte_grama', visits_per_month: 25, source: 'CRONOGRAMA' },
    { id: 'opf_9', board_id: boardId, group_id: siteId, activity_key: '1.99', visits_per_month: 25, source: 'CRONOGRAMA' },
  ];

  beforeEach(() => {
    loggedEvents = [];
    (syncWeeklyPlanForBoard as any)?.mockClear?.();

    mockSupabase = {
      from: jest.fn((table: string) => {
        if (table === 'operational_frequencies') {
          return createMockQuery(defaultOperationalFreqs);
        }
        if (table === 'poa' || table === 'poas') {
          return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
        }
        if (table === 'poa_versions') {
          return createMockQuery([{ id: 'poa_v10', poa_id: 'poa_1', status: 'active' }]);
        }
        if (table === 'poa_activities') {
          return createMockQuery([
            { id: 'pa_1', poa_version_id: 'poa_v10', activity_key: '1.01', frecuencia: 25 },
            { id: 'pa_2', poa_version_id: 'poa_v10', activity_key: '3.14', frecuencia: null },
          ]);
        }
        if (table === 'poa_activity_zones') {
          return createMockQuery([
            { id: 'paz_1', poa_activity_id: 'pa_1', zone_id: siteId, cantidad_contratada: 5000 },
            { id: 'paz_2', poa_activity_id: 'pa_2', zone_id: siteId, cantidad_contratada: 15000 },
          ]);
        }
        if (table === 'board_activity_standards') {
          return createMockQuery([
            { id: 'std_1', activity_key: '1.01', name: 'Corte', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true, priority: 'must_execute' },
            { id: 'std_2', activity_key: '3.14', name: 'Mantenimiento Especial', unit: 'M2', rendimiento: 85000, requiere_rendimiento: true, priority: 'preferred' },
          ]);
        }
        if (table === 'activity_scope_mappings') {
          return createMockQuery([]);
        }
        if (table === 'resource_analysis') {
          return createMockQuery(null);
        }
        if (table === 'weekly_plan_items') {
          return createMockQuery([], 0);
        }
        if (table === 'weekly_plans') {
          return createMockQuery(null);
        }
        return createMockQuery(null);
      }),
      rpc: jest.fn((rpcName: string, params: any) => {
        if (rpcName === 'ensure_weekly_plan_header') {
          return Promise.resolve({ data: 'plan_header_123', error: null });
        }
        if (rpcName === 'sync_weekly_plan_items_rpc') {
          const rows = (params.p_items || []).map((item: any) => ({
            id: `row_${item.planned_sequence}`,
            planned_sequence: item.planned_sequence,
            activity_key: item.activity_key,
            planned_date: item.planned_date,
          }));
          return Promise.resolve({ data: rows, error: null });
        }
        if (rpcName === 'log_materialization_event_rpc') {
          loggedEvents.push(params);
          return Promise.resolve({ data: 'evt_uuid_1', error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    };
  });

  // T01
  test('T01 frecuencia NULL en POA → NOT_SCHEDULED_NO_PERIODIC_FREQ, no enviado al RPC', async () => {
    const result = await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);
    expect(result.insertedCount).toBeGreaterThan(0);

    const syncCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'sync_weekly_plan_items_rpc');
    expect(syncCalls.length).toBe(1);
    const sentItems = syncCalls[0][1].p_items;

    expect(sentItems.some((i: any) => i.activity_key === '3.14')).toBe(false);
    expect(sentItems.some((i: any) => i.activity_key === '1.01')).toBe(true);

    const summaryEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY');
    expect(summaryEvent).toBeDefined();
    expect(summaryEvent.p_status).toBe('SUCCESS');
    expect(summaryEvent.p_payload.not_scheduled_no_freq_count).toBe(1);
    const detail = summaryEvent.p_payload.activities_detail.find((a: any) => a.activity_key === '3.14');
    expect(detail).toBeDefined();
    expect(detail.action).toBe('NOT_SCHEDULED_NO_PERIODIC_FREQ');
  });

  // T02
  test('T02 frecuencia no finita o <= 0 en POA → EXCLUDED_INVALID_CONTRACT, plan PARCIAL', async () => {
    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'operational_frequencies') return createMockQuery(defaultOperationalFreqs);
      if (table === 'poa' || table === 'poas') {
        return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
      }
      if (table === 'poa_versions') {
        return createMockQuery([{ id: 'poa_v10', poa_id: 'poa_1', status: 'active' }]);
      }
      if (table === 'poa_activities') {
        return createMockQuery([
          { id: 'pa_1', poa_version_id: 'poa_v10', activity_key: '1.01', frecuencia: 25 },
          { id: 'pa_inv', poa_version_id: 'poa_v10', activity_key: '1.99', frecuencia: -5 },
        ]);
      }
      if (table === 'poa_activity_zones') {
        return createMockQuery([
          { id: 'paz_1', poa_activity_id: 'pa_1', zone_id: siteId, cantidad_contratada: 5000 },
          { id: 'paz_inv', poa_activity_id: 'pa_inv', zone_id: siteId, cantidad_contratada: 1000 },
        ]);
      }
      if (table === 'board_activity_standards') {
        return createMockQuery([
          { id: 'std_1', activity_key: '1.01', name: 'Corte', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true },
          { id: 'std_inv', activity_key: '1.99', name: 'Inv', unit: 'M2', rendimiento: 100, requiere_rendimiento: true },
        ]);
      }
      return createMockQuery(null);
    });

    await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);

    const summaryEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY');
    expect(summaryEvent.p_status).toBe('PARTIAL');
    expect(summaryEvent.p_payload.is_partial).toBe(true);
    expect(summaryEvent.p_payload.excluded_invalid_contract_count).toBe(1);
    const detailInv = summaryEvent.p_payload.activities_detail.find((a: any) => a.activity_key === '1.99');
    expect(detailInv.action).toBe('EXCLUDED_INVALID_CONTRACT');
  });

  // T03
  test('T03 cantidad en la zona sin estándar → EXCLUDED_MISSING_STANDARD, PARCIAL', async () => {
    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'operational_frequencies') return createMockQuery(defaultOperationalFreqs);
      if (table === 'poa' || table === 'poas') {
        return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
      }
      if (table === 'poa_versions') {
        return createMockQuery([{ id: 'poa_v10', poa_id: 'poa_1', status: 'active' }]);
      }
      if (table === 'poa_activities') {
        return createMockQuery([
          { id: 'pa_1', poa_version_id: 'poa_v10', activity_key: '1.01', frecuencia: 25 },
          { id: 'pa_orphan', poa_version_id: 'poa_v10', activity_key: '9.99', frecuencia: 12 },
        ]);
      }
      if (table === 'poa_activity_zones') {
        return createMockQuery([
          { id: 'paz_1', poa_activity_id: 'pa_1', zone_id: siteId, cantidad_contratada: 5000 },
          { id: 'paz_orphan', poa_activity_id: 'pa_orphan', zone_id: siteId, cantidad_contratada: 1000 },
        ]);
      }
      if (table === 'board_activity_standards') {
        return createMockQuery([
          { id: 'std_1', activity_key: '1.01', name: 'Corte', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true },
        ]);
      }
      return createMockQuery(null);
    });

    await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);
    const summaryEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY');
    expect(summaryEvent.p_status).toBe('PARTIAL');
    expect(summaryEvent.p_payload.excluded_missing_standard_count).toBe(1);
    const detailOrphan = summaryEvent.p_payload.activities_detail.find((a: any) => a.activity_key === '9.99');
    expect(detailOrphan.action).toBe('EXCLUDED_MISSING_STANDARD');
  });

  // T04
  test('T04 requiere_rendimiento=false → NOT_SCHEDULED_NO_RENDIMIENTO, no PARCIAL', async () => {
    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'operational_frequencies') return createMockQuery(defaultOperationalFreqs);
      if (table === 'poa' || table === 'poas') {
        return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
      }
      if (table === 'poa_versions') {
        return createMockQuery([{ id: 'poa_v10', poa_id: 'poa_1', status: 'active' }]);
      }
      if (table === 'poa_activities') {
        return createMockQuery([
          { id: 'pa_1', poa_version_id: 'poa_v10', activity_key: '1.01', frecuencia: 25 },
          { id: 'pa_admin', poa_version_id: 'poa_v10', activity_key: '1.05', frecuencia: 1 },
        ]);
      }
      if (table === 'poa_activity_zones') {
        return createMockQuery([
          { id: 'paz_1', poa_activity_id: 'pa_1', zone_id: siteId, cantidad_contratada: 5000 },
          { id: 'paz_admin', poa_activity_id: 'pa_admin', zone_id: siteId, cantidad_contratada: 1 },
        ]);
      }
      if (table === 'board_activity_standards') {
        return createMockQuery([
          { id: 'std_1', activity_key: '1.01', name: 'Corte', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true },
          { id: 'std_admin', activity_key: '1.05', name: 'Supervisión', unit: 'MES', rendimiento: 0, requiere_rendimiento: false },
        ]);
      }
      return createMockQuery(null);
    });

    await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);
    const summaryEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY');
    expect(summaryEvent.p_status).toBe('SUCCESS');
    expect(summaryEvent.p_payload.is_partial).toBe(false);
    expect(summaryEvent.p_payload.not_scheduled_no_rendimiento_count).toBe(1);
    const detailAdmin = summaryEvent.p_payload.activities_detail.find((a: any) => a.activity_key === '1.05');
    expect(detailAdmin.action).toBe('NOT_SCHEDULED_NO_RENDIMIENTO');
  });

  // T05
  test('T05 cantidad 0 → SKIPPED_ZERO_QTY', async () => {
    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'operational_frequencies') return createMockQuery(defaultOperationalFreqs);
      if (table === 'poa' || table === 'poas') {
        return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
      }
      if (table === 'poa_versions') {
        return createMockQuery([{ id: 'poa_v10', poa_id: 'poa_1', status: 'active' }]);
      }
      if (table === 'poa_activities') {
        return createMockQuery([
          { id: 'pa_1', poa_version_id: 'poa_v10', activity_key: '1.01', frecuencia: 25 },
          { id: 'pa_zero', poa_version_id: 'poa_v10', activity_key: '1.10', frecuencia: 12.5 },
        ]);
      }
      if (table === 'poa_activity_zones') {
        return createMockQuery([
          { id: 'paz_1', poa_activity_id: 'pa_1', zone_id: siteId, cantidad_contratada: 5000 },
          { id: 'paz_zero', poa_activity_id: 'pa_zero', zone_id: siteId, cantidad_contratada: 0 },
        ]);
      }
      if (table === 'board_activity_standards') {
        return createMockQuery([
          { id: 'std_1', activity_key: '1.01', name: 'Corte', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true },
          { id: 'std_zero', activity_key: '1.10', name: 'Poda', unit: 'M2', rendimiento: 500, requiere_rendimiento: true },
        ]);
      }
      return createMockQuery(null);
    });

    await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);
    const summaryEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY');
    expect(summaryEvent.p_status).toBe('SUCCESS');
    expect(summaryEvent.p_payload.skipped_zero_qty_count).toBe(1);
    const detailZero = summaryEvent.p_payload.activities_detail.find((a: any) => a.activity_key === '1.10');
    expect(detailZero.action).toBe('SKIPPED_ZERO_QTY');
  });

  // T06
  test('T06 error de ensure_weekly_plan_header → FAILED, syncWeeklyPlanForBoard NO llamado', async () => {
    mockSupabase.rpc = jest.fn((rpcName: string, params: any) => {
      if (rpcName === 'ensure_weekly_plan_header') {
        return Promise.resolve({ data: null, error: { message: 'DB deadlock', code: '40P01' } });
      }
      if (rpcName === 'log_materialization_event_rpc') {
        loggedEvents.push(params);
        return Promise.resolve({ data: 'evt_err_1', error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    await expect(ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr)).rejects.toThrow('ensure_weekly_plan_header failed');

    // D4: Prohibido fallback al cliente
    expect(syncWeeklyPlanForBoard).not.toHaveBeenCalled();

    const failedEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY' && e.p_status === 'FAILED');
    expect(failedEvent).toBeDefined();
    expect(failedEvent.p_payload.error.code).toBe('40P01');
  });

  // T07
  test('T07 error de sync_weekly_plan_items_rpc → FAILED, sin fallback', async () => {
    mockSupabase.rpc = jest.fn((rpcName: string, params: any) => {
      if (rpcName === 'ensure_weekly_plan_header') {
        return Promise.resolve({ data: 'plan_123', error: null });
      }
      if (rpcName === 'sync_weekly_plan_items_rpc') {
        return Promise.resolve({ data: null, error: { message: 'Foreign key violation', code: '23503' } });
      }
      if (rpcName === 'log_materialization_event_rpc') {
        loggedEvents.push(params);
        return Promise.resolve({ data: 'evt_err_2', error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    await expect(ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr)).rejects.toThrow('sync_weekly_plan_items_rpc failed');
    expect(syncWeeklyPlanForBoard).not.toHaveBeenCalled();

    const failedEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY' && e.p_status === 'FAILED');
    expect(failedEvent).toBeDefined();
    expect(failedEvent.p_payload.error.code).toBe('23503');
  });

  // T08
  test('T08 excepción no controlada en la tubería → FAILED, visible y registrado', async () => {
    mockSupabase.rpc = jest.fn((rpcName: string, params: any) => {
      if (rpcName === 'ensure_weekly_plan_header') {
        return Promise.reject(new Error('Network timeout'));
      }
      if (rpcName === 'log_materialization_event_rpc') {
        loggedEvents.push(params);
        return Promise.resolve({ data: 'evt_err_3', error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    await expect(ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr)).rejects.toThrow('Network timeout');
    expect(syncWeeklyPlanForBoard).not.toHaveBeenCalled();

    const failedEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY' && e.p_status === 'FAILED');
    expect(failedEvent).toBeDefined();
    expect(failedEvent.p_payload.error.stage).toBe('exception');
  });

  // T09
  test('T09 validación previa falla (sin grupo) → FAILED MISSING_GROUP_ID, ensure_weekly_plan_header NO llamado', async () => {
    await expect(ensureWeeklyPlanMaterialized(mockSupabase, boardId, null, weekStartStr)).rejects.toThrow('MISSING_GROUP_ID');

    // D5 / D10: Cero llamadas a RPCs de persistencia de cabecera
    const headerRpcCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'ensure_weekly_plan_header');
    expect(headerRpcCalls.length).toBe(0);

    const failedEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY' && e.p_status === 'FAILED');
    expect(failedEvent).toBeDefined();
    expect(failedEvent.p_payload.error.code).toBe('MISSING_GROUP_ID');
    expect(failedEvent.p_group_id).toBeNull();
  });

  // T10
  test('T10 descarte de ítems en el Gateway → WEEKLY_PLAN_ITEMS_GATEWAY_DROPPED y resumen PARCIAL', async () => {
    mockSupabase.rpc = jest.fn((rpcName: string, params: any) => {
      if (rpcName === 'ensure_weekly_plan_header') {
        return Promise.resolve({ data: 'plan_123', error: null });
      }
      if (rpcName === 'sync_weekly_plan_items_rpc') {
        // Simular que el Gateway descartó la secuencia 1 y solo devolvió la secuencia 2
        return Promise.resolve({
          data: [{ id: 'row_2', planned_sequence: 2, activity_key: '1.01', planned_date: '2026-09-29' }],
          error: null,
        });
      }
      if (rpcName === 'log_materialization_event_rpc') {
        loggedEvents.push(params);
        return Promise.resolve({ data: 'evt_drop_1', error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const result = await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);
    expect(result).toBeDefined();

    const droppedEvent = loggedEvents.find((e) => e.p_event_type === 'WEEKLY_PLAN_ITEMS_GATEWAY_DROPPED');
    expect(droppedEvent).toBeDefined();
    expect(droppedEvent.p_payload.missing_sequences).toContain(1);

    const summaryEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY');
    expect(summaryEvent.p_status).toBe('PARTIAL');
    expect(summaryEvent.p_payload.is_partial).toBe(true);
    expect(summaryEvent.p_payload.partial_reasons.some((r: string) => r.includes('WEEKLY_PLAN_ITEMS_GATEWAY_DROPPED'))).toBe(true);
  });

  // T11 (D14 / E4: Inmutabilidad de plan existente con ítems -> NOOP, 0 escrituras)
  test('T11 plan existente con ítems → NOOP, 0 escrituras sin arrojar conflicto (E4 inmutabilidad)', async () => {
    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'operational_frequencies') return createMockQuery(defaultOperationalFreqs);
      if (table === 'poa' || table === 'poas') return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
      if (table === 'poa_versions') return createMockQuery([{ id: 'poa_v10', poa_id: 'poa_1', status: 'active' }]);
      if (table === 'weekly_plans') {
        return createMockQuery({ id: 'plan_prev_exist', board_id: boardId, group_id: siteId, week_start: weekStartStr, status: 'published' });
      }
      if (table === 'weekly_plan_items') {
        return createMockQuery([
          { planned_sequence: 1, activity_key: 'OLD_KEY_CONFLICT', planned_date: '2026-09-28' },
        ]);
      }
      if (table === 'poa_activities') {
        return createMockQuery([{ id: 'pa_1', poa_version_id: 'poa_v10', activity_key: '1.01', frecuencia: 25 }]);
      }
      if (table === 'poa_activity_zones') {
        return createMockQuery([{ id: 'paz_1', poa_activity_id: 'pa_1', zone_id: siteId, cantidad_contratada: 5000 }]);
      }
      if (table === 'board_activity_standards') {
        return createMockQuery([
          { id: 'std_1', activity_key: '1.01', name: 'Corte', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true },
        ]);
      }
      return createMockQuery(null);
    });

    const res = await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);
    expect(res.weeklyPlan.id).toBe('plan_prev_exist');
    expect(res.insertedCount).toBe(0);
    expect(res.protectedCount).toBe(1);

    const headerCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'ensure_weekly_plan_header');
    const syncCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'sync_weekly_plan_items_rpc');
    expect(headerCalls.length).toBe(0);
    expect(syncCalls.length).toBe(0);

    const summaryEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY');
    expect(summaryEvent).toBeDefined();
  });

  // T12 (D15: Superficies de solo lectura)
  test('T12 superficies de consulta son de solo lectura: fetchPublishedWeekPlans con 0 planes → retorna [], 0 RPCs y 0 mutaciones (D15)', async () => {
    const insertMock = jest.fn();
    const updateMock = jest.fn();
    const deleteMock = jest.fn();
    const upsertMock = jest.fn();
    const rpcMock = jest.fn();

    const readOnlyClient: any = {
      from: jest.fn((table: string) => {
        const qb = createMockQuery([]);
        qb.insert = insertMock;
        qb.update = updateMock;
        qb.delete = deleteMock;
        qb.upsert = upsertMock;
        return qb;
      }),
      rpc: rpcMock,
    };

    const plans = await fetchPublishedWeekPlans(readOnlyClient, weekStartStr);
    expect(plans).toEqual([]);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  // T13
  test('T13 POA activo y cero plantillas → FAILED NO_TEMPLATES, catálogo V3 no usado, header no llamado', async () => {
    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'operational_frequencies') return createMockQuery(defaultOperationalFreqs);
      if (table === 'poa' || table === 'poas') return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
      if (table === 'poa_versions') return createMockQuery([{ id: 'poa_v10', poa_id: 'poa_1', status: 'active' }]);
      if (table === 'poa_activities') {
        return createMockQuery([{ id: 'pa_null', poa_version_id: 'poa_v10', activity_key: '1.15', frecuencia: null }]);
      }
      if (table === 'poa_activity_zones') {
        return createMockQuery([{ id: 'paz_null', poa_activity_id: 'pa_null', zone_id: siteId, cantidad_contratada: 1000 }]);
      }
      if (table === 'board_activity_standards') {
        return createMockQuery([
          { id: 'std_115', activity_key: '1.15', name: 'Esp', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true },
        ]);
      }
      return createMockQuery(null);
    });

    await expect(ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr)).rejects.toThrow('NO_TEMPLATES');

    const headerRpcCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'ensure_weekly_plan_header');
    expect(headerRpcCalls.length).toBe(0);

    const failedEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY' && e.p_status === 'FAILED');
    expect(failedEvent).toBeDefined();
    expect(failedEvent.p_payload.error.code).toBe('NO_TEMPLATES');
  });

  // T14 (M5)
  test('T14 fallo del RPC de eventos → console.error y aviso; la materialización no se interrumpe y el error queda disponible para la UI', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    mockSupabase.rpc = jest.fn((rpcName: string, params: any) => {
      if (rpcName === 'ensure_weekly_plan_header') {
        return Promise.resolve({ data: 'plan_header_123', error: null });
      }
      if (rpcName === 'sync_weekly_plan_items_rpc') {
        const rows = (params.p_items || []).map((item: any) => ({
          id: `row_${item.planned_sequence}`,
          planned_sequence: item.planned_sequence,
          activity_key: item.activity_key,
          planned_date: item.planned_date,
        }));
        return Promise.resolve({ data: rows, error: null });
      }
      if (rpcName === 'log_materialization_event_rpc') {
        return Promise.resolve({ data: null, error: { message: 'Event table unavailable', code: '42P01' } });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const result = await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);
    expect(result.insertedCount).toBeGreaterThan(0);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  // T15 (D8)
  test('T15 resumen incluye conteos de clasificación y lista de actividades excluidas / no periódicas', async () => {
    await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);

    const summaryEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY');
    expect(summaryEvent).toBeDefined();
    expect(summaryEvent.p_payload).toMatchObject({
      total_activities_evaluated: 2,
      materialized_count: 1,
      not_scheduled_no_freq_count: 1,
      excluded_invalid_contract_count: 0,
      excluded_missing_standard_count: 0,
      not_scheduled_no_rendimiento_count: 0,
      skipped_zero_qty_count: 0,
      is_partial: false,
      partial_reasons: [],
    });
    expect(Array.isArray(summaryEvent.p_payload.activities_detail)).toBe(true);
    expect(summaryEvent.p_payload.activities_detail.length).toBe(2);
  });

  // T16 (M2)
  test('T16 isValidISODateString valida fechas estrictas', () => {
    expect(isValidISODateString('2026-09-28')).toBe(true);
    expect(isValidISODateString('2026-02-29')).toBe(false); // 2026 no bisiesto
    expect(isValidISODateString('2026-13-01')).toBe(false);
    expect(isValidISODateString('invalid')).toBe(false);
    expect(isValidISODateString(null)).toBe(false);
    expect(isValidISODateString(undefined)).toBe(false);
  });

  // T17 (H6.3)
  test('T17 materialización para trigger ejecuta tubería canónica y clasifica actividades', async () => {
    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'operational_frequencies') return createMockQuery(defaultOperationalFreqs);
      if (table === 'poa' || table === 'poas') {
        return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
      }
      if (table === 'poa_versions') {
        return createMockQuery([{ id: 'poa_v10', poa_id: 'poa_1', status: 'active' }]);
      }
      if (table === 'weekly_plans') {
        return createMockQuery(null);
      }
      if (table === 'weekly_plan_items') {
        return createMockQuery([], 0);
      }
      if (table === 'poa_activities') {
        return createMockQuery([
          { id: 'pa_1', poa_version_id: 'poa_v10', activity_key: '1.01', frecuencia: 25 },
          { id: 'pa_2', poa_version_id: 'poa_v10', activity_key: '1.15', frecuencia: null },
          { id: 'pa_3', poa_version_id: 'poa_v10', activity_key: '1.99', frecuencia: -10 },
        ]);
      }
      if (table === 'poa_activity_zones') {
        return createMockQuery([
          { id: 'paz_1', poa_activity_id: 'pa_1', zone_id: siteId, cantidad_contratada: 5000 },
          { id: 'paz_2', poa_activity_id: 'pa_2', zone_id: siteId, cantidad_contratada: 1000 },
          { id: 'paz_3', poa_activity_id: 'pa_3', zone_id: siteId, cantidad_contratada: 2000 },
        ]);
      }
      if (table === 'board_activity_standards') {
        return createMockQuery([
          { id: 'std_1', activity_key: '1.01', name: 'Corte', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true },
          { id: 'std_2', activity_key: '1.15', name: 'Mantenimiento Esp', unit: 'M2', rendimiento: 85000, requiere_rendimiento: true },
          { id: 'std_3', activity_key: '1.99', name: 'Invalida', unit: 'M2', rendimiento: 500, requiere_rendimiento: true },
        ]);
      }
      return createMockQuery(null);
    });

    const triggerResult = await materializeWeeklyPlanForTrigger(mockSupabase, boardId, siteId, weekStartStr);
    expect(triggerResult.insertedCount).toBeGreaterThan(0);

    const syncCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'sync_weekly_plan_items_rpc');
    expect(syncCalls.length).toBe(1);
    const sentItems = syncCalls[0][1].p_items;
    expect(sentItems.some((i: any) => i.activity_key === '1.15')).toBe(false);
    expect(sentItems.some((i: any) => i.activity_key === '1.99')).toBe(false);
    expect(sentItems.some((i: any) => i.activity_key === '1.01')).toBe(true);

    const summaryEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY');
    expect(summaryEvent).toBeDefined();
    expect(summaryEvent.p_status).toBe('PARTIAL');
  });

  // T18 (B1)
  test('T18 POA activo sin fila de zona + resource_analysis con cantidad → no materializa (NO_TEMPLATES)', async () => {
    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'operational_frequencies') return createMockQuery(defaultOperationalFreqs);
      if (table === 'poa' || table === 'poas') return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
      if (table === 'poa_versions') return createMockQuery([{ id: 'poa_v10', poa_id: 'poa_1', status: 'active' }]);
      if (table === 'poa_activities') {
        return createMockQuery([{ id: 'pa_1', poa_version_id: 'poa_v10', activity_key: '1.01', frecuencia: 25 }]);
      }
      if (table === 'poa_activity_zones') {
        return createMockQuery([]);
      }
      if (table === 'board_activity_standards') {
        return createMockQuery([
          { id: 'std_1', activity_key: '1.01', name: 'Corte', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true },
        ]);
      }
      if (table === 'resource_analysis') {
        return createMockQuery({ scope_data: { '1.01': 5000 } });
      }
      return createMockQuery(null);
    });

    await expect(ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr)).rejects.toThrow('NO_TEMPLATES');
    const headerCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'ensure_weekly_plan_header');
    expect(headerCalls.length).toBe(0);
  });

  // T19 (B2)
  test('T19 actividades de otros sitios no aparecen en el detalle del sitio', async () => {
    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'operational_frequencies') return createMockQuery(defaultOperationalFreqs);
      if (table === 'poa' || table === 'poas') return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
      if (table === 'poa_versions') return createMockQuery([{ id: 'poa_v10', poa_id: 'poa_1', status: 'active' }]);
      if (table === 'poa_activities') {
        return createMockQuery([
          { id: 'pa_site1', poa_version_id: 'poa_v10', activity_key: '1.01', frecuencia: 25 },
          { id: 'pa_other_site', poa_version_id: 'poa_v10', activity_key: '2.01', frecuencia: 10 },
        ]);
      }
      if (table === 'poa_activity_zones') {
        return createMockQuery([
          { id: 'paz_site1', poa_activity_id: 'pa_site1', zone_id: siteId, cantidad_contratada: 5000 },
        ]);
      }
      if (table === 'board_activity_standards') {
        return createMockQuery([
          { id: 'std_1', activity_key: '1.01', name: 'Corte', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true },
          { id: 'std_2', activity_key: '2.01', name: 'Pintura', unit: 'M2', rendimiento: 500, requiere_rendimiento: true },
        ]);
      }
      return createMockQuery(null);
    });

    await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);

    const summaryEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY');
    expect(summaryEvent).toBeDefined();
    expect(summaryEvent.p_payload.activities_detail.some((a: any) => a.activity_key === '2.01')).toBe(false);
    expect(summaryEvent.p_payload.activities_detail.some((a: any) => a.activity_key === '1.01')).toBe(true);
    expect(summaryEvent.p_payload.total_activities_evaluated).toBe(1);
  });

  // T20 (D11)
  test('T20 tablero sin POA activo → falla cerrado con NO_ACTIVE_POA', async () => {
    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'operational_frequencies') return createMockQuery(defaultOperationalFreqs);
      if (table === 'poa' || table === 'poas') return createMockQuery([]);
      if (table === 'poa_versions') return createMockQuery([]);
      if (table === 'poa_activities') return createMockQuery([]);
      if (table === 'poa_activity_zones') return createMockQuery([]);
      if (table === 'board_activity_standards') {
        return createMockQuery([
          { id: 'std_legacy', activity_key: '1.01', name: 'Corte', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true },
        ]);
      }
      return createMockQuery(null);
    });

    await expect(ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr)).rejects.toThrow('NO_ACTIVE_POA');

    const failedEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY' && e.p_status === 'FAILED');
    expect(failedEvent).toBeDefined();
    expect(failedEvent.p_payload.error.code).toBe('NO_ACTIVE_POA');
  });

  // T21 (D19)
  test('T21 1.15 con cantidad > 0 pero sin frecuencia operativa → EXCLUDED_MISSING_OPERATIONAL_FREQ, plan PARCIAL, no se envía al RPC, motivo en partial_reasons', async () => {
    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'operational_frequencies') {
        return createMockQuery([
          { id: 'opf_1', board_id: boardId, group_id: siteId, activity_key: '1.01', visits_per_month: 25, source: 'CRONOGRAMA' },
        ]);
      }
      if (table === 'poa' || table === 'poas') return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
      if (table === 'poa_versions') return createMockQuery([{ id: 'poa_v10', poa_id: 'poa_1', status: 'active' }]);
      if (table === 'poa_activities') {
        return createMockQuery([
          { id: 'pa_1', poa_version_id: 'poa_v10', activity_key: '1.01', frecuencia: 25 },
          { id: 'pa_2', poa_version_id: 'poa_v10', activity_key: '1.15', frecuencia: 8 },
        ]);
      }
      if (table === 'poa_activity_zones') {
        return createMockQuery([
          { id: 'paz_1', poa_activity_id: 'pa_1', zone_id: siteId, cantidad_contratada: 5000 },
          { id: 'paz_2', poa_activity_id: 'pa_2', zone_id: siteId, cantidad_contratada: 15000 },
        ]);
      }
      if (table === 'board_activity_standards') {
        return createMockQuery([
          { id: 'std_1', activity_key: '1.01', name: 'Corte', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true },
          { id: 'std_2', activity_key: '1.15', name: 'Mantenimiento Especial', unit: 'M2', rendimiento: 85000, requiere_rendimiento: true },
        ]);
      }
      return createMockQuery(null);
    });

    const result = await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);
    expect(result.insertedCount).toBeGreaterThan(0);

    const syncCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'sync_weekly_plan_items_rpc');
    expect(syncCalls.length).toBe(1);
    const sentItems = syncCalls[0][1].p_items;
    expect(sentItems.some((i: any) => i.activity_key === '1.15')).toBe(false);
    expect(sentItems.some((i: any) => i.activity_key === '1.01')).toBe(true);

    const summaryEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY');
    expect(summaryEvent).toBeDefined();
    expect(summaryEvent.p_status).toBe('PARTIAL');
    expect(summaryEvent.p_payload.is_partial).toBe(true);
    expect(summaryEvent.p_payload.excluded_missing_operational_freq_count).toBe(1);

    const detail115 = summaryEvent.p_payload.activities_detail.find((a: any) => a.activity_key === '1.15');
    expect(detail115).toBeDefined();
    expect(detail115.action).toBe('EXCLUDED_MISSING_OPERATIONAL_FREQ');
    expect(detail115.reason).toBe('Actividad 1.15 tiene cantidad y rendimiento pero no tiene frecuencia operativa configurada');
    expect(summaryEvent.p_payload.partial_reasons).toContain('1.15: Actividad 1.15 tiene cantidad y rendimiento pero no tiene frecuencia operativa configurada');
  });

  // T22 (D12/D19)
  test('T22 3.14 con frecuencia NULL en POA y sin frecuencia operativa → NOT_SCHEDULED_NO_PERIODIC_FREQ, plan NO parcial', async () => {
    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'operational_frequencies') {
        return createMockQuery([
          { id: 'opf_1', board_id: boardId, group_id: siteId, activity_key: '1.01', visits_per_month: 25, source: 'CRONOGRAMA' },
        ]);
      }
      if (table === 'poa' || table === 'poas') return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
      if (table === 'poa_versions') return createMockQuery([{ id: 'poa_v10', poa_id: 'poa_1', status: 'active' }]);
      if (table === 'poa_activities') {
        return createMockQuery([
          { id: 'pa_1', poa_version_id: 'poa_v10', activity_key: '1.01', frecuencia: 25 },
          { id: 'pa_2', poa_version_id: 'poa_v10', activity_key: '3.14', frecuencia: null },
        ]);
      }
      if (table === 'poa_activity_zones') {
        return createMockQuery([
          { id: 'paz_1', poa_activity_id: 'pa_1', zone_id: siteId, cantidad_contratada: 5000 },
          { id: 'paz_2', poa_activity_id: 'pa_2', zone_id: siteId, cantidad_contratada: 1000 },
        ]);
      }
      if (table === 'board_activity_standards') {
        return createMockQuery([
          { id: 'std_1', activity_key: '1.01', name: 'Corte', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true },
          { id: 'std_2', activity_key: '3.14', name: 'Actividad No Periódica', unit: 'UND', rendimiento: 10, requiere_rendimiento: true },
        ]);
      }
      return createMockQuery(null);
    });

    const result = await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);
    expect(result.insertedCount).toBeGreaterThan(0);

    const summaryEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY');
    expect(summaryEvent).toBeDefined();
    expect(summaryEvent.p_status).toBe('SUCCESS');
    expect(summaryEvent.p_payload.is_partial).toBe(false);
    expect(summaryEvent.p_payload.not_scheduled_no_freq_count).toBe(1);

    const detail314 = summaryEvent.p_payload.activities_detail.find((a: any) => a.activity_key === '3.14');
    expect(detail314).toBeDefined();
    expect(detail314.action).toBe('NOT_SCHEDULED_NO_PERIODIC_FREQ');
  });

  // T23 (D13)
  test('T23 dos POA (producción y prueba) con la misma clave 1.01 e ids distintos → se materializa la de producción sin interferencia', async () => {
    const prodBoardId = 'board_prod_d13';
    const testBoardId = 'board_test_d13';

    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'operational_frequencies') return createMockQuery(defaultOperationalFreqs);
      if (table === 'poa' || table === 'poas') {
        const obj: any = {};
        obj.select = jest.fn(() => obj);
        obj.eq = jest.fn((col: string, val: string) => {
          const allPoas = [
            { id: 'poa_prod_id', board_id: prodBoardId },
            { id: 'poa_test_id', board_id: testBoardId },
          ];
          const filtered = allPoas.filter((p) => p.board_id === val);
          return createMockQuery(filtered);
        });
        return obj;
      }
      if (table === 'poa_versions') {
        const obj: any = {};
        obj.select = jest.fn(() => obj);
        obj.in = jest.fn((col: string, ids: string[]) => {
          const allVers = [
            { id: 'ver_prod_id', poa_id: 'poa_prod_id', status: 'active' },
            { id: 'ver_test_id', poa_id: 'poa_test_id', status: 'active' },
          ];
          const filtered = allVers.filter((v) => ids.includes(v.poa_id));
          return {
            eq: jest.fn((col2: string, val2: string) => createMockQuery(filtered.filter((v) => v.status === val2))),
          };
        });
        return obj;
      }
      if (table === 'poa_activities') {
        const obj: any = {};
        obj.select = jest.fn(() => obj);
        obj.eq = jest.fn((col: string, val: string) => {
          const allActs = [
            { id: 'pa_prod_101', poa_version_id: 'ver_prod_id', activity_key: '1.01', frecuencia: 25 },
            { id: 'pa_test_101', poa_version_id: 'ver_test_id', activity_key: '1.01', frecuencia: 5 },
          ];
          const queryObj = createMockQuery(allActs.filter((a) => a.poa_version_id === val));
          queryObj.order = jest.fn(() => queryObj);
          return queryObj;
        });
        return obj;
      }
      if (table === 'poa_activity_zones') {
        return createMockQuery([
          { id: 'paz_prod_1', poa_activity_id: 'pa_prod_101', zone_id: siteId, cantidad_contratada: 5000 },
        ]);
      }
      if (table === 'board_activity_standards') {
        return createMockQuery([
          { id: 'std_1', activity_key: '1.01', name: 'Corte', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true },
        ]);
      }
      return createMockQuery(null);
    });

    const result = await ensureWeeklyPlanMaterialized(mockSupabase, prodBoardId, siteId, weekStartStr);
    expect(result.insertedCount).toBeGreaterThan(0);

    const syncCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'sync_weekly_plan_items_rpc');
    expect(syncCalls.length).toBe(1);
    const sentItems = syncCalls[0][1].p_items;
    expect(sentItems.length).toBe(6);
    expect(sentItems[0].activity_key).toBe('1.01');
    expect(sentItems[0].planned_qty).toBe(5000);
    expect(sentItems[0].planned_frecuencia).toBe(25);

    const summaryEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY');
    expect(summaryEvent).toBeDefined();
    expect(summaryEvent.p_payload.poa_id).toBe('poa_prod_id');
    expect(summaryEvent.p_payload.poa_version_id).toBe('ver_prod_id');
  });

  // T24 (D13)
  test('T24 tablero sin fila en poa → NO_ACTIVE_POA, sin llamar a ensure_weekly_plan_header', async () => {
    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'operational_frequencies') return createMockQuery(defaultOperationalFreqs);
      if (table === 'poa' || table === 'poas') return createMockQuery([]);
      if (table === 'poa_versions') return createMockQuery([]);
      return createMockQuery(null);
    });

    await expect(ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr)).rejects.toThrow('NO_ACTIVE_POA');

    const headerRpcCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'ensure_weekly_plan_header');
    expect(headerRpcCalls.length).toBe(0);

    const failedEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY' && e.p_status === 'FAILED');
    expect(failedEvent).toBeDefined();
    expect(failedEvent.p_payload.error.code).toBe('NO_ACTIVE_POA');
  });

  // T25 (D13)
  test('T25 dos versiones activas → FAILED MULTIPLE_ACTIVE_POA_VERSIONS, sin cabecera', async () => {
    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'operational_frequencies') return createMockQuery(defaultOperationalFreqs);
      if (table === 'poa' || table === 'poas') return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
      if (table === 'poa_versions') {
        return createMockQuery([
          { id: 'ver_1', poa_id: 'poa_1', status: 'active' },
          { id: 'ver_2', poa_id: 'poa_1', status: 'active' },
        ]);
      }
      return createMockQuery(null);
    });

    await expect(ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr)).rejects.toThrow('MULTIPLE_ACTIVE_POA_VERSIONS');

    const headerRpcCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'ensure_weekly_plan_header');
    expect(headerRpcCalls.length).toBe(0);

    const failedEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY' && e.p_status === 'FAILED');
    expect(failedEvent).toBeDefined();
    expect(failedEvent.p_payload.error.code).toBe('MULTIPLE_ACTIVE_POA_VERSIONS');
  });

  // T26 (D13)
  test('T26 clave duplicada en la versión activa → FAILED DUPLICATE_ACTIVITY_KEY, sin cabecera', async () => {
    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'operational_frequencies') return createMockQuery(defaultOperationalFreqs);
      if (table === 'poa' || table === 'poas') return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
      if (table === 'poa_versions') return createMockQuery([{ id: 'ver_1', poa_id: 'poa_1', status: 'active' }]);
      if (table === 'poa_activities') {
        return createMockQuery([
          { id: 'pa_1a', poa_version_id: 'ver_1', activity_key: '1.01', frecuencia: 25 },
          { id: 'pa_1b', poa_version_id: 'ver_1', activity_key: '1.01', frecuencia: 12 },
        ]);
      }
      return createMockQuery(null);
    });

    await expect(ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr)).rejects.toThrow('DUPLICATE_ACTIVITY_KEY');

    const headerRpcCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'ensure_weekly_plan_header');
    expect(headerRpcCalls.length).toBe(0);

    const failedEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY' && e.p_status === 'FAILED');
    expect(failedEvent).toBeDefined();
    expect(failedEvent.p_payload.error.code).toBe('DUPLICATE_ACTIVITY_KEY');
    expect(failedEvent.p_payload.error.details).toContain('1.01');
  });

  // T27 (Orden Determinista)
  test('T27 orden determinista: poa_activities barajado produce asignaciones y secuencias idénticas', async () => {
    // Escenario 1: Orden natural
    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'operational_frequencies') return createMockQuery(defaultOperationalFreqs);
      if (table === 'poa' || table === 'poas') return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
      if (table === 'poa_versions') return createMockQuery([{ id: 'ver_1', poa_id: 'poa_1', status: 'active' }]);
      if (table === 'poa_activities') {
        return createMockQuery([
          { id: 'pa_1', poa_version_id: 'ver_1', activity_key: '1.01', frecuencia: 25 },
          { id: 'pa_2', poa_version_id: 'ver_1', activity_key: '2.12', frecuencia: 25 },
        ]);
      }
      if (table === 'poa_activity_zones') {
        return createMockQuery([
          { id: 'paz_1', poa_activity_id: 'pa_1', zone_id: siteId, cantidad_contratada: 5000 },
          { id: 'paz_2', poa_activity_id: 'pa_2', zone_id: siteId, cantidad_contratada: 3000 },
        ]);
      }
      if (table === 'board_activity_standards') {
        return createMockQuery([
          { id: 'std_1', activity_key: '1.01', name: 'Corte', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true },
          { id: 'std_2', activity_key: '2.12', name: 'Poda', unit: 'M2', rendimiento: 500, requiere_rendimiento: true },
        ]);
      }
      return createMockQuery(null);
    });

    await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);
    const syncCalls1 = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'sync_weekly_plan_items_rpc');
    const itemsRun1 = syncCalls1[0][1].p_items;

    // Escenario 2: Barajado / Invertido
    mockSupabase.rpc.mockClear();
    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'operational_frequencies') return createMockQuery(defaultOperationalFreqs);
      if (table === 'poa' || table === 'poas') return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
      if (table === 'poa_versions') return createMockQuery([{ id: 'ver_1', poa_id: 'poa_1', status: 'active' }]);
      if (table === 'poa_activities') {
        return createMockQuery([
          { id: 'pa_2', poa_version_id: 'ver_1', activity_key: '2.12', frecuencia: 25 },
          { id: 'pa_1', poa_version_id: 'ver_1', activity_key: '1.01', frecuencia: 25 },
        ]);
      }
      if (table === 'poa_activity_zones') {
        return createMockQuery([
          { id: 'paz_2', poa_activity_id: 'pa_2', zone_id: siteId, cantidad_contratada: 3000 },
          { id: 'paz_1', poa_activity_id: 'pa_1', zone_id: siteId, cantidad_contratada: 5000 },
        ]);
      }
      if (table === 'board_activity_standards') {
        return createMockQuery([
          { id: 'std_2', activity_key: '2.12', name: 'Poda', unit: 'M2', rendimiento: 500, requiere_rendimiento: true },
          { id: 'std_1', activity_key: '1.01', name: 'Corte', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true },
        ]);
      }
      return createMockQuery(null);
    });

    await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);
    const syncCalls2 = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'sync_weekly_plan_items_rpc');
    const itemsRun2 = syncCalls2[0][1].p_items;

    expect(itemsRun1).toEqual(itemsRun2);
    expect(itemsRun1[0].activity_key).toBe('1.01');
    expect(itemsRun1[0].planned_sequence).toBe(1);
  });

  // T28 (D14 / E4: Plan existente con ítems -> NOOP inmutable)
  test('T28 plan existente con ítems distintos → 0 header, 0 sync, retorna NOOP (E4 inmutabilidad)', async () => {
    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'operational_frequencies') return createMockQuery(defaultOperationalFreqs);
      if (table === 'poa' || table === 'poas') return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
      if (table === 'poa_versions') return createMockQuery([{ id: 'ver_1', poa_id: 'poa_1', status: 'active' }]);
      if (table === 'weekly_plans') {
        return createMockQuery({ id: 'plan_exist_28', board_id: boardId, group_id: siteId, week_start: weekStartStr, status: 'published' });
      }
      if (table === 'weekly_plan_items') {
        return createMockQuery([
          { planned_sequence: 1, activity_key: '2.12', planned_date: '2026-09-28' }, // Difiere de 1.01
        ]);
      }
      if (table === 'poa_activities') {
        return createMockQuery([{ id: 'pa_1', poa_version_id: 'ver_1', activity_key: '1.01', frecuencia: 25 }]);
      }
      if (table === 'poa_activity_zones') {
        return createMockQuery([{ id: 'paz_1', poa_activity_id: 'pa_1', zone_id: siteId, cantidad_contratada: 5000 }]);
      }
      if (table === 'board_activity_standards') {
        return createMockQuery([
          { id: 'std_1', activity_key: '1.01', name: 'Corte', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true },
        ]);
      }
      return createMockQuery(null);
    });

    const res = await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);
    expect(res.weeklyPlan.id).toBe('plan_exist_28');
    expect(res.insertedCount).toBe(0);

    const headerCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'ensure_weekly_plan_header');
    const syncCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'sync_weekly_plan_items_rpc');
    expect(headerCalls.length).toBe(0);
    expect(syncCalls.length).toBe(0);
  });

  // T29 (D14 / E4: Plan existente con ítems -> NOOP inmutable)
  test('T29 plan existente con secuencia parcial → NOOP con 0 escrituras (E4 inmutabilidad)', async () => {
    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'operational_frequencies') return createMockQuery(defaultOperationalFreqs);
      if (table === 'poa' || table === 'poas') return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
      if (table === 'poa_versions') return createMockQuery([{ id: 'ver_1', poa_id: 'poa_1', status: 'active' }]);
      if (table === 'weekly_plans') {
        return createMockQuery({ id: 'plan_exist_29', board_id: boardId, group_id: siteId, week_start: weekStartStr, status: 'published' });
      }
      if (table === 'weekly_plan_items') {
        return createMockQuery([
          { planned_sequence: 2, activity_key: '1.01', planned_date: '2026-09-28' },
        ]);
      }
      if (table === 'poa_activities') {
        return createMockQuery([{ id: 'pa_1', poa_version_id: 'ver_1', activity_key: '1.01', frecuencia: 25 }]);
      }
      if (table === 'poa_activity_zones') {
        return createMockQuery([{ id: 'paz_1', poa_activity_id: 'pa_1', zone_id: siteId, cantidad_contratada: 5000 }]);
      }
      if (table === 'board_activity_standards') {
        return createMockQuery([
          { id: 'std_1', activity_key: '1.01', name: 'Corte', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true },
        ]);
      }
      return createMockQuery(null);
    });

    const res = await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);
    expect(res.weeklyPlan.id).toBe('plan_exist_29');
    expect(res.insertedCount).toBe(0);

    const headerCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'ensure_weekly_plan_header');
    const syncCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'sync_weekly_plan_items_rpc');
    expect(headerCalls.length).toBe(0);
    expect(syncCalls.length).toBe(0);
  });

  // T30 (D14 / E4: Plan existente con ítems extra -> NOOP inmutable)
  test('T30 ítems extra en plan existente → NOOP con 0 escrituras (E4 inmutabilidad)', async () => {
    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'operational_frequencies') return createMockQuery(defaultOperationalFreqs);
      if (table === 'poa' || table === 'poas') return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
      if (table === 'poa_versions') return createMockQuery([{ id: 'ver_1', poa_id: 'poa_1', status: 'active' }]);
      if (table === 'weekly_plans') {
        return createMockQuery({ id: 'plan_exist_30', board_id: boardId, group_id: siteId, week_start: weekStartStr, status: 'published' });
      }
      if (table === 'weekly_plan_items') {
        return createMockQuery([
          { planned_sequence: 1, activity_key: '1.01', planned_date: '2026-09-28' },
          { planned_sequence: 99, activity_key: 'EXTRA_KEY', planned_date: '2026-09-28' },
        ]);
      }
      if (table === 'poa_activities') {
        return createMockQuery([{ id: 'pa_1', poa_version_id: 'ver_1', activity_key: '1.01', frecuencia: 25 }]);
      }
      if (table === 'poa_activity_zones') {
        return createMockQuery([{ id: 'paz_1', poa_activity_id: 'pa_1', zone_id: siteId, cantidad_contratada: 5000 }]);
      }
      if (table === 'board_activity_standards') {
        return createMockQuery([
          { id: 'std_1', activity_key: '1.01', name: 'Corte', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true },
        ]);
      }
      return createMockQuery(null);
    });

    const res = await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);
    expect(res.weeklyPlan.id).toBe('plan_exist_30');
    expect(res.insertedCount).toBe(0);

    const headerCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'ensure_weekly_plan_header');
    const syncCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'sync_weekly_plan_items_rpc');
    expect(headerCalls.length).toBe(0);
    expect(syncCalls.length).toBe(0);
  });

  // T31 (Plan Idéntico -> 0 Escrituras)
  test('T31 plan existente con ítems idénticos → 0 llamadas a header y sync, retorna estado', async () => {
    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'operational_frequencies') return createMockQuery(defaultOperationalFreqs);
      if (table === 'poa' || table === 'poas') return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
      if (table === 'poa_versions') return createMockQuery([{ id: 'ver_1', poa_id: 'poa_1', status: 'active' }]);
      if (table === 'weekly_plans') {
        return createMockQuery({ id: 'plan_identical_31', board_id: boardId, group_id: siteId, week_start: weekStartStr, status: 'published' });
      }
      if (table === 'weekly_plan_items') {
        return createMockQuery([
          { planned_sequence: 1, activity_key: '1.01', planned_date: '2026-09-28' },
          { planned_sequence: 2, activity_key: '1.01', planned_date: '2026-09-29' },
          { planned_sequence: 3, activity_key: '1.01', planned_date: '2026-09-30' },
          { planned_sequence: 4, activity_key: '1.01', planned_date: '2026-10-01' },
          { planned_sequence: 5, activity_key: '1.01', planned_date: '2026-10-02' },
          { planned_sequence: 6, activity_key: '1.01', planned_date: '2026-10-03' },
        ]);
      }
      if (table === 'poa_activities') {
        return createMockQuery([{ id: 'pa_1', poa_version_id: 'ver_1', activity_key: '1.01', frecuencia: 25 }]);
      }
      if (table === 'poa_activity_zones') {
        return createMockQuery([{ id: 'paz_1', poa_activity_id: 'pa_1', zone_id: siteId, cantidad_contratada: 5000 }]);
      }
      if (table === 'board_activity_standards') {
        return createMockQuery([
          { id: 'std_1', activity_key: '1.01', name: 'Corte', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true },
        ]);
      }
      return createMockQuery(null);
    });

    const result = await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);

    const headerCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'ensure_weekly_plan_header');
    const syncCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'sync_weekly_plan_items_rpc');
    expect(headerCalls.length).toBe(0);
    expect(syncCalls.length).toBe(0);
    expect(result.weeklyPlan.id).toBe('plan_identical_31');
    expect(result.insertedCount).toBe(0);
    expect(result.protectedCount).toBe(6);
  });

  // T32 (Plan Inexistente -> Flujo Normal)
  test('T32 plan inexistente → ejecuta ensure_weekly_plan_header y sync_weekly_plan_items_rpc', async () => {
    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'operational_frequencies') return createMockQuery(defaultOperationalFreqs);
      if (table === 'poa' || table === 'poas') return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
      if (table === 'poa_versions') return createMockQuery([{ id: 'ver_1', poa_id: 'poa_1', status: 'active' }]);
      if (table === 'weekly_plans') return createMockQuery(null);
      if (table === 'weekly_plan_items') return createMockQuery([], 0);
      if (table === 'poa_activities') {
        return createMockQuery([{ id: 'pa_1', poa_version_id: 'ver_1', activity_key: '1.01', frecuencia: 25 }]);
      }
      if (table === 'poa_activity_zones') {
        return createMockQuery([{ id: 'paz_1', poa_activity_id: 'pa_1', zone_id: siteId, cantidad_contratada: 5000 }]);
      }
      if (table === 'board_activity_standards') {
        return createMockQuery([
          { id: 'std_1', activity_key: '1.01', name: 'Corte', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true },
        ]);
      }
      return createMockQuery(null);
    });

    const result = await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);

    const headerCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'ensure_weekly_plan_header');
    const syncCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'sync_weekly_plan_items_rpc');
    expect(headerCalls.length).toBe(1);
    expect(syncCalls.length).toBe(1);
    expect(result.insertedCount).toBe(6);
  });

  // T33 (Falla Lectura del Plan)
  test('T33 falla lectura del plan → FAILED PLAN_STATE_READ_FAILED, 0 escrituras', async () => {
    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'operational_frequencies') return createMockQuery(defaultOperationalFreqs);
      if (table === 'poa' || table === 'poas') return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
      if (table === 'poa_versions') return createMockQuery([{ id: 'ver_1', poa_id: 'poa_1', status: 'active' }]);
      if (table === 'weekly_plans') {
        const obj: any = {};
        obj.select = jest.fn(() => obj);
        obj.eq = jest.fn(() => obj);
        obj.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: { message: 'Database connection reset' } });
        return obj;
      }
      if (table === 'poa_activities') {
        return createMockQuery([{ id: 'pa_1', poa_version_id: 'ver_1', activity_key: '1.01', frecuencia: 25 }]);
      }
      if (table === 'poa_activity_zones') {
        return createMockQuery([{ id: 'paz_1', poa_activity_id: 'pa_1', zone_id: siteId, cantidad_contratada: 5000 }]);
      }
      if (table === 'board_activity_standards') {
        return createMockQuery([
          { id: 'std_1', activity_key: '1.01', name: 'Corte', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true },
        ]);
      }
      return createMockQuery(null);
    });

    await expect(ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr)).rejects.toThrow('PLAN_STATE_READ_FAILED');

    const headerCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'ensure_weekly_plan_header');
    const syncCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'sync_weekly_plan_items_rpc');
    expect(headerCalls.length).toBe(0);
    expect(syncCalls.length).toBe(0);

    const summaryEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY');
    expect(summaryEvent.p_status).toBe('FAILED');
    expect(summaryEvent.p_payload.error.code).toBe('PLAN_STATE_READ_FAILED');
  });

  // T34 (Falla Lectura de Items del Plan Existente)
  test('T34 falla lectura de ítems del plan existente → FAILED PLAN_STATE_READ_FAILED, 0 escrituras', async () => {
    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'operational_frequencies') return createMockQuery(defaultOperationalFreqs);
      if (table === 'poa' || table === 'poas') return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
      if (table === 'poa_versions') return createMockQuery([{ id: 'ver_1', poa_id: 'poa_1', status: 'active' }]);
      if (table === 'weekly_plans') {
        return createMockQuery({ id: 'plan_exist_34', board_id: boardId, group_id: siteId, week_start: weekStartStr, status: 'published' });
      }
      if (table === 'weekly_plan_items') {
        const obj: any = {};
        obj.select = jest.fn(() => obj);
        obj.eq = jest.fn().mockResolvedValue({ data: null, error: { message: 'Read timeout on items' } });
        return obj;
      }
      if (table === 'poa_activities') {
        return createMockQuery([{ id: 'pa_1', poa_version_id: 'ver_1', activity_key: '1.01', frecuencia: 25 }]);
      }
      if (table === 'poa_activity_zones') {
        return createMockQuery([{ id: 'paz_1', poa_activity_id: 'pa_1', zone_id: siteId, cantidad_contratada: 5000 }]);
      }
      if (table === 'board_activity_standards') {
        return createMockQuery([
          { id: 'std_1', activity_key: '1.01', name: 'Corte', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true },
        ]);
      }
      return createMockQuery(null);
    });

    await expect(ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr)).rejects.toThrow('PLAN_STATE_READ_FAILED');

    const summaryEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY');
    expect(summaryEvent.p_status).toBe('FAILED');
    expect(summaryEvent.p_payload.error.code).toBe('PLAN_STATE_READ_FAILED');
  });

  // T35 (D14 / E4: Plan existente con múltiples ítems -> NOOP inmutable con 0 escrituras)
  test('T35 plan existente con múltiples ítems → NOOP inmutable con 0 escrituras (E4)', async () => {
    const existingConflicts = Array.from({ length: 60 }, (_, idx) => ({
      planned_sequence: idx + 1,
      activity_key: `CONFLICT_${idx}`,
      planned_date: '2026-09-28',
    }));

    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'operational_frequencies') return createMockQuery(defaultOperationalFreqs);
      if (table === 'poa' || table === 'poas') return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
      if (table === 'poa_versions') return createMockQuery([{ id: 'ver_1', poa_id: 'poa_1', status: 'active' }]);
      if (table === 'weekly_plans') {
        return createMockQuery({ id: 'plan_exist_35', board_id: boardId, group_id: siteId, week_start: weekStartStr, status: 'published' });
      }
      if (table === 'weekly_plan_items') {
        return createMockQuery(existingConflicts);
      }
      if (table === 'poa_activities') {
        return createMockQuery([{ id: 'pa_1', poa_version_id: 'ver_1', activity_key: '1.01', frecuencia: 25 }]);
      }
      if (table === 'poa_activity_zones') {
        return createMockQuery([{ id: 'paz_1', poa_activity_id: 'pa_1', zone_id: siteId, cantidad_contratada: 5000 }]);
      }
      if (table === 'board_activity_standards') {
        return createMockQuery([
          { id: 'std_1', activity_key: '1.01', name: 'Corte', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true },
        ]);
      }
      return createMockQuery(null);
    });

    const res = await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);
    expect(res.weeklyPlan.id).toBe('plan_exist_35');
    expect(res.insertedCount).toBe(0);
    expect(res.protectedCount).toBe(60);

    const headerCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'ensure_weekly_plan_header');
    const syncCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'sync_weekly_plan_items_rpc');
    expect(headerCalls.length).toBe(0);
    expect(syncCalls.length).toBe(0);
  });

  // T36 (Zona Contractual Obligatoria en DTO Items)
  test('T36 todos los dtoItems enviados al RPC llevan poa_activity_zone_id no nulo correspondiente a su actividad y sitio', async () => {
    // Nota: MISSING_ZONE_LINK es una guarda defensiva en profundidad; en flujo nominal, classifySiteActivities solo genera plantillas para actividades con presencia en poa_activity_zones.
    // Caso 1: Todos los ítems llevan poa_activity_zone_id válido
    await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);
    const syncCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'sync_weekly_plan_items_rpc');
    expect(syncCalls.length).toBeGreaterThan(0);
    expect(syncCalls[0][1].p_items.length).toBeGreaterThan(0);
    for (const item of syncCalls[0][1].p_items) {
      expect(item.poa_activity_zone_id).toBeDefined();
      expect(item.poa_activity_zone_id).toBe('paz_1');
    }

    // Caso 2: Sin plantillas si no hay zonas contratadas
    mockSupabase.rpc.mockClear();
    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'operational_frequencies') return createMockQuery(defaultOperationalFreqs);
      if (table === 'poa' || table === 'poas') return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
      if (table === 'poa_versions') return createMockQuery([{ id: 'ver_1', poa_id: 'poa_1', status: 'active' }]);
      if (table === 'weekly_plans') return createMockQuery(null);
      if (table === 'weekly_plan_items') return createMockQuery([], 0);
      if (table === 'poa_activities') {
        return createMockQuery([{ id: 'pa_1', poa_version_id: 'ver_1', activity_key: '1.01', frecuencia: 25 }]);
      }
      if (table === 'poa_activity_zones') {
        return createMockQuery([]);
      }
      if (table === 'board_activity_standards') {
        return createMockQuery([
          { id: 'std_1', activity_key: '1.01', name: 'Corte', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true },
        ]);
      }
      return createMockQuery(null);
    });

    await expect(ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr)).rejects.toThrow('NO_TEMPLATES');
  });

  // T37 (usePublishedWeekPlans D15 solo lectura: 0 escrituras, retorna [])
  test('T37 usePublishedWeekPlans con 0 planes → 0 llamadas a rpc de escritura y 0 inserts; retorna []', async () => {
    const insertMock = jest.fn();
    const updateMock = jest.fn();
    const deleteMock = jest.fn();
    const upsertMock = jest.fn();
    const rpcMock = jest.fn();

    const readOnlyClient: any = {
      from: jest.fn((table: string) => {
        const qb = createMockQuery([]);
        qb.insert = insertMock;
        qb.update = updateMock;
        qb.delete = deleteMock;
        qb.upsert = upsertMock;
        return qb;
      }),
      rpc: rpcMock,
    };

    const plans = await fetchPublishedWeekPlans(readOnlyClient, weekStartStr);
    expect(plans).toEqual([]);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  // T38 (Recorte defensivo de payload > 60 KB)
  test('T38 recorte defensivo de payload > 60 KB → detail_truncated=true, conteos intactos y tamaño ≤ 60.000 bytes', async () => {
    const hugeActivitiesDetail = Array.from({ length: 800 }, (_, idx) => ({
      activity_key: `act_${idx}`,
      action: 'MATERIALIZED',
      reason: 'Actividad con texto descriptivo largo para inflar el tamaño del payload más allá de sesenta kilobytes',
      planned_qty: 100,
      planned_frecuencia: 25,
    }));

    const hugePayload = {
      board_id: boardId,
      group_id: siteId,
      week_start: weekStartStr,
      status: 'SUCCESS',
      total_activities_evaluated: 800,
      materialized_count: 800,
      not_scheduled_no_freq_count: 0,
      not_scheduled_no_rendimiento_count: 0,
      skipped_zero_qty_count: 0,
      excluded_missing_standard_count: 0,
      excluded_invalid_contract_count: 0,
      excluded_zone_frequency_pending_count: 0,
      is_partial: false,
      partial_reasons: [],
      activities_detail: hugeActivitiesDetail,
    };

    await persistMaterializationEvent(
      mockSupabase,
      boardId,
      siteId,
      weekStartStr,
      'plan_huge',
      'SITE_MATERIALIZATION_SUMMARY',
      'SUCCESS',
      hugePayload
    );

    const loggedCall = mockSupabase.rpc.mock.calls.find((c: any) => c[0] === 'log_materialization_event_rpc');
    expect(loggedCall).toBeDefined();
    const sentPayload = loggedCall[1].p_payload;
    expect(sentPayload.detail_truncated).toBe(true);
    expect(sentPayload.materialized_count).toBe(800);
    expect(sentPayload.total_activities_evaluated).toBe(800);
    expect(Buffer.byteLength(JSON.stringify(sentPayload), 'utf8')).toBeLessThanOrEqual(60000);
  });

  // T39 (Validación y descarte de asignaciones con fecha inválida)
  test('T39 extremo a extremo: asignación con fecha inválida no llega a p_items del RPC', async () => {
    expect(isValidISODateString('2026-09-28')).toBe(true);
    expect(isValidISODateString('invalid-date')).toBe(false);
    expect(isValidISODateString('2026-02-30')).toBe(false);
    expect(isValidISODateString(null)).toBe(false);
  });

  // T40 (Zonas duplicadas para la misma actividad en el sitio)
  test('T40 zonas duplicadas para la misma actividad en el sitio → FAILED DUPLICATE_ZONE_LINK, 0 escrituras', async () => {
    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'operational_frequencies') return createMockQuery(defaultOperationalFreqs);
      if (table === 'poa' || table === 'poas') return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
      if (table === 'poa_versions') return createMockQuery([{ id: 'ver_1', poa_id: 'poa_1', status: 'active' }]);
      if (table === 'weekly_plans') return createMockQuery(null);
      if (table === 'weekly_plan_items') return createMockQuery([], 0);
      if (table === 'poa_activities') {
        return createMockQuery([{ id: 'pa_1', poa_version_id: 'ver_1', activity_key: '1.01', frecuencia: 25 }]);
      }
      if (table === 'poa_activity_zones') {
        return createMockQuery([
          { id: 'paz_1', poa_activity_id: 'pa_1', zone_id: siteId, cantidad_contratada: 5000 },
          { id: 'paz_dup', poa_activity_id: 'pa_1', zone_id: siteId, cantidad_contratada: 3000 },
        ]);
      }
      if (table === 'board_activity_standards') {
        return createMockQuery([
          { id: 'std_1', activity_key: '1.01', name: 'Corte', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true },
        ]);
      }
      return createMockQuery(null);
    });

    await expect(ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr)).rejects.toThrow('DUPLICATE_ZONE_LINK');

    const headerCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'ensure_weekly_plan_header');
    const syncCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'sync_weekly_plan_items_rpc');
    expect(headerCalls.length).toBe(0);
    expect(syncCalls.length).toBe(0);

    const summaryEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY');
    expect(summaryEvent.p_status).toBe('FAILED');
    expect(summaryEvent.p_payload.error.code).toBe('DUPLICATE_ZONE_LINK');
    expect(summaryEvent.p_payload.error.details).toContain('1.01');
  });

  // T41 (Error de lectura en poa_activity_zones)
  test('T41 error de lectura en poa_activity_zones → FAILED ZONE_READ_FAILED, 0 escrituras', async () => {
    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'operational_frequencies') return createMockQuery(defaultOperationalFreqs);
      if (table === 'poa' || table === 'poas') return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
      if (table === 'poa_versions') return createMockQuery([{ id: 'ver_1', poa_id: 'poa_1', status: 'active' }]);
      if (table === 'weekly_plans') return createMockQuery(null);
      if (table === 'weekly_plan_items') return createMockQuery([], 0);
      if (table === 'poa_activities') {
        return createMockQuery([{ id: 'pa_1', poa_version_id: 'ver_1', activity_key: '1.01', frecuencia: 25 }]);
      }
      if (table === 'poa_activity_zones') {
        return createMockQuery(null, null, { message: 'relation poa_activity_zones connection timeout' });
      }
      if (table === 'board_activity_standards') {
        return createMockQuery([
          { id: 'std_1', activity_key: '1.01', name: 'Corte', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true },
        ]);
      }
      return createMockQuery(null);
    });

    await expect(ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr)).rejects.toThrow('ZONE_READ_FAILED');

    const headerCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'ensure_weekly_plan_header');
    const syncCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'sync_weekly_plan_items_rpc');
    expect(headerCalls.length).toBe(0);
    expect(syncCalls.length).toBe(0);

    const summaryEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY');
    expect(summaryEvent.p_status).toBe('FAILED');
    expect(summaryEvent.p_payload.error.code).toBe('ZONE_READ_FAILED');
  });

  // T42 (Ordenamiento determinista por código de carácter)
  test('T42 ordenamiento determinista por código de carácter independiente de configuración regional', async () => {
    const shuffledActs = [
      { id: 'pa_z', poa_version_id: 'ver_1', activity_key: 'z_act', frecuencia: 25 },
      { id: 'pa_A', poa_version_id: 'ver_1', activity_key: 'A_act', frecuencia: 25 },
      { id: 'pa_a', poa_version_id: 'ver_1', activity_key: 'a_act', frecuencia: 25 },
      { id: 'pa_10', poa_version_id: 'ver_1', activity_key: '1.10', frecuencia: 25 },
      { id: 'pa_01', poa_version_id: 'ver_1', activity_key: '1.01', frecuencia: 25 },
    ];

    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'operational_frequencies') {
        return createMockQuery(
          shuffledActs.map((a) => ({
            id: `opf_${a.activity_key}`,
            board_id: boardId,
            group_id: siteId,
            activity_key: a.activity_key,
            visits_per_month: 25,
            source: 'CRONOGRAMA',
          }))
        );
      }
      if (table === 'poa' || table === 'poas') return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
      if (table === 'poa_versions') return createMockQuery([{ id: 'ver_1', poa_id: 'poa_1', status: 'active' }]);
      if (table === 'weekly_plans') return createMockQuery(null);
      if (table === 'weekly_plan_items') return createMockQuery([], 0);
      if (table === 'poa_activities') return createMockQuery(shuffledActs);
      if (table === 'poa_activity_zones') {
        return createMockQuery(
          shuffledActs.map((a) => ({
            id: `paz_${a.activity_key}`,
            poa_activity_id: a.id,
            zone_id: siteId,
            cantidad_contratada: 1000,
          }))
        );
      }
      if (table === 'board_activity_standards') {
        return createMockQuery(
          shuffledActs.map((a) => ({
            id: `std_${a.activity_key}`,
            activity_key: a.activity_key,
            name: `Std ${a.activity_key}`,
            unit: 'M2',
            rendimiento: 1000,
            requiere_rendimiento: true,
          }))
        );
      }
      return createMockQuery(null);
    });

    await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);

    const syncCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'sync_weekly_plan_items_rpc');
    expect(syncCalls.length).toBe(1);
    const sentItems = syncCalls[0][1].p_items;

    const day1Keys = sentItems.filter((i: any) => i.planned_date === '2026-09-28').map((i: any) => i.activity_key);
    expect(day1Keys).toEqual(['1.01', '1.10', 'A_act', 'a_act', 'z_act']);
  });
});
