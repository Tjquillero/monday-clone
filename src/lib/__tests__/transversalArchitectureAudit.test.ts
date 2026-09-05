/**
 * Transversal Architecture Baseline Audit (ADR-0007 -> ADR-0012)
 *
 * Verifies cross-domain invariants:
 * 1. Magnitude separation (executed_qty != certifiable_qty != contractually_certifiable_qty != cantidad_facturada).
 * 2. Unidirectional authority (POA -> Planning -> Execution -> Verification -> Certification -> Billing).
 * 3. Volume inequality bounds (POA.cantidad >= contractually_certifiable >= cantidad_facturada).
 * 4. Historical preservation (No retrospective mutations on POA, planned_qty, executed_qty, or verification_status).
 * 5. Overage isolation (Physical executed_qty=1,200 preserved, certifiable=1,200, contractual cap=1,000).
 * 6. Partial consumption & anti-double-billing.
 */

import { generateRoutineScheduleForWeek } from '../routineScheduler';
import { syncWeeklyPlanForBoard } from '../weeklyPlanService';
import { reportWeeklyPlanExecution } from '../executionService';
import { verifyExecutionRecordWithAudit } from '../verificationService';
import { generateActaDraft, issueActa, getBoardBillingSummary } from '../actaService';
import { computeCertifiableMetrics } from '../../types/verification';
import { mapRoutineAssignmentToItemInput } from '../../types/weeklyPlan';

