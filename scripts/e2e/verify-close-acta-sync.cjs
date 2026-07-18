// Prueba que close_weekly_plan() y generate_acta_draft() están sincronizados
// por weekly_plans.status = 'closed' — no por casualidad ni por un UPDATE
// manual en SQL. Complementa supabase/tests/22_weekly_plan_confirmation_summary.sql
// (que prueba el resumen, no el cierre real) y el driver de navegador de
// PlanLifecyclePanel.
//
// Diseño deliberado: generate_acta_draft() es IDEMPOTENTE por board mientras
// haya un borrador 'draft' abierto (índice único idx_actas_one_open_draft_per_board,
// ver 20260728_generate_acta_draft.sql) — llamarla ANTES de cerrar el plan
// para comprobar el "antes" dejaría un borrador vacío abierto que NUNCA
// incorporaría las líneas de después (no hay RPC de "refrescar borrador").
// Por eso el "antes" se verifica con una lectura directa usando EXACTAMENTE
// el mismo criterio que generate_acta_draft (wp.status='closed' AND
// e.status='verified'), y generate_acta_draft() se llama una sola vez,
// después de cerrar — igual que lo haría un usuario real desde Costos.
//
// Board propio con dos sitios (Plan A / Plan B) para el caso de aislamiento:
// Plan A se confirma y se cierra; Plan B se deja en 'in_progress'. Solo la
// actividad de Plan A debe aparecer en el borrador del Acta.
//
// Requiere: usuario E2E creado (.claude/skills/verify-nav/scripts/e2e-user.cjs)
// con membresía admin (ese script ya la concede sobre TODOS los boards, y
// aquí además se agrega explícitamente sobre el board nuevo por claridad).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');
const req = createRequire(path.join(process.cwd(), 'package.json'));
const { createClient } = req('@supabase/supabase-js');

const envText = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ACT_A = 'ACTA_SYNC_A';
const ACT_B = 'ACTA_SYNC_B';

function assert(cond, msg) {
  if (!cond) { console.error('FALLO: ' + msg); process.exitCode = 1; throw new Error(msg); }
  console.log('OK — ' + msg);
}

function isoDate(d) { return d.toISOString().split('T')[0]; }

async function cleanup(boardId) {
  if (!boardId) return;
  // acta_item_sources/acta_items caen por cascade al borrar actas.
  await admin.from('actas').delete().eq('board_id', boardId);
  await admin.from('weekly_plans').delete().eq('board_id', boardId);
  await admin.from('poa').delete().eq('board_id', boardId);
  await admin.from('board_activity_standards').delete().eq('board_id', boardId);
  await admin.from('boards').delete().eq('id', boardId); // cascada: groups, board_members
}

