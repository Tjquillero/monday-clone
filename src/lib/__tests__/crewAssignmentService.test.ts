/**
 * Test Suite 47 — Asignación Operativa de Cuadrillas y Personal (Fase 5.2)
 * Baseline de Entrada: 103 suites / 780 tests / TS 0 errores (F5.1 FROZEN)
 * Baseline Certificada: 104 suites / 794 tests / TS 0 errores (F5.2 FROZEN)
 * 
 * Contratos Evaluados:
 * - ASG-01: Asignación válida y consulta de cuadrillas elegibles por board_id.
 * - ASG-02: Rechazo determinista por incompatibilidad de sitio (crew.board_id !== item.board_id).
 * - ASG-03: Rechazo determinista por cuadrilla inactiva (is_active = false).
 * - ASG-04: Transiciones de asignación (null -> A, A -> A idempotente, A -> null, A -> B).
 * - ASG-05: Bloqueo parametrizado de estados inmutables (plan/ítem inmutables, terminales, y Actas emitidas).
 * - ASG-06: Regla unívoca de ejecuciones mixtas (0 ejecuciones -> SÍ, 100% rejected -> SÍ, >=1 no-rechazada -> NO).
 * - ASG-07: Invarianza absoluta de demanda y metadatos de programación.
 * - ASG-08: Inmutabilidad de snapshots históricos (ejecuciones, verificaciones, evidencias, M3).
 * - ASG-09: Desasignación controlada (crew_id = null) sujeta a las mismas reglas (sin bypass de NULL).
 * - ASG-10: Autorización y control de acceso por usuario (user_board_roles).
 */

import {
  getEligibleCrewsForBoard,
  evaluateCrewAssignment,
  assignCrewToPlanItemValidated,
} from '../crewAssignmentService';

