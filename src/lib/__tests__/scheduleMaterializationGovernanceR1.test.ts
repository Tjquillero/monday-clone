/**
 * Test Suite: Gobernanza e Integridad de la Materialización (R1-b0 + R1-c)
 * Especificación: docs/gates/R1-b0_R1-c_SPEC.md v4.2 + Decisiones D1-D11
 *
 * Casos T01 a T20 certificados con Mocks de Supabase (Cero llamadas a BD real).
 */

import { ensureWeeklyPlanMaterialized } from '../scheduleMaterializationService';
import { materializeWeeklyPlanForTrigger } from '../myWorkSurfaceTriggerService';
import { isValidISODateString, persistMaterializationEvent } from '../materialization/siteActivityClassifier';
import { syncWeeklyPlanForBoard } from '../weeklyPlanService';
import { materializeAllSites } from '../../hooks/useWeeklyPlans';

jest.mock('../weeklyPlanService', () => {
  const actual = jest.requireActual('../weeklyPlanService');
  return {
    __esModule: true,
    ...actual,
    syncWeeklyPlanForBoard: jest.fn().mockResolvedValue({ success: true, count: 1 }),
  };
});

describe('Gobernanza R1-b0 + R1-c: Materialización e Integridad de Planes Semanales', () => {
  const boardId = 'board_test_r1';
  const siteId = 'site_test_r1';
  const weekStartStr = '2026-09-28';

  let mockSupabase: any;
  let loggedEvents: any[] = [];

  function createMockQuery(data: any = null, count?: number) {
    const obj: any = {};
    obj.select = jest.fn(() => obj);
    obj.eq = jest.fn(() => obj);
    obj.is = jest.fn(() => obj);
    obj.in = jest.fn(() => obj);
    obj.order = jest.fn(() => obj);
    obj.limit = jest.fn(() => obj);
    obj.or = jest.fn(() => obj);
    obj.maybeSingle = jest.fn().mockResolvedValue({ data, error: null });
    obj.single = jest.fn().mockResolvedValue({ data, error: null });
    obj.then = (resolve: any) =>
      Promise.resolve({ data, count: count ?? (Array.isArray(data) ? data.length : 0), error: null }).then(resolve);
    return obj;
  }

  beforeEach(() => {
    loggedEvents = [];
    (syncWeeklyPlanForBoard as jest.Mock).mockClear();

    mockSupabase = {
      from: jest.fn((table: string) => {
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
            { poa_activity_id: 'pa_1', zone_id: siteId, cantidad_contratada: 5000 },
            { poa_activity_id: 'pa_2', zone_id: siteId, cantidad_contratada: 15000 },
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
  test('T01 frecuencia NULL → NOT_SCHEDULED_NO_PERIODIC_FREQ, plan no PARCIAL, el ítem no se envía al RPC', async () => {
    const result = await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);
    expect(result.insertedCount).toBeGreaterThan(0);

    // Verificar llamada a sync_weekly_plan_items_rpc
    const syncCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'sync_weekly_plan_items_rpc');
    expect(syncCalls.length).toBe(1);
    const sentItems = syncCalls[0][1].p_items;
    // 3.14 no debe estar en los items enviados al RPC
    expect(sentItems.some((i: any) => i.activity_key === '3.14')).toBe(false);
    // 1.01 sí debe estar
    expect(sentItems.some((i: any) => i.activity_key === '1.01')).toBe(true);

    // Verificar evento SITE_MATERIALIZATION_SUMMARY
    const summaryEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY');
    expect(summaryEvent).toBeDefined();
    expect(summaryEvent.p_status).toBe('SUCCESS');
    expect(summaryEvent.p_payload.is_partial).toBe(false);
    expect(summaryEvent.p_payload.not_scheduled_no_freq_count).toBe(1);

    const detail314 = summaryEvent.p_payload.activities_detail.find((a: any) => a.activity_key === '3.14');
    expect(detail314).toBeDefined();
    expect(detail314.action).toBe('NOT_SCHEDULED_NO_PERIODIC_FREQ');
    expect(detail314.frequency_source).toBe('NONE');
  });

  // T02
  test('T02 frecuencia NaN o <=0 → EXCLUDED_INVALID_CONTRACT, PARCIAL', async () => {
    mockSupabase.from = jest.fn((table: string) => {
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
          { poa_activity_id: 'pa_1', zone_id: siteId, cantidad_contratada: 5000 },
          { poa_activity_id: 'pa_inv', zone_id: siteId, cantidad_contratada: 1000 },
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
          { poa_activity_id: 'pa_1', zone_id: siteId, cantidad_contratada: 5000 },
          { poa_activity_id: 'pa_orphan', zone_id: siteId, cantidad_contratada: 1000 },
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
          { poa_activity_id: 'pa_1', zone_id: siteId, cantidad_contratada: 5000 },
          { poa_activity_id: 'pa_admin', zone_id: siteId, cantidad_contratada: 1 },
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
          { poa_activity_id: 'pa_1', zone_id: siteId, cantidad_contratada: 5000 },
          { poa_activity_id: 'pa_zero', zone_id: siteId, cantidad_contratada: 0 },
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
    expect(summaryEvent.p_payload.skipped_zero_qty_count).toBe(1);
    const detailZero = summaryEvent.p_payload.activities_detail.find((a: any) => a.activity_key === '1.10');
    expect(detailZero.action).toBe('SKIPPED_ZERO_QTY');
  });

  // T06
  test('T06 error de ensure_weekly_plan_header → FAILED, syncWeeklyPlanForBoard NO llamado', async () => {
    mockSupabase.rpc = jest.fn((rpcName: string, params: any) => {
      if (rpcName === 'ensure_weekly_plan_header') {
        return Promise.resolve({ data: null, error: { code: '23503', message: 'Foreign key violation on boards' } });
      }
      if (rpcName === 'log_materialization_event_rpc') {
        loggedEvents.push(params);
        return Promise.resolve({ data: 'evt_err_header', error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    await expect(ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr)).rejects.toThrow();

    // D4: syncWeeklyPlanForBoard NO llamado
    expect(syncWeeklyPlanForBoard).not.toHaveBeenCalled();

    // Evento FAILED registrado (único evento FAILED per M1)
    const failedEvents = loggedEvents.filter((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY' && e.p_status === 'FAILED');
    expect(failedEvents.length).toBe(1);
    expect(failedEvents[0].p_payload.error.stage).toBe('header');
  });

  // T07
  test('T07 error de sync_weekly_plan_items_rpc → FAILED, sin fallback', async () => {
    mockSupabase.rpc = jest.fn((rpcName: string, params: any) => {
      if (rpcName === 'ensure_weekly_plan_header') {
        return Promise.resolve({ data: 'plan_header_123', error: null });
      }
      if (rpcName === 'sync_weekly_plan_items_rpc') {
        return Promise.resolve({ data: null, error: { code: '23502', message: 'NOT NULL violation planned_frecuencia' } });
      }
      if (rpcName === 'log_materialization_event_rpc') {
        loggedEvents.push(params);
        return Promise.resolve({ data: 'evt_err_sync', error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    await expect(ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr)).rejects.toThrow();
    expect(syncWeeklyPlanForBoard).not.toHaveBeenCalled();

    const failedEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY' && e.p_status === 'FAILED');
    expect(failedEvent).toBeDefined();
    expect(failedEvent.p_payload.error.stage).toBe('sync');
  });

  // T08
  test('T08 excepción → FAILED, sin fallback', async () => {
    mockSupabase.rpc = jest.fn((rpcName: string, params: any) => {
      if (rpcName === 'ensure_weekly_plan_header') {
        return Promise.reject(new Error('Network connection timeout'));
      }
      if (rpcName === 'log_materialization_event_rpc') {
        loggedEvents.push(params);
        return Promise.resolve({ data: 'evt_exception', error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    await expect(ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr)).rejects.toThrow('Network connection timeout');
    expect(syncWeeklyPlanForBoard).not.toHaveBeenCalled();

    const failedEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY' && e.p_status === 'FAILED');
    expect(failedEvent).toBeDefined();
    expect(failedEvent.p_payload.error.stage).toBe('exception');
  });

  // T09
  test('T09 gId nulo → MISSING_GROUP_ID, ni el RPC ni syncWeeklyPlanForBoard llamados', async () => {
    await expect(ensureWeeklyPlanMaterialized(mockSupabase, boardId, null, weekStartStr)).rejects.toThrow('MISSING_GROUP_ID');
    expect(syncWeeklyPlanForBoard).not.toHaveBeenCalled();

    const headerRpcCalls = mockSupabase.rpc.mock.calls.filter((c: any) => c[0] === 'ensure_weekly_plan_header');
    expect(headerRpcCalls.length).toBe(0);

    const failedEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY' && e.p_status === 'FAILED');
    expect(failedEvent).toBeDefined();
  });

  // T10
  test('T10 el RPC devuelve menos filas de las esperadas → WEEKLY_PLAN_ITEMS_GATEWAY_DROPPED', async () => {
    mockSupabase.rpc = jest.fn((rpcName: string, params: any) => {
      if (rpcName === 'ensure_weekly_plan_header') {
        return Promise.resolve({ data: 'plan_header_123', error: null });
      }
      if (rpcName === 'sync_weekly_plan_items_rpc') {
        // Devuelve vacío simulando descarte en Gateway
        return Promise.resolve({ data: [], error: null });
      }
      if (rpcName === 'log_materialization_event_rpc') {
        loggedEvents.push(params);
        return Promise.resolve({ data: 'evt_drop', error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);

    const droppedEvent = loggedEvents.find((e) => e.p_event_type === 'WEEKLY_PLAN_ITEMS_GATEWAY_DROPPED');
    expect(droppedEvent).toBeDefined();
    expect(droppedEvent.p_status).toBe('PARTIAL');
    expect(droppedEvent.p_payload.missing_sequences.length).toBeGreaterThan(0);

    // M2: El resumen pasa a PARTIAL
    const summaryEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY');
    expect(summaryEvent).toBeDefined();
    expect(summaryEvent.p_status).toBe('PARTIAL');
    expect(summaryEvent.p_payload.partial_reasons.some((r: string) => r.includes('WEEKLY_PLAN_ITEMS_GATEWAY_DROPPED'))).toBe(true);
  });

  // T11
  test('T11 secuencia existente con otro activity_key → SEQUENCE_IDENTITY_CONFLICT', async () => {
    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'poa' || table === 'poas') return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
      if (table === 'poa_versions') return createMockQuery([{ id: 'poa_v10', poa_id: 'poa_1', status: 'active' }]);
      if (table === 'weekly_plan_items') {
        return createMockQuery([
          { planned_sequence: 1, activity_key: 'OLD_KEY_CONFLICT', planned_date: '2026-09-28' },
        ]);
      }
      if (table === 'poa_activities') {
        return createMockQuery([{ id: 'pa_1', poa_version_id: 'poa_v10', activity_key: '1.01', frecuencia: 25 }]);
      }
      if (table === 'poa_activity_zones') {
        return createMockQuery([{ poa_activity_id: 'pa_1', zone_id: siteId, cantidad_contratada: 5000 }]);
      }
      if (table === 'board_activity_standards') {
        return createMockQuery([
          { id: 'std_1', activity_key: '1.01', name: 'Corte', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true },
        ]);
      }
      return createMockQuery(null);
    });

    await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);

    const conflictEvent = loggedEvents.find((e) => e.p_event_type === 'SEQUENCE_IDENTITY_CONFLICT');
    expect(conflictEvent).toBeDefined();
    expect(conflictEvent.p_payload.planned_sequence).toBe(1);
    expect(conflictEvent.p_payload.sent_key).toBe('1.01');
    expect(conflictEvent.p_payload.existing_key).toBe('OLD_KEY_CONFLICT');

    // M2: El resumen pasa a PARTIAL
    const summaryEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY');
    expect(summaryEvent.p_status).toBe('PARTIAL');
  });

  // T12 (M5)
  test('T12 un sitio lanza error y el siguiente se materializa igual (D6 probado vía materializeAllSites)', async () => {
    const boards = [{ id: boardId }];
    const groups = [
      { id: 'site_failing', title: 'Sitio 1 Fallido', board_id: boardId },
      { id: 'site_success', title: 'Sitio 2 Exitoso', board_id: boardId },
    ];

    const mockClient: any = {
      from: jest.fn((table: string) => {
        if (table === 'poa' || table === 'poas') return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
        if (table === 'poa_versions') return createMockQuery([{ id: 'poa_v1', poa_id: 'poa_1', status: 'active' }]);
        if (table === 'poa_activities') {
          return createMockQuery([{ id: 'pa_1', poa_version_id: 'poa_v1', activity_key: '1.01', frecuencia: 25 }]);
        }
        if (table === 'poa_activity_zones') {
          return createMockQuery([{ poa_activity_id: 'pa_1', zone_id: 'site_success', cantidad_contratada: 5000 }]);
        }
        if (table === 'board_activity_standards') {
          return createMockQuery([
            { id: 'std_1', activity_key: '1.01', name: 'Corte', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true },
          ]);
        }
        return createMockQuery(null);
      }),
      rpc: jest.fn((rpcName: string, params: any) => {
        if (params?.p_group_id === 'site_failing') {
          return Promise.reject(new Error('Fallo crítico de conexión en sitio fallido'));
        }
        if (rpcName === 'ensure_weekly_plan_header') return Promise.resolve({ data: 'plan_succ_1', error: null });
        if (rpcName === 'sync_weekly_plan_items_rpc') return Promise.resolve({ data: [{ planned_sequence: 1 }], error: null });
        if (rpcName === 'log_materialization_event_rpc') return Promise.resolve({ data: 'evt_1', error: null });
        return Promise.resolve({ data: null, error: null });
      }),
    };

    const res = await materializeAllSites(mockClient, boards, groups, weekStartStr);

    expect(res.failedCount).toBe(1);
    expect(res.successfulCount).toBe(1);
  });

  // T13
  test('T13 POA activo y cero plantillas → FAILED NO_TEMPLATES, catálogo V3 no usado, header no llamado', async () => {
    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'poa' || table === 'poas') return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
      if (table === 'poa_versions') return createMockQuery([{ id: 'poa_v10', poa_id: 'poa_1', status: 'active' }]);
      if (table === 'poa_activities') {
        return createMockQuery([{ id: 'pa_null', poa_version_id: 'poa_v10', activity_key: '1.15', frecuencia: null }]);
      }
      if (table === 'poa_activity_zones') {
        return createMockQuery([{ poa_activity_id: 'pa_null', zone_id: siteId, cantidad_contratada: 1000 }]);
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
        return Promise.resolve({ data: [{ planned_sequence: 1, activity_key: '1.01' }], error: null });
      }
      if (rpcName === 'log_materialization_event_rpc') {
        return Promise.reject(new Error('Database connectivity error logging event'));
      }
      return Promise.resolve({ data: null, error: null });
    });

    const result = await ensureWeeklyPlanMaterialized(mockSupabase, boardId, siteId, weekStartStr);
    expect(result.weeklyPlan.id).toBe('plan_header_123');
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  // T15 (M3)
  test('T15 payload > 60 KB → detail_truncated=true y contadores intactos', async () => {
    const manyDetails = Array.from({ length: 1500 }, (_, i) => ({
      activity_key: `act_clave_muy_larga_${i}`,
      action: 'MATERIALIZED',
      reason: 'Extensive payload testing description with accents and special characters áéíóú ñññ to simulate 60KB+ payload size',
      frequency_source: 'POA',
    }));

    const hugePayload = {
      board_id: boardId,
      group_id: siteId,
      week_start: weekStartStr,
      total_activities_evaluated: 1500,
      materialized_count: 1500,
      activities_detail: manyDetails,
    };

    await persistMaterializationEvent(
      mockSupabase,
      boardId,
      siteId,
      weekStartStr,
      'plan_123',
      'SITE_MATERIALIZATION_SUMMARY',
      'SUCCESS',
      hugePayload
    );

    const logged = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY');
    expect(logged).toBeDefined();
    expect(logged.p_payload.detail_truncated).toBe(true);
    expect(logged.p_payload.total_activities_evaluated).toBe(1500);
    expect(logged.p_payload.activities_detail.length).toBeLessThan(1500);

    const byteLen = Buffer.byteLength(JSON.stringify(logged.p_payload), 'utf8');
    expect(byteLen).toBeLessThanOrEqual(60000);
  });

  // T16
  test('T16 fecha inválida → no se envía (round-trip)', () => {
    expect(isValidISODateString('2026-09-28')).toBe(true);
    expect(isValidISODateString('2026-02-30')).toBe(false);
    expect(isValidISODateString('2026-13-01')).toBe(false);
    expect(isValidISODateString('invalid-date')).toBe(false);
    expect(isValidISODateString(null)).toBe(false);
  });

  // T17 (M5: Covers T01 and T02)
  test('T17 myWorkSurfaceTriggerService usa el mismo clasificador (T01 y T02 aplicados por esa vía)', async () => {
    mockSupabase.from = jest.fn((table: string) => {
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
          { id: 'pa_2', poa_version_id: 'poa_v10', activity_key: '1.15', frecuencia: null }, // T01: frecuencia NULL
          { id: 'pa_3', poa_version_id: 'poa_v10', activity_key: '1.99', frecuencia: -10 },  // T02: frecuencia <= 0
        ]);
      }
      if (table === 'poa_activity_zones') {
        return createMockQuery([
          { poa_activity_id: 'pa_1', zone_id: siteId, cantidad_contratada: 5000 },
          { poa_activity_id: 'pa_2', zone_id: siteId, cantidad_contratada: 1000 },
          { poa_activity_id: 'pa_3', zone_id: siteId, cantidad_contratada: 2000 },
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
    // T01: 1.15 (freq null) no se envía al RPC
    expect(sentItems.some((i: any) => i.activity_key === '1.15')).toBe(false);
    // T02: 1.99 (freq <= 0) no se envía al RPC
    expect(sentItems.some((i: any) => i.activity_key === '1.99')).toBe(false);
    // 1.01 válida sí se envía
    expect(sentItems.some((i: any) => i.activity_key === '1.01')).toBe(true);

    // T02: Plan marcado PARTIAL en telemetría
    const summaryEvent = loggedEvents.find((e) => e.p_event_type === 'SITE_MATERIALIZATION_SUMMARY');
    expect(summaryEvent).toBeDefined();
    expect(summaryEvent.p_status).toBe('PARTIAL');
  });

  // T18 (B1)
  test('T18 POA activo sin fila de zona + resource_analysis con cantidad → no materializa (NO_TEMPLATES)', async () => {
    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'poa' || table === 'poas') return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
      if (table === 'poa_versions') return createMockQuery([{ id: 'poa_v10', poa_id: 'poa_1', status: 'active' }]);
      if (table === 'poa_activities') {
        return createMockQuery([{ id: 'pa_1', poa_version_id: 'poa_v10', activity_key: '1.01', frecuencia: 25 }]);
      }
      if (table === 'poa_activity_zones') {
        // Sin filas para siteId
        return createMockQuery([]);
      }
      if (table === 'board_activity_standards') {
        return createMockQuery([
          { id: 'std_1', activity_key: '1.01', name: 'Corte', unit: 'M2', rendimiento: 1000, requiere_rendimiento: true },
        ]);
      }
      if (table === 'resource_analysis') {
        // RA tiene cantidad residual pero B1 prohíbe usarla con POA activo
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
      if (table === 'poa' || table === 'poas') return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
      if (table === 'poa_versions') return createMockQuery([{ id: 'poa_v10', poa_id: 'poa_1', status: 'active' }]);
      if (table === 'poa_activities') {
        return createMockQuery([
          { id: 'pa_site1', poa_version_id: 'poa_v10', activity_key: '1.01', frecuencia: 25 },
          { id: 'pa_other_site', poa_version_id: 'poa_v10', activity_key: '2.01', frecuencia: 10 },
        ]);
      }
      if (table === 'poa_activity_zones') {
        // Solo 1.01 pertenece a siteId; 2.01 pertenece a other_site
        return createMockQuery([
          { poa_activity_id: 'pa_site1', zone_id: siteId, cantidad_contratada: 5000 },
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
    // 2.01 no debe figurar en activities_detail porque no tiene fila en poa_activity_zones para este sitio
    expect(summaryEvent.p_payload.activities_detail.some((a: any) => a.activity_key === '2.01')).toBe(false);
    expect(summaryEvent.p_payload.activities_detail.some((a: any) => a.activity_key === '1.01')).toBe(true);
    expect(summaryEvent.p_payload.total_activities_evaluated).toBe(1);
  });

  // T20 (D11)
  test('T20 tablero sin POA activo → falla cerrado con NO_ACTIVE_POA', async () => {
    mockSupabase.from = jest.fn((table: string) => {
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

  // T21 (D12)
  test('T21 1.15 con frecuencia NULL y cantidad > 0 → EXCLUDED_ZONE_FREQUENCY_PENDING, plan PARCIAL, no se envía al RPC, motivo en partial_reasons', async () => {
    mockSupabase.from = jest.fn((table: string) => {
      if (table === 'poa' || table === 'poas') return createMockQuery([{ id: 'poa_1', board_id: boardId }]);
      if (table === 'poa_versions') return createMockQuery([{ id: 'poa_v10', poa_id: 'poa_1', status: 'active' }]);
      if (table === 'poa_activities') {
        return createMockQuery([
          { id: 'pa_1', poa_version_id: 'poa_v10', activity_key: '1.01', frecuencia: 25 },
          { id: 'pa_2', poa_version_id: 'poa_v10', activity_key: '1.15', frecuencia: null },
        ]);
      }
      if (table === 'poa_activity_zones') {
        return createMockQuery([
          { poa_activity_id: 'pa_1', zone_id: siteId, cantidad_contratada: 5000 },
          { poa_activity_id: 'pa_2', zone_id: siteId, cantidad_contratada: 15000 },
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
    expect(summaryEvent.p_payload.excluded_zone_frequency_pending_count).toBe(1);

    const detail115 = summaryEvent.p_payload.activities_detail.find((a: any) => a.activity_key === '1.15');
    expect(detail115).toBeDefined();
    expect(detail115.action).toBe('EXCLUDED_ZONE_FREQUENCY_PENDING');
    expect(detail115.reason).toBe('Frecuencia por zona pendiente de carga (POA V.10, FREQ-SITE-01)');
    expect(summaryEvent.p_payload.partial_reasons).toContain('1.15: Frecuencia por zona pendiente de carga (POA V.10, FREQ-SITE-01)');
  });

  // T22 (D12)
  test('T22 3.14 con frecuencia NULL → NOT_SCHEDULED_NO_PERIODIC_FREQ, plan NO parcial', async () => {
    mockSupabase.from = jest.fn((table: string) => {
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
          { poa_activity_id: 'pa_1', zone_id: siteId, cantidad_contratada: 5000 },
          { poa_activity_id: 'pa_2', zone_id: siteId, cantidad_contratada: 1000 },
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
          return createMockQuery(allActs.filter((a) => a.poa_version_id === val));
        });
        return obj;
      }
      if (table === 'poa_activity_zones') {
        return createMockQuery([
          { poa_activity_id: 'pa_prod_101', zone_id: siteId, cantidad_contratada: 5000 },
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
    expect(sentItems.length).toBe(1);
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
});
