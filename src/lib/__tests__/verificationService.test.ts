/**
 * Test Suite 36: Evidence Verification & Operational Certification Engine (ADR-0011)
 * Baseline Governance Certification: 2386465
 */

import { ExecutionRecord } from '../../types/execution';
import { WeeklyPlan, WeeklyPlanItem } from '../../types/weeklyPlan';
import { computeCertifiableMetrics, isWeeklyPlanEligibleForConfirmation } from '../../types/verification';
import { verifyExecutionRecordWithAudit, confirmWeeklyPlanPackageWithAudit } from '../verificationService';
import { reportWeeklyPlanExecution } from '../executionService';

function createMockSupabaseClient() {
  const plansStore = new Map<string, WeeklyPlan>();
  const itemsStore = new Map<string, WeeklyPlanItem>();
  const execsStore = new Map<string, ExecutionRecord>();

  return {
    plansStore,
    itemsStore,
    execsStore,

    from(table: string) {
      if (table === 'weekly_plans') {
        return {
          select(fields?: string) {
            return {
              eq(field: string, val: any) {
                return {
                  single: async () => {
                    const plan = plansStore.get(val);
                    return { data: plan || null, error: plan ? null : new Error('WeeklyPlan not found') };
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
                        const plan = plansStore.get(val);
                        if (plan) {
                          Object.assign(plan, updatePayload);
                        }
                        return { data: plan || null, error: null };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === 'weekly_plan_items') {
        return {
          select(fields?: string) {
            return {
              eq(field: string, val: any) {
                const list = Array.from(itemsStore.values()).filter((item) => item.weekly_plan_id === val);
                return {
                  single: async () => {
                    const item = itemsStore.get(val);
                    return { data: item || null, error: item ? null : new Error('Item not found') };
                  },
                  then(resolve: any) {
                    resolve({ data: list, error: null });
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
                  if (field === 'board_id') return e.board_id === val;
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

describe('Test Suite 36 — ADR-0011 Motor de Verificación y Certificación (Baseline 2386465)', () => {
  const boardId = 'board-puerto-colombia-001';
  const groupId = 'group-plaza-001';
  const leaderId = 'user-leader-01';
  const supervisorId = 'user-supervisor-01';

  let mockSupabase: any;
  let samplePlan: WeeklyPlan;
  let sampleItem: WeeklyPlanItem;

  beforeEach(() => {
    mockSupabase = createMockSupabaseClient();

    samplePlan = {
      id: 'plan-sep-1',
      board_id: boardId,
      group_id: groupId,
      week_start_date: '2026-09-07',
      week_end_date: '2026-09-13',
      status: 'in_progress',
    };

    sampleItem = {
      id: 'item-poda-001',
      weekly_plan_id: samplePlan.id,
      board_id: boardId,
      group_id: groupId,
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
      status: 'in_progress',
    };

    mockSupabase.plansStore.set(samplePlan.id, samplePlan);
    mockSupabase.itemsStore.set(sampleItem.id, sampleItem);
  });

  // -------------------------------------------------------------------------
  // Test 36.1: Evidencia Obligatoria antes de Verified
  // -------------------------------------------------------------------------
  test('Test 36.1: Intentar verificar sin fotos obligatorias mueve el estado a evidence_pending', async () => {
    const report = await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: sampleItem.id,
      board_id: boardId,
      execution_date: '2026-09-10',
      executed_qty: 1000,
      reported_by: leaderId,
    });

    const verifyResult = await verifyExecutionRecordWithAudit(mockSupabase, {
      execution_id: report.executionRecord.id,
      supervisor_user_id: supervisorId,
      action: 'approve',
      attachments_count: 0, // Faltan fotos
    });

    expect(verifyResult.updatedExecution.verification_status).toBe('evidence_pending');
    expect(verifyResult.metrics.certifiableExecutedQty).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Test 36.2: Solo Verified Suma a certifiableExecutedQty
  // -------------------------------------------------------------------------
  test('Test 36.2: Únicamente ejecuciones en verified o superiores suman a certifiableExecutedQty', async () => {
    const report1 = await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: sampleItem.id,
      board_id: boardId,
      execution_date: '2026-09-10',
      executed_qty: 1000,
      reported_by: leaderId,
    });

    await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: sampleItem.id,
      board_id: boardId,
      execution_date: '2026-09-11',
      executed_qty: 850,
      reported_by: leaderId,
    });

    // Supervisor aprueba únicamente report1 con fotos completas
    const verify1 = await verifyExecutionRecordWithAudit(mockSupabase, {
      execution_id: report1.executionRecord.id,
      supervisor_user_id: supervisorId,
      action: 'approve',
      attachments_count: 2,
    });

    expect(verify1.metrics.totalReportedQty).toBe(1850);
    expect(verify1.metrics.certifiableExecutedQty).toBe(1000);
    expect(verify1.metrics.pendingVerificationQty).toBe(850);
    expect(verify1.parentItem.status).toBe('in_progress'); // No completado aún
  });

  // -------------------------------------------------------------------------
  // Test 36.3: Inmutabilidad por Protección de Estados Terminales
  // -------------------------------------------------------------------------
  test('Test 36.3: Registros en estado confirmed o closed rechazan rechazos directos por UPDATE', async () => {
    const report = await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: sampleItem.id,
      board_id: boardId,
      execution_date: '2026-09-10',
      executed_qty: 1850,
      reported_by: leaderId,
    });

    const verify = await verifyExecutionRecordWithAudit(mockSupabase, {
      execution_id: report.executionRecord.id,
      supervisor_user_id: supervisorId,
      action: 'approve',
      attachments_count: 2,
    });

    // Cambiar artificialmente a 'confirmed'
    verify.updatedExecution.verification_status = 'confirmed';
    mockSupabase.execsStore.set(verify.updatedExecution.id, verify.updatedExecution);

    // Intentar rechazar directo debe fallar
    await expect(
      verifyExecutionRecordWithAudit(mockSupabase, {
        execution_id: verify.updatedExecution.id,
        supervisor_user_id: supervisorId,
        action: 'reject',
        note_or_reason: 'Error posterior',
      })
    ).rejects.toThrow('protected state');
  });

  // -------------------------------------------------------------------------
  // Test 36.4: Rechazo Auditable sin Borrado Físico
  // -------------------------------------------------------------------------
  test('Test 36.4: El rechazo cambia verification_status=rejected y no elimina el registro de la BD', async () => {
    const report = await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: sampleItem.id,
      board_id: boardId,
      execution_date: '2026-09-10',
      executed_qty: 500,
      reported_by: leaderId,
    });

    const rejectResult = await verifyExecutionRecordWithAudit(mockSupabase, {
      execution_id: report.executionRecord.id,
      supervisor_user_id: supervisorId,
      action: 'reject',
      note_or_reason: 'Trabajo mal ejecutado y fotos borrosas',
    });

    expect(rejectResult.updatedExecution.verification_status).toBe('rejected');
    expect(rejectResult.updatedExecution.rejected_by).toBe(supervisorId);
    expect(rejectResult.updatedExecution.rejection_reason).toBe('Trabajo mal ejecutado y fotos borrosas');

    // Registro físico sigue existiendo en BD
    expect(mockSupabase.execsStore.has(report.executionRecord.id)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 36.5: Inmutabilidad de executed_qty en Rechazo
  // -------------------------------------------------------------------------
  test('Test 36.5: Rechazar mantiene los 500 m2 reportados en el historial pero otorga 0 m2 certificables', async () => {
    const report = await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: sampleItem.id,
      board_id: boardId,
      execution_date: '2026-09-10',
      executed_qty: 500,
      reported_by: leaderId,
    });

    const rejectResult = await verifyExecutionRecordWithAudit(mockSupabase, {
      execution_id: report.executionRecord.id,
      supervisor_user_id: supervisorId,
      action: 'reject',
      note_or_reason: 'Mala calidad',
    });

    expect(rejectResult.updatedExecution.executed_qty).toBe(500); // 500 m2 intactos en historial
    expect(rejectResult.metrics.certifiableExecutedQty).toBe(0);   // 0 m2 certificables
    expect(rejectResult.metrics.rejectedExecutedQty).toBe(500);   // 500 m2 rechazados agregados
  });

  // -------------------------------------------------------------------------
  // Test 36.6: Corrección Auditable Genera Nuevo ExecutionRecord
  // -------------------------------------------------------------------------
  test('Test 36.6: La corrección de un rechazo crea un nuevo ExecutionRecord conservando la traza anterior', async () => {
    // 1. Reporte 1 rechazado
    const r1 = await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: sampleItem.id,
      board_id: boardId,
      execution_date: '2026-09-10',
      executed_qty: 500,
      reported_by: leaderId,
    });
    await verifyExecutionRecordWithAudit(mockSupabase, {
      execution_id: r1.executionRecord.id,
      supervisor_user_id: supervisorId,
      action: 'reject',
      note_or_reason: 'Fotos desenfocadas',
    });

    // 2. Líder vuelve a reportar la corrección
    const r2 = await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: sampleItem.id,
      board_id: boardId,
      execution_date: '2026-09-11',
      executed_qty: 500,
      reported_by: leaderId,
    });
    const verify2 = await verifyExecutionRecordWithAudit(mockSupabase, {
      execution_id: r2.executionRecord.id,
      supervisor_user_id: supervisorId,
      action: 'approve',
      attachments_count: 2,
    });

    expect(mockSupabase.execsStore.size).toBe(2);
    expect(verify2.metrics.totalReportedQty).toBe(1000);
    expect(verify2.metrics.certifiableExecutedQty).toBe(500);
    expect(verify2.metrics.rejectedExecutedQty).toBe(500);
  });

  // -------------------------------------------------------------------------
  // Test 36.7: Cierre del Paquete Semanal (WeeklyPlan -> confirmed)
  // -------------------------------------------------------------------------
  test('Test 36.7: WeeklyPlan conmuta a confirmed solo cuando 0 ejecuciones están pendientes y plan completado/cancelado', async () => {
    sampleItem.status = 'completed'; // Marcar item como completed para cumplir la regla 2 de plan

    const r1 = await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: sampleItem.id,
      board_id: boardId,
      execution_date: '2026-09-10',
      executed_qty: 1850,
      reported_by: leaderId,
    });

    // Intentar confirmar sin verificar debe fallar
    await expect(
      confirmWeeklyPlanPackageWithAudit(mockSupabase, samplePlan.id, supervisorId)
    ).rejects.toThrow('ejecuciones pendientes de verificación');

    // Supervisor aprueba ejecuciones
    await verifyExecutionRecordWithAudit(mockSupabase, {
      execution_id: r1.executionRecord.id,
      supervisor_user_id: supervisorId,
      action: 'approve',
      attachments_count: 2,
    });

    // Ahora la confirmación del paquete es exitosa
    const confirmResult = await confirmWeeklyPlanPackageWithAudit(mockSupabase, samplePlan.id, supervisorId);
    expect(confirmResult.weeklyPlan.status).toBe('confirmed');
    expect(confirmResult.confirmedExecutionsCount).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Test 36.8: Test Rector de Aislamiento Contractual Total
  // -------------------------------------------------------------------------
  test('Test 36.8: Rector — La verificación no altera POA, planned_jr ni genera facturación directa', async () => {
    const report = await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: sampleItem.id,
      board_id: boardId,
      execution_date: '2026-09-10',
      executed_qty: 1850,
      reported_by: leaderId,
    });

    const verify = await verifyExecutionRecordWithAudit(mockSupabase, {
      execution_id: report.executionRecord.id,
      supervisor_user_id: supervisorId,
      action: 'approve',
      attachments_count: 2,
    });

    expect(verify.updatedExecution).not.toHaveProperty('poa_contract_price');
    expect(verify.updatedExecution).not.toHaveProperty('billing_claim_id');
    expect(sampleItem.planned_qty).toBe(1850);
  });

  // -------------------------------------------------------------------------
  // Test 36.9: Rector Integrador E2E Completo
  // -------------------------------------------------------------------------
  test('Test 36.9: Rector E2E — Flujo de Reporte -> Evidencia -> Verificación -> Certificación -> Confirmación', async () => {
    // 1. Reportar avance de campo
    const r1 = await reportWeeklyPlanExecution(mockSupabase, {
      weekly_plan_item_id: sampleItem.id,
      board_id: boardId,
      execution_date: '2026-09-10',
      executed_qty: 1850,
      reported_by: leaderId,
    });
    expect(r1.parentItem.status).toBe('in_progress');

    // 2. Verificar evidencia fotográfica y aprobar
    const v1 = await verifyExecutionRecordWithAudit(mockSupabase, {
      execution_id: r1.executionRecord.id,
      supervisor_user_id: supervisorId,
      action: 'approve',
      attachments_count: 2,
    });
    expect(v1.metrics.certifiableExecutedQty).toBe(1850);
    expect(v1.parentItem.status).toBe('completed');

    // 3. Confirmar paquete semanal
    const c1 = await confirmWeeklyPlanPackageWithAudit(mockSupabase, samplePlan.id, supervisorId);
    expect(c1.weeklyPlan.status).toBe('confirmed');

    // Assert de inmutabilidad contractual
    expect(v1.parentItem.planned_qty).toBe(1850);
    expect(v1.metrics.contractualCertifiableQty).toBe(1850);
  });
});