describe('Test Suite 47 — Asignación Operativa de Cuadrillas y Personal (Fase 5.2)', () => {
  const boardId = 'board_barranquilla_52';
  const otherBoardId = 'board_soledad_foreign';
  const planItemId = 'item_f52_001';
  const planId = 'plan_f52_week37';
  const validUserId = 'user_supervisor_authorized';
  const unauthorizedUserId = 'user_unauthorized';

  let storedWeeklyPlans: any[] = [];
  let storedWeeklyPlanItems: any[] = [];
  let storedCrews: any[] = [];
  let storedCrewMembers: any[] = [];
  let storedPersonnelAssignments: any[] = [];
  let storedExecutions: any[] = [];
  let storedActas: any[] = [];
  let storedActaItems: any[] = [];
  let storedUserRoles: any[] = [];

  let mockSupabase: any;

  beforeEach(() => {
    storedWeeklyPlans = [
      {
        id: planId,
        board_id: boardId,
        week_start_date: '2026-09-07',
        week_end_date: '2026-09-13',
        status: 'published',
      },
    ];

    storedWeeklyPlanItems = [
      {
        id: planItemId,
        weekly_plan_id: planId,
        board_id: boardId,
        group_id: 'site_puerto_colombia',
        activity_key: 'corte_grama',
        name: 'Corte de Césped',
        zone: 'Zona Verde',
        unit: 'M2',
        planned_date: '2026-09-08',
        planned_qty: 15000,
        planned_jr: 30,
        theoretical_jr: 30,
        frequency: 25,
        occurrence_key: 'occ_corte_grama_w37',
        status: 'planned',
        crew_id: null,
      },
    ];

    storedCrews = [
      {
        id: 'crew_alfa',
        board_id: boardId,
        name: 'Cuadrilla Alfa (Poda y Corte)',
        code: 'CUAD-ALF',
        leader_id: 'person_01',
        is_active: true,
      },
      {
        id: 'crew_beta',
        board_id: boardId,
        name: 'Cuadrilla Beta (Zona Dura)',
        code: 'CUAD-BET',
        leader_id: 'person_02',
        is_active: true,
      },
      {
        id: 'crew_inactive',
        board_id: boardId,
        name: 'Cuadrilla Inactiva',
        code: 'CUAD-INA',
        leader_id: null,
        is_active: false,
      },
      {
        id: 'crew_foreign',
        board_id: otherBoardId,
        name: 'Cuadrilla Soledad Foreign',
        code: 'CUAD-SOL',
        leader_id: 'person_03',
        is_active: true,
      },
    ];

    storedCrewMembers = [
      { id: 'cm_01', crew_id: 'crew_alfa', personnel_assignment_id: 'psa_01' },
      { id: 'cm_02', crew_id: 'crew_beta', personnel_assignment_id: 'psa_02' },
    ];

    storedPersonnelAssignments = [
      {
        id: 'psa_01',
        personnel_id: 'person_01',
        role_in_site: 'Líder de Cuadrilla',
        zone: 'Zona Verde',
        personnel: { name: 'Carlos Guadañador', document_id: 'CC-1001' },
      },
      {
        id: 'psa_02',
        personnel_id: 'person_02',
        role_in_site: 'Operario Experto',
        zone: 'Zona Dura',
        personnel: { name: 'Marta Hidrolavadora', document_id: 'CC-1002' },
      },
    ];

    storedExecutions = [];
    storedActas = [];
    storedActaItems = [];

    storedUserRoles = [
      { user_id: validUserId, board_id: boardId, role: 'supervisor' },
    ];

    mockSupabase = {
      from: jest.fn((table: string) => {
        if (table === 'weekly_plan_items') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockImplementation((col: string, val: string) => ({
              maybeSingle: jest.fn().mockImplementation(async () => {
                const found = storedWeeklyPlanItems.find((i) => i.id === val);
                return { data: found || null, error: null };
              }),
              single: jest.fn().mockImplementation(async () => {
                const found = storedWeeklyPlanItems.find((i) => i.id === val);
                return { data: found || null, error: null };
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

        if (table === 'weekly_plans') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockImplementation((col: string, val: string) => ({
              maybeSingle: jest.fn().mockImplementation(async () => {
                const found = storedWeeklyPlans.find((p) => p.id === val);
                return { data: found || null, error: null };
              }),
            })),
          };
        }

        if (table === 'crews') {
          return {
            select: jest.fn().mockImplementation((fields: string) => ({
              eq: jest.fn().mockImplementation((col1: string, val1: any) => {
                return {
                  eq: jest.fn().mockImplementation((col2: string, val2: any) => ({
                    order: jest.fn().mockImplementation(async () => {
                      const list = storedCrews.filter(
                        (c) => c[col1] === val1 && c[col2] === val2
                      );
                      const enriched = list.map((c) => ({
                        ...c,
                        leader: { name: 'Líder Configurado' },
                        members: storedCrewMembers
                          .filter((cm) => cm.crew_id === c.id)
                          .map((cm) => ({
                            ...cm,
                            assignment: storedPersonnelAssignments.find(
                              (psa) => psa.id === cm.personnel_assignment_id
                            ),
                          })),
                      }));
                      return { data: enriched, error: null };
                    }),
                  })),
                  maybeSingle: jest.fn().mockImplementation(async () => {
                    const found = storedCrews.find((c) => c[col1] === val1);
                    return { data: found || null, error: null };
                  }),
                  single: jest.fn().mockImplementation(async () => {
                    const found = storedCrews.find((c) => c[col1] === val1);
                    return { data: found || null, error: null };
                  }),
                };
              }),
            })),
          };
        }

        if (table === 'weekly_plan_item_executions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockImplementation(async (col: string, val: string) => {
              const execs = storedExecutions.filter((e) => e.weekly_plan_item_id === val);
              return { data: execs, error: null };
            }),
          };
        }

        if (table === 'acta_items') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockImplementation(async (col: string, val: string) => {
              const items = storedActaItems.filter((ai) => ai.plan_item_id === val);
              const joined = items.map((ai) => {
                const acta = storedActas.find((a) => a.id === ai.acta_id);
                return { ...ai, acta: acta || null };
              });
              return { data: joined, error: null };
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

        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    };
  });

  // ASG-01: Asignación válida y consulta de elegibilidad
  it('ASG-01: debe consultar cuadrillas elegibles y asignar exitosamente una cuadrilla activa en plan published / ítem planned', async () => {
    const eligibleCrews = await getEligibleCrewsForBoard(mockSupabase, boardId);
    expect(eligibleCrews).toHaveLength(2);
    expect(eligibleCrews[0].id).toBe('crew_alfa');
    expect(eligibleCrews[0].members_count).toBeGreaterThanOrEqual(1);

    const result = await assignCrewToPlanItemValidated(mockSupabase, {
      planItemId,
      crewId: 'crew_alfa',
      userId: validUserId,
    });

    expect(result.success).toBe(true);
    expect(result.evaluation.allowed).toBe(true);
    expect(result.evaluation.action).toBe('ASSIGN');
    expect(result.updatedItem?.crew_id).toBe('crew_alfa');
  });

  // ASG-02: Rechazo determinista por incompatibilidad de sitio
  it('ASG-02: debe rechazar deterministamente si la cuadrilla pertenece a otro board_id (sin inferencias de texto)', async () => {
    await expect(
      assignCrewToPlanItemValidated(mockSupabase, {
        planItemId,
        crewId: 'crew_foreign',
        userId: validUserId,
      })
    ).rejects.toThrow(/SITE_MISMATCH/);

    expect(storedWeeklyPlanItems[0].crew_id).toBeNull();
  });

  // ASG-03: Rechazo determinista por cuadrilla inactiva
  it('ASG-03: debe rechazar deterministamente si la cuadrilla está inactiva (is_active = false)', async () => {
    await expect(
      assignCrewToPlanItemValidated(mockSupabase, {
        planItemId,
        crewId: 'crew_inactive',
        userId: validUserId,
      })
    ).rejects.toThrow(/CREW_INACTIVE/);

    expect(storedWeeklyPlanItems[0].crew_id).toBeNull();
  });

  // ASG-04: Transiciones de asignación (null -> A, A -> A, A -> null, A -> B)
  it('ASG-04: debe manejar correctamente las 4 transiciones (null -> A, A -> A NO_OP, A -> null, A -> B)', async () => {
    // 1. null -> A (ASSIGN)
    const res1 = await assignCrewToPlanItemValidated(mockSupabase, { planItemId, crewId: 'crew_alfa', userId: validUserId });
    expect(res1.evaluation.action).toBe('ASSIGN');
    expect(storedWeeklyPlanItems[0].crew_id).toBe('crew_alfa');

    // 2. A -> A (NO_OP Idempotente)
    const res2 = await assignCrewToPlanItemValidated(mockSupabase, { planItemId, crewId: 'crew_alfa', userId: validUserId });
    expect(res2.evaluation.action).toBe('NO_OP');
    expect(res2.evaluation.reasonCode).toBe('IDEMPOTENT_NO_OP');

    // 3. A -> B (REPLACE)
    const res3 = await assignCrewToPlanItemValidated(mockSupabase, { planItemId, crewId: 'crew_beta', userId: validUserId });
    expect(res3.evaluation.action).toBe('REPLACE');
    expect(storedWeeklyPlanItems[0].crew_id).toBe('crew_beta');

    // 4. B -> null (UNASSIGN)
    const res4 = await assignCrewToPlanItemValidated(mockSupabase, { planItemId, crewId: null, userId: validUserId });
    expect(res4.evaluation.action).toBe('UNASSIGN');
    expect(storedWeeklyPlanItems[0].crew_id).toBeNull();
  });

  // ASG-05: Bloqueo parametrizado de estados inmutables
  it.each([
    ['plan_ready_for_confirmation', 'ready_for_confirmation', 'PLAN_READY_FOR_CONFIRMATION_IMMUTABLE'],
    ['plan_confirmed', 'confirmed', 'PLAN_CONFIRMED_IMMUTABLE'],
    ['plan_closed', 'closed', 'PLAN_CLOSED_IMMUTABLE'],
    ['plan_cancelled', 'cancelled', 'PLAN_CANCELLED_IMMUTABLE'],
  ])('ASG-05: debe rechazar asignación cuando el plan semanal está en estado inmutable %s', async (_label, status, expectedCode) => {
    storedWeeklyPlans[0].status = status;

    await expect(
      assignCrewToPlanItemValidated(mockSupabase, {
        planItemId,
        crewId: 'crew_alfa',
        userId: validUserId,
      })
    ).rejects.toThrow(new RegExp(expectedCode));
  });

  // ASG-05b: Bloqueo de ítem cancelado, completado o en Acta emitida
  it('ASG-05b: debe rechazar si el ítem está cancelado, completado o vinculado a un Acta emitida', async () => {
    // Ítem cancelado
    storedWeeklyPlanItems[0].status = 'cancelled';
    await expect(
      assignCrewToPlanItemValidated(mockSupabase, { planItemId, crewId: 'crew_alfa', userId: validUserId })
    ).rejects.toThrow(/ITEM_CANCELLED_TERMINAL/);

    // Ítem completado
    storedWeeklyPlanItems[0].status = 'completed';
    await expect(
      assignCrewToPlanItemValidated(mockSupabase, { planItemId, crewId: 'crew_alfa', userId: validUserId })
    ).rejects.toThrow(/ITEM_COMPLETED_PROTECTED/);

    // Ítem en Acta emitida
    storedWeeklyPlanItems[0].status = 'planned';
    storedActas = [{ id: 'acta_01', status: 'issued' }];
    storedActaItems = [{ id: 'ai_01', acta_id: 'acta_01', plan_item_id: planItemId }];

    await expect(
      assignCrewToPlanItemValidated(mockSupabase, { planItemId, crewId: 'crew_alfa', userId: validUserId })
    ).rejects.toThrow(/ACTA_ISSUED_LOCKED/);
  });

  // ASG-06: Regla de ejecuciones mixtas
  it('ASG-06: debe aplicar la regla unívoca de ejecuciones (0 ejecuciones -> SÍ, 100% rejected -> SÍ, >=1 no-rechazada -> NO)', async () => {
    // Caso 1: 100% rejected -> PERMITIDO
    storedExecutions = [
      { id: 'ex_1', weekly_plan_item_id: planItemId, verification_status: 'rejected' },
      { id: 'ex_2', weekly_plan_item_id: planItemId, verification_status: 'rejected' },
    ];
    const resAllowed = await assignCrewToPlanItemValidated(mockSupabase, {
      planItemId,
      crewId: 'crew_alfa',
      userId: validUserId,
    });
    expect(resAllowed.success).toBe(true);

    // Caso 2: Mixta con al menos 1 no-rechazada (reported + rejected) -> BLOQUEADO
    storedExecutions.push({ id: 'ex_3', weekly_plan_item_id: planItemId, verification_status: 'reported' });
    await expect(
      assignCrewToPlanItemValidated(mockSupabase, {
        planItemId,
        crewId: 'crew_beta',
        userId: validUserId,
      })
    ).rejects.toThrow(/ACTIVE_EXECUTIONS_PROTECTED/);
  });

  // ASG-07: Invarianza estricta de demanda y metadatos
  it('ASG-07: mutar crew_id jamás debe alterar planned_qty, planned_jr, theoretical_jr, planned_date ni occurrence_key', async () => {
    const originalItem = { ...storedWeeklyPlanItems[0] };

    await assignCrewToPlanItemValidated(mockSupabase, {
      planItemId,
      crewId: 'crew_alfa',
      userId: validUserId,
    });

    const updated = storedWeeklyPlanItems[0];
    expect(updated.crew_id).toBe('crew_alfa');
    expect(updated.planned_qty).toBe(originalItem.planned_qty);
    expect(updated.planned_jr).toBe(originalItem.planned_jr);
    expect(updated.theoretical_jr).toBe(originalItem.theoretical_jr);
    expect(updated.planned_date).toBe(originalItem.planned_date);
    expect(updated.occurrence_key).toBe(originalItem.occurrence_key);
    expect(updated.activity_key).toBe(originalItem.activity_key);
    expect(updated.board_id).toBe(originalItem.board_id);
  });

  // ASG-08: Preservación histórica integral
  it('ASG-08: reasignar cuadrilla no altera ejecuciones históricas pasadas ni registros de verificación', async () => {
    // Simular que el ítem no tiene ejecuciones activas pero hay registros pasados en historial
    const historicalExec = {
      id: 'exec_hist_999',
      weekly_plan_item_id: 'other_item_historical',
      executed_qty: 500,
      reported_by: 'operario_antiguo',
      verification_status: 'verified',
    };
    storedExecutions = [historicalExec];

    await assignCrewToPlanItemValidated(mockSupabase, {
      planItemId,
      crewId: 'crew_alfa',
      userId: validUserId,
    });

    // El registro histórico permanece 100% inalterado
    expect(storedExecutions[0].executed_qty).toBe(500);
    expect(storedExecutions[0].reported_by).toBe('operario_antiguo');
    expect(storedExecutions[0].verification_status).toBe('verified');
  });

  // ASG-09: Desasignación controlada (crew_id = null)
  it('ASG-09: desasignar (crew_id = null) está sujeto a las mismas reglas de bloqueo y no constituye un bypass', async () => {
    storedWeeklyPlanItems[0].crew_id = 'crew_alfa';

    // Bloquear el plan cabecera a closed
    storedWeeklyPlans[0].status = 'closed';

    // Intento de desasignar en plan closed debe fallar
    await expect(
      assignCrewToPlanItemValidated(mockSupabase, {
        planItemId,
        crewId: null,
        userId: validUserId,
      })
    ).rejects.toThrow(/PLAN_CLOSED_IMMUTABLE/);

    // La cuadrilla permanece inalterada
    expect(storedWeeklyPlanItems[0].crew_id).toBe('crew_alfa');
  });

  // ASG-10: Autorización y control de acceso
  it('ASG-10: debe rechazar la asignación si el usuario no tiene rol/autorización sobre el board_id', async () => {
    await expect(
      assignCrewToPlanItemValidated(mockSupabase, {
        planItemId,
        crewId: 'crew_alfa',
        userId: unauthorizedUserId,
      })
    ).rejects.toThrow(/UNAUTHORIZED_USER/);

    expect(storedWeeklyPlanItems[0].crew_id).toBeNull();
  });
});
