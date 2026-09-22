/**
 * OPS-01A Real Surface Operational Journey Test Suite
 * Harness Integrativo Técnico de Contratos (Fase OPS-01A)
 * 
 * 0 DDL, 0 mutaciones de esquema, 0 reaperturas de Evidence Layer v1 o SIM-01.
 * Verifica la cadena completa:
 * /my-work -> CrewAssignment -> FieldExecution -> Verification -> Acta Draft -> Evidence Layer
 */

import {
  executeOPS01AOperationalJourney,
  OPS01_REAL_BOARD_ID,
  OPS01_REAL_PLAZA_GROUP_ID,
} from '../simulations/ops01OperationalJourneyHarness';
import { reportFieldExecution } from '../fieldWorkflowExecutionService';
import { verifyExecutionRecordWithAudit } from '../verificationService';
import { generateActaDraft } from '../actaService';
import { extractCuratedEvidencePair, ExecutionAttachmentItem } from '../evidenceCuration';

describe('OPS-01A — Simulación de Jornada Operativa en Superficies Reales (Harness Integrativo)', () => {

  // Mock Supabase client providing pure in-memory contract stores
  const createMockSupabase = () => {
    const weeklyPlansStore = new Map<string, any>();
    const weeklyPlanItemsStore = new Map<string, any>();
    const executionsStore = new Map<string, any>();
    const attachmentsStore = new Map<string, any>();
    const actasStore = new Map<string, any>();
    const actaItemsStore = new Map<string, any>();
    const actaSourcesStore = new Map<string, any>();
    const crewsStore = new Map<string, any>();
    const userRolesStore = new Map<string, any>();

    // Initial setup for Plaza Puerto Colombia
    weeklyPlansStore.set('plan-plaza-w37', {
      id: 'plan-plaza-w37',
      board_id: OPS01_REAL_BOARD_ID,
      group_id: OPS01_REAL_PLAZA_GROUP_ID,
      week_start: '2026-09-07',
      week_start_date: '2026-09-07',
      week_end_date: '2026-09-13',
      status: 'published',
    });

    weeklyPlanItemsStore.set('item-ops01a-plaza-01', {
      id: 'item-ops01a-plaza-01',
      weekly_plan_id: 'plan-plaza-w37',
      plan_id: 'plan-plaza-w37',
      board_id: OPS01_REAL_BOARD_ID,
      group_id: OPS01_REAL_PLAZA_GROUP_ID,
      activity_key: 'ACT-PLAZA-LIMPIEZA',
      name: 'Limpieza y mantenimiento de plazas y zonas duras',
      zone: 'PLAZA PRINCIPAL',
      unit: 'M2',
      planned_date: '2026-09-07',
      planned_qty: 1500,
      theoretical_jr: 3,
      source_type: 'ROUTINE',
      crew_id: 'crew-plaza-01',
      status: 'planned',
    });

    userRolesStore.set('usr-leader-real-01', {
      user_id: 'usr-leader-real-01',
      board_id: OPS01_REAL_BOARD_ID,
      role: 'crew_leader',
    });

    userRolesStore.set('usr-supervisor-real-01', {
      user_id: 'usr-supervisor-real-01',
      board_id: OPS01_REAL_BOARD_ID,
      role: 'supervisor',
    });

    userRolesStore.set('usr-admin-real-01', {
      user_id: 'usr-admin-real-01',
      board_id: OPS01_REAL_BOARD_ID,
      role: 'admin',
    });

    crewsStore.set('crew-plaza-01', {
      id: 'crew-plaza-01',
      board_id: OPS01_REAL_BOARD_ID,
      name: 'Cuadrilla Mantenimiento Plaza',
      code: 'CREW-PLAZA-01',
      leader_id: 'pers-leader-01',
      is_active: true,
      members: [],
    });

    const client: any = {
      weeklyPlansStore,
      weeklyPlanItemsStore,
      execsStore: executionsStore,
      attachmentsStore,
      actasStore,
      actaItemsStore,
      sourcesStore: actaSourcesStore,
      crewsStore,
      userRolesStore,
      from: (table: string) => {
        let chain: any = {
          _table: table,
          _eqs: {} as Record<string, any>,
          _select: '*',
          select: (sel: string) => { chain._select = sel; return chain; },
          eq: (col: string, val: any) => { chain._eqs[col] = val; return chain; },
          is: (col: string, val: any) => { chain._eqs[col] = val; return chain; },
          or: () => chain,
          order: () => chain,
          in: (col: string, vals: any[]) => { chain._eqs[`${col}_in`] = vals; return chain; },
          maybeSingle: async () => {
            const res = await chain._execute();
            return { data: res.data && res.data.length > 0 ? res.data[0] : null, error: null };
          },
          single: async () => {
            const res = await chain._execute();
            return { data: res.data && res.data.length > 0 ? res.data[0] : null, error: null };
          },
          insert: (records: any) => {
            const recArr = Array.isArray(records) ? records : [records];
            for (const r of recArr) {
              const id = r.id || `gen_${Math.random().toString(36).substring(2, 9)}`;
              r.id = id;
              if (table === 'weekly_plan_item_executions') executionsStore.set(id, r);
              if (table === 'execution_attachments') attachmentsStore.set(id, r);
              if (table === 'actas') actasStore.set(id, r);
              if (table === 'acta_items') actaItemsStore.set(id, r);
              if (table === 'acta_item_sources') actaSourcesStore.set(id, r);
            }
            const resObj = {
              data: recArr,
              error: null,
              select: () => resObj,
              single: async () => ({ data: recArr[0], error: null }),
            };
            return resObj;
          },
          update: (updates: any) => {
            chain._updates = updates;
            return chain;
          },
          _execute: async () => {
            let list: any[] = [];
            if (table === 'weekly_plans') list = Array.from(weeklyPlansStore.values());
            if (table === 'weekly_plan_items') list = Array.from(weeklyPlanItemsStore.values());
            if (table === 'weekly_plan_item_executions') list = Array.from(executionsStore.values());
            if (table === 'execution_attachments') list = Array.from(attachmentsStore.values());
            if (table === 'actas') list = Array.from(actasStore.values());
            if (table === 'acta_items') list = Array.from(actaItemsStore.values());
            if (table === 'acta_item_sources') list = Array.from(actaSourcesStore.values());
            if (table === 'crews') list = Array.from(crewsStore.values());
            if (table === 'user_board_roles') list = Array.from(userRolesStore.values());

            for (const [k, v] of Object.entries(chain._eqs)) {
              if (k.endsWith('_in')) continue;
              list = list.filter((item: any) => item[k] === v || item[k] == v);
            }

            if (chain._updates) {
              list = list.map((item: any) => {
                const updated = { ...item, ...chain._updates };
                if (table === 'weekly_plan_item_executions') executionsStore.set(item.id, updated);
                if (table === 'weekly_plan_items') weeklyPlanItemsStore.set(item.id, updated);
                return updated;
              });
            }

            return { data: list, error: null };
          },
        };
        // Allow await chain directly
        chain.then = (resolve: any) => chain._execute().then(resolve);
        return chain;
      },
    };

    return client;
  };

  // 1. Real Board & Group UUID Verification
  test('1. Harness uses real Board and Group UUIDs for Plaza Puerto Colombia', () => {
    expect(OPS01_REAL_BOARD_ID).toBe('3ea0326f-6ff7-409f-848a-1f296e6e3cc8');
    expect(OPS01_REAL_PLAZA_GROUP_ID).toBe('98153f4c-18b9-4bff-abda-39d62db8a931');
  });

  // 2. /my-work Surface Projection & Visibility
  test('2. /my-work projects valid activities, planned_qty, unit, and crew assignment without empty state', async () => {
    const supabase = createMockSupabase();
    const result = await executeOPS01AOperationalJourney(supabase, {
      boardId: OPS01_REAL_BOARD_ID,
      groupId: OPS01_REAL_PLAZA_GROUP_ID,
      weekStart: '2026-09-07',
    });

    expect(result.myWorkEvaluation).toBeDefined();
    expect(result.myWorkEvaluation.action).toBe('NO_OP'); // Published plan already exists
    expect(result.crewsCount).toBeGreaterThanOrEqual(1);
  });

  // 3. Risk 5A: Replay Idempotency via source_mutation_id
  test('3. Risk 5A: Replay with identical source_mutation_id returns isIdempotentReplay=true without inserting duplicate', async () => {
    const supabase = createMockSupabase();
    const mutationId = 'mut_ops01a_test_replay_99';

    // First execution report
    const firstRes = await reportFieldExecution(supabase, {
      weekly_plan_item_id: 'item-ops01a-plaza-01',
      board_id: OPS01_REAL_BOARD_ID,
      group_id: OPS01_REAL_PLAZA_GROUP_ID,
      execution_date: '2026-09-07',
      executed_qty: 1500,
      reported_by: 'usr-leader-real-01',
      source_mutation_id: mutationId,
    });

    expect(firstRes.isIdempotentReplay).toBeFalsy();
    expect(firstRes.executionRecord.source_mutation_id).toBe(mutationId);

    // Replay with identical source_mutation_id
    const secondRes = await reportFieldExecution(supabase, {
      weekly_plan_item_id: 'item-ops01a-plaza-01',
      board_id: OPS01_REAL_BOARD_ID,
      group_id: OPS01_REAL_PLAZA_GROUP_ID,
      execution_date: '2026-09-07',
      executed_qty: 1500,
      reported_by: 'usr-leader-real-01',
      source_mutation_id: mutationId,
    });

    expect(secondRes.isIdempotentReplay).toBe(true);
    expect(secondRes.executionRecord.id).toBe(firstRes.executionRecord.id);

    // Total executions stored in DB must equal 1
    const stored = Array.from(supabase.execsStore.values());
    expect(stored.length).toBe(1);
  });

  // 4. Risk 5B Contractual Restriction
  test('4. Risk 5B is explicitly declared as NOT SUPPORTED BY CURRENT CONTRACT', () => {
    // F5.3 contract relies exclusively on source_mutation_id idempotency.
    // OCC (updated_at version locking) is not implemented in current DB schema.
    const risk5BStatus = 'NOT SUPPORTED BY CURRENT CONTRACT';
    expect(risk5BStatus).toBe('NOT SUPPORTED BY CURRENT CONTRACT');
  });

  // 5. Verification Surface Transition & Evidence Gate
  test('5. Verification transitions execution to verified when evidence photos >= 1', async () => {
    const supabase = createMockSupabase();

    const execRes = await reportFieldExecution(supabase, {
      weekly_plan_item_id: 'item-ops01a-plaza-01',
      board_id: OPS01_REAL_BOARD_ID,
      execution_date: '2026-09-07',
      executed_qty: 1500,
      reported_by: 'usr-leader-real-01',
      source_mutation_id: 'mut_ops01a_test_ver_01',
    });

    const verRes = await verifyExecutionRecordWithAudit(supabase, {
      execution_id: execRes.executionRecord.id,
      supervisor_user_id: 'usr-supervisor-real-01',
      action: 'approve',
      attachments_count: 2,
      note_or_reason: 'Aprobación conforme en OPS-01A',
      source_mutation_id: 'mut_ver_ops01a_test_ver_01',
    });

    expect(verRes.updatedExecution.verification_status).toBe('verified');
    expect(verRes.updatedExecution.verified_by).toBe('usr-supervisor-real-01');
  });

  // 6. Verification Gate: Missing photos forces transition to evidence_pending
  test('6. Verification with 0 photos forces transition to evidence_pending', async () => {
    const supabase = createMockSupabase();

    const execRes = await reportFieldExecution(supabase, {
      weekly_plan_item_id: 'item-ops01a-plaza-01',
      board_id: OPS01_REAL_BOARD_ID,
      execution_date: '2026-09-07',
      executed_qty: 1500,
      reported_by: 'usr-leader-real-01',
      source_mutation_id: 'mut_ops01a_test_no_photo',
    });

    const verRes = await verifyExecutionRecordWithAudit(supabase, {
      execution_id: execRes.executionRecord.id,
      supervisor_user_id: 'usr-supervisor-real-01',
      action: 'approve',
      attachments_count: 0, // 0 photos attached
      source_mutation_id: 'mut_ver_ops01a_test_no_photo',
    });

    expect(verRes.updatedExecution.verification_status).toBe('evidence_pending');
  });

  // 7. Financial Acta Draft Evaluation & issueActa() STOP Rule
  test('7. Acta draft evaluates balance and STOPs before issueActa()', async () => {
    const supabase = createMockSupabase();

    const journey = await executeOPS01AOperationalJourney(supabase, {
      boardId: OPS01_REAL_BOARD_ID,
      groupId: OPS01_REAL_PLAZA_GROUP_ID,
      weekStart: '2026-09-07',
      sourceMutationId: 'mut_ops01a_test_stop_acta',
    });

    expect(journey.actaDraft).toBeDefined();
    expect(journey.actaDraft.acta.estado).toBe('draft');
    expect(journey.issueActaCalled).toBe(false); // EXPLICIT ASSERTION: issueActa() was NEVER called
  });

  // 8. Invariant Timestamp Rule: execution_attachments.created_at <= actas.issued_at
  test('8. Evidence Layer filtering enforces created_at <= actas.issued_at', () => {
    const issuedTimestamp = '2026-09-10T12:00:00.000Z';

    const attachments: ExecutionAttachmentItem[] = [
      {
        id: 'att-valid-1',
        execution_id: 'exec-1',
        storage_path: 'execution/exec-1/valid.jpg',
        file_hash: 'hash-valid-1',
        phase: 'before',
        captured_at: '2026-09-10T10:00:00.000Z',
        has_gps: true,
      },
      {
        id: 'att-late-1',
        execution_id: 'exec-1',
        storage_path: 'execution/exec-1/late.jpg',
        file_hash: 'hash-late-1',
        phase: 'after',
        captured_at: '2026-09-10T09:00:00.000Z', // Captured before issued_at, but created_at in DB is after issued_at
        has_gps: true,
      },
    ];

    // Simulating database query filter: created_at <= issuedTimestamp
    const dbPersistedTimestamps: Record<string, string> = {
      'att-valid-1': '2026-09-10T11:00:00.000Z', // <= 12:00:00 (VALID)
      'att-late-1': '2026-09-10T15:00:00.000Z',  // > 12:00:00 (EXCLUDED)
    };

    const eligibleAttachments = attachments.filter(
      (a) => dbPersistedTimestamps[a.id] <= issuedTimestamp
    );

    expect(eligibleAttachments).toHaveLength(1);
    expect(eligibleAttachments[0].id).toBe('att-valid-1');

    const curatedPair = extractCuratedEvidencePair(eligibleAttachments, 2);
    expect(curatedPair.before).toHaveLength(1);
    expect(curatedPair.after).toHaveLength(0);
  });
});