(async () => {
  const { email, password } = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'mantenix-e2e-creds.json'), 'utf8'));
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({ email, password });
  if (signInErr || !signIn?.user) { console.error('Usuario E2E no existe. Ejecuta primero e2e-user.cjs:', signInErr?.message); process.exit(1); }
  const userId = signIn.user.id;
  // Cliente autenticado como el usuario E2E — las RPC de negocio dependen de
  // auth.uid(), que con la service role queda NULL. Deben llamarse con este
  // cliente, no con `admin`.
  const user = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${signIn.session.access_token}` } },
  });

  let boardId;
  try {
    // ── Seed: 1 board, 2 sitios, 1 POA con 2 actividades, 1 plan por sitio ──
    const { data: board, error: bErr } = await admin.from('boards')
      .insert({ name: 'E2E Acta Sync', owner_id: userId })
      .select('id').single();
    if (bErr) throw new Error('board: ' + bErr.message);
    boardId = board.id;

    await admin.from('board_members').insert({ board_id: boardId, user_id: userId, role: 'admin' });

    const { data: groups, error: gErr } = await admin.from('groups')
      .insert([
        { board_id: boardId, title: 'Sitio A', color: '#10B981', position: 0 },
        { board_id: boardId, title: 'Sitio B', color: '#3B82F6', position: 1 },
      ]).select('id, title');
    if (gErr) throw new Error('groups: ' + gErr.message);
    const groupA = groups.find(g => g.title === 'Sitio A');
    const groupB = groups.find(g => g.title === 'Sitio B');

    await admin.from('board_activity_standards').insert([
      { board_id: boardId, activity_key: ACT_A, name: 'Corte de césped (E2E sync)', category: 'ZONA VERDE', unit: 'm2', rendimiento: 10, frecuencia: 4, priority: 'preferred', source: 'e2e-seed' },
      { board_id: boardId, activity_key: ACT_B, name: 'Poda de setos (E2E sync)', category: 'ZONA VERDE', unit: 'm2', rendimiento: 10, frecuencia: 4, priority: 'preferred', source: 'e2e-seed' },
    ]);

    const { data: poa, error: poaErr } = await admin.from('poa')
      .insert({ board_id: boardId, name: 'POA E2E Acta Sync' }).select('id').single();
    if (poaErr) throw new Error('poa: ' + poaErr.message);

    const { data: poaVersion, error: pvErr } = await admin.from('poa_versions')
      .insert({ poa_id: poa.id, version_number: 1, status: 'active', created_by: userId })
      .select('id').single();
    if (pvErr) throw new Error('poa_versions: ' + pvErr.message);

    const { data: poaActivities, error: paErr } = await admin.from('poa_activities')
      .insert([
        { poa_version_id: poaVersion.id, activity_key: ACT_A, frecuencia: 4, precio_unitario: 50000 },
        { poa_version_id: poaVersion.id, activity_key: ACT_B, frecuencia: 4, precio_unitario: 70000 },
      ]).select('id, activity_key');
    if (paErr) throw new Error('poa_activities: ' + paErr.message);
    const paA = poaActivities.find(p => p.activity_key === ACT_A);
    const paB = poaActivities.find(p => p.activity_key === ACT_B);

    const { data: poaZones, error: pzErr } = await admin.from('poa_activity_zones')
      .insert([
        { poa_activity_id: paA.id, zone_id: groupA.id, cantidad_contratada: 1000 },
        { poa_activity_id: paB.id, zone_id: groupB.id, cantidad_contratada: 1000 },
      ]).select('id, poa_activity_id');
    if (pzErr) throw new Error('poa_activity_zones: ' + pzErr.message);
    const pazA = poaZones.find(z => z.poa_activity_id === paA.id);
    const pazB = poaZones.find(z => z.poa_activity_id === paB.id);

    const weekA = isoDate(new Date(Date.now() - 21 * 86400000)); // semana pasada, sin colisión con seed-plan.cjs (semana actual)
    const weekB = isoDate(new Date(Date.now() - 14 * 86400000));

    const { data: planA, error: paAErr } = await admin.from('weekly_plans')
      .insert({ board_id: boardId, group_id: groupA.id, week_start: weekA, period_number: 1, status: 'in_progress', created_by: userId })
      .select('id').single();
    if (paAErr) throw new Error('planA: ' + paAErr.message);

    const { data: planB, error: pBErr } = await admin.from('weekly_plans')
      .insert({ board_id: boardId, group_id: groupB.id, week_start: weekB, period_number: 2, status: 'in_progress', created_by: userId })
      .select('id').single();
    if (pBErr) throw new Error('planB: ' + pBErr.message);

    const { data: itemA, error: iAErr } = await admin.from('weekly_plan_items')
      .insert({ plan_id: planA.id, planned_sequence: 1, activity_key: ACT_A, poa_activity_zone_id: pazA.id, planned_rendimiento: 10, planned_frecuencia: 4, priority: 'preferred', planned_qty: 100, unit: 'm2', planned_jr: 2.5 })
      .select('id').single();
    if (iAErr) throw new Error('itemA: ' + iAErr.message);

    const { data: itemB, error: iBErr } = await admin.from('weekly_plan_items')
      .insert({ plan_id: planB.id, planned_sequence: 1, activity_key: ACT_B, poa_activity_zone_id: pazB.id, planned_rendimiento: 10, planned_frecuencia: 4, priority: 'preferred', planned_qty: 100, unit: 'm2', planned_jr: 2.5 })
      .select('id').single();
    if (iBErr) throw new Error('itemB: ' + iBErr.message);

    // Ejecuciones ya 'verified' — el objetivo de este script es el cierre y
    // la sincronización con el Acta, no el ciclo reportar/verificar (ya
    // cubierto por drive-jornada.cjs y las pruebas de dominio existentes).
    const started = `${weekA}T07:00:00Z`;
    const finished = `${weekA}T15:00:00Z`;
    const { data: execARow, error: eAErr } = await admin.from('weekly_plan_item_executions').insert({
      plan_item_id: itemA.id, execution_date: weekA, worker_count: 2,
      started_at: started, finished_at: finished, executed_qty: 40, status: 'verified',
      verified_by: userId, verified_at: new Date().toISOString(), created_by: userId,
    }).select('id').single();
    if (eAErr) throw new Error('execA: ' + eAErr.message);

    // Gate 2 de confirm_weekly_plan (MEVID) exige al menos una evidencia por
    // ejecución verified — ver 20260717_confirm_plan_evidence_gate.sql.
    const { error: attErr } = await admin.from('execution_attachments').insert({
      execution_id: execARow.id, file_name: 'evidencia.jpg', file_url: 'https://example.test/evidencia.jpg',
      file_type: 'image/jpeg', uploaded_by: userId,
    });
    if (attErr) throw new Error('execution_attachments: ' + attErr.message);

    const { error: eBErr } = await admin.from('weekly_plan_item_executions').insert({
      plan_item_id: itemB.id, execution_date: weekB, worker_count: 2,
      started_at: `${weekB}T07:00:00Z`, finished_at: `${weekB}T15:00:00Z`, executed_qty: 25, status: 'verified',
      verified_by: userId, verified_at: new Date().toISOString(), created_by: userId,
    });
    if (eBErr) throw new Error('execB: ' + eBErr.message);

    // ── "Antes": mismo criterio EXACTO que generate_acta_draft (wp.status=
    //    'closed' AND e.status='verified'), verificado por lectura directa
    //    en vez de invocar la RPC — generate_acta_draft() es idempotente
    //    (un solo borrador 'draft' abierto por board); llamarla ahora
    //    dejaría un borrador vacío que NUNCA se actualizaría después del
    //    cierre, porque no existe una RPC de "refrescar borrador". ──
    const { data: execA, error: execAErr } = await admin
      .from('weekly_plan_item_executions').select('status').eq('plan_item_id', itemA.id).single();
    if (execAErr) throw new Error('execA lookup: ' + execAErr.message);
    const { data: planABefore } = await admin.from('weekly_plans').select('status').eq('id', planA.id).single();
    assert(
      execA.status === 'verified' && planABefore.status !== 'closed',
      '"Antes" de cerrar Plan A: su ejecución es verified pero el plan NO está closed — no cumple el criterio de generate_acta_draft todavía',
    );

    // ── Confirmar y cerrar Plan A vía las MISMAS RPC que usa la UI ──
    const { error: confirmErr } = await user.rpc('confirm_weekly_plan', { p_plan_id: planA.id });
    if (confirmErr) throw new Error('confirm_weekly_plan: ' + confirmErr.message);
    const { data: planAAfterConfirm } = await admin.from('weekly_plans').select('status').eq('id', planA.id).single();
    assert(planAAfterConfirm.status === 'confirmed', 'confirm_weekly_plan() transicionó Plan A a "confirmed"');

    const { error: closeErr } = await user.rpc('close_weekly_plan', { p_plan_id: planA.id });
    if (closeErr) throw new Error('close_weekly_plan: ' + closeErr.message);
    const { data: planAAfterClose } = await admin.from('weekly_plans').select('status').eq('id', planA.id).single();
    assert(planAAfterClose.status === 'closed', 'close_weekly_plan() transicionó Plan A a "closed"');

    // Plan B se deja deliberadamente sin confirmar/cerrar.
    const { data: planBStatus } = await admin.from('weekly_plans').select('status').eq('id', planB.id).single();
    assert(planBStatus.status === 'in_progress', 'Plan B permanece "in_progress" (nunca se cerró) — caso de aislamiento');

    // ── "Después": generate_acta_draft() se llama UNA sola vez, como lo
    //    haría un usuario real desde Costos tras el cierre. ──
    const { data: existingDraft } = await admin.from('actas').select('id').eq('board_id', boardId).eq('estado', 'draft').maybeSingle();
    assert(!existingDraft, 'No hay un borrador previo abierto para este board (evita falsos positivos por idempotencia)');

    const { data: actaId, error: actaErr } = await user.rpc('generate_acta_draft', { p_board_id: boardId });
    if (actaErr) throw new Error('generate_acta_draft: ' + actaErr.message);

    const { data: actaItems, error: itemsErr } = await admin.from('acta_items')
      .select('descripcion_snapshot, cantidad_facturada, poa_activity_id')
      .eq('acta_id', actaId);
    if (itemsErr) throw new Error('acta_items: ' + itemsErr.message);

    const lineA = actaItems.find(i => i.poa_activity_id === paA.id);
    const lineB = actaItems.find(i => i.poa_activity_id === paB.id);

    assert(!!lineA, 'El borrador del Acta SÍ incluye la línea de Plan A (cerrado) — descripción: "' + lineA?.descripcion_snapshot + '"');
    assert(lineA.cantidad_facturada === 40, 'La cantidad facturada de Plan A coincide con executed_qty (40)');
    assert(!lineB, 'El borrador del Acta NO incluye la línea de Plan B (nunca cerrado) — aislamiento correcto');

    console.log('\nVERIFICACION COMPLETA: close_weekly_plan() y generate_acta_draft() están sincronizados por weekly_plans.status=\'closed\', sin SQL manual.');
  } finally {
    await cleanup(boardId);
    console.log('Limpieza: board de prueba, plan(es), POA, estándares y acta(s) eliminados.');
  }
})().catch((e) => { console.error(e); process.exit(1); });
