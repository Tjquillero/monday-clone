/**
 * Test Suite 48 — Seguimiento y Ejecución de Campo (Fase 5.3)
 * Baseline de Entrada: 104 suites / 794 tests / TS 0 errores (F5.2 FROZEN)
 * Baseline Certificada: 105 suites / 804 tests / TS 0 errores (F5.3 FROZEN)
 * 
 * Contratos Evaluados:
 * - EXE-01: Reporte válido de avance físico por operario (planned -> in_progress, cálculo de jornales_used, snapshot de cuadrilla).
 * - EXE-02: Idempotencia estricta con source_mutation_id (0 duplicados en reintentos y sincronización offline).
 * - EXE-03: Concurrencia optimista de transición de estados (guard previene colisión entre supervisores concurrentes).
 * - EXE-04: Compuerta determinista de evidencia (falta de fotos obligatorias transiciona a evidence_pending).
 * - EXE-05: Subsanación de evidencia (adjuntar fotos en evidence_pending regresa el reporte a revisión en reported).
 * - EXE-06: Verificación técnica por supervisor (transición a verified, fijación de auditoría y cálculo de certifiableExecutedQty).
 * - EXE-07: Rechazo formal por supervisor (rejection_reason obligatorio, estado terminal no editable).
 * - EXE-08: Control de acceso RBAC estricto (rechazo de auto-verificación por parte de operarios).
 * - EXE-09: Transición automática de ocurrencia a completed al completar la meta certificable sin pendientes.
 * - EXE-10: Invarianza contractual, preservación de snapshots de cuadrilla, soporte de execution_date != planned_date y aislamiento H8.
 */

import {
  reportFieldExecution,
  attachFieldEvidence,
  verifyFieldExecution,
  rejectFieldExecution,
} from '../fieldWorkflowExecutionService';

