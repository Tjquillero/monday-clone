/**
 * Test Suite 35: Operational Field Execution Records & Verification Lifecycle (ADR-0009)
 * Baseline Governance Certification: 2386465
 */

import {
  calculateExecutionMetrics,
  ExecutionRecord,
} from '../../types/execution';
import { WeeklyPlanItem } from '../../types/weeklyPlan';
import {
  reportWeeklyPlanExecution,
  verifyWeeklyPlanExecution,
  getWeeklyPlanItemExecutionSummary,
} from '../executionService';

// Mock Supabase client for in-memory DB execution testing
function createMockSupabaseClient() {
  const itemsStore = new Map<string, WeeklyPlanItem>();
  const execsStore = new Map<string, ExecutionRecord>();

  return {
    itemsStore,
    execsStore,

    from(table: string) {
      if (table === 'weekly_plan_items') {
        return {
          select() {
            return {
              eq(field: string, val: any) {
                return {
                  single: async () => {
                    const item = itemsStore.get(val);
                    return { data: item || null, error: item ? null : new Error('Item not found') };
                  },
                };
              },
            };
          },
          update(updatePayload: any) {
            return {
              eq(field: string, val: any) {
                return {
                  select() {
                    return {
                      single: async () => {
                        const item = itemsStore.get(val);
                        if (item) {
                          Object.assign(item, updatePayload);
                        }
                        return { data: item || null, error: null };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === 'weekly_plan_item_executions') {
        return {
          select(fields?: string) {
            return {
              eq(field: string, val: any) {
                const list = Array.from(execsStore.values()).filter((e) => {
                  if (field === 'weekly_plan_item_id') return e.weekly_plan_item_id === val;
                  if (field === 'id') return e.id === val;
                  return true;
                });
                if (field === 'id') {
                  return {
                    single: async () => {
                      const item = execsStore.get(val);
                      return { data: item || null, error: item ? null : new Error('Execution not found') };
                    },
                  };
                }
                return Promise.resolve({ data: list, error: null });
              },
            };
          },
          insert(input: any) {
            return {
              select() {
                return {
                  single: async () => {
                    const newExec: ExecutionRecord = {
                      id: `exec-${Math.random().toString(36).substring(2, 9)}`,
                      weekly_plan_item_id: input.weekly_plan_item_id,
                      board_id: input.board_id,
                      group_id: input.group_id || null,
                      execution_date: input.execution_date,
                      executed_qty: input.executed_qty,
                      worker_count: input.worker_count || 1,
                      hours_worked: input.hours_worked || 8,
                      jornales_used: (input.worker_count || 1) * (input.hours_worked || 8) / 8.0,
                      reported_by: input.reported_by,
                      verified_by: input.verified_by || null,
                      verified_at: input.verified_at || null,
                      rejection_reason: input.rejection_reason || null,
                      verification_status: input.verification_status || 'reported',
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    };
                    execsStore.set(newExec.id, newExec);
                    return { data: newExec, error: null };
                  },
                };
              },
            };
          },
          update(updatePayload: any) {
            return {
              eq(field: string, val: any) {
                return {
                  select() {
                    return {
                      single: async () => {
                        const exec = execsStore.get(val);
                        if (exec) {
                          Object.assign(exec, updatePayload);
                        }
                        return { data: exec || null, error: null };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }

      throw new Error(`Unhandled table: ${table}`);
    },
  };
}

describe('Test Suite 35 — ADR-0009 Ejecución Operativa de Campo (Baseline 2386465)', () => {
  const boardId = 'board-puerto-colombia-001';
  const leaderId = 'user-leader-01';
  const supervisorId = 'user-supervisor-01';

  let mockSupabase: any;
  let samplePlanItem: WeeklyPlanItem;

  beforeEach(() => {
    mockSupabase = createMockSupabaseClient();
    samplePlanItem = {
      id: 'item-poda-001',
      weekly_plan_id: 'plan-sep-1',
      board_id: boardId,
      group_id: 'group-plaza-001',
      activity_key: 'poda_arbustos',
      name: 'Poda Arbustos y CS',
      zone: 'Zona Verde',
      unit: 'm2/día',
      planned_date: '2026-09-10',
      planned_qty: 1850,
      theoretical_jr: 3.08,
      source_type: 'ROUTINE',
      routine_reference: 'poda_arbustos',
      occurrence_key: 'occ-poda-001',
      is_manual_override: false,
      status: 'planned',
    };
    mockSupabase.itemsStore.set(samplePlanItem.id, samplePlanItem);
  });

  // -------------------------------------------------------------------------
  // Test 35.1: Primer reporte conmuta 'planned' a 'in_progress'
  // -------------------------------------------------------------------------
  test('Test 35.1: Primer reporte de ejecución conmuta el estado de planned a in_progress', async () => {
    const result = await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: samplePlanItem.id,
      board_id: boardId,
      execution_date: '2026-09-10',
      executed_qty: 600,
      reported_by: leaderId,
    });

    expect(result.parentItem.status).toBe('in_progress');
    expect(result.executionRecord.executed_qty).toBe(600);
    expect(result.metrics.totalReportedQty).toBe(600);
    expect(result.metrics.certifiableExecutedQty).toBe(0); // Aún no verificado
  });

  // -------------------------------------------------------------------------
  // Test 35.2: Acumulación de Múltiples Ejecuciones Parciales
  // -------------------------------------------------------------------------
  test('Test 35.2: Múltiples ejecuciones parciales se acumulan sin sobreescribir el historial', async () => {
    await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: samplePlanItem.id,
      board_id: boardId,
      execution_date: '2026-09-10',
      executed_qty: 700,
      reported_by: leaderId,
    });

    await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: samplePlanItem.id,
      board_id: boardId,
      execution_date: '2026-09-11',
      executed_qty: 500,
      reported_by: leaderId,
    });

    const summary = await getWeeklyPlanItemExecutionSummary(mockSupabase, samplePlanItem.id);
    expect(summary.executions).toHaveLength(2);
    expect(summary.metrics.totalReportedQty).toBe(1200);
  });

  // -------------------------------------------------------------------------
  // Test 35.3: Solo Ejecuciones Verificadas Suman para Certificación
  // -------------------------------------------------------------------------
  test('Test 35.3: Únicamente ejecuciones con status=verified suman para certifiableExecutedQty', async () => {
    const exec1 = await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: samplePlanItem.id,
      board_id: boardId,
      execution_date: '2026-09-10',
      executed_qty: 1000,
      reported_by: leaderId,
    });

    await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: samplePlanItem.id,
      board_id: boardId,
      execution_date: '2026-09-11',
      executed_qty: 850,
      reported_by: leaderId,
    });

    // Aprobar solo la primera ejecución
    await verifyWeeklyPlanExecution(mockSupabase, exec1.executionRecord.id, supervisorId, true);

    const summary = await getWeeklyPlanItemExecutionSummary(mockSupabase, samplePlanItem.id);
    expect(summary.metrics.totalReportedQty).toBe(1850);
    expect(summary.metrics.certifiableExecutedQty).toBe(1000);
    expect(summary.metrics.pendingVerificationQty).toBe(850);
    expect(summary.item.status).toBe('in_progress'); // No ha completado certifiable >= 1850
  });

  // -------------------------------------------------------------------------
  // Test 35.4: Alcanzar Meta con Evidencia Verificada Conmuta a 'completed'
  // -------------------------------------------------------------------------
  test('Test 35.4: Alcanzar certifiableExecutedQty >= planned_qty conmuta estado a completed', async () => {
    const exec1 = await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: samplePlanItem.id,
      board_id: boardId,
      execution_date: '2026-09-10',
      executed_qty: 1000,
      reported_by: leaderId,
    });

    const exec2 = await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: samplePlanItem.id,
      board_id: boardId,
      execution_date: '2026-09-11',
      executed_qty: 850,
      reported_by: leaderId,
    });

    // Supervisor aprueba ambas ejecuciones
    await verifyWeeklyPlanExecution(mockSupabase, exec1.executionRecord.id, supervisorId, true);
    const finalVerify = await verifyWeeklyPlanExecution(mockSupabase, exec2.executionRecord.id, supervisorId, true);

    expect(finalVerify.metrics.certifiableExecutedQty).toBe(1850);
    expect(finalVerify.parentItem.status).toBe('completed');
  });

  // -------------------------------------------------------------------------
  // Test 35.5: Evidencia Rechazada o Pendiente Impide 'completed'
  // -------------------------------------------------------------------------
  test('Test 35.5: Si una ejecución es rechazada, no cuenta para el certifiable ni completa el ítem', async () => {
    const exec1 = await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: samplePlanItem.id,
      board_id: boardId,
      execution_date: '2026-09-10',
      executed_qty: 1000,
      reported_by: leaderId,
    });

    const exec2 = await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: samplePlanItem.id,
      board_id: boardId,
      execution_date: '2026-09-11',
      executed_qty: 850,
      reported_by: leaderId,
    });

    await verifyWeeklyPlanExecution(mockSupabase, exec1.executionRecord.id, supervisorId, true);
    await verifyWeeklyPlanExecution(mockSupabase, exec2.executionRecord.id, supervisorId, false, 'Fotos desenfocadas');

    const summary = await getWeeklyPlanItemExecutionSummary(mockSupabase, samplePlanItem.id);
    expect(summary.metrics.certifiableExecutedQty).toBe(1000);
    expect(summary.item.status).toBe('in_progress');
  });

  // -------------------------------------------------------------------------
  // Test 35.6: Inmutabilidad de la Planificación Histórica
  // -------------------------------------------------------------------------
  test('Test 35.6: Los datos planificados (planned_qty, planned_date) son inmutables tras ejecución', async () => {
    await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: samplePlanItem.id,
      board_id: boardId,
      execution_date: '2026-09-10',
      executed_qty: 1200,
      reported_by: leaderId,
    });

    const item = mockSupabase.itemsStore.get(samplePlanItem.id);
    expect(item.planned_qty).toBe(1850);
    expect(item.planned_date).toBe('2026-09-10');
  });

  // -------------------------------------------------------------------------
  // Test 35.7: Regla Estricta de Sobre-Ejecución (over_executed_qty sin mutar POA)
  // -------------------------------------------------------------------------
  test('Test 35.7: Sobre-ejecución calcula over_executed_qty de forma transparente sin alterar planned_qty', async () => {
    const exec1 = await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: samplePlanItem.id,
      board_id: boardId,
      execution_date: '2026-09-10',
      executed_qty: 2000, // Excede los 1850 planificados
      reported_by: leaderId,
    });

    await verifyWeeklyPlanExecution(mockSupabase, exec1.executionRecord.id, supervisorId, true);

    const summary = await getWeeklyPlanItemExecutionSummary(mockSupabase, samplePlanItem.id);
    expect(summary.metrics.certifiableExecutedQty).toBe(2000);
    expect(summary.metrics.overExecutedQty).toBe(150);
    expect(summary.metrics.contractualCertifiableQty).toBe(1850); // Clavado al tope planificado para billing
    expect(summary.item.planned_qty).toBe(1850); // Plan intacto
  });

  // -------------------------------------------------------------------------
  // Test 35.8: Desacoplamiento de Máquinas de Estados (Item Status vs Exec Status)
  // -------------------------------------------------------------------------
  test('Test 35.8: Independencia entre máquinas de estados del ítem y de la ejecución', async () => {
    const exec1 = await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: samplePlanItem.id,
      board_id: boardId,
      execution_date: '2026-09-10',
      executed_qty: 500,
      reported_by: leaderId,
    });

    expect(samplePlanItem.status).toBe('in_progress');
    expect(exec1.executionRecord.verification_status).toBe('reported');

    await verifyWeeklyPlanExecution(mockSupabase, exec1.executionRecord.id, supervisorId, true);

    const execAfter = mockSupabase.execsStore.get(exec1.executionRecord.id);
    expect(execAfter.verification_status).toBe('verified');
    expect(samplePlanItem.status).toBe('in_progress'); // Aún in_progress porque faltan m2
  });

  // -------------------------------------------------------------------------
  // Test 35.9: Test Rector Integrador E2E (Plan -> Execution -> Verification -> Completed)
  // -------------------------------------------------------------------------
  test('Test 35.9: Rector E2E — Flujo completo de planificación a verificación y completitud', async () => {
    // 1. Reportar primera jornada parcial
    const e1 = await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: samplePlanItem.id,
      board_id: boardId,
      execution_date: '2026-09-10',
      executed_qty: 1000,
      reported_by: leaderId,
    });
    expect(e1.parentItem.status).toBe('in_progress');

    // 2. Reportar segunda jornada que completa los 1850 m2
    const e2 = await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: samplePlanItem.id,
      board_id: boardId,
      execution_date: '2026-09-11',
      executed_qty: 850,
      reported_by: leaderId,
    });

    // 3. Supervisor verifica e1 y e2
    await verifyWeeklyPlanExecution(mockSupabase, e1.executionRecord.id, supervisorId, true);
    const finalState = await verifyWeeklyPlanExecution(mockSupabase, e2.executionRecord.id, supervisorId, true);

    expect(finalState.parentItem.status).toBe('completed');
    expect(finalState.metrics.certifiableExecutedQty).toBe(1850);
    expect(finalState.metrics.contractualCertifiableQty).toBe(1850);
  });

  // -------------------------------------------------------------------------
  // Test 35.10: Control de Concurrencia en Reportes Simultáneos
  // -------------------------------------------------------------------------
  test('Test 35.10: Concurrencia — Múltiples líderes reportando en paralelo acumulan correctamente', async () => {
    const p1 = reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: samplePlanItem.id,
      board_id: boardId,
      execution_date: '2026-09-10',
      executed_qty: 1000,
      reported_by: 'leader-a',
    });

    const p2 = reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: samplePlanItem.id,
      board_id: boardId,
      execution_date: '2026-09-10',
      executed_qty: 850,
      reported_by: 'leader-b',
    });

    const [res1, res2] = await Promise.all([p1, p2]);

    const summary = await getWeeklyPlanItemExecutionSummary(mockSupabase, samplePlanItem.id);
    expect(summary.executions).toHaveLength(2);
    expect(summary.metrics.totalReportedQty).toBe(1850);
    expect(summary.item.status).toBe('in_progress');
  });
});
