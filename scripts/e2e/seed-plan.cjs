// Siembra (o limpia con --cleanup) un weekly_plan PUBLICADO de la semana
// actual con 2 items reales, para la verificación E2E del flujo del líder.
// Usa el usuario E2E como created_by (crear el usuario antes).
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

const seedPath = path.join(os.tmpdir(), 'mantenix-e2e-seed.json');

function mondayISO() {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
  return m.toISOString().split('T')[0];
}

(async () => {
  if (process.argv.includes('--cleanup')) {
    if (fs.existsSync(seedPath)) {
      const { planId } = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
      // Orden: plan primero (items ON DELETE CASCADE), estándares después
      // (los items los referencian con ON DELETE RESTRICT).
      const { error } = await admin.from('weekly_plans').delete().eq('id', planId);
      const { error: e2 } = await admin.from('board_activity_standards').delete().eq('source', 'e2e-seed');
      console.log(error || e2
        ? 'cleanup error: ' + (error?.message ?? e2?.message)
        : 'Plan de prueba y estándares e2e-seed eliminados');
      fs.unlinkSync(seedPath);
    } else console.log('Sin seed que limpiar');
    return;
  }

  const { email } = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'mantenix-e2e-creds.json'), 'utf8'));
  const { data: usersList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const e2eUser = usersList.users.find((u) => u.email === email);
  if (!e2eUser) { console.error('Usuario E2E no existe'); process.exit(1); }

  const { data: groups, error: gErr } = await admin.from('groups').select('id, title, board_id').limit(1);
  if (gErr || !groups?.length) { console.error('sin groups:', gErr?.message); process.exit(1); }
  const group = groups[0];

  // board_activity_standards está vacía en dev (las 220 actividades del Excel
  // aún no se cargan): sembrar 2 estándares de prueba marcados source='e2e-seed'.
  const { data: standards, error: sErr } = await admin
    .from('board_activity_standards')
    .insert([
      {
        board_id: group.board_id, group_id: null,
        activity_key: 'E2E_PODA_ARBOLES', name: 'PODA DE ARBOLES (PRUEBA E2E)',
        category: 'ZONA VERDE', unit: 'm2', rendimiento: 500, frecuencia: 1,
        priority: 'must_execute', source: 'e2e-seed',
      },
      {
        board_id: group.board_id, group_id: null,
        activity_key: 'E2E_DESMALEZADO', name: 'DESMALEZADO (PRUEBA E2E)',
        category: 'ZONA VERDE', unit: 'm2', rendimiento: 800, frecuencia: 2,
        priority: 'preferred', source: 'e2e-seed',
      },
    ])
    .select('id, activity_key, name, unit, rendimiento, frecuencia, priority');
  if (sErr || (standards?.length ?? 0) < 1) { console.error('seed estándares:', sErr?.message); process.exit(1); }

  const week = mondayISO();
  // Directo a 'published' vía service role: es un seed de prueba, no el flujo
  // del asistente (que pasa por publish_weekly_plan).
  const { data: plan, error: pErr } = await admin
    .from('weekly_plans')
    .insert({
      board_id: group.board_id,
      group_id: group.id,
      week_start: week,
      period_number: 1,
      status: 'published',
      published_at: new Date().toISOString(),
      created_by: e2eUser.id,
    })
    .select()
    .single();
  if (pErr) { console.error('plan:', pErr.message); process.exit(1); }

  const items = standards.map((s, i) => ({
    plan_id: plan.id,
    planned_sequence: i + 1,
    activity_key: s.activity_key,
    activity_standard_id: s.id,
    planned_rendimiento: s.rendimiento,
    planned_frecuencia: s.frecuencia,
    priority: s.priority,
    planned_qty: 100,
    unit: s.unit,
    planned_jr: Math.round((100 / s.rendimiento) * 100) / 100,
  }));
  const { error: iErr } = await admin.from('weekly_plan_items').insert(items);
  if (iErr) { console.error('items:', iErr.message); await admin.from('weekly_plans').delete().eq('id', plan.id); process.exit(1); }

  fs.writeFileSync(seedPath, JSON.stringify({
    planId: plan.id,
    groupTitle: group.title,
    activityNames: standards.map((s) => s.name),
  }));
  console.log(`OK — plan publicado sembrado para ${week} en "${group.title}" con ${items.length} items: ${standards.map((s) => s.name).join(' | ')}`);
})();