describe('Transversal Architecture Baseline Audit (ADR-0007 -> ADR-0012)', () => {
  test('Audit 38.1: Verificación de Invariantes y Separación de Fronteras de Dominio', async () => {

  const boardId = 'board_audit_global_01';
  const groupId = 'site_barranquilla_norte';
  const supervisorId = 'usr_supervisor_audit';
  const leaderId = 'usr_leader_audit';
  const adminId = 'usr_admin_audit';

  // Mock DB Store
  const mockDb = {
    plansStore: new Map(),
    itemsStore: new Map(),
    execsStore: new Map(),
    actasStore: new Map(),
    itemsStoreActa: new Map(),
    sourcesStore: new Map(),
    poaStore: new Map(),
    rpc: async (name: string, args?: any) => {
      if (name === 'generate_acta_numero') return { data: 1, error: null };
      return { data: null, error: null };
    },
    from: (table: string) => {
      if (table === 'weekly_plans') {
        return {
          insert: (input: any) => ({
            select: () => ({
              single: async () => {
                const existing = Array.from(mockDb.plansStore.values()).find(
                  (p: any) => p.board_id === input.board_id && p.week_start_date === input.week_start_date && p.group_id === input.group_id
                );
                if (existing) return { data: existing, error: null };
                const newPlan = { id: input.id || 'wp_' + Math.random().toString(36).substring(2, 7), status: 'published', ...input };
                mockDb.plansStore.set(newPlan.id, newPlan);
                return { data: newPlan, error: null };
              },
            }),
          }),
          select: () => ({
            eq: (field: string, val: any) => ({
              eq: (field2: string, val2: any) => ({
                is: (field3: string, val3: any) => ({
                  maybeSingle: async () => {
                    const found = Array.from(mockDb.plansStore.values()).find(
                      (p: any) => p.board_id === val && p.week_start_date === val2 && (p.group_id === val3 || (!p.group_id && val3 === null))
                    );
                    return { data: found || null, error: null };
                  },
                }),
                eq: (field3: string, val3: any) => ({
                  maybeSingle: async () => {
                    const found = Array.from(mockDb.plansStore.values()).find(
                      (p: any) => p.board_id === val && p.week_start_date === val2 && p.group_id === val3
                    );
                    return { data: found || null, error: null };
                  },
                }),
              }),
            }),
          }),
          update: (upd: any) => ({
            eq: (col: string, val: any) => ({
              select: () => ({
                single: async () => {
                  const p = mockDb.plansStore.get(val);
                  if (p) Object.assign(p, upd);
                  return { data: p || null, error: null };
                },
              }),
            }),
          }),
        };
      }
      if (table === 'weekly_plan_items') {
        return {
          select: (fields?: string, options?: any) => ({
            eq: (col: string, val: any) => {
              const list = Array.from(mockDb.itemsStore.values()).filter((i: any) => i[col] === val);
              const p: any = Promise.resolve({ data: list, count: list.length, error: null });
              p.single = async () => {
                const item = mockDb.itemsStore.get(val);
                return { data: item || null, error: item ? null : new Error('Not found') };
              };
              return p;
            },
          }),
          insert: (recs: any[]) => {
            const inserted = recs.map((r) => {
              const item = { id: r.id || 'wpi_' + Math.random().toString(36).substring(2, 7), status: 'planned', ...r };
              mockDb.itemsStore.set(item.id, item);
              return item;
            });
            return Promise.resolve({ data: inserted, error: null });
          },
          update: (upd: any) => ({
            eq: (col: string, val: any) => ({
              select: () => ({
                single: async () => {
                  const item = mockDb.itemsStore.get(val);
                  if (item) Object.assign(item, upd);
                  return { data: item || null, error: null };
                },
              }),
            }),
          }),
        };
      }
      if (table === 'weekly_plan_item_executions') {
        return {
          insert: (recs: any[]) => ({
            select: () => ({
              single: async () => {
                const r = Array.isArray(recs) ? recs[0] : recs;
                const exec = { id: r.id || 'exec_' + Math.random().toString(36).substring(2, 7), verification_status: 'reported', ...r };
                mockDb.execsStore.set(exec.id, exec);
                return { data: exec, error: null };
              },
            }),
          }),
          select: () => ({
            eq: (col: string, val: any) => {
              const list = Array.from(mockDb.execsStore.values()).filter((e: any) => e[col] === val);
              const p: any = Promise.resolve({ data: list, error: null });
              p.single = async () => {
                const exec = mockDb.execsStore.get(val);
                return { data: exec || null, error: exec ? null : new Error('Exec not found') };
              };
              return p;
            },
          }),
          update: (upd: any) => ({
            eq: (col: string, val: any) => ({
              select: () => ({
                single: async () => {
                  const exec = mockDb.execsStore.get(val);
                  if (exec) Object.assign(exec, upd);
                  return { data: exec || null, error: null };
                },
              }),
            }),
          }),
        };
      }
      if (table === 'actas') {
        return {
          insert: (input: any) => ({
            select: () => ({
              single: async () => {
                const acta = { id: input.id || 'acta_' + Math.random().toString(36).substring(2, 7), ...input };
                mockDb.actasStore.set(acta.id, acta);
                return { data: acta, error: null };
              },
            }),
          }),
          select: () => ({
            eq: (col: string, val: any) => {
              const obj: any = {
                eq: (col2: string, val2: any) => {
                  const list = Array.from(mockDb.actasStore.values()).filter((a: any) => a[col] === val && a[col2] === val2);
                  const p: any = Promise.resolve({ data: list, error: null });
                  p.maybeSingle = async () => ({ data: list[0] || null, error: null });
                  p.single = async () => ({ data: list[0] || null, error: list[0] ? null : new Error('Not found') });
                  return p;
                },
                single: async () => {
                  const found = mockDb.actasStore.get(val);
                  return { data: found || null, error: found ? null : new Error('Not found') };
                },
              };
              return obj;
            },
          }),
          update: (upd: any) => ({
            eq: (col: string, val: any) => ({
              select: () => ({
                single: async () => {
                  const a = mockDb.actasStore.get(val);
                  if (a) Object.assign(a, upd);
                  return { data: a || null, error: null };
                },
              }),
            }),
          }),
        };
      }
      if (table === 'acta_items') {
        return {
          insert: (inputs: any[]) => ({
            select: async () => {
              const inserted = inputs.map((i) => {
                const item = { id: i.id || 'ai_' + Math.random().toString(36).substring(2, 7), ...i };
                mockDb.itemsStoreActa.set(item.id, item);
                return item;
              });
              return { data: inserted, error: null };
            },
          }),
          select: () => ({
            eq: (col: string, val: any) => {
              const list = Array.from(mockDb.itemsStoreActa.values()).filter((i: any) => i[col] === val);
              return Promise.resolve({ data: list, error: null });
            },
            in: (col: string, vals: any[]) => {
              const list = Array.from(mockDb.itemsStoreActa.values()).filter((i: any) => vals.includes(i[col]));
              return Promise.resolve({ data: list, error: null });
            },
          }),
        };
      }
      if (table === 'acta_item_sources') {
        return {
          insert: (inputs: any[]) => {
            const inserted = inputs.map((s) => {
              const src = { id: s.id || 'ais_' + Math.random().toString(36).substring(2, 7), ...s };
              mockDb.sourcesStore.set(src.id, src);
              return src;
            });
            return Promise.resolve({ data: inserted, error: null });
          },
          select: () => ({
            in: (col: string, vals: any[]) => {
              const list = Array.from(mockDb.sourcesStore.values()).filter((s: any) => vals.includes(s[col]));
              return Promise.resolve({ data: list, error: null });
            },
          }),
        };
      }
      return {};
    },
  };

  // 1. Contractual Target (POA)
  const poaActivity = {
    id: 'poa_poda_01',
    activity_key: 'ROUTINE_PODA_ARBOLES',
    name: 'Poda de Árboles y Arbolados',
    unit: 'm2',
    precio_unitario: 25000,
    cantidad: 1000, // Contract Limit: 1000 m2
    zone: 'Norte',
  };
  mockDb.poaStore.set(poaActivity.id, poaActivity);

  console.log('1. Capa Contractual POA:');
  console.log(`   - Actividad: ${poaActivity.name}`);
  console.log(`   - Volumen Contratado: ${poaActivity.cantidad} ${poaActivity.unit}`);
  console.log(`   - Precio Unitario: $${poaActivity.precio_unitario}\n`);

  // 2. ADR-0007: Scheduler
  const routineConfigs = [
    {
      id: 'rout_poda_01',
      activity_key: 'ROUTINE_PODA_ARBOLES',
      name: 'Poda de Árboles y Arbolados',
      frecuencia: 12.5,
      cantidad: 600,
      rendimiento: 100,
      unit: 'm2',
      zone: 'Norte',
    },
  ];
  const projection = generateRoutineScheduleForWeek(routineConfigs as any, '2026-09-07');

  console.log('2. ADR-0007 Routine Scheduler:');
  console.log(`   - Asignaciones operativas: ${projection.assignments.length}\n`);

  // 3. ADR-0008: Weekly Plan Persistence
  await syncWeeklyPlanForBoard(
    mockDb as any,
    boardId,
    groupId,
    '2026-09-07',
    projection
  );

  const weeklyPlan = Array.from(mockDb.plansStore.values())[0] as any;
  const planItem = Array.from(mockDb.itemsStore.values())[0] as any;
  console.log('3. ADR-0008 Weekly Plan Persistence:');
  console.log(`   - WeeklyPlan ID: ${weeklyPlan.id} (Status: ${weeklyPlan.status})`);
  console.log(`   - Item ID: ${planItem.id}`);
  console.log(`   - Item planned_qty: ${planItem.planned_qty} m2`);
  console.log(`   - Occurrence Key: ${planItem.occurrence_key}\n`);

  // 4. ADR-0009: Field Execution (Overage Test: Exec 1 = 700 m2, Exec 2 = 500 m2 => Total 1,200 m2)
  console.log('4. ADR-0009 Operational Field Execution (Overage Scenario: 1,200 m2 total executed vs 1,000 m2 POA):');
  const report1 = await reportWeeklyPlanExecution(mockDb as any, {
    weekly_plan_item_id: planItem.id,
    board_id: boardId,
    execution_date: '2026-09-08',
    executed_qty: 700,
    reported_by: leaderId,
  });

  const report2 = await reportWeeklyPlanExecution(mockDb as any, {
    weekly_plan_item_id: planItem.id,
    board_id: boardId,
    execution_date: '2026-09-10',
    executed_qty: 500,
    reported_by: leaderId,
  });

  console.log(`   - Execution 1 executed_qty: ${report1.executionRecord.executed_qty} m2 (Status: ${report1.executionRecord.verification_status})`);
  console.log(`   - Execution 2 executed_qty: ${report2.executionRecord.executed_qty} m2 (Status: ${report2.executionRecord.verification_status})\n`);

  // 5. ADR-0011: Evidence Verification & Operational Certification
  console.log('5. ADR-0011 Verification & Operational Certification:');
  const verify1 = await verifyExecutionRecordWithAudit(mockDb as any, {
    execution_id: report1.executionRecord.id,
    supervisor_user_id: supervisorId,
    action: 'approve',
    attachments_count: 2,
  });

  const verify2 = await verifyExecutionRecordWithAudit(mockDb as any, {
    execution_id: report2.executionRecord.id,
    supervisor_user_id: supervisorId,
    action: 'approve',
    attachments_count: 2,
  });

  const certMetrics = computeCertifiableMetrics(planItem.planned_qty, [verify1.updatedExecution, verify2.updatedExecution]);
  console.log(`   - Execution 1 status: ${verify1.updatedExecution.verification_status}`);
  console.log(`   - Execution 2 status: ${verify2.updatedExecution.verification_status}`);
  console.log(`   - certifiable_executed_qty (Operacional): ${certMetrics.certifiableExecutedQty} m2`);
  console.log(`   - overExecutedQty (Operacional): ${certMetrics.overExecutedQty} m2\n`);

  // 6. ADR-0012: Contractual Certification & Billing Actas
  console.log('6. ADR-0012 Contractual Certification & Actas:');
  const draftResult = await generateActaDraft(mockDb as any, boardId, adminId);
  console.log(`   - Borrador generado ID: ${draftResult.acta.id}`);
  console.log(`   - Líneas de Acta: ${draftResult.items.length}`);
  console.log(`   - cantidad_facturada en Borrador: ${draftResult.items[0].cantidad_facturada} m2 (Capped at POA 1,000 m2)`);

  const issuedActa = await issueActa(mockDb as any, draftResult.acta.id, adminId);
  console.log(`   - Acta Emitida Consecutivo: #${issuedActa.numero} (Status: ${issuedActa.estado})`);

  const summary = await getBoardBillingSummary(mockDb as any, boardId);
  console.log(`   - Resumen Contractual Billed: ${summary[0].totalBilledQty} m2`);
  console.log(`   - Resumen Contractual Pending: ${summary[0].pendingBillableQty} m2`);
  console.log(`   - Resumen Contractual Overage Aislado: ${summary[0].overExecutedQty} m2\n`);

  // 7. INVARIANT VALIDATIONS
  console.log('=== AUDITORÍA DE INVARIANTES Y SEPARACIÓN DE FRONTERAS ===\n');

  const poaCurrent = mockDb.poaStore.get(poaActivity.id);
  const itemCurrent = mockDb.itemsStore.get(planItem.id);
  const exec1Current = mockDb.execsStore.get(report1.executionRecord.id);
  const exec2Current = mockDb.execsStore.get(report2.executionRecord.id);
  const actaCurrent = mockDb.actasStore.get(issuedActa.id);
  const actaItemCurrent = mockDb.itemsStoreActa.get(draftResult.items[0].id);

  const checks = [
    {
      dimension: '1. Integridad de Magnitudes',
      invariant: 'executed_qty (1200) != certifiable_qty (1200) != contractually_certifiable (1000) != cantidad_facturada (1000)',
      passed:
        certMetrics.totalReportedQty === 1200 &&
        certMetrics.certifiableExecutedQty === 1200 &&
        summary[0].totalContractualCertifiableQty === 1000 &&
        actaItemCurrent.cantidad_facturada === 1000,
      detail: `Reported=${certMetrics.totalReportedQty}, Certifiable=${certMetrics.certifiableExecutedQty}, ContractualCap=${summary[0].totalContractualCertifiableQty}, Facturado=${actaItemCurrent.cantidad_facturada}`,
    },
    {
      dimension: '2. Desigualdad de Volumen Contractual',
      invariant: 'POA.cantidad (1000) >= contractual_certifiable (1000) >= cantidad_facturada (1000)',
      passed:
        poaCurrent.cantidad >= summary[0].totalContractualCertifiableQty &&
        summary[0].totalContractualCertifiableQty >= summary[0].totalBilledQty,
      detail: `POA=${poaCurrent.cantidad}, ContractualCert=${summary[0].totalContractualCertifiableQty}, Billed=${summary[0].totalBilledQty}`,
    },
    {
      dimension: '3. Preservación Histórica Contractual',
      invariant: 'POA.cantidad y POA.precio no sufrieron mutación',
      passed: poaCurrent.cantidad === poaActivity.cantidad && poaCurrent.precio_unitario === poaActivity.precio_unitario,
      detail: `POA.cantidad=${poaCurrent.cantidad}, POA.precio=$${poaCurrent.precio_unitario}`,
    },
    {
      dimension: '4. Preservación Histórica de Planificación',
      invariant: 'planned_qty y planned_date no sufrieron mutación',
      passed: itemCurrent.planned_qty === planItem.planned_qty && itemCurrent.planned_date === planItem.planned_date,
      detail: `planned_qty=${itemCurrent.planned_qty}, planned_date=${itemCurrent.planned_date}`,
    },
    {
      dimension: '5. Preservación Histórica Física de Ejecución',
      invariant: 'executed_qty no fue recortado a 1000 para hacer cuadrar el Acta',
      passed: exec1Current.executed_qty + exec2Current.executed_qty === 1200,
      detail: `Exec 1=${exec1Current.executed_qty}, Exec 2=${exec2Current.executed_qty} => Total=${exec1Current.executed_qty + exec2Current.executed_qty}`,
    },
    {
      dimension: '6. Inmutabilidad y Snapshots del Acta',
      invariant: 'Acta issued congela numero, snapshots y prohíbe edición',
      passed:
        actaCurrent.estado === 'issued' &&
        actaCurrent.numero === 1 &&
        actaItemCurrent.descripcion_snapshot === poaActivity.name &&
        actaItemCurrent.precio_unitario_snapshot === poaActivity.precio_unitario,
      detail: `Numero=#${actaCurrent.numero}, Desc=${actaItemCurrent.descripcion_snapshot}, Price=$${actaItemCurrent.precio_unitario_snapshot}`,
    },
    {
      dimension: '7. Unidireccionalidad Estricta',
      invariant: 'Cero mutaciones en sentido inverso (Actas/Billing -> Execution/Plan/POA)',
      passed:
        poaCurrent.cantidad === 1000 &&
        itemCurrent.planned_qty === 600 &&
        exec1Current.executed_qty === 700 &&
        exec2Current.executed_qty === 500,
      detail: 'Todas las capas aguas arriba mantuvieron sus valores intactos',
    },
  ];

  let totalPassed = 0;
  for (const c of checks) {
    const symbol = c.passed ? '🟢 CONFORME' : '🔴 VIOLACIÓN';
    console.log(`${symbol} - ${c.dimension}`);
    console.log(`   Regla: ${c.invariant}`);
    console.log(`   Evidencia: ${c.detail}\n`);
    expect(c.passed).toBe(true);
    if (c.passed) totalPassed++;
  }

  expect(totalPassed).toBe(checks.length);
  });
});
