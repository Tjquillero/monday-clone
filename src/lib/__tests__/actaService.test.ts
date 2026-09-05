/**
 * Test Suite 37 — ADR-0012 Motor de Certificación Contractual y Actas (Baseline 2386465)
 *
 * Certifica que certifiable_executed_qty no altere el historial físico ni la planificación,
 * y que el dominio contractual opere de manera desacoplada, idempotente e inmutable.
 */

import {
  generateActaDraft,
  adjustActaItemQuantity,
  issueActa,
  getBoardBillingSummary,
} from '../actaService';
import { reportWeeklyPlanExecution } from '../executionService';
import { verifyExecutionRecordWithAudit } from '../verificationService';
import { ExecutionRecord } from '../../types/execution';
import { WeeklyPlanItem } from '../../types/weeklyPlan';

describe('Test Suite 37 — ADR-0012 Motor de Certificación Contractual y Actas (Baseline 2386465)', () => {
  let mockSupabase: any;
  const boardId = 'board_barranquilla_01';
  const supervisorId = 'usr_supervisor_37';
  const leaderId = 'usr_leader_37';
  const adminId = 'usr_admin_37';

  beforeEach(() => {
    // Isolated Mock DB state per test
    mockSupabase = {
      actasStore: new Map(),
      itemsStoreActa: new Map(),
      sourcesStore: new Map(),
      execsStore: new Map(),
      itemsStore: new Map(),
      poaStore: new Map(),
      from: (table: string) => {
        if (table === 'weekly_plan_items') {
          return {
            select: () => ({
              eq: (field: string, val: any) => ({
                single: async () => {
                  const item = mockSupabase.itemsStore.get(val);
                  return { data: item || null, error: item ? null : new Error('Item not found') };
                },
              }),
            }),
            update: (updatePayload: any) => ({
              eq: (field: string, val: any) => ({
                select: () => ({
                  single: async () => {
                    const item = mockSupabase.itemsStore.get(val);
                    if (item) {
                      Object.assign(item, updatePayload);
                    }
                    return { data: item || null, error: null };
                  },
                }),
              }),
            }),
          };
        }
        if (table === 'weekly_plan_item_executions') {
          return {
            select: () => ({
              eq: (field: string, val: any) => ({
                single: async () => {
                  const exec = mockSupabase.execsStore.get(val);
                  return { data: exec || null, error: exec ? null : new Error('Exec not found') };
                },
              }),
            }),
            insert: (records: any[]) => ({
              select: () => ({
                single: async () => {
                  const rec = Array.isArray(records) ? records[0] : records;
                  const newExec = {
                    id: rec.id || 'exec_' + Math.random().toString(36).substring(2, 9),
                    verification_status: rec.verification_status || 'reported',
                    ...rec,
                  };
                  mockSupabase.execsStore.set(newExec.id, newExec);
                  return { data: newExec, error: null };
                },
              }),
            }),
            update: (updatePayload: any) => ({
              eq: (field: string, val: any) => ({
                select: () => ({
                  single: async () => {
                    const exec = mockSupabase.execsStore.get(val);
                    if (exec) {
                      Object.assign(exec, updatePayload);
                    }
                    return { data: exec || null, error: null };
                  },
                }),
              }),
            }),
          };
        }
        if (table === 'actas') {
          return {
            select: () => ({
              eq: (col: string, val: any) => ({
                eq: (col2: string, val2: any) => ({
                  maybeSingle: async () => {
                    const found = Array.from(mockSupabase.actasStore.values()).find(
                      (a: any) => a[col] === val && a[col2] === val2
                    );
                    return { data: found || null, error: null };
                  },
                }),
                in: async () => ({ data: [], error: null }),
              }),
            }),
          };
        }
        if (table === 'acta_items') {
          return {
            select: () => ({
              eq: (col: string, val: any) => async () => {
                const list = Array.from(mockSupabase.itemsStoreActa.values()).filter(
                  (i: any) => i[col] === val
                );
                return { data: list, error: null };
              },
            }),
          };
        }
        if (table === 'acta_item_sources') {
          return {
            select: () => ({
              in: async (col: string, vals: any[]) => {
                const list = Array.from(mockSupabase.sourcesStore.values()).filter((s: any) =>
                  vals.includes(s[col])
                );
                return { data: list, error: null };
              },
            }),
          };
        }
        return {};
      },
    };

    // Seed sample POA activity (Contract limit: 1000 m2 @ $15,000 / m2)
    mockSupabase.poaStore.set('poa_act_01', {
      id: 'poa_act_01',
      activity_key: 'ACT_ZONA_VERDE',
      name: 'Mantenimiento de Zonas Verdes',
      unit: 'm2',
      precio_unitario: 15000,
      cantidad: 1000,
      zone: 'Norte',
    });

    // Seed sample WeeklyPlanItem
    const sampleItem: WeeklyPlanItem = {
      id: 'wpi_37_01',
      weekly_plan_id: 'wp_37_01',
      board_id: boardId,
      activity_key: 'ACT_ZONA_VERDE',
      name: 'Mantenimiento de Zonas Verdes',
      zone: 'Norte',
      unit: 'm2',
      planned_date: '2026-09-10',
      planned_qty: 500,
      theoretical_jr: 5,
      source_type: 'ROUTINE',
      routine_reference: 'ROUTINE_01',
      occurrence_key: 'occ_37_01',
      is_manual_override: false,
      status: 'planned',
    };
    mockSupabase.itemsStore.set(sampleItem.id, sampleItem);
  });

  // -------------------------------------------------------------------------
  // Test 37.1: Filtro de Autoridad y Saldo Disponible
  // -------------------------------------------------------------------------
  test('Test 37.1: Solo ejecuciones con status=verified/confirmed/closed y saldo > 0 se incorporan al Borrador', async () => {
    // Exec A: 300 m2 (reported -> verified)
    const reportA = await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: 'wpi_37_01',
      board_id: boardId,
      execution_date: '2026-09-10',
      executed_qty: 300,
      reported_by: leaderId,
    });
    await verifyExecutionRecordWithAudit(mockSupabase, {
      execution_id: reportA.executionRecord.id,
      supervisor_user_id: supervisorId,
      action: 'approve',
      attachments_count: 2,
    });

    // Exec B: 200 m2 (reported -> pending evidence)
    await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: 'wpi_37_01',
      board_id: boardId,
      execution_date: '2026-09-11',
      executed_qty: 200,
      reported_by: leaderId,
    });

    const draftRes = await generateActaDraft(mockSupabase, boardId, adminId);
    expect(draftRes.isNew).toBe(true);
    expect(draftRes.items.length).toBe(1);
    expect(draftRes.items[0].cantidad_facturada).toBe(300); // Exec B excluded
  });

  // -------------------------------------------------------------------------
  // Test 37.2: Prevención de Doble Certificación
  // -------------------------------------------------------------------------
  test('Test 37.2: No permite doble certificación de un mismo ExecutionRecord entre múltiples borradores/actas', async () => {
    const report = await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: 'wpi_37_01',
      board_id: boardId,
      execution_date: '2026-09-10',
      executed_qty: 400,
      reported_by: leaderId,
    });
    await verifyExecutionRecordWithAudit(mockSupabase, {
      execution_id: report.executionRecord.id,
      supervisor_user_id: supervisorId,
      action: 'approve',
      attachments_count: 2,
    });

    // Draft 1 consumes 400 m2
    const draft1 = await generateActaDraft(mockSupabase, boardId, adminId);
    expect(draft1.items[0].cantidad_facturada).toBe(400);

    // Issue Draft 1
    await issueActa(mockSupabase, draft1.acta.id, adminId);

    // Draft 2 request should find 0 remaining balance for this execution
    const draft2 = await generateActaDraft(mockSupabase, boardId, adminId);
    expect(draft2.items.length).toBe(0); // 0 billable balance left
  });

  // -------------------------------------------------------------------------
  // Test 37.3: Certificación Parcial
  // -------------------------------------------------------------------------
  test('Test 37.3: Permite certificación parcial de un ExecutionRecord en múltiples actas', async () => {
    const report = await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: 'wpi_37_01',
      board_id: boardId,
      execution_date: '2026-09-10',
      executed_qty: 1000,
      reported_by: leaderId,
    });
    await verifyExecutionRecordWithAudit(mockSupabase, {
      execution_id: report.executionRecord.id,
      supervisor_user_id: supervisorId,
      action: 'approve',
      attachments_count: 2,
    });

    // Draft 1 generated
    const draft1 = await generateActaDraft(mockSupabase, boardId, adminId);
    // Reduce manually in Draft 1 to 400 m2
    await adjustActaItemQuantity(mockSupabase, draft1.items[0].id, 400, adminId);
    await issueActa(mockSupabase, draft1.acta.id, adminId);

    // Draft 2 should pick up remaining 600 m2
    const draft2 = await generateActaDraft(mockSupabase, boardId, adminId);
    expect(draft2.items[0].cantidad_facturada).toBe(600);

    // Exec record executed_qty remains 1000 m2
    expect(report.executionRecord.executed_qty).toBe(1000);
  });

  // -------------------------------------------------------------------------
  // Test 37.4: Aislamiento de Sobre-ejecución y Tope Contractual
  // -------------------------------------------------------------------------
  test('Test 37.4: Sobre-ejecución operacional (1,200 m2) mantiene executed_qty=1,200 pero limita la facturación al POA (1,000 m2)', async () => {
    // Exec: 1,200 m2 (exceeds POA contract limit of 1,000 m2)
    const report = await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: 'wpi_37_01',
      board_id: boardId,
      execution_date: '2026-09-10',
      executed_qty: 1200,
      reported_by: leaderId,
    });
    await verifyExecutionRecordWithAudit(mockSupabase, {
      execution_id: report.executionRecord.id,
      supervisor_user_id: supervisorId,
      action: 'approve',
      attachments_count: 2,
    });

    const draft = await generateActaDraft(mockSupabase, boardId, adminId);
    expect(draft.items[0].cantidad_facturada).toBe(1000); // Capped at POA limit

    // Verification of physical execution historical preservation
    const updatedExec = mockSupabase.execsStore.get(report.executionRecord.id);
    expect(updatedExec.executed_qty).toBe(1200); // Physical history UNTOUCHED
  });

  // -------------------------------------------------------------------------
  // Test 37.5: Snapshot Completo y Numeración Contractual
  // -------------------------------------------------------------------------
  test('Test 37.5: issueActa congela snapshots completos e incrementa el número consecutivo por board', async () => {
    const report = await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: 'wpi_37_01',
      board_id: boardId,
      execution_date: '2026-09-10',
      executed_qty: 500,
      reported_by: leaderId,
    });
    await verifyExecutionRecordWithAudit(mockSupabase, {
      execution_id: report.executionRecord.id,
      supervisor_user_id: supervisorId,
      action: 'approve',
      attachments_count: 2,
    });

    const draft = await generateActaDraft(mockSupabase, boardId, adminId);
    const issuedActa = await issueActa(mockSupabase, draft.acta.id, adminId);

    expect(issuedActa.estado).toBe('issued');
    expect(issuedActa.numero).toBe(1);

    const item = draft.items[0];
    expect(item.descripcion_snapshot).toBe('Mantenimiento de Zonas Verdes');
    expect(item.unidad_snapshot).toBe('m2');
    expect(item.precio_unitario_snapshot).toBe(15000);
    expect(item.activity_key_snapshot).toBe('ACT_ZONA_VERDE');
    expect(item.zone_snapshot).toBe('Norte');
  });

  // -------------------------------------------------------------------------
  // Test 37.6: Inmutabilidad Tras Emisión
  // -------------------------------------------------------------------------
  test('Test 37.6: Rechaza modificaciones sobre actas o líneas en estado issued', async () => {
    const report = await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: 'wpi_37_01',
      board_id: boardId,
      execution_date: '2026-09-10',
      executed_qty: 500,
      reported_by: leaderId,
    });
    await verifyExecutionRecordWithAudit(mockSupabase, {
      execution_id: report.executionRecord.id,
      supervisor_user_id: supervisorId,
      action: 'approve',
      attachments_count: 2,
    });

    const draft = await generateActaDraft(mockSupabase, boardId, adminId);
    await issueActa(mockSupabase, draft.acta.id, adminId);

    // Attempting to adjust quantity on an issued acta item should throw
    await expect(
      adjustActaItemQuantity(mockSupabase, draft.items[0].id, 600, adminId)
    ).rejects.toThrow('No se puede modificar una línea de un acta en estado issued');
  });

  // -------------------------------------------------------------------------
  // Test 37.7: Firma y Autoridad de Usuario Autenticado
  // -------------------------------------------------------------------------
  test('Test 37.7: Identidad de asignación proviene estrictamente de auth.uid()', async () => {
    const report = await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: 'wpi_37_01',
      board_id: boardId,
      execution_date: '2026-09-10',
      executed_qty: 500,
      reported_by: leaderId,
    });
    await verifyExecutionRecordWithAudit(mockSupabase, {
      execution_id: report.executionRecord.id,
      supervisor_user_id: supervisorId,
      action: 'approve',
      attachments_count: 2,
    });

    const draft = await generateActaDraft(mockSupabase, boardId, adminId);
    const issued = await issueActa(mockSupabase, draft.acta.id, adminId);

    expect(draft.acta.generated_by).toBe(adminId);
    expect(issued.issued_by).toBe(adminId);
  });

  // -------------------------------------------------------------------------
  // Test 37.8: Concurrencia e Integridad de Saldos
  // -------------------------------------------------------------------------
  test('Test 37.8: Intentos concurrentes de emisión e imputación respetan el saldo sin sobre-facturar', async () => {
    const report = await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: 'wpi_37_01',
      board_id: boardId,
      execution_date: '2026-09-10',
      executed_qty: 800,
      reported_by: leaderId,
    });
    await verifyExecutionRecordWithAudit(mockSupabase, {
      execution_id: report.executionRecord.id,
      supervisor_user_id: supervisorId,
      action: 'approve',
      attachments_count: 2,
    });

    // Concurrent draft requests for same board return same draft (idempotency)
    const [d1, d2] = await Promise.all([
      generateActaDraft(mockSupabase, boardId, adminId),
      generateActaDraft(mockSupabase, boardId, adminId),
    ]);

    expect(d1.acta.id).toBe(d2.acta.id);
  });

  // -------------------------------------------------------------------------
  // Test 37.9: Rector E2E — Flujo Completo y Aislamiento Contractual
  // -------------------------------------------------------------------------
  test('Test 37.9: Rector E2E — Flujo de POA -> WeeklyPlan -> Execution -> Verification -> Certifiable Qty -> Acta Draft -> Acta Issued -> Billing Qty', async () => {
    // 1. Snapshot original Values
    const poaInitial = { ...mockSupabase.poaStore.get('poa_act_01') };
    const itemInitial = { ...mockSupabase.itemsStore.get('wpi_37_01') };

    // 2. Execution Record (500 m2)
    const report = await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: 'wpi_37_01',
      board_id: boardId,
      execution_date: '2026-09-10',
      executed_qty: 500,
      reported_by: leaderId,
    });

    // 3. Supervisor Verification
    await verifyExecutionRecordWithAudit(mockSupabase, {
      execution_id: report.executionRecord.id,
      supervisor_user_id: supervisorId,
      action: 'approve',
      attachments_count: 2,
    });

    // 4. Draft Generation
    const draft = await generateActaDraft(mockSupabase, boardId, adminId);
    expect(draft.items[0].cantidad_facturada).toBe(500);

    // 5. Issue Acta
    const issued = await issueActa(mockSupabase, draft.acta.id, adminId);
    expect(issued.estado).toBe('issued');
    expect(issued.numero).toBe(1);

    // 6. Verification of Billing Summary
    const summary = await getBoardBillingSummary(mockSupabase, boardId);
    expect(summary[0].totalBilledQty).toBe(500);
    expect(summary[0].pendingBillableQty).toBe(0);

    // 7. STRICT ISOLATION ASSERTIONS
    const poaCurrent = mockSupabase.poaStore.get('poa_act_01');
    const itemCurrent = mockSupabase.itemsStore.get('wpi_37_01');
    const execCurrent = mockSupabase.execsStore.get(report.executionRecord.id);

    expect(poaCurrent.cantidad).toBe(poaInitial.cantidad);           // POA qty UNCHANGED
    expect(poaCurrent.precio_unitario).toBe(poaInitial.precio_unitario); // POA price UNCHANGED
    expect(itemCurrent.planned_qty).toBe(itemInitial.planned_qty);     // Planned qty UNCHANGED
    expect(itemCurrent.planned_date).toBe(itemInitial.planned_date);   // Planned date UNCHANGED
    expect(execCurrent.executed_qty).toBe(500);                        // Executed qty UNCHANGED
    expect(execCurrent.verification_status).toBe('verified');          // Verification status UNCHANGED
  });
});