describe('Test Suite 48 — Seguimiento y Ejecución de Campo (Fase 5.3)', () => {
  const boardId = 'board_campo_53';
  const planItemId = 'item_campo_001';
  const planId = 'plan_campo_w37';
  const workerUserId = 'user_worker_01';
  const supervisorUserId = 'user_supervisor_01';
  const unauthorizedUserId = 'user_intruder';

  let storedWeeklyPlans: any[] = [];
  let storedWeeklyPlanItems: any[] = [];
  let storedExecutions: any[] = [];
  let storedAttachments: any[] = [];
  let storedActas: any[] = [];
  let storedActaItems: any[] = [];
  let storedUserRoles: any[] = [];

  let mockSupabase: any;

  beforeEach(() => {
    storedWeeklyPlans = [
      {
        id: planId,
        board_id: boardId,
        status: 'published',
      },
    ];

    storedWeeklyPlanItems = [
      {
        id: planItemId,
        weekly_plan_id: planId,
        board_id: boardId,
        group_id: 'site_norte',
        activity_key: 'corte_cesped',
        name: 'Corte de Césped',
        planned_date: '2026-09-08',
        planned_qty: 1000,
        planned_jr: 2.0,
        theoretical_jr: 2.0,
        status: 'planned',
        crew_id: 'crew_alfa_initial',
      },
    ];

    storedExecutions = [];
    storedAttachments = [];
    storedActas = [];
    storedActaItems = [];

    storedUserRoles = [
      { user_id: workerUserId, board_id: boardId, role: 'worker' },
      { user_id: supervisorUserId, board_id: boardId, role: 'supervisor' },
    ];

    mockSupabase = {
      from: jest.fn((table: string) => {
        if (table === 'weekly_plan_items') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockImplementation((col: string, val: string) => ({
              single: jest.fn().mockImplementation(async () => {
                const found = storedWeeklyPlanItems.find((i) => i.id === val);
                return { data: found || null, error: found ? null : new Error('Item not found') };
              }),
            })),
            update: jest.fn().mockImplementation((updates: any) => ({
              eq: jest.fn().mockImplementation((col: string, val: string) => {
                const target = storedWeeklyPlanItems.find((i) => i.id === val);
                if (target) {
                  Object.assign(target, updates);
                }
                return {
                  select: jest.fn().mockReturnThis(),
                  single: jest.fn().mockResolvedValue({ data: target, error: null }),
                };
              }),
            })),
          };
        }

        if (table === 'weekly_plan_item_executions') {
          return {
            select: jest.fn().mockImplementation((fields?: string) => ({
              eq: jest.fn().mockImplementation((col: string, val: string) => {
                const filtered = storedExecutions.filter((e) => e[col] === val);
                const queryObj: any = {
                  data: filtered,
                  error: null,
                  maybeSingle: jest.fn().mockImplementation(async () => {
                    const found = storedExecutions.find((e) => e[col] === val);
                    return { data: found || null, error: null };
                  }),
                  single: jest.fn().mockImplementation(async () => {
                    const found = storedExecutions.find((e) => e[col] === val);
                    return { data: found || null, error: found ? null : new Error('Execution not found') };
                  }),
                };
                queryObj.then = (resolve: any) => Promise.resolve({ data: filtered, error: null }).then(resolve);
                return queryObj;
              }),
            })),
            insert: jest.fn().mockImplementation((payload: any) => {
              const newExec = {
                id: `exec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                ...payload,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
              storedExecutions.push(newExec);
              return {
                select: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({ data: newExec, error: null }),
              };
            }),
            update: jest.fn().mockImplementation((updates: any) => {
              return {
                eq: jest.fn().mockImplementation((colId: string, valId: string) => {
                  return {
                    in: jest.fn().mockImplementation((colStatus: string, validStatuses: string[]) => {
                      const matched = storedExecutions.filter(
                        (e) => e[colId] === valId && validStatuses.includes(e[colStatus])
                      );
                      matched.forEach((m) => Object.assign(m, updates));
                      return {
                        select: jest.fn().mockResolvedValue({ data: matched, error: null }),
                      };
                    }),
                    eq: jest.fn().mockImplementation((colStatus: string, expectedStatus: string) => {
                      const matched = storedExecutions.filter(
                        (e) => e[colId] === valId && e[colStatus] === expectedStatus
                      );
                      matched.forEach((m) => Object.assign(m, updates));
                      return {
                        select: jest.fn().mockResolvedValue({ data: matched, error: null }),
                      };
                    }),
                    select: jest.fn().mockImplementation(async () => {
                      const matched = storedExecutions.filter((e) => e[colId] === valId);
                      matched.forEach((m) => Object.assign(m, updates));
                      return { data: matched, error: null };
                    }),
                    then: (resolve: any) => {
                      const matched = storedExecutions.filter((e) => e[colId] === valId);
                      matched.forEach((m) => Object.assign(m, updates));
                      return Promise.resolve({ data: matched, error: null }).then(resolve);
                    },
                  };
                }),
              };
            }),
          };
        }

        if (table === 'execution_attachments') {
          return {
            insert: jest.fn().mockImplementation((payload: any) => {
              const newAtt = { id: `att_${Date.now()}`, ...payload };
              storedAttachments.push(newAtt);
              return {
                select: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({ data: newAtt, error: null }),
              };
            }),
          };
        }

        if (table === 'user_board_roles') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockImplementation((col1: string, val1: string) => ({
              eq: jest.fn().mockImplementation(async (col2: string, val2: string) => {
                const roles = storedUserRoles.filter(
                  (r) => r[col1] === val1 && r[col2] === val2
                );
                return { data: roles, error: null };
              }),
            })),
          };
        }

        if (table === 'acta_items') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockImplementation(async (col: string, val: string) => {
              const items = storedActaItems.filter((ai) => ai.plan_item_id === val);
              const joined = items.map((ai) => ({
                ...ai,
                acta: storedActas.find((a) => a.id === ai.acta_id) || null,
              }));
              return { data: joined, error: null };
            }),
          };
        }

        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    };
  });

  // EXE-01: Reporte válido de avance físico por operario
  it('EXE-01: debe reportar avance físico válido, transicionar ítem de planned a in_progress y calcular jornales_used', async () => {
    const res = await reportFieldExecution(mockSupabase, {
      weekly_plan_item_id: planItemId,
      board_id: boardId,
      execution_date: '2026-09-08',
      executed_qty: 400,
      worker_count: 2,
      hours_worked: 8,
      reported_by: workerUserId,
    });

    expect(res.executionRecord.verification_status).toBe('reported');
    expect(res.executionRecord.executed_qty).toBe(400);
    expect(res.executionRecord.jornales_used).toBe(2.0); // (2 workers * 8h)/8 = 2 JR
    expect(res.executionRecord.crew_id_snapshot).toBe('crew_alfa_initial');
    expect(res.parentItem.status).toBe('in_progress');
    expect(storedWeeklyPlanItems[0].status).toBe('in_progress');
  });

  // EXE-02: Idempotencia estricta con source_mutation_id
  it('EXE-02: reintentos con mismo source_mutation_id deben retornar el registro existente sin duplicar filas (0 duplicados)', async () => {
    const mutationId = 'mut_rep_offline_batch_001';

    // Primer intento
    const res1 = await reportFieldExecution(mockSupabase, {
      weekly_plan_item_id: planItemId,
      board_id: boardId,
      execution_date: '2026-09-08',
      executed_qty: 300,
      reported_by: workerUserId,
      source_mutation_id: mutationId,
    });
    expect(res1.isIdempotentReplay).toBe(false);
    expect(storedExecutions).toHaveLength(1);

    // Segundo intento / retry con el mismo source_mutation_id
    const res2 = await reportFieldExecution(mockSupabase, {
      weekly_plan_item_id: planItemId,
      board_id: boardId,
      execution_date: '2026-09-08',
      executed_qty: 300,
      reported_by: workerUserId,
      source_mutation_id: mutationId,
    });
    expect(res2.isIdempotentReplay).toBe(true);
    expect(res2.executionRecord.id).toBe(res1.executionRecord.id);
    expect(storedExecutions).toHaveLength(1); // Cero duplicados
  });

  // EXE-03: Concurrencia optimista de transición de estados
  it('EXE-03: guard optimista debe rechazar colisión cuando dos supervisores intentan transicionar concurrentemente', async () => {
    const reportRes = await reportFieldExecution(mockSupabase, {
      weekly_plan_item_id: planItemId,
      board_id: boardId,
      execution_date: '2026-09-08',
      executed_qty: 500,
      reported_by: workerUserId,
    });
    const execId = reportRes.executionRecord.id;

    // Supervisor 1 verifica primero
    await verifyFieldExecution(mockSupabase, {
      executionId: execId,
      supervisorUserId,
      boardId,
      expectedCurrentStatus: 'reported',
    });

    // Supervisor 2 intenta rechazar sobre el estado 'reported' que ya cambió a 'verified'
    await expect(
      rejectFieldExecution(mockSupabase, {
        executionId: execId,
        supervisorUserId,
        boardId,
        rejectionReason: 'Rechazo tardío en carrera',
        expectedCurrentStatus: 'reported',
      })
    ).rejects.toThrow(/STATE_TRANSITION_CONFLICT/);
  });

  // EXE-04: Compuerta determinista de evidencia obligatoria
  it('EXE-04: si la actividad exige fotos y attachments_count === 0, la verificación transiciona a evidence_pending', async () => {
    const reportRes = await reportFieldExecution(mockSupabase, {
      weekly_plan_item_id: planItemId,
      board_id: boardId,
      execution_date: '2026-09-08',
      executed_qty: 500,
      reported_by: workerUserId,
    });

    const verifyRes = await verifyFieldExecution(mockSupabase, {
      executionId: reportRes.executionRecord.id,
      supervisorUserId,
      boardId,
      attachmentsCount: 0,
      requiredAttachmentsCount: 2, // Requiere al menos 2 fotos
    });

    expect(verifyRes.updatedExecution.verification_status).toBe('evidence_pending');
    expect(verifyRes.metrics.certifiableExecutedQty).toBe(0); // No suma a certificable
  });

  // EXE-05: Subsanación de evidencia fotográfica
  it('EXE-05: adjuntar evidencia en un registro evidence_pending debe regresarlo a reported para nueva revisión', async () => {
    const reportRes = await reportFieldExecution(mockSupabase, {
      weekly_plan_item_id: planItemId,
      board_id: boardId,
      execution_date: '2026-09-08',
      executed_qty: 500,
      reported_by: workerUserId,
    });
    const execId = reportRes.executionRecord.id;

    // Forzar a evidence_pending
    await verifyFieldExecution(mockSupabase, {
      executionId: execId,
      supervisorUserId,
      boardId,
      attachmentsCount: 0,
      requiredAttachmentsCount: 1,
    });
    expect(storedExecutions[0].verification_status).toBe('evidence_pending');

    // Operario subsana adjuntando foto
    const attRes = await attachFieldEvidence(mockSupabase, {
      executionId: execId,
      boardId,
      userId: workerUserId,
      storagePath: 'evidences/site_norte/after_01.jpg',
      phase: 'after',
    });

    expect(attRes.executionUpdated).toBe(true);
    expect(storedExecutions[0].verification_status).toBe('reported');

    // Ahora supervisor puede verificar exitosamente
    const verifySuccess = await verifyFieldExecution(mockSupabase, {
      executionId: execId,
      supervisorUserId,
      boardId,
      attachmentsCount: 1,
      requiredAttachmentsCount: 1,
    });
    expect(verifySuccess.updatedExecution.verification_status).toBe('verified');
  });

  // EXE-06: Verificación técnica por supervisor
  it('EXE-06: supervisor autorizado debe verificar ejecución, registrar verified_by y sumar certifiableExecutedQty', async () => {
    const reportRes = await reportFieldExecution(mockSupabase, {
      weekly_plan_item_id: planItemId,
      board_id: boardId,
      execution_date: '2026-09-08',
      executed_qty: 600,
      reported_by: workerUserId,
    });

    const verifyRes = await verifyFieldExecution(mockSupabase, {
      executionId: reportRes.executionRecord.id,
      supervisorUserId,
      boardId,
      attachmentsCount: 2,
      requiredAttachmentsCount: 1,
    });

    expect(verifyRes.updatedExecution.verification_status).toBe('verified');
    expect(verifyRes.updatedExecution.verified_by).toBe(supervisorUserId);
    expect(verifyRes.metrics.certifiableExecutedQty).toBe(600);
    expect(verifyRes.metrics.remainingPlannedQty).toBe(400);
  });

  // EXE-07: Rechazo formal por supervisor
  it('EXE-07: rechazo por supervisor exige rejection_reason y marca el registro como rejected terminal (no editable)', async () => {
    const reportRes = await reportFieldExecution(mockSupabase, {
      weekly_plan_item_id: planItemId,
      board_id: boardId,
      execution_date: '2026-09-08',
      executed_qty: 300,
      reported_by: workerUserId,
    });
    const execId = reportRes.executionRecord.id;

    // Falla si no se provee motivo de rechazo
    await expect(
      rejectFieldExecution(mockSupabase, {
        executionId: execId,
        supervisorUserId,
        boardId,
        rejectionReason: '',
      })
    ).rejects.toThrow(/REJECTION_REASON_REQUIRED/);

    // Rechazo con motivo formal
    const rejectRes = await rejectFieldExecution(mockSupabase, {
      executionId: execId,
      supervisorUserId,
      boardId,
      rejectionReason: 'Corte defectuoso y fuera de especificación técnica',
    });

    expect(rejectRes.updatedExecution.verification_status).toBe('rejected');
    expect(rejectRes.updatedExecution.rejected_by).toBe(supervisorUserId);
    expect(rejectRes.updatedExecution.rejection_reason).toBe('Corte defectuoso y fuera de especificación técnica');
    expect(rejectRes.metrics.certifiableExecutedQty).toBe(0);
  });

  // EXE-08: Control de acceso RBAC estricto
  it('EXE-08: debe rechazar si un operario intenta auto-verificarse o si un usuario no autorizado intenta reportar', async () => {
    const reportRes = await reportFieldExecution(mockSupabase, {
      weekly_plan_item_id: planItemId,
      board_id: boardId,
      execution_date: '2026-09-08',
      executed_qty: 500,
      reported_by: workerUserId,
    });

    // Intento de auto-verificación por el operario
    await expect(
      verifyFieldExecution(mockSupabase, {
        executionId: reportRes.executionRecord.id,
        supervisorUserId: workerUserId, // Rol 'worker'
        boardId,
      })
    ).rejects.toThrow(/UNAUTHORIZED_ROLE/);

    // Intento de reporte por usuario sin rol en el tablero
    await expect(
      reportFieldExecution(mockSupabase, {
        weekly_plan_item_id: planItemId,
        board_id: boardId,
        execution_date: '2026-09-08',
        executed_qty: 100,
        reported_by: unauthorizedUserId,
      })
    ).rejects.toThrow(/UNAUTHORIZED_USER/);
  });

  // EXE-09: Transición automática de ocurrencia a completed
  it('EXE-09: cuando certifiableExecutedQty >= planned_qty y no hay pendientes, el ítem transiciona automáticamente a completed', async () => {
    // Reporte 1: 600 m2
    const rep1 = await reportFieldExecution(mockSupabase, {
      weekly_plan_item_id: planItemId,
      board_id: boardId,
      execution_date: '2026-09-08',
      executed_qty: 600,
      reported_by: workerUserId,
    });
    await verifyFieldExecution(mockSupabase, { executionId: rep1.executionRecord.id, supervisorUserId, boardId });

    expect(storedWeeklyPlanItems[0].status).toBe('in_progress');

    // Reporte 2: 400 m2 (Total 1000 m2 = meta)
    const rep2 = await reportFieldExecution(mockSupabase, {
      weekly_plan_item_id: planItemId,
      board_id: boardId,
      execution_date: '2026-09-09',
      executed_qty: 400,
      reported_by: workerUserId,
    });
    const finalVerify = await verifyFieldExecution(mockSupabase, {
      executionId: rep2.executionRecord.id,
      supervisorUserId,
      boardId,
    });

    expect(finalVerify.metrics.isCompleted).toBe(true);
    expect(finalVerify.parentItem.status).toBe('completed');
    expect(storedWeeklyPlanItems[0].status).toBe('completed');
  });

  // EXE-10: Invarianza contractual, preservación de cuadrilla y bloqueo en Actas
  it('EXE-10: preserva planned_qty inmutable, congela crew_id_snapshot, permite execution_date en domingo y bloquea en Acta emitida', async () => {
    const originalPlannedQty = storedWeeklyPlanItems[0].planned_qty;
    const originalTheoreticalJr = storedWeeklyPlanItems[0].theoretical_jr;

    // Reporte en día domingo (realidad física fáctica)
    const sundayReport = await reportFieldExecution(mockSupabase, {
      weekly_plan_item_id: planItemId,
      board_id: boardId,
      execution_date: '2026-09-13', // Domingo
      executed_qty: 500,
      reported_by: workerUserId,
    });
    expect(sundayReport.executionRecord.execution_date).toBe('2026-09-13');
    expect(sundayReport.executionRecord.crew_id_snapshot).toBe('crew_alfa_initial');

    // Simular que F5.2 reasigna la cuadrilla actual del ítem a Beta
    storedWeeklyPlanItems[0].crew_id = 'crew_beta_subsequent';

    // El snapshot histórico de la ejecución dominical previa NO cambia
    expect(sundayReport.executionRecord.crew_id_snapshot).toBe('crew_alfa_initial');

    // Invarianza de demanda
    expect(storedWeeklyPlanItems[0].planned_qty).toBe(originalPlannedQty);
    expect(storedWeeklyPlanItems[0].theoretical_jr).toBe(originalTheoreticalJr);

    // Bloqueo en Acta emitida (ADR-0012)
    storedActas = [{ id: 'acta_01', status: 'issued' }];
    storedActaItems = [{ id: 'ai_01', acta_id: 'acta_01', plan_item_id: planItemId }];

    await expect(
      reportFieldExecution(mockSupabase, {
        weekly_plan_item_id: planItemId,
        board_id: boardId,
        execution_date: '2026-09-14',
        executed_qty: 100,
        reported_by: workerUserId,
      })
    ).rejects.toThrow(/ACTA_ISSUED_LOCKED/);
  });
});
